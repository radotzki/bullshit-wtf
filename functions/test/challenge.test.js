// CHALLENGE ANOTHER GROUP (controllers/challenge.ts): a finished table's link starts a game on the very
// same questions, in the same order, and at its end both tables' scores show side by side. Runs the
// compiled functions against an in-memory database:
//   npm run build && npm test
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');


// ---- in-memory Realtime Database, asynchronous ----
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
// A small fixed sequence of delays, so each run interleaves the same way.
let tickN = 0;
const lag = () => new Promise(r => setTimeout(r, [1, 3, 2, 5, 1, 4][tickN++ % 6]));
let pushId = 0;
function ref(parts) {
    return {
        child: (p) => ref(parts.concat(String(p).split('/'))),
        once: async () => { await lag(); const v = clone(at(parts)); return { val: () => v }; },
        set: async (v) => { await lag(); put(parts, v); },
        update: async (v) => { await lag(); Object.keys(v).forEach(k => put(parts.concat(k.split('/')), v[k])); },
        push: (v) => { const key = 'k' + (++pushId); if (v !== undefined) put(parts.concat(key), v); return { key }; },
        // Atomic, as in the real database; undefined aborts and leaves the value as it is.
        transaction: (fn, done) => {
            lag().then(() => {
                const v = fn(clone(at(parts)));
                if (v !== undefined) put(parts, v);
                const now = clone(at(parts));
                done(null, v !== undefined, { val: () => now });
            });
        },
        orderByChild: () => ({ equalTo: (lang) => ({ once: async () => {
            await lag();
            const v = Object.fromEntries(Object.entries(at(parts) || {}).filter(([, q]) => q.lang === lang));
            return { val: () => v };
        } }) }),
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
const { newGame } = require(path.join(dist, 'new-game'));
const { join } = require(path.join(dist, 'join'));
const { startGame } = require(path.join(dist, 'start'));
const { validateGameName } = require(path.join(dist, 'validate-game-name'));
const { fork } = require(path.join(dist, 'fork'));
const ch = require(path.join(dist, 'challenge'));
const analytics = require(path.join(dist, 'analytics'));

const GameStaging = 0, ScoreBoardFinal = 6;
const H = 60 * 60 * 1000;
const D = 24 * H;
const log = console.log;
console.log = () => {};
test.after(() => { console.log = log; });

function seedQuestions() {
    db.gameCounter = db.gameCounter || 500;
    db.questions = db.questions || {};
    for (let i = 0; i < 40; i++) {
        db.questions['q' + i] = { lang: 'en', questionText: 'x', realAnswer: 'y', fakeAnswers: ['a', 'b', 'c'], citation: '' };
        db.questions['h' + i] = { lang: 'he', questionText: 'x', realAnswer: 'y', fakeAnswers: ['a', 'b', 'c'], citation: '' };
    }
}

const KEY = 'K'.repeat(24);
const OTHER_KEY = 'L'.repeat(24);

/**
 * A game of `n` phones (u1..un) that reached its final scoreboard `ago` ms ago, with these scores.
 * u1 hosts it, as Noa.
 */
async function finishedGame({ ago = H, scores = [3000, 4500, 1500], locale = 'en', campaign, names } = {}) {
    seedQuestions();
    const pin = await newGame(locale, 5, 'u1', { hostKey: KEY, campaign });
    const pids = {};
    for (let i = 0; i < scores.length; i++) {
        const name = names ? names[i] : ['Noa', 'Dan', 'Maya', 'Ron', 'Tal'][i];
        pids['u' + (i + 1)] = (await join(pin, name, 'u' + (i + 1), i === 0 ? KEY : undefined)).pid;
    }
    const g = db.games[pin];
    Object.keys(g.players).forEach(pid => {
        const i = Number(g.players[pid].uid.slice(1)) - 1;
        g.players[pid].score = scores[i];
    });
    g.state = { id: ScoreBoardFinal, timestamp: Date.now() - ago };
    g.timestamp = Date.now() - ago - H;
    return { pin, pids, qids: g.qids.slice() };
}

const over = async pin => {
    try {
        await validateGameName(pin);
    } catch (e) {
        return e;
    }
    return null;
};

test('a finished table: its card has its scores, best first, its host and its questions', async () => {
    const g = await finishedGame();
    const card = ch.challengeCard(g.pin, db.games[g.pin], Date.now());
    assert.strictEqual(card.from, g.pin);
    assert.strictEqual(card.host, 'Noa');
    assert.strictEqual(card.locale, 'en');
    assert.strictEqual(card.questions, 5);
    assert.strictEqual(card.played, 3);
    assert.strictEqual(card.top, 4500);
    assert.deepStrictEqual(card.rows.map(r => [r.name, r.score, r.place]), [['Dan', 4500, 1], ['Noa', 3000, 2], ['Maya', 1500, 3]]);
    assert.strictEqual(card.test, undefined);
    assert.deepStrictEqual(ch.qidsOf(db.games[g.pin]), g.qids);
});

test('no card for a taste, a table of one, an idle game, a game a week old, or broken question ids', async () => {
    const now = Date.now();
    const g = await finishedGame();
    const base = db.games[g.pin];
    const copy = patch => Object.assign(JSON.parse(JSON.stringify(base)), patch);
    assert.ok(ch.challengeCard(g.pin, base, now));
    assert.strictEqual(ch.challengeCard(g.pin, copy({ state: { id: ScoreBoardFinal, timestamp: now, taste: { found: 2, length: 5 } } }), now), null);
    assert.strictEqual(ch.challengeCard(g.pin, copy({ idle: true }), now), null);
    assert.strictEqual(ch.challengeCard(g.pin, copy({ state: { id: ScoreBoardFinal, timestamp: now - 8 * D } }), now), null);
    assert.strictEqual(ch.challengeCard(g.pin, copy({ state: { id: 3, timestamp: now } }), now), null, 'not over');
    assert.strictEqual(ch.challengeCard(g.pin, copy({ qids: base.qids.slice(0, 4) }), now), null, 'one id short');
    assert.strictEqual(ch.challengeCard(g.pin, copy({ qids: base.qids.slice(0, 4).concat('../x') }), now), null);
    const one = copy({});
    one.players = { [Object.keys(base.players)[0]]: base.players[Object.keys(base.players)[0]] };
    assert.strictEqual(ch.challengeCard(g.pin, one, now), null, 'a table of one');
    // Ids the database kept as an object, as it may.
    const obj = copy({});
    obj.qids = Object.assign({}, base.qids);
    assert.deepStrictEqual(ch.qidsOf(obj), base.qids);
});

test('names reach the card as plain one-line text: no invisible or right-to-left tricks, cut short', async () => {
    const g = await finishedGame({ names: ['Noa', 'a‮bc​', '<b>x</b>'] });
    const card = ch.challengeCard(g.pin, db.games[g.pin], Date.now());
    const names = card.rows.map(r => r.name);
    assert.ok(names.includes('abc'));
    // Markup stays the characters it is: the page shows it as text.
    assert.ok(names.some(n => n.startsWith('<b>')));
    assert.strictEqual(ch.rowName('x'.repeat(40)).length, ch.NAME_MAX);
    assert.strictEqual(ch.rowName('​​'), '?');
    assert.strictEqual(ch.rowName(42), '?');
});

test('the link shows nothing until a player of the table opens the challenge, and a stranger cannot open it', async () => {
    const g = await finishedGame();
    let e = await over(g.pin);
    assert.strictEqual(e.code, 'GAME_OVER');
    assert.strictEqual(e.challenge, undefined, 'not open yet');

    await assert.rejects(ch.openChallenge(g.pin, 'stranger', 'nope'), err => err.code === 'NOT_A_PLAYER');
    assert.strictEqual(db.games[g.pin].challengeOpen, undefined);

    const r = await ch.openChallenge(g.pin.toLowerCase(), 'u2', undefined);
    assert.strictEqual(r.challenge.top, 4500);
    assert.strictEqual(db.games[g.pin].challengeOpen, true);
    // By the seat alone (a lost sign-in), and a second press: the same.
    const again = await ch.openChallenge(g.pin, undefined, g.pids.u3);
    assert.deepStrictEqual(again.challenge, r.challenge);

    e = await over(g.pin);
    assert.strictEqual(e.challenge.from, g.pin);
    assert.strictEqual(e.challenge.top, 4500);
    assert.strictEqual(e.versus, undefined, 'this game played against nobody');
});

test('a game played no more than a week ago only: older, the challenge is over', async () => {
    const g = await finishedGame({ ago: 8 * D });
    await assert.rejects(ch.openChallenge(g.pin, 'u1'), err => err.code === 'CHALLENGE_OVER');
    const h = await finishedGame({ ago: 6 * D });
    await ch.openChallenge(h.pin, 'u1');
    db.games[h.pin].state.timestamp = Date.now() - 8 * D;
    assert.strictEqual((await over(h.pin)).challenge, undefined);
    await assert.rejects(newGame('en', 7, 'x1', { challenge: h.pin }), err => err.code === 'CHALLENGE_OVER');
});

test('a challenge that was never opened, or a PIN that is no game, makes no game', async () => {
    const g = await finishedGame();
    const before = db.gameCounter;
    await assert.rejects(newGame('en', 7, 'x1', { challenge: g.pin }), err => err.code === 'CHALLENGE_OVER');
    await assert.rejects(newGame('en', 7, 'x1', { challenge: 'ZZZZZ' }), err => err.code === 'CHALLENGE_OVER');
    await assert.rejects(newGame('en', 7, 'x1', { challenge: '../games' }), err => err.code === 'CHALLENGE_OVER');
    assert.strictEqual(db.gameCounter, before, 'no PIN spent');
});

test('the challenge game takes the table\'s questions in order, its language and length, and keeps them at START even when the room saw them', async () => {
    const g = await finishedGame({ locale: 'he' });
    await ch.openChallenge(g.pin, 'u1');
    // Asked for English and 9 questions: the challenge decides.
    const pin = await newGame('en', 9, 'x1', { challenge: g.pin, hostKey: OTHER_KEY, serverStart: true, aboutUs: true, campaign: 'challenge-whatsapp' });
    const game = db.games[pin];
    assert.notStrictEqual(pin, g.pin);
    assert.deepStrictEqual(game.qids, g.qids);
    assert.strictEqual(game.locale, 'he');
    assert.strictEqual(game.totalQ, 5);
    assert.strictEqual(game.campaign, 'challenge-whatsapp');
    assert.strictEqual(game.aboutUs, undefined, 'no About questions in a challenge');
    assert.strictEqual(game.challenge.from, g.pin);
    assert.strictEqual(game.challenge.top, 4500);
    assert.strictEqual(game.origin, 'create');

    // Three phones that have seen every one of those questions sit down, and the host starts.
    for (const n of [1, 2, 3]) {
        db.seenQuestions = db.seenQuestions || {};
        db.seenQuestions['x' + n] = Object.fromEntries(g.qids.map(q => [q, Date.now() - 1000]));
        await join(pin, 'p' + n, 'x' + n, n === 1 ? OTHER_KEY : undefined);
    }
    await startGame(pin, OTHER_KEY);
    assert.notStrictEqual(db.games[pin].state.id, GameStaging, 'started');
    assert.deepStrictEqual(db.games[pin].qids, g.qids, 'the same questions, the same order');
    assert.strictEqual(db.games[pin].aboutQs, undefined);
});

test('an ordinary game still picks its questions again at START', async () => {
    seedQuestions();
    const pin = await newGame('en', 5, 'y1', { hostKey: OTHER_KEY, serverStart: true });
    const made = db.games[pin].qids.slice();
    db.seenQuestions = db.seenQuestions || {};
    db.seenQuestions.y1 = Object.fromEntries(made.map(q => [q, Date.now() - 1000]));
    await join(pin, 'a', 'y1', OTHER_KEY);
    await join(pin, 'b', 'y2');
    await startGame(pin, OTHER_KEY);
    assert.ok(db.games[pin].qids.every(q => made.indexOf(q) < 0), 'the room had seen those: new ones');
});

test('at the end of the challenge game its PIN carries the other table, for a week; a Replay of it is a plain game', async () => {
    const g = await finishedGame();
    await ch.openChallenge(g.pin, 'u1');
    const pin = await newGame('en', 5, 'x1', { challenge: g.pin, hostKey: OTHER_KEY });
    await join(pin, 'A', 'x1', OTHER_KEY);
    await join(pin, 'B', 'x2');
    // Mid-game: nothing.
    db.games[pin].state = { id: 3, timestamp: Date.now() };
    assert.strictEqual(await over(pin), null);
    db.games[pin].state = { id: ScoreBoardFinal, timestamp: Date.now() };
    const e = await over(pin);
    assert.strictEqual(e.versus.from, g.pin);
    assert.deepStrictEqual(e.versus.rows.map(r => r.score), [4500, 3000, 1500]);
    // A week later, no more.
    db.games[pin].state.timestamp = Date.now() - 8 * D;
    db.games[pin].timestamp = Date.now() - 8 * D;
    assert.strictEqual((await over(pin)).versus, undefined);

    db.games[pin].state.timestamp = Date.now();
    const pid = Object.keys(db.games[pin].players)[0];
    const r = await fork(pin, 'x1', pid, 'M'.repeat(24));
    assert.strictEqual(db.games[r.pin || db.games[pin].fork].challenge, undefined, 'a Replay plays new questions');
});

test('the challenge game can be challenged in turn, with the same questions', async () => {
    const g = await finishedGame();
    await ch.openChallenge(g.pin, 'u1');
    const pin = await newGame('en', 5, 'x1', { challenge: g.pin, hostKey: OTHER_KEY });
    await join(pin, 'A', 'x1', OTHER_KEY);
    await join(pin, 'B', 'x2');
    db.games[pin].state = { id: ScoreBoardFinal, timestamp: Date.now() };
    await ch.openChallenge(pin, 'x2');
    const third = await newGame('en', 5, 'z1', { challenge: pin });
    assert.deepStrictEqual(db.games[third].qids, g.qids);
    assert.strictEqual(db.games[third].challenge.from, pin);
});

test('a test game\'s challenge is a test game, whatever its link says', async () => {
    const g = await finishedGame({ campaign: 'test-qa' });
    await ch.openChallenge(g.pin, 'u1');
    assert.strictEqual((await over(g.pin)).challenge.test, true);
    const pin = await newGame('en', 5, 'x1', { challenge: g.pin, campaign: 'challenge-whatsapp' });
    assert.strictEqual(db.games[pin].campaign, 'test-qa');
});

test('challenge rows are counted with the PIN in capitals, and a test game\'s are dropped', async () => {
    const row = analytics.cleanShare({ content_type: 'challenge', method: 'whatsapp', crew: 'qvab', locale: 'he' });
    assert.deepStrictEqual(row, { content_type: 'challenge', method: 'whatsapp', crew_id: 'QVAB', locale: 'he', uid: null });
    for (const m of ['open', 'native', 'copy', 'seen', 'seen-over', 'start', 'seen-versus']) {
        assert.ok(analytics.cleanShare({ content_type: 'challenge', method: m, crew: 'QVAB' }), m);
    }
    assert.strictEqual(analytics.cleanShare({ content_type: 'challenge', method: 'whatsapp' }), null, 'no PIN, no row');
    assert.strictEqual(analytics.cleanShare({ content_type: 'challenge', method: 'boast', crew: 'QVAB' }), null);
    // A challenge row asks whether its game is a test game, by the PIN it carries.
    const asked = [];
    await analytics.onShare(row, async pin => { asked.push(pin); return true; });
    assert.deepStrictEqual(asked, ['QVAB']);
});

// ---- A fair challenge number at every table size, through the real scoring ----

const scoring = require(path.join(dist, 'scoring'));
const { pickHouseLies } = require(path.join(dist, 'answer-options'));
const { houseCreditUpdate } = require(path.join(dist, 'tick'));
const RevealTheTruth = 4;

/** A seeded random source, so every run plays the same games. */
function seeded(seed) {
    return () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * One seven-question game of `n` players, played through the server's own scoring: house lies filled by
 * pickHouseLies (none from 5 players up), points by scoreQuestion and addQuestionScores, the challenge
 * credit kept by houseCreditUpdate as the RevealTheTruth step keeps it. Each player knows the truth with
 * the chance `k`, else picks at random among what their phone shows. Returns the finished game record.
 */
function playGame(n, k, random) {
    const game = { players: {}, totalQ: 7, questionIndex: 0, state: { id: RevealTheTruth } };
    for (let i = 0; i < n; i++) game.players['p' + i] = { nickname: 'p' + i, score: 0 };
    [0, 0, 1, 1, 2, 2, 2].forEach((roundIndex, q) => {
        const answers = { truth: { text: 'truth', realAnswer: true, houseLie: false } };
        for (let i = 0; i < n; i++) answers['p' + i] = { text: 'lie' + i, realAnswer: false, houseLie: false };
        const fakes = Array.from({ length: 12 }, (_, j) => 'house' + j);
        pickHouseLies(fakes, Object.keys(answers).filter(a => a !== 'truth').map(a => answers[a].text), 'truth', n, random)
            .forEach((text, j) => answers['h' + j] = { text, realAnswer: false, houseLie: true });
        const answerSelections = {};
        for (let i = 0; i < n; i++) {
            const options = Object.keys(answers).filter(a => a !== 'p' + i);
            const pick = random() < k ? 'truth' : options[Math.floor(random() * options.length)];
            answerSelections['p' + i] = { text: answers[pick].text };
        }
        game.questionIndex = q;
        game.roundIndex = roundIndex;
        const s = scoring.scoreQuestion({ ...game, answers, answerSelections, state: { id: 2 } });
        const revealed = { ...game, answers: s.answers, answerSelections: s.answerSelections, revealAnswers: s.revealAnswers };
        Object.assign(game, houseCreditUpdate('TEST', revealed));
        game.players = scoring.addQuestionScores(revealed);
    });
    game.state = { id: ScoreBoardFinal, timestamp: Date.now() };
    return game;
}

/** The mean challenge number, and the mean plain average a player, of `games` games of `n` players. */
function tableNumbers(n, k, games = 1500) {
    const random = seeded(n * 1000 + Math.round(k * 100));
    let fair = 0, plain = 0;
    for (let i = 0; i < games; i++) {
        const g = playGame(n, k, random);
        fair += ch.challengeNumber(g);
        plain += Object.values(g.players).reduce((a, p) => a + p.score, 0) / n;
    }
    return { fair: fair / games, plain: plain / games };
}

test('equally good tables of 2, 3, 4 and 8 get a challenge number within 10% of each other, and 2 to 12 within 15%, house lies in', () => {
    for (const k of [0.2, 0.4]) {
        const by = {};
        for (const n of [2, 3, 4, 5, 8, 12]) by[n] = tableNumbers(n, k);
        const spread = sizes => {
            const v = sizes.map(n => by[n].fair);
            return (Math.max(...v) - Math.min(...v)) / Math.min(...v);
        };
        const shown = JSON.stringify(Object.fromEntries(Object.entries(by).map(([n, v]) => [n, Math.round(v.fair)])));
        assert.ok(spread([2, 3, 4, 8]) <= 0.10, `k ${k}: ${shown}`);
        assert.ok(spread([2, 3, 4, 5, 8, 12]) <= 0.15, `k ${k}: ${shown}`);
        // The plain average a player, without the credit, is what left small tables behind.
        assert.ok(by[2].plain < 0.8 * by[8].plain, `k ${k}: plain ${Math.round(by[2].plain)} vs ${Math.round(by[8].plain)}`);
        // From 5 players up there are no house lies: the number is the plain average.
        assert.ok(Math.abs(by[8].fair - by[8].plain) < 1);
    }
});

test('a better table wins whatever the sizes: a pair beats an eight that plays worse, and an eight beats a worse pair', () => {
    assert.ok(tableNumbers(2, 0.4).fair > tableNumbers(8, 0.2).fair);
    assert.ok(tableNumbers(8, 0.4).fair > tableNumbers(2, 0.2).fair);
    assert.ok(tableNumbers(3, 0.3).fair > tableNumbers(12, 0.2).fair);
});

test('a house-lie pick is credited what a friend\'s lie pays, plus what it cost the picker; nobody\'s score changes', () => {
    const players = { a: { nickname: 'A', score: 1000 }, b: { nickname: 'B', score: 0 } };
    const answers = {
        truth: { text: 'truth', realAnswer: true, houseLie: false },
        a: { text: 'lie a', realAnswer: false, houseLie: false },
        b: { text: 'lie b', realAnswer: false, houseLie: false },
        h: { text: 'house', realAnswer: false, houseLie: true },
    };
    const game = { players, answers, answerSelections: { a: { text: 'house' }, b: { text: 'house' } }, roundIndex: 1, state: { id: 2 } };
    const s = scoring.scoreQuestion(game);
    const revealed = { ...game, answers: s.answers, revealAnswers: s.revealAnswers };
    // A had 1000 and loses 375; B had nothing to lose. Each pick is worth a friend's lie in round 2, 750.
    assert.strictEqual(scoring.houseLieCredit(revealed), 750 + 375 + 750);
    const after = scoring.addQuestionScores(revealed);
    assert.strictEqual(after.a.score, 625);
    assert.strictEqual(after.b.score, 0);
    // Picks of the truth or a friend's lie earn no credit; a pick by no player counts for nothing.
    assert.strictEqual(scoring.houseLieCredit({ ...revealed, revealAnswers: s.revealAnswers.map(r => r.houseLie ? { ...r, selectors: ['x'] } : r) }), 0);
});

test('the credit is kept from the first question only, and added at each reveal', () => {
    const row = { text: 'house', houseLie: true, realAnswer: false, selectors: ['a'], creators: [''], points: 0, pointsBy: { a: 0 } };
    const g = { players: { a: { nickname: 'A', score: 0 } }, roundIndex: 0, revealAnswers: [row] };
    assert.deepStrictEqual(houseCreditUpdate('X', { ...g, questionIndex: 0 }), { houseCredit: 500 });
    assert.deepStrictEqual(houseCreditUpdate('X', { ...g, questionIndex: 3, houseCredit: 1000 }), { houseCredit: 1500 });
    // A game that was running when this was released keeps none: its number is its plain average.
    assert.deepStrictEqual(houseCreditUpdate('X', { ...g, questionIndex: 3 }), {});
    // Broken rows: the credit stays as it was.
    assert.deepStrictEqual(houseCreditUpdate('X', { ...g, questionIndex: 2, houseCredit: 700, revealAnswers: 'x' }), { houseCredit: 700 });
});

test('the card carries the table\'s challenge number; the versus answer adds this game\'s own; an older card loads as before', async () => {
    const g = await finishedGame({ scores: [3000, 4500, 1500] });
    db.games[g.pin].houseCredit = 3000;
    await ch.openChallenge(g.pin, 'u1');
    const card = (await over(g.pin)).challenge;
    assert.strictEqual(card.average, 4000, '(3000 + 4500 + 1500 + 3000) / 3');
    assert.strictEqual(card.top, 4500);
    // A finished game with no credit kept: its plain average.
    const plain = await finishedGame({ scores: [3000, 4500, 1500] });
    assert.strictEqual(ch.challengeCard(plain.pin, db.games[plain.pin], Date.now()).average, 3000);

    const pin = await newGame('en', 5, 'x1', { challenge: g.pin, hostKey: OTHER_KEY });
    await join(pin, 'A', 'x1', OTHER_KEY);
    await join(pin, 'B', 'x2');
    Object.values(db.games[pin].players).forEach((p, i) => p.score = [5000, 2000][i]);
    db.games[pin].houseCredit = 1000;
    db.games[pin].state = { id: ScoreBoardFinal, timestamp: Date.now() };
    let e = await over(pin);
    assert.strictEqual(e.versus.average, 4000);
    assert.strictEqual(e.versus.ours, 4000, '(5000 + 2000 + 1000) / 2');
    assert.strictEqual(db.games[pin].challenge.ours, undefined, 'worked out when asked, never stored');

    // A game made from a card copied before the number was kept: its versus is the old card, untouched.
    delete db.games[pin].challenge.average;
    e = await over(pin);
    assert.strictEqual(e.versus.average, undefined);
    assert.strictEqual(e.versus.ours, undefined);
    assert.deepStrictEqual(e.versus.rows.map(r => r.score), [4500, 3000, 1500]);
});
