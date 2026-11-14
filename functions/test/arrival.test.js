// Where a host came from: the arrival a creating phone sends with newGame (first page of the visit,
// referring site, played or hosted before, minutes since the visit began) is cleaned, kept with the
// game where no phone can read it, and written to BigQuery on opened_games, closed_games and the
// host's own users row. See DEPLOYING.md, "Where a host came from".
// Runs the compiled functions (dist/) against an in-memory database and a fake BigQuery.
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
    crewsRef: ref(['crews']),
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


const model = require(path.join(__dirname, '..', 'dist', 'game-model'));
const { arrivalColumns } = require(path.join(dist, 'arrival'));

async function play(pin) {
    db.games[pin].state = { id: RoundIntro, timestamp: Date.now() };
    await analytics.onStateChange(pin);
    db.games[pin].state = { id: ScoreBoardFinal, timestamp: Date.now() };
    await analytics.onStateChange(pin);
}
const COLUMNS = ['first_page', 'referrer', 'played_before', 'hosted_before', 'visit_minutes'];
const arrivalOf = (row) => Object.fromEntries(COLUMNS.map(c => [c, row[c]]));
const NONE = { first_page: null, referrer: null, played_before: null, hosted_before: null, visit_minutes: null };

test('a page is named by its path alone, with every PIN and crew id replaced', () => {
    const page = model.arrivalPage;
    assert.strictEqual(page('/'), '/');
    assert.strictEqual(page('/he'), '/');
    assert.strictEqual(page('/he/'), '/');
    assert.strictEqual(page('/create-game'), '/create-game');
    assert.strictEqual(page('/how-to-play'), '/how-to-play');
    assert.strictEqual(page('/he/hanukkah/'), '/he/hanukkah');
    assert.strictEqual(page('/daily'), '/daily');
    assert.strictEqual(page('/join-game/ABCD'), '/join-game/:pin');
    assert.strictEqual(page('/he/join-game/abcd/'), '/join-game/:pin');
    assert.strictEqual(page('/he/join-game'), '/join-game');
    assert.strictEqual(page('/score-board-final/QRST'), '/score-board-final/:pin');
    assert.strictEqual(page('/present-game/QRST'), '/present-game/:pin');
    assert.strictEqual(page('/c/k3j9'), '/c/:id');
    assert.strictEqual(page('/he/c/k3j9'), '/c/:id');
    // A query string or a fragment is cut off; anything that is not a plain path is dropped.
    assert.strictEqual(page('/join-game/ABCD?via=link&name=Dana#x'), '/join-game/:pin');
    assert.strictEqual(page('/how-to-play?utm_source=x'), '/how-to-play');
    for (const bad of ['', 'how-to-play', 'https://bullshit.wtf/x', '/a b', '/x<script>', '/' + 'a'.repeat(80), null, undefined, 7, {}]) {
        assert.strictEqual(page(bad), undefined, String(bad));
    }
});

test('a referring site is a host name, never an address', () => {
    const ref = model.arrivalRef;
    assert.strictEqual(ref('www.google.com'), 'www.google.com');
    assert.strictEqual(ref(' M.Facebook.com '), 'm.facebook.com');
    assert.strictEqual(ref('com.whatsapp'), 'com.whatsapp');
    for (const bad of ['https://www.google.com', 'www.google.com/search', 'a.com?q=1', 'user@a.com', '1234', '', 'a'.repeat(61), null, 7, {}]) {
        assert.strictEqual(ref(bad), undefined, String(bad));
    }
});

test('the server keeps only the five fields of an arrival, each in its own form', () => {
    assert.deepStrictEqual(model.cleanArrival({
        page: '/he/join-game/ABCD?name=Dana', ref: 'WWW.Google.com', played: true, hosted: false, minutes: 12.9,
        uid: 'u1', url: 'https://x.example/full?token=1', nickname: 'Dana',
    }), { page: '/join-game/:pin', ref: 'www.google.com', played: true, hosted: false, minutes: 12 });
    assert.deepStrictEqual(model.cleanArrival({ page: 'https://evil.example/', ref: 'https://evil.example/a', played: 'yes', hosted: 1, minutes: -3 }), undefined);
    assert.deepStrictEqual(model.cleanArrival({ page: '/', ref: null, played: false, hosted: false, minutes: 9e9 }),
        { page: '/', played: false, hosted: false, minutes: 43200 });
    for (const none of [null, undefined, 'x', 7, [], {}]) {
        assert.strictEqual(model.cleanArrival(none), undefined, JSON.stringify(none));
    }
    assert.deepStrictEqual(arrivalColumns(undefined), NONE);
    assert.deepStrictEqual(arrivalColumns({ page: '/', played: false }),
        { first_page: '/', referrer: null, played_before: false, hosted_before: null, visit_minutes: null });
});

test('a game created from a search page carries where its host came from, on every row of the game', async () => {
    seedQuestions();
    rows.length = 0;
    const created = await call('newGame', {
        locale: 'en', count: 5, uid: 'host1',
        arrival: { page: '/how-to-play', ref: 'www.google.com', played: false, hosted: false, minutes: 2 },
    });
    assert.strictEqual(created.code, 200);
    const pin = created.body.pin;
    assert.deepStrictEqual(db.games[pin].arrival, { page: '/how-to-play', ref: 'www.google.com', played: false, hosted: false, minutes: 2 });

    const want = { first_page: '/how-to-play', referrer: 'www.google.com', played_before: false, hosted_before: false, visit_minutes: 2 };
    // The host's own join says it too, so a lobby that never starts still has it. A guest's join does not.
    await call('onJoinGame', { uid: 'host1', pin, nickname: 'Dana', via: 'host' }, {});
    await call('onJoinGame', { uid: 'guest1', pin: pin.toLowerCase(), nickname: 'Avi', via: 'link' }, {});
    const users = take('users');
    assert.deepStrictEqual(arrivalOf(users[0]), want);
    assert.strictEqual(users[0].via, 'host');
    COLUMNS.forEach(c => assert.ok(!(c in users[1]), `a guest's join has no ${c}`));

    await join(pin, 'Dana', 'host1');
    await join(pin, 'Avi', 'guest1');
    await play(pin);
    assert.deepStrictEqual(arrivalOf(take('opened_games')[0]), want);
    assert.deepStrictEqual(arrivalOf(take('closed_games')[0]), want);
    assert.strictEqual(take('opened_games')[0].campaign, null);
    log('# where a host came from', JSON.stringify(take('opened_games')[0]));
});

test('a guest who came in by an invite link and hosts later: the PIN of the link is not kept', async () => {
    seedQuestions();
    rows.length = 0;
    const pin = (await call('newGame', {
        locale: 'he', count: 5, uid: 'guest1', campaign: 'after-game',
        arrival: { page: '/he/join-game/QRST', ref: null, played: true, hosted: false, minutes: 4321 },
    })).body.pin;
    assert.deepStrictEqual(db.games[pin].arrival, { page: '/join-game/:pin', played: true, hosted: false, minutes: 4321 });
    assert.ok(JSON.stringify(db.games[pin]).indexOf('QRST') < 0);
    await join(pin, 'a', 'guest1');
    await join(pin, 'b', 'u2');
    await play(pin);
    assert.deepStrictEqual(arrivalOf(take('opened_games')[0]),
        { first_page: '/join-game/:pin', referrer: null, played_before: true, hosted_before: false, visit_minutes: 4321 });
    assert.strictEqual(take('opened_games')[0].campaign, 'after-game');
});

test('an older site, or junk in place of the arrival: the game is made as before and the columns are empty', async () => {
    seedQuestions();
    rows.length = 0;
    for (const arrival of [undefined, null, 'x', 7, { page: 'https://evil.example/?q=1', ref: 'a/b' }, { url: 'https://x.example' }]) {
        const created = await call('newGame', { locale: 'en', count: 5, uid: 'host1', arrival });
        assert.strictEqual(created.code, 200, JSON.stringify(arrival));
        const pin = created.body.pin;
        assert.ok(!('arrival' in db.games[pin]), JSON.stringify(arrival));
        await call('onJoinGame', { uid: 'host1', pin, nickname: 'Dana', via: 'host' }, {});
        await join(pin, 'a', 'host1');
        await join(pin, 'b', 'u2');
        await play(pin);
    }
    take('opened_games').forEach(r => assert.deepStrictEqual(arrivalOf(r), NONE));
    take('users').forEach(r => COLUMNS.forEach(c => assert.ok(!(c in r))));
});

test('Replay and a crew rematch do not carry the arrival: it counts the first game only', async () => {
    seedQuestions();
    rows.length = 0;
    const first = (await call('newGame', {
        locale: 'en', count: 5, uid: 'host1', arrival: { page: '/', ref: 'www.google.com', played: false, hosted: false, minutes: 1 },
    })).body.pin;
    await join(first, 'Dana', 'host1');
    await join(first, 'Avi', 'u2');
    await fork(first, 'u2');
    const second = db.games[first].fork;
    assert.ok(!('arrival' in db.games[second]));
    await call('onJoinGame', { uid: 'u2', pin: second, nickname: 'Avi', via: 'host' }, {});
    COLUMNS.forEach(c => assert.ok(!(c in take('users')[0])));
    await play(second);
    assert.deepStrictEqual(arrivalOf(take('opened_games')[0]), NONE);
    assert.strictEqual(take('opened_games')[0].origin, 'replay');
});

test('a test game keeps its mark: its rows carry the arrival and are still left out by the test filters', async () => {
    seedQuestions();
    rows.length = 0;
    const pin = (await call('newGame', {
        locale: 'en', count: 5, uid: 'tester1', campaign: 'test',
        arrival: { page: '/how-to-play', ref: 'www.google.com', played: false, hosted: false, minutes: 0 },
    })).body.pin;
    await call('onJoinGame', { uid: 'tester1', pin, nickname: 'Dana', via: 'host' }, {});
    assert.strictEqual(take('users')[0].via, 'test');
    assert.strictEqual(take('users')[0].first_page, '/how-to-play');
    await join(pin, 'a', 'tester1');
    await join(pin, 'b', 'tester2');
    await play(pin);
    assert.strictEqual(take('opened_games')[0].campaign, 'test');
});

test('no phone can read the arrival: the database rules name no such child of a game', () => {
    const rules = JSON.parse(require('fs').readFileSync(path.join(__dirname, '..', '..', 'database-rules.json'), 'utf8'));
    const game = rules.rules.games.$pin;
    assert.strictEqual(game['.read'], "auth.uid == 'bl-service-worker'");
    assert.ok(!('arrival' in game));
});
