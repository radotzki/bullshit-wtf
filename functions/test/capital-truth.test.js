// A truth written with capital letters ("KFC") must score like any other truth.
// Phones send a pick in lower case ("kfc"); the table holds the truth as the question bank writes
// it. Before this change the two never matched: the player who found the truth got nothing, and the
// reveal showed nobody under the truth.
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
const { isSamePick } = require(path.join(dist, 'same-pick'));

const S = { GameStaging: 0, RoundIntro: 1, ShowQuestion: 2, ShowAnswers: 3, RevealTheTruth: 4, ScoreBoard: 5, ScoreBoardFinal: 6 };
console.log = () => {};

// The repository's own question with a capital truth, as functions/data/opening-questions.json has it.
const opening = require(path.join(__dirname, '..', 'data', 'opening-questions.json'));
const KFC = opening['opener-he-20'];

const ORDINARY = { lang: 'he', questionText: 'An ordinary question has a $blank$', realAnswer: 'plain truth', fakeAnswers: ['house a', 'house b', 'house c'], citation: '' };
// A house lie with capitals: the same mismatch, the other way round.
const CAPITAL_HOUSE_LIE = { lang: 'he', questionText: 'The oldest $blank$ is in Rome', realAnswer: 'fountain', fakeAnswers: ['Burger King'], citation: '' };

let pinCount = 0;
/** A three-question game of three players, standing at the first round intro. */
function newGame(questions) {
    const pin = 'C' + String(++pinCount).padStart(3, '0');
    db.questions = db.questions || {};
    const qids = {};
    questions.forEach((q, i) => {
        qids[i] = `${pin}-q${i}`;
        db.questions[qids[i]] = clone(q);
    });
    const players = {};
    ['p1', 'p2', 'p3'].forEach(pid => players[pid] = { nickname: pid, score: 0, uid: 'u' + pid });
    db.games = db.games || {};
    db.games[pin] = {
        state: { id: S.RoundIntro, timestamp: Date.now() }, locale: 'he', timestamp: Date.now(),
        roundIndex: 0, questionIndex: 0, totalQ: questions.length, qids, tick: 0, presenter: false, players,
    };
    return pin;
}

const game = pin => db.games[pin];
const state = pin => game(pin).state.id;
const scores = pin => Object.fromEntries(Object.keys(game(pin).players).map(pid => [pid, game(pin).players[pid].score]));
const row = (pin, find) => game(pin).revealAnswers.find(find);

/** The phase timer firing: move on from the current phase. */
async function next(pin) {
    await advance(pin, Object.assign({}, game(pin).state));
    return state(pin);
}

/** Round intro to the answers screen, every player having written a lie. */
async function toAnswers(pin) {
    assert.strictEqual(state(pin), S.RoundIntro);
    assert.strictEqual(await next(pin), S.ShowQuestion);
    for (const pid of Object.keys(game(pin).players)) {
        await answer(pin, pid, `${pid} lie`);
    }
    assert.strictEqual(state(pin), S.ShowAnswers, 'everyone answered: the question ends');
}

/**
 * A phone picking the answer it was shown: as the client does, it writes the text in lower case
 * (game/src/app/services/api.service.ts, chooseAnswer), and the trigger runs on the write.
 */
async function pick(pin, pid, shownText) {
    game(pin).answerSelections = game(pin).answerSelections || {};
    game(pin).answerSelections[pid] = { text: shownText.toLowerCase() };
    await onAnswerSelection(pin);
}

/** The answers screen's texts, as the table holds them. */
const table = pin => Object.keys(game(pin).answers).map(k => game(pin).answers[k].text);

test('the repository still has the question this test is about', () => {
    assert.ok(KFC, 'opener-he-20 is in opening-questions.json');
    assert.strictEqual(KFC.realAnswer, 'KFC');
});

test('a pick of a truth written with capitals earns the truth\'s points', async () => {
    const pin = newGame([KFC, ORDINARY, ORDINARY]);
    await toAnswers(pin);

    assert.ok(table(pin).includes('KFC'), 'the table holds the truth as it is written');
    assert.ok(!table(pin).includes('kfc'));

    await pick(pin, 'p1', 'KFC');       // finds the truth
    await pick(pin, 'p2', 'KFC');       // so does p2
    await pick(pin, 'p3', 'p1 lie');    // falls for p1's lie
    assert.strictEqual(state(pin), S.RevealTheTruth, 'everyone picked: picking ends');

    const truth = row(pin, r => r.realAnswer);
    assert.strictEqual(truth.text, 'KFC', 'the reveal shows the truth as it is written');
    assert.deepStrictEqual(truth.selectors.slice().sort(), ['p1', 'p2'], 'with both players who found it under it');
    assert.strictEqual(truth.points, 1000);
    assert.strictEqual(game(pin).answerSelections.p1.score, 1000);
    assert.strictEqual(game(pin).answerSelections.p2.score, 1000);
    assert.strictEqual(game(pin).revealAnswers.filter(r => r.text.toLowerCase() === 'kfc').length, 1, 'one row for the truth, not two');

    const lie = row(pin, r => r.text === 'p1 lie');
    assert.deepStrictEqual(lie.selectors, ['p3']);
    assert.strictEqual(lie.points, 500);

    assert.strictEqual(await next(pin), S.ScoreBoard);
    assert.deepStrictEqual(scores(pin), { p1: 1500, p2: 1000, p3: 0 });
});

test('a whole game with that question, then two ordinary ones, ends with the right scores', async () => {
    const pin = newGame([KFC, ORDINARY, ORDINARY]);

    // Question 1 (round 1), truth "KFC": p1 finds it, p2 falls for p1's lie, p3 for p2's.
    await toAnswers(pin);
    await pick(pin, 'p1', 'KFC');
    await pick(pin, 'p2', 'p1 lie');
    await pick(pin, 'p3', 'p2 lie');
    assert.strictEqual(await next(pin), S.ScoreBoard);
    assert.deepStrictEqual(scores(pin), { p1: 1500, p2: 500, p3: 0 });

    // Questions 2 and 3 (rounds 2 and 3), an ordinary truth: the same picks, as before this change.
    for (const [truthPoints, liePoints] of [[1500, 750], [2000, 1000]]) {
        assert.strictEqual(await next(pin), S.RoundIntro);
        await toAnswers(pin);
        await pick(pin, 'p1', 'plain truth');
        await pick(pin, 'p2', 'p1 lie');
        await pick(pin, 'p3', 'p2 lie');
        const truth = row(pin, r => r.realAnswer);
        assert.deepStrictEqual(truth.selectors, ['p1']);
        assert.strictEqual(truth.points, truthPoints);
        assert.strictEqual(row(pin, r => r.text === 'p1 lie').points, liePoints);
        assert.strictEqual(await next(pin), S.ScoreBoard);
    }

    assert.strictEqual(await next(pin), S.ScoreBoardFinal, 'the game reaches the final scoreboard');
    // p1: the truth each time (1000 + 1500 + 2000) and one player fooled each time (500 + 750 + 1000).
    // p2: one player fooled each time. p3: nothing.
    assert.deepStrictEqual(scores(pin), { p1: 6750, p2: 2250, p3: 0 });
});

test('a lie that is the truth apart from case is still refused, as before', async () => {
    const pin = newGame([KFC, ORDINARY, ORDINARY]);
    await next(pin);
    for (const lie of ['kfc', 'KFC', 'Kfc', ' kfc ']) {
        await assert.rejects(() => answer(pin, 'p1', lie), { code: 'CORRECT_ANSWER' }, `"${lie}" is the truth`);
    }
    assert.strictEqual(game(pin).answers, undefined, 'nothing was put on the table');
});

test('a house lie written with capitals is a house lie when picked', async () => {
    const pin = newGame([ORDINARY, CAPITAL_HOUSE_LIE, ORDINARY]);

    // Question 1: p2 fools p1 and p3, so p2 has 1000 points to lose.
    await toAnswers(pin);
    await pick(pin, 'p1', 'p2 lie');
    await pick(pin, 'p2', 'p1 lie');
    await pick(pin, 'p3', 'p2 lie');
    assert.strictEqual(await next(pin), S.ScoreBoard);
    assert.deepStrictEqual(scores(pin), { p1: 500, p2: 1000, p3: 0 });

    // Question 2 (round 2): p2 falls for "Burger King", which the phone sends as "burger king".
    assert.strictEqual(await next(pin), S.RoundIntro);
    await toAnswers(pin);
    assert.ok(table(pin).includes('Burger King'), 'the table holds the house lie as it is written');
    await pick(pin, 'p1', 'fountain');
    await pick(pin, 'p2', 'Burger King');
    await pick(pin, 'p3', 'fountain');

    const house = row(pin, r => r.houseLie && r.text === 'Burger King');
    assert.deepStrictEqual(house.selectors, ['p2'], 'the reveal shows who fell for it');
    assert.strictEqual(house.points, -375, 'at the price of any other house lie in round 2');
    assert.deepStrictEqual(house.pointsBy, { p2: -375 });
    assert.strictEqual(await next(pin), S.ScoreBoard);
    assert.deepStrictEqual(scores(pin), { p1: 2000, p2: 625, p3: 1500 });
});

test('isSamePick: case is the only difference it forgives', () => {
    assert.strictEqual(isSamePick('KFC', 'kfc'), true);
    assert.strictEqual(isSamePick('kfc', 'kfc'), true);
    assert.strictEqual(isSamePick('סושי', 'סושי'), true);
    assert.strictEqual(isSamePick('İstanbul', 'İstanbul'.toLowerCase()), true, 'a letter that lower case turns into two');
    assert.strictEqual(isSamePick('ΟΔΟΣ', 'ΟΔΟΣ'.toLowerCase()), true, 'a letter whose lower case depends on its place');
    assert.strictEqual(isSamePick('Straße', 'strasse'), false);
    assert.strictEqual(isSamePick('KFC', 'kfc '), false);
    assert.strictEqual(isSamePick('KFC', 'k.f.c'), false);
    assert.strictEqual(isSamePick('', ''), true);
    assert.strictEqual(isSamePick(undefined, 'kfc'), false);
    assert.strictEqual(isSamePick('KFC', undefined), false);
    assert.strictEqual(isSamePick('1', 1), false);
});

// With the stray pick fix (scoring.ts): picks are written by phones, so anything can be under
// answerSelections. Matching without case must not let any of it count.
test('with a capital truth, stray picks still count for nothing', async () => {
    const pin = newGame([KFC, ORDINARY, ORDINARY]);
    await toAnswers(pin);

    // Written straight to the database, not through the game: a pick by somebody who is no player,
    // a pick with no text, and p3 "picking" their own lie in capitals.
    game(pin).answerSelections = {
        ghost: { text: 'kfc', score: 99999 },
        p2: { score: 99999 },
        p3: { text: 'P3 LIE', score: 99999 },
    };
    await pick(pin, 'p1', 'KFC');
    assert.strictEqual(state(pin), S.ShowAnswers, 'p2 and p3 have not picked: picking goes on');
    assert.strictEqual(await next(pin), S.RevealTheTruth, 'the deadline ends picking');

    const truth = row(pin, r => r.realAnswer);
    assert.deepStrictEqual(truth.selectors, ['p1'], 'only the player who found the truth is under it');
    assert.strictEqual(truth.points, 1000);
    const own = row(pin, r => r.text === 'p3 lie');
    assert.deepStrictEqual(own.selectors, [], 'a player\'s own lie, in any case, is no pick');
    assert.strictEqual(own.points, 0, 'and earns its writer nothing');
    assert.deepStrictEqual(Object.keys(game(pin).answerSelections), ['p1'], 'only the pick that counts is kept');

    assert.strictEqual(await next(pin), S.ScoreBoard);
    assert.deepStrictEqual(scores(pin), { p1: 1000, p2: 0, p3: 0 });
});
