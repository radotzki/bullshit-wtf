// The marks behind the waiting row, as the functions write them: the compiled answer, pick and
// Replay steps (dist/) against an in-memory database. See controllers/sent.ts.
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');

// ---- in-memory Realtime Database (just what the controllers use) ----
const db = {};
let failPlayersUpdate = false;
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
    if (value === null || value === undefined) delete node[parts[parts.length - 1]];
    else node[parts[parts.length - 1]] = JSON.parse(JSON.stringify(value));
}
let pushId = 0;
function ref(parts) {
    return {
        child: (p) => ref(parts.concat(String(p).split('/'))),
        once: async () => ({ val: () => JSON.parse(JSON.stringify(at(parts))) }),
        set: async (v) => put(parts, v),
        update: async (v) => {
            if (failPlayersUpdate && parts[parts.length - 1] === 'players') throw new Error('the database is away');
            Object.keys(v).forEach(k => put(parts.concat(k.split('/')), v[k]));
        },
        push: () => ({ key: 'h' + (++pushId) }),
        orderByChild: () => ({ equalTo: (lang) => ({ once: async () => ({
            val: () => Object.fromEntries(Object.entries(at(parts) || {}).filter(([, q]) => q.lang === lang)),
        }) }) }),
        transaction: (fn, done) => { const v = fn(at(parts)); if (v !== undefined) put(parts, v); done(null, v !== undefined, { val: () => v }); },
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
    dataset() { return { table: () => ({ insert: async () => null }) }; }
}
const realLoad = Module._load;
Module._load = function (request) {
    if (request === '@google-cloud/bigquery') return { BigQuery: FakeBigQuery };
    if (/[\\/]firebase$/.test(request) || request === './../firebase' || request === '../firebase') return fakeFirebase;
    return realLoad.apply(this, arguments);
};

const dist = path.join(__dirname, '..', 'dist', 'controllers');
const { answer } = require(path.join(dist, 'answer'));
const { onAnswerSelection } = require(path.join(dist, 'on-answer-selection'));
const { fork } = require(path.join(dist, 'fork'));

const ShowQuestion = 2, ShowAnswers = 3, RevealTheTruth = 4;
const log = console.log, error = console.error;
console.log = () => {};
console.error = () => {};
test.after(() => { console.log = log; console.error = error; });

function seed(pin, players, extra) {
    db.gameCounter = 100;
    db.questions = { q0: { lang: 'en', questionText: 'What?', realAnswer: 'Truth', fakeAnswers: ['one', 'two', 'three'], citation: '' } };
    db.games = db.games || {};
    const seats = {};
    players.forEach((name, i) => seats['p' + (i + 1)] = { nickname: name, score: 0, uid: 'u' + (i + 1) });
    db.games[pin] = Object.assign({
        timestamp: 1000, locale: 'en', roundIndex: 0, questionIndex: 0, totalQ: 3, qids: ['q0', 'q0', 'q0'],
        state: { id: ShowQuestion, timestamp: 5000, deadline: 30000 }, players: seats, tick: 0, presenter: false,
    }, extra);
    return db.games[pin];
}
const marks = pin => Object.keys(db.games[pin].players).map(pid => db.games[pin].players[pid].sent || null);

test('a lie marks its seat and nobody else; the stored players keep their names and scores', async () => {
    seed('AAAA', ['Dana', 'Chen', 'Ben']);
    await answer('aaaa', 'p2', 'A Lie');
    assert.deepStrictEqual(marks('AAAA'), [null, '2:5000', null]);
    assert.deepStrictEqual(db.games.AAAA.players.p2, { nickname: 'Chen', score: 0, uid: 'u2', sent: '2:5000' });
    assert.strictEqual(db.games.AAAA.answers.p2.text, 'a lie');
    assert.strictEqual(db.games.AAAA.state.id, ShowQuestion, 'two seats are still writing');
});

test('a lie that is refused marks nobody', async () => {
    seed('AAAB', ['Dana', 'Chen']);
    await assert.rejects(answer('AAAB', 'p1', 'truth'), { code: 'CORRECT_ANSWER' });
    await assert.rejects(answer('AAAB', 'stranger', 'x'), { code: 'NOT_A_PLAYER' });
    assert.deepStrictEqual(marks('AAAB'), [null, null]);
    assert.deepStrictEqual(Object.keys(db.games.AAAB.players), ['p1', 'p2'], 'no seat is made for a stranger');
});

test('the last lie still ends the phase at once, and is marked', async () => {
    seed('AAAC', ['Dana', 'Chen']);
    await answer('AAAC', 'p1', 'one lie');
    await answer('AAAC', 'p2', 'other lie');
    assert.strictEqual(db.games.AAAC.state.id, ShowAnswers);
    assert.deepStrictEqual(marks('AAAC'), ['2:5000', '2:5000']);
});

test('a mark that cannot be written fails nothing: the lie is in and the phase ends', async () => {
    seed('AAAD', ['Dana', 'Chen']);
    failPlayersUpdate = true;
    try {
        await answer('AAAD', 'p1', 'one lie');
        await answer('AAAD', 'p2', 'other lie');
    } finally {
        failPlayersUpdate = false;
    }
    assert.deepStrictEqual(marks('AAAD'), [null, null]);
    assert.strictEqual(db.games.AAAD.answers.p1.text, 'one lie');
    assert.strictEqual(db.games.AAAD.state.id, ShowAnswers);
});

test('a pick marks its seat; a stranger\'s pick marks nothing and makes no seat', async () => {
    const table = { truth: { text: 'Truth', houseLie: false, realAnswer: true }, p1: { text: 'one lie', houseLie: false, realAnswer: false } };
    seed('AAAE', ['Dana', 'Chen', 'Ben'], { state: { id: ShowAnswers, timestamp: 9000, deadline: 29000 }, answers: table });
    db.games.AAAE.answerSelections = { p3: { text: 'truth' }, stranger: { text: 'truth' } };
    await onAnswerSelection('AAAE');
    assert.deepStrictEqual(marks('AAAE'), [null, null, '3:9000']);
    assert.deepStrictEqual(Object.keys(db.games.AAAE.players), ['p1', 'p2', 'p3']);
    assert.strictEqual(db.games.AAAE.state.id, ShowAnswers);

    db.games.AAAE.answerSelections.p1 = { text: 'truth' };
    db.games.AAAE.answerSelections.p2 = { text: 'one lie' };
    await onAnswerSelection('AAAE');
    assert.strictEqual(db.games.AAAE.state.id, RevealTheTruth, 'everyone picked: the reveal starts as before');
    assert.deepStrictEqual(marks('AAAE'), ['3:9000', '3:9000', '3:9000']);
});

test('Replay starts with no marks, and leaves the finished game as it was', async () => {
    seed('AAAF', ['Dana', 'Chen']);
    await answer('AAAF', 'p1', 'one lie');
    assert.deepStrictEqual(marks('AAAF'), ['2:5000', null]);
    const { pin } = await fork('AAAF', 'u1');
    assert.deepStrictEqual(marks(pin), [null, null]);
    assert.deepStrictEqual(db.games[pin].players.p1, { nickname: 'Dana', score: 0, uid: 'u1' });
});
