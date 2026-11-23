// The CrazyGames version's rules on the server (controllers/portal.ts): its games' lies go through the
// lie filter, and Replay keeps its tag. Off the portal only kids' games filter lies. In-memory database, no
// Firebase project:  npm run build && node --test test/portal.test.js
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');

// ---- in-memory Realtime Database (just what answer() uses) ----
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
function ref(parts) {
    return {
        child: (p) => ref(parts.concat(String(p).split('/'))),
        once: async () => ({ val: () => clone(at(parts)) }),
        set: async (v) => put(parts, v),
        update: async (v) => Object.keys(v).forEach(k => put(parts.concat(k.split('/')), v[k])),
        transaction: (fn, done) => {
            const v = fn(clone(at(parts)));
            if (v === undefined) return done && done(null, false);
            put(parts, v);
            return done && done(null, true);
        },
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
const { lieRefused, filtersLies, isPortalCampaign } = require(path.join(dist, 'portal'));
const { answer } = require(path.join(dist, 'answer'));
const { createFork } = require(path.join(dist, 'fork'));
console.log = () => {};

let n = 0;
/** A game on its first question, with two players (so one lie does not end the question). */
function question(campaign, pack) {
    const pin = 'P' + String(++n).padStart(3, 'A').replace(/\d/g, d => 'ABCDEFGHIJ'[d]);
    db.questions = { q1: { question: 'The honorary mayor of Talkeetna was ___', realAnswer: 'a cat', fakeAnswers: ['a dog'] } };
    db.games = db.games || {};
    db.games[pin] = Object.assign({
        state: { id: 2, timestamp: Date.now() }, locale: 'en', timestamp: Date.now(),
        roundIndex: 0, questionIndex: 0, totalQ: 5, qids: ['q1'], tick: 0, presenter: false,
        players: { p1: { nickname: 'ann', uid: 'u1' }, p2: { nickname: 'bob', uid: 'u2' } },
    }, campaign ? { campaign } : {}, pack ? { pack } : {});
    return pin;
}

test('the filter reads each word as the nickname filter reads a name', () => {
    assert.strictEqual(lieRefused('a big cunt'), true);
    assert.strictEqual(lieRefused('i am a whore'), true);
    assert.strictEqual(lieRefused('my dick'), true);
    assert.strictEqual(lieRefused('כוסית'), true);
    // Spelled out a letter or two at a time.
    assert.strictEqual(lieRefused('c u n t'), true);
    // Also after a one-letter word (the Discord version's probe).
    assert.strictEqual(lieRefused('a c u n t'), true);
});

test('allowed names stay allowed, also as part of a longer lie', () => {
    for (const ok of ['charles dickens', 'a cocktail party', 'moby dick', 'the moby dick', 'cumin and pepper', 'peacock feathers',
        'a cat', 'the mayor of london', 'כוס קפה', 'sexy dancer', '']) {
        assert.strictEqual(lieRefused(ok), false, ok);
    }
});

test('only portal games filter lies', () => {
    assert.strictEqual(isPortalCampaign('portal-crazygames'), true);
    assert.strictEqual(isPortalCampaign('test'), false);
    assert.strictEqual(filtersLies({ campaign: 'portal-crazygames' }), true);
    assert.strictEqual(filtersLies({ campaign: 'fb-he-hanukkah' }), false);
    assert.strictEqual(filtersLies({}), false);
    assert.strictEqual(filtersLies(null), false);
});

test('on the main site, kids\' games filter lies, and no other game does', () => {
    assert.strictEqual(filtersLies({ pack: 'kids' }), true);
    assert.strictEqual(filtersLies({ pack: 'kids', campaign: 'fb-he-hanukkah' }), true);
    assert.strictEqual(filtersLies({ pack: 'hanukkah' }), false);
    assert.strictEqual(filtersLies({ pack: 'christmas' }), false);
});

test('a kids\' game refuses a swear word and takes a fair name; a grown-up game takes both', async () => {
    const kids = question(undefined, 'kids');
    await assert.rejects(answer(kids, 'p1', 'holy shit'), e => e.code === 'FLAGGED_LIE');
    assert.strictEqual(at(['games', kids, 'answers', 'p1']), null);
    await answer(kids, 'p1', 'Dick Van Dyke');
    assert.strictEqual(at(['games', kids, 'answers', 'p1', 'text']), 'dick van dyke');
    const grownUps = question(undefined, 'hanukkah');
    await answer(grownUps, 'p1', 'holy shit');
    assert.strictEqual(at(['games', grownUps, 'answers', 'p1', 'text']), 'holy shit');
});

test('a portal game refuses common swear words, in English and Hebrew', async () => {
    for (const lie of ['fuck', 'a bitch', 'בן זונה', 'כוס אמק']) {
        const pin = question('portal-crazygames');
        await assert.rejects(answer(pin, 'p1', lie), e => e.code === 'FLAGGED_LIE', lie);
    }
    const pin = question('portal-crazygames');
    await answer(pin, 'p1', 'כוס');
    assert.strictEqual(at(['games', pin, 'answers', 'p1', 'text']), 'כוס');
});

test('a portal game refuses a flagged lie, and keeps nothing of it', async () => {
    const pin = question('portal-crazygames');
    await assert.rejects(answer(pin, 'p1', 'a whore'), e => e.code === 'FLAGGED_LIE');
    assert.strictEqual(at(['games', pin, 'answers', 'p1']), null);
    // A clean lie is taken as always.
    await answer(pin, 'p1', 'a fox');
    assert.strictEqual(at(['games', pin, 'answers', 'p1', 'text']), 'a fox');
});

test('a game off the portal takes the same lie, as before', async () => {
    const pin = question();
    await answer(pin, 'p1', 'a whore');
    assert.strictEqual(at(['games', pin, 'answers', 'p1', 'text']), 'a whore');
});

test('the truth is still refused first in a portal game', async () => {
    const pin = question('portal-crazygames');
    await assert.rejects(answer(pin, 'p1', 'A cat'), e => e.code === 'CORRECT_ANSWER');
});

test('Replay keeps the portal tag, and drops a post tag as before', () => {
    const game = { locale: 'en', players: { p1: { nickname: 'ann', uid: 'u1' } }, campaign: 'portal-crazygames' };
    assert.strictEqual(createFork('OLD1', game, ['q1'], 'u1', 'p1', undefined, false, 'NEW1').campaign, 'portal-crazygames');
    const post = Object.assign({}, game, { campaign: 'fb-he-hanukkah' });
    assert.strictEqual(createFork('OLD1', post, ['q1'], 'u1', 'p1', undefined, false, 'NEW1').campaign, undefined);
});
