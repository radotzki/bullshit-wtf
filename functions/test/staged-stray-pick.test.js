// Where the staged reveal meets the rule for which picks count: whole staged games, played on the
// compiled functions (dist/) against an in-memory database, in which the picks node also holds
// things that are no player's pick. And the staged game's scoreboard step, which lasts 0 ms and is
// left in the same run: what happens when that second step fails.
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
// Faults a test switches on: how many of the next history writes fail, and every state a game was in.
const faults = { historyWrites: 0 };
const history = [];
const states = {};
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
            if (parts[0] === 'qHistory') {
                if (faults.historyWrites > 0) { faults.historyWrites--; return Promise.reject(new Error('history write failed')); }
                history.push(clone(v));
            }
            const key = 'k' + (++pushId);
            if (v !== undefined) put(parts.concat(key), v);
            return { key };
        },
        // As the real client does it: the function first runs on what the client holds locally, which
        // is nothing (null), whatever the server holds. Returning undefined stops there, and the server
        // is never asked. Otherwise the server is asked, and if it holds something else the function
        // runs again on that.
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
const { advance } = require(path.join(dist, 'controllers', 'tick'));
const { answer } = require(path.join(dist, 'controllers', 'answer'));
const { onAnswerSelection } = require(path.join(dist, 'controllers', 'on-answer-selection'));
const { onPhaseStart } = require(path.join(dist, 'controllers', 'phase-timer'));
const { revealScoreChanges, revealStandings, revealSchedule } = require(path.join(dist, 'game-model'));

const S = { GameStaging: 0, RoundIntro: 1, ShowQuestion: 2, ShowAnswers: 3, RevealTheTruth: 4, ScoreBoard: 5, ScoreBoardFinal: 6 };
const TOTAL_Q = 5;
console.log = () => {};
console.error = () => {};

let pinCount = 0;
function newGame(bigReveal) {
    const pin = 'G' + String(++pinCount).padStart(3, '0');
    db.questions = db.questions || {};
    const qids = {};
    for (let i = 0; i < TOTAL_Q; i++) {
        qids[i] = `q${i}`;
        db.questions[`q${i}`] = { lang: 'en', questionText: `Question ${i} has a ___`, realAnswer: `truth${i}`, fakeAnswers: ['house a', 'house b', 'house c'], citation: '' };
    }
    const players = {};
    ['p1', 'p2', 'p3'].forEach(pid => players[pid] = { nickname: pid, score: 0, uid: 'u' + pid });
    db.games = db.games || {};
    db.games[pin] = Object.assign({
        state: { id: S.GameStaging, timestamp: Date.now() }, locale: 'en', timestamp: Date.now(),
        roundIndex: 0, questionIndex: 0, totalQ: TOTAL_Q, qids, tick: 0, presenter: false, players,
    }, bigReveal === undefined ? {} : { bigReveal });
    states[pin] = [S.GameStaging];
    return pin;
}

const game = pin => db.games[pin];
const state = pin => game(pin).state.id;

/** The phase timer firing: move on from the current phase. `retryAfter` shortens the wait of a second try. */
async function next(pin, retryAfter = 20) {
    await advance(pin, Object.assign({}, game(pin).state), retryAfter);
    return state(pin);
}

/** Timer after timer until the game is in `want`. A game that does not get there fails the test; it does not hang it. */
async function until(pin, want, onQuestion) {
    for (let i = 0; state(pin) !== want; i++) {
        assert.ok(i < 12, `the game is stuck in state ${state(pin)}, lock ${game(pin).advanceLock}`);
        if (onQuestion && state(pin) === S.ShowQuestion) await onQuestion(); else await next(pin);
    }
}
const lies = pin => async () => { for (const pid of ['p1', 'p2', 'p3']) await answer(pin, pid, `${pid} lie`); };

async function write(pin, pid, value) {
    game(pin).answerSelections = game(pin).answerSelections || {};
    game(pin).answerSelections[pid] = clone(value);
    await onAnswerSelection(pin);
}

/**
 * The players, to compare between two games: without the waiting row's mark (players/<pid>/sent, see
 * sent.ts). The mark holds the phase's start time, which no two games share, and nothing reads it.
 */
function seats(pin) {
    const players = clone(game(pin).players);
    Object.keys(players).forEach(pid => delete players[pid].sent);
    return players;
}

const strays = {
    ghost: q => ({ text: `truth${q}` }),
    constructor: q => ({ text: `p1 lie ${q}` }),
    '-Nstray': () => ({ text: 'house a', score: 999999 }),
    nobody: q => `truth${q}`,
};

/**
 * A whole game of five questions. In each: p1 finds the truth, p2 falls for p1's lie, p3 falls for a
 * house lie. With `stray`, the picks node also gets picks that are no player's, before and between
 * the real ones. `eachReveal(pin, q, before)` looks at the game while the reveal is on.
 */
async function wholeGame(bigReveal, stray, eachReveal, afterReveal) {
    const pin = newGame(bigReveal);
    const reveals = [];
    for (let q = 0; q < TOTAL_Q; q++) {
        await until(pin, S.ShowQuestion);
        for (const pid of ['p1', 'p2', 'p3']) await answer(pin, pid, `${pid} lie ${q}`);
        assert.strictEqual(state(pin), S.ShowAnswers, 'everyone answered: the question ends');
        const house = Object.keys(game(pin).answers).map(k => game(pin).answers[k]).find(a => a.houseLie).text;
        if (stray) for (const id of ['ghost', 'constructor']) await write(pin, id, strays[id](q));
        await write(pin, 'p1', { text: `truth${q}` });
        await write(pin, 'p2', { text: `p1 lie ${q}` });
        if (stray) for (const id of ['-Nstray', 'nobody']) await write(pin, id, id === '-Nstray' ? { text: house, score: 999999 } : strays[id](q));
        assert.strictEqual(state(pin), S.ShowAnswers, 'stray picks do not end the picking');
        await write(pin, 'p3', { text: house });
        assert.strictEqual(state(pin), S.RevealTheTruth, 'the last real pick ends it');

        const before = seats(pin);
        reveals.push({ rows: clone(game(pin).revealAnswers), before, shape: shape(game(pin).revealAnswers) });
        if (eachReveal) eachReveal(pin, q, before);
        // A stray pick written during the reveal counts for nothing either.
        if (stray) await write(pin, 'ghost', { text: `truth${q}`, score: 5000 });
        await (afterReveal ? afterReveal(pin, q) : next(pin));
        reveals[q].after = seats(pin);
    }
    await until(pin, S.ScoreBoardFinal);
    const scores = {};
    Object.keys(game(pin).players).forEach(pid => scores[pid] = game(pin).players[pid].score);
    return { pin, scores, reveals, states: states[pin].slice(), shapes: reveals.map(r => ({ rows: r.shape, before: r.before, after: r.after })) };
}

/** The reveal rows without the house lies' texts, which are drawn by chance: what can be compared between two games. */
function shape(rows) {
    return rows.map(r => Object.assign({}, r, r.houseLie ? { text: 'a house lie' } : {}))
        .sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1);
}

// Every phase of a five-question game, once, in order.
const question = [S.ShowQuestion, S.ShowAnswers, S.RevealTheTruth, S.ScoreBoard];
const phases = [S.GameStaging, S.RoundIntro].concat(question, question, S.RoundIntro, question, question, S.RoundIntro, question, S.ScoreBoardFinal);

test('a staged game with stray picks reaches the final scoreboard with the scores of a clean one', async () => {
    const clean = await wholeGame(true, false);
    const stray = await wholeGame(true, true);
    assert.deepStrictEqual(stray.scores, clean.scores);
    assert.deepStrictEqual(stray.shapes, clean.shapes, 'the same rows, and the same scores before and after each reveal');
    assert.deepStrictEqual(stray.states, phases, 'each phase once');
    assert.deepStrictEqual(clean.states, phases);
    assert.ok(clean.scores.p1 > 0 && clean.scores.p1 > clean.scores.p2);
});

test('both arms and a game outside the test score a stray-pick game alike', async () => {
    const staged = await wholeGame(true, true);
    const control = await wholeGame(false, true);
    const outside = await wholeGame(undefined, true);
    assert.deepStrictEqual(control.scores, staged.scores);
    assert.deepStrictEqual(outside.scores, staged.scores);
    assert.deepStrictEqual(control.shapes, staged.shapes);
    assert.deepStrictEqual(outside.shapes, staged.shapes);
    assert.deepStrictEqual(control.states, phases);
});

test('the rows a staged reveal plays hold only real picks, and the score changes it shows are the ones added', async () => {
    const players = ['p1', 'p2', 'p3'];
    const { reveals } = await wholeGame(true, true, (pin, q) => {
        const g = game(pin);
        assert.deepStrictEqual(Object.keys(g.answerSelections).sort(), players, 'only the players\' picks are kept');
        g.revealAnswers.forEach(row => {
            row.selectors.concat(Object.keys(row.pointsBy || {})).forEach(pid => assert.ok(players.includes(pid), `${pid} in a row`));
        });
        // One beat per row with a pick, as the phones play it: a stray pick adds no row to the staging.
        assert.strictEqual(g.revealAnswers.filter(r => r.selectors.length).length, 3, `question ${q}: truth, p1's lie, a house lie`);
        assert.strictEqual(g.state.deadline - g.state.timestamp, revealSchedule(g.revealAnswers, false, true).duration);
    });
    reveals.forEach(({ rows, before, after }, q) => {
        const changes = revealScoreChanges(rows);
        assert.deepStrictEqual(Object.keys(changes).filter(pid => !players.includes(pid)), []);
        players.forEach(pid => assert.strictEqual(before[pid].score + (changes[pid] || 0), after[pid].score, `question ${q}, ${pid}`));
        // The scores folded into the reveal, on a phone that reads them before and after the server adds them.
        assert.deepStrictEqual(revealStandings(after, changes, true), revealStandings(before, changes));
    });
});

test('the staged scoreboard is left in the same run; the control one waits for its timer', async () => {
    const staged = newGame(true);
    await until(staged, S.RevealTheTruth, lies(staged));
    assert.strictEqual(await next(staged), S.ShowQuestion, 'one call: the scoreboard and on to the next question');
    assert.deepStrictEqual(states[staged].slice(-3), [S.RevealTheTruth, S.ScoreBoard, S.ShowQuestion]);

    const control = newGame(false);
    await until(control, S.RevealTheTruth, lies(control));
    assert.strictEqual(await next(control), S.ScoreBoard);
    assert.strictEqual(game(control).state.deadline - game(control).state.timestamp, 3000);
});

test('leaving the staged scoreboard fails once: the run tries again itself, and each phase still plays once', async () => {
    history.length = 0;
    // The timer's own way in: the reveal ends, the scores are added, and the step after fails once.
    const played = await wholeGame(true, true, null, async (pin, q) => {
        if (q === 2) faults.historyWrites = 1;
        const from = Object.assign({}, game(pin).state, { deadline: Date.now() });
        await onPhaseStart(pin, from, Date.now(), 20);
    });
    assert.strictEqual(faults.historyWrites, 0, 'the fault was hit');
    assert.deepStrictEqual(played.states, phases, 'no phase twice, none skipped');
    const clean = await wholeGame(true, false);
    assert.deepStrictEqual(played.scores, clean.scores, 'no question scored twice');
    assert.deepStrictEqual(played.shapes, clean.shapes);
});

test('leaving the staged scoreboard fails twice: the reveal\'s own step is not reported as failed, and a later call moves on', async () => {
    const pin = newGame(true);
    await until(pin, S.ShowAnswers, lies(pin));
    await write(pin, 'p1', { text: 'truth0' });
    await write(pin, 'ghost', { text: 'truth0' });
    assert.strictEqual(await next(pin), S.RevealTheTruth);
    faults.historyWrites = 2;
    assert.strictEqual(await next(pin), S.ScoreBoard, 'the call does not throw: the game did leave the reveal');
    assert.strictEqual(faults.historyWrites, 0);
    assert.ok(!game(pin).advanceLock, 'the scoreboard phase is given back');
    assert.strictEqual(game(pin).players.p1.score, 1000, 'the scores were added once');
    // A phone's own timer, or the timer function for the scoreboard phase.
    assert.strictEqual(await next(pin), S.ShowQuestion);
    assert.strictEqual(game(pin).players.p1.score, 1000);
    assert.deepStrictEqual(states[pin].slice(-3), [S.RevealTheTruth, S.ScoreBoard, S.ShowQuestion]);
});

test('a failure of the reveal\'s own step is still passed on, and the phase given back', async () => {
    const scoring = require(path.join(dist, 'controllers', 'scoring'));
    const pin = newGame(true);
    await until(pin, S.ShowAnswers, lies(pin));
    const real = scoring.scoreQuestion;
    scoring.scoreQuestion = () => { throw new Error('boom'); };
    try {
        await assert.rejects(next(pin));
    } finally {
        scoring.scoreQuestion = real;
    }
    assert.strictEqual(state(pin), S.ShowAnswers);
    assert.ok(!game(pin).advanceLock);
    assert.strictEqual(await next(pin), S.RevealTheTruth);
});

test('a phase given back is free on the server, though the database client starts from nothing', async () => {
    const pin = newGame(true);
    await next(pin);
    assert.strictEqual(state(pin), S.RoundIntro);
    const questions = db.questions;
    db.questions = null; // the question cannot be read
    await assert.rejects(next(pin));
    assert.strictEqual(state(pin), S.RoundIntro, 'the game has not moved');
    assert.ok(!game(pin).advanceLock, 'the phase is not left taken');
    db.questions = questions;
    // A phase that someone else holds is not given away by a caller that has moved on.
    game(pin).advanceLock = 'held by another';
    const { advance: again } = require(path.join(dist, 'controllers', 'tick'));
    await again(pin, { id: S.GameStaging, timestamp: 1 });
    assert.strictEqual(game(pin).advanceLock, 'held by another');
    delete game(pin).advanceLock;
    assert.strictEqual(await next(pin), S.ShowQuestion, 'a later call moves it on');
});
