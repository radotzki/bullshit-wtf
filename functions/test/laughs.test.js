// Laughs on lies: the laugh function, the reveal's longer hold when lies nobody picked get rows,
// each writer's most laughed-at lie in the highlights, and the final screen's funniest lie.
// Runs the compiled functions (dist/) against an in-memory database: npm test
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');

// ---- in-memory Realtime Database (just what the controllers use) ----
let db = {};
function at(parts) {
    let node = db;
    for (const p of parts) {
        if (node == null || typeof node !== 'object') return null;
        node = node[p];
    }
    return node === undefined ? null : node;
}
function put(parts, value) {
    // Writing nothing where nothing is creates nothing, as in the real database.
    if ((value === null || value === undefined) && at(parts.slice(0, -1)) === null) return;
    let node = db;
    parts.slice(0, -1).forEach(p => { node[p] = node[p] && typeof node[p] === 'object' ? node[p] : {}; node = node[p]; });
    if (value === null || value === undefined) delete node[parts[parts.length - 1]];
    else node[parts[parts.length - 1]] = JSON.parse(JSON.stringify(value));
}
const copy = v => v === null || v === undefined ? null : JSON.parse(JSON.stringify(v));
function ref(parts) {
    return {
        child: (p) => ref(parts.concat(String(p).split('/'))),
        once: async () => ({ val: () => copy(at(parts)) }),
        set: async (v) => put(parts, v),
        update: async (v) => Object.keys(v).forEach(k => put(parts.concat(k.split('/')), v[k])),
        // Like the real client: first on what it holds locally (nothing), then, if that asked for a
        // write, again on what the server holds.
        transaction: (fn, done) => {
            const first = fn(null);
            if (first === undefined) return done(null, false, { val: () => copy(at(parts)) });
            const server = copy(at(parts));
            const v = server === null ? first : fn(server);
            if (v === undefined) return done(null, false, { val: () => server });
            put(parts, v);
            done(null, true, { val: () => copy(v) });
        },
    };
}
const fakeFirebase = { gamesRef: ref(['games']), get: (r) => r.once('value').then(s => s.val()) };
const realLoad = Module._load;
Module._load = function (request) {
    if (/[\\/]firebase$/.test(request) || request === '../firebase') return fakeFirebase;
    return realLoad.apply(this, arguments);
};

const { laugh } = require(path.join(__dirname, '..', 'dist', 'controllers', 'laugh'));
const model = require(path.join(__dirname, '..', 'dist', 'game-model'));
const phase = require(path.join(__dirname, '..', 'dist', 'controllers', 'phase'));

const S = { ShowQuestion: 2, ShowAnswers: 3, RevealTheTruth: 4, ScoreBoard: 5 };

function reveal() {
    return [
        { text: 'kfc', selectors: ['c'], creators: ['a'], realAnswer: false, houseLie: false, points: 500 },
        { text: 'oslo', creators: ['b'], realAnswer: false, houseLie: false, points: 0 },
        { text: 'a goat', selectors: ['b'], creators: [''], realAnswer: false, houseLie: true, points: -250 },
        { text: 'tom', selectors: ['a'], creators: [''], realAnswer: true, houseLie: false, points: 1000 },
    ];
}

function seed(stateId = S.RevealTheTruth) {
    db = { games: { ABCD: {
        state: { id: stateId, timestamp: 1 },
        players: { a: { nickname: 'Ann', score: 0 }, b: { nickname: 'Ben', score: 0 }, c: { nickname: 'Chen', score: 0 } },
        revealAnswers: reveal(),
    } } };
}

test('a player laughs at another player\'s lie, picked or not; twice counts once', async () => {
    seed();
    assert.deepStrictEqual(await laugh('abcd', 'b', 'kfc'), { laughs: 1, taken: true });
    assert.deepStrictEqual(await laugh('ABCD', 'c', 'kfc'), { laughs: 2, taken: true });
    assert.deepStrictEqual(await laugh('ABCD', 'c', 'kfc'), { laughs: 2, taken: true });
    assert.deepStrictEqual(await laugh('ABCD', 'a', 'oslo'), { laughs: 1, taken: true });
    assert.deepStrictEqual(db.games.ABCD.revealAnswers[0].laughs, { b: true, c: true });
    assert.deepStrictEqual(db.games.ABCD.revealAnswers[1].laughs, { a: true });
    // Nothing else on the row changed.
    assert.strictEqual(db.games.ABCD.revealAnswers[0].points, 500);
    assert.deepStrictEqual(db.games.ABCD.revealAnswers[0].selectors, ['c']);
});

test('never at your own lie or the truth, and only from a player of the game', async () => {
    seed();
    await assert.rejects(laugh('ABCD', 'a', 'kfc'), e => e.code === 'NOT_LAUGHABLE');
    await assert.rejects(laugh('ABCD', 'b', 'tom'), e => e.code === 'NOT_LAUGHABLE');
    await assert.rejects(laugh('ABCD', 'zz', 'kfc'), e => e.code === 'NOT_A_PLAYER');
    await assert.rejects(laugh('ABCD', undefined, 'kfc'), e => e.code === 'NOT_A_PLAYER');
    await assert.rejects(laugh('NOPE', 'a', 'kfc'), e => e.code === 'GAME_NOT_EXIST');
    assert.strictEqual(db.games.ABCD.revealAnswers.some(r => r.laughs), false);
});

test('a house lie takes laughs like a player\'s lie, even from the player who picked it', async () => {
    seed();
    assert.deepStrictEqual(await laugh('ABCD', 'b', 'a goat'), { laughs: 1, taken: true });
    assert.deepStrictEqual(await laugh('ABCD', 'a', 'a goat'), { laughs: 2, taken: true });
    assert.deepStrictEqual(db.games.ABCD.revealAnswers[2].laughs, { b: true, a: true });
    assert.strictEqual(db.games.ABCD.revealAnswers[2].points, -250);
});

test('before its writer beat, no button or count tells a house lie from a player\'s lie', () => {
    // The QA objection on pull request 80: a picked house lie had no laugh button and never a count, so
    // every phone knew the house wrote it before the reveal said so. What a screen shows on a lie's row
    // (button, count) must depend only on whether this phone wrote it and on its laughs, not on whose it is.
    const player = { text: 'kfc', selectors: ['c'], creators: ['a'], realAnswer: false, houseLie: false, points: 500 };
    const house = { text: 'a goat', selectors: ['c'], creators: [''], realAnswer: false, houseLie: true, points: -250 };
    for (const laughs of [undefined, { b: true }, { b: true, c: true }]) {
        const p = Object.assign({}, player, { laughs });
        const h = Object.assign({}, house, { laughs });
        // Every phone that did not write the lie (b, c) gets a button on both; the big screen (no pid) on neither.
        for (const pid of ['b', 'c', null, undefined, '']) {
            assert.strictEqual(model.canLaugh(h, pid), model.canLaugh(p, pid), `button for ${pid}`);
        }
        assert.strictEqual(model.isLie(h), true);
        assert.strictEqual(model.isLie(p), true);
        assert.strictEqual(model.laughCount(h), model.laughCount(p));
    }
    // The truth never takes a laugh, and nobody can laugh as the house.
    assert.strictEqual(model.isLie(reveal()[3]), false);
    assert.strictEqual(model.canLaugh(reveal()[3], 'b'), false);
    assert.strictEqual(model.canLaugh(house, ''), false);
});

test('a co-written lie takes no laugh from either of its writers', async () => {
    seed();
    db.games.ABCD.revealAnswers[1].creators = ['b', 'c'];
    await assert.rejects(laugh('ABCD', 'c', 'oslo'), e => e.code === 'NOT_LAUGHABLE');
    assert.deepStrictEqual(await laugh('ABCD', 'a', 'oslo'), { laughs: 1, taken: true });
});

test('taken in the reveal and its scoreboard only; a late or unknown lie writes nothing', async () => {
    for (const id of [S.ShowQuestion, S.ShowAnswers, 6, 0]) {
        seed(id);
        assert.deepStrictEqual(await laugh('ABCD', 'b', 'kfc'), { taken: false });
        assert.strictEqual(db.games.ABCD.revealAnswers[0].laughs, undefined);
    }
    seed(S.ScoreBoard);
    assert.deepStrictEqual(await laugh('ABCD', 'b', 'kfc'), { laughs: 1, taken: true });
    seed();
    assert.deepStrictEqual(await laugh('ABCD', 'b', 'not a lie here'), { taken: false });
});

test('a laugh that lands as the reveal is cleared writes no stray row', async () => {
    seed();
    // The server read the reveal, then the game moved on and cleared it before the write.
    const realGet = fakeFirebase.get;
    fakeFirebase.get = async r => { const v = await realGet(r); db.games.ABCD.revealAnswers = null; return v; };
    try {
        assert.deepStrictEqual(await laugh('ABCD', 'b', 'kfc'), { taken: false });
    } finally {
        fakeFirebase.get = realGet;
    }
    assert.strictEqual(db.games.ABCD.revealAnswers, null);
});

test('a laugh that lands on another question\'s row at the same place writes nothing', async () => {
    seed();
    const realGet = fakeFirebase.get;
    fakeFirebase.get = async r => { const v = await realGet(r); db.games.ABCD.revealAnswers[0].text = 'paris'; return v; };
    try {
        assert.deepStrictEqual(await laugh('ABCD', 'b', 'kfc'), { taken: false });
    } finally {
        fakeFirebase.get = realGet;
    }
    assert.strictEqual(db.games.ABCD.revealAnswers[0].laughs, undefined);
});

test('the hold is a second longer only when a player\'s lie went unpicked, in both reveals', () => {
    const picked = reveal().filter(r => r.text !== 'oslo');
    for (const staged of [false, true]) {
        for (const presenter of [false, true]) {
            const without = model.revealSchedule(picked, presenter, staged);
            const withRow = model.revealSchedule(reveal(), presenter, staged);
            assert.strictEqual(withRow.rows, without.rows);
            assert.strictEqual(withRow.allShown, without.allShown);
            assert.strictEqual(withRow.duration, without.duration + model.LAUGH_HOLD_MS);
        }
    }
    // A house lie nobody picked has no row and adds nothing.
    const house = picked.concat([{ text: 'a cat', creators: [''], houseLie: true, realAnswer: false, points: 0 }]);
    assert.strictEqual(model.revealSchedule(house, false).duration, model.revealSchedule(picked, false).duration);
    assert.ok(phase.phaseDuration(S.RevealTheTruth, { revealAnswers: reveal(), presenter: true, bigReveal: true }) <= phase.maxPhaseDuration);
});

test('the server keeps each writer\'s most laughed-at lie, and laughs leave points and fooling alone', () => {
    const q1 = reveal();
    q1[0].laughs = { b: true, c: true };
    q1[1].laughs = { a: true };
    // A laugh on a house lie is credited to nobody, and one on the truth (never written) counts for nobody:
    // the funniest lie is always a player's.
    q1[2].laughs = { a: true, c: true };
    q1[3].laughs = { b: true, c: true };
    const fooled = model.addHighlights(null, q1, 'Q1');
    const h1 = model.addLaughs(fooled, q1, 'Q1', 0);
    assert.deepStrictEqual(h1.a, { text: 'kfc', fooled: 1, points: 500, q: 'Q1', total: 1, funny: { text: 'kfc', laughs: 2, q: 'Q1', n: 0 } });
    // Ben's lie fooled nobody: a highlight with no best lie, only the laughed one.
    assert.deepStrictEqual(h1.b, { text: '', fooled: 0, points: 0, total: 0, funny: { text: 'oslo', laughs: 1, q: 'Q1', n: 0 } });
    assert.strictEqual(h1.c, undefined);
    assert.deepStrictEqual(model.revealScoreChanges(q1), model.revealScoreChanges(reveal()));

    // Question 2: Ben's new lie gets more laughs, Ann's fewer; the next reveal's addHighlights keeps them.
    const q2 = [
        { text: 'lima', selectors: ['a'], creators: ['b'], points: 500, laughs: { a: true, c: true, x: false } },
        { text: 'rome', creators: ['a'], points: 0, laughs: { c: true } },
    ];
    const h2 = model.addLaughs(model.addHighlights(h1, q2, 'Q2'), q2, 'Q2', 1);
    assert.deepStrictEqual(h2.b.funny, { text: 'lima', laughs: 2, q: 'Q2', n: 1 });
    assert.deepStrictEqual(h2.a.funny, { text: 'kfc', laughs: 2, q: 'Q1', n: 0 });
    assert.strictEqual(h2.b.text, 'lima');
    // No laughs: the very same object, so the server writes nothing.
    assert.strictEqual(model.addLaughs(h2, reveal(), 'Q3'), h2);
    assert.strictEqual(model.addLaughs(undefined, undefined), undefined);
});

test('the funniest lie: most laughs; co-writers share it; level lies go to the later one; none without a laugh', () => {
    assert.deepStrictEqual(model.funniestLies(null), []);
    assert.deepStrictEqual(model.funniestLies({ a: { text: 'x', fooled: 1, points: 500, total: 1 } }), []);
    const h = {
        a: { text: '', fooled: 0, points: 0, total: 0, funny: { text: 'oslo', laughs: 3, n: 1 } },
        b: { text: 'kfc', fooled: 2, points: 1000, total: 2, funny: { text: 'kfc', laughs: 1, n: 3 } },
        c: { text: '', fooled: 0, points: 0, total: 0, funny: { text: 'oslo', laughs: 3, n: 1 } },
    };
    assert.deepStrictEqual(model.funniestLies(h), [{ text: 'oslo', laughs: 3, pids: ['a', 'c'] }]);
    h.b.funny.laughs = 3;
    assert.deepStrictEqual(model.funniestLies(h), [{ text: 'kfc', laughs: 3, pids: ['b'] }]);
    // The same words in another question are another lie.
    h.b.funny.text = 'oslo';
    assert.deepStrictEqual(model.funniestLies(h), [{ text: 'oslo', laughs: 3, pids: ['b'] }]);
});

test('the server folds a question\'s laughs into the highlights as the question ends', async () => {
    // tick.ts calls addLaughs in handleScoreBoardState; checked here by reading its source, since the
    // whole state machine is played in the emulator games (see the pull request).
    const src = require('fs').readFileSync(path.join(__dirname, '..', 'src', 'controllers', 'tick.ts'), 'utf8');
    assert.match(src, /addLaughs\(game\.highlights, game\.revealAnswers/);
});
