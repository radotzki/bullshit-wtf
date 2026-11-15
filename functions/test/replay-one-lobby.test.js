// One next game for a finished game, whichever REMATCH a phone pressed (controllers/next-game.ts).
// A crew game's final screen has two: Replay, and the crew page's REMATCH. Each kept its own "one
// lobby" rule, so phones pressing both at once split into lobbies of their own (15 Nov: JVAX made JVAA
// by Replay, and JVAY and JVAZ by the crew page, one phone each).
// Runs the compiled functions against an in-memory database whose every read and write takes a few
// turns of the event loop, like the real one, so calls that run at once interleave:
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
const crew = require(path.join(dist, 'crew'));

const GameStaging = 0, RoundIntro = 1, ScoreBoardFinal = 6;
const log = console.log;
console.log = () => {};
test.after(() => { console.log = log; });

function seedQuestions() {
    db.gameCounter = db.gameCounter || 300;
    db.questions = {};
    for (let i = 0; i < 40; i++) db.questions['q' + i] = { lang: 'en', questionText: 'x', realAnswer: 'y', fakeAnswers: [], citation: '' };
}

const KEYS = ['A', 'B', 'C', 'D'].map(c => c.repeat(24));

/** A finished game of four phones (u1..u4); with `saved`, the group saved it as a crew on its final screen. */
async function finishedGame(saved) {
    seedQuestions();
    const pin = await newGame('en', 5, 'u1');
    const pids = {};
    for (const n of [1, 2, 3, 4]) pids['u' + n] = (await join(pin, 'p' + n, 'u' + n)).pid;
    db.games[pin].state = { id: ScoreBoardFinal, timestamp: Date.now() };
    let id = null;
    if (saved) {
        const made = await crew.createCrew(pin, 'Friends ' + pin, 'u1');
        id = made.id;
        assert.strictEqual(db.games[pin].crew, id, 'the game counts for its crew');
    }
    return { pin, pids, crew: id };
}

/** The pin each phone ends up in: Replay's answer, or the crew page's. */
const replay = (g, n) => fork(g.pin, 'u' + n, g.pids['u' + n], KEYS[n - 1]).then(r => r.pin);
const crewPage = (g, n) => crew.crewRematch(g.crew, 'u' + n, KEYS[n - 1], true).then(r => r.pin);

const staging = pin => db.games[pin] && db.games[pin].state.id === GameStaging;

test('Replay and the crew page pressed at once make one game (15 Nov, JVAX)', async () => {
    const g = await finishedGame(true);
    const pins = await Promise.all([crewPage(g, 1), replay(g, 2), crewPage(g, 3)]);
    assert.strictEqual(new Set(pins).size, 1, `every phone in one lobby, got ${pins.join(', ')}`);
    assert.ok(staging(pins[0]));
    // The phones still on the final screen follow it, and the crew page shows it.
    assert.strictEqual(db.games[g.pin].fork, pins[0]);
    assert.strictEqual(db.crews[g.crew].rematch.pin, pins[0]);
});

test('two taps on the crew page at once open one lobby (JVAY and JVAZ)', async () => {
    const g = await finishedGame(true);
    const pins = await Promise.all([crewPage(g, 1), crewPage(g, 4)]);
    assert.strictEqual(pins[0], pins[1], `one lobby, got ${pins.join(', ')}`);
    assert.strictEqual(db.games[g.pin].fork, pins[0], 'the final screen offers it');
});

test('the crew page, after a Replay, goes to the Replay', async () => {
    const g = await finishedGame(true);
    const r = await replay(g, 2);
    const c = await crewPage(g, 1);
    assert.strictEqual(c, r);
    assert.strictEqual(db.games[r].parent, g.pin, 'it is the Replay, with the seats of the finished game');
});

test('a Replay, after the crew page opened a lobby, goes to that lobby and may start it', async () => {
    const g = await finishedGame(true);
    const c = await crewPage(g, 1);
    const r = await fork(g.pin, 'u2', g.pids.u2, KEYS[1]);
    assert.strictEqual(r.pin, c);
    assert.strictEqual(r.host, true);
    assert.strictEqual(r.hostKey, db.games[c].hostKey, 'the phone that pressed Replay gets the lobby key');
    assert.strictEqual(db.games[g.pin].fork, c);
    // A second Replay a moment later goes there too.
    assert.strictEqual(await replay(g, 3), c);
});

test('a crew lobby left from before this game is not its Replay', async () => {
    seedQuestions();
    const g = await finishedGame(true);
    // An hour-old crew lobby, still waiting (nobody started it).
    const old = await newGame('en', 5, 'u9', { crew: g.crew });
    db.crews[g.crew].rematch = { pin: old, time: Date.now() - 60 * 60 * 1000 };
    db.games[g.pin].state.timestamp = Date.now();
    const r = await replay(g, 2);
    assert.notStrictEqual(r, old);
    assert.strictEqual(db.games[r].parent, g.pin);
    // and the crew page now goes to the Replay, not to the old lobby
    assert.strictEqual(await crewPage(g, 1), r);
});

test('a started crew lobby is not reused', async () => {
    const g = await finishedGame(true);
    const c = await crewPage(g, 1);
    db.games[c].state = { id: RoundIntro, timestamp: Date.now() };
    const again = await crewPage(g, 2);
    assert.notStrictEqual(again, c);
    assert.ok(staging(again));
});

test('a game with no crew: Replays pressed at once still make one game', async () => {
    const g = await finishedGame(false);
    const pins = await Promise.all([replay(g, 1), replay(g, 2), replay(g, 3)]);
    assert.strictEqual(new Set(pins).size, 1, `one Replay, got ${pins.join(', ')}`);
    assert.strictEqual(db.games[g.pin].fork, pins[0]);
});
