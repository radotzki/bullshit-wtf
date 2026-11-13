// A Replay starts with the players still at the table (fork.ts seatsForReplay): a seat that sent
// nothing on the finished game's last question is left out, and a phone whose seat was left out, or that
// comes in late, joins the Replay and plays. A game played on the compiled functions, to its end.
// Runs against an in-memory database and a fake BigQuery, so it needs no Firebase project:
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
function ref(parts) {
    return {
        child: (p) => ref(parts.concat(String(p).split('/'))),
        once: async () => ({ val: () => clone(at(parts)) }),
        set: async (v) => put(parts, v),
        update: async (v) => Object.keys(v).forEach(k => put(parts.concat(k.split('/')), v[k])),
        push: (v) => { const key = 'k' + (++pushId); if (v !== undefined) put(parts.concat(key), v); return { key }; },
        // Returning undefined aborts, as in the real database.
        transaction: (fn, done) => {
            const v = fn(clone(at(parts)));
            if (v === undefined) return done(null, false, { val: () => clone(at(parts)) });
            put(parts, v);
            done(null, true, { val: () => clone(at(parts)) });
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

class FakeBigQuery {
    dataset() { return { table: () => ({ insert: async () => {} }) }; }
}

const realLoad = Module._load;
Module._load = function (request) {
    if (request === '@google-cloud/bigquery') return { BigQuery: FakeBigQuery };
    if (/[\\/]firebase$/.test(request)) return fakeFirebase;
    return realLoad.apply(this, arguments);
};

const dist = path.join(__dirname, '..', 'dist', 'controllers');
const { advance } = require(path.join(dist, 'tick'));
const { answer } = require(path.join(dist, 'answer'));
const { onAnswerSelection } = require(path.join(dist, 'on-answer-selection'));
const { createFork, seatsForReplay } = require(path.join(dist, 'fork'));

/** Replay, as fork() makes it (the question draw left out): the new game is written and its pin returned. */
async function fork(pin, creator, hostPid, hostKey) {
    const forked = createFork(pin, clone(game(pin)), Object.assign({}, game(pin).qids), creator, hostPid, hostKey, false, pin + 'R');
    db.games[pin + 'R'] = clone(forked);
    return { pin: pin + 'R' };
}
const { join } = require(path.join(dist, 'join'));
const { lastSentSeats } = require(path.join(dist, 'seats'));

const S = { GameStaging: 0, RoundIntro: 1, ShowQuestion: 2, ShowAnswers: 3, RevealTheTruth: 4, ScoreBoard: 5, ScoreBoardFinal: 6 };
const TOTAL_Q = 4;
console.log = () => {};
console.error = () => {};

let pinCount = 0;
function newGame(seats) {
    const pin = 'R' + String(++pinCount).padStart(3, '0');
    db.questions = db.questions || {};
    const qids = {};
    for (let i = 0; i < TOTAL_Q; i++) {
        qids[i] = `q${i}`;
        db.questions[`q${i}`] = { lang: 'en', questionText: `Question ${i} has a ___`, realAnswer: `truth${i}`, fakeAnswers: ['house a', 'house b', 'house c'], citation: '' };
    }
    const players = {};
    for (let i = 1; i <= seats; i++) players['p' + i] = { nickname: 'p' + i, score: 0, uid: 'u' + i };
    players.p1.host = true;
    db.games = db.games || {};
    db.games[pin] = {
        state: { id: S.GameStaging, timestamp: Date.now() }, locale: 'en', timestamp: Date.now(),
        roundIndex: 0, questionIndex: 0, totalQ: TOTAL_Q, qids, tick: 0, presenter: false, players,
    };
    return pin;
}

const game = pin => db.games[pin];
const state = pin => game(pin).state.id;
const seatsOf = pin => Object.keys(game(pin).players || {}).sort();

async function next(pin) {
    await advance(pin, Object.assign({}, game(pin).state));
    return state(pin);
}

/**
 * Plays a whole game. `sends(q)` says which seats send a lie and a pick on question q (0-based);
 * `taps` says which seats only tap NEXT on the last reveal. Clocks run out where nobody is left to wait for.
 */
async function play(pin, sends, taps = []) {
    let guard = 0;
    while (state(pin) !== S.ScoreBoardFinal && guard++ < 200) {
        const q = game(pin).questionIndex || 0;
        const s = state(pin);
        if (s === S.ShowQuestion) {
            for (const pid of sends(q)) await answer(pin, pid, `lie ${pid} ${q}`);
        } else if (s === S.ShowAnswers) {
            game(pin).answerSelections = game(pin).answerSelections || {};
            for (const pid of sends(q)) {
                game(pin).answerSelections[pid] = { text: `truth${q}` };
            }
            await onAnswerSelection(pin);
        } else if (s === S.RevealTheTruth && q === TOTAL_Q - 1) {
            game(pin).revealDone = game(pin).revealDone || {};
            for (const pid of taps) game(pin).revealDone[pid] = true;
        }
        if (state(pin) === s && (game(pin).questionIndex || 0) === q) await next(pin);
    }
    assert.strictEqual(state(pin), S.ScoreBoardFinal, 'the game reached its final screen');
}

test('a Replay leaves out the seat of a player who went home, and keeps everyone still there', async () => {
    const pin = newGame(6);
    // p6 went home after question 2. p5 sent nothing on the last question but tapped NEXT on its reveal.
    await play(pin, q => ['p1', 'p2', 'p3', 'p4'].concat(q < 2 ? ['p5', 'p6'] : []), ['p5']);
    assert.deepStrictEqual(game(pin).lastSent, { p1: true, p2: true, p3: true, p4: true, p5: true });

    // p2 pressed Replay.
    const replay = await fork(pin, 'u2', 'p2', 'key2');
    assert.deepStrictEqual(seatsOf(replay.pin), ['p1', 'p2', 'p3', 'p4', 'p5'], 'no seat for the player who went home');
    assert.strictEqual(game(replay.pin).players.p2.host, true);
    assert.ok(seatsOf(replay.pin).every(k => game(replay.pin).players[k].score === 0));
});

test('a Replay where everyone stayed has every seat, as before', async () => {
    const pin = newGame(4);
    await play(pin, () => ['p1', 'p2', 'p3', 'p4']);
    const replay = await fork(pin, 'u1', 'p1', 'key1');
    assert.deepStrictEqual(seatsOf(replay.pin), ['p1', 'p2', 'p3', 'p4']);
});

test('the phone that pressed Replay keeps its seat even when it sent nothing on the last question', async () => {
    const pin = newGame(3);
    await play(pin, q => q < 3 ? ['p1', 'p2', 'p3'] : ['p1', 'p2']);
    const replay = await fork(pin, 'u3', 'p3', 'key3');
    assert.deepStrictEqual(seatsOf(replay.pin), ['p1', 'p2', 'p3']);
    // An old client sends no player id: the old host keeps its seat, and p3 has none.
    const pin2 = newGame(3);
    await play(pin2, q => q < 3 ? ['p1', 'p2', 'p3'] : ['p2', 'p3'].slice(0, 1));
    const old = await fork(pin2, 'u2');
    assert.deepStrictEqual(seatsOf(old.pin), ['p1', 'p2']);
});

test('a phone whose seat was left out, and a late phone, join the Replay and play it', async () => {
    const pin = newGame(4);
    // p4 sat out the last question (a phone that slept), but is still at the table.
    await play(pin, q => q < 3 ? ['p1', 'p2', 'p3', 'p4'] : ['p1', 'p2', 'p3']);
    const replay = await fork(pin, 'u1', 'p1', 'key1');
    assert.deepStrictEqual(seatsOf(replay.pin), ['p1', 'p2', 'p3']);
    // The host starts at once; p4's phone follows, finds no seat of its own, and joins (score-board-final takeSeat).
    await next(replay.pin);
    const back = await join(replay.pin, 'p4', 'u4', undefined, 'p4');
    assert.notStrictEqual(back.pid, 'p4');
    const late = await join(replay.pin, 'newcomer', 'u-late');
    assert.strictEqual(seatsOf(replay.pin).length, 5);
    // Both play the whole Replay.
    const all = ['p1', 'p2', 'p3', back.pid, late.pid];
    await play(replay.pin, () => all);
    assert.deepStrictEqual(Object.keys(game(replay.pin).lastSent).sort(), all.slice().sort());
    assert.ok(game(replay.pin).players[back.pid].score > 0);
    assert.ok(game(replay.pin).players[late.pid].score > 0);
});

test('a game with nothing to go by keeps its seats: no lastSent, or nobody sent on the last question', () => {
    const players = { a: { uid: 'a' }, b: { uid: 'b' }, c: { uid: 'c' } };
    assert.deepStrictEqual(Object.keys(seatsForReplay({ players, state: { id: 6 } })), ['a', 'b', 'c']);
    assert.deepStrictEqual(Object.keys(seatsForReplay({ players, lastSent: {}, state: { id: 6 } })), ['a', 'b', 'c']);
    // A lastSent that names no seat of this game counts as nothing.
    assert.deepStrictEqual(Object.keys(seatsForReplay({ players, lastSent: { zz: true }, state: { id: 6 } })), ['a', 'b', 'c']);
});

test('lastSentSeats counts a lie, a pick and a NEXT of a seat, and never a house lie or the truth', () => {
    const g = {
        state: { id: 5, timestamp: 1 },
        players: { a: { uid: 'a' }, b: { uid: 'b' }, c: { uid: 'c' }, d: { uid: 'd' } },
        answers: { a: { text: 'x' }, house1: { text: 'h', houseLie: true }, truth: { text: 't', realAnswer: true } },
        answerSelections: { b: { text: 't' } },
        revealDone: { c: true },
    };
    assert.deepStrictEqual(lastSentSeats(g), { a: true, b: true, c: true });
});
