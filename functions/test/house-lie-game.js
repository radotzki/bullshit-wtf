// Local run: a replayed three-phone game where players keep falling for house lies.
// Checks that no score goes below zero from house lies, and that friends' lies still drive the score.
//
// Needs the Realtime Database emulator on 127.0.0.1:9000 (see test/sleeping-phones.js).
// Then: npm run build && node test/house-lie-game.js

const DB_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000';
const NS = 'demo-bullshit';
process.env.FIREBASE_DATABASE_EMULATOR_HOST = DB_HOST;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: NS, databaseURL: `http://${DB_HOST}?ns=${NS}` });
process.env.GCLOUD_PROJECT = NS;

const assert = require('assert');
const { gamesRef, questionsRef } = require('../dist/firebase');
const { tick } = require('../dist/controllers/tick');
const { answer } = require('../dist/controllers/answer');
const { onAnswerSelection } = require('../dist/controllers/on-answer-selection');
const { onPhaseStart } = require('../dist/controllers/phase-timer');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const TOTAL_Q = 5;
const names = { p1: 'Alice', p2: 'Ben', p3: 'Chen' };

function onWrite(ref, handler) {
    let first = true;
    ref.on('value', snap => {
        if (first) { first = false; return; }
        Promise.resolve(handler(snap.val())).catch(e => console.error('trigger failed', e));
    });
}

async function waitForState(pin, id, timeoutMs = 60000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
        const s = (await gamesRef.child(pin).child('state').once('value')).val();
        if (s && s.id === id) return s;
        await sleep(100);
    }
    throw new Error(`timed out waiting for state ${id}`);
}

(async () => {
    const q = {};
    for (let i = 0; i < TOTAL_Q; i++) {
        q[`q${i}`] = { lang: 'en', questionText: `Question ${i} has a ___`, realAnswer: `truth${i}`, fakeAnswers: ['lie a', 'lie b', 'lie c', 'lie d'], citation: '' };
    }
    await questionsRef.set(q);

    const pin = 'HLGA';
    const qids = {};
    for (let i = 0; i < TOTAL_Q; i++) qids[i] = `q${i}`;
    await gamesRef.child(pin).set({
        state: { id: 0, timestamp: Date.now() }, locale: 'en', timestamp: Date.now(),
        roundIndex: 0, questionIndex: 0, totalQ: TOTAL_Q, qids, tick: 0, presenter: false,
        players: {
            p1: { nickname: 'Alice', score: 0, uid: 'u1' },
            p2: { nickname: 'Ben', score: 0, uid: 'u2' },
            p3: { nickname: 'Chen', score: 0, uid: 'u3' },
        },
    });
    const g = gamesRef.child(pin);
    onWrite(g.child('tick'), () => tick(pin));
    onWrite(g.child('answerSelections'), () => onAnswerSelection(pin));
    onWrite(g.child('state'), state => onPhaseStart(pin, state));
    await sleep(300);
    await g.child('tick').set(1);

    let lowest = 0;
    let houseLiePicks = 0;
    for (let qi = 0; qi < TOTAL_Q; qi++) {
        await waitForState(pin, 2);
        await Promise.all(['p1', 'p2', 'p3'].map(pid => answer(pin, pid, `${names[pid]} lie ${qi}`)));
        await waitForState(pin, 3);

        const answers = (await g.child('answers').once('value')).val();
        const house = Object.keys(answers).filter(k => answers[k].houseLie).map(k => answers[k].text);
        const truth = Object.keys(answers).filter(k => answers[k].realAnswer).map(k => answers[k].text)[0];
        assert.ok(house.length >= 1, 'small group gets house lies');
        // Alice and Ben always fall for a house lie (the worst case). Chen falls for Alice's lie,
        // except in the last question, where Chen finds the truth.
        const picks = {
            p1: house[0],
            p2: house[house.length - 1],
            p3: qi === TOTAL_Q - 1 ? truth : `alice lie ${qi}`,
        };
        houseLiePicks += 2;
        for (const pid of Object.keys(picks)) {
            await g.child('answerSelections').child(pid).set({ text: picks[pid] });
        }

        await waitForState(pin, 4);
        const reveal = (await g.child('revealAnswers').once('value')).val();
        const houseRows = reveal.filter(r => r.houseLie && r.selectors && r.selectors.length);
        houseRows.forEach(r => assert.ok(r.pointsBy, 'house-lie row says what each picker lost'));

        await waitForState(pin, 5);
        const players = (await g.child('players').once('value')).val();
        const line = Object.keys(players).map(pid => `${players[pid].nickname} ${players[pid].score}`).join(' / ');
        console.log(`after question ${qi + 1} (round ${(await g.child('roundIndex').once('value')).val() + 1}): ${line}` +
            (houseRows.length ? `   house lies cost: ${houseRows.map(r => JSON.stringify(r.pointsBy)).join(' ')}` : ''));
        Object.keys(players).forEach(pid => lowest = Math.min(lowest, players[pid].score));
    }

    await waitForState(pin, 6);
    const players = (await g.child('players').once('value')).val();
    console.log(`final: ${Object.keys(players).map(pid => `${players[pid].nickname} ${players[pid].score}`).join(' / ')}`);
    console.log(`house-lie picks: ${houseLiePicks}; lowest score at any point: ${lowest}`);
    assert.ok(lowest >= 0, `a score went below zero: ${lowest}`);
    // Alice fooled Chen in 4 questions: friends' lies are what put her ahead.
    assert.ok(players.p1.score > players.p2.score, 'fooling a friend beats the house-lie penalty');
    assert.strictEqual(players.p3.score, 2000, 'finding the truth in the last round still pays 2000');
    console.log('PASS: no score went below zero from house lies');
    process.exit(0);
})().catch(e => { console.error('FAIL', e.message || e); process.exit(1); });
