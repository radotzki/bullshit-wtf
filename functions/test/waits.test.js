// Refused joins and answer waits: the "game is full" row, and on each question row the seconds
// from the first to the last lie, the same for picks, and the lies nobody picked.
// Runs the compiled functions (dist/) against an in-memory database and a fake BigQuery, so it
// needs no Firebase project or credentials:  npm run build && npm test
// The whole game at the end prints the rows it would have sent (lines starting "# refused_joins" and "# question_results").
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
    if (value === null || value === undefined) delete node[parts[parts.length - 1]];
    else node[parts[parts.length - 1]] = JSON.parse(JSON.stringify(value));
}
let pushId = 0;
// Paths whose writes fail, to check that a failed time stamp never fails the game.
const failWrites = new Set();
function ref(parts) {
    const write = async (fn) => {
        if ([...failWrites].some(p => parts.join('/').indexOf(p) >= 0)) throw new Error('write refused (test)');
        fn();
    };
    return {
        child: (p) => ref(parts.concat(String(p).split('/'))),
        once: async () => ({ val: () => JSON.parse(JSON.stringify(at(parts))) }),
        set: (v) => write(() => put(parts, v)),
        update: (v) => write(() => Object.keys(v).forEach(k => put(parts.concat(k.split('/')), v[k]))),
        push: (v) => { const key = 'p' + (++pushId); if (v !== undefined) put(parts.concat(key), v); return { key }; },
        transaction: (fn, done) => { const v = fn(at(parts)); if (v !== undefined) put(parts, v); done(null, v !== undefined, { val: () => v }); },
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

// ---- fake BigQuery ----
// `schema` is null (every table exists and takes every field), or { table: [column, ...] }: then it
// behaves as BigQuery does for a streaming insert with ignoreUnknownValues. A table that is not
// there fails the insert; a field with no column is dropped and the rest of the row lands.
let schema = null;
const rows = [];
class FakeBigQuery {
    dataset(name) {
        return { table: (table) => ({ insert: async (row, opts) => {
            if (schema && !schema[table]) {
                const e = new Error(`Not found: Table bullshit-wtf-prod:${name}.${table}`);
                e.code = 404;
                throw e;
            }
            let stored = row;
            if (schema) {
                const unknown = Object.keys(row).filter(k => schema[table].indexOf(k) < 0);
                if (unknown.length && !(opts && opts.ignoreUnknownValues)) {
                    const e = new Error('A failure occurred during this request.');
                    e.name = 'PartialFailureError';
                    e.errors = [{ errors: unknown.map(k => ({ reason: 'invalid', message: `no such field: ${k}.` })) }];
                    throw e;
                }
                stored = Object.fromEntries(Object.entries(row).filter(([k]) => schema[table].indexOf(k) >= 0));
            }
            rows.push({ dataset: name, table, row: stored, opts });
        } }) };
    }
}

// ---- fake firebase-functions v1 and cors: keep each handler to call directly ----
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
const { spanSeconds, newPickers, eventTime, stamp } = require(path.join(dist, 'answer-times'));
const { questionResult } = require(path.join(dist, 'lie-helper'));
const { newGame } = require(path.join(dist, 'new-game'));
const { join } = require(path.join(dist, 'join'));
const { answer } = require(path.join(dist, 'answer'));
const { advance } = require(path.join(dist, 'tick'));
const analytics = require(path.join(dist, 'analytics'));
const api = require(path.join(__dirname, '..', 'dist', 'index'));

function call(name, body) {
    return new Promise((resolve) => {
        const res = {
            code: 200,
            status(c) { this.code = c; return this; },
            send(b) { resolve({ code: this.code, body: b }); return this; },
        };
        api[name].__handler({ body, headers: {} }, res);
    });
}

const names = ['GameStaging', 'RoundIntro', 'ShowQuestion', 'ShowAnswers', 'RevealTheTruth', 'ScoreBoard', 'ScoreBoardFinal'];
const realLog = console.log, realError = console.error;
const quiet = () => { console.log = () => {}; console.error = () => {}; };
const loud = () => { console.log = realLog; console.error = realError; };
const take = (table) => rows.filter(r => r.table === table).map(r => r.row);

// The columns the live tables have today (knowledge of 2026-11-11), before this change's SQL is run.
const TODAY = {
    opened_games: ['id', 'players', 'questions', 'locale', 'presenter', 'time', 'creator_uid', 'origin', 'parent_pin', 'crew_id', 'pack', 'campaign', 'coach'],
    closed_games: ['id', 'players', 'questions', 'locale', 'presenter', 'time', 'creator_uid', 'origin', 'parent_pin', 'crew_id', 'pack', 'campaign', 'coach'],
    question_results: ['time', 'id', 'q_index', 'round', 'total_q', 'players', 'lies', 'idea_lies', 'picks', 'friend_fooled', 'coach', 'locale'],
};

function seed() {
    Object.keys(db).forEach(k => delete db[k]);
    db.gameCounter = 100;
    db.questions = {};
    for (let i = 0; i < 12; i++) {
        db.questions['q' + i] = { lang: 'en', questionText: `Question ${i} has a ___`, realAnswer: `truth ${i}`, fakeAnswers: ['house a', 'house b', 'house c'], citation: '' };
    }
    rows.length = 0;
    failWrites.clear();
    schema = null;
}

// ---------------------------------------------------------------------------------------------

test('span: seconds from the first to the last stamp, to a tenth', () => {
    const times = { a: { q: 2, at: 10000 }, b: { q: 2, at: 14260 }, c: { q: 2, at: 31000 } };
    assert.strictEqual(spanSeconds(['a', 'b', 'c'], times, 2), 21);
    assert.strictEqual(spanSeconds(['a', 'b'], times, 2), 4.3);
    assert.strictEqual(spanSeconds(['b', 'a'], times, 2), 4.3);
});

test('span: nothing to measure gives null, never a wrong number', () => {
    const times = { a: { q: 2, at: 10000 }, b: { q: 2, at: 14000 }, old: { q: 1, at: 500 } };
    assert.strictEqual(spanSeconds([], times, 2), null);
    assert.strictEqual(spanSeconds(['a'], times, 2), null, 'one answer is not a wait');
    assert.strictEqual(spanSeconds(['a', 'x'], times, 2), null, 'a player with no stamp');
    assert.strictEqual(spanSeconds(['a', 'old'], times, 2), null, 'a stamp left from an earlier question');
    assert.strictEqual(spanSeconds(['a', 'b'], undefined, 2), null, 'a game from before the stamps');
    assert.strictEqual(spanSeconds(['a', 'b'], { a: { q: 2, at: 'x' }, b: { q: 2, at: 1 } }, 2), null);
});

test('new pickers are the players a write added; the event time is read, else the time now', () => {
    assert.deepStrictEqual(newPickers(null, { a: { text: 'x' } }), ['a']);
    assert.deepStrictEqual(newPickers({ a: { text: 'x' } }, { a: { text: 'x' }, b: { text: 'y' } }), ['b']);
    assert.deepStrictEqual(newPickers({ a: { text: 'x' } }, { a: { text: 'x', score: 500 } }), [], 'scoring is not a pick');
    assert.deepStrictEqual(newPickers({ a: { text: 'x' } }, null), [], 'cleared for the next question');
    assert.strictEqual(eventTime('2026-11-11T19:00:00.250Z'), Date.UTC(2026, 10, 11, 19, 0, 0, 250));
    assert.strictEqual(eventTime(undefined, 42), 42);
    assert.strictEqual(eventTime('not a time', 42), 42);
    assert.deepStrictEqual(stamp(undefined, 7), { q: 0, at: 7 });
});

test('the question row: both spans and the lies nobody picked', () => {
    const game = {
        questionIndex: 3, roundIndex: 1, totalQ: 7, locale: 'en',
        players: { a: {}, b: {}, c: {}, d: {} },
        answers: {
            a: { text: 'a goat named steve', houseLie: false, realAnswer: false },
            b: { text: 'reverse paradise', houseLie: false, realAnswer: false },
            c: { text: ' Reverse Paradise', houseLie: false, realAnswer: false },   // the same lie as b
            d: { text: 'nobody buys this', houseLie: false, realAnswer: false },
            h1: { text: 'gloom atoll', houseLie: true, realAnswer: false },
            truth: { text: 'disappointment islands', houseLie: false, realAnswer: true },
        },
        answerSelections: {
            a: { text: 'reverse paradise' },          // fooled by b and c
            b: { text: 'disappointment islands' },
            c: { text: 'gloom atoll' },
        },
        answerTimes: {
            lies: { a: { q: 3, at: 1000 }, b: { q: 3, at: 4000 }, c: { q: 3, at: 9500 }, d: { q: 3, at: 23000 } },
            picks: { a: { q: 3, at: 50000 }, b: { q: 3, at: 52000 }, c: { q: 3, at: 61900 }, d: { q: 2, at: 1 } },
        },
    };
    const r = questionResult('WAIT', game);
    assert.strictEqual(r.lies, 4);
    assert.strictEqual(r.lie_span_s, 22);
    assert.strictEqual(r.picks, 3);
    assert.strictEqual(r.pick_span_s, 11.9);
    assert.strictEqual(r.unpicked_lies, 2, "a's and d's; the lie b and c share was picked");
    assert.strictEqual(r.friend_fooled, 1);
});

test('the question row holds numbers only: no player id, name or text', () => {
    const r = questionResult('WAIT', {
        questionIndex: 0, roundIndex: 0, totalQ: 7, locale: 'en',
        players: { pidSecret1: { nickname: 'Dana', uid: 'uidSecret' }, pidSecret2: { nickname: 'Avi', uid: 'uidSecret2' } },
        answers: { pidSecret1: { text: 'my secret lie', houseLie: false, realAnswer: false }, pidSecret2: { text: 'another', houseLie: false, realAnswer: false } },
        answerSelections: { pidSecret1: { text: 'another' } },
        answerTimes: { lies: { pidSecret1: { q: 0, at: 1 }, pidSecret2: { q: 0, at: 2001 } } },
    });
    assert.deepStrictEqual(Object.keys(r).sort(), ['coach', 'friend_fooled', 'id', 'idea_lies', 'lie_span_s', 'lies', 'locale',
        'pick_span_s', 'picks', 'players', 'q_index', 'round', 'total_q', 'unpicked_lies']);
    assert.ok(!/secret|dana|avi|another/i.test(JSON.stringify(r)));
});

async function fullLobby(options = {}) {
    const pin = await newGame('en', 3, 'hostUid', options);
    db.games[pin].coach = false;
    for (let i = 1; i <= 8; i++) await join(pin, 'player' + i, 'uid' + i);
    return pin;
}

test('a ninth join is refused and leaves one row about the game, nothing about the player', async () => {
    seed();
    quiet();
    const pin = await fullLobby({ campaign: 'fb-he-hanukkah' });
    rows.length = 0;
    const res = await call('join', { pin, nickname: 'Ninth Person', uid: 'ninthUid' });
    loud();

    assert.strictEqual(res.code, 400);
    assert.strictEqual(res.body.code, 'GAME_IS_FULL');
    assert.strictEqual(Object.keys(db.games[pin].players).length, 8);
    assert.strictEqual(rows.length, 1);
    const { row, table, opts } = rows[0];
    assert.strictEqual(table, 'refused_joins');
    assert.strictEqual(opts.ignoreUnknownValues, true);
    assert.ok(row.time instanceof Date);
    assert.deepStrictEqual(Object.assign({}, row, { time: null }),
        { pin, players: 8, started: false, locale: 'en', campaign: 'fb-he-hanukkah', time: null });
    assert.ok(!/ninth/i.test(JSON.stringify(row)));
});

test('a test game stays tellable: its refused join carries the test tag, and its PIN', async () => {
    seed();
    quiet();
    const pin = await fullLobby({ campaign: 'test-qa' });
    db.games[pin].state = { id: 2, timestamp: Date.now() };
    await assert.rejects(join(pin.toLowerCase(), 'late', 'u9'), { code: 'GAME_IS_FULL' });
    loud();
    const [row] = take('refused_joins');
    assert.strictEqual(row.campaign, 'test-qa');
    assert.strictEqual(row.pin, pin);
    assert.strictEqual(row.started, true, 'the game had left the lobby');
});

test('other refusals are not counted: a wrong PIN, a join that fits', async () => {
    seed();
    quiet();
    await assert.rejects(join('NOPE', 'x', 'u'), { code: 'GAME_NOT_EXIST' });
    const pin = await newGame('en', 3, 'hostUid');
    await join(pin, 'one', 'u1');
    loud();
    assert.strictEqual(take('refused_joins').length, 0);
});

// Plays one question: who lies when (seconds into the question), who picks what and when.
// Lies go through the answer function; picks are written as a phone writes them, each followed
// by the onAnswerSelection trigger as index.ts wires it. The clock is the test's own.
async function playQuestion(t, pin, lies, picks) {
    const g = () => db.games[pin];
    const step = async (want) => {
        await advance(pin, g().state);
        assert.strictEqual(names[g().state.id], want);
    };
    const start = Date.now();
    for (const [pid, sec, text] of lies) {
        t.mock.timers.setTime(start + sec * 1000);
        await answer(pin, pid, text);
    }
    if (g().state.id === 2) {
        t.mock.timers.setTime(start + 25000);
        await step('ShowAnswers');
    }
    const picksStart = Date.now();
    for (const [pid, sec, text] of picks) {
        const before = JSON.parse(JSON.stringify(g().answerSelections || null));
        t.mock.timers.setTime(picksStart + sec * 1000);
        await fakeFirebase.gamesRef.child(pin).child('answerSelections').child(pid).set({ text });
        const after = JSON.parse(JSON.stringify(g().answerSelections));
        await api.onAnswerSelection.__trigger(
            { before: { val: () => before }, after: { val: () => after } },
            { params: { pin }, timestamp: new Date(Date.now()).toISOString() });
    }
    if (g().state.id === 3) {
        t.mock.timers.setTime(picksStart + 20000);
        await step('RevealTheTruth');
    }
    await step('ScoreBoard');
    t.mock.timers.setTime(Date.now() + 5000);
    await advance(pin, g().state);
}

async function wholeGame(t, options = {}) {
    const pin = await fullLobby(options);
    const pids = Object.keys(db.games[pin].players);
    const [p1, p2, p3, p4, p5, p6, p7, p8] = pids;

    await advance(pin, db.games[pin].state);                       // START
    await analytics.onStateChange(pin);                            // the gameState trigger: opened_games
    const ninth = await call('join', { pin, nickname: 'Ninth Person', uid: 'ninthUid' });
    await advance(pin, db.games[pin].state);                       // round intro over

    // Question 1: everyone lies within 18.4 s and picks within 9.5 s. Three lies are picked.
    await playQuestion(t, pin,
        pids.map((pid, i) => [pid, 4 + i * 2 + (i === 7 ? 0.4 : 0), 'lie ' + (i + 1)]),
        [[p1, 2, 'lie 2'], [p2, 3, 'lie 1'], [p3, 3.5, 'lie 1'], [p4, 4, 'lie 5'], [p5, 6, 'truth'],
            [p6, 7, 'house a'], [p7, 9, 'lie 2'], [p8, 11.5, 'lie 1']]);
    await advance(pin, db.games[pin].state);                       // round 2 intro over

    // Question 2: five lie (p6 to p8 are slow or gone), the timer runs out; six pick, the timer runs out.
    await playQuestion(t, pin,
        [[p1, 3, 'alpha'], [p2, 5, 'beta'], [p3, 5.5, 'gamma'], [p4, 9, 'beta'], [p5, 21.3, 'delta']],
        [[p1, 1, 'beta'], [p2, 2, 'alpha'], [p3, 2.5, 'beta'], [p4, 3, 'delta'], [p5, 4, 'house b'], [p6, 16.2, 'beta']]);
    await advance(pin, db.games[pin].state);                       // round 3 intro over

    // Question 3: one lie only (not a wait), two picks, the lie fools nobody.
    await playQuestion(t, pin, [[p1, 6, 'solo lie']], [[p2, 5, 'house a'], [p3, 8, 'house c']]);
    assert.strictEqual(names[db.games[pin].state.id], 'ScoreBoardFinal');
    await analytics.onStateChange(pin);                            // closed_games
    return { pin, ninth };
}

test('a whole game of 8 with a ninth join refused: the rows it sends', async (t) => {
    seed();
    t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 11, 20, 0, 0) });
    quiet();
    const { pin, ninth } = await wholeGame(t, { campaign: 'test-waits' });
    loud();

    assert.strictEqual(ninth.code, 400);
    assert.strictEqual(ninth.body.code, 'GAME_IS_FULL');
    const [refused] = take('refused_joins');
    assert.deepStrictEqual(Object.assign({}, refused, { time: null }),
        { pin, players: 8, started: true, locale: 'en', campaign: 'test-waits', time: null });

    const q = take('question_results');
    assert.strictEqual(q.length, 3);
    const got = q.map(r => [r.q_index, r.players, r.lies, r.lie_span_s, r.picks, r.pick_span_s, r.unpicked_lies, r.friend_fooled]);
    assert.deepStrictEqual(got, [
        [0, 8, 8, 14.4, 8, 9.5, 5, 6],     // lies 1, 2 and 5 were picked; 5 of 8 fooled nobody
        [1, 8, 5, 18.3, 6, 15.2, 1, 5],    // "gamma" fooled nobody; "beta" (two writers) was picked
        [2, 8, 1, null, 2, 3, 1, 0],       // one lie is not a wait
    ]);
    assert.strictEqual(take('opened_games').length, 1);
    assert.strictEqual(take('closed_games').length, 1);
    assert.strictEqual(db.games[pin].players[Object.keys(db.games[pin].players)[0]].score > 0, true);
    // Nothing that names a person leaves in the new rows.
    assert.ok(!/player\d|uid\d|ninth/i.test(JSON.stringify([refused].concat(q))));

    console.log('refused_joins ' + JSON.stringify(refused));
    q.forEach(r => console.log('question_results ' + JSON.stringify(r)));
});

test('before the SQL is run: the same game plays, question rows land without the new columns, the refused join is not counted', async (t) => {
    seed();
    schema = TODAY;                                               // no refused_joins table, no new columns
    t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 11, 20, 0, 0) });
    const errors = [];
    quiet();
    console.error = (...a) => errors.push(a.join(' '));
    const { pin, ninth } = await wholeGame(t);
    loud();

    assert.strictEqual(ninth.code, 400);
    assert.strictEqual(ninth.body.code, 'GAME_IS_FULL', 'the ninth player gets the same answer');
    assert.strictEqual(names[db.games[pin].state.id], 'ScoreBoardFinal', 'the game played to the end');
    assert.strictEqual(take('refused_joins').length, 0);
    assert.ok(errors.some(e => /Bigquery Insert failed/.test(e) && /refused_joins/.test(e)), 'the lost row is logged');

    const q = take('question_results');
    assert.strictEqual(q.length, 3, 'every question row still lands');
    q.forEach(r => {
        assert.deepStrictEqual(Object.keys(r).sort(), TODAY.question_results.slice().sort());
        assert.ok(!('lie_span_s' in r) && !('pick_span_s' in r) && !('unpicked_lies' in r));
    });
    assert.deepStrictEqual(q.map(r => [r.lies, r.picks, r.friend_fooled]), [[8, 8, 6], [5, 6, 5], [1, 2, 0]]);
    assert.strictEqual(take('opened_games').length, 1);
    assert.strictEqual(take('closed_games').length, 1);
    console.log('before the SQL: question_results ' + JSON.stringify(q[0]));
    console.log('before the SQL: refused_joins rows ' + take('refused_joins').length + ' (insert failed and was logged)');
});

test('a time stamp that cannot be saved never fails a lie or a pick: the span is just empty', async (t) => {
    seed();
    failWrites.add('answerTimes');
    t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 11, 20, 0, 0) });
    quiet();
    const { pin } = await wholeGame(t);
    loud();
    assert.strictEqual(names[db.games[pin].state.id], 'ScoreBoardFinal');
    const q = take('question_results');
    assert.deepStrictEqual(q.map(r => [r.lies, r.lie_span_s, r.picks, r.pick_span_s, r.unpicked_lies]),
        [[8, null, 8, null, 5], [5, null, 6, null, 1], [1, null, 2, null, 1]]);
});

test('a pick that is not a player\'s, or comes after picks closed, is not stamped', async () => {
    seed();
    quiet();
    const pin = await fullLobby();
    const [p1] = Object.keys(db.games[pin].players);
    const { onAnswerSelection } = require(path.join(dist, 'on-answer-selection'));
    db.games[pin].state = { id: 3, timestamp: Date.now() };
    await onAnswerSelection(pin, ['stranger', p1], 1234);
    assert.deepStrictEqual(db.games[pin].answerTimes, { picks: { [p1]: { q: 0, at: 1234 } } });
    db.games[pin].state = { id: 4, timestamp: Date.now() };
    await onAnswerSelection(pin, [p1], 9999);
    loud();
    assert.strictEqual(db.games[pin].answerTimes.picks[p1].at, 1234);
});
