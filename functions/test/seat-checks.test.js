// The three places that ask "is everyone in?" (a lie sent, a pick written, a NEXT tap) and the phase
// timer, played on the compiled functions with a seat nobody plays. Each test fails if its place stops
// using the seat rule of seats.ts, or the guard's lengths (20 s for the lies, 10 s for the picks and
// the reveal) change.
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
const { onRevealDone } = require(path.join(dist, 'on-reveal-done'));
const { onPhaseStart } = require(path.join(dist, 'phase-timer'));
const { LEFT_OUT_GUARD_MS } = require(path.join(dist, 'seats'));

const S = { GameStaging: 0, RoundIntro: 1, ShowQuestion: 2, ShowAnswers: 3, RevealTheTruth: 4, ScoreBoard: 5, ScoreBoardFinal: 6 };
const TOTAL_Q = 4;
console.log = () => {};
console.error = () => {};

let pinCount = 0;
function newGame(seats) {
    const pin = 'S' + String(++pinCount).padStart(3, '0');
    db.questions = db.questions || {};
    const qids = {};
    for (let i = 0; i < TOTAL_Q; i++) {
        qids[i] = `q${i}`;
        db.questions[`q${i}`] = { lang: 'en', questionText: `Question ${i} has a ___`, realAnswer: `truth${i}`, fakeAnswers: ['house a', 'house b', 'house c'], citation: '' };
    }
    const players = {};
    for (let i = 1; i <= seats; i++) players['p' + i] = { nickname: 'p' + i, score: 0, uid: 'u' + i };
    db.games = db.games || {};
    db.games[pin] = {
        state: { id: S.GameStaging, timestamp: Date.now() }, locale: 'en', timestamp: Date.now(),
        roundIndex: 0, questionIndex: 0, totalQ: TOTAL_Q, qids, tick: 0, presenter: false, players,
    };
    return pin;
}

const game = pin => db.games[pin];
const state = pin => game(pin).state.id;

/** A clock ran out: move on from the current phase. */
async function next(pin) {
    await advance(pin, Object.assign({}, game(pin).state));
    return state(pin);
}

/** A phone writes its pick, then the trigger that runs on every such write. */
async function pick(pin, pid, value) {
    game(pin).answerSelections = game(pin).answerSelections || {};
    game(pin).answerSelections[pid] = clone(value === undefined ? { text: `truth${game(pin).questionIndex}` } : value);
    await onAnswerSelection(pin);
}

/** A phone taps NEXT on the reveal, then the trigger. */
async function tapNext(pin, pid) {
    game(pin).revealDone = game(pin).revealDone || {};
    game(pin).revealDone[pid] = true;
    await onRevealDone(pin);
}

/** Make the current phase `seconds` old. */
function aged(pin, seconds) {
    const s = game(pin).state;
    const moved = Date.now() - seconds * 1000 - s.timestamp;
    s.timestamp += moved;
    if (s.deadline) s.deadline += moved;
}

/**
 * A game of `seats` seats on the lies of its second question; only `playing` sent anything on the
 * first. So the other seats are left out from here on, until they send something.
 */
async function secondQuestion(seats, playing) {
    const pin = newGame(seats);
    await next(pin);
    if (state(pin) === S.RoundIntro) await next(pin);
    assert.strictEqual(state(pin), S.ShowQuestion);
    for (const pid of playing) await answer(pin, pid, `${pid} lie 0`);
    if (state(pin) === S.ShowQuestion) await next(pin);
    for (const pid of playing) await pick(pin, pid);
    if (state(pin) === S.ShowAnswers) await next(pin);
    assert.strictEqual(state(pin), S.RevealTheTruth);
    assert.strictEqual(await next(pin), S.ScoreBoard);
    for (let i = 0; i < 3 && !(state(pin) === S.ShowQuestion && game(pin).questionIndex === 1); i++) await next(pin);
    assert.strictEqual(state(pin), S.ShowQuestion);
    assert.strictEqual(game(pin).questionIndex, 1);
    return pin;
}

const three = ['p1', 'p2', 'p3'];
const four = ['p1', 'p2', 'p3', 'p4'];

async function lies(pin, pids) {
    for (const pid of pids) await answer(pin, pid, `${pid} lie ${game(pin).questionIndex}`);
}

test('the guard: 20 seconds for the lies, 10 for the picks and the reveal', () => {
    assert.strictEqual(LEFT_OUT_GUARD_MS[S.ShowQuestion], 20000);
    assert.strictEqual(LEFT_OUT_GUARD_MS[S.ShowAnswers], 10000);
    assert.strictEqual(LEFT_OUT_GUARD_MS[S.RevealTheTruth], 10000);
});

test('question 1 waits for every seat: three lies of four do not end it', async () => {
    const pin = newGame(4);
    await next(pin);
    if (state(pin) === S.RoundIntro) await next(pin);
    aged(pin, 21);
    await lies(pin, three);
    assert.strictEqual(state(pin), S.ShowQuestion);
    await lies(pin, ['p4']);
    assert.strictEqual(state(pin), S.ShowAnswers);
});

test('lies: after the guard, the last lie of those who play ends the question', async () => {
    const pin = await secondQuestion(4, three);
    aged(pin, 20.1);
    await lies(pin, ['p1', 'p2']);
    assert.strictEqual(state(pin), S.ShowQuestion, 'p3 plays and has not sent');
    await lies(pin, ['p3']);
    assert.strictEqual(state(pin), S.ShowAnswers, 'the empty seat is not waited for');
});

test('lies: inside the first 20 seconds the question stays open, and a late player\'s lie is taken', async () => {
    const pin = await secondQuestion(4, three);
    // All three who play are in by 13 seconds.
    aged(pin, 13);
    await lies(pin, three);
    assert.strictEqual(state(pin), S.ShowQuestion, 'not at 13 seconds');
    // The player who missed question 1 finishes typing at 18 seconds.
    aged(pin, 18);
    await lies(pin, ['p4']);
    assert.strictEqual(game(pin).answers.p4 && game(pin).answers.p4.text, 'p4 lie 1', 'their lie is in');
    assert.strictEqual(state(pin), S.ShowAnswers, 'and with it everyone is in: the question ends at once');
});

test('lies: at 19 seconds a quick table still waits; a full table never does', async () => {
    const guarded = await secondQuestion(4, three);
    aged(guarded, 19);
    await lies(guarded, three);
    assert.strictEqual(state(guarded), S.ShowQuestion);

    const full = await secondQuestion(4, four);
    aged(full, 3);
    await lies(full, four);
    assert.strictEqual(state(full), S.ShowAnswers, 'no seat is left out, so no guard');
});

/** The picks of question 2, `seconds` old, with a seat left out. */
async function secondPicks(seconds) {
    const pin = await secondQuestion(4, three);
    await lies(pin, three);
    assert.strictEqual(await next(pin), S.ShowAnswers);
    aged(pin, seconds);
    return pin;
}

test('picks: after 10 seconds, the last pick of those who play ends the picking', async () => {
    const pin = await secondPicks(10.1);
    await pick(pin, 'p1');
    await pick(pin, 'p2');
    assert.strictEqual(state(pin), S.ShowAnswers, 'p3 plays and has not picked');
    await pick(pin, 'p3');
    assert.strictEqual(state(pin), S.RevealTheTruth, 'the empty seat is not waited for');
});

test('picks: inside the first 10 seconds the picking stays open, and a late player\'s pick ends it', async () => {
    const pin = await secondPicks(8);
    for (const pid of three) await pick(pin, pid);
    assert.strictEqual(state(pin), S.ShowAnswers, 'not at 8 seconds');
    await pick(pin, 'p4');
    assert.strictEqual(state(pin), S.RevealTheTruth, 'everyone is in');
    assert.deepStrictEqual(game(pin).played, { p1: true, p2: true, p3: true, p4: true }, 'and the late seat counts from now on');
});

test('picks: what is written under the empty seat but is no pick neither brings the seat back nor holds the table', async () => {
    for (const stray of [{ text: '' }, { score: 9000 }, 'x']) {
        const pin = await secondPicks(10.1);
        await pick(pin, 'p4', stray);
        await pick(pin, 'nobody', { text: 'truth1' });
        for (const pid of three) await pick(pin, pid);
        assert.strictEqual(state(pin), S.RevealTheTruth, JSON.stringify(stray));
        assert.deepStrictEqual(game(pin).played, { p1: true, p2: true, p3: true });
    }
    // A player who picks their own lie has not picked: the table waits for a pick that counts.
    const pin = await secondPicks(10.1);
    await pick(pin, 'p1');
    await pick(pin, 'p2');
    await pick(pin, 'p3', { text: 'p3 lie 1' });
    assert.strictEqual(state(pin), S.ShowAnswers);
    await pick(pin, 'p3');
    assert.strictEqual(state(pin), S.RevealTheTruth);
});

/** The reveal of question 2, `seconds` old, with a seat left out; everyone who plays picked the truth. */
async function secondReveal(seconds) {
    const pin = await secondPicks(10.1);
    for (const pid of three) await pick(pin, pid);
    assert.strictEqual(state(pin), S.RevealTheTruth);
    aged(pin, seconds);
    return pin;
}

test('NEXT: after 10 seconds, the taps of those who play end the reveal', async () => {
    const pin = await secondReveal(10.1);
    await tapNext(pin, 'p1');
    await tapNext(pin, 'p2');
    assert.strictEqual(state(pin), S.RevealTheTruth, 'p3 plays and has not tapped');
    await tapNext(pin, 'p3');
    assert.strictEqual(state(pin), S.ScoreBoard, 'the empty seat is not waited for');
});

test('NEXT: inside the first 10 seconds the reveal stays, with a seat left out', async () => {
    const pin = await secondReveal(4);
    for (const pid of three) await tapNext(pin, pid);
    assert.strictEqual(state(pin), S.RevealTheTruth);
});

// ---- the phase timer, on a clock the test moves ----

const flush = async () => { for (let i = 0; i < 20; i++) await new Promise(r => setImmediate(r)); };

/** Start the timer for the current phase, as the state trigger does. Returns its promise. */
function startTimer(pin) {
    const s = game(pin).state;
    s.timestamp = Date.now();
    s.deadline = s.timestamp + (s.id === S.ShowQuestion ? 25000 : 20000);
    return onPhaseStart(pin, clone(s));
}

async function pass(t, ms) {
    t.mock.timers.tick(ms);
    await flush();
}

test('the timer ends the lies at 20 seconds when those who play are in, not at 10', async t => {
    const pin = await secondQuestion(4, three);
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
    const timer = startTimer(pin);
    await lies(pin, three);
    assert.strictEqual(state(pin), S.ShowQuestion, 'the lies themselves do not end it inside the guard');
    await pass(t, 10300);
    assert.strictEqual(state(pin), S.ShowQuestion, 'ten seconds in: still open');
    await pass(t, 9600);
    assert.strictEqual(state(pin), S.ShowQuestion, 'a moment before 20 seconds: still open');
    await pass(t, 400);
    assert.strictEqual(state(pin), S.ShowAnswers, 'at 20 seconds it ends, 5 before the clock');
    await timer;
});

test('the timer ends the picks at 10 seconds when those who play are in', async t => {
    const pin = await secondPicks(0);
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
    const timer = startTimer(pin);
    for (const pid of three) await pick(pin, pid);
    assert.strictEqual(state(pin), S.ShowAnswers);
    await pass(t, 9900);
    assert.strictEqual(state(pin), S.ShowAnswers, 'a moment before 10 seconds: still open');
    await pass(t, 400);
    assert.strictEqual(state(pin), S.RevealTheTruth, 'at 10 seconds it ends, 10 before the clock');
    await timer;
});

test('the timer waits out the clock when someone who plays is not in, and when nobody is left out', async t => {
    const waiting = await secondQuestion(4, three);
    const full = await secondQuestion(3, three);
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
    const timers = [startTimer(waiting), startTimer(full)];
    await lies(waiting, ['p1', 'p2']);
    await lies(full, ['p1', 'p2']);
    await pass(t, 20300);
    assert.strictEqual(state(waiting), S.ShowQuestion);
    assert.strictEqual(state(full), S.ShowQuestion);
    await pass(t, 4800);
    assert.strictEqual(state(waiting), S.ShowAnswers, 'at the clock');
    assert.strictEqual(state(full), S.ShowAnswers);
    await Promise.all(timers);
});

test('the timer goes on to the clock when ending the phase at the guard fails', async t => {
    const pin = await secondQuestion(4, three);
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() });
    const timer = startTimer(pin);
    await lies(pin, three);
    // Moving on fails at the guard: the question cannot be read.
    const question = db.questions.q1;
    delete db.questions.q1;
    await pass(t, 20300);
    assert.strictEqual(state(pin), S.ShowQuestion, 'the game did not move');
    assert.ok(!game(pin).advanceLock, 'and the phase was given back');
    db.questions.q1 = question;
    await pass(t, 4800);
    assert.strictEqual(state(pin), S.ShowAnswers, 'the clock moves it on');
    await timer;
});
