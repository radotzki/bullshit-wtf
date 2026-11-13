// A crew's game night (controllers/crew-night.ts): set the date, say "I'm in", take it back.
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

async function savedCrew(name = 'The Cohens') {
    seedQuestions();
    const pin = await playGame([['Dana', 'u1', 3000], ['Avi', 'u2', 1500], ['Noa', 'u3', 500]]);
    return (await call('createCrew', { pin, name, uid: 'u1' })).body.id;
}

const HOUR = 3600 * 1000;
const nextWeek = () => Math.floor((Date.now() + 7 * 24 * HOUR) / 60000) * 60000;

test('setting a night stores it on the crew, with whoever set it already in', async () => {
    const id = await savedCrew();
    const time = nextWeek();
    const r = await call('crewNight', { crew: id.toUpperCase(), time: time + 12345, by: '  Dana ' });
    assert.strictEqual(r.code, 200);
    assert.deepStrictEqual(db.crews[id].night, { time, by: 'Dana', in: { dana: 'Dana' } });
    assert.deepStrictEqual(r.body.night, db.crews[id].night);
    assert.deepStrictEqual(model.crewNightNames(db.crews[id]), ['Dana']);
});

test('a night needs a crew and a time that is still ahead', async () => {
    const id = await savedCrew();
    assert.strictEqual((await call('crewNight', { crew: 'nope99', time: nextWeek() })).body.code, 'CREW_NOT_EXIST');
    assert.strictEqual((await call('crewNight', { crew: '../x', time: nextWeek() })).body.code, 'CREW_NOT_EXIST');
    for (const time of [Date.now() - 2 * HOUR, 'soon', Date.now() + 400 * 24 * HOUR, NaN]) {
        const r = await call('crewNight', { crew: id, time });
        assert.strictEqual(r.code, 400);
        assert.strictEqual(r.body.code, 'BAD_TIME', String(time));
    }
    assert.strictEqual(db.crews[id].night, undefined);
    // no name: the night is set and nobody is in yet
    assert.strictEqual((await call('crewNight', { crew: id, time: nextWeek() })).code, 200);
    assert.deepStrictEqual(db.crews[id].night, { time: nextWeek() });
});

test("I'M IN adds a name, twice is one name, and a friend who never played is new", async () => {
    const id = await savedCrew();
    assert.strictEqual((await call('crewNight', { crew: id, nickname: 'Avi', in: true })).body.code, 'NO_NIGHT');
    await call('crewNight', { crew: id, time: nextWeek(), by: 'Dana' });

    const avi = await call('crewNight', { crew: id, nickname: 'Avi', in: true });
    assert.deepStrictEqual(avi.body, { in: true, nickname: 'Avi', isNew: false, count: 2 });
    const again = await call('crewNight', { crew: id, nickname: '  aVI ', in: true });
    assert.deepStrictEqual(again.body, { in: true, nickname: 'aVI', isNew: false, count: 2 });
    assert.strictEqual(db.crews[id].night.in.avi, 'Avi', 'the first spelling stays');

    const maya = await call('crewNight', { crew: id, nickname: 'Maya' });
    assert.deepStrictEqual(maya.body, { in: true, nickname: 'Maya', isNew: true, count: 3 });
    assert.deepStrictEqual(model.crewNightNames(db.crews[id]), ['Avi', 'Dana', 'Maya']);
    assert.ok(!db.crews[id].members.maya, 'saying "I\'m in" does not join the standings');

    // a long name is cut like a nickname at the join page
    const long = await call('crewNight', { crew: id, nickname: 'Bartholomew the Third' });
    assert.strictEqual(long.body.nickname, 'Bartholom');
});

test('"Can\'t make it" takes the name off, and taking it off twice is fine', async () => {
    const id = await savedCrew();
    await call('crewNight', { crew: id, time: nextWeek(), by: 'Dana' });
    await call('crewNight', { crew: id, nickname: 'Noa', in: true });
    const out = await call('crewNight', { crew: id, nickname: 'NOA', in: false });
    assert.deepStrictEqual(out.body, { in: false, nickname: 'NOA', isNew: false, count: 1 });
    assert.strictEqual((await call('crewNight', { crew: id, nickname: 'Noa', in: false })).code, 200);
    assert.deepStrictEqual(model.crewNightNames(db.crews[id]), ['Dana']);
});

test('a refused nickname is refused, in the crew\'s language, and an empty one too', async () => {
    const id = await savedCrew();
    await call('crewNight', { crew: id, time: nextWeek(), by: 'Dana' });
    const bad = await call('crewNight', { crew: id, nickname: 'cumshot', in: true });
    assert.strictEqual(bad.code, 400);
    assert.strictEqual(bad.body.code, 'BAD_NAME');
    assert.strictEqual(bad.body.message, "That name's not allowed. Try another one.");
    // checked whole, before the cut to nine letters
    assert.strictEqual((await call('crewNight', { crew: id, nickname: 'aaaaaaaaa cumshot', in: true })).body.code, 'BAD_NAME');
    assert.strictEqual((await call('crewNight', { crew: id, nickname: '   ', in: true })).body.code, 'BAD_NAME');
    assert.deepStrictEqual(model.crewNightNames(db.crews[id]), ['Dana']);

    db.crews[id].locale = 'he';
    assert.match((await call('crewNight', { crew: id, nickname: 'cumshot', in: true })).body.message, /[֐-׿]/);

    // a refused name sets the night all the same, with nobody in under that name
    const t2 = nextWeek() + 24 * HOUR;
    await call('crewNight', { crew: id, time: t2, by: 'cumshot' });
    assert.deepStrictEqual(db.crews[id].night, { time: t2 });
});

test('the same time again keeps the list, a new time starts a new one', async () => {
    const id = await savedCrew();
    const time = nextWeek();
    await call('crewNight', { crew: id, time, by: 'Dana' });
    await call('crewNight', { crew: id, nickname: 'Avi' });
    await call('crewNight', { crew: id, time, by: 'Noa' });
    assert.deepStrictEqual(db.crews[id].night, { time, by: 'Dana', in: { dana: 'Dana', avi: 'Avi', noa: 'Noa' } });

    await call('crewNight', { crew: id, time: time + 24 * HOUR, by: 'Noa' });
    assert.deepStrictEqual(db.crews[id].night, { time: time + 24 * HOUR, by: 'Noa', in: { noa: 'Noa' } });
});

test('a night\'s list is capped, and a name already on it still gets a yes', async () => {
    const id = await savedCrew();
    await call('crewNight', { crew: id, time: nextWeek(), by: 'Dana' });
    for (let i = 1; i < model.NIGHT_IN_MAX; i++) {
        assert.strictEqual((await call('crewNight', { crew: id, nickname: 'guest' + i })).code, 200);
    }
    const over = await call('crewNight', { crew: id, nickname: 'onemore' });
    assert.strictEqual(over.body.code, 'NIGHT_FULL');
    assert.strictEqual(Object.keys(db.crews[id].night.in).length, model.NIGHT_IN_MAX);
    assert.strictEqual((await call('crewNight', { crew: id, nickname: 'Dana' })).code, 200);
});

test('the list reads `true` as the member\'s name and leaves out a name the filter refuses', () => {
    const crew = {
        members: { dana: { nickname: 'Dana' } },
        night: { time: 1, in: { dana: true, zed: true, maya: 'Maya', gone: false, x: 'cumshot' } },
    };
    assert.deepStrictEqual(model.crewNightNames(crew), ['Dana', 'Maya', 'zed']);
    assert.deepStrictEqual(model.crewNightNames({ members: {} }), []);
    assert.deepStrictEqual(model.crewNightNames(null), []);
});

test('the presses of the night block are counted as crew-night shares, and nothing else is', () => {
    for (const method of ['in', 'in-new', 'out', 'nudge', 'open-lobby']) {
        const row = analytics.cleanShare({ content_type: 'crew-night', method, crew: 'k7m2qx', locale: 'he', uid: 'u1' });
        assert.deepStrictEqual(row, { content_type: 'crew-night', method, crew_id: 'k7m2qx', locale: 'he', uid: 'u1' });
    }
    assert.strictEqual(analytics.cleanShare({ content_type: 'crew-night', method: 'maybe' }), null);
    assert.strictEqual(analytics.cleanShare({ content_type: 'results', method: 'in' }), null);
});
