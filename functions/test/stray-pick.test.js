// Picks are the one part of a game that phones write themselves. These tests play whole games in
// which that node holds things that are not a player's pick, and check that the game still reaches
// the final scoreboard with the scores it would have had without them.
// Runs the compiled functions (dist/) against an in-memory database and a fake BigQuery, so it
// needs no Firebase project or credentials:
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

const S = { GameStaging: 0, RoundIntro: 1, ShowQuestion: 2, ShowAnswers: 3, RevealTheTruth: 4, ScoreBoard: 5, ScoreBoardFinal: 6 };
const TOTAL_Q = 3;
console.log = () => {};
console.error = () => {};

let pinCount = 0;
function newGame(playerIds = ['p1', 'p2', 'p3']) {
    const pin = 'T' + String(++pinCount).padStart(3, '0');
    db.questions = db.questions || {};
    const qids = {};
    for (let i = 0; i < TOTAL_Q; i++) {
        qids[i] = `q${i}`;
        db.questions[`q${i}`] = { lang: 'en', questionText: `Question ${i} has a ___`, realAnswer: `truth${i}`, fakeAnswers: ['house a', 'house b', 'house c'], citation: '' };
    }
    const players = {};
    playerIds.forEach(pid => players[pid] = { nickname: pid, score: 0, uid: 'u' + pid });
    db.games = db.games || {};
    db.games[pin] = {
        state: { id: S.GameStaging, timestamp: Date.now() }, locale: 'en', timestamp: Date.now(),
        roundIndex: 0, questionIndex: 0, totalQ: TOTAL_Q, qids, tick: 0, presenter: false, players,
    };
    return pin;
}

const game = pin => db.games[pin];
const stateKeyOf = s => `${s.id}:${s.timestamp}`;
const state = pin => game(pin).state.id;

/** The phase timer firing: move on from the current phase. */
async function next(pin) {
    const before = game(pin).state;
    await advance(pin, Object.assign({}, before));
    return state(pin);
}

/** A phone writing straight to the picks node, then the trigger that runs on every such write. */
async function write(pin, pid, value) {
    game(pin).answerSelections = game(pin).answerSelections || {};
    game(pin).answerSelections[pid] = clone(value);
    await onAnswerSelection(pin);
}

/** Staging to the answers screen of the first question, every player having written a lie. */
async function toAnswers(pin, lies) {
    if (state(pin) === S.GameStaging) await next(pin);
    if (state(pin) === S.RoundIntro) await next(pin);
    assert.strictEqual(state(pin), S.ShowQuestion);
    const pids = Object.keys(game(pin).players);
    for (const pid of pids) {
        await answer(pin, pid, lies && lies[pid] !== undefined ? lies[pid] : `${pid} lie ${game(pin).questionIndex}`);
    }
    assert.strictEqual(state(pin), S.ShowAnswers, 'everyone answered: the question ends');
}

/** Reveal and scoreboard, to whatever comes after (the next question's round intro, or the end). */
async function toNextQuestion(pin) {
    if (state(pin) === S.ShowAnswers) await next(pin);
    assert.strictEqual(state(pin), S.RevealTheTruth);
    assert.strictEqual(await next(pin), S.ScoreBoard, 'the reveal ends on the scoreboard');
    return next(pin);
}

/**
 * A whole game of three questions. In each: p1 finds the truth, p2 falls for p1's lie, p3 falls for
 * p2's lie. `stray(pin, q)` may write anything else to the picks node while picks are open.
 */
async function wholeGame(stray) {
    const pin = newGame();
    for (let q = 0; q < TOTAL_Q; q++) {
        await toAnswers(pin);
        if (stray) await stray(pin, q, 'before');
        await write(pin, 'p1', { text: `truth${q}` });
        await write(pin, 'p2', { text: `p1 lie ${q}` });
        if (stray) await stray(pin, q, 'during');
        await write(pin, 'p3', { text: `p2 lie ${q}`, score: 999999 });
        if (state(pin) === S.ShowAnswers) await next(pin);
        if (stray) await stray(pin, q, 'reveal');
        await toNextQuestion(pin);
    }
    assert.strictEqual(state(pin), S.ScoreBoardFinal, 'the game reaches the final scoreboard');
    const scores = {};
    Object.keys(game(pin).players).forEach(pid => scores[pid] = game(pin).players[pid].score);
    return { pin, scores };
}

// Round 1 is question 0, round 2 is question 1, round 3 is question 2.
// p1: the truth each time (1000 + 1500 + 2000) and one player fooled each time (500 + 750 + 1000).
// p2: one player fooled each time. p3: nothing.
const CLEAN = { p1: 6750, p2: 2250, p3: 0 };

test('a clean game scores as expected', async () => {
    const { scores } = await wholeGame();
    assert.deepStrictEqual(scores, CLEAN);
});

test('a pick that is not a player\'s: the game plays to the final scoreboard, scores unchanged', async () => {
    const { pin, scores } = await wholeGame(async (p, q, when) => {
        if (when === 'during') await write(p, 'nobody', { text: `p3 lie ${q}` });
    });
    assert.deepStrictEqual(scores, CLEAN, 'the pick gave nobody points');
    assert.deepStrictEqual(Object.keys(game(pin).players).sort(), ['p1', 'p2', 'p3'], 'and made nobody a player');
});

test('such a pick is in no reveal row and is not kept', async () => {
    const pin = newGame();
    await toAnswers(pin);
    await write(pin, 'nobody', { text: 'p1 lie 0' });
    await write(pin, 'p2', { text: 'p1 lie 0' });
    assert.strictEqual(await next(pin), S.RevealTheTruth);
    const row = game(pin).revealAnswers.find(r => r.text === 'p1 lie 0');
    assert.deepStrictEqual(row.selectors, ['p2']);
    assert.strictEqual(row.points, 500, 'one player fooled, not two');
    assert.deepStrictEqual(Object.keys(game(pin).answerSelections), ['p2']);
    assert.strictEqual(game(pin).highlights.p1.fooled, 1);
});

test('ids that every object has ("constructor", "toString", "__proto__") are not players', async () => {
    const { scores } = await wholeGame(async (p, q, when) => {
        if (when !== 'during') return;
        for (const id of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
            await write(p, id, { text: `p3 lie ${q}` });
        }
    });
    assert.deepStrictEqual(scores, CLEAN);
});

test('a pick that is not shaped like a pick is no pick, whoever it is from', async () => {
    for (const junk of ['truth0', 7, true, { text: 5 }, { text: { a: 1 } }, { nope: 'x' }, ['truth0'], { text: '' }]) {
        const pin = newGame();
        await toAnswers(pin);
        await write(pin, 'p1', { text: 'truth0' });
        await write(pin, 'p2', junk);
        await write(pin, 'p3', { text: 'p2 lie 0' });
        await write(pin, 'nobody', junk);
        assert.strictEqual(state(pin), S.ShowAnswers, `${JSON.stringify(junk)}: p2 has not picked, so the phase waits`);
        await toNextQuestion(pin);
        assert.deepStrictEqual(
            [game(pin).players.p1.score, game(pin).players.p2.score, game(pin).players.p3.score], [1000, 500, 0],
            `${JSON.stringify(junk)}: the others score as usual`);
    }
});

test('a pick of a text that is not on the table scores nothing and stops nothing', async () => {
    const pin = newGame();
    await toAnswers(pin);
    await write(pin, 'p1', { text: 'not an answer' });
    await write(pin, 'p2', { text: 'truth0' });
    await write(pin, 'p3', { text: 'truth0' });
    assert.strictEqual(state(pin), S.RevealTheTruth, 'it counts as that player having picked');
    await toNextQuestion(pin);
    assert.deepStrictEqual([game(pin).players.p1.score, game(pin).players.p2.score, game(pin).players.p3.score], [0, 1000, 1000]);
});

test('a pick of one\'s own lie earns nothing', async () => {
    const pin = newGame();
    await toAnswers(pin);
    await write(pin, 'p1', { text: 'p1 lie 0' });
    await write(pin, 'p2', { text: 'truth0' });
    await write(pin, 'p3', { text: 'truth0' });
    if (state(pin) === S.ShowAnswers) await next(pin);
    const row = game(pin).revealAnswers.find(r => r.text === 'p1 lie 0');
    assert.strictEqual(row.points, 0);
    assert.ok(!row.selectors || !row.selectors.length);
    await toNextQuestion(pin);
    assert.strictEqual(game(pin).players.p1.score, 0);
});

test('two players wrote the same lie: neither can score by picking it, a third player still can be fooled', async () => {
    const pin = newGame();
    await toAnswers(pin, { p1: 'same lie', p2: 'same lie' });
    await write(pin, 'p1', { text: 'same lie' });
    await write(pin, 'p2', { text: 'truth0' });
    await write(pin, 'p3', { text: 'same lie' });
    if (state(pin) === S.ShowAnswers) await next(pin);
    await toNextQuestion(pin);
    assert.deepStrictEqual([game(pin).players.p1.score, game(pin).players.p2.score, game(pin).players.p3.score], [500, 1500, 0]);
});

test('a pick cannot carry its own points, when it is written or after the points are counted', async () => {
    const { scores } = await wholeGame(async (p, q, when) => {
        if (when === 'during') await write(p, 'nobody', { text: `truth${q}`, score: 999999 });
        if (when === 'reveal') {
            await write(p, 'p3', { text: `truth${q}`, score: 999999 });
            await write(p, 'p2', { text: `truth${q}`, score: 'lots' });
            await write(p, 'nobody', { text: `truth${q}`, score: 999999 });
        }
    });
    assert.deepStrictEqual(scores, CLEAN);
});

test('picks that are not a player\'s neither end the picking early nor keep it open', async () => {
    const pin = newGame();
    await toAnswers(pin);
    await write(pin, 'p1', { text: 'truth0' });
    await write(pin, 'ghost1', { text: 'truth0' });
    await write(pin, 'ghost2', { text: 'truth0' });
    assert.strictEqual(state(pin), S.ShowAnswers, 'three picks, but only one player has picked');
    await write(pin, 'p2', { text: 'truth0' });
    await write(pin, 'p3', { text: 'truth0' });
    assert.strictEqual(state(pin), S.RevealTheTruth, 'every player has picked: the phase ends');
});

test('a lie is taken only from a player, and only while the question is open', async () => {
    const pin = newGame();
    await next(pin);
    await next(pin);
    await assert.rejects(answer(pin, 'nobody', 'a lie'), e => e.code === 'NOT_A_PLAYER');
    await assert.rejects(answer(pin, 'truth', 'a lie'), e => e.code === 'NOT_A_PLAYER');
    await assert.rejects(answer(pin, 'constructor', 'a lie'), e => e.code === 'NOT_A_PLAYER');
    assert.ok(!game(pin).answers, 'nothing was stored');

    // One player sending twice is still one player: the question stays open for the others.
    await answer(pin, 'p1', 'first');
    await answer(pin, 'p1', 'second');
    await answer(pin, 'p1', 'third');
    assert.strictEqual(state(pin), S.ShowQuestion);
    await answer(pin, 'p2', 'p2 lie');
    await answer(pin, 'p3', 'p3 lie');
    assert.strictEqual(state(pin), S.ShowAnswers);

    // The answers are on the table now: no lie can be changed, and the truth cannot be replaced.
    // (A late lie is dropped quietly: the phone is already on the next screen.)
    await answer(pin, 'p1', 'changed my mind');
    await assert.rejects(answer(pin, 'truth', 'not the truth'), e => e.code === 'NOT_A_PLAYER');
    assert.strictEqual(state(pin), S.ShowAnswers);
    assert.strictEqual(game(pin).answers.p1.text, 'third');
    assert.strictEqual(game(pin).answers.truth.text, 'truth0');
});

test('lies left under an id that is no player\'s (a game from before this check) do not stop the scores', async () => {
    const pin = newGame();
    await toAnswers(pin);
    game(pin).answers.nobody = { text: 'old lie', houseLie: false, realAnswer: false };
    await write(pin, 'p1', { text: 'old lie' });
    await write(pin, 'p2', { text: 'truth0' });
    await write(pin, 'p3', { text: 'truth0' });
    if (state(pin) === S.ShowAnswers) await next(pin);
    assert.strictEqual(await toNextQuestion(pin), S.RoundIntro);
    assert.deepStrictEqual(Object.keys(game(pin).players).sort(), ['p1', 'p2', 'p3']);
});

test('if working out the points fails, the game still moves on and the question scores nothing', async () => {
    const scoring = require(path.join(dist, 'scoring'));
    const real = { scoreQuestion: scoring.scoreQuestion, addQuestionScores: scoring.addQuestionScores };
    const pin = newGame();
    await toAnswers(pin);
    await write(pin, 'p1', { text: 'truth0' });
    try {
        let calls = 0;
        // Fails on the picks as they are; works with no picks at all.
        scoring.scoreQuestion = g => { calls++; if (g.answerSelections) throw new Error('boom'); return real.scoreQuestion(g); };
        assert.strictEqual(await next(pin), S.RevealTheTruth, 'picking still ends');
        assert.strictEqual(calls, 2);
        assert.ok(game(pin).revealAnswers.some(r => r.realAnswer), 'the truth is still revealed');

        scoring.addQuestionScores = () => { throw new Error('boom'); };
        assert.strictEqual(await next(pin), S.ScoreBoard, 'the reveal still ends');
        assert.deepStrictEqual(Object.keys(game(pin).players).map(k => game(pin).players[k].score), [0, 0, 0]);
    } finally {
        Object.assign(scoring, real);
    }
    assert.strictEqual(await next(pin), S.RoundIntro, 'and the game goes on');
});

test('a step that fails without a way round gives the phase back, so the next call can do it', async () => {
    const pin = newGame();
    await next(pin);
    assert.strictEqual(state(pin), S.RoundIntro);
    const questions = db.questions;
    db.questions = null; // the question cannot be read
    await assert.rejects(next(pin));
    assert.strictEqual(state(pin), S.RoundIntro, 'the game has not moved');
    assert.ok(!game(pin).advanceLock, 'and the phase is not left taken');
    db.questions = questions;
    assert.strictEqual(await next(pin), S.ShowQuestion, 'a later call moves it on');
});

test('a phase given back is free on the server, though the database client starts from nothing', async () => {
    const pin = newGame();
    await next(pin);
    const questions = db.questions;
    db.questions = null; // the question cannot be read
    await assert.rejects(next(pin));
    assert.strictEqual(state(pin), S.RoundIntro, 'the game has not moved');
    assert.ok(!game(pin).advanceLock, 'the phase is not left taken');
    db.questions = questions;
    // A phase that someone else holds is not given away by a caller that has moved on.
    game(pin).advanceLock = 'held by another';
    await advance(pin, { id: S.GameStaging, timestamp: 1 });
    assert.strictEqual(game(pin).advanceLock, 'held by another');
    delete game(pin).advanceLock;
    assert.strictEqual(await next(pin), S.ShowQuestion, 'a later call moves it on');
});

test('a whole game in which one step fails in every phase still reaches the final scoreboard', async () => {
    const pin = newGame();
    const realChild = fakeFirebase.gamesRef.child;
    const failed = {};
    // The first write that would move the game out of each phase is refused, once.
    fakeFirebase.gamesRef.child = p => {
        const r = realChild(p);
        const update = r.update;
        r.update = async v => {
            const from = game(pin) && stateKeyOf(game(pin).state);
            if (String(p) === pin && v && v.state && !failed[from]) { failed[from] = true; throw new Error('write refused'); }
            return update(v);
        };
        return r;
    };
    try {
        let refused = 0;
        for (let i = 0; state(pin) !== S.ScoreBoardFinal; i++) {
            assert.ok(i < 60, `the game is stuck in state ${state(pin)}, lock ${game(pin).advanceLock}`);
            if (state(pin) === S.ShowQuestion && !game(pin).answers) {
                // The last lie ends the question; that step is refused too, and the timer then does it.
                for (const pid of ['p1', 'p2', 'p3']) await answer(pin, pid, `${pid} lie`).catch(() => {});
                continue;
            }
            await next(pin).catch(() => { refused++; });
        }
        assert.ok(refused >= 3 * TOTAL_Q, `steps did fail on the way (${refused})`);
    } finally {
        fakeFirebase.gamesRef.child = realChild;
    }
    assert.strictEqual(state(pin), S.ScoreBoardFinal);
});

test('the phase timer tries once more when moving on fails', async () => {
    const { onPhaseStart } = require(path.join(dist, 'phase-timer'));
    const pin = newGame();
    await next(pin);
    const questions = db.questions;
    db.questions = null;
    setTimeout(() => { db.questions = questions; }, 50);
    await onPhaseStart(pin, Object.assign({}, game(pin).state, { deadline: Date.now() }), Date.now(), 200);
    assert.strictEqual(state(pin), S.ShowQuestion);
});
