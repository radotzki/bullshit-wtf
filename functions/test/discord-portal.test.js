// The Discord Activity's games on the server (spec row 7): a Discord call's games (tagged
// discord-activity by discordTable) get the portals' rules, controllers/portal.ts: lies go through the
// word filter, and REMATCH / Replay keep the tag, so the call's later games still count as Discord's.
// In-memory database, no Firebase project:  npm run build && node --test test/discord-portal.test.js
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
const { filtersLies, isPortalCampaign } = require(path.join(dist, 'portal'));
const { DISCORD_CAMPAIGN } = require(path.join(dist, 'discord-table'));
const { SHARE_METHODS } = require(path.join(dist, 'analytics'));
const { answer } = require(path.join(dist, 'answer'));
const { createFork } = require(path.join(dist, 'fork'));
console.log = () => {};

let n = 0;
/** A game on its first question, with two players (so one lie does not end the question). */
function question(campaign) {
    const pin = 'P' + String(++n).padStart(3, 'A').replace(/\d/g, d => 'ABCDEFGHIJ'[d]);
    db.questions = { q1: { question: 'The honorary mayor of Talkeetna was ___', realAnswer: 'a cat', fakeAnswers: ['a dog'] } };
    db.games = db.games || {};
    db.games[pin] = Object.assign({
        state: { id: 2, timestamp: Date.now() }, locale: 'en', timestamp: Date.now(),
        roundIndex: 0, questionIndex: 0, totalQ: 5, qids: ['q1'], tick: 0, presenter: false,
        players: { p1: { nickname: 'ann', uid: 'u1' }, p2: { nickname: 'bob', uid: 'u2' } },
    }, campaign ? { campaign } : {});
    return pin;
}

test('a Discord call\'s games are a portal\'s: the tag discordTable gives them is on the list', () => {
    assert.strictEqual(DISCORD_CAMPAIGN, 'discord-activity');
    assert.strictEqual(isPortalCampaign(DISCORD_CAMPAIGN), true);
    assert.strictEqual(filtersLies({ campaign: DISCORD_CAMPAIGN }), true);
    // A play-test in Discord (?via=test) is a test, not Discord's.
    assert.strictEqual(filtersLies({ campaign: 'test' }), false);
});

test('a Discord game refuses a flagged lie; a clean one is taken', async () => {
    const pin = question(DISCORD_CAMPAIGN);
    await assert.rejects(answer(pin, 'p1', 'a whore'), e => e.code === 'FLAGGED_LIE');
    assert.strictEqual(at(['games', pin, 'answers', 'p1']), null);
    await answer(pin, 'p1', 'a fox');
    assert.strictEqual(at(['games', pin, 'answers', 'p1', 'text']), 'a fox');
});

test('REMATCH in a Discord call keeps the discord-activity tag', () => {
    const game = { locale: 'en', players: { p1: { nickname: 'ann', uid: 'u1' } }, campaign: DISCORD_CAMPAIGN };
    assert.strictEqual(createFork('OLD1', game, ['q1'], 'u1', 'p1', undefined, false, 'NEW1').campaign, DISCORD_CAMPAIGN);
});

test('the Discord buttons are counted: INVITE TO THIS CALL and the results card\'s share', () => {
    assert.ok(SHARE_METHODS.invite.indexOf('discord') >= 0);
    assert.ok(SHARE_METHODS.results.indexOf('discord') >= 0);
});
