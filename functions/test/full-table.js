// Local run: a full table of 8 plays a whole game in real time, and a ninth player is turned away.
// Prints the rows the game sends to BigQuery: refused_joins, and question_results with the wait
// columns (lie_span_s, pick_span_s, unpicked_lies).
//
// Needs the Realtime Database emulator on 127.0.0.1:9000 (see test/sleeping-phones.js).
// Then: npm run build && node test/full-table.js
//
// It runs the real controllers from dist/ on the real phase timers, and the answerSelections
// trigger exactly as index.ts exports it. Only BigQuery is replaced: its rows are printed.

const DB_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000';
const NS = 'demo-bullshit';
process.env.FIREBASE_DATABASE_EMULATOR_HOST = DB_HOST;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: NS, databaseURL: `http://${DB_HOST}?ns=${NS}` });
process.env.GCLOUD_PROJECT = NS;

const t0 = Date.now();
const at = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(6) + 's';
const say = console.log.bind(console);
console.log = () => {};                       // the controllers' own lines

const rows = [];
const Module = require('module');
const realLoad = Module._load;
Module._load = function (request) {
    if (request === '@google-cloud/bigquery') {
        return { BigQuery: class { dataset() { return { table: (table) => ({ insert: async (row) => {
            rows.push({ table, row });
            if (table === 'refused_joins' || table === 'question_results') say(`${at()} BigQuery row, ${table}: ${JSON.stringify(row)}`);
        } }) }; } } };
    }
    return realLoad.apply(this, arguments);
};

const assert = require('assert');
const { gamesRef, questionsRef } = require('../dist/firebase');
const api = require('../dist/index');
const { tick } = require('../dist/controllers/tick');
const { newGame } = require('../dist/controllers/new-game');
const { join } = require('../dist/controllers/join');
const { answer } = require('../dist/controllers/answer');
const { onPhaseStart } = require('../dist/controllers/phase-timer');
const analytics = require('../dist/controllers/analytics');

const names = ['GameStaging', 'RoundIntro', 'ShowQuestion', 'ShowAnswers', 'RevealTheTruth', 'ScoreBoard', 'ScoreBoardFinal'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function wireTriggers(pin) {
    const g = gamesRef.child(pin);
    const onWrite = (ref, handler) => {
        let before, first = true;
        ref.on('value', snap => {
            const after = snap.val();
            if (!first) Promise.resolve(handler(before, after)).catch(e => console.error('trigger failed', e));
            first = false;
            before = after;
        });
    };
    onWrite(g.child('tick'), () => tick(pin));
    onWrite(g.child('state'), (b, state) => Promise.all([onPhaseStart(pin, state), analytics.onStateChange(pin)]));
    // The exported function itself, with a change and an event as Cloud Functions hands them over.
    onWrite(g.child('answerSelections'), (b, a) => api.onAnswerSelection.run(
        { before: { val: () => b }, after: { val: () => a } },
        { params: { pin }, timestamp: new Date().toISOString() }));
}

async function waitForState(pin, id, timeoutMs = 60000) {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
        const s = (await gamesRef.child(pin).child('state').once('value')).val();
        if (s && s.id === id) return s;
        await sleep(50);
    }
    throw new Error(`timed out waiting for ${names[id]}`);
}

(async () => {
    const q = {};
    for (let i = 0; i < 6; i++) {
        q[`q${i}`] = { lang: 'en', questionText: `Question ${i} has a ___`, realAnswer: `truth ${i}`, fakeAnswers: ['house a', 'house b', 'house c'], citation: '' };
    }
    await questionsRef.set(q);

    const pin = await newGame('en', 3, 'hostUid', { campaign: 'test-full-table' });
    await gamesRef.child(pin).child('coach').set(false);
    for (let i = 1; i <= 8; i++) await join(pin, 'tester' + i, 'uid' + i);
    const game = async () => (await gamesRef.child(pin).once('value')).val();
    const pids = Object.keys((await game()).players);
    say(`${at()} [${pin}] 8 players in the lobby`);

    say(`${at()} [${pin}] a ninth player tries to join`);
    await assert.rejects(join(pin, 'ninth', 'uid9'), { code: 'GAME_IS_FULL' });
    say(`${at()} [${pin}] the ninth player was told: game is full`);

    wireTriggers(pin);
    await sleep(300);
    await gamesRef.child(pin).child('tick').set(1);                // START

    // Per question: when each player lies (s into the question; null = never) and what they pick, and when.
    const plan = [
        { lies: [1, 2, 2.5, 3, 4, 5, 6, 7.5], picks: [[0, 0.5, 'lie 1'], [1, 1, 'lie 0'], [2, 1.5, 'lie 0'], [3, 2, 'lie 4'], [4, 2.5, null], [5, 3, 'house a'], [6, 3.5, 'lie 1'], [7, 5, 'lie 0']] },
        { lies: [1, 2, 3, 4, 6.2, null, null, null], picks: [[0, 1, 'lie 1'], [1, 1.5, 'lie 0'], [2, 2, 'lie 1'], [3, 2.5, 'lie 4'], [4, 3, 'house b'], [5, 6.4, 'lie 1']] },
        { lies: [2, null, null, null, null, null, null, null], picks: [[1, 1, 'house a'], [2, 3, 'house c']] },
    ];

    for (let qi = 0; qi < plan.length; qi++) {
        const started = (await waitForState(pin, 2)).timestamp;
        say(`${at()} [${pin}] question ${qi + 1}`);
        await Promise.all(plan[qi].lies.map(async (sec, i) => {
            if (sec === null) return;
            await sleep(Math.max(0, started + sec * 1000 - Date.now()));
            await answer(pin, pids[i], 'lie ' + i);
        }));
        const picking = (await waitForState(pin, 3)).timestamp;
        const truth = (await game()).answers.truth.text;
        await Promise.all(plan[qi].picks.map(async ([i, sec, text]) => {
            await sleep(Math.max(0, picking + sec * 1000 - Date.now()));
            await gamesRef.child(pin).child('answerSelections').child(pids[i]).set({ text: text || truth });
        }));
        await waitForState(pin, 5, 90000);
    }
    await waitForState(pin, 6);
    await sleep(1500);

    const refused = rows.filter(r => r.table === 'refused_joins').map(r => r.row);
    const results = rows.filter(r => r.table === 'question_results').map(r => r.row);
    assert.strictEqual(refused.length, 1);
    assert.deepStrictEqual([refused[0].pin, refused[0].players, refused[0].started, refused[0].campaign], [pin, 8, false, 'test-full-table']);
    assert.strictEqual(results.length, 3);
    const near = (got, want, what) => assert.ok(got !== null && Math.abs(got - want) < 1, `${what}: ${got}, wanted about ${want}`);
    near(results[0].lie_span_s, 6.5, 'question 1, lies');
    near(results[0].pick_span_s, 4.5, 'question 1, picks');
    near(results[1].lie_span_s, 5.2, 'question 2, lies');
    near(results[1].pick_span_s, 5.4, 'question 2, picks');
    assert.strictEqual(results[2].lie_span_s, null);
    near(results[2].pick_span_s, 2, 'question 3, picks');
    assert.deepStrictEqual(results.map(r => [r.lies, r.picks, r.unpicked_lies, r.friend_fooled]), [[8, 8, 5, 6], [5, 6, 2, 5], [1, 2, 1, 0]]);
    assert.strictEqual(rows.filter(r => r.table === 'opened_games').length, 1);
    assert.strictEqual(rows.filter(r => r.table === 'closed_games').length, 1);
    const end = await game();
    say(`${at()} [${pin}] final scores: ${pids.map(p => end.players[p].score).join(', ')}`);
    say(`${at()} PASS: 8 played 3 questions to the end, the ninth join was refused and counted, the waits were measured.`);
    process.exit(0);
})().catch(e => { console.error(`${at()} FAIL`, e); process.exit(1); });
