// Step zero analytics: who hosted a game, how it started, where each join came from.
// Runs the compiled functions (dist/) against an in-memory database and a fake
// BigQuery, so it needs no Firebase project or credentials:
//   npm run build && npm test
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');

// ---- in-memory Realtime Database (just what the controllers use) ----
const db = {};
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
    node[parts[parts.length - 1]] = JSON.parse(JSON.stringify(value));
}
let pushId = 0;
function ref(parts) {
    return {
        child: (p) => ref(parts.concat(String(p).split('/'))),
        once: async () => ({ val: () => JSON.parse(JSON.stringify(at(parts))) }),
        set: async (v) => put(parts, v),
        update: async (v) => Object.keys(v).forEach(k => put(parts.concat(k.split('/')), v[k])),
        push: () => ({ key: 'p' + (++pushId) }),
        transaction: (fn, done) => { const v = fn(at(parts)); put(parts, v); done(null, true, { val: () => v }); },
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
    get: (r) => r.once('value').then(s => s.val()),
};

// ---- fake BigQuery: records every insert ----
const rows = [];
class FakeBigQuery {
    dataset(name) {
        return { table: (table) => ({ insert: async (row, opts) => rows.push({ dataset: name, table, row, opts }) }) };
    }
}

// ---- fake firebase-functions v1 and cors: keep each HTTP handler to call directly ----
const fakeFunctions = {
    https: { onRequest: (h) => ({ __handler: h }) },
    database: { ref: () => ({ onWrite: (h) => ({ __trigger: h }) }) },
};
fakeFunctions.runWith = () => fakeFunctions;
const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'firebase-functions/v1') return fakeFunctions;
    if (request === 'cors') return () => (req, res, next) => next();
    if (request === '@google-cloud/bigquery') return { BigQuery: FakeBigQuery };
    if (/[\\/]firebase$/.test(request) || request === './../firebase' || request === '../firebase') return fakeFirebase;
    return realLoad.apply(this, arguments);
};

const dist = path.join(__dirname, '..', 'dist', 'controllers');
const { newGame } = require(path.join(dist, 'new-game'));
const { fork } = require(path.join(dist, 'fork'));
const { join } = require(path.join(dist, 'join'));
const analytics = require(path.join(dist, 'analytics'));
const api = require(path.join(__dirname, '..', 'dist', 'index'));

function call(name, body, headers = {}) {
    return new Promise((resolve) => {
        const res = {
            code: 200,
            status(c) { this.code = c; return this; },
            send(b) { resolve({ code: this.code, body: b }); return this; },
        };
        api[name].__handler({ body, headers }, res);
    });
}

const RoundIntro = 1, ScoreBoardFinal = 6;
const log = console.log;
console.log = () => {};
const allRows = [];
const keep = rows.push.bind(rows);
rows.push = (r) => { allRows.push(r); return keep(r); };
// PRINT_ROWS=1 npm test shows every row the run would have sent to BigQuery.
test.after(() => {
    console.log = log;
    if (process.env.PRINT_ROWS) allRows.forEach(r => log(r.table, JSON.stringify(r.row)));
});

function seedQuestions() {
    db.gameCounter = 100;
    db.questions = {};
    for (let i = 0; i < 12; i++) db.questions['q' + i] = { lang: i % 2 ? 'he' : 'en', questionText: 'x', realAnswer: 'y', fakeAnswers: [], citation: '' };
}
const take = (table) => rows.filter(r => r.table === table).map(r => r.row);

test('a created game records its host and "create", and both game tables carry them', async () => {
    seedQuestions();
    rows.length = 0;
    const pin = await newGame('en', 5, 'hostUid1');
    assert.strictEqual(db.games[pin].creator, 'hostUid1');
    assert.strictEqual(db.games[pin].origin, 'create');

    await join(pin, 'dana', 'hostUid1');
    await join(pin, 'avi', 'guestUid2');
    db.games[pin].state = { id: RoundIntro, timestamp: Date.now() };
    await analytics.onStateChange(pin);
    db.games[pin].state = { id: ScoreBoardFinal, timestamp: Date.now() };
    await analytics.onStateChange(pin);

    const [opened] = take('opened_games');
    const [closed] = take('closed_games');
    for (const row of [opened, closed]) {
        assert.strictEqual(row.id, pin);
        assert.strictEqual(row.players, 2);
        assert.strictEqual(row.creator_uid, 'hostUid1');
        assert.strictEqual(row.origin, 'create');
        assert.strictEqual(row.parent_pin, null);
    }
    assert.ok(rows.every(r => r.dataset === 'analytics' && r.opts && r.opts.ignoreUnknownValues === true));
});

test('Replay records "replay", the finished game it came from, and who pressed it', async () => {
    seedQuestions();
    rows.length = 0;
    const first = await newGame('he', 7, 'hostUid1');
    await join(first, 'dana', 'hostUid1');
    await join(first, 'avi', 'guestUid2');
    await fork(first, 'guestUid2');
    const second = db.games[first].fork;
    assert.ok(second && second !== first);
    assert.strictEqual(db.games[second].origin, 'replay');
    assert.strictEqual(db.games[second].parent, first);
    assert.strictEqual(db.games[second].creator, 'guestUid2');

    db.games[second].state = { id: RoundIntro, timestamp: Date.now() };
    await analytics.onStateChange(second);
    const [opened] = take('opened_games');
    assert.deepStrictEqual(
        { id: opened.id, creator_uid: opened.creator_uid, origin: opened.origin, parent_pin: opened.parent_pin, locale: opened.locale },
        { id: second, creator_uid: 'guestUid2', origin: 'replay', parent_pin: first, locale: 'he' });
});

test('Replay without a uid keeps the old host', async () => {
    seedQuestions();
    const first = await newGame('en', 5, 'hostUid1');
    await join(first, 'dana', 'hostUid1');
    await fork(first);
    assert.strictEqual(db.games[db.games[first].fork].creator, 'hostUid1');
});

test('a game created by an old client (no uid) still logs, with an empty host', async () => {
    seedQuestions();
    rows.length = 0;
    const pin = await newGame('en', 5);
    assert.strictEqual('creator' in db.games[pin], false);
    await join(pin, 'dana', 'u1');
    db.games[pin].state = { id: RoundIntro, timestamp: Date.now() };
    await analytics.onStateChange(pin);
    const [opened] = take('opened_games');
    assert.strictEqual(opened.creator_uid, null);
    assert.strictEqual(opened.origin, 'create');
});

test('joins record their source; unknown tags become "other", missing ones null', async () => {
    rows.length = 0;
    const sources = ['qr', 'LINK', 'results', 'pin', 'host', 'replay', 'facebook<script>', undefined];
    for (const via of sources) {
        await analytics.onJoinGame('u', '1.2.3.4', 'ua', 'ABCD', 'n', analytics.cleanVia(via));
    }
    assert.deepStrictEqual(take('users').map(r => r.via), ['qr', 'link', 'results', 'pin', 'host', 'replay', 'other', null]);
    const row = take('users')[0];
    assert.deepStrictEqual(Object.keys(row).sort(), ['ip', 'nickname', 'pin', 'time', 'uid', 'useragent', 'via']);
});

test('HTTP endpoints pass the uid and join source through, and drop bad uids', async () => {
    seedQuestions();
    rows.length = 0;
    const created = await call('newGame', { locale: 'en', count: 5, uid: 'hostUid9' });
    assert.strictEqual(created.code, 200);
    assert.strictEqual(db.games[created.body.pin].creator, 'hostUid9');

    const bad = await call('newGame', { locale: 'en', count: 5, uid: { $gt: '' } });
    assert.strictEqual('creator' in db.games[bad.body.pin], false);

    await call('join', { pin: created.body.pin, nickname: 'dana', uid: 'hostUid9' });
    const forked = await call('fork', { pin: created.body.pin, uid: 'otherUid' });
    assert.strictEqual(forked.code, 200);
    assert.strictEqual(db.games[db.games[created.body.pin].fork].creator, 'otherUid');

    await call('onJoinGame', { uid: 'u7', pin: created.body.pin, nickname: 'avi', via: 'qr' },
        { 'x-forwarded-for': '1.2.3.4', 'user-agent': 'test' });
    await call('onJoinGame', { uid: 'u8', pin: created.body.pin, nickname: 'noa' }, {});
    assert.deepStrictEqual(take('users').map(r => [r.uid, r.via]), [['u7', 'qr'], ['u8', null]]);
});
