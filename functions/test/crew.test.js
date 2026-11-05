// Saved crews: save after a game, standings across games, one-tap rematch.
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
const crew = require(path.join(dist, 'crew'));
const model = require(path.join(__dirname, '..', 'dist', 'game-model'));
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

const GameStaging = 0, RoundIntro = 1, ScoreBoardFinal = 6;
const log = console.log;
console.log = () => {};
test.after(() => { console.log = log; });

function seedQuestions() {
    db.gameCounter = 200;
    db.questions = {};
    for (let i = 0; i < 30; i++) db.questions['q' + i] = { lang: 'en', questionText: 'x', realAnswer: 'y', fakeAnswers: [], citation: '' };
}

// Plays a game to its final scoreboard with these [nickname, uid, score] players.
async function playGame(players, pin) {
    pin = pin || await newGame('en', 5, players[0][1]);
    for (const [nick, uid] of players) {
        if (!Object.values(db.games[pin].players || {}).some(p => p.nickname === nick)) await join(pin, nick, uid);
    }
    for (const p of Object.values(db.games[pin].players)) {
        const row = players.find(x => x[0] === p.nickname);
        p.score = row ? row[2] : 0;
    }
    db.games[pin].state = { id: ScoreBoardFinal, timestamp: Date.now() };
    await analytics.onStateChange(pin);
    return pin;
}

test('a finished game saves as a crew with this game as its first result', async () => {
    seedQuestions();
    const pin = await playGame([['Dana', 'u1', 3000], ['Avi', 'u2', 1500], ['Noa', 'u3', 500]]);
    const r = await call('createCrew', { pin, name: '  The   Cohens ', uid: 'u1' });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(r.body.name, 'The Cohens');
    const c = db.crews[r.body.id];
    assert.match(r.body.id, /^[a-z2-9]{6}$/);
    assert.strictEqual(db.games[pin].crew, r.body.id);
    assert.strictEqual(c.gameCount, 1);
    assert.deepStrictEqual(Object.keys(c.members).sort(), ['avi', 'dana', 'noa']);
    assert.strictEqual(c.members.dana.wins, 1);
    assert.strictEqual(c.members.avi.wins, 0);
    assert.strictEqual(c.members.dana.points, 3000);
    assert.deepStrictEqual(c.members.dana.uids, { u1: true });
    assert.strictEqual(c.creator, 'u1');

    // a second phone saving the same game gets the same crew
    const again = await call('createCrew', { pin, name: 'Other name', uid: 'u2' });
    assert.strictEqual(again.body.id, r.body.id);
    assert.strictEqual(again.body.name, 'The Cohens');
    assert.strictEqual(Object.keys(db.crews).filter(id => db.crews[id]).length >= 1, true);
});

test('saving needs a name and a finished game', async () => {
    seedQuestions();
    const pin = await newGame('en', 5, 'u1');
    await join(pin, 'Dana', 'u1');
    await join(pin, 'Avi', 'u2');
    assert.strictEqual((await call('createCrew', { pin, name: 'x' })).body.code, 'GAME_NOT_FINISHED');
    db.games[pin].state = { id: ScoreBoardFinal, timestamp: Date.now() };
    assert.strictEqual((await call('createCrew', { pin, name: '   ' })).body.code, 'BAD_NAME');
    assert.strictEqual((await call('createCrew', { pin: 'ZZZZ', name: 'x' })).body.code, 'GAME_NOT_EXIST');
    const long = await call('createCrew', { pin, name: 'a'.repeat(60) });
    assert.strictEqual(long.body.name.length, crew.CREW_NAME_MAX);
});

test('Replay keeps counting for the crew, and each game counts once', async () => {
    seedQuestions();
    const first = await playGame([['Dana', 'u1', 3000], ['Avi', 'u2', 1500]]);
    const { body } = await call('createCrew', { pin: first, name: 'Office Friday', uid: 'u1' });
    await fork(first, 'u2');
    const second = db.games[first].fork;
    assert.strictEqual(db.games[second].crew, body.id);
    await playGame([['Dana', 'u1', 500], ['Avi', 'u2', 2500]], second);
    // the trigger can fire twice for the same final scoreboard
    await analytics.onStateChange(second);
    const c = db.crews[body.id];
    assert.strictEqual(c.gameCount, 2);
    assert.strictEqual(c.members.dana.wins, 1);
    assert.strictEqual(c.members.avi.wins, 1);
    assert.strictEqual(c.members.avi.points, 4000);
    assert.strictEqual(model.crewLeaderLine(c, 'en'), 'Avi and Dana are tied 1 to 1');
});

test('a crew saved after Replay was pressed also claims the replayed game', async () => {
    seedQuestions();
    const first = await playGame([['Dana', 'u1', 3000], ['Avi', 'u2', 1500]]);
    await fork(first, 'u1');
    const { body } = await call('createCrew', { pin: first, name: 'Late savers' });
    assert.strictEqual(db.games[db.games[first].fork].crew, body.id);
});

test('Rematch makes one crew game with fresh questions, and later taps join the same lobby', async () => {
    seedQuestions();
    const first = await playGame([['Dana', 'u1', 3000], ['Avi', 'u2', 1500], ['Noa', 'u3', 200]]);
    const { body } = await call('createCrew', { pin: first, name: 'The Cohens', uid: 'u1' });
    db.seenQuestions = { u1: { q0: Date.now(), q1: Date.now() }, u3: { q2: Date.now() } };

    const r = await call('crewRematch', { crew: body.id.toUpperCase(), uid: 'u3' });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(r.body.created, true);
    const g = db.games[r.body.pin];
    assert.strictEqual(g.crew, body.id);
    assert.strictEqual(g.origin, 'crew');
    assert.strictEqual(g.creator, 'u3');
    assert.strictEqual(g.locale, 'en');
    assert.strictEqual(g.totalQ, 5);
    assert.strictEqual(g.state.id, GameStaging);
    const qids = Object.values(g.qids);
    assert.ok(!qids.includes('q0') && !qids.includes('q1') && !qids.includes('q2'), 'no question a member has seen');
    assert.strictEqual(db.crews[body.id].rematch.pin, r.body.pin);

    const again = await call('crewRematch', { crew: body.id, uid: 'u2' });
    assert.deepStrictEqual(again.body, { pin: r.body.pin, created: false });

    // once that game starts, the next tap makes a new game
    db.games[r.body.pin].state = { id: RoundIntro, timestamp: Date.now() };
    const third = await call('crewRematch', { crew: body.id, uid: 'u2' });
    assert.strictEqual(third.body.created, true);
    assert.notStrictEqual(third.body.pin, r.body.pin);

    assert.strictEqual((await call('crewRematch', { crew: 'nope99' })).body.code, 'CREW_NOT_EXIST');
    assert.strictEqual((await call('crewRematch', { crew: '../x' })).body.code, 'CREW_NOT_EXIST');
});

test('a rematch with under half the crew does not count, and newcomers to a counted game join the crew', async () => {
    seedQuestions();
    const first = await playGame([['Dana', 'u1', 3000], ['Avi', 'u2', 1500], ['Noa', 'u3', 200], ['Ben', 'u4', 100]]);
    const { body } = await call('createCrew', { pin: first, name: 'Big group' });

    const solo = (await call('crewRematch', { crew: body.id, uid: 'u1' })).body.pin;
    await playGame([['Dana', 'u1', 9000], ['Stranger', 'u9', 10]], solo);
    let c = db.crews[body.id];
    assert.strictEqual(c.gameCount, 1);
    assert.strictEqual(c.games[solo].counted, false);
    assert.ok(!c.members.stranger);

    const real = (await call('crewRematch', { crew: body.id, uid: 'u2' })).body.pin;
    await playGame([['dana ', 'u5', 100], ['Avi', 'u2', 2000], ['Maya', 'u6', 50]], real);
    c = db.crews[body.id];
    assert.strictEqual(c.gameCount, 2);
    assert.strictEqual(c.members.dana.games, 2, 'nickname match ignores case and spaces');
    assert.deepStrictEqual(c.members.dana.uids, { u1: true, u5: true });
    assert.strictEqual(c.members.maya.games, 1);
    assert.strictEqual(model.crewStandings(c)[0].nickname, 'Avi', 'tied on wins, more points');
    assert.strictEqual(c.members.dana.nickname, 'dana');
});

test('crew games carry crew_id to BigQuery and crew joins are tagged "crew"', async () => {
    seedQuestions();
    assert.strictEqual(analytics.cleanVia('crew'), 'crew');
    const first = await playGame([['Dana', 'u1', 3000], ['Avi', 'u2', 1500]]);
    const { body } = await call('createCrew', { pin: first, name: 'Tagged' });
    const pin = (await call('crewRematch', { crew: body.id, uid: 'u1' })).body.pin;
    rows.length = 0;
    await join(pin, 'Dana', 'u1');
    await join(pin, 'Avi', 'u2');
    db.games[pin].state = { id: RoundIntro, timestamp: Date.now() };
    db.games[pin].questionIndex = 0;
    await analytics.onStateChange(pin);
    const opened = rows.find(r => r.table === 'opened_games').row;
    assert.strictEqual(opened.crew_id, body.id);
    assert.strictEqual(opened.origin, 'crew');
});

test('crewMemberKey is a safe database key', () => {
    assert.strictEqual(model.crewMemberKey('  Dana  B '), 'dana b');
    assert.strictEqual(model.crewMemberKey('a.b#c$d[e]f/g'), 'a_b_c_d_e_f_g');
    assert.strictEqual(model.crewMemberKey(''), '_');
});
