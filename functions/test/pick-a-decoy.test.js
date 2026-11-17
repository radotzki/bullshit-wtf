// "Pick a decoy" (src/controllers/pair.ts): the pure parts, and whole two-player games played through
// the compiled functions (dist/) against an in-memory database and a fake BigQuery, so it needs no
// Firebase project or credentials:
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

// Rows written to BigQuery, by table.
const inserted = {};
class FakeBigQuery {
    dataset() {
        return { table: (name) => ({ insert: async (rows) => { inserted[name] = (inserted[name] || []).concat(rows); } }) };
    }
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
const { pairHalf, drawPair, chooseDecoy, matchOffer, pairDecoys, DECOY_POINTS } = require(path.join(dist, 'pair'));
const { questionResult } = require(path.join(dist, 'lie-helper'));
const { scoreQuestion, addQuestionScores } = require(path.join(dist, 'scoring'));
const { addHighlights, isPlayerLie, isLie, revealScoreChanges } = require(path.join(__dirname, '..', 'dist', 'game-model'));

const S = { GameStaging: 0, RoundIntro: 1, ShowQuestion: 2, ShowAnswers: 3, RevealTheTruth: 4, ScoreBoard: 5, ScoreBoardFinal: 6 };
const TOTAL_Q = 3;
console.log = () => {};
console.error = () => {};

// PINs in each half, found once.
const PINS = { true: [], false: [] };
for (let i = 0; PINS.true.length < 40 || PINS.false.length < 40; i++) {
    const pin = 'D' + i.toString(36).toUpperCase().padStart(3, '0');
    PINS[pairHalf(pin)].push(pin);
}

function newGame(half, playerIds = ['p1', 'p2'], extra = {}) {
    const pin = PINS[half].shift();
    db.questions = db.questions || {};
    const qids = {};
    for (let i = 0; i < TOTAL_Q; i++) {
        qids[i] = `q${i}`;
        db.questions[`q${i}`] = {
            lang: 'en', questionText: `Question ${i} has a ___`, realAnswer: `Truth${i}`,
            fakeAnswers: ['House A', 'House B', 'House C', 'House D'], citation: '',
        };
    }
    const players = {};
    playerIds.forEach(pid => players[pid] = { nickname: pid, score: 0, uid: 'u' + pid });
    db.games = db.games || {};
    db.games[pin] = Object.assign({
        state: { id: S.GameStaging, timestamp: Date.now() }, locale: 'en', timestamp: Date.now(),
        roundIndex: 0, questionIndex: 0, totalQ: TOTAL_Q, qids, tick: 0, presenter: false, players, coach: true,
    }, extra);
    return pin;
}

const game = pin => db.games[pin];
const state = pin => game(pin).state.id;

async function next(pin) {
    await advance(pin, Object.assign({}, game(pin).state));
    return state(pin);
}

async function pick(pin, pid, text) {
    game(pin).answerSelections = game(pin).answerSelections || {};
    game(pin).answerSelections[pid] = { text: text.toLowerCase() };
    await onAnswerSelection(pin);
}

/** To the writing screen of the current question. */
async function toQuestion(pin) {
    if (state(pin) === S.GameStaging) await next(pin);
    if (state(pin) === S.RoundIntro) await next(pin);
    assert.strictEqual(state(pin), S.ShowQuestion);
}

const decoyOf = (pin, pid) => {
    const answers = game(pin).answers;
    return Object.keys(answers).map(k => answers[k]).filter(a => a.decoyOf === pid);
};
const rowsFor = pin => (inserted.question_results || []).filter(r => r.id === pin);

// ---- the pure parts ----

test('the half follows from the PIN alone, about half and half, independent of the staged reveal', () => {
    const { stagedHalf } = require(path.join(dist, 'big-reveal'));
    let pair = 0;
    let both = 0;
    for (let i = 0; i < 4000; i++) {
        const pin = 'P' + i.toString(36).toUpperCase();
        assert.strictEqual(pairHalf(pin), pairHalf(pin.toLowerCase()));
        if (pairHalf(pin)) pair++;
        if (pairHalf(pin) && stagedHalf(pin)) both++;
    }
    assert.ok(pair > 1850 && pair < 2150, `${pair} of 4000`);
    assert.ok(both > 900 && both < 1100, `${both} of 4000 in both`);
});

test('only a table of exactly two is in the test; a Replay keeps its parent\'s half', () => {
    const t = PINS.true[0];
    const f = PINS.false[0];
    assert.strictEqual(drawPair(1, t), undefined);
    assert.strictEqual(drawPair(3, t), undefined);
    assert.strictEqual(drawPair(8, f, true), undefined, 'a Replay of a pair game that grew to 8 is not in the test');
    assert.strictEqual(drawPair(2, t), true);
    assert.strictEqual(drawPair(2, f), false);
    assert.strictEqual(drawPair(2, t, false), false);
    assert.strictEqual(drawPair(2, f, true), true);
    assert.strictEqual(drawPair(2, f, null), false, 'a parent not in the test: drawn afresh');
});

test('the chosen decoy is kept only while it is one of the offers and free', () => {
    const offers = ['House A', 'House B'];
    assert.strictEqual(chooseDecoy(offers, 'house b', ['lie', 'Truth']), 'House B', 'as offered, whatever the case sent');
    assert.strictEqual(chooseDecoy(offers, 'House B', ['house b', 'Truth'], () => 0), 'House A', 'a lie took its text');
    assert.strictEqual(chooseDecoy(offers, 'Something else', [], () => 0.99), 'House B', 'not an offer: one at random');
    assert.strictEqual(chooseDecoy(offers, null, [], () => 0), 'House A', 'none chosen: one at random');
    assert.strictEqual(chooseDecoy(offers, 'House A', ['HOUSE A ', 'house b']), null, 'nothing free');
    assert.strictEqual(chooseDecoy([], 'House A', []), null);
    assert.strictEqual(chooseDecoy(undefined, undefined, []), null);
    assert.strictEqual(matchOffer(offers, '  HOUSE a '), 'House A');
    assert.strictEqual(matchOffer(offers, 5), null);
});

test('pairDecoys: one decoy per player with offers, writer or not, never the text of a lie, the truth or the other decoy', () => {
    let n = 0;
    const g = {
        players: { p1: {}, p2: {} },
        answers: { p1: { text: 'house b', houseLie: false, realAnswer: false }, p2: { text: 'my lie', houseLie: false, realAnswer: false } },
        ideas: { p1: ['House A', 'House B'], p2: ['House C', 'House D'] },
        decoys: { p1: 'House B', p2: 'House D' },
    };
    const res = pairDecoys(g, 'Truth', () => 'd' + (++n), () => 0);
    assert.deepStrictEqual(res, {
        d1: { text: 'House A', houseLie: false, realAnswer: false, decoyOf: 'p1' },
        d2: { text: 'House D', houseLie: false, realAnswer: false, decoyOf: 'p2' },
    });
    assert.strictEqual(pairDecoys(Object.assign({}, g, { answers: {} }), 'Truth', () => 'x'), null, 'nobody wrote: no decoys');
    const one = pairDecoys(Object.assign({}, g, { ideas: { p2: ['House C'] } }), 'Truth', () => 'k');
    assert.deepStrictEqual(Object.keys(one).map(k => one[k].decoyOf), ['p2'], 'p1 had no offers: no decoy');
    let m = 0;
    const lone = pairDecoys(Object.assign({}, g, { answers: { p1: g.answers.p1 }, decoys: {} }), 'Truth', () => 'w' + (++m), () => 0);
    assert.deepStrictEqual(lone, {
        w1: { text: 'House A', houseLie: false, realAnswer: false, decoyOf: 'p1' },
        w2: { text: 'House C', houseLie: false, realAnswer: false, decoyOf: 'p2' },
    }, 'only p1 wrote: p2 gets a decoy too');
});

test('scoring: a decoy that fools pays half a lie to its chooser and costs the picker nothing', () => {
    [0, 1, 2].forEach(round => {
        const g = {
            roundIndex: round, state: { id: S.ShowAnswers },
            players: { p1: { score: 100 }, p2: { score: 100 } },
            answers: {
                p1: { text: 'lie one', houseLie: false, realAnswer: false },
                p2: { text: 'lie two', houseLie: false, realAnswer: false },
                d1: { text: 'House A', houseLie: false, realAnswer: false, decoyOf: 'p1' },
                d2: { text: 'House C', houseLie: false, realAnswer: false, decoyOf: 'p2' },
                truth: { text: 'Truth', houseLie: false, realAnswer: true },
            },
            answerSelections: { p1: { text: 'house c' }, p2: { text: 'lie one' } },
        };
        const scored = scoreQuestion(g);
        assert.strictEqual(scored.answerSelections.p1.score, 0);
        const decoyRow = scored.revealAnswers.find(r => r.text === 'House C');
        assert.deepStrictEqual(decoyRow.creators, ['p2']);
        assert.deepStrictEqual(decoyRow.selectors, ['p1']);
        assert.strictEqual(decoyRow.decoy, true);
        assert.strictEqual(decoyRow.points, DECOY_POINTS[round]);
        assert.ok(!scored.revealAnswers.find(r => r.text === 'lie one').decoy);
        const players = addQuestionScores(Object.assign({}, g, scored));
        assert.strictEqual(players.p1.score, 100 + [500, 750, 1000][round], 'p1: their lie fooled p2');
        assert.strictEqual(players.p2.score, 100 + DECOY_POINTS[round], 'p2: their decoy fooled p1');
        assert.deepStrictEqual(revealScoreChanges(scored.revealAnswers), { p1: [500, 750, 1000][round], p2: DECOY_POINTS[round] },
            'the staged reveal\'s score changes agree');
        // A decoy is no written lie: no best lie, no funniest lie; it still takes laughs.
        assert.strictEqual(isPlayerLie(decoyRow), false);
        assert.strictEqual(isLie(decoyRow), true);
        const highlights = addHighlights({}, scored.revealAnswers, 'q');
        assert.deepStrictEqual(Object.keys(highlights), ['p1']);
    });
});

test('scoring: a pick of one\'s own decoy (a phone on an older build) counts for nothing', () => {
    const g = {
        roundIndex: 0, state: { id: S.RevealTheTruth },
        players: { p1: { score: 0 }, p2: { score: 0 } },
        answers: {
            p1: { text: 'lie one', houseLie: false, realAnswer: false },
            d1: { text: 'House A', houseLie: false, realAnswer: false, decoyOf: 'p1' },
            truth: { text: 'Truth', houseLie: false, realAnswer: true },
        },
        answerSelections: { p1: { text: 'house a' }, p2: { text: 'truth' } },
    };
    const scored = scoreQuestion(g);
    assert.deepStrictEqual(Object.keys(scored.answerSelections), ['p2']);
    const row = scored.revealAnswers.find(r => r.text === 'House A');
    assert.deepStrictEqual(row.selectors, []);
    assert.strictEqual(row.points, 0);
    const players = addQuestionScores(Object.assign({}, g, scored));
    assert.deepStrictEqual([players.p1.score, players.p2.score], [0, 1000]);
});

test('question_results: pair and decoy_picks; lies, friend_fooled and house_picks leave decoys out', () => {
    const g = {
        pair: true, roundIndex: 0, questionIndex: 0, totalQ: 3, players: { p1: {}, p2: {} },
        answers: {
            p1: { text: 'lie one', houseLie: false, realAnswer: false },
            p2: { text: 'lie two', houseLie: false, realAnswer: false },
            d1: { text: 'House A', houseLie: false, realAnswer: false, decoyOf: 'p1' },
            d2: { text: 'House C', houseLie: false, realAnswer: false, decoyOf: 'p2' },
            truth: { text: 'Truth', houseLie: false, realAnswer: true },
        },
        answerSelections: { p1: { text: 'house c' }, p2: { text: 'truth' } },
    };
    const row = questionResult('X', g);
    assert.strictEqual(row.pair, true);
    assert.strictEqual(row.decoy_picks, 1);
    assert.strictEqual(row.lies, 2);
    assert.strictEqual(row.friend_fooled, 0);
    assert.strictEqual(row.house_picks, 0);
    assert.strictEqual(row.truth_picks, 1);
    assert.strictEqual(row.unpicked_lies, 2);
    assert.strictEqual(questionResult('X', Object.assign({}, g, { pair: false })).pair, false);
    assert.strictEqual(questionResult('X', Object.assign({}, g, { pair: undefined })).pair, null);
});

// ---- whole games ----

test('a two-player game in the decoy half: three answers a phone, decoys score, the data says so', async () => {
    const pin = newGame(true);
    await next(pin);
    assert.strictEqual(game(pin).pair, true, 'set at START');

    for (let q = 0; q < TOTAL_Q; q++) {
        await toQuestion(pin);
        const ideas = game(pin).ideas;
        assert.ok(ideas && ideas.p1 && ideas.p2, `question ${q}: offers on every question, rounds 2 and 3 too`);
        assert.strictEqual(ideas.p1.length, 2);
        assert.strictEqual(ideas.p2.length, 2);
        assert.strictEqual(new Set(ideas.p1.concat(ideas.p2)).size, 4, 'never offered to both');

        await answer(pin, 'p1', `p1 lie ${q}`, ideas.p1[1]);
        await answer(pin, 'p2', `p2 lie ${q}`);  // an older phone: no decoy sent
        assert.strictEqual(state(pin), S.ShowAnswers);
        assert.ok(!game(pin).decoys, 'the choices are cleared once they are on the table');

        const answers = game(pin).answers;
        const list = Object.keys(answers).map(k => answers[k]);
        assert.strictEqual(list.filter(a => a.houseLie).length, 0, 'no neutral house lies');
        assert.strictEqual(list.length, 5, 'two lies, two decoys, the truth');
        assert.deepStrictEqual(decoyOf(pin, 'p1').map(a => a.text), [ideas.p1[1]], 'p1\'s choice');
        assert.ok(ideas.p2.indexOf(decoyOf(pin, 'p2')[0].text) >= 0, 'p2 got one of their offers');
        // What each phone lists: everything but its own lie and its own decoy.
        const seen = pid => list.filter(a => a.decoyOf !== pid && a !== answers[pid]);
        assert.strictEqual(seen('p1').length, 3);
        assert.strictEqual(seen('p2').length, 3);

        await pick(pin, 'p1', decoyOf(pin, 'p2')[0].text);
        await pick(pin, 'p2', `p1 lie ${q}`);
        assert.strictEqual(state(pin), S.RevealTheTruth);
        const decoyRow = game(pin).revealAnswers.find(r => r.decoy && r.creators[0] === 'p2');
        assert.deepStrictEqual(decoyRow.selectors, ['p1']);
        assert.strictEqual(game(pin).revealAnswers.find(r => r.decoy && r.creators[0] === 'p1').points, 0);
        assert.strictEqual(decoyRow.points, DECOY_POINTS[game(pin).roundIndex]);
        assert.strictEqual(await next(pin), S.ScoreBoard);
        await next(pin);
    }
    assert.strictEqual(state(pin), S.ScoreBoardFinal);
    assert.deepStrictEqual(
        [game(pin).players.p1.score, game(pin).players.p2.score],
        [500 + 750 + 1000, 250 + 375 + 500]);
    assert.deepStrictEqual(Object.keys(game(pin).highlights), ['p1'], 'decoys make no best lie');
    const rows = rowsFor(pin);
    assert.strictEqual(rows.length, TOTAL_Q);
    rows.forEach(r => {
        assert.strictEqual(r.pair, true);
        assert.strictEqual(r.decoy_picks, 1);
        assert.strictEqual(r.friend_fooled, 1);
        assert.strictEqual(r.house_picks, 0);
        assert.strictEqual(r.lies, 2);
    });
});

test('a chosen decoy is kept only if it was offered to that player and is not their own lie', async () => {
    const pin = newGame(true);
    await toQuestion(pin);
    const ideas = game(pin).ideas;
    const chosen = () => (game(pin).decoys || {}).p1;
    await answer(pin, 'p1', 'my lie', ideas.p2[0]);  // the friend's offer: not taken
    assert.strictEqual(chosen(), undefined);
    await answer(pin, 'p1', ideas.p1[0], ideas.p1[0]);  // STUCK? put the offer in the box: not a decoy
    assert.strictEqual(chosen(), undefined);
    await answer(pin, 'p1', 'my lie', ideas.p1[0].toUpperCase());
    assert.deepStrictEqual(game(pin).decoys, { p1: ideas.p1[0] });
    await answer(pin, 'p2', 'p2 lie');
    assert.deepStrictEqual(decoyOf(pin, 'p1').map(a => a.text), [ideas.p1[0]]);
});

test('one writer: both players still get a decoy, so the writer has a real choice; if nobody wrote, the house lies come back', async () => {
    const pin = newGame(true);
    await toQuestion(pin);
    const ideas = game(pin).ideas;
    await answer(pin, 'p1', 'only lie');
    assert.strictEqual(await next(pin), S.ShowAnswers);
    const answers = game(pin).answers;
    let list = Object.keys(answers).map(k => answers[k]);
    assert.deepStrictEqual(list.filter(a => a.decoyOf).map(a => a.decoyOf).sort(), ['p1', 'p2'], 'the friend who wrote nothing has a decoy too');
    assert.ok(ideas.p2.indexOf(decoyOf(pin, 'p2')[0].text) >= 0, 'one of p2\'s offers');
    assert.strictEqual(list.filter(a => a.houseLie).length, 0);
    // What each phone lists: everything but its own lie and its own decoy.
    const seen = pid => list.filter(a => a.decoyOf !== pid && a !== answers[pid]).map(a => a.text).sort();
    assert.deepStrictEqual(seen('p1'), [decoyOf(pin, 'p2')[0].text, 'Truth0'].sort(), 'the writer sees the truth and the friend\'s decoy');
    assert.strictEqual(seen('p2').length, 3, 'the friend sees the lie, the writer\'s decoy and the truth');

    await pick(pin, 'p1', decoyOf(pin, 'p2')[0].text);
    await pick(pin, 'p2', 'truth0');
    assert.strictEqual(state(pin), S.RevealTheTruth);
    const decoyRow = game(pin).revealAnswers.find(r => r.decoy && r.creators[0] === 'p2');
    assert.deepStrictEqual(decoyRow.selectors, ['p1']);
    assert.strictEqual(decoyRow.points, DECOY_POINTS[0]);
    await next(pin);
    await next(pin);
    assert.deepStrictEqual([game(pin).players.p1.score, game(pin).players.p2.score], [0, 1000 + DECOY_POINTS[0]], 'p2 found the truth and their decoy paid; p1 lost nothing');
    const row = rowsFor(pin)[0];
    assert.strictEqual(row.decoy_picks, 1, 'the writer fell for the friend\'s decoy');
    assert.strictEqual(row.lies, 1);
    assert.strictEqual(row.house_picks, 0);

    const empty = newGame(true);
    await toQuestion(empty);
    assert.strictEqual(await next(empty), S.ShowAnswers);
    list = Object.values(game(empty).answers);
    assert.ok(list.filter(a => a.houseLie).length >= 2, 'house lies as in any game');
    assert.strictEqual(list.filter(a => a.decoyOf).length, 0);
});

test('a two-player game in the other half plays as before', async () => {
    const pin = newGame(false);
    await next(pin);
    assert.strictEqual(game(pin).pair, false);
    await toQuestion(pin);
    await answer(pin, 'p1', 'p1 lie', 'House A');
    await answer(pin, 'p2', 'p2 lie');
    assert.ok(!game(pin).decoys);
    const list = Object.values(game(pin).answers);
    assert.strictEqual(list.filter(a => a.decoyOf).length, 0);
    assert.ok(list.filter(a => a.houseLie).length >= 1, 'house lies as today');
    await pick(pin, 'p1', 'truth0');
    await pick(pin, 'p2', 'truth0');
    await next(pin);
    await next(pin);
    assert.strictEqual(state(pin), S.RoundIntro);
    await next(pin);
    assert.ok(!game(pin).ideas, 'round 2: no ideas, as before');
    assert.strictEqual(rowsFor(pin)[0].pair, false);
    assert.strictEqual(rowsFor(pin)[0].decoy_picks, 0);
});

test('three players: not in the test, nothing changes', async () => {
    const pin = newGame(true, ['p1', 'p2', 'p3']);
    await next(pin);
    assert.strictEqual(game(pin).pair, undefined);
    await toQuestion(pin);
    for (const pid of ['p1', 'p2', 'p3']) await answer(pin, pid, `${pid} lie`, 'House A');
    assert.ok(!game(pin).decoys);
    const list = Object.values(game(pin).answers);
    assert.strictEqual(list.filter(a => a.decoyOf).length, 0);
    assert.ok(list.filter(a => a.houseLie).length >= 1);
    await pick(pin, 'p1', 'truth0');
    await pick(pin, 'p2', 'truth0');
    await pick(pin, 'p3', 'truth0');
    await next(pin);
    await next(pin);
    assert.strictEqual(rowsFor(pin)[0].pair, null);
});

test('a Replay with two players keeps its parent\'s half', async () => {
    const parentF = newGame(false);
    game(parentF).pair = false;
    const replay = newGame(true, ['p1', 'p2'], { parent: parentF });
    await next(replay);
    assert.strictEqual(game(replay).pair, false, 'kept, though its own PIN is in the decoy half');

    const parentNone = newGame(true, ['p1', 'p2', 'p3']);
    const replay2 = newGame(false, ['p1', 'p2'], { parent: parentNone });
    await next(replay2);
    assert.strictEqual(game(replay2).pair, false, 'a parent not in the test: its own PIN decides');
});
