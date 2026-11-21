// One game per Discord call (controllers/discord-table.ts): everyone who opens the Activity in one
// voice call lands in one game, and a rematch moves the call. Same in-memory database as
// same-table.test.js, whose reads and writes take a few turns of the event loop, so calls interleave:
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
        // Atomic, as in the real database; undefined aborts and leaves the value as it is. As the real
        // SDK does for a row it holds no copy of, the first call gets null; only if that call goes on
        // does the server, finding another value, call it again with the real one.
        transaction: (fn, done) => {
            lag().then(() => {
                const real = clone(at(parts));
                let v = fn(null);
                if (v !== undefined && real !== null) v = fn(real);
                if (v !== undefined) put(parts, v);
                const now = clone(at(parts));
                done(null, v !== undefined, { val: () => v === undefined && real !== null ? null : now });
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
    discordRef: ref(['discord']),
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
const { discordTable, cleanInstanceId, DISCORD_CAMPAIGN } = require(path.join(dist, 'discord-table'));
const { newGame } = require(path.join(dist, 'new-game'));
const { fork } = require(path.join(dist, 'fork'));
const { join } = require(path.join(dist, 'join'));
const { NEXT_GAME_WAIT_MS } = require(path.join(dist, 'next-game'));
const { STALE_MS } = require(path.join(dist, 'game-over'));

const GameStaging = 0, RoundIntro = 1, ScoreBoardFinal = 6;
const log = console.log;
console.log = () => {};
test.after(() => { console.log = log; });

function seedQuestions() {
    db.gameCounter = db.gameCounter || 300;
    db.questions = db.questions || {};
    for (let i = 0; i < 40; i++) {
        db.questions['q' + i] = { lang: 'en', questionText: 'x', realAnswer: 'y', fakeAnswers: [], citation: '' };
        db.questions['h' + i] = { lang: 'he', questionText: 'x', realAnswer: 'y', fakeAnswers: [], citation: '' };
    }
}
seedQuestions();

let n = 0;
/** A new instance id, of the form Discord gives. */
const call = () => `i-13${String(++n).padStart(17, '0')}-gc-912952092627435520-912954213460467732`;
const games = () => Object.keys(db.games || {});
const KEY = 'K'.repeat(24);

test('the first phone in a call makes the game; every phone after gets the same PIN', async () => {
    const id = call();
    const first = await discordTable(id, 'en', { uid: 'u1', hostKey: KEY, serverStart: true });
    assert.strictEqual(first.created, true);
    const game = db.games[first.pin];
    assert.ok(game, 'the game is written');
    assert.strictEqual(game.state.id, GameStaging);
    assert.strictEqual(game.locale, 'en');
    assert.strictEqual(game.campaign, DISCORD_CAMPAIGN);
    assert.strictEqual(game.campaign, 'discord-activity');
    assert.strictEqual(game.hostKey, KEY, 'the phone that made it hosts it');
    assert.strictEqual(game.creator, 'u1');
    assert.strictEqual(game.qids.length, 7);
    assert.strictEqual(db.discord[id].pin, first.pin);

    const second = await discordTable(id, 'en', { uid: 'u2', hostKey: 'L'.repeat(24) });
    assert.deepStrictEqual(second, { pin: first.pin, created: false });
    assert.strictEqual(db.games[first.pin].hostKey, KEY, 'a later phone takes no host key');
});

test('six phones open the Activity at the same moment: one game, made once', async () => {
    const id = call();
    const before = games().length;
    const results = await Promise.all([1, 2, 3, 4, 5, 6].map(i => discordTable(id, 'he', { uid: 'u' + i })));
    const pins = new Set(results.map(r => r.pin));
    assert.strictEqual(pins.size, 1, `one game, got ${[...pins].join(', ')}`);
    assert.strictEqual(results.filter(r => r.created).length, 1, 'exactly one phone made it');
    assert.strictEqual(games().length, before + 1, 'no second game was written');
    assert.strictEqual(db.games[results[0].pin].locale, 'he');
});

test('two calls get two games', async () => {
    const [a, b] = await Promise.all([discordTable(call(), 'en'), discordTable(call(), 'en')]);
    assert.notStrictEqual(a.pin, b.pin);
});

test('a finished game with no rematch does not trap the call: a new game is made', async () => {
    const id = call();
    const first = await discordTable(id, 'en');
    db.games[first.pin].state = { id: ScoreBoardFinal, timestamp: Date.now() - 60 * 1000 };
    const next = await discordTable(id, 'en');
    assert.strictEqual(next.created, true);
    assert.notStrictEqual(next.pin, first.pin);
    assert.strictEqual(db.discord[id].pin, next.pin);
    assert.strictEqual(db.games[first.pin].state.id, ScoreBoardFinal, 'the old game is left as it was');
});

test('a lobby that sat still past STALE_MS is replaced', async () => {
    const id = call();
    const first = await discordTable(id, 'en');
    const old = Date.now() - STALE_MS - 1000;
    db.games[first.pin].state.timestamp = old;
    db.games[first.pin].timestamp = old;
    const next = await discordTable(id, 'en');
    assert.strictEqual(next.created, true);
    assert.notStrictEqual(next.pin, first.pin);
});

test('a game under way keeps the call: a latecomer lands in it', async () => {
    const id = call();
    const first = await discordTable(id, 'en');
    db.games[first.pin].state = { id: RoundIntro, timestamp: Date.now() };
    assert.deepStrictEqual(await discordTable(id, 'en'), { pin: first.pin, created: false });
});

test('REMATCH moves the call to the new PIN, once, for every phone that opens it after', async () => {
    const id = call();
    const first = await discordTable(id, 'en', { uid: 'u1' });
    const pids = {};
    for (const i of [1, 2, 3]) pids[i] = (await join(first.pin, 'p' + i, 'u' + i)).pid;
    db.games[first.pin].state = { id: ScoreBoardFinal, timestamp: Date.now() };
    const rematch = await fork(first.pin, 'u2', pids[2]);
    assert.notStrictEqual(rematch.pin, first.pin);

    const before = games().length;
    const results = await Promise.all([1, 2, 3, 4].map(() => discordTable(id, 'en')));
    results.forEach(r => assert.deepStrictEqual(r, { pin: rematch.pin, created: false }));
    assert.strictEqual(db.discord[id].pin, rematch.pin, 'the call points to the rematch');
    assert.strictEqual(games().length, before, 'no game was made');
});

test('two rematches in a row are followed to the latest', async () => {
    const id = call();
    const first = await discordTable(id, 'en', { uid: 'u1' });
    const pid = (await join(first.pin, 'p1', 'u1')).pid;
    db.games[first.pin].state = { id: ScoreBoardFinal, timestamp: Date.now() };
    const second = await fork(first.pin, 'u1', pid);
    db.games[second.pin].state = { id: ScoreBoardFinal, timestamp: Date.now() };
    const third = await fork(second.pin, 'u1', pid);
    assert.deepStrictEqual(await discordTable(id, 'en'), { pin: third.pin, created: false });
});

test('a rematch that is over too: a new game', async () => {
    const id = call();
    const first = await discordTable(id, 'en', { uid: 'u1' });
    const pid = (await join(first.pin, 'p1', 'u1')).pid;
    db.games[first.pin].state = { id: ScoreBoardFinal, timestamp: Date.now() };
    const second = await fork(first.pin, 'u1', pid);
    db.games[second.pin].state = { id: ScoreBoardFinal, timestamp: Date.now() };
    const next = await discordTable(id, 'en');
    assert.strictEqual(next.created, true);
    assert.ok(next.pin !== first.pin && next.pin !== second.pin);
});

test('a claim whose game is being written is waited for, not replaced', async () => {
    const id = call();
    db.discord = db.discord || {};
    db.discord[id] = { pin: 'ZZZA', time: Date.now() };
    setTimeout(() => newGame('en', 5, 'u9', { pin: 'ZZZA' }), 600);
    assert.deepStrictEqual(await discordTable(id, 'en'), { pin: 'ZZZA', created: false });
});

test('a claim never written, once old, is replaced', async () => {
    const id = call();
    db.discord = db.discord || {};
    db.discord[id] = { pin: 'ZZZB', time: Date.now() - NEXT_GAME_WAIT_MS - 1000 };
    const next = await discordTable(id, 'en');
    assert.strictEqual(next.created, true);
    assert.notStrictEqual(next.pin, 'ZZZB');
});

test('a rematch chain that goes round ends, with a new game', async () => {
    const id = call();
    db.games.ZZZC = { state: { id: ScoreBoardFinal, timestamp: Date.now() }, timestamp: Date.now(), fork: 'ZZZD' };
    db.games.ZZZD = { state: { id: ScoreBoardFinal, timestamp: Date.now() }, timestamp: Date.now(), fork: 'ZZZC' };
    db.discord[id] = { pin: 'ZZZC', time: Date.now() };
    const next = await discordTable(id, 'en');
    assert.strictEqual(next.created, true);
});

test('only a play-test tag is taken from the phone; any other tag is discord-activity', async () => {
    const t = await discordTable(call(), 'en', { campaign: 'test-discord' });
    assert.strictEqual(db.games[t.pin].campaign, 'test-discord');
    const other = await discordTable(call(), 'en', { campaign: 'after-game' });
    assert.strictEqual(db.games[other.pin].campaign, 'discord-activity');
});

test('instance ids are checked for length and characters, and nothing is written for a bad one', async () => {
    const before = JSON.stringify(db.discord);
    const counter = db.gameCounter;
    const bad = [undefined, null, 12345678, {}, ['i-1234567890'], '', 'short', 'x'.repeat(129),
        '../games/ABCD', 'abc/defghij', 'abc.defghij', 'abc#defghij', 'abc$defghij', 'abc[defghij]',
        'abc defghij', 'i-123456789\n', 'קוד-אחד-ארוך'];
    for (const id of bad) {
        await assert.rejects(discordTable(id, 'en'), e => e.code === 'BAD_REQUEST', `refused ${JSON.stringify(id)}`);
        assert.strictEqual(cleanInstanceId(id), undefined);
    }
    assert.strictEqual(JSON.stringify(db.discord), before, 'no row written');
    assert.strictEqual(db.gameCounter, counter, 'no PIN taken');
    assert.ok(cleanInstanceId('i-1234567890123456789-gc-912952092627435520-912954213460467732'));
    assert.ok(cleanInstanceId('x'.repeat(128)));
});

test('a language the game has no questions in is refused', async () => {
    for (const lang of [undefined, '', 'fr', 'EN', 'en/x', 7]) {
        await assert.rejects(discordTable(call(), lang), e => e.code === 'BAD_REQUEST');
    }
});

test('the call keeps its game language: a later phone set to another language joins the same game', async () => {
    const id = call();
    const first = await discordTable(id, 'he');
    assert.deepStrictEqual(await discordTable(id, 'en'), { pin: first.pin, created: false });
});

test('the database rules give discord/ to the server alone', () => {
    const rules = require(path.join(__dirname, '..', '..', 'database-rules.json')).rules;
    assert.deepStrictEqual(rules.discord, {
        '.read': "auth.uid == 'bl-service-worker'",
        '.write': "auth.uid == 'bl-service-worker'",
    });
});
