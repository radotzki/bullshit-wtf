// INVITE ANOTHER GROUP (controllers/crew.ts createTable): a guest of a finished game makes a crew of
// one with a night, its lobby opens games marked `table`, and its first game counts whoever shows up.
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

function seedQuestions(lang = 'en') {
    db.gameCounter = (db.gameCounter || 200) + 50;
    db.questions = {};
    for (let i = 0; i < 30; i++) db.questions['q' + i] = { lang, questionText: 'x', realAnswer: 'y', fakeAnswers: [], citation: '' };
}

// A finished game with these [nickname, uid, score] players; the first one hosts.
async function finished(players, options = {}, locale = 'en') {
    seedQuestions(locale);
    const pin = await newGame(locale, 5, players[0][1], options);
    for (const [nick, uid] of players) await join(pin, nick, uid);
    for (const p of Object.values(db.games[pin].players)) p.score = players.find(x => x[0] === p.nickname)[2];
    db.games[pin].state = { id: ScoreBoardFinal, timestamp: Date.now() };
    await analytics.onStateChange(pin);
    return pin;
}
const pidOf = (pin, nick) => Object.keys(db.games[pin].players).find(k => db.games[pin].players[k].nickname === nick);

const HOUR = 3600 * 1000;
const friday = () => Math.floor((Date.now() + 5 * 24 * HOUR) / 60000) * 60000;

async function table(locale = 'en', options = {}) {
    const names = locale === 'he' ? ['דנה', 'נועה'] : ['Dana', 'Noa'];
    const pin = await finished([[names[0], 'u1', 3000], [names[1], 'u2', 1500]], options, locale);
    const time = friday();
    const r = await call('createTable', { pin: pin.toLowerCase(), pid: pidOf(pin, names[1]), time: time + 999, uid: 'u2' });
    return { pin, time, r, guest: names[1] };
}

test('a guest makes a table: one member, no game, a night with the guest in, the campaign `table`', async () => {
    const { pin, time, r } = await table();
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(Object.keys(r.body).sort(), ['id', 'name', 'time']);
    assert.strictEqual(r.body.name, "Noa's table");
    assert.strictEqual(r.body.time, time);
    const crew = db.crews[r.body.id];
    assert.strictEqual(crew.name, "Noa's table");
    assert.strictEqual(crew.locale, 'en');
    assert.strictEqual(crew.totalQ, 5);
    assert.strictEqual(crew.gameCount, 0);
    assert.strictEqual(crew.games, undefined);
    assert.strictEqual(crew.campaign, 'table');
    assert.strictEqual(crew.test, undefined);
    assert.strictEqual(crew.creator, 'u2');
    assert.deepStrictEqual(crew.members, { noa: { nickname: 'Noa', games: 0, wins: 0, points: 0, best: 0, uids: { u2: true } } });
    assert.deepStrictEqual(crew.night, { time, by: 'Noa', in: { noa: 'Noa' } });
    // The finished game is not the table's: it belongs to the group that played it.
    assert.strictEqual(db.games[pin].crew, undefined);
});

test('a Hebrew game makes a Hebrew table', async () => {
    const { r } = await table('he');
    assert.strictEqual(r.body.name, 'השולחן של נועה');
    assert.strictEqual(db.crews[r.body.id].locale, 'he');
    assert.strictEqual(model.crewLeaderLine(db.crews[r.body.id], 'he'), 'עוד אין מנצחים. מי לוקח את הראשון?');
});

test('the table name fits a crew name, whatever the nickname', () => {
    assert.strictEqual(crew.tableName('Noa', 'en'), "Noa's table");
    assert.strictEqual(crew.tableName('נועה', 'he'), 'השולחן של נועה');
    assert.ok(crew.tableName('אבגדהוזחט', 'he').length <= crew.CREW_NAME_MAX);
    assert.ok(crew.tableName('WWWWWWWWW', 'en').length <= crew.CREW_NAME_MAX);
});

test('only a player of a finished game can make a table, and only for a time ahead', async () => {
    const pin = await finished([['Dana', 'u1', 3000], ['Noa', 'u2', 1500]]);
    const pid = pidOf(pin, 'Noa');
    const before = Object.keys(db.crews || {}).length;
    assert.strictEqual((await call('createTable', { pin: 'ZZZZ', pid, time: friday() })).body.code, 'GAME_NOT_EXIST');
    assert.strictEqual((await call('createTable', { pin, pid: 'nobody', time: friday() })).body.code, 'NOT_A_PLAYER');
    assert.strictEqual((await call('createTable', { pin, time: friday() })).body.code, 'NOT_A_PLAYER');
    const past = await call('createTable', { pin, pid, time: Date.now() - 2 * HOUR });
    assert.strictEqual(past.code, 400);
    assert.strictEqual(past.body.code, 'BAD_TIME');
    assert.strictEqual((await call('createTable', { pin, pid, time: 'soon' })).body.code, 'BAD_TIME');
    // A refused table leaves nothing behind.
    assert.strictEqual(Object.keys(db.crews || {}).filter(k => db.crews[k]).length, before);

    db.games[pin].state = { id: RoundIntro, timestamp: Date.now() };
    assert.strictEqual((await call('createTable', { pin, pid, time: friday() })).body.code, 'GAME_NOT_FINISHED');
});

test('friends say "I\'m in" on the table\'s night; a friend the table never had is new', async () => {
    const { r } = await table();
    const id = r.body.id;
    const maya = await call('crewNight', { crew: id, nickname: 'Maya', in: true });
    assert.deepStrictEqual(maya.body, { in: true, nickname: 'Maya', isNew: true, count: 2 });
    const omer = await call('crewNight', { crew: id, nickname: 'Omer', in: true });
    assert.strictEqual(omer.body.count, 3);
    assert.deepStrictEqual(model.crewNightNames(db.crews[id]), ['Maya', 'Noa', 'Omer']);
    // Saying "I'm in" seats nobody: the table still has its one member.
    assert.deepStrictEqual(Object.keys(db.crews[id].members), ['noa']);
});

test('the table\'s lobby opens a game marked `table`, and its first game adds everyone who played', async () => {
    const { r } = await table();
    const id = r.body.id;
    seedQuestions();
    const opened = await call('crewRematch', { crew: id, uid: 'u2', hostKey: 'k'.repeat(20), serverStart: true });
    assert.strictEqual(opened.code, 200);
    const pin = opened.body.pin;
    assert.strictEqual(db.games[pin].crew, id);
    assert.strictEqual(db.games[pin].origin, 'crew');
    assert.strictEqual(db.games[pin].campaign, 'table');
    assert.strictEqual(db.games[pin].creator, 'u2');

    for (const [nick, uid] of [['Noa', 'u2'], ['Maya', 'u7'], ['Omer', 'u8'], ['Gil', 'u9']]) await join(pin, nick, uid);
    const scores = { Noa: 1000, Maya: 4000, Omer: 2500, Gil: 0 };
    for (const p of Object.values(db.games[pin].players)) p.score = scores[p.nickname];
    db.games[pin].state = { id: ScoreBoardFinal, timestamp: Date.now() };
    await analytics.onStateChange(pin);

    const saved = db.crews[id];
    assert.strictEqual(saved.gameCount, 1);
    assert.strictEqual(saved.games[pin].counted, true);
    assert.deepStrictEqual(Object.keys(saved.members).sort(), ['gil', 'maya', 'noa', 'omer']);
    assert.strictEqual(saved.members.maya.wins, 1);
    assert.strictEqual(saved.members.noa.games, 1);
    assert.strictEqual(model.crewLeaderLine(saved, 'en'), 'Maya leads 1 to 0');
    // BigQuery: both the opened and the closed row carry the crew and the campaign.
    const closed = rows.filter(x => x.table === 'closed_games' && x.row.id === pin)[0];
    assert.strictEqual(closed.row.campaign, 'table');
    assert.strictEqual(closed.row.crew_id, id);
});

test('a guest who hosts under another name: the first game still counts, and the unused name goes', () => {
    const t = { id: 'x', name: "Noa's table", locale: 'en', totalQ: 5, createdAt: 1, gameCount: 0,
        members: { noa: { nickname: 'Noa', games: 0, wins: 0, points: 0, best: 0 } } };
    model.applyCrewGame(t, 'AAAA', [{ nickname: 'Noa B', score: 900 }, { nickname: 'Maya', score: 500 }], 5);
    assert.strictEqual(t.gameCount, 1);
    assert.deepStrictEqual(Object.keys(t.members).sort(), ['maya', 'noa b']);
    // From its second game on a table is a crew like any other: half of its members must be there.
    model.applyCrewGame(t, 'AAAB', [{ nickname: 'Zed', score: 900 }, { nickname: 'Yan', score: 500 }], 6);
    assert.strictEqual(t.games.AAAB.counted, false);
    assert.strictEqual(t.gameCount, 1);
});

test('a table\'s first game still needs two players, and a saved crew counts as it did', () => {
    const t = { id: 'x', name: 't', locale: 'en', totalQ: 5, createdAt: 1, gameCount: 0,
        members: { noa: { nickname: 'Noa', games: 0, wins: 0, points: 0, best: 0 } } };
    model.applyCrewGame(t, 'AAAA', [{ nickname: 'Noa', score: 900 }], 5);
    assert.strictEqual(t.games.AAAA.counted, false);
    assert.deepStrictEqual(Object.keys(t.members), ['noa']);

    const saved = { id: 'y', name: 'c', locale: 'en', totalQ: 5, createdAt: 1, gameCount: 0, members: {} };
    model.applyCrewGame(saved, 'BBBB', [{ nickname: 'A', score: 2 }, { nickname: 'B', score: 1 }, { nickname: 'C', score: 0 }], 5);
    model.applyCrewGame(saved, 'BBBC', [{ nickname: 'X', score: 2 }, { nickname: 'Y', score: 1 }], 6);
    assert.strictEqual(saved.games.BBBC.counted, false);
    model.applyCrewGame(saved, 'BBBD', [{ nickname: 'A', score: 2 }, { nickname: 'B', score: 1 }], 7);
    assert.strictEqual(saved.games.BBBD.counted, true);
});

test('a table made from a test game is a test crew: its games are test games, not `table`', async () => {
    const { r } = await table('en', { campaign: 'test-qa' });
    const id = r.body.id;
    assert.strictEqual(db.crews[id].test, 'test-qa');
    seedQuestions();
    const opened = await call('crewRematch', { crew: id, uid: 'u2' });
    assert.strictEqual(db.games[opened.body.pin].campaign, 'test-qa');
});

test('a saved crew\'s rematch carries no campaign, as before', async () => {
    const pin = await finished([['Dana', 'u1', 3000], ['Noa', 'u2', 1500]]);
    const saved = await call('createCrew', { pin, name: 'The Cohens', uid: 'u1' });
    seedQuestions();
    const opened = await call('crewRematch', { crew: saved.body.id, uid: 'u1' });
    assert.strictEqual(db.games[opened.body.pin].campaign, undefined);
});

test('the invitation\'s presses are counted in shares; anything else is dropped', () => {
    for (const m of ['seen-new', 'seen-classic', 'open', 'whatsapp', 'native', 'copy', 'calendar', 'google-calendar', 'create-now']) {
        assert.deepStrictEqual(analytics.cleanShare({ content_type: 'host-invite', method: m, crew: 'K7M2QX', locale: 'he', uid: 'u2' }),
            { content_type: 'host-invite', method: m, crew_id: 'k7m2qx', locale: 'he', uid: 'u2' });
    }
    assert.strictEqual(analytics.cleanShare({ content_type: 'host-invite', method: 'remind' }), null);
    // Today's ask keeps its rows.
    assert.ok(analytics.cleanShare({ content_type: 'after-game', method: 'create' }));
});
