// A guest whose invite link opens in an empty browser (a chat app's) again gets their seat back by name
// and browser string, once the old seat's page has gone (join.ts seatByName); two players with one name
// stay two seats. In-memory database, no Firebase project:  npm run build && node --test test/seat-by-name.test.js
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
const { join, seatByName, cleanAgent, AGENT_MAX } = require(path.join(dist, 'join'));
const { createFork } = require(path.join(dist, 'fork'));
console.log = () => {};

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

let pinCount = 0;
function lobby(extra = {}) {
    const pin = 'N' + String(++pinCount).padStart(3, '0');
    db.games = db.games || {};
    db.games[pin] = Object.assign({
        state: { id: 0, timestamp: Date.now() }, locale: 'he', timestamp: Date.now(),
        roundIndex: 0, questionIndex: 0, totalQ: 9, qids: {}, tick: 0, presenter: false,
    }, extra);
    return pin;
}
const seats = pin => db.games[pin].players || {};
const count = pin => Object.keys(seats(pin)).length;
// What the seat's page writes (ApiService.followSeat): true while connected, a time once it went away.
const here = (pin, pid) => put(['games', pin, 'seen', pid], true);
const gone = (pin, pid, at = Date.now()) => put(['games', pin, 'seen', pid], at);

test('a guest whose invite link opens in an empty browser again gets their seat back (JVVP, 11 Nov)', async () => {
    const pin = lobby();
    await join(pin, 'host', 'u-host', undefined, undefined, ANDROID);
    const first = await join(pin, 'Noa', 'u-noa-1', undefined, undefined, IPHONE);
    assert.strictEqual(db.games[pin].agents[first.pid], IPHONE, 'the seat keeps its browser string');
    here(pin, first.pid);
    db.games[pin].state = { id: 2, timestamp: Date.now() };
    db.games[pin].players[first.pid].score = 1200;
    // The chat app's browser closes; the database marks the page gone. She taps the link again:
    // a new empty browser, a new anonymous uid, no player id.
    gone(pin, first.pid);
    const again = await join(pin, 'Noa', 'u-noa-2', undefined, undefined, IPHONE);
    assert.strictEqual(again.pid, first.pid, 'the old seat, not a second one');
    assert.strictEqual(count(pin), 2);
    assert.strictEqual(seats(pin)[first.pid].score, 1200, 'with her score');
    assert.strictEqual(seats(pin)[first.pid].uid, 'u-noa-2', 'the seat moves to the new browser');
    // A reload in the new browser finds the seat by its player id, as any phone's does.
    here(pin, first.pid);
    const reload = await join(pin, 'Noa', 'u-noa-2', undefined, first.pid, IPHONE);
    assert.strictEqual(reload.pid, first.pid);
    assert.strictEqual(count(pin), 2);
});

test('name spacing and case do not matter, the name typed now is kept', async () => {
    const pin = lobby();
    const first = await join(pin, 'Noa  K', 'u1', undefined, undefined, IPHONE);
    gone(pin, first.pid);
    const again = await join(pin, ' noa k ', 'u2', undefined, undefined, IPHONE);
    assert.strictEqual(again.pid, first.pid);
    assert.strictEqual(count(pin), 1);
});

test('two players with one name who are both here stay two seats', async () => {
    const pin = lobby();
    const a = await join(pin, 'dan', 'u-dan-a', undefined, undefined, IPHONE);
    here(pin, a.pid);
    // Another Dan, on the same model of phone, joins the same game.
    const b = await join(pin, 'dan', 'u-dan-b', undefined, undefined, IPHONE);
    assert.notStrictEqual(b.pid, a.pid);
    here(pin, b.pid);
    assert.strictEqual(count(pin), 2);
    assert.strictEqual(seats(pin)[a.pid].uid, 'u-dan-a', 'the first Dan keeps his seat');
    // Both still here: a third join with the name is a third seat, never one of theirs.
    const c = await join(pin, 'dan', 'u-dan-c', undefined, undefined, IPHONE);
    assert.ok(c.pid !== a.pid && c.pid !== b.pid);
    assert.strictEqual(count(pin), 3);
});

test('two quiet seats with the name are too many to choose from: a new seat', async () => {
    const pin = lobby();
    const a = await join(pin, 'dan', 'u-a', undefined, undefined, IPHONE);
    const b = await join(pin, 'dan', 'u-b', undefined, undefined, IPHONE);
    gone(pin, a.pid);
    gone(pin, b.pid);
    const c = await join(pin, 'dan', 'u-c', undefined, undefined, IPHONE);
    assert.ok(c.pid !== a.pid && c.pid !== b.pid);
    assert.strictEqual(count(pin), 3);
});

test('a different browser string, a page still here, or no seen mark: a new seat as before', async () => {
    const pin = lobby();
    const a = await join(pin, 'maya', 'u1', undefined, undefined, IPHONE);
    gone(pin, a.pid);
    const otherPhone = await join(pin, 'maya', 'u2', undefined, undefined, ANDROID);
    assert.notStrictEqual(otherPhone.pid, a.pid, 'another browser string');

    const pin2 = lobby();
    const b = await join(pin2, 'maya', 'u1', undefined, undefined, IPHONE);
    here(pin2, b.pid);
    const stillHere = await join(pin2, 'maya', 'u2', undefined, undefined, IPHONE);
    assert.notStrictEqual(stillHere.pid, b.pid, 'the old page is still connected');

    const pin3 = lobby();
    const c = await join(pin3, 'maya', 'u1', undefined, undefined, IPHONE);
    // An older page writes no seen mark: its seat is never given away by name.
    const noMark = await join(pin3, 'maya', 'u2', undefined, undefined, IPHONE);
    assert.notStrictEqual(noMark.pid, c.pid, 'no seen mark');

    const pin4 = lobby();
    const d = await join(pin4, 'maya', 'u1');
    gone(pin4, d.pid);
    const noAgent = await join(pin4, 'maya', 'u2');
    assert.notStrictEqual(noAgent.pid, d.pid, 'no browser string on either join');
});

test('a browser that brings a player id (it has played before) is not matched by name', async () => {
    const pin = lobby();
    const a = await join(pin, 'lior', 'u1', undefined, undefined, IPHONE);
    gone(pin, a.pid);
    const b = await join(pin, 'lior', 'u2', undefined, 'some-old-pid', IPHONE);
    assert.notStrictEqual(b.pid, a.pid);
    assert.strictEqual(count(pin), 2);
});

test('a finished game takes nobody back by name', async () => {
    const pin = lobby();
    const a = await join(pin, 'roni', 'u1', undefined, undefined, IPHONE);
    gone(pin, a.pid);
    db.games[pin].state = { id: 6, timestamp: Date.now() - 60 * 60 * 1000 };
    await assert.rejects(join(pin, 'roni', 'u2', undefined, undefined, IPHONE));
});

test('a seat given back by name is given back at a full table', async () => {
    const pin = lobby();
    const pids = [];
    for (let i = 1; i <= 8; i++) pids.push((await join(pin, 'p' + i, 'u' + i, undefined, undefined, IPHONE)).pid);
    gone(pin, pids[4]);
    const back = await join(pin, 'p5', 'u5-new', undefined, undefined, IPHONE);
    assert.strictEqual(back.pid, pids[4]);
    await assert.rejects(join(pin, 'p9', 'u9', undefined, undefined, IPHONE), e => e.code === 'GAME_IS_FULL');
});

test('seatByName and cleanAgent on their own', () => {
    assert.strictEqual(cleanAgent('  '), undefined);
    assert.strictEqual(cleanAgent(42), undefined);
    assert.strictEqual(cleanAgent('x'.repeat(AGENT_MAX + 50)).length, AGENT_MAX);
    const game = {
        players: { p1: { nickname: 'abcdefghi', uid: 'u', score: 0 } },
        agents: { p1: IPHONE }, seen: { p1: 1 },
    };
    // The name is cut as the seat's was (9 characters).
    assert.strictEqual(seatByName(game, 'abcdefghijkl', IPHONE), 'p1');
    assert.strictEqual(seatByName(game, '', IPHONE), undefined);
    assert.strictEqual(seatByName({}, 'a', IPHONE), undefined);
    assert.strictEqual(seatByName(game, 'abcdefghi', IPHONE + ' '), 'p1', 'trimmed like the stored one');
});

test('Replay carries each seat\'s browser string', () => {
    const game = {
        state: { id: 6, timestamp: 1 }, locale: 'en', totalQ: 9, qids: {}, presenter: false,
        players: { p1: { nickname: 'a', uid: 'u1', score: 5 }, p2: { nickname: 'b', uid: 'u2', score: 1 } },
        lastSent: { p1: true, p2: true },
        agents: { p1: IPHONE, p2: ANDROID, gone: 'x' },
    };
    const forked = createFork('OLD1', game, ['q1'], 'u1', 'p1', undefined, false, 'NEW1');
    assert.deepStrictEqual(forked.agents, { p1: IPHONE, p2: ANDROID });
});

test('only the sign-in that holds a seat may read or write its mark (database rules)', () => {
    // A signed-out write could mark a connected player gone, and let a namesake take her seat.
    // emulator-rejoin.js checks the same against the real rules engine.
    const fs = require('fs');
    const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'database-rules.json'), 'utf8'));
    const seen = rules.rules.games.$pin.seen.$pid;
    const owner = "auth != null && root.child('games').child($pin).child('players').child($pid).child('uid').val() === auth.uid";
    assert.strictEqual(seen['.read'], owner);
    assert.ok(seen['.write'].startsWith(owner + ' && '), seen['.write']);
    assert.ok(/newData\.val\(\) === true \|\| \(newData\.isNumber\(\) && newData\.val\(\) <= now\)/.test(seen['.write']));
    assert.deepStrictEqual(Object.keys(rules.rules.games.$pin.seen), ['$pid'], 'no rule on the whole list');
    assert.strictEqual('agents' in rules.rules.games.$pin, false, 'browser strings stay server-only');
});
