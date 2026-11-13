// The "About us" questions (functions/src/controllers/about.ts): where they go, who is named, the private
// truth, the fallback when the named player sends nothing, the scores, and what reaches BigQuery.
// Runs against an in-memory database and a fake BigQuery, so it needs no Firebase project:
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

// Every row the functions send to BigQuery, so a test can read what would be written there.
const bqRows = [];
class FakeBigQuery {
    dataset() { return { table: (name) => ({ insert: async (row) => { bqRows.push({ table: name, row: clone(row) }); } }) }; }
}

const realLoad = Module._load;
Module._load = function (request) {
    if (request === '@google-cloud/bigquery') return { BigQuery: FakeBigQuery };
    if (/[\\/]firebase$/.test(request)) return fakeFirebase;
    return realLoad.apply(this, arguments);
};


const dist = path.join(__dirname, '..', 'dist');
const model = require(path.join(dist, 'game-model'));
const about = require(path.join(dist, 'controllers', 'about'));
const { aboutPrompts } = require(path.join(dist, 'controllers', 'about-prompts'));
const { advance } = require(path.join(dist, 'controllers', 'tick'));
const { answer } = require(path.join(dist, 'controllers', 'answer'));
const { onAnswerSelection } = require(path.join(dist, 'controllers', 'on-answer-selection'));
const { createFork } = require(path.join(dist, 'controllers', 'fork'));
const { stagedHalf } = require(path.join(dist, 'controllers', 'big-reveal'));
const { generateGameName } = require(path.join(dist, 'controllers', 'new-game'));
const scoring = require(path.join(dist, 'controllers', 'scoring'));
const crypto = require('crypto');
const fs = require('fs');

const S = { GameStaging: 0, RoundIntro: 1, ShowQuestion: 2, ShowAnswers: 3, RevealTheTruth: 4, ScoreBoard: 5, ScoreBoardFinal: 6 };
console.log = () => {};
console.error = () => {};

let pinCount = 0;
function newGame(seats, opts = {}) {
    const pin = 'A' + String(++pinCount).padStart(3, '0');
    const totalQ = opts.totalQ || 5;
    db.questions = db.questions || {};
    const qids = {};
    for (let i = 0; i < totalQ; i++) {
        qids[i] = `q${i}`;
        db.questions[`q${i}`] = { lang: 'en', questionText: `Bank question ${i} is $blank$`, realAnswer: `truth${i}`, fakeAnswers: ['house a', 'house b', 'house c', 'house d', 'house e'], citation: '' };
    }
    const players = {};
    const names = ['Alice', 'Ben', 'Chen', 'Dana', 'Eli', 'Fay', 'Gil', 'Hila'];
    for (let i = 1; i <= seats; i++) players['p' + i] = { nickname: names[i - 1], score: 0, uid: 'u' + i };
    db.games = db.games || {};
    db.games[pin] = Object.assign({
        state: { id: S.GameStaging, timestamp: Date.now() }, locale: opts.locale || 'en', timestamp: Date.now(),
        roundIndex: 0, questionIndex: 0, totalQ, qids, tick: 0, presenter: false, players,
    }, 'aboutUs' in opts ? { aboutUs: opts.aboutUs } : { aboutUs: true });
    return pin;
}

const game = pin => db.games[pin];
const state = pin => game(pin).state.id;
const pids = pin => Object.keys(game(pin).players);

async function next(pin) {
    await advance(pin, Object.assign({}, game(pin).state));
    return state(pin);
}

async function pick(pin, pid, text) {
    game(pin).answerSelections = game(pin).answerSelections || {};
    game(pin).answerSelections[pid] = { text };
    await onAnswerSelection(pin);
}

/** Moves on until the game is on the writing screen of question `q`. */
async function toQuestion(pin, q) {
    for (let i = 0; i < 40 && !(state(pin) === S.ShowQuestion && game(pin).questionIndex === q); i++) {
        if (state(pin) === S.ShowQuestion) {
            for (const pid of pids(pin)) await answer(pin, pid, `${pid} lie ${game(pin).questionIndex}`);
            if (state(pin) === S.ShowQuestion) await next(pin);
        } else if (state(pin) === S.ShowAnswers) {
            for (const pid of pids(pin)) await pick(pin, pid, 'truth' + game(pin).questionIndex);
            if (state(pin) === S.ShowAnswers) await next(pin);
        } else {
            await next(pin);
        }
    }
    assert.strictEqual(state(pin), S.ShowQuestion);
    assert.strictEqual(game(pin).questionIndex, q);
}

/** Plays every question to the final screen: everyone answers, the named player writes the truth. */
async function playToEnd(pin, opts = {}) {
    for (let i = 0; i < 80 && state(pin) !== S.ScoreBoardFinal; i++) {
        const g = game(pin);
        if (state(pin) === S.ShowQuestion) {
            const a = model.aboutOf(g.state);
            for (const pid of pids(pin)) {
                if (a && pid === a.pid && opts.silentNamed) continue;
                await answer(pin, pid, a && pid === a.pid ? 'My Dog Rex' : `${pid} lie ${g.questionIndex}`);
            }
            if (state(pin) === S.ShowQuestion) await next(pin);
        } else if (state(pin) === S.ShowAnswers) {
            const texts = Object.keys(g.answers).map(k => g.answers[k].text);
            for (const pid of pids(pin)) await pick(pin, pid, texts[pid.length % texts.length]);
            if (state(pin) === S.ShowAnswers) await next(pin);
        } else {
            await next(pin);
        }
    }
    assert.strictEqual(state(pin), S.ScoreBoardFinal);
}

// ---------------------------------------------------------------------------- where and who

test('two About questions in a game of 5 or 7, three in a game of 9, never first or last', () => {
    assert.deepStrictEqual(about.aboutSlots(5), [1, 3]);
    assert.deepStrictEqual(about.aboutSlots(7), [2, 4]);
    assert.deepStrictEqual(about.aboutSlots(9), [2, 4, 6]);
    assert.deepStrictEqual(about.aboutSlots(3), []);
    assert.deepStrictEqual(about.aboutSlots(undefined), []);
});

test('a game is in the test only when its client can show the questions; a crew stays in one half', () => {
    const pin = generateGameName(260000);
    assert.strictEqual(about.drawAboutUs(false, pin), undefined);
    assert.strictEqual(about.drawAboutUs('true', pin), undefined);
    assert.strictEqual(typeof about.drawAboutUs(true, pin), 'boolean');
    // The rule the saved queries use: the crew's id when there is one, else the PIN in capitals.
    for (let i = 0; i < 300; i++) {
        const p = generateGameName(260000 + i);
        const byte = crypto.createHash('sha256').update('about-us:' + p).digest()[0];
        assert.strictEqual(about.aboutHalf(p.toLowerCase()), byte % 2 === 1);
    }
    const crew = 'abc123crew';
    const half = about.aboutHalf('ZZZZ', crew);
    for (let i = 0; i < 50; i++) assert.strictEqual(about.drawAboutUs(true, generateGameName(270000 + i), crew), half);
    const sql = fs.readFileSync(path.join(__dirname, '..', 'bigquery', '2026-11-about-us.sql'), 'utf8');
    assert.ok(sql.includes("MOD(TO_CODE_POINTS(SHA256(CONCAT('about-us:', IFNULL(o.crew_id, UPPER(o.id)))))[OFFSET(0)], 2) = 1"));
});

test('the half is even and independent of the staged reveal\'s', () => {
    const cells = { tt: 0, tf: 0, ft: 0, ff: 0 };
    for (let i = 0; i < 8000; i++) {
        const p = generateGameName(300000 + i);
        cells[(about.aboutHalf(p) ? 't' : 'f') + (stagedHalf(p) ? 't' : 'f')]++;
    }
    Object.keys(cells).forEach(k => assert.ok(cells[k] > 1750 && cells[k] < 2250, `${k}: ${cells[k]}`));
});

test('Replay: a crew game keeps the crew\'s half, another game draws by its new PIN, an old phone is not in the test', () => {
    const parent = { locale: 'en', totalQ: 5, presenter: false, players: { a: { nickname: 'A', score: 0, uid: 'u' } } };
    const p = generateGameName(280000);
    assert.strictEqual(createFork('AAAA', clone(parent), ['q'], 'u', 'a', undefined, false, p, true).aboutUs, about.aboutHalf(p));
    const crewGame = Object.assign({ crew: 'crew-x' }, clone(parent));
    assert.strictEqual(createFork('AAAA', crewGame, ['q'], 'u', 'a', undefined, false, p, true).aboutUs, about.aboutHalf(p, 'crew-x'));
    assert.strictEqual('aboutUs' in createFork('AAAA', clone(parent), ['q'], 'u', 'a', undefined, false, p, false), false);
});

test('every prompt: both languages, one name and one blank, four or more house answers, safe words only', () => {
    const ids = new Set();
    const banned = /\b(kiss|date|dating|boyfriend|girlfriend|crush|money|salary|rich|poor|weight|fat|body|naked|politic|vote|religio|god|drunk|beer|wine)\b/i;
    aboutPrompts.forEach(p => {
        assert.ok(/^[a-z-]+$/.test(p.id) && !ids.has(p.id), p.id);
        ids.add(p.id);
        ['en', 'he'].forEach(lang => {
            const t = p[lang];
            assert.strictEqual(t.text.split('{name}').length, 2, `${p.id} ${lang}: one name`);
            assert.strictEqual(t.text.split('$blank$').length, 2, `${p.id} ${lang}: one blank`);
            assert.ok(t.house.length >= 4, `${p.id} ${lang}: house answers`);
            assert.strictEqual(new Set(t.house).size, t.house.length);
            t.house.forEach(h => assert.ok(h.length <= 40, `${p.id}: ${h} fits the 40 letters of a lie`));
            assert.ok(!banned.test(t.text) && !t.house.some(h => banned.test(h)), `${p.id} ${lang}`);
        });
        assert.ok(/[א-ת]/.test(p.he.text) && !/[א-ת]/.test(p.en.text));
        // Answers are shown in capitals; English ones are kept as a lie is kept: in lower case.
        p.en.house.forEach(h => assert.strictEqual(h, h.toLowerCase(), h));
    });
    assert.ok(aboutPrompts.length >= 20);
});

test('the named player is one who plays, not named twice while another is left; too few players skips', () => {
    const g = { players: { a: {}, b: {}, c: {}, d: {} }, played: { a: true, b: true, c: true }, playedFrom: 0, aboutQs: { q1: { prompt: 'fire', pid: 'a' } } };
    for (let i = 0; i < 30; i++) assert.ok(['b', 'c'].indexOf(about.nameFor(g)) >= 0, 'd never played; a was named');
    const two = { players: { a: {}, b: {}, c: {} }, played: { a: true, b: true }, playedFrom: 0 };
    assert.strictEqual(about.nameFor(two), null);
});

// ---------------------------------------------------------------------------- a game

test('a 3-player game: two About questions, the truth kept from the phones, the named player scores per finder', async () => {
    const pin = newGame(3);
    await next(pin); // the lobby
    assert.deepStrictEqual(Object.keys(game(pin).aboutQs).sort(), ['q1', 'q3']);
    await toQuestion(pin, 1);

    const a = model.aboutOf(game(pin).state);
    assert.ok(a && pids(pin).indexOf(a.pid) >= 0, 'the state names the player');
    const named = a.pid;
    const nick = game(pin).players[named].nickname;
    assert.ok(game(pin).currentQ.indexOf(nick) >= 0, game(pin).currentQ);
    assert.ok(game(pin).currentQ.indexOf('$blank$') >= 0);
    assert.strictEqual(game(pin).ideas, undefined, 'no lie helper');

    const others = pids(pin).filter(p => p !== named);
    await answer(pin, named, '  My Dog Rex ');
    // Not in the readable answers, so no phone can learn it before the answers are on the table.
    assert.strictEqual(game(pin).answers, undefined);
    assert.deepStrictEqual(game(pin).aboutTruth, { pid: named, text: 'my dog rex' });
    assert.strictEqual(game(pin).players[named].sent, model.sentMark(game(pin).state), 'the waiting row shows them done');
    // A friend's lie is never refused as "too close to the truth": that would tell them they had guessed it.
    await answer(pin, others[0], 'the cat');
    assert.strictEqual(state(pin), S.ShowQuestion);
    await answer(pin, others[1], 'his guitar');
    assert.strictEqual(state(pin), S.ShowAnswers, 'everyone is in: the truth and two lies');

    const g = game(pin);
    assert.ok(model.aboutOf(g.state) && model.aboutOf(g.state).pid === named, 'the answers know the question too');
    const texts = Object.keys(g.answers).map(k => g.answers[k]);
    assert.strictEqual(texts.length, about.ABOUT_MIN_OPTIONS, 'three real answers and two house answers');
    assert.deepStrictEqual(g.answers.truth, { text: 'my dog rex', houseLie: false, realAnswer: true });
    assert.strictEqual(texts.filter(t => t.houseLie).length, 2);
    assert.strictEqual(g.players[named].sent, model.sentMark(g.state), 'they do not pick: shown as done');

    // The named player's own pick (an older site offers them the list) is no pick, and the table does not wait for it.
    await pick(pin, named, 'the cat');
    await pick(pin, others[0], 'my dog rex');
    assert.strictEqual(state(pin), S.ShowAnswers);
    await pick(pin, others[1], 'my dog rex');
    assert.strictEqual(state(pin), S.RevealTheTruth, 'the two friends picked: on to the reveal');

    const truthRow = game(pin).revealAnswers.find(r => r.realAnswer);
    assert.strictEqual(truthRow.about, named);
    assert.strictEqual(truthRow.aboutPoints, 2 * scoring.pointsForBullshitting[0]);
    assert.deepStrictEqual(truthRow.selectors.sort(), others.slice().sort());
    assert.ok(!game(pin).answerSelections[named], 'their pick was dropped');

    const before = clone(game(pin).players);
    const changes = model.revealScoreChanges(game(pin).revealAnswers);
    await next(pin);
    assert.strictEqual(state(pin), S.ScoreBoard);
    pids(pin).forEach(p => assert.strictEqual(game(pin).players[p].score - before[p].score, changes[p] || 0, `${p}: the reveal and the server agree`));
    assert.strictEqual(game(pin).players[named].score - before[named].score, 1000);
    assert.ok(model.aboutOf(game(pin).state), 'still on the question');

    await next(pin);
    assert.strictEqual(game(pin).aboutTruth, undefined, 'cleared with the next question');
    assert.strictEqual(model.aboutOf(game(pin).state), null);
    assert.strictEqual(game(pin).aboutQs.q1.result, 'played');

    await playToEnd(pin);
    assert.strictEqual(game(pin).aboutQs.q3.result, 'played');
    assert.notStrictEqual(game(pin).aboutQs.q3.pid, named, 'the second question is about someone else');
    assert.notStrictEqual(game(pin).aboutQs.q3.prompt, game(pin).aboutQs.q1.prompt);
});

test('nothing anybody typed for an About question goes to BigQuery or to the question history', async () => {
    bqRows.length = 0;
    const pin = newGame(3);
    await next(pin);
    await playToEnd(pin);
    const rows = bqRows.filter(r => r.row.id === pin && r.table === 'question_results').map(r => r.row);
    assert.deepStrictEqual(rows.map(r => r.about), [null, 'played', null, 'played', null]);
    assert.deepStrictEqual(rows.map(r => r.about_prompt).filter(Boolean), [game(pin).aboutQs.q1.prompt, game(pin).aboutQs.q3.prompt]);
    const all = JSON.stringify(bqRows);
    assert.ok(!/dog rex/i.test(all));
    const history = JSON.stringify(Object.values(db.qHistory || {}).filter(h => h.pin === pin));
    assert.ok(!/dog rex/i.test(history), 'the history keeps only which prompt was played');
    assert.ok(/"about":"/.test(history));
});

// The last sends of an About question that arrive at the same moment: each call read the game before the
// others had written, so none saw every send, and the room sat out the whole timer. The call whose send
// lands last now reads the lies and the truth again, and the answers are shown at once.
for (const together of ['the truth and a lie', 'two lies']) {
    test(`About question: ${together} sent at the same moment show the answers at once`, async () => {
        const pin = newGame(3);
        await next(pin);
        await toQuestion(pin, 1);
        const named = model.aboutOf(game(pin).state).pid;
        const [first, second] = pids(pin).filter(p => p !== named);
        const send = pid => answer(pin, pid, pid === named ? 'My Dog Rex' : `${pid} lie about them`);
        const early = together === 'two lies' ? [named] : [first];
        const last = together === 'two lies' ? [first, second] : [named, second];
        for (const pid of early) await send(pid);
        assert.strictEqual(state(pin), S.ShowQuestion, 'still waiting for the others');
        await Promise.all(last.map(send));
        assert.strictEqual(state(pin), S.ShowAnswers, 'everyone sent: the answers are on the table, with no wait for the clock');
        const g = game(pin);
        assert.strictEqual(g.aboutQs.q1.result, 'played', 'the About question is played, not the fallback');
        assert.deepStrictEqual(g.answers.truth, { text: 'my dog rex', houseLie: false, realAnswer: true });
        const texts = Object.values(g.answers).map(a => a.text);
        [first, second].forEach(pid => assert.ok(texts.includes(`${pid} lie about them`), `${pid}'s lie is on the table`));
    });
}

test('the named player sends nothing: the bank question is played in its place, from a fresh start', async () => {
    const pin = newGame(3);
    await next(pin);
    await toQuestion(pin, 1);
    const asked = clone(game(pin).state);
    const named = model.aboutOf(asked).pid;
    for (const p of pids(pin).filter(p => p !== named)) await answer(pin, p, 'lie about them');
    assert.strictEqual(state(pin), S.ShowQuestion, 'the table waits for the named player');
    await new Promise(r => setTimeout(r, 5));
    assert.strictEqual(await next(pin), S.ShowQuestion, 'the clock ran out: writing again');
    const g = game(pin);
    assert.notStrictEqual(g.state.timestamp, asked.timestamp, 'a new writing step, with its own 25 seconds');
    assert.strictEqual(model.aboutOf(g.state), null);
    assert.strictEqual(g.currentQ, 'Bank question 1 is $blank$');
    assert.strictEqual(g.answers, undefined, 'the lies about the player are dropped');
    assert.strictEqual(g.aboutQs.q1.result, 'fallback');
    assert.strictEqual(g.questionIndex, 1, 'the same place in the game');
    await playToEnd(pin);
});

test('a friend who writes the truth itself: one answer, which they can still pick and score for', async () => {
    const pin = newGame(4);
    await next(pin);
    await toQuestion(pin, 1);
    const named = model.aboutOf(game(pin).state).pid;
    const others = pids(pin).filter(p => p !== named);
    await answer(pin, named, 'Pizza');
    await answer(pin, others[0], 'pizza!');
    await answer(pin, others[1], 'sushi');
    await answer(pin, others[2], 'falafel');
    const list = Object.values(game(pin).answers).map(a => a.text);
    assert.strictEqual(list.filter(t => /pizza/.test(t)).length, 1);
    assert.ok(!game(pin).answers[others[0]]);
    for (const p of others) await pick(pin, p, 'pizza');
    assert.strictEqual(state(pin), S.RevealTheTruth);
    const truth = game(pin).revealAnswers.find(r => r.realAnswer);
    assert.strictEqual(truth.selectors.length, 3, 'the friend who wrote it found it');
});

test('a full table gets no house answers: every answer is a real one', async () => {
    const pin = newGame(8, { totalQ: 7 });
    await next(pin);
    assert.deepStrictEqual(Object.keys(game(pin).aboutQs).sort(), ['q2', 'q4']);
    await toQuestion(pin, 2);
    const named = model.aboutOf(game(pin).state).pid;
    for (const p of pids(pin)) await answer(pin, p, p === named ? 'the truth' : `${p} lie`);
    assert.strictEqual(state(pin), S.ShowAnswers);
    const answers = Object.values(game(pin).answers);
    assert.strictEqual(answers.length, 8);
    assert.strictEqual(answers.filter(a => a.houseLie).length, 0);
    await playToEnd(pin);
});

test('Hebrew: the Hebrew prompt with the name, and Hebrew house answers', async () => {
    const pin = newGame(3, { locale: 'he' });
    await next(pin);
    await toQuestion(pin, 1);
    assert.ok(/[א-ת]/.test(game(pin).currentQ));
    const named = model.aboutOf(game(pin).state).pid;
    for (const p of pids(pin)) await answer(pin, p, p === named ? 'הכלב שלי' : `שקר ${p}`);
    const house = Object.values(game(pin).answers).filter(a => a.houseLie);
    assert.ok(house.length === 2 && house.every(a => /[א-ת]/.test(a.text)));
});

test('no About questions: in the other half, with two players, alone, or for an older phone', async () => {
    for (const [seats, opts] of [[3, { aboutUs: false }], [2, {}], [1, {}], [3, { aboutUs: undefined }]]) {
        const pin = newGame(seats, opts);
        if (opts.aboutUs === undefined && 'aboutUs' in opts) delete game(pin).aboutUs;
        await next(pin);
        assert.strictEqual(game(pin).aboutQs, undefined, JSON.stringify([seats, opts]));
        for (let i = 0; i < 80 && state(pin) !== S.ScoreBoardFinal; i++) {
            assert.strictEqual(model.aboutOf(game(pin).state), null);
            await next(pin);
        }
    }
});

test('a seat nobody plays is never named, and with only two players playing the question is skipped', async () => {
    const pin = newGame(3);
    await next(pin);
    // Question 1: only two of three seats play.
    await next(pin);
    assert.strictEqual(state(pin), S.ShowQuestion);
    await answer(pin, 'p1', 'x');
    await answer(pin, 'p2', 'y');
    await next(pin);
    await pick(pin, 'p1', 'truth0');
    await pick(pin, 'p2', 'truth0');
    if (state(pin) === S.ShowAnswers) await next(pin);
    await next(pin);
    await next(pin);
    assert.strictEqual(state(pin), S.ShowQuestion);
    assert.strictEqual(game(pin).questionIndex, 1);
    assert.strictEqual(model.aboutOf(game(pin).state), null);
    assert.strictEqual(game(pin).currentQ, 'Bank question 1 is $blank$');
    assert.strictEqual(game(pin).aboutQs.q1.result, 'skipped');
});

test('the reveal\'s score changes and the server\'s totals agree on an About question', () => {
    const g = {
        roundIndex: 1, state: { id: S.ShowAnswers, timestamp: 1, about: { pid: 'b', prompt: 'fire' } },
        players: { a: { score: 0 }, b: { score: 100 }, c: { score: 0 }, d: { score: 0 } },
        answers: { a: { text: 'x', houseLie: false, realAnswer: false }, c: { text: 'y', houseLie: false, realAnswer: false }, d: { text: 'z', houseLie: false, realAnswer: false }, truth: { text: 't', houseLie: false, realAnswer: true } },
        answerSelections: { a: { text: 't' }, c: { text: 'x' }, d: { text: 't' }, b: { text: 'y' } },
    };
    const scored = scoring.scoreQuestion(g);
    const after = scoring.addQuestionScores(Object.assign({}, g, scored));
    const changes = model.revealScoreChanges(scored.revealAnswers);
    Object.keys(g.players).forEach(p => assert.strictEqual(after[p].score - g.players[p].score, changes[p] || 0, p));
    assert.strictEqual(changes.b, 2 * scoring.pointsForBullshitting[1]);
    assert.strictEqual(changes.a, scoring.pointsForCorrectAnswer[1] + scoring.pointsForBullshitting[1]);
});
