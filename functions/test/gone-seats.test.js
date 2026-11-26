// Seats whose page is gone (seats.ts seatGone): a Replay leaves them out, and no question waits out
// its clock for them. A phone that only slept counts again once it is back, and a player who comes back
// to a Replay in progress joins it like a late phone. Played on the compiled functions, against an
// in-memory database and a fake BigQuery, so it needs no Firebase project:
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
const { seatGone, seatsToWaitFor, GONE_MS } = require(path.join(dist, 'seats'));
const { onSeatGone, endIfEveryoneIn } = require(path.join(dist, 'seat-gone'));

const S = { GameStaging: 0, RoundIntro: 1, ShowQuestion: 2, ShowAnswers: 3, RevealTheTruth: 4, ScoreBoard: 5, ScoreBoardFinal: 6 };
const TOTAL_Q = 4;
console.log = () => {};
console.error = () => {};

let pinCount = 0;
function newGame(seats) {
    const pin = 'G' + String(++pinCount).padStart(3, '0');
    db.questions = db.questions || {};
    const qids = {};
    for (let i = 0; i < TOTAL_Q; i++) {
        qids[i] = `q${i}`;
        db.questions[`q${i}`] = { lang: 'en', questionText: `Question ${i} has a ___`, realAnswer: `truth${i}`, fakeAnswers: ['house a', 'house b', 'house c'], citation: '' };
    }
    const players = {};
    const seen = {};
    for (let i = 1; i <= seats; i++) {
        players['p' + i] = { nickname: 'p' + i, score: 0, uid: 'u' + i };
        seen['p' + i] = true;
    }
    players.p1.host = true;
    db.games = db.games || {};
    db.games[pin] = {
        state: { id: S.GameStaging, timestamp: Date.now() }, locale: 'en', timestamp: Date.now(),
        roundIndex: 0, questionIndex: 0, totalQ: TOTAL_Q, qids, tick: 0, presenter: false, players, seen,
    };
    return pin;
}

const game = pin => db.games[pin];
const state = pin => game(pin).state.id;
const seatsOf = pin => Object.keys(game(pin).players || {}).sort();

/** The seat's page as the database sees it: here (true), or gone `ago` ms ago. */
function here(pin, pid) { game(pin).seen = game(pin).seen || {}; game(pin).seen[pid] = true; }
function gone(pin, pid, ago) { game(pin).seen = game(pin).seen || {}; game(pin).seen[pid] = Date.now() - ago; }
/** The phase began `ago` ms ago (its guard over, for a phase that has one). */
function phaseBegan(pin, ago) { game(pin).state.timestamp = Date.now() - ago; }

async function next(pin) {
    await advance(pin, Object.assign({}, game(pin).state));
    return state(pin);
}

/** Moves the game on until it is on question `q`'s lies. */
async function toLies(pin, q) {
    let guard = 0;
    while (!(state(pin) === S.ShowQuestion && (game(pin).questionIndex || 0) === q) && guard++ < 100) await next(pin);
    assert.strictEqual(state(pin), S.ShowQuestion);
}

async function lies(pin, pids) { for (const pid of pids) await answer(pin, pid, `lie ${pid} ${game(pin).questionIndex}`); }
async function picks(pin, pids) {
    game(pin).answerSelections = game(pin).answerSelections || {};
    for (const pid of pids) game(pin).answerSelections[pid] = { text: `truth${game(pin).questionIndex}` };
    await onAnswerSelection(pin);
}

/** Plays to the end: on every question each seat in `sends(q)` lies and picks; the clocks do the rest. */
async function play(pin, sends) {
    let guard = 0;
    while (state(pin) !== S.ScoreBoardFinal && guard++ < 200) {
        const q = game(pin).questionIndex || 0;
        const s = state(pin);
        if (s === S.ShowQuestion) await lies(pin, sends(q));
        else if (s === S.ShowAnswers) await picks(pin, sends(q));
        if (state(pin) === s && (game(pin).questionIndex || 0) === q) await next(pin);
    }
    assert.strictEqual(state(pin), S.ScoreBoardFinal, 'the game reached its final screen');
}

test('seatGone: a page away GONE_MS or more is gone; here, a short blip, or no mark at all is not', () => {
    const now = 1000000;
    const g = { players: { a: {}, b: {}, c: {}, d: {} }, seen: { a: true, b: now - GONE_MS, c: now - GONE_MS + 1 } };
    assert.strictEqual(GONE_MS, 20000);
    assert.strictEqual(seatGone(g, 'a', now), false, 'connected');
    assert.strictEqual(seatGone(g, 'b', now), true, 'away 20 s');
    assert.strictEqual(seatGone(g, 'c', now), false, 'away a moment less: a phone that blinked');
    assert.strictEqual(seatGone(g, 'd', now), false, 'no mark in a first game: an older page');
    // A Replay carries seats over: one whose phone never opened it, while others did, is gone once
    // the Replay has been open GONE_MS; not before, and never in a Replay where nobody is marked.
    const r = Object.assign({}, g, { origin: 'replay', timestamp: now - GONE_MS });
    assert.strictEqual(seatGone(r, 'd', now), true);
    assert.strictEqual(seatGone(Object.assign({}, r, { timestamp: now - 1000 }), 'd', now), false);
    assert.strictEqual(seatGone(Object.assign({}, r, { seen: {} }), 'd', now), false);
    assert.strictEqual(seatGone({ players: { a: {} } }, 'a', now), false, 'a game with no marks');
});

test('a leaver: a guest who played to the end and closed the page gets no seat in the Replay', async () => {
    const pin = newGame(5);
    await play(pin, () => ['p1', 'p2', 'p3', 'p4', 'p5']);
    assert.ok(game(pin).lastSent.p5, 'p5 sent on the last question, so lastSent alone would seat them');
    // p5 said goodnight a minute ago; p4's phone blinked 3 s ago; p1's mark is stale but p1 pressed Replay.
    gone(pin, 'p5', 60000);
    gone(pin, 'p4', 3000);
    gone(pin, 'p1', 90000);
    const replay = await fork(pin, 'u1', 'p1', 'key1');
    assert.deepStrictEqual(seatsOf(replay.pin), ['p1', 'p2', 'p3', 'p4'], 'no seat for p5, every other seat kept');
    assert.strictEqual(game(replay.pin).players.p1.host, true);
});

test('a leaver mid-game: once their page has been gone 20 s, the question stops waiting for them', async () => {
    const pin = newGame(4);
    await next(pin);
    await toLies(pin, 0);
    await lies(pin, ['p1', 'p2', 'p3', 'p4']);
    await toLies(pin, 1);
    // p4 walks off. The others have all lied; nothing ends the lies until p4 counts as gone.
    await lies(pin, ['p1', 'p2', 'p3']);
    assert.strictEqual(state(pin), S.ShowQuestion, 'p4 is still waited for while their page is here');
    gone(pin, 'p4', 2000);
    assert.strictEqual(await endIfEveryoneIn(pin), false, 'a page away 2 s is not gone yet');
    assert.strictEqual(state(pin), S.ShowQuestion);
    // The database marked p4's page away GONE_MS ago: the seat-gone trigger ends the lies now.
    gone(pin, 'p4', GONE_MS + 1000);
    phaseBegan(pin, 30000);
    await onSeatGone(pin, 'p4', game(pin).seen.p4);
    assert.strictEqual(state(pin), S.ShowAnswers, 'the lies ended for the three still here');
    // The picks end as soon as the three have picked, with no clock run out for p4.
    phaseBegan(pin, 30000);
    await picks(pin, ['p1', 'p2', 'p3']);
    assert.strictEqual(state(pin), S.RevealTheTruth);
    // And the reveal ends on the three NEXT taps.
    phaseBegan(pin, 120000);
    game(pin).revealDone = { p1: true, p2: true, p3: true };
    assert.strictEqual(await endIfEveryoneIn(pin), true);
    assert.notStrictEqual(state(pin), S.RevealTheTruth);
    // On question 1 too: a seat whose page is gone is not waited for.
    assert.deepStrictEqual(seatsToWaitFor(Object.assign({}, game(pin), { questionIndex: 0 })), ['p1', 'p2', 'p3']);
});

test('inside the guard, a gone seat does not end the lies early; the trigger waits the guard out', async () => {
    const pin = newGame(3);
    await next(pin);
    await toLies(pin, 0);
    gone(pin, 'p3', GONE_MS + 1000);
    await lies(pin, ['p1', 'p2']);
    assert.strictEqual(state(pin), S.ShowQuestion, 'the first 20 s of the lies are a guard while a seat is left out');
    phaseBegan(pin, 19500);
    assert.strictEqual(await endIfEveryoneIn(pin), true, 'it waited the last half second of the guard, then ended');
    assert.strictEqual(state(pin), S.ShowAnswers);
});

test('a slept phone that comes back is waited for again, and plays on', async () => {
    const pin = newGame(4);
    await next(pin);
    await toLies(pin, 0);
    await lies(pin, ['p1', 'p2', 'p3', 'p4']);
    await toLies(pin, 1);
    // Dave (p3) puts his phone down; it sleeps for 50 s, through question 2.
    gone(pin, 'p3', 30000);
    phaseBegan(pin, 25000);
    await lies(pin, ['p1', 'p2', 'p4']);
    assert.strictEqual(state(pin), S.ShowAnswers, 'question 2 did not wait out its clock for a sleeping phone');
    phaseBegan(pin, 25000);
    await picks(pin, ['p1', 'p2', 'p4']);
    await toLies(pin, 2);
    // He picks the phone back up: the page reconnects and marks the seat here again.
    here(pin, 'p3');
    phaseBegan(pin, 25000);
    await lies(pin, ['p1', 'p2', 'p4']);
    assert.strictEqual(state(pin), S.ShowQuestion, 'back, he is waited for again');
    assert.strictEqual(await endIfEveryoneIn(pin), false);
    await lies(pin, ['p3']);
    assert.strictEqual(state(pin), S.ShowAnswers, 'his lie ends the question, as everyone is in');
    // A mark of true written by his page does nothing in the trigger.
    await onSeatGone(pin, 'p3', true);
    assert.strictEqual(state(pin), S.ShowAnswers);
});

test('a slept phone at the Replay is in it: back within 20 s keeps its seat, longer joins like a late phone', async () => {
    const pin = newGame(4);
    await play(pin, () => ['p1', 'p2', 'p3', 'p4']);
    gone(pin, 'p3', 10000);
    gone(pin, 'p4', 50000);
    const replay = await fork(pin, 'u1', 'p1', 'key1');
    assert.deepStrictEqual(seatsOf(replay.pin), ['p1', 'p2', 'p3'], 'p3 blinked and keeps the seat; p4 slept and has none yet');
    // p4's phone wakes on the final screen, finds the Replay, and joins it from the lobby (score-board-final takeSeat).
    const back = await join(replay.pin, 'p4', 'u4', undefined, 'p4');
    assert.strictEqual(seatsOf(replay.pin).length, 4);
    assert.strictEqual(game(replay.pin).players[back.pid].nickname, 'p4');
});

test('a rejoin mid-Replay: the player who left at the press comes back during question 2 and plays', async () => {
    const pin = newGame(4);
    await play(pin, () => ['p1', 'p2', 'p3', 'p4']);
    gone(pin, 'p4', 60000);
    const replay = await fork(pin, 'u1', 'p1', 'key1');
    const rp = replay.pin;
    assert.deepStrictEqual(seatsOf(rp), ['p1', 'p2', 'p3']);
    ['p1', 'p2', 'p3'].forEach(pid => here(rp, pid));
    await next(rp);
    await toLies(rp, 0);
    await lies(rp, ['p1', 'p2', 'p3']);
    assert.strictEqual(state(rp), S.ShowAnswers, 'question 1 of the Replay waits for nobody who left');
    await picks(rp, ['p1', 'p2', 'p3']);
    await toLies(rp, 1);
    // p4 is back at the party, opens the final screen, and joins the Replay in progress.
    const back = await join(rp, 'p4', 'u4', undefined, 'p4');
    here(rp, back.pid);
    assert.ok(game(rp).players[back.pid], 'seated as a latecomer');
    await play(rp, () => ['p1', 'p2', 'p3', back.pid]);
    assert.ok(game(rp).players[back.pid].score > 0, 'and scored');
});

test('a Replay seat whose phone never came is not waited for, once the Replay has been open 20 s', async () => {
    const pin = newGame(4);
    await play(pin, () => ['p1', 'p2', 'p3', 'p4']);
    // Everyone was here at the press, but p4 never opened the Replay.
    const replay = await fork(pin, 'u1', 'p1', 'key1');
    const rp = replay.pin;
    assert.deepStrictEqual(seatsOf(rp), ['p1', 'p2', 'p3', 'p4']);
    assert.strictEqual(game(rp).seen, undefined, 'a Replay carries no marks over');
    ['p1', 'p2', 'p3'].forEach(pid => here(rp, pid));
    game(rp).timestamp = Date.now() - 60000;
    await next(rp);
    await toLies(rp, 0);
    phaseBegan(rp, 25000);
    await lies(rp, ['p1', 'p2', 'p3']);
    assert.strictEqual(state(rp), S.ShowAnswers);
});

test('a game with no marks at all waits for every seat, as before', async () => {
    const pin = newGame(3);
    delete game(pin).seen;
    await next(pin);
    await toLies(pin, 0);
    phaseBegan(pin, 30000);
    await lies(pin, ['p1', 'p2']);
    assert.strictEqual(state(pin), S.ShowQuestion);
    assert.strictEqual(await endIfEveryoneIn(pin), false);
});
