// The test mark: a game created from a test link (?via=test, ?via=test-...) says so in every
// usage row it writes, with no new BigQuery column: campaign on opened_games and closed_games,
// via = 'test' on users. Replays and crew rematches keep it. See DEPLOYING.md, "Test games".
// Runs the compiled functions (dist/) against an in-memory database and a fake BigQuery.
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');
const fs = require('fs');
const ts = require('typescript');

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

const { isTestCampaign } = require(path.join(__dirname, '..', 'dist', 'game-model'));
const { createCrew, crewRematch } = require(path.join(dist, 'crew'));

async function play(pin) {
    db.games[pin].state = { id: RoundIntro, timestamp: Date.now() };
    await analytics.onStateChange(pin);
    db.games[pin].state = { id: ScoreBoardFinal, timestamp: Date.now() };
    await analytics.onStateChange(pin);
}

test('test and test-<name> are test tags; nothing else is', () => {
    for (const tag of ['test', 'TEST', ' test ', 'test-hanukkah', 'test-qa-2']) {
        assert.strictEqual(isTestCampaign(tag), true, tag);
    }
    for (const tag of ['testing', 'fb-test', 'contest', 'fb-he-hanukkah', 'test_1', 'test one', '', null, undefined, 7, { a: 1 }]) {
        assert.strictEqual(isTestCampaign(tag), false, String(tag));
    }
});

test('the client keeps ?via=test as the campaign of the games the tab creates', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'src', 'app', 'services', 'join-source.ts'), 'utf8');
    const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
    const m = { exports: {} };
    new Function('exports', 'module', 'window', js)(m.exports, m, {});
    assert.strictEqual(m.exports.readCampaign('?via=test'), 'test');
    assert.strictEqual(m.exports.readCampaign('?lang=he&via=test-qa-lobby'), 'test-qa-lobby');
});

test('a game created from a test link marks its started, finished and join rows', async () => {
    seedQuestions();
    rows.length = 0;
    const created = await call('newGame', { locale: 'en', count: 5, uid: 'tester1', campaign: 'test' });
    const pin = created.body.pin;
    assert.strictEqual(db.games[pin].campaign, 'test');

    await join(pin, 'Dana', 'tester1');
    await join(pin, 'Avi', 'tester2');
    // Whatever the join's source, and under any nickname, the row says test. A lower-case PIN too.
    await call('onJoinGame', { uid: 'tester1', pin, nickname: 'Dana', via: 'host' }, { 'x-forwarded-for': '1.2.3.4' });
    await call('onJoinGame', { uid: 'tester2', pin: pin.toLowerCase(), nickname: 'Avi', via: 'qr' }, {});
    await call('onJoinGame', { uid: 'tester3', pin, nickname: 'Noa' }, {});
    assert.deepStrictEqual(take('users').map(r => r.via), ['test', 'test', 'test']);
    assert.deepStrictEqual(take('users').map(r => r.pin), [pin, pin.toLowerCase(), pin]);

    await play(pin);
    assert.strictEqual(take('opened_games')[0].campaign, 'test');
    assert.strictEqual(take('closed_games')[0].campaign, 'test');
});

test('a real game is not marked: joins keep their source, a post tag stays a post tag', async () => {
    seedQuestions();
    rows.length = 0;
    const plain = (await call('newGame', { locale: 'en', count: 5, uid: 'host1' })).body.pin;
    const post = (await call('newGame', { locale: 'he', count: 5, uid: 'host2', campaign: 'fb-he-hanukkah' })).body.pin;
    await call('onJoinGame', { uid: 'u1', pin: plain, nickname: 'Alice', via: 'qr' }, {});
    await call('onJoinGame', { uid: 'u2', pin: post, nickname: 'Ben', via: 'link' }, {});
    // A client cannot mark a join by itself, and an odd or unknown PIN never breaks the row.
    await call('onJoinGame', { uid: 'u3', pin: plain, nickname: 'x', via: 'test' }, {});
    await call('onJoinGame', { uid: 'u4', pin: 'ZZZZ', nickname: 'x', via: 'pin' }, {});
    await call('onJoinGame', { uid: 'u5', pin: { a: 1 }, nickname: 'x', via: 'pin' }, {});
    await call('onJoinGame', { uid: 'u6', nickname: 'x', via: 'pin' }, {});
    assert.deepStrictEqual(take('users').map(r => r.via), ['qr', 'link', 'other', 'pin', 'pin', 'pin']);

    await join(plain, 'a', 'u1');
    await join(post, 'b', 'u2');
    await play(plain);
    await play(post);
    assert.deepStrictEqual(take('opened_games').map(r => r.campaign), [null, 'fb-he-hanukkah']);
});

test('Replay keeps the test mark, and still drops a post tag', async () => {
    seedQuestions();
    rows.length = 0;
    const first = await newGame('en', 5, 'tester1', { campaign: 'test-qa-lobby' });
    await join(first, 'Dana', 'tester1');
    await join(first, 'Avi', 'tester2');
    await fork(first, 'tester2');
    const second = db.games[first].fork;
    assert.strictEqual(db.games[second].campaign, 'test-qa-lobby');
    await fork(second, 'tester1');
    const third = db.games[second].fork;
    assert.strictEqual(db.games[third].campaign, 'test-qa-lobby');

    await call('onJoinGame', { uid: 'tester1', pin: third, nickname: 'Dana', via: 'replay' }, {});
    assert.deepStrictEqual(take('users').map(r => r.via), ['test']);
    await play(third);
    assert.strictEqual(take('opened_games')[0].campaign, 'test-qa-lobby');
    assert.strictEqual(take('opened_games')[0].origin, 'replay');

    const post = await newGame('en', 5, 'host1', { campaign: 'fb-he-hanukkah' });
    await join(post, 'a', 'host1');
    await fork(post, 'host1');
    assert.strictEqual('campaign' in db.games[db.games[post].fork], false);
});

test('a crew saved from a test game is a test crew: its rematch is marked; a real crew is not', async () => {
    seedQuestions();
    rows.length = 0;
    const pin = await newGame('en', 5, 'tester1', { campaign: 'test' });
    await join(pin, 'Dana', 'tester1');
    await join(pin, 'Avi', 'tester2');
    db.games[pin].state = { id: ScoreBoardFinal, timestamp: Date.now() };
    const crew = await createCrew(pin, 'QA crew', 'tester1');
    assert.strictEqual(db.crews[crew.id].test, 'test');
    const rematch = await crewRematch(crew.id, 'tester1');
    assert.strictEqual(db.games[rematch.pin].campaign, 'test');
    assert.strictEqual(db.games[rematch.pin].origin, 'crew');
    await call('onJoinGame', { uid: 'tester1', pin: rematch.pin, nickname: 'Dana', via: 'crew' }, {});
    assert.deepStrictEqual(take('users').map(r => r.via), ['test']);

    const real = await newGame('en', 5, 'host1');
    await join(real, 'a', 'host1');
    await join(real, 'b', 'guest1');
    db.games[real].state = { id: ScoreBoardFinal, timestamp: Date.now() };
    const realCrew = await createCrew(real, 'Friday', 'host1');
    assert.strictEqual('test' in db.crews[realCrew.id], false);
    const realRematch = await crewRematch(realCrew.id, 'host1');
    assert.strictEqual('campaign' in db.games[realRematch.pin], false);
});

test('the join row is still written when the game cannot be read', async () => {
    rows.length = 0;
    const once = fakeFirebase.gamesRef.child;
    fakeFirebase.gamesRef.child = () => { throw new Error('database down'); };
    const error = console.error;
    console.error = () => {};
    try {
        await analytics.onJoinGame('u', '1.2.3.4', 'ua', 'ABCD', 'n', 'qr');
    } finally {
        fakeFirebase.gamesRef.child = once;
        console.error = error;
    }
    assert.deepStrictEqual(take('users').map(r => r.via), ['qr']);
});
