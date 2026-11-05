// Host-only START: only the phone with the game's host key starts a hosted game, big screen or not.
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
const { startVerdict, HOST_GRACE_MS, HOST_GONE_MS } = require(path.join(dist, 'start'));
const { tick } = require(path.join(dist, 'tick'));
const { fork } = require(path.join(dist, 'fork'));
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

const GameStaging = 0, RoundIntro = 1;
const KEY = 'K'.repeat(24), OTHER = 'X'.repeat(24);
console.log = () => {};

function seedQuestions() {
    db.gameCounter = 100;
    db.questions = {};
    for (let i = 0; i < 12; i++) db.questions['q' + i] = { lang: 'en', questionText: 'x', realAnswer: 'y', fakeAnswers: [], citation: '' };
}

/** A hosted lobby: the host (with the key) and a friend have joined. */
async function hostedLobby() {
    seedQuestions();
    const created = await call('newGame', { locale: 'en', count: 5, hostKey: KEY, serverStart: true });
    const pin = created.body.pin;
    const host = (await call('join', { pin, nickname: 'alice', uid: 0, hostKey: KEY })).body.pid;
    const friend = (await call('join', { pin, nickname: 'ben', uid: 0 })).body.pid;
    return { pin, host, friend };
}

test('a phone without the host key cannot start a hosted game', async () => {
    const { pin } = await hostedLobby();
    const r = await call('startGame', { pin });
    assert.strictEqual(r.code, 403);
    assert.strictEqual(r.body.code, 'NOT_HOST');
    const wrong = await call('startGame', { pin, hostKey: OTHER });
    assert.strictEqual(wrong.code, 403);
    assert.strictEqual(db.games[pin].state.id, GameStaging);
});

test('the host starts it with its key', async () => {
    const { pin } = await hostedLobby();
    const r = await call('startGame', { pin, hostKey: KEY });
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(r.body, { started: true });
    assert.strictEqual(db.games[pin].state.id, RoundIntro);
    // A second tap after the start is a no-op, not an error.
    const again = await call('startGame', { pin, hostKey: KEY });
    assert.deepStrictEqual(again.body, { started: false });
});

test('a tick written straight to the database does not start a hosted game', async () => {
    const { pin } = await hostedLobby();
    db.games[pin].tick = RoundIntro;                     // the old START write
    await tick(pin);
    assert.strictEqual(db.games[pin].state.id, GameStaging);
    db.games[pin].tick = `${GameStaging}:${db.games[pin].state.timestamp}`; // the current-style tick
    await tick(pin);
    assert.strictEqual(db.games[pin].state.id, GameStaging);
});

test('a game from the client before this change (key, no serverStart) still starts by its START tick', async () => {
    seedQuestions();
    const pin = (await call('newGame', { locale: 'en', count: 5, hostKey: KEY })).body.pin;
    assert.strictEqual('serverStart' in db.games[pin], false);
    await call('join', { pin, nickname: 'alice', uid: 0, hostKey: KEY });
    db.games[pin].tick = RoundIntro;
    await tick(pin);
    assert.strictEqual(db.games[pin].state.id, RoundIntro);
});

test('serverStart counts only when it is exactly true', async () => {
    seedQuestions();
    const r = await call('newGame', { locale: 'en', count: 5, hostKey: KEY, serverStart: 'yes' });
    assert.strictEqual('serverStart' in db.games[r.body.pin], false, 'only a real true counts');
});

test('games without a host key keep the old rule: a tick or any phone starts them', async () => {
    seedQuestions();
    const pin = (await call('newGame', { locale: 'en', count: 5 })).body.pin;
    await call('join', { pin, nickname: 'dana', uid: 'u1' });
    db.games[pin].tick = RoundIntro;
    await tick(pin);
    assert.strictEqual(db.games[pin].state.id, RoundIntro);

    const pin2 = (await call('newGame', { locale: 'en', count: 5 })).body.pin;
    await call('join', { pin: pin2, nickname: 'dana', uid: 'u1' });
    const r = await call('startGame', { pin: pin2 });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(db.games[pin2].state.id, RoundIntro);
});

test('a bad or missing pin is refused', async () => {
    assert.strictEqual((await call('startGame', { pin: 'ZZZZ', hostKey: KEY })).code, 400);
    assert.strictEqual((await call('startGame', { pin: { $gt: '' } })).code, 400);
    assert.strictEqual((await call('startGame', {})).code, 400);
});

test('if the host never joins, anyone may start after the grace time, as the lobby shows', () => {
    const now = 1000000;
    const lobby = (opened, players) => ({ hostKey: KEY, hasHost: true, state: { id: GameStaging, timestamp: opened }, players });
    const friendOnly = { p1: { nickname: 'ben', uid: 0, score: 0 } };
    const withHost = { p1: { nickname: 'ben', uid: 0, score: 0 }, p2: { nickname: 'alice', uid: 0, score: 0, host: true } };
    assert.strictEqual(startVerdict(lobby(now - 10000, friendOnly), undefined, now), 'not-host');
    assert.strictEqual(startVerdict(lobby(now - HOST_GRACE_MS, friendOnly), undefined, now), 'host-missing');
    assert.strictEqual(startVerdict(lobby(now - HOST_GRACE_MS * 10, withHost), undefined, now), 'not-host', 'the host is in: wait for them');
    assert.strictEqual(startVerdict(lobby(now - HOST_GRACE_MS * 10, withHost), KEY, now), 'host');
});

test('a big screen does not start a hosted game: the presenter flag proves nothing', () => {
    const now = Date.now();
    const g = { hostKey: KEY, hasHost: true, presenter: true, state: { id: GameStaging, timestamp: now }, players: {} };
    assert.strictEqual(startVerdict(g, undefined, now), 'not-host');
    assert.strictEqual(startVerdict(g, OTHER, now), 'not-host');
    assert.strictEqual(startVerdict(g, KEY, now), 'host', 'the host starts it, big screen or not');
    // The 90 s rule still frees a group whose host never came, big screen or not.
    assert.strictEqual(startVerdict(g, undefined, now + HOST_GRACE_MS), 'host-missing');
});

test('a guest who claims to be the big screen still cannot start a hosted game', async () => {
    const { pin } = await hostedLobby();
    db.games[pin].presenter = true;                      // anyone can write this, as the present page does
    const none = await call('startGame', { pin });
    assert.strictEqual(none.code, 403);
    assert.strictEqual(none.body.code, 'NOT_HOST');
    const wrong = await call('startGame', { pin, hostKey: OTHER });
    assert.strictEqual(wrong.code, 403);
    assert.strictEqual(db.games[pin].state.id, GameStaging);
    // The host's phone starts it with the big screen in the room.
    const host = await call('startGame', { pin, hostKey: KEY });
    assert.strictEqual(host.code, 200);
    assert.strictEqual(db.games[pin].state.id, RoundIntro);
});

test('a big screen still starts a game with no host key', async () => {
    seedQuestions();
    const pin = (await call('newGame', { locale: 'en', count: 5 })).body.pin;
    await call('join', { pin, nickname: 'dana', uid: 'u1' });
    db.games[pin].presenter = true;
    assert.strictEqual((await call('startGame', { pin })).code, 200);
    assert.strictEqual(db.games[pin].state.id, RoundIntro);
});

test('Replay with a host key: only the phone that pressed Replay starts the new game', async () => {
    const { pin, host, friend } = await hostedLobby();
    await call('startGame', { pin, hostKey: KEY });
    const NEW = 'N'.repeat(24);
    const forked = await call('fork', { pin, pid: friend, hostKey: NEW });
    assert.strictEqual(forked.code, 200);
    const next = forked.body.pin;
    assert.strictEqual(next, db.games[pin].fork);
    assert.strictEqual(db.games[next].hostKey, NEW);
    assert.strictEqual(db.games[next].serverStart, true);
    assert.strictEqual(db.games[next].players[friend].host, true);
    assert.strictEqual(db.games[next].players[host].host, undefined);

    assert.strictEqual((await call('startGame', { pin: next, hostKey: KEY })).code, 403, 'the old key is for the old game');
    assert.strictEqual((await call('startGame', { pin: next, hostKey: NEW })).code, 200);
    assert.strictEqual(db.games[next].state.id, RoundIntro);
});

test('Replay with a key but no player id stores no key, so the new game keeps the open rule', async () => {
    const { pin } = await hostedLobby();
    const forked = await call('fork', { pin, hostKey: 'N'.repeat(24) });
    assert.strictEqual('hostKey' in db.games[forked.body.pin], false);
});

// ---- A joined host whose phone died: the group may start once the host has been gone HOST_GONE_MS (5 minutes) ----

test('the host joining marks them seen', async () => {
    const before = Date.now();
    const { pin } = await hostedLobby();
    assert.ok(db.games[pin].hostSeen >= before, 'join by the host sets hostSeen');
});

test('a guest may start once the joined host has been gone HOST_GONE_MS (5 minutes), not before', async () => {
    const { pin } = await hostedLobby();
    db.games[pin].hostSeen = Date.now() - (HOST_GONE_MS - 5000);
    assert.strictEqual((await call('startGame', { pin })).code, 403, 'the host was here 85 s ago');
    assert.strictEqual(db.games[pin].state.id, GameStaging);

    db.games[pin].hostSeen = Date.now() - HOST_GONE_MS - 1000;
    const r = await call('startGame', { pin });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(db.games[pin].state.id, RoundIntro);
});

test('the host reporting in keeps guests waiting', async () => {
    const { pin } = await hostedLobby();
    db.games[pin].hostSeen = Date.now() - HOST_GONE_MS * 5;
    const ping = await call('hostHere', { pin, hostKey: KEY });
    assert.strictEqual(ping.code, 200);
    assert.deepStrictEqual(ping.body, { seen: true });
    assert.ok(Date.now() - db.games[pin].hostSeen < 1000);
    assert.strictEqual((await call('startGame', { pin })).code, 403);
});

test('a guest cannot report in for the host, so cannot keep or move the host clock', async () => {
    const { pin } = await hostedLobby();
    const old = Date.now() - HOST_GONE_MS * 5;
    db.games[pin].hostSeen = old;
    for (const hostKey of [undefined, '', OTHER, KEY.toLowerCase()]) {
        const r = await call('hostHere', { pin, hostKey });
        assert.strictEqual(r.code, 403);
        assert.strictEqual(r.body.code, 'NOT_HOST');
    }
    assert.strictEqual(db.games[pin].hostSeen, old);
    assert.strictEqual((await call('hostHere', { pin: 'ZZZZ', hostKey: KEY })).code, 400);
});

test('reporting in after the start changes nothing', async () => {
    const { pin } = await hostedLobby();
    await call('startGame', { pin, hostKey: KEY });
    const seen = db.games[pin].hostSeen;
    const r = await call('hostHere', { pin, hostKey: KEY });
    assert.deepStrictEqual(r.body, { seen: false });
    assert.strictEqual(db.games[pin].hostSeen, seen);
});

test('games from the client before this change keep host-only START: no host clock', async () => {
    seedQuestions();
    const pin = (await call('newGame', { locale: 'en', count: 5, hostKey: KEY })).body.pin;
    await call('join', { pin, nickname: 'alice', uid: 0, hostKey: KEY });
    await call('join', { pin, nickname: 'ben', uid: 0 });
    assert.strictEqual('hostSeen' in db.games[pin], false);
    assert.deepStrictEqual((await call('hostHere', { pin, hostKey: KEY })).body, { seen: false });
    assert.strictEqual('hostSeen' in db.games[pin], false);
});

test('startVerdict: host gone only with a joined host, serverStart and an old hostSeen', () => {
    const now = 10000000;
    const withHost = { p1: { nickname: 'ben', uid: 0, score: 0 }, p2: { nickname: 'alice', uid: 0, score: 0, host: true } };
    const g = (extra) => Object.assign({ hostKey: KEY, hasHost: true, serverStart: true,
        state: { id: GameStaging, timestamp: now - HOST_GONE_MS * 10 }, players: withHost }, extra);
    assert.strictEqual(startVerdict(g({ hostSeen: now - HOST_GONE_MS }), undefined, now), 'host-gone');
    assert.strictEqual(startVerdict(g({ hostSeen: now - HOST_GONE_MS + 1 }), undefined, now), 'not-host');
    assert.strictEqual(startVerdict(g({}), undefined, now), 'not-host', 'no host clock: wait for the host');
    assert.strictEqual(startVerdict(g({ hostSeen: String(now - HOST_GONE_MS * 5) }), undefined, now), 'not-host');
    assert.strictEqual(startVerdict(g({ hostSeen: now - HOST_GONE_MS * 5, serverStart: undefined }), undefined, now), 'not-host');
    assert.strictEqual(startVerdict(g({ hostSeen: now - HOST_GONE_MS * 5 }), KEY, now), 'host');
    // A big screen gets the same answer as any phone.
    assert.strictEqual(startVerdict(g({ hostSeen: now - HOST_GONE_MS * 5, presenter: true }), undefined, now), 'host-gone');
});

test('Replay with a host key marks the new host seen', async () => {
    const { pin, friend } = await hostedLobby();
    await call('startGame', { pin, hostKey: KEY });
    const before = Date.now();
    const next = (await call('fork', { pin, pid: friend, hostKey: 'N'.repeat(24) })).body.pin;
    assert.ok(db.games[next].hostSeen >= before);
});

test('the host-gone wait is 5 minutes, the same as the lobby', () => {
    assert.strictEqual(HOST_GONE_MS, 5 * 60 * 1000);
});
