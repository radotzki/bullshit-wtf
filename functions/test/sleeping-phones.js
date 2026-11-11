// Local run: does a game keep going when every phone is asleep?
//
// Needs the Realtime Database emulator on 127.0.0.1:9000, e.g.
//   firebase emulators:start --only database --project demo-bullshit
// or: java -jar ~/.cache/firebase/emulators/firebase-database-emulator-v4.7.2.jar --port 9000
// Then: npm run build && node test/sleeping-phones.js
//
// It runs the real controllers from dist/ and wires the same database triggers as index.ts
// (tick, answerSelections, state -> phase timer). No client is connected: after START nobody writes anything.

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

const names = ['GameStaging', 'RoundIntro', 'ShowQuestion', 'ShowAnswers', 'RevealTheTruth', 'ScoreBoard', 'ScoreBoardFinal'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const t0 = Date.now();
const at = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's';

// Same as the onWrite triggers in index.ts: fire on every change below the path, not on the initial read.
function onWrite(ref, handler) {
    let first = true;
    ref.on('value', snap => {
        if (first) { first = false; return; }
        Promise.resolve(handler(snap.val())).catch(e => console.error('trigger failed', e));
    });
}

function wireTriggers(pin) {
    const g = gamesRef.child(pin);
    onWrite(g.child('tick'), () => tick(pin));
    onWrite(g.child('answerSelections'), () => onAnswerSelection(pin));
    onWrite(g.child('state'), state => onPhaseStart(pin, state));
}

function newGame(totalQ, players) {
    const qids = {};
    for (let i = 0; i < totalQ; i++) qids[i] = `q${i}`;
    return {
        state: { id: 0, timestamp: Date.now() }, locale: 'en', timestamp: Date.now(),
        roundIndex: 0, questionIndex: 0, totalQ, qids, tick: 0, presenter: false, players,
    };
}

function recordStates(pin, log) {
    gamesRef.child(pin).child('state').on('value', snap => {
        const s = snap.val();
        if (!s) return;
        const last = log[log.length - 1];
        if (last && last.timestamp === s.timestamp) return;
        log.push(Object.assign({ seenAt: Date.now() }, s));
        console.log(`${at()} [${pin}] ${names[s.id]}${s.deadline ? ` (ends in ${((s.deadline - s.timestamp) / 1000)}s)` : ''}`);
    });
}

async function waitFor(log, stateId, timeoutMs) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
        if (log.length && log[log.length - 1].id === stateId) return log[log.length - 1];
        await sleep(100);
    }
    throw new Error(`timed out waiting for ${names[stateId]}; last state ${log.length ? names[log[log.length - 1].id] : 'none'}`);
}

async function seedQuestions() {
    const q = {};
    for (let i = 0; i < 3; i++) {
        q[`q${i}`] = { lang: 'en', questionText: `Question ${i} has a ___`, realAnswer: `truth${i}`, fakeAnswers: ['lie a', 'lie b', 'lie c'], citation: '' };
    }
    await questionsRef.set(q);
}

// 1. Two players press START, then both phones go to sleep. Nobody writes anything after that.
async function allPhonesAsleep() {
    const pin = 'ZZZA';
    const log = [];
    await gamesRef.child(pin).set(newGame(3, {
        p1: { nickname: 'ana', score: 0, uid: 'u1' },
        p2: { nickname: 'ben', score: 0, uid: 'u2' },
    }));
    wireTriggers(pin);
    recordStates(pin, log);
    await sleep(300);
    console.log(`${at()} [${pin}] START pressed (old-style tick, as the live phones write it). All phones now asleep.`);
    await gamesRef.child(pin).child('tick').set(1);

    await waitFor(log, 6, 4 * 60 * 1000);

    // Each timed phase must have ended on time, within 1.5s of its deadline.
    for (let i = 1; i < log.length; i++) {
        const prev = log[i - 1];
        if (!prev.deadline) continue;
        const late = log[i].timestamp - prev.deadline;
        assert.ok(late >= 0 && late < 1500, `${names[prev.id]} ended ${late}ms after its deadline`);
    }
    const sequence = log.map(s => names[s.id]).join(' > ');
    assert.strictEqual(sequence, [
        'GameStaging', 'RoundIntro',
        'ShowQuestion', 'ShowAnswers', 'RevealTheTruth', 'ScoreBoard', 'RoundIntro',
        'ShowQuestion', 'ShowAnswers', 'RevealTheTruth', 'ScoreBoard', 'RoundIntro',
        'ShowQuestion', 'ShowAnswers', 'RevealTheTruth', 'ScoreBoard', 'ScoreBoardFinal',
    ].join(' > '));
    const game = (await gamesRef.child(pin).once('value')).val();
    assert.strictEqual(game.questionIndex, 2);
    console.log(`${at()} [${pin}] PASS: finished all 3 questions with no phone awake; every phase ended within 1.5s of its deadline.`);
}

// 2. One player: answering and picking still end a phase early, and a stale tick cannot skip a phase.
async function earlyEndAndStaleTick() {
    const pin = 'ZZZB';
    const log = [];
    await gamesRef.child(pin).set(newGame(1, { p1: { nickname: 'cat', score: 0, uid: 'u3' } }));
    wireTriggers(pin);
    recordStates(pin, log);
    await sleep(300);
    await gamesRef.child(pin).child('tick').set(1);

    const question = await waitFor(log, 2, 10000);
    console.log(`${at()} [${pin}] a stale "score board over" tick arrives during the question`);
    await gamesRef.child(pin).child('tick').set(999);
    await sleep(1500);
    assert.strictEqual(log[log.length - 1].id, 2, 'stale tick must not move the game');

    console.log(`${at()} [${pin}] the only player answers`);
    await answer(pin, 'p1', 'my lie');
    const answers = await waitFor(log, 3, 3000);
    assert.ok(answers.timestamp - question.timestamp < 25000 - 20000, 'question ended early');

    console.log(`${at()} [${pin}] the only player picks an answer`);
    // The question is picked again for the room at START, so read the truth off the table.
    const truth = (await gamesRef.child(pin).child('answers').child('truth').once('value')).val().text;
    await gamesRef.child(pin).child('answerSelections').child('p1').set({ text: truth });
    const reveal = await waitFor(log, 4, 3000);
    assert.ok(reveal.timestamp - answers.timestamp < 3000, 'answers ended early');

    await waitFor(log, 6, 30000);
    const game = (await gamesRef.child(pin).once('value')).val();
    assert.strictEqual(game.players.p1.score, 1000, 'found the truth in round 1');
    console.log(`${at()} [${pin}] PASS: early end still works, stale tick ignored, score 1000.`);
}

(async () => {
    await seedQuestions();
    await Promise.all([allPhonesAsleep(), earlyEndAndStaleTick()]);
    console.log(`${at()} ALL PASS`);
    process.exit(0);
})().catch(e => { console.error(`${at()} FAIL`, e); process.exit(1); });
