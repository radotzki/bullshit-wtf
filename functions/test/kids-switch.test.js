// "Kids are playing" on the server: a game made with the kids pack plays the kid questions nobody
// in the room has seen, every question of the game while they last, then the normal bank; a normal
// game never gets one; Replay keeps the switch; and the started and finished rows say pack 'kids'.
// The create page's side is game/test/kids-switch.test.js. Run: npm test (from functions/).
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');
const fs = require('fs');

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
const model = require(path.join(__dirname, '..', 'dist', 'game-model'));
const kids = require('../data/kids-questions.json');

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
test.after(() => { console.log = log; });

// The live bank as the release leaves it: 30 normal questions a language, some of them openers,
// the 100 kid questions (50 a language), and a Hanukkah pack.
function seedQuestions() {
    db.gameCounter = 100;
    db.games = {};
    db.seenQuestions = {};
    db.questions = {};
    for (const lang of ['en', 'he']) {
        for (let i = 0; i < 30; i++) {
            db.questions[`n-${lang}-${i}`] = { lang, questionText: 'x $blank$', realAnswer: 'y', fakeAnswers: ['a', 'b', 'c'], citation: '' };
            if (i < 3) db.questions[`n-${lang}-${i}`].opener = true;
        }
        for (let i = 0; i < 10; i++) {
            db.questions[`hanukkah-26-${lang}-${i}`] = { lang, questionText: 'x $blank$', realAnswer: 'y', fakeAnswers: ['a', 'b', 'c'], citation: '', pack: 'hanukkah' };
        }
    }
    Object.assign(db.questions, JSON.parse(JSON.stringify(kids)));
}
const isKid = id => /^kids-26-(en|he)-\d\d$/.test(id);
const take = (table) => rows.filter(r => r.table === table).map(r => r.row);

async function play(pin) {
    db.games[pin].state = { id: RoundIntro, timestamp: Date.now() };
    await analytics.onStateChange(pin);
    db.games[pin].state = { id: ScoreBoardFinal, timestamp: Date.now() };
    await analytics.onStateChange(pin);
}

test('the kids pack: offered by its switch only, in both languages, never by season', () => {
    assert.strictEqual(model.KIDS_PACK, 'kids');
    assert.ok(model.isPack('kids'));
    assert.ok(model.packFits('kids', 'en'));
    assert.ok(model.packFits('kids', 'he'));
    assert.strictEqual(model.packInSeasonFor('kids', 'en'), false);
    assert.strictEqual(model.packInSeasonFor('kids', 'he'), false);
    assert.strictEqual(model.questionPacks.kids.season, undefined);
    assert.strictEqual(model.packIcon('kids'), '🧒');
    // Every day of a year, in either language or none: the season's pack is never kids.
    for (let d = 0; d < 400; d++) {
        const now = Date.parse('2026-11-01T12:00:00Z') + d * 86400000;
        for (const locale of [undefined, 'en', 'he']) {
            assert.notStrictEqual(model.seasonalPack(now, locale), 'kids');
        }
    }
    // Hanukkah and Christmas still come in their seasons.
    assert.strictEqual(model.seasonalPack(Date.parse('2026-12-05T18:00:00Z'), 'he'), 'hanukkah');
    assert.strictEqual(model.seasonalPack(Date.parse('2026-12-05T18:00:00Z'), 'en'), 'christmas');
    // Every kid question can fill a whole game of the longest length.
    assert.ok(model.questionPacks.kids.perGame >= 9);
});

test('the create page\'s choice: kids takes the seasonal pack\'s place, one pack a game', () => {
    assert.strictEqual(model.chosenPack(true, true, 'hanukkah'), 'kids');
    assert.strictEqual(model.chosenPack(true, false, null), 'kids');
    assert.strictEqual(model.chosenPack(false, true, 'hanukkah'), 'hanukkah');
    assert.strictEqual(model.chosenPack(false, false, 'hanukkah'), undefined);
    assert.strictEqual(model.chosenPack(false, true, null), undefined);
});

test('a kids game plays only kid questions in its own language, and the rows say pack kids', async () => {
    seedQuestions();
    rows.length = 0;
    for (const locale of ['en', 'he']) {
        const created = await call('newGame', { locale, count: 9, uid: `host-${locale}`, pack: 'kids' });
        assert.strictEqual(created.code, 200);
        const game = db.games[created.body.pin];
        assert.strictEqual(game.pack, 'kids');
        assert.strictEqual(game.qids.length, 9);
        assert.ok(game.qids.every(isKid), game.qids.join());
        assert.ok(game.qids.every(id => kids[id].lang === locale), game.qids.join());
        assert.strictEqual(new Set(game.qids).size, 9);
        await join(created.body.pin, 'Dana', `host-${locale}`);
        await play(created.body.pin);
    }
    assert.deepStrictEqual(take('opened_games').map(r => r.pack), ['kids', 'kids']);
    assert.deepStrictEqual(take('closed_games').map(r => r.pack), ['kids', 'kids']);
});

test('a game without the switch never gets a kid question, in season or out', async () => {
    seedQuestions();
    for (let i = 0; i < 20; i++) {
        for (const pack of [undefined, 'hanukkah']) {
            const pin = await newGame(i % 2 ? 'he' : 'en', 9, 'h', { pack });
            assert.ok(!db.games[pin].qids.some(isKid), db.games[pin].qids.join());
        }
    }
});

test('once the room has seen every kid question, the game comes from the normal bank; a kid question is never repeated', async () => {
    seedQuestions();
    const en = Object.keys(kids).filter(id => kids[id].lang === 'en');
    // The family saw 46 of the 50: the next 7-question game has the 4 left, then 3 normal ones.
    db.seenQuestions.mom = Object.fromEntries(en.slice(0, 25).map((id, i) => [id, 1000 + i]));
    db.seenQuestions.kid = Object.fromEntries(en.slice(25, 46).map((id, i) => [id, 2000 + i]));
    const pin = await newGame('en', 7, 'mom', { pack: 'kids', uids: ['mom', 'kid'] });
    const qids = db.games[pin].qids;
    assert.strictEqual(qids.length, 7);
    assert.deepStrictEqual(qids.filter(isKid).sort(), en.slice(46).sort());
    assert.ok(qids.filter(id => !isKid(id)).every(id => /^n-en-\d+$/.test(id)), qids.join());
    assert.strictEqual(qids[0], qids.filter(isKid)[0], 'a kid question opens the game');
    // All 50 seen: a whole game of normal English questions, no Hanukkah, no repeat.
    db.seenQuestions.kid = Object.assign(db.seenQuestions.kid, Object.fromEntries(en.slice(46).map(id => [id, 3000])));
    const later = db.games[await newGame('en', 7, 'mom', { pack: 'kids', uids: ['mom', 'kid'] })];
    assert.strictEqual(later.pack, 'kids', 'the switch is still recorded');
    assert.strictEqual(later.qids.length, 7);
    assert.ok(later.qids.every(id => /^n-en-\d+$/.test(id)), later.qids.join());
});

test('Replay keeps the switch, and draws kid questions the table has not had', async () => {
    seedQuestions();
    const first = await newGame('he', 5, 'p1', { pack: 'kids' });
    await join(first, 'Dana', 'p1');
    await join(first, 'Avi', 'p2');
    // The table saw the first game's questions.
    db.seenQuestions.p1 = Object.fromEntries(db.games[first].qids.map(id => [id, 5000]));
    await fork(first, 'p1');
    const second = db.games[db.games[first].fork];
    assert.strictEqual(second.pack, 'kids');
    assert.ok(second.qids.every(isKid), second.qids.join());
    assert.ok(second.qids.every(id => db.games[first].qids.indexOf(id) < 0), 'no repeat');
});

test('the release loads the kid questions, and the server takes the pack as sent', () => {
    const loader = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'scripts', 'load-pack-questions.js'), 'utf8');
    assert.match(loader, /file: 'functions\/data\/kids-questions\.json'.*pack: 'kids'/);
    const src = f => fs.readFileSync(path.join(__dirname, '..', 'src', 'controllers', f), 'utf8');
    assert.match(src('new-game.ts'), /const pack = packFits\(options\.pack, locale\) \? options\.pack : undefined;/);
    // Normal games filter out every pack question, the kids pack's too.
    assert.match(src('questions.ts'), /const questions = all\.filter\(q => !q\.pack\);/);
});
