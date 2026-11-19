// Latecomers: a phone that joins a game after START gets a seat from the next question (join.ts,
// lateStart in game-model), at the lowest score at the table, and is not waited for until then (seats.ts).
// Runs the compiled functions against an in-memory database and a fake BigQuery:
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
const { advance, scoresOnly } = require(path.join(dist, 'tick'));
const { answer } = require(path.join(dist, 'answer'));
const { join } = require(path.join(dist, 'join'));
const { validateGameName } = require(path.join(dist, 'validate-game-name'));
const { onAnswerSelection } = require(path.join(dist, 'on-answer-selection'));
const { onStateChange, onJoinGame } = require(path.join(dist, 'analytics'));
const { seatsForReplay } = require(path.join(dist, 'fork'));
const { lateStart, lateScore, lateWaiting, isLateJoin, MAX_PLAYERS } = require(path.join(__dirname, '..', 'dist', 'game-model'));

const S = { GameStaging: 0, RoundIntro: 1, ShowQuestion: 2, ShowAnswers: 3, RevealTheTruth: 4, ScoreBoard: 5, ScoreBoardFinal: 6 };
console.log = () => {};
console.error = () => {};

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
function lobby(names, totalQ = 5, over = {}) {
    seedQuestions();
    // Letters only, as real PINs are (the join row reads only such a PIN).
    const n = ++pinCount;
    const pin = 'LT' + String.fromCharCode(65 + Math.floor(n / 26)) + String.fromCharCode(65 + n % 26);
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
const seated = pin => Object.keys(game(pin).players).filter(pid => !lateWaiting(game(pin).players[pid], game(pin).questionIndex));

async function next(pin) {
    await advance(pin, Object.assign({}, game(pin).state));
    await onStateChange(pin);
    return state(pin);
}
async function pick(pin, pid, text) {
    game(pin).answerSelections = game(pin).answerSelections || {};
    game(pin).answerSelections[pid] = { text: text.toLowerCase() };
    await onAnswerSelection(pin);
}
const answersOf = pin => Object.keys(game(pin).answers || {}).map(k => game(pin).answers[k]);
const truthOf = pin => answersOf(pin).find(a => a.realAnswer).text;

/** Every seated player writes a lie, then picks the truth: the phases end as soon as all are in. */
async function playQuestion(pin, pids = seated(pin)) {
    assert.strictEqual(state(pin), S.ShowQuestion);
    for (const pid of pids) await answer(pin, pid, `${pid} lie ${game(pin).questionIndex}`);
    assert.strictEqual(state(pin), S.ShowAnswers, 'the lies end the moment every seated player is in');
    for (const pid of pids) await pick(pin, pid, truthOf(pin));
    assert.strictEqual(state(pin), S.RevealTheTruth, 'the picks end the moment every seated player is in');
}

test('lateStart: the next question, the one a round intro is about to show, and none near the end', () => {
    const g = (id, q, totalQ = 7) => ({ state: { id, timestamp: 1 }, questionIndex: q, totalQ });
    assert.strictEqual(lateStart(g(S.GameStaging, 0)), null, 'the lobby is an ordinary join');
    assert.strictEqual(lateStart(g(S.RoundIntro, 0)), 0, 'before question 1 is on screen: from question 1');
    assert.strictEqual(lateStart(g(S.ShowQuestion, 0)), 1);
    assert.strictEqual(lateStart(g(S.ShowAnswers, 2)), 3);
    assert.strictEqual(lateStart(g(S.RevealTheTruth, 4)), 5);
    assert.strictEqual(lateStart(g(S.ScoreBoard, 5)), 6, 'the second to last question: the last one is still to come');
    assert.strictEqual(lateStart(g(S.RoundIntro, 6)), null, 'the last question\'s intro: too late');
    assert.strictEqual(lateStart(g(S.ShowQuestion, 6)), null, 'on the last question: too late');
    assert.strictEqual(lateStart(g(S.ScoreBoardFinal, 6)), null);
});

test('lateScore: the lowest score among the seats that played, so a latecomer can still win', () => {
    const players = {
        a: { nickname: 'A', score: 3000 }, b: { nickname: 'B', score: 1500 }, ghost: { nickname: 'G', score: 0 },
        late: { nickname: 'L', score: 0, late: 4 },
    };
    const g = { questionIndex: 3, players, played: { a: true, b: true } };
    assert.strictEqual(lateScore(g), 1500, 'a seat that never played and a latecomer still waiting are left out');
    assert.strictEqual(lateScore({ questionIndex: 0, players: { a: { score: 0 }, b: { score: 0 } } }), 0);
    assert.strictEqual(lateScore({ questionIndex: 2, players: { a: { score: -500 }, b: { score: 2000 } }, played: { a: true, b: true } }), -500,
        'the lowest is the lowest, below 0 too: walking in never passes anyone');
    assert.strictEqual(lateScore({ players: {} }), 0);
});

test('a friend who walks in mid-question gets a seat from the next question, at the lowest score', async () => {
    const pin = lobby(['dana', 'ben', 'avi'], 5);
    await next(pin);                                   // START: round intro
    await next(pin);                                   // question 1
    await playQuestion(pin);
    await next(pin);                                   // scoreboard
    await next(pin);                                   // question 2
    assert.strictEqual(state(pin), S.ShowQuestion);
    const lowest = Math.min(...['p1', 'p2', 'p3'].map(p => game(pin).players[p].score));

    assert.deepStrictEqual(await validateGameName(pin), { late: true }, 'the page can say so before a name is typed');
    const { pid, late } = await join(pin, 'noa', 'u-noa');
    assert.strictEqual(late, 2, 'question 2 is under way, so question 3');
    const seat = game(pin).players[pid];
    assert.strictEqual(seat.late, 2);
    assert.strictEqual(seat.score, lowest);
    assert.strictEqual(seat.nickname, 'noa');

    // Question 2 ends as soon as the three who were playing are in: the latecomer is not waited for,
    // and the empty seats guard (20 s) does not hold the table either.
    await playQuestion(pin, ['p1', 'p2', 'p3']);
    await next(pin);                                   // scoreboard
    assert.strictEqual(game(pin).players[pid].late, 2, 'the scoreboard keeps the late seat');
    assert.strictEqual(game(pin).players[pid].score, lowest, 'no points for a question not played');

    // Question 3: the latecomer plays, and is waited for like everyone.
    assert.strictEqual(await next(pin), S.RoundIntro, 'a five-question game has its second round here');
    assert.strictEqual(lateStart(game(pin)), 2, 'in a round intro the next latecomer begins with the coming question');
    await next(pin);
    for (const p of ['p1', 'p2', 'p3']) await answer(pin, p, `${p} lie`);
    assert.strictEqual(state(pin), S.ShowQuestion, 'waits for the latecomer\'s lie');
});

test('the table goes on to the end with a latecomer, who scores from their first question', async () => {
    const pin = lobby(['dana', 'ben'], 4);
    await next(pin);
    await next(pin);
    const { pid, late } = await join(pin, 'noa', 'u-noa');
    assert.strictEqual(late, 1);
    await playQuestion(pin, ['p1', 'p2']);
    await next(pin);
    await next(pin);
    assert.strictEqual(game(pin).questionIndex, 1);
    const before = game(pin).players[pid].score;
    await playQuestion(pin, ['p1', 'p2', pid]);
    await next(pin);
    assert.ok(game(pin).players[pid].score > before, 'the latecomer found the truth and scored');
    while (state(pin) !== S.ScoreBoardFinal) {
        if (state(pin) === S.ShowQuestion) {
            await playQuestion(pin);
            await next(pin);
        } else {
            await next(pin);
        }
    }
    assert.strictEqual(game(pin).lastSent[pid], true, 'Replay keeps the latecomer\'s seat');
    assert.ok(Object.values(seatsForReplay(game(pin))).some(s => s.nickname === 'noa'));
});

test('a game on its last question takes no latecomer; a finished one still sends them on', async () => {
    const pin = lobby(['dana', 'ben'], 3);
    Object.assign(game(pin), { state: { id: S.ShowQuestion, timestamp: Date.now() }, questionIndex: 2 });
    await assert.rejects(validateGameName(pin), e => e.code === 'GAME_ENDING');
    await assert.rejects(join(pin, 'noa', 'u-noa'), e => e.code === 'GAME_ENDING');
    assert.strictEqual(Object.keys(game(pin).players).length, 2);
    // A player of the game back on their own seat still gets it.
    const back = await join(pin, 'ben', game(pin).players.p2.uid, undefined, 'p2');
    assert.strictEqual(back.pid, 'p2');
    assert.strictEqual(back.late, undefined);

    game(pin).state = { id: S.ScoreBoardFinal, timestamp: Date.now() };
    await assert.rejects(join(pin, 'noa', 'u-noa'), e => e.code === 'GAME_OVER');
});

test('seat limits hold for latecomers: the 13th phone is told the game is full', async () => {
    const names = [];
    for (let i = 0; i < MAX_PLAYERS - 1; i++) names.push('p' + i);
    const pin = lobby(names, 7);
    Object.assign(game(pin), { state: { id: S.ShowAnswers, timestamp: Date.now() }, questionIndex: 1 });
    const { late } = await join(pin, 'twelve', 'u-12');
    assert.strictEqual(late, 2);
    await assert.rejects(validateGameName(pin), e => e.code === 'GAME_IS_FULL');
    await assert.rejects(join(pin, 'thirteen', 'u-13'), e => e.code === 'GAME_IS_FULL');
    assert.strictEqual(Object.keys(game(pin).players).length, MAX_PLAYERS);
});

test('a phone back on its own seat mid-game is no latecomer', async () => {
    const pin = lobby(['dana', 'ben'], 7);
    Object.assign(game(pin), { state: { id: S.ShowQuestion, timestamp: Date.now() }, questionIndex: 3 });
    const r = await join(pin, 'ben', game(pin).players.p2.uid, undefined, 'p2');
    assert.strictEqual(r.pid, 'p2');
    assert.strictEqual(r.late, undefined);
    assert.strictEqual('late' in game(pin).players.p2, false);
});

test('the join row says late for a latecomer, and keeps its source for everyone else', async () => {
    rows.length = 0;
    const pin = lobby(['dana', 'ben'], 7);
    const ben = game(pin).players.p2.uid;
    await onJoinGame('u-x', '', '', pin, 'x', 'link');
    Object.assign(game(pin), { state: { id: S.ShowQuestion, timestamp: Date.now() }, questionIndex: 1 });
    await onJoinGame('u-noa', '', '', pin, 'noa', 'link');            // before the seat is made
    await join(pin, 'tal', 'u-tal');
    await onJoinGame('u-tal', '', '', pin, 'tal', 'qr');              // after the seat is made
    await onJoinGame(ben, '', '', pin, 'ben', 'link');                // back on his own seat
    Object.assign(game(pin), { questionIndex: 6 });
    await onJoinGame('u-late', '', '', pin, 'late', 'pin');           // the last question: refused, not late
    const vias = rows.filter(r => r.table === 'users').map(r => [r.row.uid, r.row.via]);
    assert.deepStrictEqual(vias, [['u-x', 'link'], ['u-noa', 'late'], ['u-tal', 'late'], [ben, 'link'], ['u-late', 'pin']]);

    // A test game's joins stay 'test', late or not.
    rows.length = 0;
    const t = lobby(['dana', 'ben'], 7, { campaign: 'test' });
    Object.assign(game(t), { state: { id: S.ShowQuestion, timestamp: Date.now() }, questionIndex: 1 });
    await onJoinGame('u-t', '', '', t, 't', 'link');
    assert.strictEqual(rows.find(r => r.table === 'users').row.via, 'test');
});

test('isLateJoin: only a started game that takes latecomers, and only a browser with no seat of its own', () => {
    const players = { a: { nickname: 'A', uid: 'ua', score: 0 }, l: { nickname: 'L', uid: 'ul', score: 0, late: 2 } };
    const g = { state: { id: S.ShowQuestion, timestamp: 1 }, questionIndex: 1, totalQ: 7, players };
    assert.strictEqual(isLateJoin(g, 'new'), true);
    assert.strictEqual(isLateJoin(g, 'ul'), true, 'a late seat already made for this browser');
    assert.strictEqual(isLateJoin(g, 'ua'), false, 'a player back on their own seat');
    assert.strictEqual(isLateJoin(Object.assign({}, g, { state: { id: S.GameStaging, timestamp: 1 } }), 'new'), false);
    assert.strictEqual(isLateJoin(Object.assign({}, g, { questionIndex: 6 }), 'new'), false);
});

test('the scoreboard writes scores seat by seat, so a seat made meanwhile is kept', () => {
    const update = { state: { id: S.ScoreBoard, timestamp: 1 }, players: { a: { nickname: 'A', score: 2000, uid: 'ua' }, b: { nickname: 'B', score: -500 } } };
    assert.deepStrictEqual(scoresOnly(update), { state: update.state, 'players/a/score': 2000, 'players/b/score': -500 });
    const other = { state: { id: S.ShowAnswers, timestamp: 1 }, answers: {} };
    assert.strictEqual(scoresOnly(other), other);
});
