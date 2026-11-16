// "Same table tomorrow": PLAY AGAIN, SAME TABLE on a finished game's recap reopens one lobby for that
// game's link (controllers/same-table.ts). Runs the compiled functions against an in-memory database
// whose every read and write takes a few turns of the event loop, like the real one, so calls that run
// at once interleave:
//   npm run build && npm test
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');

// ---- in-memory Realtime Database, asynchronous ----
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
    if (v === null || (typeof v === 'object' && !Object.keys(v).length)) delete node[key]; else node[key] = v;
}
// A small fixed sequence of delays, so each run interleaves the same way.
let tickN = 0;
const lag = () => new Promise(r => setTimeout(r, [1, 3, 2, 5, 1, 4][tickN++ % 6]));
let pushId = 0;
function ref(parts) {
    return {
        child: (p) => ref(parts.concat(String(p).split('/'))),
        once: async () => { await lag(); const v = clone(at(parts)); return { val: () => v }; },
        set: async (v) => { await lag(); put(parts, v); },
        update: async (v) => { await lag(); Object.keys(v).forEach(k => put(parts.concat(k.split('/')), v[k])); },
        push: (v) => { const key = 'k' + (++pushId); if (v !== undefined) put(parts.concat(key), v); return { key }; },
        // Atomic, as in the real database; undefined aborts and leaves the value as it is.
        transaction: (fn, done) => {
            lag().then(() => {
                const v = fn(clone(at(parts)));
                if (v !== undefined) put(parts, v);
                const now = clone(at(parts));
                done(null, v !== undefined, { val: () => now });
            });
        },
        orderByChild: () => ({ equalTo: (lang) => ({ once: async () => {
            await lag();
            const v = Object.fromEntries(Object.entries(at(parts) || {}).filter(([, q]) => q.lang === lang));
            return { val: () => v };
        } }) }),
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
const { newGame } = require(path.join(dist, 'new-game'));
const { fork } = require(path.join(dist, 'fork'));
const { join } = require(path.join(dist, 'join'));
const { sameTable } = require(path.join(dist, 'same-table'));
const { validateGameName } = require(path.join(dist, 'validate-game-name'));
const { nightAfterHalf } = require(path.join(dist, 'night-after'));
const crew = require(path.join(dist, 'crew'));
const oldGames = require(path.join(dist, 'old-games'));

const GameStaging = 0, RoundIntro = 1, ScoreBoardFinal = 6;
const H = 60 * 60 * 1000;
const log = console.log;
console.log = () => {};
test.after(() => { console.log = log; });

function seedQuestions() {
    db.gameCounter = db.gameCounter || 300;
    db.questions = db.questions || {};
    for (let i = 0; i < 40; i++) db.questions['q' + i] = { lang: 'en', questionText: 'x', realAnswer: 'y', fakeAnswers: [], citation: '' };
}

const KEYS = ['A', 'B', 'C', 'D', 'E'].map(c => c.repeat(24));

/** A game of four phones (u1..u4) that reached its final scoreboard `ago` ms ago; `saved`: a crew's game. */
async function finishedGame(ago, saved) {
    seedQuestions();
    const pin = await newGame('en', 5, 'u1');
    const pids = {};
    for (const n of [1, 2, 3, 4]) pids['u' + n] = (await join(pin, 'p' + n, 'u' + n)).pid;
    let id = null;
    if (saved) {
        db.games[pin].state = { id: ScoreBoardFinal, timestamp: Date.now() };
        id = (await crew.createCrew(pin, 'Friends ' + pin, 'u1')).id;
    }
    db.games[pin].state = { id: ScoreBoardFinal, timestamp: Date.now() - ago };
    db.games[pin].timestamp = Date.now() - ago - H;
    db.games[pin].totalQ = 5;
    return { pin, pids, crew: id };
}

/** Phone n of the finished game presses PLAY AGAIN, SAME TABLE. */
const again = (g, n) => sameTable(g.pin, 'u' + n, g.pids['u' + n], KEYS[n - 1]);
const staging = pin => !!(db.games[pin] && db.games[pin].state.id === GameStaging);

test('two players tap PLAY AGAIN, SAME TABLE at once the next evening: one lobby, both may start it', async () => {
    const g = await finishedGame(20 * H);
    const [a, b] = await Promise.all([again(g, 1), again(g, 3)]);
    assert.strictEqual(a.pin, b.pin, `one lobby, got ${a.pin} and ${b.pin}`);
    assert.ok(staging(a.pin));
    assert.strictEqual(a.host && b.host, true, 'both phones that pressed may start it');
    const lobby = db.games[a.pin];
    assert.strictEqual(lobby.parent, g.pin);
    assert.strictEqual(lobby.origin, 'table');
    assert.strictEqual(lobby.qids.length, 5, 'fresh questions, as many as last time');
    // The presser's seat alone; the second presser holds the lobby's key and takes a seat by the link.
    assert.deepStrictEqual(Object.keys(lobby.players), [a.hostKey ? g.pids.u3 : g.pids.u1]);
    assert.strictEqual(db.games[g.pin].fork, a.pin, 'the link sends the next tap there');
    assert.strictEqual(db.games[g.pin].forking, a.pin);
});

test('five taps at once, with no Replay before: still one lobby', async () => {
    const g = await finishedGame(26 * H);
    const pins = (await Promise.all([1, 2, 3, 4, 2].map(n => again(g, n)))).map(r => r.pin);
    assert.strictEqual(new Set(pins).size, 1, `one lobby, got ${pins.join(', ')}`);
    assert.ok(staging(pins[0]));
});

test('last night\'s Replay was played: the link opens a new lobby, and two taps at once share it', async () => {
    const g = await finishedGame(20 * H);
    const r = await fork(g.pin, 'u1', g.pids.u1, KEYS[0]);
    db.games[r.pin].state = { id: ScoreBoardFinal, timestamp: Date.now() - 19 * H };
    const [a, b] = await Promise.all([again(g, 2), again(g, 4)]);
    assert.strictEqual(a.pin, b.pin);
    assert.notStrictEqual(a.pin, r.pin, 'the played Replay traps nobody');
    assert.ok(staging(a.pin));
    assert.strictEqual(db.games[g.pin].fork, a.pin);
});

test('a lobby that started, or went stale, is replaced; an open one is reused', async () => {
    const g = await finishedGame(20 * H);
    const first = await again(g, 1);
    // Open: the next tap goes there, and a player gets its key.
    const second = await again(g, 2);
    assert.strictEqual(second.pin, first.pin);
    assert.strictEqual(second.hostKey, db.games[first.pin].hostKey);
    // Started: the next tap makes another.
    db.games[first.pin].state = { id: RoundIntro, timestamp: Date.now() };
    const third = await again(g, 3);
    assert.notStrictEqual(third.pin, first.pin);
    assert.ok(staging(third.pin));
    // Waiting for 7 hours with nobody: stale, replaced.
    const old = Date.now() - 7 * H;
    Object.assign(db.games[third.pin], { timestamp: old, state: { id: GameStaging, timestamp: old } });
    delete db.games[third.pin].hostSeen;
    const fourth = await again(g, 4);
    assert.notStrictEqual(fourth.pin, third.pin);
    assert.ok(staging(fourth.pin));
});

test('a full lobby is replaced too', async () => {
    const g = await finishedGame(20 * H);
    const first = await again(g, 1);
    for (let i = 0; i < 11; i++) db.games[first.pin].players['x' + i] = { nickname: 'x' + i, uid: 'x' + i, score: 0 };
    const next = await again(g, 2);
    assert.notStrictEqual(next.pin, first.pin);
});

test('only a player, within the recap\'s week, and only for a finished game', async () => {
    const g = await finishedGame(20 * H);
    await assert.rejects(sameTable(g.pin, 'stranger', undefined, KEYS[0]), e => e.code === 'NOT_A_PLAYER');
    const old = await finishedGame(8 * 24 * H);
    await assert.rejects(again(old, 1), e => e.code === 'NOT_A_PLAYER');
    await assert.rejects(sameTable('ZZZZ', 'u1'), e => e.code === 'GAME_NOT_EXIST');
    assert.strictEqual(db.games[g.pin].forking, undefined, 'nothing claimed');
    // A browser known by its sign-in alone (its last seat lost) is still a player.
    const r = await sameTable(g.pin, 'u2', undefined, KEYS[1]);
    assert.deepStrictEqual(Object.keys(db.games[r.pin].players), [g.pids.u2]);
});

test('the chat link: a chat member lands in the lobby; the recap beside it in the new half only', async () => {
    let g, h;
    do { g = await finishedGame(20 * H); } while (!nightAfterHalf(g.pin));
    do { h = await finishedGame(20 * H); } while (nightAfterHalf(h.pin));
    const a = await again(g, 1);
    const b = await again(h, 1);
    const seen = await validateGameName(g.pin, 'friend').catch(e => e);
    assert.strictEqual(seen.code, 'GAME_OVER');
    assert.strictEqual(seen.rematch, a.pin);
    assert.strictEqual(seen.nightAfter.half, 'new');
    assert.strictEqual(seen.nightAfter.player, false);
    const control = await validateGameName(h.pin, 'friend').catch(e => e);
    assert.strictEqual(control.rematch, b.pin);
    assert.strictEqual(control.nightAfter, undefined, 'the other half keeps today\'s page');
    // The friend joins the lobby with a seat of their own.
    const joined = await join(a.pin, 'friend', 'friend');
    assert.ok(db.games[a.pin].players[joined.pid]);
    // Once it started, the link no longer sends anyone there.
    db.games[a.pin].state = { id: RoundIntro, timestamp: Date.now() };
    const late = await validateGameName(g.pin, 'late').catch(e => e);
    assert.strictEqual(late.rematch, undefined);
    assert.ok(late.nightAfter, 'the recap, with START YOUR OWN GAME');
});

test('Replay from the final screen and the crew page land in the same table', async () => {
    const g = await finishedGame(20 * H, true);
    const a = await again(g, 1);
    const r = await fork(g.pin, 'u2', g.pids.u2, KEYS[1]);
    assert.strictEqual(r.pin, a.pin);
    const c = await crew.crewRematch(g.crew, 'u3', KEYS[2], true);
    assert.strictEqual(c.pin, a.pin);
});

test('a crew page lobby opened tonight is the table', async () => {
    const g = await finishedGame(20 * H, true);
    const c = await crew.crewRematch(g.crew, 'u3', KEYS[2], true);
    const [a, b] = await Promise.all([again(g, 1), again(g, 2)]);
    assert.strictEqual(a.pin, c.pin);
    assert.strictEqual(b.pin, c.pin);
    assert.strictEqual(db.games[g.pin].fork, c.pin);
});

test('a game the old-games sweep moved still reopens, with its players known', async () => {
    const g = await finishedGame(20 * H);
    assert.strictEqual(await oldGames.moveGame(g.pin, Date.now()), true);
    assert.strictEqual(db.games[g.pin].players, undefined);
    const [a, b] = await Promise.all([again(g, 1), again(g, 2)]);
    assert.strictEqual(a.pin, b.pin);
    assert.ok(staging(a.pin));
    assert.strictEqual(db.games[g.pin].players, undefined, 'nothing put back where strangers read');
});
