// A finished game takes no new players: joining by its PIN says GAME_OVER, and offers its rematch.
// Runs the compiled functions (dist/) against an in-memory database, no Firebase project needed:
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
const { join } = require(path.join(dist, 'join'));
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

const { isGameOver, STALE_MS, JUST_ENDED_MS } = require(path.join(dist, 'game-over'));
console.log = () => {};
const Staging = 0, ShowQuestion = 2, Final = 6;
const now = Date.now();
const H = 60 * 60 * 1000;

function game(stateId, at, extra = {}) {
    return Object.assign({ state: { id: stateId, timestamp: at }, timestamp: at, locale: 'en', players: { a: { nickname: 'Ann', score: 3 } } }, extra);
}
function seed(games) {
    db.games = JSON.parse(JSON.stringify(games));
}

test('isGameOver: final scoreboard, or still for six hours', () => {
    assert.strictEqual(isGameOver(game(Final, now), now), true);
    assert.strictEqual(isGameOver(game(Staging, now - 5 * 60 * 1000), now), false);
    assert.strictEqual(isGameOver(game(ShowQuestion, now - 60 * 1000), now), false);
    assert.strictEqual(isGameOver(game(ShowQuestion, now - STALE_MS - 1), now), true);
    assert.strictEqual(isGameOver(game(Staging, now - STALE_MS - 1), now), true);
    // A lobby whose host keeps reporting in is alive.
    assert.strictEqual(isGameOver(game(Staging, now - STALE_MS - 1, { hostSeen: now - 1000 }), now), false);
    assert.strictEqual(isGameOver(null, now), false);
});

test('a PIN from July: validateGameName and join both say GAME_OVER, and add no player', async () => {
    const july = new Date('2026-07-04T03:23:00Z').getTime();
    seed({ JRVE: game(Final, july) });
    const v = await call('validateGameName', { pin: 'jrve' });
    assert.strictEqual(v.code, 400);
    assert.strictEqual(v.body.code, 'GAME_OVER');
    assert.strictEqual(v.body.rematch, undefined);
    assert.strictEqual(v.body.justEnded, undefined);
    const j = await call('join', { pin: 'JRVE', nickname: 'Bob', uid: 'u1' });
    assert.strictEqual(j.body.code, 'GAME_OVER');
    assert.deepStrictEqual(Object.keys(db.games.JRVE.players), ['a']);
});

test('an old abandoned lobby or mid-game is over too', async () => {
    seed({ OLDL: game(Staging, now - 2 * 24 * H), OLDQ: game(ShowQuestion, now - 30 * 24 * H) });
    assert.strictEqual((await call('validateGameName', { pin: 'OLDL' })).body.code, 'GAME_OVER');
    assert.strictEqual((await call('join', { pin: 'OLDQ', nickname: 'Bob', uid: 'u1' })).body.code, 'GAME_OVER');
});

test('a July game whose July replay is also dead offers no rematch', async () => {
    const july = new Date('2026-07-04T03:23:00Z').getTime();
    seed({ JRVE: game(Final, july, { fork: 'KQPT' }), KQPT: game(Staging, july + 60000) });
    const v = await call('validateGameName', { pin: 'JRVE' });
    assert.strictEqual(v.body.code, 'GAME_OVER');
    assert.strictEqual(v.body.rematch, undefined);
});

test('a game that just ended with an open rematch lobby offers the rematch', async () => {
    seed({ ABCD: game(Final, now - 2 * 60 * 1000, { fork: 'EFGH' }), EFGH: game(Staging, now - 60 * 1000) });
    const v = await call('validateGameName', { pin: 'abcd' });
    assert.strictEqual(v.body.code, 'GAME_OVER');
    assert.strictEqual(v.body.rematch, 'EFGH');
    // The rematch itself takes the late friend.
    const j = await call('join', { pin: 'EFGH', nickname: 'Late', uid: 'u2' });
    assert.strictEqual(j.code, 200);
});

test('a rematch already playing is not offered; the game just ended says so', async () => {
    seed({ ABCD: game(Final, now - 2 * 60 * 1000, { fork: 'EFGH' }), EFGH: game(ShowQuestion, now - 1000) });
    const v = await call('validateGameName', { pin: 'ABCD' });
    assert.strictEqual(v.body.rematch, undefined);
    assert.strictEqual(v.body.justEnded, true);
    seed({ ABCD: game(Final, now - JUST_ENDED_MS - 1000) });
    assert.strictEqual((await call('validateGameName', { pin: 'ABCD' })).body.justEnded, undefined);
});

test('live games still take players; a wrong PIN is still GAME_NOT_EXIST', async () => {
    seed({ LIVE: game(Staging, now - 1000), PLAY: game(ShowQuestion, now - 1000) });
    assert.strictEqual((await call('validateGameName', { pin: 'LIVE' })).code, 200);
    assert.strictEqual((await call('join', { pin: 'LIVE', nickname: 'Bob', uid: 'u1' })).code, 200);
    assert.strictEqual((await call('join', { pin: 'PLAY', nickname: 'Cy', uid: 'u3' })).code, 200);
    assert.strictEqual((await call('validateGameName', { pin: 'NOPE' })).body.code, 'GAME_NOT_EXIST');
    assert.strictEqual((await call('join', { pin: 'NOPE', nickname: 'Bob', uid: 'u1' })).body.code, 'GAME_NOT_EXIST');
});

// Room for the ninth player: a game takes 12 seats, and the thirteenth is told it is full.
test('a game takes 12 players; the 13th join is refused as full, and a full rematch is not offered', async () => {
    const { MAX_PLAYERS } = require(path.join(__dirname, '..', 'dist', 'game-model'));
    assert.strictEqual(MAX_PLAYERS, 12);
    seed({ BIGG: game(Staging, now - 1000) });
    for (let i = 2; i <= 12; i++) {
        assert.strictEqual((await call('validateGameName', { pin: 'BIGG' })).code, 200, `seat ${i}`);
        const j = await call('join', { pin: 'BIGG', nickname: 'P' + i, uid: 'u' + i });
        assert.strictEqual(j.code, 200, `seat ${i}`);
    }
    assert.strictEqual(Object.keys(db.games.BIGG.players).length, 12);
    const v = await call('validateGameName', { pin: 'BIGG' });
    assert.deepStrictEqual([v.code, v.body.code], [400, 'GAME_IS_FULL']);
    const j = await call('join', { pin: 'BIGG', nickname: 'P13', uid: 'u13' });
    assert.deepStrictEqual([j.code, j.body.code], [400, 'GAME_IS_FULL']);
    assert.strictEqual(Object.keys(db.games.BIGG.players).length, 12);

    // A rematch lobby with 11 seats is offered to a late friend; with 12 it is not.
    const eleven = {};
    for (let i = 0; i < 11; i++) eleven['s' + i] = { nickname: 'S' + i, score: 0 };
    seed({ ABCD: game(Final, now - 60 * 1000, { fork: 'EFGH' }), EFGH: game(Staging, now - 1000, { players: eleven }) });
    assert.strictEqual((await call('validateGameName', { pin: 'ABCD' })).body.rematch, 'EFGH');
    db.games.EFGH.players.s11 = { nickname: 'S11', score: 0 };
    assert.strictEqual((await call('validateGameName', { pin: 'ABCD' })).body.rematch, undefined);
});
