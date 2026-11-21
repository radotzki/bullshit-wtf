// The party night pack (functions/data/party-questions.json): 40 English and 40 Hebrew true facts
// about weddings and bachelor and bachelorette customs, birthdays, trips and weekends away, and
// nights out, for the games the six party-night pages start (?pack=party). Every question carries
// `pack: "party"`, so it never turns up in another game. This file checks the questions, then plays
// whole games on an in-memory database: a game made as a party page's Start makes it plays party
// questions in its language and the rows say pack party; no other game gets one; Replay keeps the
// pack. The pages' side is game/test/party-pack.test.js. Each truth's page is quoted in
// docs/party-questions-sources.md. Run: npm test (from functions/).
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
const party = require('../data/party-questions.json');
const kids = require('../data/kids-questions.json');
const hanukkah = require('../data/hanukkah-questions.json');
const facts = require('../data/strange-facts-2026-11.json');
const openers = require('../data/opening-questions.json');
const thanksgiving = require('../data/thanksgiving-questions.json');
const christmas = require('../data/christmas-questions.json');
const everyday = require('../data/everyday-questions-2026-11.json');
const daily = require('../data/daily-questions.json');
const { isRetired } = require(path.join(dist, 'retired-questions'));
const { isSameAnswer, normalizeAnswer } = require(path.join(dist, 'same-answer'));
const { isBlockedHouseLie } = require(path.join(dist, 'house-lie-cleanup'));

const ids = Object.keys(party);
const lower = s => s.trim().toLowerCase();
const isParty = id => /^party-26-(en|he)-\d\d$/.test(id);

test('every party question is a playable question of the pack, in its id\'s language', () => {
    for (const id of ids) {
        const q = party[id];
        assert.match(id, /^party-26-(en|he)-\d\d$/, id);
        assert.deepStrictEqual(Object.keys(q).sort(), ['citation', 'fakeAnswers', 'lang', 'pack', 'questionText', 'realAnswer'], id);
        assert.strictEqual(q.pack, 'party', id);
        assert.strictEqual(q.lang, id.split('-')[2], id);
        assert.strictEqual(q.questionText.split('$blank$').length, 2, `${id}: one blank`);
        assert.strictEqual(q.questionText, q.questionText.trim(), id);
        if (q.lang === 'en') assert.doesNotMatch(q.questionText + q.realAnswer + q.fakeAnswers.join(''), /[א-ת]/, id);
        else assert.match(q.questionText, /[א-ת]/, id);
        assert.strictEqual(q.realAnswer, lower(q.realAnswer), `${id}: answers are shown lower-case`);
        // A player types at most 40 characters; a truth longer than any lie would give itself away.
        assert.ok(q.realAnswer.length <= 40, id);
        assert.strictEqual(q.fakeAnswers.length, 3, id);
        q.fakeAnswers.forEach(f => {
            assert.strictEqual(f, lower(f), `${id}: ${f}`);
            assert.ok(f.length <= 40, `${id}: ${f}`);
            // A house lie that is the truth typed differently would put the truth on screen twice.
            assert.ok(!isSameAnswer(f, q.realAnswer), `${id}: ${f}`);
            assert.ok(!isBlockedHouseLie(f), `${id}: ${f}`);
        });
        assert.strictEqual(new Set(q.fakeAnswers.concat(q.realAnswer).map(normalizeAnswer)).size, 4, `${id}: four different answers`);
        // The source that states the truth, one a reviewer can open.
        assert.match(q.citation, /^https:\/\/\S+$/, id);
        assert.ok(!isRetired(id), id);
    }
});

test('40 in each language, ids without gaps, none twice, none a repeat of a question kept in the repository', () => {
    for (const lang of ['en', 'he']) {
        const nums = ids.filter(id => party[id].lang === lang).map(id => +id.split('-')[3]).sort((a, b) => a - b);
        assert.strictEqual(nums.length, 40, lang);
        nums.forEach((n, i) => assert.strictEqual(n, i + 1, `${lang}-${n}`));
    }
    const texts = ids.map(id => normalizeAnswer(party[id].questionText));
    assert.strictEqual(new Set(texts).size, texts.length);
    const others = [kids, hanukkah, facts, openers, thanksgiving, christmas, everyday, daily];
    const known = new Set(others.flatMap(set => Object.values(set)).filter(q => q && q.questionText).map(q => normalizeAnswer(q.questionText)));
    const knownIds = new Set(others.flatMap(set => Object.keys(set)));
    for (const id of ids) {
        assert.ok(!knownIds.has(id), id);
        assert.ok(!known.has(normalizeAnswer(party[id].questionText)), id);
    }
});

test('every question has its source quoted in docs/party-questions-sources.md', () => {
    const doc = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'party-questions-sources.md'), 'utf8');
    for (const id of ids) {
        const at = doc.indexOf(`## ${id}\n`);
        assert.ok(at >= 0, `${id} has an entry`);
        const entry = doc.slice(at, doc.indexOf('\n## ', at + 1) < 0 ? undefined : doc.indexOf('\n## ', at + 1));
        assert.ok(entry.includes(party[id].citation), `${id}: its citation`);
        assert.ok(entry.includes(party[id].realAnswer), `${id}: its truth`);
        assert.match(entry, /The page says: \S/, `${id}: the quote`);
    }
});

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

async function play(pin) {
    db.games[pin].state = { id: RoundIntro, timestamp: Date.now() };
    await analytics.onStateChange(pin);
    db.games[pin].state = { id: ScoreBoardFinal, timestamp: Date.now() };
    await analytics.onStateChange(pin);
}

// The live bank as the release leaves it: 30 normal questions a language, some of them openers,
// the 80 party questions, the kid questions and a Hanukkah pack.
const take = (table) => rows.filter(r => r.table === table).map(r => r.row);

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
    Object.assign(db.questions, JSON.parse(JSON.stringify(kids)), JSON.parse(JSON.stringify(party)));
}

test('the party pack: asked for by link only, in both languages, never by season', () => {
    assert.strictEqual(model.PARTY_PACK, 'party');
    assert.ok(model.isPack('party'));
    assert.ok(model.packFits('party', 'en'));
    assert.ok(model.packFits('party', 'he'));
    assert.strictEqual(model.packInSeasonFor('party', 'en'), false);
    assert.strictEqual(model.packInSeasonFor('party', 'he'), false);
    assert.strictEqual(model.questionPacks.party.season, undefined);
    assert.strictEqual(model.packIcon('party'), '🎉');
    for (let d = 0; d < 400; d++) {
        const now = Date.parse('2026-11-01T12:00:00Z') + d * 86400000;
        for (const locale of [undefined, 'en', 'he']) {
            assert.notStrictEqual(model.seasonalPack(now, locale), 'party');
        }
    }
    // The create page sends it as it sends any pack on offer, ticked or not.
    assert.strictEqual(model.chosenPack(false, true, 'party'), 'party');
    assert.strictEqual(model.chosenPack(false, false, 'party'), undefined);
    assert.strictEqual(model.chosenPack(true, true, 'party'), 'kids');
});

test('a whole game from a party page: party questions in its language, one opening it, and the rows say pack party', async () => {
    seedQuestions();
    rows.length = 0;
    const per = model.questionPacks.party.perGame;
    for (const [locale, campaign] of [['he', 'party-bachelorette-he'], ['en', 'party-weekend-en']]) {
        // What the create page sends after a party page's Start (create-game.component.ts, api.service.ts).
        const created = await call('newGame', { locale, count: 7, uid: `host-${locale}`, pack: 'party', campaign });
        assert.strictEqual(created.code, 200);
        const pin = created.body.pin;
        const game = db.games[pin];
        assert.strictEqual(game.pack, 'party');
        assert.strictEqual(game.campaign, campaign);
        assert.strictEqual(game.qids.length, 7);
        assert.strictEqual(new Set(game.qids).size, 7);
        const partyQs = game.qids.filter(isParty);
        assert.strictEqual(partyQs.length, per, game.qids.join());
        assert.ok(isParty(game.qids[0]), 'a party question opens the game');
        assert.ok(partyQs.every(id => party[id].lang === locale), game.qids.join());
        assert.ok(game.qids.filter(id => !isParty(id)).every(id => new RegExp(`^n-${locale}-\\d+$`).test(id)), game.qids.join());
        await join(pin, 'Dana', `host-${locale}`);
        await join(pin, 'Avi', `guest-${locale}`);
        await play(pin);
    }
    assert.deepStrictEqual(take('opened_games').map(r => [r.pack, r.campaign]), [['party', 'party-bachelorette-he'], ['party', 'party-weekend-en']]);
    assert.deepStrictEqual(take('closed_games').map(r => r.pack), ['party', 'party']);
});

test('no other game gets a party question: none, a season\'s pack, or kids', async () => {
    seedQuestions();
    for (let i = 0; i < 20; i++) {
        for (const pack of [undefined, 'hanukkah', 'kids']) {
            const pin = await newGame(i % 2 ? 'he' : 'en', 9, 'h', { pack });
            assert.ok(!db.games[pin].qids.some(isParty), db.games[pin].qids.join());
        }
    }
});

test('a party question is never repeated to the room; once they are all seen, the game is the usual questions', async () => {
    seedQuestions();
    const he = Object.keys(party).filter(id => party[id].lang === 'he');
    // The crew saw 38 of the 40: the next game has the 2 left.
    db.seenQuestions.a = Object.fromEntries(he.slice(0, 20).map((id, i) => [id, 1000 + i]));
    db.seenQuestions.b = Object.fromEntries(he.slice(20, 38).map((id, i) => [id, 2000 + i]));
    const pin = await newGame('he', 7, 'a', { pack: 'party', uids: ['a', 'b'] });
    const qids = db.games[pin].qids;
    assert.strictEqual(qids.length, 7);
    assert.deepStrictEqual(qids.filter(isParty).sort(), he.slice(38).sort());
    db.seenQuestions.b = Object.assign(db.seenQuestions.b, Object.fromEntries(he.slice(38).map(id => [id, 3000])));
    const later = db.games[await newGame('he', 7, 'a', { pack: 'party', uids: ['a', 'b'] })];
    assert.strictEqual(later.pack, 'party');
    assert.strictEqual(later.qids.length, 7);
    assert.ok(later.qids.every(id => /^n-he-\d+$/.test(id)), later.qids.join());
});

test('Rematch keeps the pack, and draws party questions the table has not had', async () => {
    seedQuestions();
    const first = await newGame('en', 5, 'p1', { pack: 'party' });
    await join(first, 'Dana', 'p1');
    await join(first, 'Avi', 'p2');
    db.seenQuestions.p1 = Object.fromEntries(db.games[first].qids.map(id => [id, 5000]));
    await fork(first, 'p1');
    const second = db.games[db.games[first].fork];
    assert.strictEqual(second.pack, 'party');
    assert.ok(second.qids.filter(isParty).length > 0, second.qids.join());
    assert.ok(second.qids.every(id => db.games[first].qids.indexOf(id) < 0), 'no repeat');
});

test('the release loads the party questions', () => {
    const loader = fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'scripts', 'load-pack-questions.js'), 'utf8');
    assert.match(loader, /file: 'functions\/data\/party-questions\.json'.*pack: 'party'/);
});
