// The host's own questions (functions/src/controllers/own-questions.ts, OwnQuestion in game-model): what the
// create page may send, where they go, how they play (the host lies and does not pick), what stays private
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
            done(null, true, { val: () => clone(at(parts)) });
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
// The ordered read the bank's language query makes (questions.ts getQuestionsByLang).
fakeFirebase.questionsRef.orderByChild = (key) => ({
    equalTo: (value) => ({
        once: async () => ({ val: () => {
            const all = clone(at(['questions'])) || {};
            const out = {};
            Object.keys(all).forEach(id => { if (all[id] && all[id][key] === value) out[id] = all[id]; });
            return out;
        } }),
    }),
});

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
const own = require(path.join(dist, 'controllers', 'own-questions'));
const { advance } = require(path.join(dist, 'controllers', 'tick'));
const { answer } = require(path.join(dist, 'controllers', 'answer'));
const { onAnswerSelection } = require(path.join(dist, 'controllers', 'on-answer-selection'));
const { newGame } = require(path.join(dist, 'controllers', 'new-game'));
const analytics = require(path.join(dist, 'controllers', 'analytics'));
const { seatsToWaitFor } = require(path.join(dist, 'controllers', 'seats'));
const lists = require(path.join(__dirname, '..', '..', 'name-lists.json'));

const S = { GameStaging: 0, RoundIntro: 1, ShowQuestion: 2, ShowAnswers: 3, RevealTheTruth: 4, ScoreBoard: 5, ScoreBoardFinal: 6 };
console.log = () => {};
console.error = () => {};

const NOA = { text: 'On the class trip, Noa lost her ___', truth: 'Left shoe', lies: ['Phone', 'Passport'] };
const CLIENT = { text: "Our team's first client was a", truth: 'Bakery', lies: ['Dentist', 'Zoo'] };
const HE = { text: 'בטיול השנתי נועה איבדה את ה___ שלה', truth: 'נעל', lies: ['טלפון', 'דרכון'] };

function bank(lang, totalQ, pack) {
    db.questions = db.questions || {};
    for (let i = 0; i < totalQ; i++) {
        db.questions[`${lang}q${i}`] = { lang, questionText: `Bank question ${i} is $blank$`, realAnswer: `truth${i}`, fakeAnswers: ['house a', 'house b', 'house c', 'house d', 'house e'], citation: '', opener: i === 0 };
    }
    if (pack) {
        for (let i = 0; i < 3; i++) {
            db.questions[`${lang}pack${i}`] = { lang, pack, questionText: `Pack question ${i} is $blank$`, realAnswer: `pack${i}`, fakeAnswers: ['house a', 'house b', 'house c'], citation: '' };
        }
    }
}

let pinCount = 0;
/** A game in its lobby, made as newGame keeps it, with `seats` players; p1 is the host. */
function lobby(seats, opts = {}) {
    const pin = 'W' + String(++pinCount).padStart(3, '0');
    const totalQ = opts.totalQ || 5;
    const lang = opts.locale || 'en';
    bank(lang, totalQ + 4);
    const qids = {};
    for (let i = 0; i < totalQ; i++) qids[i] = `${lang}q${i}`;
    const players = {};
    const names = ['Host', 'Ben', 'Chen', 'Dana', 'Eli'];
    for (let i = 1; i <= seats; i++) players['p' + i] = Object.assign({ nickname: names[i - 1], score: 0, uid: 'u' + i + pin }, i === 1 && !opts.noHost ? { host: true } : {});
    const ownQs = {};
    model.cleanOwnQuestions(opts.own || [NOA, CLIENT]).forEach((q, i) => ownQs[i] = q);
    db.games = db.games || {};
    db.games[pin] = Object.assign({
        state: { id: S.GameStaging, timestamp: Date.now() }, locale: lang, timestamp: Date.now(),
        roundIndex: 0, questionIndex: 0, totalQ, qids, tick: 0, presenter: false, players, ownQs, coach: true,
    }, opts.extra || {});
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

/** Moves on until the game is on the writing screen of question `q`; everyone lies and picks the truth. */
async function toQuestion(pin, q) {
    for (let i = 0; i < 60 && !(state(pin) === S.ShowQuestion && game(pin).questionIndex === q); i++) {
        if (state(pin) === S.ShowQuestion) {
            for (const pid of pids(pin)) await answer(pin, pid, `${pid} lie ${game(pin).questionIndex}`).catch(() => null);
            if (state(pin) === S.ShowQuestion) await next(pin);
        } else if (state(pin) === S.ShowAnswers) {
            const truth = Object.keys(game(pin).answers).map(k => game(pin).answers[k]).find(a => a.realAnswer);
            for (const pid of pids(pin)) await pick(pin, pid, truth.text);
            if (state(pin) === S.ShowAnswers) await next(pin);
        } else {
            await next(pin);
        }
    }
    assert.strictEqual(state(pin), S.ShowQuestion);
    assert.strictEqual(game(pin).questionIndex, q);
}

// ---------------------------------------------------------------------------- what the page may send

test('a question needs a sentence, the truth and two different wrong answers', () => {
    assert.strictEqual(model.ownProblem(NOA), null);
    assert.strictEqual(model.ownProblem(HE), null);
    assert.strictEqual(model.ownProblem(Object.assign({}, NOA, { text: '___' })), 'text');
    assert.strictEqual(model.ownProblem(Object.assign({}, NOA, { text: 'x'.repeat(model.OWN_TEXT_MAX + 1) })), 'text');
    assert.strictEqual(model.ownProblem(Object.assign({}, NOA, { truth: '  ' })), 'truth');
    assert.strictEqual(model.ownProblem(Object.assign({}, NOA, { truth: 'y'.repeat(model.OWN_ANSWER_MAX + 1) })), 'truth');
    assert.strictEqual(model.ownProblem(Object.assign({}, NOA, { lies: ['Phone'] })), 'lies');
    assert.strictEqual(model.ownProblem(Object.assign({}, NOA, { lies: ['Phone', ''] })), 'lies');
    assert.strictEqual(model.ownProblem(Object.assign({}, NOA, { lies: ['left shoe!', 'Phone'] })), 'same');
    assert.strictEqual(model.ownProblem(Object.assign({}, NOA, { lies: ['Phone', 'phone'] })), 'same');
    assert.strictEqual(model.ownProblem(null), 'text');
});

test('the nickname filter\'s words are refused in the sentence and in every answer', () => {
    const hate = lists.hate.word[0];
    const sex = lists.sex.word[0];
    assert.ok(hate && sex);
    assert.strictEqual(model.ownProblem(Object.assign({}, NOA, { text: `On the trip ${hate} lost her ___` })), 'words');
    assert.strictEqual(model.ownProblem(Object.assign({}, NOA, { truth: sex })), 'words');
    assert.strictEqual(model.ownProblem(Object.assign({}, NOA, { lies: ['Phone', hate] })), 'words');
    // Ordinary sentences in both languages pass.
    ['Our first client was a ___', 'Dana once ate 14 ___ in one sitting', 'המורה של כיתה ו׳ גידלה בבית ___', 'בפגישה הראשונה דני הביא ___ במקום מחשב']
        .forEach(text => assert.strictEqual(model.ownProblem(Object.assign({}, NOA, { text })), null, text));
});

test('the blank: underscores or $blank$ become one blank, a sentence without one gets it at the end', () => {
    assert.strictEqual(model.ownBlankText('On the class trip, Noa lost her ___'), 'On the class trip, Noa lost her $blank$');
    assert.strictEqual(model.ownBlankText("Our team's first client was a."), "Our team's first client was a $blank$");
    assert.strictEqual(model.ownBlankText('Noa __ lost her ____ twice'), 'Noa $blank$ lost her twice');
    assert.strictEqual(model.ownBlankText('Ben  is   $blank$ today'), 'Ben is $blank$ today');
    assert.strictEqual(model.ownBlankText('בטיול נועה איבדה ___'), 'בטיול נועה איבדה $blank$');
});

test('the server keeps at most three, skips empty and refused cards, and trims', () => {
    const kept = model.cleanOwnQuestions([{ text: '', truth: '', lies: ['', ''] }, NOA, { text: 'bad' }, CLIENT, HE, NOA]);
    assert.strictEqual(kept.length, 3);
    assert.deepStrictEqual(kept[0], { questionText: 'On the class trip, Noa lost her $blank$', realAnswer: 'Left shoe', fakeAnswers: ['Phone', 'Passport'] });
    assert.strictEqual(kept[2].questionText, 'בטיול השנתי נועה איבדה את ה$blank$ שלה');
    assert.deepStrictEqual(model.cleanOwnQuestions('nope'), []);
    assert.deepStrictEqual(model.cleanOwnQuestions(undefined), []);
});

// ---------------------------------------------------------------------------- where they go

test('own questions start at question 2, spread out, the last question kept for the bank', () => {
    assert.deepStrictEqual(model.ownPlaces(1, 5), [1]);
    assert.deepStrictEqual(model.ownPlaces(2, 5), [1, 3]);
    assert.deepStrictEqual(model.ownPlaces(3, 5), [1, 2, 3]);
    assert.deepStrictEqual(model.ownPlaces(2, 7), [1, 5]);
    assert.deepStrictEqual(model.ownPlaces(3, 7), [1, 3, 5]);
    assert.deepStrictEqual(model.ownPlaces(3, 9), [1, 4, 7]);
    assert.deepStrictEqual(model.ownPlaces(0, 9), []);
    assert.deepStrictEqual(model.ownPlaces(5, 9), [1, 4, 7]);
});

test('placing keeps a pack game\'s pack questions: they move off the own places', () => {
    const qids = ['pack0', 'b1', 'pack1', 'b3', 'pack2'];
    const placed = own.placeOwnQuestions(qids, ['own-0', 'own-1'], 5, q => q.startsWith('pack'));
    assert.deepStrictEqual(placed.filter(q => q.startsWith('pack')).sort(), ['pack0', 'pack1', 'pack2']);
    assert.strictEqual(placed[1], 'own-0');
    assert.strictEqual(placed[3], 'own-1');
    assert.deepStrictEqual(own.placeOwnQuestions({ 0: 'a', 1: 'b', 2: 'c', 3: 'd', 4: 'e' }, ['own-0'], 5), ['a', 'own-0', 'c', 'd', 'e']);
});

// ---------------------------------------------------------------------------- made

test('newGame keeps the cleaned questions where no phone reads them, and keeps the game out of the About test', async () => {
    bank('en', 12);
    db.gameCounter = 5000;
    const pin = await newGame('en', 5, 'uHost', { aboutUs: true, own: [NOA, { text: 'x' }, CLIENT] });
    const g = game(pin);
    assert.strictEqual(Object.keys(g.ownQs).length, 2);
    assert.strictEqual(g.ownQs[0].questionText, 'On the class trip, Noa lost her $blank$');
    assert.strictEqual(g.aboutUs, undefined);
    // Without own questions, the About test draws as before.
    const plain = await newGame('en', 5, 'uHost', { aboutUs: true, own: [] });
    assert.strictEqual(typeof game(plain).aboutUs, 'boolean');
    assert.strictEqual(game(plain).ownQs, undefined);
    // Only the server reads ownQs: the database rules give games/$pin/ownQs no read rule of its own.
    const rules = require(path.join(__dirname, '..', '..', 'database-rules.json'));
    assert.strictEqual(rules.rules.games.$pin.ownQs, undefined);
    assert.strictEqual(rules.rules.games.$pin['.read'], "auth.uid == 'bl-service-worker'");
});

// ---------------------------------------------------------------------------- played

test('a whole game: own questions on 2 and 4, the host lies and sits out the pick, nothing leaks', async () => {
    const pin = lobby(3);
    await next(pin); // START
    const qids = game(pin).qids;
    assert.strictEqual(qids[1], 'own-0');
    assert.strictEqual(qids[3], 'own-1');
    assert.ok(!model.isOwnId(qids[0]) && !model.isOwnId(qids[4]));

    await toQuestion(pin, 1);
    const g = game(pin);
    assert.deepStrictEqual(g.state.own, { pid: 'p1' });
    assert.strictEqual(g.currentQ, 'On the class trip, Noa lost her $blank$');
    // No round-1 ready-made lies on an own question.
    assert.ok(!g.ideas);

    // The "too close to the truth" refusal, for the host and for a friend.
    await assert.rejects(answer(pin, 'p1', 'left shoe'), e => e.code === 'CORRECT_ANSWER');
    await assert.rejects(answer(pin, 'p2', 'The Left Shoe'), e => e.code === 'CORRECT_ANSWER');
    await answer(pin, 'p1', 'Her retainer');
    await answer(pin, 'p2', 'Her diary');
    await answer(pin, 'p3', 'A sock');
    assert.strictEqual(state(pin), S.ShowAnswers);

    const answers = game(pin).answers;
    const texts = Object.keys(answers).map(k => answers[k].text.toLowerCase());
    assert.ok(texts.includes('left shoe'));
    assert.ok(texts.includes('phone') && texts.includes('passport'), 'the two wrong answers are the house lies');
    assert.deepStrictEqual(game(pin).state.own, { pid: 'p1' });
    // The host's seat is done, and the picks wait only for the friends.
    assert.strictEqual(game(pin).players.p1.sent, model.sentMark(game(pin).state));
    assert.deepStrictEqual(seatsToWaitFor(game(pin)).sort(), ['p2', 'p3']);

    // The host picks the truth anyway (an older page): it is no pick, it scores nothing.
    await pick(pin, 'p1', 'Left shoe');
    assert.strictEqual(state(pin), S.ShowAnswers);
    await pick(pin, 'p2', 'her retainer');
    await pick(pin, 'p3', 'left shoe');
    assert.strictEqual(state(pin), S.RevealTheTruth, 'the friends\' picks end the question');
    const rows = game(pin).revealAnswers;
    const truth = rows.find(r => r.realAnswer);
    assert.deepStrictEqual(truth.selectors, ['p3']);
    const retainer = rows.find(r => r.text === 'her retainer');
    assert.deepStrictEqual(retainer.creators, ['p1']);
    assert.deepStrictEqual(game(pin).state.own, { pid: 'p1' });
    const before = game(pin).players.p1.score;
    await next(pin); // scoreboard
    assert.deepStrictEqual(game(pin).state.own, { pid: 'p1' });
    assert.strictEqual(game(pin).players.p1.score - before, 500, 'the host scores for the friend they fooled, never the truth');

    await next(pin); // question 3: a bank question
    assert.strictEqual(game(pin).questionIndex, 2);
    assert.strictEqual(game(pin).state.own, undefined);

    // Nothing of the own question's text is kept outside the game.
    const history = Object.values(db.qHistory || {}).filter(h => h.pin === pin);
    assert.ok(history.some(h => h.own === true && !h.q && !h.a));
    const seen = JSON.stringify(db.seenQuestions || {});
    assert.ok(!seen.includes('own-'));
    const results = bqRows.filter(r => r.table === 'question_results' && r.row.id === pin);
    assert.strictEqual(results[1].row.qid, 'own-0');
    assert.ok(!JSON.stringify(results).includes('Noa'));

    await toQuestion(pin, 3);
    assert.strictEqual(game(pin).currentQ, "Our team's first client was a $blank$");
    assert.deepStrictEqual(game(pin).state.own, { pid: 'p1' });
});

test('analytics: opened and closed games carry own_questions', async () => {
    const pin = lobby(2, { own: [NOA, CLIENT, HE] });
    await next(pin);
    await analytics.onStateChange(pin);
    const opened = bqRows.filter(r => r.table === 'opened_games' && r.row.id === pin);
    assert.strictEqual(opened.length, 1);
    assert.strictEqual(opened[0].row.own_questions, 3);
    // A game without own questions: 0.
    const plain = lobby(2, { own: [] });
    await next(plain);
    await analytics.onStateChange(plain);
    assert.strictEqual(bqRows.find(r => r.table === 'opened_games' && r.row.id === plain).row.own_questions, 0);
});

test('two players: the friend still picks from four answers, and the host\'s pick is not waited for', async () => {
    const pin = lobby(2, { extra: { pair: true } });
    await next(pin);
    // Start wrote no pair half for an own game? It may: the decoys just stay off own questions.
    await toQuestion(pin, 1);
    assert.ok(!game(pin).ideas, 'no decoy offers on an own question');
    await answer(pin, 'p1', 'Her retainer');
    await answer(pin, 'p2', 'Her diary');
    assert.strictEqual(state(pin), S.ShowAnswers);
    const answers = game(pin).answers;
    const forFriend = Object.keys(answers).filter(k => k !== 'p2').map(k => answers[k].text.toLowerCase()).sort();
    assert.deepStrictEqual(forFriend, ['her retainer', 'left shoe', 'passport', 'phone']);
    await pick(pin, 'p2', 'phone');
    assert.strictEqual(state(pin), S.RevealTheTruth);
});

test('a Hebrew game plays its Hebrew own question', async () => {
    const pin = lobby(3, { locale: 'he', own: [HE] });
    await next(pin);
    assert.strictEqual(game(pin).qids[1], 'own-0');
    await toQuestion(pin, 1);
    assert.strictEqual(game(pin).currentQ, 'בטיול השנתי נועה איבדה את ה$blank$ שלה');
    await assert.rejects(answer(pin, 'p2', 'הנעל'), e => e.code === 'CORRECT_ANSWER');
});

test('a host who is the big screen (no host seat): everyone writes and picks', async () => {
    const pin = lobby(3, { noHost: true, own: [NOA] });
    await next(pin);
    await toQuestion(pin, 1);
    assert.deepStrictEqual(game(pin).state.own, { pid: '' });
    for (const pid of pids(pin)) await answer(pin, pid, `${pid} lie`);
    assert.deepStrictEqual(seatsToWaitFor(game(pin)).sort(), ['p1', 'p2', 'p3']);
});

test('a host alone (the taste) plays bank questions only', async () => {
    const pin = lobby(1);
    await next(pin);
    assert.strictEqual(model.ownCount(game(pin).qids), 0);
});

test('an own id the game does not hold plays one bank question, the same one on every read', async () => {
    const pin = lobby(3, { own: [] });
    await next(pin);
    game(pin).qids[1] = 'own-0';
    await toQuestion(pin, 1);
    const text = game(pin).currentQ;
    assert.ok(/^Bank question/.test(text), text);
    await answer(pin, 'p2', 'x').catch(() => null);
    await answer(pin, 'p1', 'y');
    await answer(pin, 'p3', 'z');
    const truth = Object.keys(game(pin).answers).map(k => game(pin).answers[k]).find(a => a.realAnswer);
    assert.ok(/^truth\d+$/.test(truth.text), truth.text);
    assert.strictEqual(text.replace(/\D/g, ''), truth.text.replace(/\D/g, ''));
});
