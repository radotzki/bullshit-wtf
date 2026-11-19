// START A SECOND TABLE: a phone refused at a full table (MAX_PLAYERS seats) is offered a second game like it
// (controllers/second-table.ts). Runs against an in-memory database and a fake BigQuery:
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
let pushId = 0;
function ref(parts) {
    return {
        child: (p) => ref(parts.concat(String(p).split('/'))),
        once: async () => ({ val: () => clone(at(parts)) }),
        set: async (v) => put(parts, v),
        update: async (v) => Object.keys(v).forEach(k => put(parts.concat(k.split('/')), v[k])),
        push: (v) => { const key = 'k' + (++pushId); if (v !== undefined) put(parts.concat(key), v); return { key }; },
        // Returning undefined aborts, as in the real database.
        transaction: (fn, done) => {
            const v = fn(clone(at(parts)));
            if (v === undefined) return done(null, false);
            put(parts, v);
            done(null, true);
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
const { join } = require(path.join(dist, 'join'));
const { secondTable, fullTableError, SECOND_TABLE_CAMPAIGN } = require(path.join(dist, 'second-table'));
const { cleanCampaign, isTestCampaign, MAX_PLAYERS } = require(path.join(__dirname, '..', 'dist', 'game-model'));
console.log = () => {};
console.error = () => {};

let pinCount = 0;
function lobby(extra = {}) {
    const pin = 'S' + String(++pinCount).padStart(3, '0');
    db.games = db.games || {};
    db.games[pin] = Object.assign({
        state: { id: 0, timestamp: Date.now() }, locale: 'he', timestamp: Date.now(),
        roundIndex: 0, questionIndex: 0, totalQ: 9, qids: {}, tick: 0, presenter: false,
    }, extra);
    return pin;
}
async function fill(pin) {
    const seats = [];
    for (let i = 1; i <= MAX_PLAYERS; i++) seats.push(await join(pin, 'p' + i, 'u' + i));
    return seats;
}
const count = pin => Object.keys(db.games[pin].players || {}).length;

test('the 13th phone is refused as before, GAME_IS_FULL, and is offered a second table like the full one', async () => {
    const pin = lobby({ locale: 'he', totalQ: 9, pack: 'hanukkah', campaign: 'pitch-he-zofim' });
    await fill(pin);
    await assert.rejects(join(pin, 'late', 'u-late'), err => {
        assert.strictEqual(err.code, 'GAME_IS_FULL');
        assert.strictEqual(err.message, 'Sorry, game is full');
        // Same language, length and pack; the post's tag is not carried: the new game is a second table.
        assert.deepStrictEqual(err.secondTable, { locale: 'he', count: 9, pack: 'hanukkah', campaign: 'second-table' });
        return true;
    });
    assert.strictEqual(count(pin), MAX_PLAYERS, 'no 13th seat');
});

test('a phone that already sits at the full table still gets its seat back, with no offer', async () => {
    const pin = lobby({ locale: 'en', totalQ: 7 });
    const seats = await fill(pin);
    const back = await join(pin, 'p5 again', 'u5', undefined, seats[4].pid);
    assert.strictEqual(back.pid, seats[4].pid);
    assert.strictEqual(count(pin), MAX_PLAYERS);
});

test('a test table\'s second table keeps the test tag, so play-tests stay out of every count', async () => {
    const pin = lobby({ locale: 'en', totalQ: 5, campaign: 'test-qa-lobby' });
    await fill(pin);
    await assert.rejects(join(pin, 'late', 'u-late'), err => {
        assert.deepStrictEqual(err.secondTable, { locale: 'en', count: 5, campaign: 'test-qa-lobby' });
        assert.ok(isTestCampaign(err.secondTable.campaign));
        return true;
    });
});

test('the second table: a pack only where it fits the language, a length Create offers, English by default', () => {
    // Thanksgiving has English questions only: a Hebrew table's second table goes without it.
    assert.strictEqual(secondTable({ locale: 'he', totalQ: 7, pack: 'thanksgiving' }).pack, undefined);
    assert.strictEqual(secondTable({ locale: 'en', totalQ: 7, pack: 'thanksgiving' }).pack, 'thanksgiving');
    assert.strictEqual(secondTable({ locale: 'en', totalQ: 7, pack: 'no-such-pack' }).pack, undefined);
    assert.strictEqual(secondTable({ locale: 'en', totalQ: 3 }).count, 7);
    assert.strictEqual(secondTable({ locale: 'en', totalQ: '9' }).count, 9);
    assert.strictEqual(secondTable({ locale: 'fr', totalQ: 7 }).locale, 'en');
    assert.deepStrictEqual(secondTable(null), { locale: 'en', count: 7, campaign: 'second-table' });
    assert.strictEqual(fullTableError({ locale: 'he', totalQ: 7 }).code, 'GAME_IS_FULL');
});

test('second-table is a campaign tag the server keeps, and not a test tag', () => {
    assert.strictEqual(SECOND_TABLE_CAMPAIGN, 'second-table');
    assert.strictEqual(cleanCampaign(SECOND_TABLE_CAMPAIGN), 'second-table');
    assert.strictEqual(isTestCampaign(SECOND_TABLE_CAMPAIGN), false);
});

test('the function\'s error answer carries the second table to the phone', () => {
    const src = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');
    assert.match(src, /body\.secondTable = e\.secondTable/);
});
