// A seat taken while the scoreboard step is being worked out stays at the table. The step reads the
// game, adds up the question's points and writes the new scores; a phone that joins in between (a
// latecomer, see join.ts) has its seat written after that read. The scores go in seat by seat, so the
// write does not put back the players node as it was read, without the new seat.
// Whole steps on the compiled functions (dist/) against an in-memory database, with the join landing
// just before the step's write.
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
    if (v === null || (typeof v === 'object' && !Object.keys(v).length)) delete node[key]; else node[key] = v;
}
let pushId = 0;
// beforeWrite(pin, update): runs once, just before the step's write of the game, for what lands meanwhile.
let beforeWrite = null;
function ref(parts) {
    return {
        child: (p) => ref(parts.concat(String(p).split('/'))),
        once: async () => ({ val: () => clone(at(parts)) }),
        set: async (v) => put(parts, v),
        update: async (v) => {
            if (beforeWrite && parts[0] === 'games' && parts.length === 2 && v.state) {
                const meanwhile = beforeWrite;
                beforeWrite = null;
                await meanwhile(parts[1], v);
            }
            // Like the real database: each key of an update replaces what is at its path.
            Object.keys(v).forEach(k => put(parts.concat(k.split('/')), v[k]));
        },
        push: (v) => {
            const key = 'k' + (++pushId);
            if (v !== undefined) put(parts.concat(key), v);
            return { key };
        },
        transaction: (fn, done) => {
            const guess = fn(null);
            if (guess === undefined) return done(null, false);
            const actual = clone(at(parts));
            if (actual === null) { put(parts, guess); return done(null, true); }
            const v = fn(actual);
            if (v === undefined) return done(null, false);
            put(parts, v);
            done(null, true);
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
const { advance, scoresOnly } = require(path.join(dist, 'controllers', 'tick'));
const { answer } = require(path.join(dist, 'controllers', 'answer'));
const { onAnswerSelection } = require(path.join(dist, 'controllers', 'on-answer-selection'));
const { join } = require(path.join(dist, 'controllers', 'join'));

const S = { GameStaging: 0, RoundIntro: 1, ShowQuestion: 2, ShowAnswers: 3, RevealTheTruth: 4, ScoreBoard: 5, ScoreBoardFinal: 6 };
const TOTAL_Q = 5;
console.log = () => {};
console.error = () => {};

let pinCount = 0;
function newGame() {
    const pin = 'L' + String(++pinCount).padStart(3, '0');
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
        roundIndex: 0, questionIndex: 0, totalQ: TOTAL_Q, qids, tick: 0, presenter: false, players };
    return pin;
}

const game = pin => db.games[pin];
const state = pin => game(pin).state.id;
const next = pin => advance(pin, Object.assign({}, game(pin).state), 20);

/** Play to the reveal of the current question: p1 finds the truth, p2 falls for p1's lie, p3 for p2's. */
async function toReveal(pin) {
    for (let i = 0; state(pin) !== S.ShowQuestion; i++) {
        assert.ok(i < 6, `the game is stuck in state ${state(pin)}`);
        await next(pin);
    }
    const q = game(pin).questionIndex;
    for (const pid of ['p1', 'p2', 'p3']) await answer(pin, pid, `${pid} lie ${q}`);
    const picks = { p1: `truth${q}`, p2: `p1 lie ${q}`, p3: `p2 lie ${q}` };
    for (const pid of Object.keys(picks)) {
        game(pin).answerSelections = game(pin).answerSelections || {};
        game(pin).answerSelections[pid] = { text: picks[pid] };
        await onAnswerSelection(pin);
    }
    assert.strictEqual(state(pin), S.RevealTheTruth);
}

test('a phone that joins while the scoreboard step runs keeps its seat', { timeout: 10000 }, async () => {
    const pin = newGame();
    await toReveal(pin);

    let joined;
    beforeWrite = async (p, update) => {
        assert.strictEqual(update.state.id, S.ScoreBoard, 'the join lands during the scoreboard step');
        joined = await join(p, 'Dana', 'u-late');
    };
    await next(pin);

    assert.strictEqual(state(pin), S.ScoreBoard);
    assert.ok(joined && joined.pid, 'the latecomer was given a seat');
    const seat = game(pin).players[joined.pid];
    assert.ok(seat, 'the latecomer\'s seat is still there after the scoreboard is written');
    assert.strictEqual(seat.nickname, 'Dana');
    assert.strictEqual(seat.uid, 'u-late');
    assert.strictEqual(seat.score, 0);
    assert.deepStrictEqual(['p1', 'p2', 'p3'].map(pid => game(pin).players[pid].score), [1500, 500, 0], 'the question\'s points are added');
    assert.deepStrictEqual(['p1', 'p2', 'p3'].map(pid => game(pin).players[pid].nickname), ['p1', 'p2', 'p3'], 'the other seats are kept whole');
});

test('a mark written on a seat while the scoreboard step runs is kept', { timeout: 10000 }, async () => {
    const pin = newGame();
    await toReveal(pin);

    beforeWrite = async (p) => {
        await fakeFirebase.gamesRef.child(p).child('players').update({ 'p2/host': true });
    };
    await next(pin);

    assert.strictEqual(game(pin).players.p2.host, true);
    assert.strictEqual(game(pin).players.p1.score, 1500);
});

test('scoresOnly writes each seat\'s score at its own path', () => {
    const update = { state: { id: S.ScoreBoard, timestamp: 1 }, players: { a: { nickname: 'A', score: 2000, uid: 'ua' }, b: { nickname: 'B', score: -500 } } };
    assert.deepStrictEqual(scoresOnly(update), { state: update.state, 'players/a/score': 2000, 'players/b/score': -500 });
    const noPlayers = { state: update.state, questionIndex: 1 };
    assert.deepStrictEqual(scoresOnly(noPlayers), noPlayers, 'an update with no scores goes as it is');
});
