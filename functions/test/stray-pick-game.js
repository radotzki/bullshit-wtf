// Local run: a whole three-phone game, on the real phase timers, with things in the picks node that
// are not a player's pick. The game must reach the final scoreboard on time, with the scores it
// would have had without them.
//
// Phones write their picks the way the game's client does: straight to the database, not signed in,
// so the database rules judge them. Each stray write is first tried the same way; where the rules
// refuse it, it is then written past the rules, so the server meets it whatever the rules are.
//
// Needs the Realtime Database emulator on 127.0.0.1:9000 (see test/sleeping-phones.js).
// Then: npm run build && node test/stray-pick-game.js [rules file]

const assert = require('assert');
const { rest, owner, phone, loadRules } = require('./emulator');
const { gamesRef, questionsRef } = require('../dist/firebase');
const { tick } = require('../dist/controllers/tick');
const { answer } = require('../dist/controllers/answer');
const { onAnswerSelection } = require('../dist/controllers/on-answer-selection');
const { onRevealDone } = require('../dist/controllers/on-reveal-done');
const { onPhaseStart } = require('../dist/controllers/phase-timer');

const names = ['GameStaging', 'RoundIntro', 'ShowQuestion', 'ShowAnswers', 'RevealTheTruth', 'ScoreBoard', 'ScoreBoardFinal'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const t0 = Date.now();
const at = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's';
const PIN = 'STRY';
const TOTAL_Q = 3;
const g = gamesRef.child(PIN);
const picks = `games/${PIN}/answerSelections`;

// Same as the onWrite triggers in index.ts: fire on every change below the path, not on the initial read.
function onWrite(ref, handler) {
    let first = true;
    ref.on('value', snap => {
        if (first) { first = false; return; }
        Promise.resolve(handler(snap.val())).catch(e => console.error(`${at()} trigger failed:`, e && e.message));
    });
}

const log = [];
function recordStates() {
    g.child('state').on('value', snap => {
        const s = snap.val();
        if (!s) return;
        const last = log[log.length - 1];
        if (last && last.timestamp === s.timestamp) return;
        log.push(s);
        console.log(`${at()} ${names[s.id]}${s.deadline ? ` (ends in ${((s.deadline - s.timestamp) / 1000)}s)` : ''}`);
    });
}

async function waitFor(stateId, timeoutMs) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
        if (log.length && log[log.length - 1].id === stateId) return log[log.length - 1];
        await sleep(50);
    }
    throw new Error(`timed out waiting for ${names[stateId]}; the game is on ${log.length ? names[log[log.length - 1].id] : 'nothing'}`);
}

async function pick(pid, text) {
    const r = await rest('PUT', `${picks}/${pid}`, { text }, phone);
    assert.ok(r.ok, `a player's own pick must be accepted (got ${r.status})`);
}

const strays = { accepted: 0, refused: 0 };
async function stray(what, pid, value) {
    const r = await rest('PUT', `${picks}/${pid}`, value, phone);
    strays[r.ok ? 'accepted' : 'refused']++;
    if (!r.ok) {
        await rest('PUT', `${picks}/${pid}`, value, owner);
    }
    console.log(`${at()}   stray: ${what} (${r.ok ? 'the rules let it in' : 'the rules refused it; written past them'})`);
}

(async () => {
    const file = await loadRules(process.argv[2]);
    console.log(`rules: ${file}`);

    const q = {};
    const qids = {};
    for (let i = 0; i < TOTAL_Q; i++) {
        q[`q${i}`] = { lang: 'en', questionText: `Question ${i} has a ___`, realAnswer: `truth${i}`, fakeAnswers: ['house a', 'house b', 'house c'], citation: '' };
        qids[i] = `q${i}`;
    }
    await questionsRef.set(q);
    await g.set({
        state: { id: 0, timestamp: Date.now() }, locale: 'en', timestamp: Date.now(),
        roundIndex: 0, questionIndex: 0, totalQ: TOTAL_Q, qids, tick: 0, presenter: false,
        players: {
            p1: { nickname: 'Alice', score: 0, uid: 'u1' },
            p2: { nickname: 'Ben', score: 0, uid: 'u2' },
            p3: { nickname: 'Chen', score: 0, uid: 'u3' },
        },
    });
    onWrite(g.child('tick'), () => tick(PIN));
    onWrite(g.child('answerSelections'), () => onAnswerSelection(PIN));
    onWrite(g.child('revealDone'), () => onRevealDone(PIN));
    onWrite(g.child('state'), state => onPhaseStart(PIN, state));
    recordStates();
    await sleep(300);
    await g.child('tick').set(1);

    for (let qi = 0; qi < TOTAL_Q; qi++) {
        await waitFor(2, 15000);
        for (const pid of ['p1', 'p2', 'p3']) {
            await answer(PIN, pid, `${pid} lie ${qi}`);
        }
        const answersAt = await waitFor(3, 5000);
        // The questions are picked again for the room when the game starts, so read the truth off the table.
        const table = (await g.child('answers').once('value')).val();
        const truth = table.truth.text;

        // Alice finds the truth, Ben falls for Alice's lie, Chen falls for Ben's lie. Around them:
        await stray('a pick of Chen\'s lie under an id that is no player\'s', 'nobody', { text: `p3 lie ${qi}` });
        await pick('p1', truth);
        await stray('the same under "constructor"', 'constructor', { text: `p3 lie ${qi}` });
        await stray('a pick that is only a string, under no player\'s id', 'nobody2', truth);
        await pick('p2', `p1 lie ${qi}`);
        await stray('a pick with its own points, under no player\'s id', 'nobody3', { text: truth, score: 99999 });
        await sleep(500);
        assert.strictEqual(log[log.length - 1].id, 3, 'two of three players have picked: picking stays open');
        await pick('p3', `p2 lie ${qi}`);

        const reveal = await waitFor(4, 3000);
        assert.ok(reveal.timestamp - answersAt.timestamp < 5000, 'every player picked: picking ended early');
        await stray('after the points are counted: Chen\'s pick rewritten with points', 'p3', { text: truth, score: 99999 });
        await stray('after the points are counted: another pick that is no player\'s', 'nobody4', { text: truth, score: 99999 });
        await waitFor(5, 15000);
    }

    await waitFor(6, 15000);

    // Every timed phase ended by its deadline, give or take 1.5 s: nothing hung.
    for (let i = 1; i < log.length; i++) {
        const prev = log[i - 1];
        if (!prev.deadline) continue;
        const late = log[i].timestamp - prev.deadline;
        assert.ok(late < 1500, `${names[prev.id]} ended ${late}ms after its deadline`);
    }
    assert.strictEqual(log.map(s => names[s.id]).join(' > '), [
        'GameStaging', 'RoundIntro',
        'ShowQuestion', 'ShowAnswers', 'RevealTheTruth', 'ScoreBoard', 'RoundIntro',
        'ShowQuestion', 'ShowAnswers', 'RevealTheTruth', 'ScoreBoard', 'RoundIntro',
        'ShowQuestion', 'ShowAnswers', 'RevealTheTruth', 'ScoreBoard', 'ScoreBoardFinal',
    ].join(' > '));

    const game = (await g.once('value')).val();
    const scores = {};
    Object.keys(game.players).forEach(pid => scores[game.players[pid].nickname] = game.players[pid].score);
    console.log(`${at()} final scores: ${JSON.stringify(scores)}`);
    // Alice: the truth (1000, 1500, 2000) and Ben fooled (500, 750, 1000). Ben: Chen fooled each time.
    assert.deepStrictEqual(scores, { Alice: 6750, Ben: 2250, Chen: 0 });
    assert.deepStrictEqual(Object.keys(game.players).sort(), ['p1', 'p2', 'p3'], 'nobody became a player');
    console.log(`${at()} PASS: final scoreboard reached with the right scores; stray writes: ${strays.accepted} let in by the rules, ${strays.refused} refused by them.`);
    process.exit(0);
})().catch(e => { console.error(`${at()} FAIL`, e.message); process.exit(1); });
