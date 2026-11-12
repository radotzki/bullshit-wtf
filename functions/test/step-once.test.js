// A step of the game runs once, however many callers ask for it and whenever they arrive: the phase
// timer, each phone's own timer and the last answer or pick all call advance() for the same phase.
// Whole steps on the compiled functions (dist/) against an in-memory database whose transaction
// behaves like the real client's, with one caller held just before it claims its phase.
//   npm run build && npm test
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');

// ---- in-memory Realtime Database (just what the controllers use) ----
const db = {};
const clone = v => v === undefined || v === null ? null : JSON.parse(JSON.stringify(v));
function at(parts) {
    let node = db;
    for (const p of parts) {
        if (node == null || typeof node !== 'object') return null;
        node = node[p];
    }
    return node === undefined ? null : node;
}
function put(parts, value) {
    let node = db;
    parts.slice(0, -1).forEach(p => { node[p] = node[p] && typeof node[p] === 'object' ? node[p] : {}; node = node[p]; });
    const key = parts[parts.length - 1];
    const v = clone(value);
    // Like the real database: null, and an object with nothing in it, is no node at all.
    if (v === null || (typeof v === 'object' && !Object.keys(v).length)) delete node[key]; else node[key] = v;
}
let pushId = 0;
const states = {};
const history = [];
// hold(): the next caller that goes to claim a phase stops just before it, until go() is called.
let holdNext = null;
function hold() {
    let go, reached;
    const gate = new Promise(r => go = r);
    const at = new Promise(r => reached = r);
    holdNext = { gate, reached };
    return { reached: at, go };
}
function ref(parts) {
    return {
        child: (p) => ref(parts.concat(String(p).split('/'))),
        once: async () => ({ val: () => clone(at(parts)) }),
        set: async (v) => put(parts, v),
        update: async (v) => {
            Object.keys(v).forEach(k => put(parts.concat(k.split('/')), v[k]));
            if (parts[0] === 'games' && parts.length === 2 && v.state) (states[parts[1]] = states[parts[1]] || []).push(v.state.id);
        },
        push: (v) => {
            if (parts[0] === 'qHistory') history.push(clone(v));
            const key = 'k' + (++pushId);
            if (v !== undefined) put(parts.concat(key), v);
            return { key };
        },
        // As the real client does it: the function first runs on what the client holds locally, which
        // is nothing (null), whatever the server holds. Returning undefined stops there, and the server
        // is never asked. Otherwise the server is asked, and if it holds something else the function
        // runs again on that.
        transaction: (fn, done) => {
            const run = () => {
                const guess = fn(null);
                if (guess === undefined) return done(null, false);
                const actual = clone(at(parts));
                if (actual === null) { put(parts, guess); return done(null, true); }
                const v = fn(actual);
                if (v === undefined) return done(null, false);
                put(parts, v);
                done(null, true);
            };
            if (holdNext && (parts.includes('advanceLock') || parts.includes('advanceTaken'))) {
                const h = holdNext;
                holdNext = null;
                h.reached();
                h.gate.then(run);
            } else {
                run();
            }
        },
    };
}
const fakeFirebase = {
    gamesRef: ref(['games']),
    qHistoryRef: ref(['qHistory']),
    gameCounterRef: ref(['gameCounter']),
    questionsRef: ref(['questions']),
    seenQuestionsRef: ref(['seenQuestions']),
    crewsRef: ref(['crews']),
    get: (r) => r.once('value').then(s => s.val()),
};

const realLoad = Module._load;
Module._load = function (request) {
    if (request === '@google-cloud/bigquery') return { BigQuery: class { dataset() { return { table: () => ({ insert: async () => {} }) }; } } };
    if (/[\\/]firebase$/.test(request)) return fakeFirebase;
    return realLoad.apply(this, arguments);
};

const dist = path.join(__dirname, '..', 'dist');
const { advance } = require(path.join(dist, 'controllers', 'tick'));
const { answer } = require(path.join(dist, 'controllers', 'answer'));
const { onAnswerSelection } = require(path.join(dist, 'controllers', 'on-answer-selection'));

const S = { GameStaging: 0, RoundIntro: 1, ShowQuestion: 2, ShowAnswers: 3, RevealTheTruth: 4, ScoreBoard: 5, ScoreBoardFinal: 6 };
const TOTAL_Q = 5;
console.log = () => {};
console.error = () => {};

let pinCount = 0;
function newGame(bigReveal) {
    const pin = 'O' + String(++pinCount).padStart(3, '0');
    db.questions = db.questions || {};
    const qids = {};
    for (let i = 0; i < TOTAL_Q; i++) {
        qids[i] = `q${i}`;
        db.questions[`q${i}`] = { lang: 'en', questionText: `Question ${i} has a ___`, realAnswer: `truth${i}`, fakeAnswers: ['house a', 'house b', 'house c'], citation: '' };
    }
    const players = {};
    ['p1', 'p2', 'p3'].forEach(pid => players[pid] = { nickname: pid, score: 0, uid: 'u' + pid });
    db.games = db.games || {};
    db.games[pin] = { state: { id: S.GameStaging, timestamp: Date.now() }, locale: 'en', timestamp: Date.now(),
        roundIndex: 0, questionIndex: 0, totalQ: TOTAL_Q, qids, tick: 0, presenter: false, players, bigReveal };
    states[pin] = [S.GameStaging];
    return pin;
}

const game = pin => db.games[pin];
const state = pin => game(pin).state.id;
const scores = pin => ['p1', 'p2', 'p3'].map(pid => game(pin).players[pid].score);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** One caller: move on from the phase the game is in now. */
const next = pin => advance(pin, Object.assign({}, game(pin).state), 20);

/** Play to the reveal of the current question: p1 finds the truth, p2 falls for p1's lie, p3 for p2's. */
async function toReveal(pin) {
    for (let i = 0; state(pin) !== S.ShowQuestion; i++) {
        assert.ok(i < 6, `the game is stuck in state ${state(pin)}`);
        await next(pin);
    }
    const q = game(pin).questionIndex;
    for (const pid of ['p1', 'p2', 'p3']) await answer(pin, pid, `${pid} lie ${q}`);
    assert.strictEqual(state(pin), S.ShowAnswers);
    const picks = { p1: `truth${q}`, p2: `p1 lie ${q}`, p3: `p2 lie ${q}` };
    for (const pid of Object.keys(picks)) {
        game(pin).answerSelections = game(pin).answerSelections || {};
        game(pin).answerSelections[pid] = { text: picks[pid] };
        await onAnswerSelection(pin);
    }
    assert.strictEqual(state(pin), S.RevealTheTruth);
}

/**
 * Two callers ask to end the same phase. The first has read the game and is held just before it
 * claims the phase; `meanwhile` runs; then the first is let go. Returns when both are through.
 */
async function lateCaller(pin, meanwhile) {
    const held = hold();
    const late = next(pin);
    await held.reached;
    await meanwhile();
    held.go();
    await late;
}

for (const bigReveal of [true, false]) {
    const kind = bigReveal ? 'a staged' : 'an ordinary';

    test(`${kind} game: a caller that is late for the end of the reveal does not run it again`, { timeout: 10000 }, async () => {
        const pin = newGame(bigReveal);
        await toReveal(pin);
        const reveal = states[pin].length;
        await lateCaller(pin, async () => {
            await next(pin);
            // An ordinary scoreboard waits for its timer; a staged one is left in the same run.
            if (!bigReveal) await next(pin);
        });
        assert.deepStrictEqual(states[pin].slice(reveal), [S.ScoreBoard, S.ShowQuestion], 'the scoreboard and the next question, once each');
        assert.strictEqual(game(pin).questionIndex, 1, 'the next question, not the one after');
        assert.deepStrictEqual(scores(pin), [1500, 500, 0], 'the points are added once');
        assert.strictEqual(history.filter(h => h.pin === pin).length, 1, 'the question is saved once');
    });

    test(`${kind} game played to the end with a late caller at every reveal plays each question once`, { timeout: 10000 }, async () => {
        const pin = newGame(bigReveal);
        const seen = [];
        for (let q = 0; q < TOTAL_Q; q++) {
            await toReveal(pin);
            seen.push(game(pin).questionIndex);
            await lateCaller(pin, async () => {
                await next(pin);
                if (!bigReveal) await next(pin);
            });
        }
        assert.deepStrictEqual(seen, [0, 1, 2, 3, 4], 'every question was played');
        assert.strictEqual(state(pin), S.ScoreBoardFinal);
        const question = [S.ShowQuestion, S.ShowAnswers, S.RevealTheTruth, S.ScoreBoard];
        assert.deepStrictEqual(states[pin], [S.GameStaging, S.RoundIntro].concat(question, question, S.RoundIntro, question, question, S.RoundIntro, question, S.ScoreBoardFinal), 'each phase once, in order');
        assert.strictEqual(history.filter(h => h.pin === pin).length, TOTAL_Q);
        assert.strictEqual(game(pin).players.p1.score > game(pin).players.p2.score, true);
    });
}

test('a late caller does not undo the claim of the phase after its own', { timeout: 10000 }, async () => {
    const pin = newGame(false);
    await toReveal(pin);
    let scoreboard, from;
    await lateCaller(pin, async () => {
        await next(pin);
        assert.strictEqual(state(pin), S.ScoreBoard);
        from = Object.assign({}, game(pin).state);
        // A second held caller: it has claimed nothing yet, and is let go only at the end.
        scoreboard = hold();
        scoreboard.done = next(pin);
        await scoreboard.reached;
    });
    // The scoreboard is still to be left, by the caller that is waiting to claim it, and by nobody twice.
    scoreboard.go();
    await scoreboard.done;
    await advance(pin, from, 20); // a third caller for the scoreboard, after it was left: nothing to do
    assert.deepStrictEqual(states[pin].slice(-3), [S.RevealTheTruth, S.ScoreBoard, S.ShowQuestion]);
    assert.strictEqual(game(pin).questionIndex, 1);
    assert.deepStrictEqual(scores(pin), [1500, 500, 0]);
});

test('a caller that claims a phase the game has already left does nothing', { timeout: 10000 }, async () => {
    const pin = newGame(true);
    await toReveal(pin);
    const reveal = states[pin].length;
    await lateCaller(pin, async () => {
        await next(pin);
        // Every phase so far is free to take again, as after a step that gave its phase back.
        delete game(pin).advanceLock;
        delete game(pin).advanceTaken;
    });
    assert.deepStrictEqual(states[pin].slice(reveal), [S.ScoreBoard, S.ShowQuestion]);
    assert.strictEqual(game(pin).questionIndex, 1);
    assert.deepStrictEqual(scores(pin), [1500, 500, 0]);
});

test('many callers at once for every phase of a staged game: each phase once', { timeout: 10000 }, async () => {
    const pin = newGame(true);
    const all = () => Promise.all(Array.from({ length: 8 }, () => next(pin)));
    for (let q = 0; q < TOTAL_Q; q++) {
        for (let i = 0; state(pin) !== S.ShowQuestion; i++) {
            assert.ok(i < 6, `the game is stuck in state ${state(pin)}`);
            await all();
        }
        for (const pid of ['p1', 'p2', 'p3']) await answer(pin, pid, `${pid} lie ${q}`);
        await all();
        assert.strictEqual(state(pin), S.RevealTheTruth);
        await all();
        await sleep(1);
    }
    assert.strictEqual(state(pin), S.ScoreBoardFinal);
    const question = [S.ShowQuestion, S.ShowAnswers, S.RevealTheTruth, S.ScoreBoard];
    assert.deepStrictEqual(states[pin], [S.GameStaging, S.RoundIntro].concat(question, question, S.RoundIntro, question, question, S.RoundIntro, question, S.ScoreBoardFinal));
});
