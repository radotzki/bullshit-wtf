// Old games close to strangers (controllers/old-games.ts): 6 hours after its final scoreboard (24 hours
// after it was made, for a game never finished) a game's players, lies and picks move under
// games/<PIN>/kept, which phones can't read. Nothing is erased, and every server reader still reads them.
// Runs the compiled functions (dist/) against an in-memory database, no Firebase project needed:
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
        // Returning undefined aborts, as in the real database. Like it, the first call may be given
        // null, before the value has been read: an abort then ends the transaction unsent.
        transaction: (fn, done) => {
            const first = fn(null);
            if (first === undefined) return done(null, false, { val: () => clone(at(parts)) });
            if (at(parts) === null) { put(parts, first); return done(null, true, { val: () => clone(at(parts)) }); }
            const v = fn(clone(at(parts)));
            if (v === undefined) return done(null, false, { val: () => clone(at(parts)) });
            put(parts, v);
            done(null, true, { val: () => clone(at(parts)) });
        },
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
    gameSweepRef: ref(['gameSweep']),
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
const og = require(path.join(dist, 'old-games'));
const { generateGameName } = require(path.join(dist, 'new-game'));
const { validateGameName } = require(path.join(dist, 'validate-game-name'));
const { fork } = require(path.join(dist, 'fork'));
const { createCrew, createTable, earlierGames } = require(path.join(dist, 'crew'));
const { readPreviewGame } = require(path.join(dist, 'join-preview'));
const { onAnswerSelection } = require(path.join(dist, 'on-answer-selection'));
const { advance } = require(path.join(dist, 'tick'));
const { join } = require(path.join(dist, 'join'));
const { startGame } = require(path.join(dist, 'start'));
console.log = () => {};
console.error = () => {};

const H = 60 * 60 * 1000;
const NOW = Date.now();
const Staging = 0, ShowQuestion = 2, ShowAnswers = 3, Final = 6;

function finished(endedAgo, extra = {}) {
    const ended = NOW - endedAgo;
    return Object.assign({
        state: { id: Final, timestamp: ended }, timestamp: ended - H, locale: 'en', totalQ: 4, roundIndex: 2, questionIndex: 3,
        qids: { 0: 'q0', 1: 'q1', 2: 'q2', 3: 'q3' }, tick: 0, presenter: false,
        creator: 'u1',
        players: {
            p1: { nickname: 'Dana', score: 900, uid: 'u1', host: true },
            p2: { nickname: 'Yossi', score: 500, uid: 'u2' },
            p3: { nickname: 'Noa', score: 300, uid: 'u3' },
        },
        highlights: { p1: { text: 'a cat', fooled: 2, question: 'q3' } },
        answers: { p1: { text: 'a cat', realAnswer: false }, p2: { text: 'a dog', realAnswer: false } },
        revealAnswers: [{ text: 'a cat', writers: ['p1'], pickers: ['p2', 'p3'] }],
        answerSelections: { p2: 'a cat', p3: 'a cat' },
        currentQ: 'Who has a ___?',
    }, extra);
}
function lobby(madeAgo, extra = {}) {
    const made = NOW - madeAgo;
    return Object.assign({
        state: { id: Staging, timestamp: made }, timestamp: made, locale: 'en', totalQ: 4, roundIndex: 0, questionIndex: 0,
        qids: { 0: 'q0', 1: 'q1', 2: 'q2', 3: 'q3' }, tick: 0, presenter: false, creator: 'u9',
        players: { p9: { nickname: 'Avi', score: 0, uid: 'u9', host: true } },
    }, extra);
}
function seed(games, counter) {
    db.games = clone(games);
    db.gameCounter = counter === undefined ? 0 : counter;
    delete db.gameSweep;
    delete db.crews;
    db.questions = {};
    for (let i = 0; i < 12; i++) {
        db.questions['q' + i] = { lang: 'en', questionText: `Question ${i} has a ___`, realAnswer: 't' + i, fakeAnswers: ['a', 'b', 'c'], citation: '' };
    }
    og.forgetSweep();
}
const PRIVATE = ['players', 'highlights', 'answers', 'revealAnswers', 'answerSelections', 'currentQ', 'creator'];

test('isOld: 6 hours after the final scoreboard, or 24 hours after a game that never finished', () => {
    assert.strictEqual(og.isOld(finished(H), NOW), false);
    assert.strictEqual(og.isOld(finished(5.9 * H), NOW), false);
    assert.strictEqual(og.isOld(finished(6 * H), NOW), true);
    assert.strictEqual(og.isOld(finished(7 * H), NOW), true);
    assert.strictEqual(og.isOld(lobby(23 * H), NOW), false);
    assert.strictEqual(og.isOld(lobby(48 * H), NOW), true);
    // A day-old lobby whose host is still there is not moved under its players.
    assert.strictEqual(og.isOld(lobby(25 * H, { hostSeen: NOW - 60 * 1000 }), NOW), false);
    // A live game.
    assert.strictEqual(og.isOld({ state: { id: ShowQuestion, timestamp: NOW - 1000 }, timestamp: NOW - 10 * 60 * 1000 }, NOW), false);
    assert.strictEqual(og.isOld(null, NOW), false);
});

test('a move takes every private part under kept and erases nothing', async () => {
    const before = finished(7 * H);
    seed({ AAAA: before });
    assert.strictEqual(await og.moveGame('AAAA', NOW), true);
    const after = db.games.AAAA;
    PRIVATE.forEach(part => {
        assert.strictEqual(after[part], undefined, `${part} is out of reach`);
        assert.deepStrictEqual(after.kept[part], before[part], `${part} is kept whole`);
    });
    // The public parts stay where they are.
    ['state', 'timestamp', 'locale', 'totalQ', 'qids'].forEach(part => assert.deepStrictEqual(after[part], before[part]));
    assert.strictEqual(after.kept.at, NOW);
    // Put back, the game is the same as before.
    const back = og.withKept(clone(after));
    delete back.kept;
    assert.deepStrictEqual(back, before);
    // Moving again changes nothing.
    assert.strictEqual(await og.moveGame('AAAA', NOW), false);
    assert.deepStrictEqual(db.games.AAAA, after);
});

test('a live game and one that ended an hour ago are not moved', async () => {
    seed({ LIVE: Object.assign(finished(0), { state: { id: ShowAnswers, timestamp: NOW - 5000 } }), HOUR: finished(H) });
    assert.strictEqual(await og.moveGame('LIVE', NOW), false);
    assert.strictEqual(await og.moveGame('HOUR', NOW), false);
    assert.ok(db.games.LIVE.players && db.games.HOUR.players && db.games.HOUR.highlights);
    assert.strictEqual(db.games.HOUR.kept, undefined);
});

test('the sweep walks the PINs in order, passes missing ones, and stops at the first young game', async () => {
    const games = {};
    // Counters 1..6: old, missing, old lobby, old, ended an hour ago, old (behind the young one).
    games[generateGameName(1)] = finished(30 * H);
    games[generateGameName(3)] = lobby(50 * H);
    games[generateGameName(4)] = finished(7 * H);
    games[generateGameName(5)] = finished(H);
    games[generateGameName(6)] = finished(7 * H);
    seed(games, 40);
    const r = await og.sweepOldGames(NOW);
    assert.deepStrictEqual({ next: r.next, moved: r.moved }, { next: 5, moved: 3 });
    [1, 3, 4].forEach(c => assert.ok(db.games[generateGameName(c)].kept, `${c} moved`));
    [5, 6].forEach(c => assert.ok(db.games[generateGameName(c)].players && !db.games[generateGameName(c)].kept, `${c} not moved`));
    assert.strictEqual(db.gameSweep.next, 5);
    assert.strictEqual(db.gameSweep.lease, 0);
    // Not again within the minute, in this running copy.
    assert.strictEqual(await og.sweepOldGames(NOW + 1000), null);
    // Six hours on, the next sweep goes on from there.
    const later = NOW + 6 * H;
    const r2 = await og.sweepOldGames(later);
    assert.strictEqual(r2.moved, 2);
    assert.ok(db.games[generateGameName(5)].kept && db.games[generateGameName(6)].kept);
    // Nothing of any game was erased: every one still has its three players somewhere.
    Object.keys(db.games).forEach(pin => assert.strictEqual(Object.keys(og.withKept(db.games[pin]).players).length, pin === generateGameName(3) ? 1 : 3));
});

test('a PIN with no game near the counter may still be being made: the sweep waits for it', async () => {
    const games = {};
    games[generateGameName(1)] = finished(30 * H);
    games[generateGameName(3)] = finished(30 * H);
    seed(games, 4);
    const r = await og.sweepOldGames(NOW);
    assert.deepStrictEqual({ next: r.next, moved: r.moved }, { next: 2, moved: 1 });
});

test('one copy sweeps at a time', async () => {
    const games = {};
    games[generateGameName(1)] = finished(30 * H);
    seed(games, 40);
    db.gameSweep = { next: 0, lease: NOW + 60 * 1000 };
    const r = await og.sweepOldGames(NOW);
    assert.strictEqual(r.skipped, 'busy');
    assert.ok(db.games[generateGameName(1)].players);
});

test('a sweep looks at no more than its batch, and the next goes on', async () => {
    const games = {};
    for (let c = 1; c <= 30; c++) games[generateGameName(c)] = finished(30 * H);
    seed(games, 30);
    const r = await og.sweepOldGames(NOW, 12, 12);
    assert.deepStrictEqual({ next: r.next, moved: r.moved }, { next: 13, moved: 12 });
    og.forgetSweep();
    const r2 = await og.sweepOldGames(NOW + 2 * 60 * 1000, 100, 100);
    assert.strictEqual(r2.next, 31);
    for (let c = 1; c <= 30; c++) assert.ok(db.games[generateGameName(c)].kept);
});

test('far behind, a sweep looks at up to 1,000 games; caught up, at 200', async () => {
    // 1,500 games that ended 30 hours ago: far behind, so 1,000, then the other 500.
    const games = {};
    for (let c = 1; c <= 1500; c++) games[generateGameName(c)] = finished(30 * H);
    seed(games, 1500);
    const r = await og.sweepOldGames(NOW);
    assert.deepStrictEqual({ next: r.next, moved: r.moved, looked: r.looked, far: r.far }, { next: 1001, moved: 1000, looked: 1000, far: true });
    og.forgetSweep();
    const r2 = await og.sweepOldGames(NOW + 2 * 60 * 1000);
    assert.deepStrictEqual({ next: r2.next, moved: r2.moved }, { next: 1501, moved: 500 });
    for (let c = 1; c <= 1500; c++) assert.ok(db.games[generateGameName(c)].kept);

    // 300 games that ended 7 hours ago (made 8 hours ago): caught up, so 200 a sweep, as before.
    const recent = {};
    for (let c = 1; c <= 300; c++) recent[generateGameName(c)] = finished(7 * H);
    seed(recent, 300);
    const r3 = await og.sweepOldGames(NOW);
    assert.deepStrictEqual({ next: r3.next, moved: r3.moved, far: r3.far }, { next: 201, moved: 200, far: false });
});

test('the bigger batch ends where the games stop being far behind', async () => {
    // 210 games from 30 hours ago, then 300 made 8 hours ago: past 200 while far behind, then back to
    // 200 at the end of the group of 25 that reaches the newer games.
    const games = {};
    for (let c = 1; c <= 210; c++) games[generateGameName(c)] = finished(30 * H);
    for (let c = 211; c <= 510; c++) games[generateGameName(c)] = finished(7 * H);
    seed(games, 510);
    const r = await og.sweepOldGames(NOW);
    assert.deepStrictEqual({ next: r.next, moved: r.moved, far: r.far }, { next: 226, moved: 225, far: true });
});

test('a sweep stops walking after its time budget by the real clock, and the next goes on', async () => {
    const games = {};
    for (let c = 1; c <= 1500; c++) games[generateGameName(c)] = finished(30 * H);
    seed(games, 1500);
    // Each look at the clock is 10 seconds on: two groups of 25 fit in the 30-second budget.
    let t = 0;
    const r = await og.sweepOldGames(NOW, og.SWEEP_BATCH, og.CATCHUP_BATCH, () => (t += 10000) - 10000);
    assert.deepStrictEqual({ next: r.next, moved: r.moved }, { next: 51, moved: 50 });
    assert.strictEqual(db.gameSweep.next, 51);
    assert.strictEqual(db.gameSweep.lease, 0);
});

test('the sweep passes over an older game that is not old yet, notes it, and carries on to the old games after it', async () => {
    const games = {};
    // 1 old; 2 a lobby made 20 hours ago; 3 a day-old lobby still open in a host's tab; 4 and 5 ended
    // 7 hours ago; 6 ended an hour ago (made 2 hours ago: young, so the walk stops there).
    games[generateGameName(1)] = finished(30 * H);
    games[generateGameName(2)] = lobby(20 * H);
    games[generateGameName(3)] = lobby(30 * H, { hostSeen: NOW - 20 * 1000 });
    games[generateGameName(4)] = finished(7 * H);
    games[generateGameName(5)] = finished(7 * H);
    games[generateGameName(6)] = finished(H);
    seed(games, 6);
    const r = await og.sweepOldGames(NOW);
    assert.deepStrictEqual({ next: r.next, moved: r.moved, waiting: r.waiting }, { next: 6, moved: 3, waiting: 2 });
    [1, 4, 5].forEach(c => assert.ok(db.games[generateGameName(c)].kept, `${c} moved`));
    [2, 3, 6].forEach(c => assert.ok(!db.games[generateGameName(c)].kept, `${c} not moved`));
    // Each passed-over game is noted with the time it may first be old.
    assert.deepStrictEqual(db.gameSweep.wait, {
        [generateGameName(2)]: NOW + 4 * H,
        [generateGameName(3)]: NOW - 20 * 1000 + 6 * H,
    });

    // Five hours on: the 20-hour lobby is a day old and moves; the open tab isn't due yet and isn't read.
    og.forgetSweep();
    const r2 = await og.sweepOldGames(NOW + 5 * H);
    assert.deepStrictEqual({ next: r2.next, moved: r2.moved, waiting: r2.waiting, looked: r2.looked }, { next: 7, moved: 2, waiting: 1, looked: 2 });
    assert.ok(db.games[generateGameName(2)].kept && db.games[generateGameName(6)].kept);
    // The host's tab is still open: its lobby waits on, and games made after it still move.
    db.games[generateGameName(3)].hostSeen = NOW + 6.5 * H;
    db.games[generateGameName(7)] = finished(7 * H, { timestamp: NOW - 6 * H });
    db.gameCounter = 7;
    og.forgetSweep();
    const r3 = await og.sweepOldGames(NOW + 7 * H);
    assert.strictEqual(r3.moved, 1);
    assert.ok(db.games[generateGameName(7)].kept, 'a game after the open lobby moved');
    assert.ok(!db.games[generateGameName(3)].kept, 'the open lobby is not moved under its host');
    assert.deepStrictEqual(db.gameSweep.wait, { [generateGameName(3)]: NOW + 12.5 * H });
    // The tab closes: six hours later the lobby moves, and nothing waits any more.
    og.forgetSweep();
    const r4 = await og.sweepOldGames(NOW + 13 * H);
    assert.strictEqual(r4.moved, 1);
    assert.ok(db.games[generateGameName(3)].kept);
    assert.strictEqual(db.gameSweep.wait, undefined);
    // Nothing of any game was erased.
    Object.keys(db.games).forEach(pin => assert.ok(Object.keys(og.withKept(db.games[pin]).players).length >= 1));
});

test('with the wait list full, the walk stops at the next game that is not old yet, as before', async () => {
    const games = {};
    for (let c = 1; c <= og.WAIT_MAX + 1; c++) games[generateGameName(c)] = lobby(20 * H);
    games[generateGameName(og.WAIT_MAX + 2)] = finished(7 * H);
    seed(games, og.WAIT_MAX + 40);
    const r = await og.sweepOldGames(NOW);
    assert.deepStrictEqual({ next: r.next, moved: r.moved, waiting: r.waiting }, { next: og.WAIT_MAX + 1, moved: 0, waiting: og.WAIT_MAX });
    assert.ok(!db.games[generateGameName(og.WAIT_MAX + 2)].kept);
});

test('the whole project sweeps at most once a minute, however many copies run', async () => {
    const games = {};
    for (let c = 1; c <= 30; c++) games[generateGameName(c)] = finished(30 * H);
    seed(games, 60);
    const r = await og.sweepOldGames(NOW, 10, 10);
    assert.strictEqual(r.moved, 10);
    assert.strictEqual(db.gameSweep.at, NOW);
    // Another running copy (its own minute is free), half a minute later: refused, nothing read.
    og.forgetSweep();
    const r2 = await og.sweepOldGames(NOW + 30 * 1000, 10, 10);
    assert.strictEqual(r2.skipped, 'soon');
    assert.strictEqual(db.gameSweep.next, 11);
    assert.ok(!db.games[generateGameName(11)].kept);
    // A third copy, a minute after the first sweep started: it sweeps.
    og.forgetSweep();
    const r3 = await og.sweepOldGames(NOW + 61 * 1000, 10, 10);
    assert.strictEqual(r3.moved, 10);
    assert.strictEqual(db.gameSweep.at, NOW + 61 * 1000);
    // A start time far ahead (a clock gone wrong) doesn't hold the sweep back.
    db.gameSweep.at = NOW + 24 * H;
    og.forgetSweep();
    const r4 = await og.sweepOldGames(NOW + 2 * 60 * 1000, 10, 10);
    assert.strictEqual(r4.moved, 10);
    assert.strictEqual(db.gameSweep.lease, 0);
});

test('a copy whose lease ran out, and another took the sweep, keeps nothing of its walk', async () => {
    const games = {};
    for (let c = 1; c <= 30; c++) games[generateGameName(c)] = finished(30 * H);
    seed(games, 60);
    // Another copy takes the sweep while this one walks, as if this one had been frozen past its lease.
    const counter = fakeFirebase.gameCounterRef;
    const realOnce = counter.once;
    counter.once = async () => {
        db.gameSweep = { next: 25, lease: NOW + 10 * 60 * 1000, at: NOW + 4 * 60 * 1000 };
        return realOnce();
    };
    try {
        const r = await og.sweepOldGames(NOW, 10, 10);
        assert.strictEqual(r.moved, 10);
    } finally {
        counter.once = realOnce;
    }
    assert.deepStrictEqual(db.gameSweep, { next: 25, lease: NOW + 10 * 60 * 1000, at: NOW + 4 * 60 * 1000 });
});

// ---- every server reader still works on an old game ----

async function oldGame(pin, extra) {
    seed({ [pin]: finished(7 * H, extra) }, 10);
    assert.strictEqual(await og.moveGame(pin, NOW), true);
}

test('the PIN check: an old game is over, not a wrong PIN', async () => {
    await oldGame('OLDA');
    await assert.rejects(validateGameName('olda'), e => e.code === 'GAME_OVER');
    await assert.rejects(join('OLDA', 'Bob', 'u5'), e => e.code === 'GAME_OVER');
    assert.strictEqual(db.games.OLDA.players, undefined, 'no new player written');
});

test('Replay of an old game seats its players and takes its language and length', async () => {
    await oldGame('OLDB', { locale: 'he' });
    db.questions = Object.fromEntries(Object.entries(db.questions).map(([k, q]) => [k, Object.assign({}, q, { lang: 'he' })]));
    const r = await fork('OLDB', 'u1', 'p1', 'k'.repeat(20));
    const replay = db.games[r.pin];
    assert.ok(replay, 'the Replay was made');
    assert.strictEqual(replay.locale, 'he');
    assert.strictEqual(replay.parent, 'OLDB');
    assert.ok(Object.keys(replay.players || {}).length >= 1, 'the Replay seats the old game\'s players');
    assert.strictEqual(db.games.OLDB.fork, r.pin);
    assert.strictEqual(db.games.OLDB.players, undefined, 'the old game stays closed');
});

test('crew save, its sitting, and invite another group read an old game\'s players', async () => {
    seed({ PREV: finished(8 * H), OLDC: finished(7 * H, { parent: 'PREV' }) }, 10);
    await og.moveGame('PREV', NOW);
    await og.moveGame('OLDC', NOW);
    const earlier = await earlierGames(og.withKept(db.games.OLDC));
    assert.deepStrictEqual(earlier.map(e => e.pin), ['PREV']);
    const crew = await createCrew('OLDC', 'The Cats', 'u1');
    assert.ok(crew.id);
    const saved = db.crews[crew.id];
    assert.ok(saved, 'the crew is saved');
    assert.ok(JSON.stringify(saved).includes('dana'), 'with the old game\'s players');
    const table = await createTable('OLDC', 'p2', NOW + 24 * H, 'u2');
    assert.ok(table.id);
});

test('the join link preview names the old game\'s host', async () => {
    await oldGame('OLDD');
    const g = await readPreviewGame('OLDD');
    assert.strictEqual(g.creator, 'u1');
    assert.strictEqual(g.players.p1.nickname, 'Dana');
    assert.strictEqual(await readPreviewGame('NONE'), null);
});

test('a pick written on an old game, or the move itself, plays nothing and writes nothing back', async () => {
    await oldGame('OLDE');
    const before = clone(db.games.OLDE);
    db.games.OLDE.answerSelections = { stranger: 'x' };
    // The stranger's pick never takes the place of the real ones for the server's readers.
    assert.deepStrictEqual(og.withKept(db.games.OLDE).answerSelections, before.kept.answerSelections);
    assert.deepStrictEqual((await og.readGame('OLDE')).answerSelections, { p2: 'a cat', p3: 'a cat' });
    await onAnswerSelection('OLDE');
    assert.strictEqual(db.games.OLDE.players, undefined);
    await advance('OLDE', clone(db.games.OLDE.state));
    assert.deepStrictEqual(db.games.OLDE.state, before.state);
});

test('an abandoned lobby, once moved, can no longer be started', async () => {
    seed({ OLDF: lobby(50 * H, { hostKey: 'k'.repeat(20) }) }, 10);
    assert.strictEqual(await og.moveGame('OLDF', NOW), true);
    await startGame('OLDF', 'k'.repeat(20)).catch(() => null);
    assert.strictEqual(db.games.OLDF.state.id, Staging);
    assert.strictEqual(db.games.OLDF.players, undefined);
});

test('readPart reads a part from its own place, then from kept', async () => {
    await oldGame('OLDG');
    assert.strictEqual((await og.readPart('OLDG', 'players')).p2.nickname, 'Yossi');
    assert.strictEqual(await og.readPart('OLDG', 'locale'), 'en');
    seed({ LIVE: finished(H) });
    assert.strictEqual((await og.readPart('LIVE', 'players')).p3.nickname, 'Noa');
});

// The sweep runs from the gameState trigger alone, which keeps no phone waiting. The daily puzzle's
// answer neither waits for it nor starts it (work after an answer may be frozen).
test('the daily puzzle never runs the sweep; a game\'s phase change does', () => {
    const fs = require('fs');
    const index = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');
    const block = (from, to) => index.slice(index.indexOf(from), index.indexOf(to, index.indexOf(from)));
    const dailyBlock = block('exports.daily = ', 'exports.newGame = ');
    assert.ok(dailyBlock.length > 100);
    assert.doesNotMatch(dailyBlock.replace(/\/\/.*$/gm, ''), /sweepOldGames|holdAnswerFor/);
    assert.match(block('exports.gameState = ', 'exports.onFork = '), /sweepOldGames\(\)/);
});
