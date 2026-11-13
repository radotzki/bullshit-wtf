// "Same time next week?": the sitting's root and half, the crew it makes (tonight's games counted,
// a default name its maker may change), the night on the crew, and the new rows in shares.
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


const nextWeek = require(path.join(dist, 'next-week'));
const crypto = require('crypto');

test('the half follows from the root PIN alone, as BigQuery can recompute it', () => {
    for (const root of ['JVQP', 'jvqp', 'QQQR', 'ABCDE']) {
        const byte = crypto.createHash('sha256').update('next-week:' + root.toUpperCase()).digest()[0];
        assert.strictEqual(nextWeek.nextWeekHalf(root), byte % 2 === 1);
    }
    assert.strictEqual(nextWeek.nextWeekHalf('jvqp'), nextWeek.nextWeekHalf('JVQP'));
    // Both halves exist, and they are about even.
    let on = 0;
    for (let i = 0; i < 2000; i++) on += nextWeek.nextWeekHalf('P' + i.toString(26)) ? 1 : 0;
    assert.ok(on > 900 && on < 1100, `about half: ${on} of 2000`);
});

test('only a group\'s second or later game of a sitting is in the test', () => {
    const two = { a: { nickname: 'Dana' }, b: { nickname: 'Avi' } };
    const final = { id: ScoreBoardFinal, timestamp: 1 };
    // A first game opened by hand: not in the test.
    assert.strictEqual(nextWeek.drawNextWeek('AAAA', { state: final, players: two }), undefined);
    // A Replay: the half of its root, whatever its own PIN.
    assert.strictEqual(nextWeek.drawNextWeek('AAAB', { state: final, players: two, root: 'AAAA' }), nextWeek.nextWeekHalf('AAAA'));
    assert.strictEqual(nextWeek.drawNextWeek('AAAC', { state: final, players: two, root: 'AAAA' }), nextWeek.nextWeekHalf('AAAA'));
    // A crew game that is no Replay is its own root.
    assert.strictEqual(nextWeek.drawNextWeek('BBBB', { state: final, players: two, crew: 'k7m2qx' }), nextWeek.nextWeekHalf('BBBB'));
    assert.strictEqual(nextWeek.sittingRoot('bbbb', { crew: 'k7m2qx' }), 'BBBB');
    // Alone, or a taste: never.
    assert.strictEqual(nextWeek.drawNextWeek('AAAB', { state: final, players: { a: two.a }, root: 'AAAA' }), undefined);
    assert.strictEqual(nextWeek.drawNextWeek('AAAB', { state: { id: 6, timestamp: 1, taste: { found: 2, length: 7 } }, players: two, root: 'AAAA' }), undefined);
    // The state carries it, and only for a game in the test.
    assert.deepStrictEqual(nextWeek.withNextWeek(final, 'AAAA', { state: final, players: two }), final);
    assert.strictEqual(nextWeek.withNextWeek(final, 'AAAB', { state: final, players: two, root: 'AAAA' }).nextWeek, nextWeek.nextWeekHalf('AAAA'));
    assert.strictEqual(nextWeek.withNextWeek(final, 'AAAB', { state: final, players: two, root: 'AAAA' }).id, ScoreBoardFinal);
});

test('the game\'s last step writes the half on the final state', () => {
    const tick = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'controllers', 'tick.ts'), 'utf8');
    assert.match(tick, /state: withNextWeek\(updateState\(GameState\.ScoreBoardFinal\), pin, game\)/);
});

test('Replay carries the sitting\'s root; a taste\'s Replay starts a sitting', async () => {
    seedQuestions();
    const first = await playGame([['Dana', 'u1', 3000], ['Avi', 'u2', 1500]]);
    await fork(first, 'u1');
    const second = db.games[first].fork;
    assert.strictEqual(db.games[second].root, first);
    await playGame([['Dana', 'u1', 100], ['Avi', 'u2', 900]], second);
    await fork(second, 'u2');
    const third = db.games[second].fork;
    assert.strictEqual(db.games[third].root, first, 'the third game has the first game as its root');
    assert.strictEqual(db.games[third].parent, second);

    const taste = await newGame('en', 5, 'u1');
    await join(taste, 'Dana', 'u1');
    db.games[taste].state = { id: ScoreBoardFinal, timestamp: Date.now(), taste: { found: 3, length: 7 } };
    await fork(taste, 'u1');
    assert.strictEqual('root' in db.games[db.games[taste].fork], false);
});

test('a crew made on a second game counts tonight\'s games: "Avi leads 2 to 1"', async () => {
    seedQuestions();
    const first = await playGame([['Dana', 'u1', 3000], ['Avi', 'u2', 1500], ['Noa', 'u3', 10]]);
    await fork(first, 'u1');
    const second = db.games[first].fork;
    await playGame([['Dana', 'u1', 100], ['Avi', 'u2', 900], ['Noa', 'u3', 10]], second);
    await fork(second, 'u1');
    const third = db.games[second].fork;
    await playGame([['Dana', 'u1', 100], ['Avi', 'u2', 900], ['Noa', 'u3', 10]], third);

    const r = await call('createCrew', { pin: third, name: 'Dana\'s crew', uid: 'u2', auto: true });
    assert.strictEqual(r.code, 200);
    assert.strictEqual(r.body.created, true);
    const c = db.crews[r.body.id];
    assert.strictEqual(c.auto, true);
    assert.strictEqual(c.gameCount, 3);
    assert.deepStrictEqual(Object.keys(c.games).sort(), [first, second, third].sort());
    assert.strictEqual(model.crewLeaderLine(c, 'en'), 'Avi leads 2 to 1');
    assert.strictEqual(c.members.dana.points, 3200);
    // The final scoreboard's own trigger does not count the game twice.
    await analytics.onStateChange(third);
    assert.strictEqual(db.crews[r.body.id].gameCount, 3);
    // The earlier games stay as they were: only the game it was saved from points to the crew.
    assert.strictEqual(db.games[first].crew, undefined);
});

test('the chain stops at a taste, an unfinished game or a missing one', async () => {
    seedQuestions();
    const taste = await newGame('en', 5, 'u1');
    await join(taste, 'Dana', 'u1');
    db.games[taste].state = { id: ScoreBoardFinal, timestamp: Date.now(), taste: { found: 3, length: 5 } };
    await fork(taste, 'u1');
    const real = db.games[taste].fork;
    await playGame([['Dana', 'u1', 3000], ['Avi', 'u2', 1500]], real);
    const r = await call('createCrew', { pin: real, name: 'After a taste' });
    assert.strictEqual(db.crews[r.body.id].gameCount, 1);

    const lone = await playGame([['Dana', 'u1', 3000], ['Avi', 'u2', 1500]]);
    db.games[lone].parent = 'ZZZZ';
    const r2 = await call('createCrew', { pin: lone, name: 'Parent gone' });
    assert.strictEqual(db.crews[r2.body.id].gameCount, 1);
});

test('only the browser that made a default-named crew may rename it', async () => {
    seedQuestions();
    const first = await playGame([['Dana', 'u1', 3000], ['Avi', 'u2', 1500]]);
    const made = await call('createCrew', { pin: first, name: 'Dana\'s crew', uid: 'u2', auto: true });
    // Another phone opening the sheet gets the same crew, and its name stays.
    const other = await call('createCrew', { pin: first, name: 'Avi rules', uid: 'u1', auto: true });
    assert.deepStrictEqual(other.body, { id: made.body.id, name: 'Dana\'s crew', created: false });
    // No uid: no rename.
    assert.strictEqual((await call('createCrew', { pin: first, name: 'Nobody', auto: true })).body.name, 'Dana\'s crew');
    // Its maker renames it; a refused name changes nothing.
    const renamed = await call('createCrew', { pin: first, name: '  Friday   Liars ', uid: 'u2', auto: true });
    assert.deepStrictEqual(renamed.body, { id: made.body.id, name: 'Friday Liars', created: false });
    assert.strictEqual(db.crews[made.body.id].name, 'Friday Liars');
    assert.strictEqual(db.crews[made.body.id].gameCount, 1);
    const bad = await call('createCrew', { pin: first, name: 'kkk crew', uid: 'u2', auto: true });
    assert.strictEqual(bad.body.code, 'BAD_NAME');
    assert.strictEqual(db.crews[made.body.id].name, 'Friday Liars');

    // A crew somebody named by hand is never renamed, even by its maker.
    const hand = await playGame([['Dana', 'u1', 3000], ['Avi', 'u2', 1500]]);
    const named = await call('createCrew', { pin: hand, name: 'The Cohens', uid: 'u1' });
    assert.strictEqual((await call('createCrew', { pin: hand, name: 'Changed', uid: 'u1', auto: true })).body.name, 'The Cohens');
    assert.strictEqual(db.crews[named.body.id].auto, undefined);
});

// The night on the crew (crewNight) is tested in crew-night.test.js.

test('the new rows land in shares, and nothing else does', () => {
    const row = (content_type, method, extra = {}) => analytics.cleanShare(Object.assign({ content_type, method }, extra));
    for (const m of ['seen-card', 'seen-control', 'open', 'whatsapp', 'native', 'copy', 'calendar', 'in']) {
        assert.deepStrictEqual(row('next-week', m, { crew: 'K7M2QX', locale: 'he', uid: 'u1' }),
            { content_type: 'next-week', method: m, crew_id: 'k7m2qx', locale: 'he', uid: 'u1' });
    }
    assert.ok(row('crew-save', 'next-week'));
    assert.ok(row('crew-save', 'repeat-offer'));
    assert.strictEqual(row('next-week', 'download'), null);
    assert.strictEqual(row('next-week', 'next-week'), null);
});
