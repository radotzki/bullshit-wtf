// A full lobby whose host steps away (specs: full-lobby-start). The host's lobby page says when it is
// hidden (hostHere with away), guests are told, and in a lobby of 5 or more anyone may start once the
// host has been away 45 s (startVerdict 'host-away'). How each game left the lobby goes to
// opened_games.start_by. A game where nobody sends a lie or a pick in question 1 ends there (idle).
// Runs the compiled functions (dist/) against an in-memory database and a fake BigQuery, so it needs
// no Firebase project or credentials:
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
let keyCount = 0;
function ref(parts) {
    return {
        child: (p) => ref(parts.concat(String(p).split('/'))),
        once: async () => ({ val: () => clone(at(parts)) }),
        set: async (v) => put(parts, v),
        update: async (v) => Object.keys(v).forEach(k => put(parts.concat(k.split('/')), v[k])),
        push: (v) => { const key = 'k' + (++keyCount); if (v !== undefined) put(parts.concat(key), v); return { key }; },
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
    dataset() { return { table: (table) => ({ insert: async (row, opts) => rows.push({ table, row, opts }) }) }; }
}

// ---- fake firebase-functions v1 and cors: keep each HTTP handler to call directly ----
const fakeFunctions = {
    https: { onRequest: (h) => ({ __handler: h }) },
    database: { ref: () => ({ onWrite: (h) => ({ __trigger: h }) }) },
};
fakeFunctions.runWith = () => fakeFunctions;
const realLoad = Module._load;
Module._load = function (request) {
    if (request === 'firebase-functions/v1') return fakeFunctions;
    if (request === 'cors') return () => (req, res, next) => next();
    if (request === '@google-cloud/bigquery') return { BigQuery: FakeBigQuery };
    if (/[\\/]firebase$/.test(request)) return fakeFirebase;
    return realLoad.apply(this, arguments);
};

const dist = path.join(__dirname, '..', 'dist', 'controllers');
const { startVerdict, HOST_AWAY_MS, HOST_AWAY_MIN_PLAYERS, HOST_GONE_MS } = require(path.join(dist, 'start'));
const { advance, nobodyPlayed } = require(path.join(dist, 'tick'));
const { answer } = require(path.join(dist, 'answer'));
const { onStateChange } = require(path.join(dist, 'analytics'));
const api = require(path.join(__dirname, '..', 'dist', 'index'));

const S = { GameStaging: 0, RoundIntro: 1, ShowQuestion: 2, ShowAnswers: 3, RevealTheTruth: 4, ScoreBoard: 5, ScoreBoardFinal: 6 };
const KEY = 'K'.repeat(24), OTHER = 'X'.repeat(24);
console.log = () => {};
console.error = () => {};

function call(name, body, extra = {}) {
    return new Promise((resolve) => {
        const res = {
            code: 200,
            status(c) { this.code = c; return this; },
            send(b) { resolve({ code: this.code, body: b }); return this; },
        };
        api[name].__handler(Object.assign({ body, headers: {} }, extra), res);
    });
}

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

/** A hosted lobby, as newGame and join leave it: the host (with the key) and `guests` friends. */
async function lobby(guests, locale = 'en') {
    seedQuestions();
    const pin = (await call('newGame', { locale, count: 5, hostKey: KEY, serverStart: true })).body.pin;
    await call('join', { pin, nickname: 'aviv', uid: 0, hostKey: KEY });
    const pids = [];
    for (let i = 0; i < guests; i++) pids.push((await call('join', { pin, nickname: 'guest' + i, uid: 0 })).body.pid);
    return { pin, pids };
}
const game = pin => db.games[pin];

// ---- the away report ----

test('the host page hidden: hostHere with away keeps the first moment, a report from the screen clears it', async () => {
    const { pin } = await lobby(4);
    assert.strictEqual('hostAwaySince' in game(pin), false, 'the host joining is on screen');
    const r = await call('hostHere', { pin, hostKey: KEY, away: true });
    assert.deepStrictEqual(r.body, { seen: true });
    const since = game(pin).hostAwaySince;
    assert.ok(typeof since === 'number' && Date.now() - since < 1000);
    // A ping from the hidden page (Android timers) keeps the phone seen, and the first moment.
    game(pin).hostAwaySince = since - 30000;
    game(pin).hostSeen = 1;
    await call('hostHere', { pin, hostKey: KEY, away: true });
    assert.strictEqual(game(pin).hostAwaySince, since - 30000);
    assert.ok(game(pin).hostSeen > 1, 'an away ping is still a ping: the 5-minute rule is as before');
    // Back on screen.
    await call('hostHere', { pin, hostKey: KEY });
    assert.strictEqual('hostAwaySince' in game(pin), false);
});

test('the hidden page sends text/plain JSON (keepalive, no preflight): the server reads it', async () => {
    const { pin } = await lobby(4);
    const text = JSON.stringify({ pin, hostKey: KEY, away: true });
    const r = await call('hostHere', text, { rawBody: Buffer.from(text) });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(typeof game(pin).hostAwaySince, 'number');
    // Junk in the body is a bad request, not a crash, and changes nothing.
    await call('hostHere', { pin, hostKey: KEY });
    assert.strictEqual((await call('hostHere', 'not json', { rawBody: Buffer.from('not json') })).code, 400);
    assert.strictEqual('hostAwaySince' in game(pin), false);
});

test('only the host key can say the host is away', async () => {
    const { pin } = await lobby(4);
    for (const hostKey of [undefined, '', OTHER]) {
        const r = await call('hostHere', { pin, hostKey, away: true });
        assert.strictEqual(r.code, 403);
    }
    assert.strictEqual('hostAwaySince' in game(pin), false);
});

test('the host joining again (a reload) is on screen: away is cleared', async () => {
    const { pin } = await lobby(4);
    await call('hostHere', { pin, hostKey: KEY, away: true });
    await call('join', { pin, nickname: 'aviv', uid: 0, hostKey: KEY });
    assert.strictEqual('hostAwaySince' in game(pin), false);
});

test('a big screen the host made of their computer is never away', async () => {
    const { pin } = await lobby(5);
    await call('hostToBigScreen', { pin, hostKey: KEY });
    await call('hostHere', { pin, hostKey: KEY, away: true });
    assert.strictEqual('hostAwaySince' in game(pin), false);
    game(pin).hostAwaySince = Date.now() - HOST_AWAY_MS * 10;
    assert.strictEqual(startVerdict(game(pin), undefined, Date.now()), 'not-host', 'no seated host to be away');
});

// ---- who may start ----

test('startVerdict host-away: a seated host hidden 45 s, 5 or more players, serverStart', () => {
    const now = 50000000;
    const players = n => {
        const p = { h: { nickname: 'aviv', uid: 0, score: 0, host: true } };
        for (let i = 1; i < n; i++) p['g' + i] = { nickname: 'g' + i, uid: 0, score: 0 };
        return p;
    };
    const g = (extra) => Object.assign({ hostKey: KEY, hasHost: true, serverStart: true, hostSeen: now - 1000,
        state: { id: S.GameStaging, timestamp: now - 60000 }, players: players(5) }, extra);
    assert.strictEqual(HOST_AWAY_MS, 45 * 1000);
    assert.strictEqual(HOST_AWAY_MIN_PLAYERS, 5);
    assert.strictEqual(startVerdict(g({ hostAwaySince: now - HOST_AWAY_MS }), undefined, now), 'host-away');
    assert.strictEqual(startVerdict(g({ hostAwaySince: now - HOST_AWAY_MS + 1 }), undefined, now), 'not-host', 'not before 45 s');
    assert.strictEqual(startVerdict(g({ hostAwaySince: now - HOST_AWAY_MS * 4, players: players(4) }), undefined, now), 'not-host', 'a lobby of 4');
    assert.strictEqual(startVerdict(g({ hostAwaySince: now - HOST_AWAY_MS * 4, players: players(12) }), undefined, now), 'host-away');
    assert.strictEqual(startVerdict(g({}), undefined, now), 'not-host', 'the host is on screen');
    assert.strictEqual(startVerdict(g({ hostAwaySince: String(now - HOST_AWAY_MS * 4) }), undefined, now), 'not-host');
    assert.strictEqual(startVerdict(g({ hostAwaySince: now - HOST_AWAY_MS * 4, serverStart: undefined }), undefined, now), 'not-host');
    assert.strictEqual(startVerdict(g({ hostAwaySince: now - HOST_AWAY_MS * 4 }), KEY, now), 'host');
    // Unchanged: a dead phone (5 minutes of no reports) opens START in any lobby size.
    assert.strictEqual(startVerdict(g({ hostSeen: now - HOST_GONE_MS, players: players(3) }), undefined, now), 'host-gone');
});

test('a guest of a lobby of 9 starts once the host has been away 45 s, once, and start_by says host-away', async () => {
    const { pin, pids } = await lobby(8, 'he');
    await call('hostHere', { pin, hostKey: KEY, away: true });
    assert.strictEqual((await call('startGame', { pin })).code, 403, 'a guest the moment the host hides');
    assert.strictEqual(game(pin).state.id, S.GameStaging);

    game(pin).hostAwaySince = Date.now() - HOST_AWAY_MS - 500;
    const [a, b] = await Promise.all([call('startGame', { pin }), call('startGame', { pin })]);
    assert.deepStrictEqual([a.code, b.code], [200, 200]);
    // Two guests at the same moment: the lobby is left once (advance takes the phase), not twice.
    assert.strictEqual(game(pin).state.id, S.RoundIntro, 'one step from the lobby, not two');
    assert.strictEqual(Object.keys(game(pin).advanceTaken || {}).length, 1);
    // A press after the start is a no-op, not an error.
    assert.deepStrictEqual((await call('startGame', { pin })).body, { started: false });
    assert.strictEqual(game(pin).startBy, 'host-away');
    assert.strictEqual(Object.keys(game(pin).players).length, 9, 'no seat lost');

    rows.length = 0;
    await onStateChange(pin);
    const opened = rows.filter(r => r.table === 'opened_games');
    assert.strictEqual(opened.length, 1);
    assert.strictEqual(opened[0].row.start_by, 'host-away');
    assert.strictEqual(opened[0].row.players, 9);
    assert.strictEqual(opened[0].opts.ignoreUnknownValues, true, 'the row lands before the column is added');

    // A friend the host invited meanwhile can still join the started game (join.ts has no lobby-only check).
    const late = await call('join', { pin, nickname: 'late', uid: 0 });
    assert.strictEqual(late.code, 200);
    assert.ok(pids.length === 8);
});

test('a lobby of 4 keeps host-only START however long the host is away (short of 5 minutes)', async () => {
    const { pin } = await lobby(3);
    await call('hostHere', { pin, hostKey: KEY, away: true });
    game(pin).hostAwaySince = Date.now() - HOST_AWAY_MS * 6;
    assert.strictEqual((await call('startGame', { pin })).code, 403);
    assert.strictEqual(game(pin).state.id, S.GameStaging);
    assert.strictEqual('startBy' in game(pin), false);
});

test('the host back on screen takes START back from the room', async () => {
    const { pin } = await lobby(6);
    await call('hostHere', { pin, hostKey: KEY, away: true });
    game(pin).hostAwaySince = Date.now() - HOST_AWAY_MS * 2;
    await call('hostHere', { pin, hostKey: KEY });
    assert.strictEqual((await call('startGame', { pin })).code, 403);
    const r = await call('startGame', { pin, hostKey: KEY });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(game(pin).startBy, 'host');
});

test('a test game (?via=test) started by the room is still a test game in every row', async () => {
    seedQuestions();
    const pin = (await call('newGame', { locale: 'en', count: 5, hostKey: KEY, serverStart: true, campaign: 'test' })).body.pin;
    await call('join', { pin, nickname: 'aviv', uid: 0, hostKey: KEY, via: 'test' });
    for (let i = 0; i < 4; i++) await call('join', { pin, nickname: 'g' + i, uid: 0, via: 'test' });
    await call('hostHere', { pin, hostKey: KEY, away: true });
    game(pin).hostAwaySince = Date.now() - HOST_AWAY_MS - 1;
    assert.strictEqual((await call('startGame', { pin })).code, 200);
    rows.length = 0;
    await onStateChange(pin);
    const opened = rows.filter(r => r.table === 'opened_games')[0].row;
    assert.strictEqual(opened.start_by, 'host-away');
    assert.strictEqual(game(pin).campaign, 'test');
    assert.strictEqual(opened.campaign, 'test', 'the test mark rides along as before');
});

// ---- a game nobody plays ends after question 1 ----

/** Move on from the current phase, as the phase timer does, and the usage rows' trigger. */
async function next(pin) {
    await advance(pin, Object.assign({}, game(pin).state));
    await onStateChange(pin);
    return game(pin).state.id;
}

async function toScoreBoard(pin, lies) {
    while (game(pin).state.id !== S.ScoreBoard) {
        if (game(pin).state.id === S.ShowQuestion && lies) {
            for (const pid of lies) await answer(pin, pid, `${pid} lie`);
        }
        await next(pin);
    }
}

test('nobody sends a lie or a pick in question 1: the game ends there, idle, with no closed_games row', async () => {
    const { pin } = await lobby(3);
    await call('startGame', { pin, hostKey: KEY });
    rows.length = 0;
    await onStateChange(pin);
    await toScoreBoard(pin, null);
    assert.strictEqual(game(pin).questionIndex, 0);
    assert.strictEqual(await next(pin), S.ScoreBoardFinal);
    assert.strictEqual(game(pin).idle, true);
    assert.strictEqual(rows.filter(r => r.table === 'closed_games').length, 0, 'not counted as played');
    assert.strictEqual(rows.filter(r => r.table === 'opened_games').length, 1, 'it did leave the lobby');
    const q1 = rows.filter(r => r.table === 'question_results');
    assert.strictEqual(q1.length, 1, 'question 1 is still counted, with nothing sent');
});

test('one lie in question 1 is enough: the game plays on', async () => {
    const { pin, pids } = await lobby(3);
    await call('startGame', { pin, hostKey: KEY });
    await toScoreBoard(pin, [pids[0]]);
    await next(pin);
    assert.notStrictEqual(game(pin).state.id, S.ScoreBoardFinal);
    assert.strictEqual(game(pin).questionIndex, 1);
    assert.strictEqual('idle' in game(pin), false);
});

test('nobodyPlayed: question 1 only, a game that keeps played flags, not a taste or a one-question game', () => {
    const base = { questionIndex: 0, playedFrom: 0, totalQ: 9, state: { id: S.ScoreBoard, timestamp: 1 } };
    assert.strictEqual(nobodyPlayed(base), true);
    assert.strictEqual(nobodyPlayed(Object.assign({}, base, { played: { p1: true } })), false);
    assert.strictEqual(nobodyPlayed(Object.assign({}, base, { questionIndex: 1 })), false);
    assert.strictEqual(nobodyPlayed(Object.assign({}, base, { playedFrom: undefined })), false, 'a game from before the release');
    assert.strictEqual(nobodyPlayed(Object.assign({}, base, { totalQ: 1 })), false);
    assert.strictEqual(nobodyPlayed(Object.assign({}, base, { state: { id: S.ScoreBoard, timestamp: 1, taste: { found: 0, length: 5 } } })), false);
    assert.strictEqual(nobodyPlayed(null), false);
});
