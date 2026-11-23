// One seat per AirConsole device (src/seat.js), also when several devices share one browser, as in
// AirConsole's simulator. Run: cd airconsole && npm test
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./bundle');

let S;
test.before(async () => {
    S = await load('src/seat.js');
});

/** A localStorage stand-in. */
function store() {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

test('a seat is remembered per game PIN and per device', () => {
    const s = store();
    S.rememberSeat(s, 'ABCD', 1, 'pid-1');
    S.rememberSeat(s, 'ABCD', 2, 'pid-2');
    assert.strictEqual(S.rememberedSeat(s, 'ABCD', 1), 'pid-1');
    assert.strictEqual(S.rememberedSeat(s, 'ABCD', 2), 'pid-2');
    assert.strictEqual(S.rememberedSeat(s, 'ABCD', 3), null);
    assert.strictEqual(S.rememberedSeat(s, 'WXYZ', 1), null);
});

test('simulated phones in one browser: only the first sends the shared uid, the others none', () => {
    const s = store();
    const connected = [1, 2, 3, 4];
    assert.strictEqual(S.seatUid(s, 'ABCD', 'u1', 1, connected), 'u1');
    assert.strictEqual(S.seatUid(s, 'ABCD', 'u1', 2, connected), null);
    assert.strictEqual(S.seatUid(s, 'ABCD', 'u1', 3, connected), null);
    // The first one again (a reload): still its uid.
    assert.strictEqual(S.seatUid(s, 'ABCD', 'u1', 1, connected), 'u1');
});

test('two uids in one browser (signed in at the same moment): each kept by its own device', () => {
    const s = store();
    const connected = [1, 2, 3];
    assert.strictEqual(S.seatUid(s, 'ABCD', 'u1', 1, connected), 'u1');
    assert.strictEqual(S.seatUid(s, 'ABCD', 'u2', 2, connected), 'u2');
    // Device 3 got u2 from storage: device 2 holds it.
    assert.strictEqual(S.seatUid(s, 'ABCD', 'u2', 3, connected), null);
});

test('a real phone: its own uid, also back under a new device id after the old one left', () => {
    const s = store();
    assert.strictEqual(S.seatUid(s, 'ABCD', 'u1', 2, [1, 2]), 'u1');
    assert.strictEqual(S.seatUid(s, 'ABCD', 'u1', 5, [1, 5]), 'u1');
    assert.strictEqual(S.seatUid(s, 'ABCD', 'u1', 2, [1, 2, 5]), null);
});

test('a new game starts with no claims; no uid or no storage still works', () => {
    const s = store();
    assert.strictEqual(S.seatUid(s, 'ABCD', 'u1', 1, [1, 2]), 'u1');
    assert.strictEqual(S.seatUid(s, 'EFGH', 'u1', 2, [1, 2]), 'u1');
    assert.strictEqual(S.seatUid(s, 'ABCD', null, 1, [1]), null);
    assert.strictEqual(S.seatUid(null, 'ABCD', 'u1', 1, [1]), 'u1');
    const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
    assert.strictEqual(S.seatUid(broken, 'ABCD', 'u1', 1, [1]), 'u1');
    assert.strictEqual(S.rememberedSeat(broken, 'ABCD', 1), null);
    S.rememberSeat(broken, 'ABCD', 1, 'p');
});

test('the seat on the screen: listed, taken by another name, or missing', () => {
    const players = [{ pid: 'p1', nickname: 'Guest 2' }, { pid: 'p2', nickname: 'Guest 5' }];
    assert.strictEqual(S.seatStatus(players, 'p1', 'Guest 2'), 'listed');
    assert.strictEqual(S.seatStatus(players, 'p2', 'Guest 4'), 'taken');
    assert.strictEqual(S.seatStatus(players, 'p3', 'Guest 7'), 'missing');
    assert.strictEqual(S.seatStatus(players, null, 'Guest 7'), 'missing');
    assert.strictEqual(S.seatStatus(undefined, 'p1', 'Guest 2'), 'missing');
});
