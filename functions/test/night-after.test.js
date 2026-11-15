// "The night after": a finished game's link answers GAME_OVER with the night's recap for a week (night-after.ts).
// Runs the compiled functions (dist/) against an in-memory database, no Firebase project needed:
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
const { join } = require(path.join(dist, 'join'));
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

const { nightAfter, nightAfterHalf, NIGHT_AFTER_MS } = require(path.join(dist, 'night-after'));
const { cleanShare, onShare } = require(path.join(dist, 'analytics'));
console.log = () => {};
const Staging = 0, Final = 6;
const now = Date.now();
const H = 60 * 60 * 1000;

/** A finished game of four: Dana hosted, Yossi won, Dana fooled the most. */
function finished(at, extra = {}) {
    return Object.assign({
        state: { id: Final, timestamp: at }, timestamp: at, locale: 'he', totalQ: 7,
        players: {
            p1: { nickname: 'Dana', score: 2500, uid: 'uDana', host: true },
            p2: { nickname: 'Yossi', score: 3100, uid: 'uYossi' },
            p3: { nickname: 'Avi', score: 900, uid: 'uAvi' },
            p4: { nickname: 'Noa', score: 2500, uid: 'uNoa' },
        },
        highlights: {
            p1: { text: 'they could not stop laughing', fooled: 3, points: 1500, total: 5, q: 'secret question' },
            p2: { text: 'a goat', fooled: 1, points: 500, total: 2 },
            p4: { text: '', fooled: 0, points: 0, total: 0, funny: { text: 'x', laughs: 2 } },
        },
    }, extra);
}
function seed(games) {
    db.games = JSON.parse(JSON.stringify(games));
}
/** A PIN in the given half of the test. */
function pinIn(half) {
    for (let i = 0; i < 1000; i++) {
        const pin = 'NA' + String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + Math.floor(i / 26) % 26);
        if (nightAfterHalf(pin) === (half === 'new')) return pin;
    }
    throw new Error('no pin');
}

test('the half: a stable hash of the PIN, about half each way, case aside', () => {
    let n = 0;
    for (let i = 0; i < 2000; i++) {
        const pin = 'P' + i.toString(36).toUpperCase();
        if (nightAfterHalf(pin)) n++;
        assert.strictEqual(nightAfterHalf(pin), nightAfterHalf(pin.toLowerCase()));
    }
    assert.ok(n > 900 && n < 1100, String(n));
    // The BigQuery line in the comment: the lowest bit of the first byte of SHA-256('night-after:' + PIN).
    const first = require('crypto').createHash('sha256').update('night-after:ABCD').digest()[0];
    assert.strictEqual(nightAfterHalf('abcd'), first % 2 === 1);
});

test('the recap: winner, places with ties, the biggest bullshitter, the lie of the night, and nothing of the questions', () => {
    const r = nightAfter('ABCD', finished(now - 10 * H), now, 'someone-else');
    assert.ok(r);
    assert.strictEqual(r.player, false);
    assert.strictEqual(r.host, 'Dana');
    assert.strictEqual(r.locale, 'he');
    assert.deepStrictEqual(r.rows.map(x => [x.name, x.place, x.score, x.fooled]),
        [['Yossi', 1, 3100, 2], ['Dana', 2, 2500, 5], ['Noa', 2, 2500, 0], ['Avi', 4, 900, 0]]);
    assert.deepStrictEqual(r.rows.filter(x => x.biggest).map(x => x.name), ['Dana']);
    assert.deepStrictEqual(r.lie, { text: 'they could not stop laughing', fooled: 3, by: 'Dana' });
    assert.strictEqual(r.played, 4);
    assert.strictEqual(r.questions, 7);
    assert.strictEqual(r.fooledTotal, 7);
    assert.strictEqual(r.crew, undefined);
    assert.strictEqual(r.test, undefined);
    // No question, no true answer, no uid travels.
    const all = JSON.stringify(r);
    assert.ok(!/secret question|uDana|uYossi|"q"/.test(all), all);
});

test('a player of that game is known by the sign-in uid, or by the last seat', () => {
    const g = finished(now - H);
    assert.strictEqual(nightAfter('ABCD', g, now, 'uAvi').player, true);
    assert.strictEqual(nightAfter('ABCD', g, now, 'new-browser', 'p3').player, true);
    assert.strictEqual(nightAfter('ABCD', g, now, undefined, undefined).player, false);
    assert.strictEqual(nightAfter('ABCD', g, now, 'uStranger', 'p9').player, false);
});

test('only a finished game of 2+ players, for 7 days', () => {
    assert.ok(nightAfter('ABCD', finished(now - NIGHT_AFTER_MS + 60000), now));
    assert.strictEqual(nightAfter('ABCD', finished(now - NIGHT_AFTER_MS - 1), now), null);
    assert.strictEqual(nightAfter('ABCD', finished(now - H, { state: { id: Staging, timestamp: now - 2 * 24 * H } }), now), null);
    const alone = finished(now - H); delete alone.players.p2; delete alone.players.p3; delete alone.players.p4;
    assert.strictEqual(nightAfter('ABCD', alone, now), null);
    assert.strictEqual(nightAfter('ABCD', finished(now - H, { state: { id: Final, timestamp: now - H, taste: { found: 2 } } }), now), null);
});

test('a flagged lie is skipped for the next one; no lie shown when none passes', () => {
    const g = finished(now - H);
    // Swearing is the game's own tone; the filter's words are not.
    g.highlights.p1.text = 'what a cock';
    const r = nightAfter('ABCD', g, now);
    assert.deepStrictEqual(r.lie, { text: 'a goat', fooled: 1, by: 'Yossi' });
    g.highlights.p2.text = 'nigger';
    assert.strictEqual(nightAfter('ABCD', g, now).lie, null);
    const nobody = finished(now - H, { highlights: {} });
    assert.strictEqual(nightAfter('ABCD', nobody, now).lie, null);
    assert.strictEqual(nightAfter('ABCD', nobody, now).rows.some(x => x.biggest), false);
});

test('a test game carries test (the page sends no rows); a crew game carries its crew', () => {
    assert.strictEqual(nightAfter('ABCD', finished(now - H, { campaign: 'test-qa' }), now).test, true);
    assert.strictEqual(nightAfter('ABCD', finished(now - H, { crew: 'k3x9q2' }), now).crew, 'k3x9q2');
});

test('validateGameName: GAME_OVER with the recap for a week, in either half; none beside an open rematch', async () => {
    const pin = pinIn('new');
    const other = pinIn('control');
    seed({ [pin]: finished(now - 3 * H), [other]: finished(now - 3 * H), OLDG: finished(now - 8 * 24 * H),
        RMCH: finished(now - 60000, { fork: 'NEXT' }), NEXT: { state: { id: Staging, timestamp: now }, timestamp: now, players: {} } });
    const v = await call('validateGameName', { pin: pin.toLowerCase(), uid: 'uNoa' });
    assert.strictEqual(v.code, 400);
    assert.strictEqual(v.body.code, 'GAME_OVER');
    assert.strictEqual(v.body.nightAfter.half, 'new');
    assert.strictEqual(v.body.nightAfter.player, true);
    const c = await call('validateGameName', { pin: other });
    assert.strictEqual(c.body.nightAfter.half, 'control');
    assert.strictEqual(c.body.nightAfter.player, false);
    assert.strictEqual((await call('validateGameName', { pin: 'OLDG' })).body.nightAfter, undefined);
    const r = await call('validateGameName', { pin: 'RMCH' });
    assert.strictEqual(r.body.rematch, 'NEXT');
    assert.strictEqual(r.body.nightAfter, undefined);
    // A uid that is no uid is ignored, not an error.
    const bad = await call('validateGameName', { pin, uid: { $gt: '' }, pid: '../x' });
    assert.strictEqual(bad.body.nightAfter.player, false);
    // join still answers GAME_OVER and adds nobody.
    const j = await call('join', { pin, nickname: 'Late', uid: 'uLate' });
    assert.strictEqual(j.body.code, 'GAME_OVER');
    assert.strictEqual(Object.keys(db.games[pin].players).length, 4);
});

test('the rows: night-after methods with the PIN in crew_id; anything else is dropped; a test game writes none', async () => {
    for (const m of ['seen-player', 'seen-other', 'seen-control-player', 'seen-control-other', 'create', 'create-player', 'crew']) {
        assert.deepStrictEqual(cleanShare({ content_type: 'night-after', method: m, crew: 'abcd', locale: 'he', uid: 'u1' }),
            { content_type: 'night-after', method: m, crew_id: 'ABCD', locale: 'he', uid: 'u1' });
    }
    assert.strictEqual(cleanShare({ content_type: 'night-after', method: 'take-home', crew: 'ABCD' }), null);
    assert.strictEqual(cleanShare({ content_type: 'night-after', method: 'create' }), null);
    assert.strictEqual(cleanShare({ content_type: 'night-after', method: 'create', crew: 'AB12' }), null);
    rows.length = 0;
    await onShare(cleanShare({ content_type: 'night-after', method: 'seen-other', crew: 'REAL' }), async () => false);
    await onShare(cleanShare({ content_type: 'night-after', method: 'seen-other', crew: 'TEST' }), async () => true);
    assert.deepStrictEqual(rows.map(r => r.row.crew_id), ['REAL']);
    assert.strictEqual(rows[0].table, 'shares');
});
