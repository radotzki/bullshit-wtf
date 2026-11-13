// The taste: a host who starts alone gets five pick-only questions in place of a whole game
// (src/controllers/taste.ts). A game of two or more players, and a game on a big screen, play
// exactly as before.
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
        // Returning undefined aborts, as in the real database.
        transaction: (fn, done) => {
            const v = fn(clone(at(parts)));
            if (v === undefined) return done(null, false, { val: () => clone(at(parts)) });
            put(parts, v);
            done(null, true, { val: () => clone(at(parts)) });
        },
        orderByChild: () => ({ equalTo: (lang) => ({ once: async () => ({
            val: () => Object.fromEntries(Object.entries(at(parts) || {}).filter(([, q]) => q.lang === lang)),
        }) }) }),
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

// ---- fake BigQuery: records every insert ----
const rows = [];
class FakeBigQuery {
    dataset() { return { table: (table) => ({ insert: async (row) => rows.push({ table, row }) }) }; }
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
const { join } = require(path.join(dist, 'join'));
const { fork } = require(path.join(dist, 'fork'));
const { onAnswerSelection } = require(path.join(dist, 'on-answer-selection'));
const { onStateChange } = require(path.join(dist, 'analytics'));
const taste = require(path.join(dist, 'taste'));
const { tasteOf, TASTE_QUESTIONS, TASTE_OPTIONS } = require(path.join(__dirname, '..', 'dist', 'game-model'));

const S = { GameStaging: 0, RoundIntro: 1, ShowQuestion: 2, ShowAnswers: 3, RevealTheTruth: 4, ScoreBoard: 5, ScoreBoardFinal: 6 };
console.log = () => {};
console.error = () => {};

/** Twenty questions, each with five house lies, so no game runs short. */
function seedQuestions() {
    db.gameCounter = db.gameCounter || 100;
    db.questions = {};
    for (let i = 0; i < 20; i++) {
        db.questions['q' + i] = {
            lang: 'en', questionText: `Question ${i} has a $blank$`, realAnswer: `truth ${i}`,
            fakeAnswers: [1, 2, 3, 4, 5].map(n => `lie ${i}.${n}`), citation: '',
        };
    }
}

let pinCount = 0;
/** A lobby of `names`, of the length the host chose, as newGame and join leave it. */
function lobby(names, totalQ = 9, over = {}) {
    seedQuestions();
    const pin = 'T' + String(++pinCount).padStart(3, '0');
    const players = {};
    names.forEach((nickname, i) => players['p' + (i + 1)] = Object.assign({ nickname, score: 0, uid: 'u-' + pin + i }, i === 0 ? { host: true } : {}));
    const qids = {};
    for (let i = 0; i < totalQ; i++) qids[i] = 'q' + i;
    db.games = db.games || {};
    db.games[pin] = Object.assign({
        state: { id: S.GameStaging, timestamp: Date.now() }, locale: 'en', timestamp: Date.now(),
        roundIndex: 0, questionIndex: 0, totalQ, qids, tick: 0, presenter: false, players, origin: 'create',
    }, over);
    return pin;
}

const game = pin => db.games[pin];
const state = pin => game(pin).state.id;

/** The phase timer firing (or START, from the lobby): move on from the current phase. */
async function next(pin) {
    await advance(pin, Object.assign({}, game(pin).state));
    // As the gameState trigger does on every state: the usage rows.
    await onStateChange(pin);
    return state(pin);
}

/** A phone picking: it writes the text in lower case, and the trigger runs on the write. */
async function pick(pin, pid, text) {
    game(pin).answerSelections = game(pin).answerSelections || {};
    game(pin).answerSelections[pid] = { text: text.toLowerCase() };
    await onAnswerSelection(pin);
    await onStateChange(pin);
}

const answersOf = pin => Object.keys(game(pin).answers || {}).map(k => game(pin).answers[k]);
const truthOf = pin => answersOf(pin).find(a => a.realAnswer).text;
const houseLieOf = pin => answersOf(pin).find(a => a.houseLie).text;

/**
 * Plays a taste from its lobby to the final screen. `picks[i]` says what the player does on
 * question i: 'truth', 'lie' or 'none'. Returns every state the game passed through.
 */
async function playTaste(pin, picks) {
    const seen = [];
    const step = async (move) => { const id = await move(); seen.push(id); return id; };
    await step(() => next(pin));                                     // START
    while (state(pin) !== S.ScoreBoardFinal) {
        const id = state(pin);
        if (id === S.ShowAnswers) {
            const what = picks[game(pin).questionIndex];
            if (what === 'none') {
                await step(() => next(pin));                         // the 20 second clock
            } else {
                await pick(pin, 'p1', what === 'truth' ? truthOf(pin) : houseLieOf(pin));
                seen.push(state(pin));
            }
        } else {
            await step(() => next(pin));
        }
        assert.ok(seen.length < 80, 'the game ends');
    }
    return seen;
}

test('pure: what starts as a taste', () => {
    const one = { players: { a: {} }, presenter: false };
    assert.strictEqual(taste.startsAsTaste(one), true);
    assert.strictEqual(taste.startsAsTaste({ players: { a: {}, b: {} }, presenter: false }), false, 'two players');
    assert.strictEqual(taste.startsAsTaste({ players: { a: {} }, presenter: true }), false, 'a big screen');
    assert.strictEqual(taste.startsAsTaste({ players: {} }), false, 'nobody');
    assert.strictEqual(taste.startsAsTaste(null), false);
    assert.deepStrictEqual(taste.newTaste({ totalQ: 9 }), { found: 0, length: 9 });
    assert.deepStrictEqual(taste.newTaste({}), { found: 0, length: TASTE_QUESTIONS });
});

test('pure: three house lies, never the truth, never one twice', () => {
    const lies = taste.tasteHouseLies(['a', 'B', 'b ', 'Truth', 'c', 'd', ''], 'truth');
    assert.strictEqual(lies.length, TASTE_OPTIONS - 1);
    assert.strictEqual(new Set(lies.map(l => l.trim().toLowerCase())).size, lies.length);
    assert.ok(!lies.some(l => l.toLowerCase() === 'truth'));
    assert.deepStrictEqual(taste.tasteHouseLies(['only'], 'truth'), ['only'], 'a question short of lies gives what it has');
    assert.deepStrictEqual(taste.tasteHouseLies(null, 'truth'), []);
});

test('pure: a truth counts as found only when somebody picked it', () => {
    const row = (realAnswer, selectors) => ({ text: 'x', realAnswer, houseLie: !realAnswer, selectors, creators: [''], points: 0 });
    assert.strictEqual(taste.truthFound([row(false, []), row(true, ['p1'])]), true);
    assert.strictEqual(taste.truthFound([row(false, ['p1']), row(true, [])]), false);
    assert.strictEqual(taste.truthFound(null), false);
    assert.deepStrictEqual(taste.nextTaste({ found: 1, length: 7 }, { revealAnswers: [row(true, ['p1'])] }), { found: 2, length: 7 });
    assert.deepStrictEqual(taste.nextTaste({ found: 1, length: 7 }, { state: { id: 5, timestamp: 1 } }), { found: 1, length: 7 });
});

test('a host who starts alone gets five pick-only questions, and never the writing screen', async () => {
    rows.length = 0;
    const pin = lobby(['dana'], 9);
    const seen = await playTaste(pin, ['truth', 'lie', 'truth', 'none', 'truth']);

    assert.ok(seen.indexOf(S.ShowQuestion) < 0, 'no writing');
    assert.strictEqual(seen.filter(id => id === S.ShowAnswers).length, 5, 'five questions');
    assert.strictEqual(seen.filter(id => id === S.RevealTheTruth).length, 5);
    assert.strictEqual(seen.filter(id => id === S.RoundIntro).length, 3, 'the three round cards of a five-question game');
    assert.strictEqual(game(pin).totalQ, TASTE_QUESTIONS);
    assert.deepStrictEqual(tasteOf(game(pin).state), { found: 3, length: 9 }, 'three truths found; the chosen length is kept');
    // 1000 for the truth in round 1, 1500 in round 2 and 2000 in round 3; the house lie on question 2 takes 250 back.
    assert.strictEqual(game(pin).players.p1.score, 1000 - 250 + 1500 + 2000);

    // The usage rows tell a taste from a table: one player, five questions, no lie.
    const opened = rows.filter(r => r.table === 'opened_games' && r.row.id === pin);
    const closed = rows.filter(r => r.table === 'closed_games' && r.row.id === pin);
    const questions = rows.filter(r => r.table === 'question_results' && r.row.id === pin).map(r => r.row);
    assert.strictEqual(opened.length, 1);
    assert.strictEqual(closed.length, 1);
    assert.deepStrictEqual([opened[0].row.players, opened[0].row.questions], [1, 5]);
    assert.deepStrictEqual([closed[0].row.players, closed[0].row.questions], [1, 5]);
    assert.deepStrictEqual(questions.map(q => q.q_index), [0, 1, 2, 3, 4]);
    assert.ok(questions.every(q => q.players === 1 && q.lies === 0 && q.total_q === 5));
    assert.deepStrictEqual(questions.map(q => q.picks), [1, 1, 1, 0, 1]);
});

test('every state of a taste carries it, each question shows the truth among three house lies', async () => {
    const pin = lobby(['dana'], 7);
    assert.strictEqual(tasteOf(game(pin).state), null, 'not in the lobby: a friend may still join');

    assert.strictEqual(await next(pin), S.RoundIntro);
    assert.deepStrictEqual(game(pin).state.taste, { found: 0, length: 7 });
    assert.strictEqual(Object.keys(game(pin).qids).length, TASTE_QUESTIONS);
    assert.ok(game(pin).state.deadline > game(pin).state.timestamp, 'the round card keeps its clock');

    assert.strictEqual(await next(pin), S.ShowAnswers);
    assert.deepStrictEqual(game(pin).state.taste, { found: 0, length: 7 });
    assert.strictEqual(game(pin).state.deadline - game(pin).state.timestamp, 20000, 'picking keeps its 20 seconds');
    assert.strictEqual(typeof game(pin).currentQ, 'string');
    const answers = answersOf(pin);
    assert.strictEqual(answers.length, TASTE_OPTIONS);
    assert.strictEqual(answers.filter(a => a.realAnswer).length, 1);
    assert.strictEqual(answers.filter(a => a.houseLie).length, TASTE_OPTIONS - 1);
    assert.strictEqual(game(pin).answerSelections, undefined, 'no pick is left from before');
    assert.strictEqual(game(pin).ideas, undefined, 'no lie helper: nothing is written');

    // The one player picks: the question ends at once, as it does when a whole table has picked.
    await pick(pin, 'p1', truthOf(pin));
    assert.strictEqual(state(pin), S.RevealTheTruth);
    assert.deepStrictEqual(game(pin).state.taste, { found: 1, length: 7 });
    assert.strictEqual(await next(pin), S.ScoreBoard);
    assert.strictEqual(game(pin).players.p1.score, 1000);

    // Question 2 is in the same round: straight to its answers, with a new question and new answers.
    const first = game(pin).currentQ;
    assert.strictEqual(await next(pin), S.ShowAnswers);
    assert.strictEqual(game(pin).questionIndex, 1);
    assert.notStrictEqual(game(pin).currentQ, first);
    assert.strictEqual(answersOf(pin).length, TASTE_OPTIONS);
    assert.strictEqual(game(pin).revealAnswers, undefined);
    assert.deepStrictEqual(game(pin).state.taste, { found: 1, length: 7 });
});

test('a lone player who picks nothing: the taste runs on its clocks to the end', async () => {
    const pin = lobby(['dana'], 5);
    const seen = await playTaste(pin, ['none', 'none', 'none', 'none', 'none']);
    assert.ok(seen.indexOf(S.ShowQuestion) < 0);
    assert.deepStrictEqual(tasteOf(game(pin).state), { found: 0, length: 5 });
    assert.strictEqual(game(pin).players.p1.score, 0);
});

test('a lobby that a second player joined before START is a whole game, untouched', async () => {
    const pin = lobby(['dana'], 9);
    await join(pin, 'ben', 'u-ben');
    assert.strictEqual(Object.keys(game(pin).players).length, 2);

    assert.strictEqual(await next(pin), S.RoundIntro);
    assert.strictEqual('taste' in game(pin).state, false);
    assert.strictEqual(game(pin).totalQ, 9);
    assert.strictEqual(Object.keys(game(pin).qids).length, 9);
    assert.strictEqual(await next(pin), S.ShowQuestion, 'the writing screen, as before');
    assert.strictEqual('taste' in game(pin).state, false);
    assert.strictEqual(game(pin).answers, undefined);

    for (const pid of Object.keys(game(pin).players)) {
        await answer(pin, pid, `${pid} lie`);
    }
    assert.strictEqual(state(pin), S.ShowAnswers);
    // Two lies, the truth, and house lies up to six answers, as before.
    assert.strictEqual(answersOf(pin).length, 6);
    assert.strictEqual('taste' in game(pin).state, false);
});

test('a game of two plays every step as before, to the final screen', async () => {
    const pin = lobby(['dana', 'ben'], 5);
    const seen = [];
    seen.push(await next(pin));
    while (state(pin) !== S.ScoreBoardFinal) {
        if (state(pin) === S.ShowQuestion) {
            for (const pid of Object.keys(game(pin).players)) await answer(pin, pid, `${pid} lie ${game(pin).questionIndex}`);
            seen.push(state(pin));
        } else if (state(pin) === S.ShowAnswers) {
            for (const pid of Object.keys(game(pin).players)) await pick(pin, pid, truthOf(pin));
            seen.push(state(pin));
        } else {
            seen.push(await next(pin));
        }
        assert.strictEqual('taste' in game(pin).state, false);
    }
    const Q = [S.ShowQuestion, S.ShowAnswers, S.RevealTheTruth, S.ScoreBoard];
    assert.deepStrictEqual(seen, [].concat(
        [S.RoundIntro], Q, Q, [S.RoundIntro], Q, Q, [S.RoundIntro], Q, [S.ScoreBoardFinal]));
    assert.strictEqual(game(pin).totalQ, 5);
    assert.deepStrictEqual(Object.keys(game(pin).players).map(p => game(pin).players[p].score), [7000, 7000]);
});

test('one player with a big screen is a whole game: the room is watching', async () => {
    const pin = lobby(['dana'], 7, { presenter: true });
    assert.strictEqual(await next(pin), S.RoundIntro);
    assert.strictEqual('taste' in game(pin).state, false);
    assert.strictEqual(game(pin).totalQ, 7);
    assert.strictEqual(await next(pin), S.ShowQuestion);
});

test('a friend who joins a running taste picks too, and the game stays pick-only', async () => {
    const pin = lobby(['dana'], 9);
    await next(pin);
    await next(pin);
    assert.strictEqual(state(pin), S.ShowAnswers);
    const { pid } = await join(pin, 'ben', 'u-ben');
    await pick(pin, 'p1', truthOf(pin));
    assert.strictEqual(state(pin), S.ShowAnswers, 'question 1 waits for every seat, as in any game');
    await pick(pin, pid, houseLieOf(pin));
    assert.strictEqual(state(pin), S.RevealTheTruth);
    assert.deepStrictEqual(game(pin).state.taste, { found: 1, length: 9 });
    await next(pin);
    assert.strictEqual(await next(pin), S.ShowAnswers, 'still no writing');
    assert.strictEqual(game(pin).players.p1.score, 1000);
    assert.strictEqual(game(pin).players[pid].score, 0);
});

test('Replay after a taste makes a whole game of the length the host chose, in its lobby', async () => {
    const pin = lobby(['dana'], 9);
    await playTaste(pin, ['truth', 'truth', 'truth', 'truth', 'truth']);
    assert.deepStrictEqual(tasteOf(game(pin).state), { found: 5, length: 9 });

    const made = await fork(pin, game(pin).players.p1.uid, 'p1', 'K'.repeat(24));
    const replay = game(made.pin);
    assert.strictEqual(replay.state.id, S.GameStaging);
    assert.strictEqual('taste' in replay.state, false, 'a lobby: friends may join, and then it is a whole game');
    assert.strictEqual(replay.totalQ, 9);
    assert.strictEqual(Object.keys(replay.qids).length, 9);
    assert.strictEqual(replay.parent, pin);
    assert.strictEqual(replay.origin, 'replay');
    assert.strictEqual(replay.players.p1.score, 0);
    assert.strictEqual(game(pin).totalQ, TASTE_QUESTIONS, 'the finished taste is left as it was');

    // With a friend in, it starts as a whole game of nine.
    await join(made.pin, 'ben', 'u-ben');
    assert.strictEqual(await next(made.pin), S.RoundIntro);
    assert.strictEqual('taste' in game(made.pin).state, false);
    assert.strictEqual(game(made.pin).totalQ, 9);
    assert.strictEqual(await next(made.pin), S.ShowQuestion);
});

test('Replay after a taste, started alone again, is a taste again', async () => {
    const pin = lobby(['dana'], 7);
    await playTaste(pin, ['lie', 'lie', 'lie', 'lie', 'lie']);
    const made = await fork(pin, game(pin).players.p1.uid, 'p1', 'K'.repeat(24));
    assert.strictEqual(await next(made.pin), S.RoundIntro);
    assert.deepStrictEqual(game(made.pin).state.taste, { found: 0, length: 7 }, 'the chosen length is still kept');
    assert.strictEqual(game(made.pin).totalQ, TASTE_QUESTIONS);
});

test('Replay of a whole game keeps its length, as before', async () => {
    const pin = lobby(['dana', 'ben'], 7);
    game(pin).state = { id: S.ScoreBoardFinal, timestamp: Date.now() };
    const made = await fork(pin, 'u-x', 'p1', 'K'.repeat(24));
    assert.strictEqual(game(made.pin).totalQ, 7);
    assert.strictEqual(Object.keys(game(made.pin).qids).length, 7);
    assert.strictEqual(taste.replayLength({ totalQ: 5, state: { id: 6, timestamp: 1 } }), 5);
});

test('a question with a single house lie still plays in a taste', async () => {
    const pin = lobby(['dana'], 5);
    Object.keys(db.questions).forEach(id => db.questions[id].fakeAnswers = ['the one lie']);
    await next(pin);
    assert.strictEqual(await next(pin), S.ShowAnswers);
    assert.strictEqual(answersOf(pin).length, 2);
    await pick(pin, 'p1', truthOf(pin));
    assert.strictEqual(state(pin), S.RevealTheTruth);
});
