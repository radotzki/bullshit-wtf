// Local run: whole scripted games on the Realtime Database emulator, with and without a seat nobody
// plays. Prints the seconds each question took and the final scores, and checks the rule of seats.ts:
// from question 2 a seat that has sent nothing is not waited for, and counts again once it sends.
//
// Needs the Realtime Database emulator on 127.0.0.1:9000 (see test/sleeping-phones.js).
// Then: npm run build && node test/empty-seat-game.js [full|empty|late|two|rematch ...]
// With no names it plays them all, side by side (about five minutes).
//
// DIST=<path to another build's dist> plays the same scripts on that build, to compare scores and
// times (CHECK=0 skips the checks, for a build from before this rule). Nothing leaves this machine:
// the BigQuery client is replaced by one that only keeps the rows.

const path = require('path');
const DB_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000';
const NS = 'demo-bullshit';
process.env.FIREBASE_DATABASE_EMULATOR_HOST = DB_HOST;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: NS, databaseURL: `http://${DB_HOST}?ns=${NS}` });
process.env.GCLOUD_PROJECT = NS;

const DIST = path.resolve(process.env.DIST || path.join(__dirname, '..', 'dist'));
const questionRows = [];
// The build under test loads BigQuery from its own node_modules: replace that very module.
const bigQueryModule = require.resolve('@google-cloud/bigquery', { paths: [DIST] });
require(bigQueryModule);
require.cache[bigQueryModule].exports = {
    BigQuery: class {
        dataset() { return { table: name => ({ insert: async row => { if (name === 'question_results') questionRows.push(row); } }) }; }
    },
};

const CHECK = process.env.CHECK !== '0';
const PREFIX = (process.env.PIN_PREFIX || 'ES').toUpperCase();
const assert = require('assert');
const { gamesRef, questionsRef, gameCounterRef } = require(path.join(DIST, 'firebase'));
const { tick } = require(path.join(DIST, 'controllers/tick'));
const { answer } = require(path.join(DIST, 'controllers/answer'));
const { onAnswerSelection } = require(path.join(DIST, 'controllers/on-answer-selection'));
const { onRevealDone } = require(path.join(DIST, 'controllers/on-reveal-done'));
const { onPhaseStart } = require(path.join(DIST, 'controllers/phase-timer'));
const { fork } = require(path.join(DIST, 'controllers/fork'));
const { revealSchedule } = require(path.join(DIST, 'game-model'));

const S = { Staging: 0, RoundIntro: 1, Question: 2, Answers: 3, Reveal: 4, ScoreBoard: 5, Final: 6 };
const TOTAL_Q = 5;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const secs = ms => Math.round(ms / 100) / 10;

// How long each player takes: to write a lie, and to pick (seconds into the phase). Much like a
// live table of quick players: all in by 15 s and by 9 s, so a full table plays a question in about 35 s.
const pace = { p1: { lie: 9, pick: 5 }, p2: { lie: 12, pick: 7 }, p3: { lie: 15, pick: 9 }, p4: { lie: 13, pick: 8 } };
// Whom each player falls for: another player's lie when that player wrote one, else the truth.
const fallsFor = { p1: 'p2', p2: null, p3: 'p1', p4: 'p3' };

function seats(n) {
    const players = {};
    for (let i = 1; i <= n; i++) players['p' + i] = { nickname: 'player' + i, score: 0, uid: 'u' + i };
    return players;
}

function onWrite(ref, handler) {
    let first = true;
    ref.on('value', snap => {
        if (first) { first = false; return; }
        Promise.resolve(handler(snap.val())).catch(e => console.error('trigger failed', e));
    });
}

/**
 * Plays the game at `pin` to its final scoreboard. `plays(pid, q)` says whether that seat plays
 * question q (0 = the first). Resolves to the phases of each question and the final game.
 */
async function play(pin, label, plays) {
    const g = gamesRef.child(pin);
    const questions = [];
    let timers = [];
    let done;
    const finished = new Promise(r => done = r);
    let lastKey;

    onWrite(g.child('tick'), () => tick(pin));
    onWrite(g.child('answerSelections'), () => onAnswerSelection(pin));
    onWrite(g.child('revealDone'), () => onRevealDone(pin));
    onWrite(g.child('state'), state => onPhaseStart(pin, state));

    g.child('state').on('value', async snap => {
        const state = snap.val();
        const key = state && `${state.id}:${state.timestamp}`;
        if (!state || key === lastKey) return;
        lastKey = key;
        timers.forEach(clearTimeout);
        timers = [];
        const game = (await g.once('value')).val();
        if (lastKey !== key) return;
        const q = game.questionIndex;
        const current = questions[questions.length - 1];
        const still = () => lastKey === key;
        const pids = Object.keys(game.players).filter(pid => plays(pid, q));
        const after = (s, fn) => timers.push(setTimeout(() => still() && Promise.resolve(fn()).catch(e => console.error(pin, e)), s * 1000));

        if (current && !current.end && state.id !== S.Answers && state.id !== S.Reveal && state.id !== S.ScoreBoard) {
            current.end = state.timestamp;
        }

        if (state.id === S.Question) {
            questions.push({ q, start: state.timestamp, seats: Object.keys(game.players).length, playing: pids.length, sent: {} });
            pids.forEach(pid => after(pace[pid].lie, () => answer(pin, pid, `${pid} lie ${q}`)));
        } else if (state.id === S.Answers) {
            current.answers = state.timestamp;
            current.lies = Object.keys(game.answers || {}).filter(k => game.players[k]).length;
            pids.forEach(pid => after(pace[pid].pick, () => {
                const target = (fallsFor[pid] && game.answers[fallsFor[pid]]) || game.answers.truth;
                return g.child('answerSelections').child(pid).set({ text: target.text });
            }));
        } else if (state.id === S.Reveal) {
            current.reveal = state.timestamp;
            current.picks = Object.keys(game.answerSelections || {}).filter(k => game.players[k]).length;
            const shown = revealSchedule(game.revealAnswers, false).allShown / 1000;
            pids.forEach(pid => after(shown + 0.8, () => g.child('revealDone').child(pid).set(true)));
        } else if (state.id === S.ScoreBoard) {
            current.board = state.timestamp;
        } else if (state.id === S.Final) {
            done(game);
        }
    });

    await sleep(300);
    await g.child('tick').set(1);
    const game = await finished;
    const scores = {};
    Object.keys(game.players).sort().forEach(pid => scores[pid] = game.players[pid].score);
    const rows = questions.map(x => ({
        q: x.q + 1, seats: x.seats, playing: x.playing, lies: x.lies, picks: x.picks,
        lie: secs(x.answers - x.start), pick: secs(x.reveal - x.answers), reveal: secs(x.board - x.reveal), all: secs(x.end - x.start),
    }));
    console.log(`\n${label} [${pin}]`);
    rows.forEach(r => console.log(`  question ${r.q}: ${r.all.toFixed(1).padStart(5)} s  (lies ${r.lie} s, picks ${r.pick} s, reveal ${r.reveal} s, scoreboard ${secs(r.all * 1000 - (r.lie + r.pick + r.reveal) * 1000)} s)` +
        `  ${r.lies} lies and ${r.picks} picks from ${r.seats} seats`));
    const later = rows.slice(1).map(r => r.all).sort((a, b) => a - b);
    console.log(`  median of questions 2 to ${rows.length}: ${later[Math.floor(later.length / 2)]} s; scores: ${JSON.stringify(scores)}`);
    return { pin, rows, scores, game };
}

function newGame(n) {
    const qids = {};
    for (let i = 0; i < TOTAL_Q; i++) qids[i] = `q${i}`;
    return {
        state: { id: 0, timestamp: Date.now() }, locale: 'en', timestamp: Date.now(),
        roundIndex: 0, questionIndex: 0, totalQ: TOTAL_Q, qids, tick: 0, presenter: false, players: seats(n),
    };
}

const near = (value, target, slack = 1.5) => value >= target - 0.2 && value <= target + slack;

const games = {
    // Three seats, three players: the measure to compare with.
    async full() {
        const pin = PREFIX + 'FA';
        await gamesRef.child(pin).set(newGame(3));
        const r = await play(pin, 'Every seat plays (3 of 3)', () => true);
        if (CHECK) {
            r.rows.forEach(x => {
                assert.ok(near(x.lie, 15), `full table, question ${x.q}: lies end with the last lie (${x.lie} s)`);
                assert.ok(near(x.pick, 9), `full table, question ${x.q}: picks end with the last pick (${x.pick} s)`);
            });
            assert.deepStrictEqual(r.game.played, { p1: true, p2: true, p3: true });
            assert.strictEqual(r.game.playedFrom, 0);
        }
        return r;
    },

    // Four seats, three players: the fourth seat never sends anything.
    async empty() {
        const pin = PREFIX + 'EA';
        await gamesRef.child(pin).set(newGame(4));
        const r = await play(pin, 'One seat never plays (3 of 4)', pid => pid !== 'p4');
        if (CHECK) {
            assert.ok(near(r.rows[0].lie, 25) && near(r.rows[0].pick, 20), 'question 1 still waits out both clocks');
            r.rows.slice(1).forEach(x => {
                assert.ok(near(x.lie, 20.25), `question ${x.q}: lies end when their guard of 20 s is over (${x.lie} s)`);
                assert.ok(near(x.pick, 10.25), `question ${x.q}: picks end when the guard is over (${x.pick} s)`);
            });
            assert.deepStrictEqual(r.game.played, { p1: true, p2: true, p3: true });
            assert.strictEqual(r.game.players.p4.score, 0, 'the empty seat is still on the scoreboard');
        }
        return r;
    },

    // Four seats; the fourth misses questions 1 and 2 and plays from question 3.
    async late() {
        const pin = PREFIX + 'LA';
        await gamesRef.child(pin).set(newGame(4));
        const r = await play(pin, 'One seat joins in on question 3 (3 of 4, then 4 of 4)', (pid, q) => pid !== 'p4' || q >= 2);
        if (CHECK) {
            assert.ok(near(r.rows[1].lie, 20.25), 'question 2 does not wait for the silent seat beyond the guard');
            // Question 3: p4 sends its lie at 13 s, before the others are all in, and is waited for from then on.
            r.rows.slice(2).forEach(x => {
                assert.strictEqual(x.lies, 4, `question ${x.q}: the late seat's lie is in`);
                assert.strictEqual(x.picks, 4, `question ${x.q}: the late seat's pick is waited for`);
                assert.ok(near(x.pick, 9), `question ${x.q}: no guard once every seat plays (${x.pick} s)`);
            });
            assert.deepStrictEqual(r.game.played, { p1: true, p2: true, p3: true, p4: true });
        }
        return r;
    },

    // Two seats, one player.
    async two() {
        const pin = PREFIX + 'TA';
        await gamesRef.child(pin).set(newGame(2));
        const r = await play(pin, 'A table of two with one empty seat (1 of 2)', pid => pid === 'p1');
        if (CHECK) {
            assert.ok(near(r.rows[0].lie, 25), 'question 1 waits');
            r.rows.slice(1).forEach(x => {
                assert.ok(near(x.lie, 20.25), `question ${x.q}: the lone player's lie ends the phase when the guard is over (${x.lie} s)`);
                assert.ok(near(x.pick, 10.25), `question ${x.q}: and the pick (${x.pick} s)`);
            });
        }
        return r;
    },

    // A finished game of three whose third player went home; Replay copies the dead seat.
    async rematch() {
        const parent = PREFIX + 'RA';
        const finished = newGame(3);
        finished.state = { id: S.Final, timestamp: Date.now() };
        finished.questionIndex = TOTAL_Q - 1;
        finished.played = { p1: true, p2: true, p3: true };
        finished.playedFrom = 0;
        Object.keys(finished.players).forEach((pid, i) => finished.players[pid].score = 1000 * (i + 1));
        await gamesRef.child(parent).set(finished);
        const { pin } = await fork(parent, 'u1', 'p1');
        const copied = (await gamesRef.child(pin).once('value')).val();
        assert.deepStrictEqual(Object.keys(copied.players).sort(), ['p1', 'p2', 'p3'], 'Replay copies every seat');
        if (CHECK) {
            assert.strictEqual(copied.played, undefined, 'and no flags');
            assert.strictEqual(copied.playedFrom, undefined);
        }
        const r = await play(pin, 'A rematch that copied a dead seat (2 of 3)', pid => pid !== 'p3');
        if (CHECK) {
            assert.ok(near(r.rows[0].lie, 25), 'question 1 of the rematch waits for the dead seat once');
            r.rows.slice(1).forEach(x => assert.ok(near(x.lie, 20.25), `question ${x.q}: then it is dropped, once the guard is over (${x.lie} s)`));
            assert.deepStrictEqual(r.game.played, { p1: true, p2: true });
        }
        return r;
    },
};

(async () => {
    const q = {};
    for (let i = 0; i < 12; i++) {
        q[`q${i}`] = { lang: 'en', questionText: `Question ${i} has a ___`, realAnswer: `truth${i}`, fakeAnswers: ['lie a', 'lie b', 'lie c', 'lie d'], citation: '' };
    }
    await questionsRef.set(q);
    await gameCounterRef.set(100000 + Math.floor(Math.random() * 100000));

    const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(games);
    console.log(`build: ${DIST}${CHECK ? '' : ' (no checks)'}; playing: ${names.join(', ')}`);
    const results = await Promise.all(names.map(n => games[n]()));

    console.log('\nquestion rows sent to analytics (kept here, not sent):');
    const columns = new Set();
    questionRows.forEach(r => Object.keys(r).forEach(k => columns.add(k)));
    console.log(`  ${questionRows.length} rows; columns: ${Array.from(columns).join(', ')}`);
    console.log('\nRESULT ' + JSON.stringify(results.map(r => ({ pin: r.pin.slice(2), scores: r.scores, lies: r.rows.map(x => x.lies), picks: r.rows.map(x => x.picks) }))));
    console.log(CHECK ? 'PASS' : 'DONE');
    process.exit(0);
})().catch(e => { console.error('FAIL', e.message || e); process.exit(1); });
