// One phone, one seat: a phone that joins a game again gets its own seat back (join.ts seatOf), and
// Replay leaves out a second seat of one phone that never played (fork.ts withoutSecondSeats).
// Runs against an in-memory database and a fake BigQuery, so it needs no Firebase project:
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
const { join, seatOf } = require(path.join(dist, 'join'));
const { createFork, withoutSecondSeats } = require(path.join(dist, 'fork'));
console.log = () => {};

let pinCount = 0;
function lobby(extra = {}) {
    const pin = 'J' + String(++pinCount).padStart(3, '0');
    db.games = db.games || {};
    db.games[pin] = Object.assign({
        state: { id: 0, timestamp: Date.now() }, locale: 'he', timestamp: Date.now(),
        roundIndex: 0, questionIndex: 0, totalQ: 9, qids: {}, tick: 0, presenter: false,
    }, extra);
    return pin;
}
const seats = pin => db.games[pin].players || {};
const count = pin => Object.keys(seats(pin)).length;

test('a phone that joins again under a new name keeps one seat (12 Nov: five joins, four names)', async () => {
    const pin = lobby();
    for (let i = 1; i <= 5; i++) await join(pin, 'p' + i, 'u' + i);
    const first = await join(pin, 'dana', 'phone');
    assert.strictEqual(count(pin), 6);
    // Back to the join page, a new name each time, as the phone in JVXG did; the last two taps 1.4 s apart.
    for (const name of ['danaa', 'dana k', 'dk', 'dk']) {
        const again = await join(pin, name, 'phone', undefined, first.pid);
        assert.strictEqual(again.pid, first.pid);
    }
    assert.strictEqual(count(pin), 6, 'still six seats, not eight');
    assert.strictEqual(seats(pin)[first.pid].nickname, 'dk');
});

test('the uid alone finds the seat when the phone lost its stored player id', async () => {
    const pin = lobby();
    const a = await join(pin, 'ari', 'u-ari');
    const b = await join(pin, 'ari2', 'u-ari');
    assert.strictEqual(b.pid, a.pid);
    assert.strictEqual(count(pin), 1);
});

test('a phone with no uid gets its seat back by its player id, and a stranger cannot take a seat by id', async () => {
    const pin = lobby();
    const noUid = await join(pin, 'slow', 0);
    const back = await join(pin, 'slow', 0, undefined, noUid.pid);
    assert.strictEqual(back.pid, noUid.pid);
    assert.strictEqual(count(pin), 1);
    // Sign-in finished later: the seat takes the uid.
    await join(pin, 'slow', 'u-slow', undefined, noUid.pid);
    assert.strictEqual(seats(pin)[noUid.pid].uid, 'u-slow');
    // Another browser sending someone else's player id gets a seat of its own.
    const other = await join(pin, 'eve', 'u-eve', undefined, noUid.pid);
    assert.notStrictEqual(other.pid, noUid.pid);
    assert.strictEqual(seats(pin)[noUid.pid].nickname, 'slow');
    assert.strictEqual(count(pin), 2);
});

test('a different phone still gets a new seat, and a full game still says full', async () => {
    const pin = lobby();
    const pids = [];
    for (let i = 1; i <= 8; i++) pids.push((await join(pin, 'p' + i, 'u' + i)).pid);
    assert.strictEqual(new Set(pids).size, 8);
    await assert.rejects(join(pin, 'p9', 'u9'), e => e.code === 'GAME_IS_FULL');
    // A phone at the full table that reloads its join page gets its seat back, not "full".
    const back = await join(pin, 'p3', 'u3', undefined, pids[2]);
    assert.strictEqual(back.pid, pids[2]);
});

test('a returning seat keeps its score mid-game', async () => {
    const pin = lobby();
    const a = await join(pin, 'ari', 'u-ari');
    db.games[pin].players[a.pid].score = 1500;
    db.games[pin].state = { id: 2, timestamp: Date.now() };
    await join(pin, 'ari', 'u-ari', undefined, a.pid);
    assert.strictEqual(seats(pin)[a.pid].score, 1500);
    assert.strictEqual(count(pin), 1);
});

test('the host joining again keeps one seat and stays the host', async () => {
    const pin = lobby({ hostKey: 'key1', serverStart: true });
    const host = await join(pin, 'host', 'u-host', 'key1');
    await join(pin, 'g', 'u-g');
    const again = await join(pin, 'host2', 'u-host', 'key1', host.pid);
    assert.strictEqual(again.pid, host.pid);
    assert.strictEqual(count(pin), 2);
    assert.strictEqual(seats(pin)[host.pid].host, true);
    assert.strictEqual(Object.keys(seats(pin)).filter(k => seats(pin)[k].host).length, 1);
});

test('seatOf prefers the stored player id, else the newest seat of the uid', () => {
    const players = { k1: { uid: 'a' }, k2: { uid: 'b' }, k3: { uid: 'a' } };
    assert.strictEqual(seatOf(players, 'a'), 'k3');
    assert.strictEqual(seatOf(players, 'a', 'k1'), 'k1');
    assert.strictEqual(seatOf(players, 'a', 'k2'), 'k3');
    assert.strictEqual(seatOf(players, 'c'), undefined);
    assert.strictEqual(seatOf(players, 0, 'k9'), undefined);
});

test('Replay leaves out a second seat of one phone that never played (JVXG to JVXH)', () => {
    const players = {};
    ['a', 'b', 'c', 'd', 'e'].forEach((u, i) => players['k' + i] = { nickname: u, uid: u, score: 100 });
    // Phone "e" joined three times: k4, k5, k6. It played as its newest seat, k6.
    players.k5 = { nickname: 'e2', uid: 'e', score: 0 };
    players.k6 = { nickname: 'e3', uid: 'e', score: 300 };
    players.k7 = { nickname: 'nouid', uid: 0, score: 0 };
    const played = { k0: true, k1: true, k2: true, k3: true, k6: true };
    const finished = { locale: 'he', totalQ: 9, players, played, playedFrom: 0, state: { id: 6 } };
    const forked = createFork('JVXG', JSON.parse(JSON.stringify(finished)), ['q'], 'a', 'k0', undefined, false, 'JVXH');
    assert.deepStrictEqual(Object.keys(forked.players).sort(), ['k0', 'k1', 'k2', 'k3', 'k6', 'k7']);
    assert.ok(Object.keys(forked.players).every(k => forked.players[k].score === 0));
    // A seat that never played, but is its phone's only seat, comes along (someone may still be there).
    assert.ok(withoutSecondSeats(finished).k7);
    // No seat of the phone played: its newest seat comes along.
    const quiet = { players: { k1: { uid: 'z' }, k2: { uid: 'z' } }, played: {}, playedFrom: 0 };
    assert.deepStrictEqual(Object.keys(withoutSecondSeats(quiet)), ['k2']);
    // The phone that pressed Replay always keeps the seat it pressed from.
    assert.ok(withoutSecondSeats(quiet, 'k1').k1);
    // A game from before the flags were kept: every seat comes along, as before.
    assert.strictEqual(Object.keys(withoutSecondSeats({ players: quiet.players })).length, 2);
});

test('a phone with a seat in a finished game is still told the game is over', async () => {
    const pin = lobby();
    const a = await join(pin, 'ari', 'u-ari');
    db.games[pin].state = { id: 6, timestamp: Date.now() };
    await assert.rejects(join(pin, 'ari', 'u-ari', undefined, a.pid), e => e.code === 'GAME_OVER');
    assert.strictEqual(count(pin), 1);
});
