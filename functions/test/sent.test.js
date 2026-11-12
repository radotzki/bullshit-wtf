// Unit tests for the marks behind the row of players on the waiting screens
// (controllers/sent.ts, and waitingRow in game-model). Run with: npm test.
const test = require('node:test');
const assert = require('node:assert');
const { sentUpdate, pickMarks } = require('../dist/controllers/sent');
const { seatsToWaitFor, playedUpdate } = require('../dist/controllers/seats');
const { playerPicks } = require('../dist/controllers/scoring');
const { sentMark, sentMarkTime, waitingRow } = require('../dist/game-model');

const S = { GameStaging: 0, RoundIntro: 1, ShowQuestion: 2, ShowAnswers: 3, RevealTheTruth: 4, ScoreBoard: 5, ScoreBoardFinal: 6 };
const MADE = 50000;
const T = 100000;

function seats(n) {
    const players = {};
    for (let i = 1; i <= n; i++) players['p' + i] = { nickname: 'n' + i, score: 0, uid: 'u' + i };
    return players;
}

function game(n, q, id, extra) {
    return Object.assign({
        timestamp: MADE, state: { id, timestamp: T }, questionIndex: q, roundIndex: 0, totalQ: 7, players: seats(n),
    }, extra);
}

const lie = text => ({ text, houseLie: false, realAnswer: false });
const table = { truth: { text: 'Truth', houseLie: false, realAnswer: true }, '-h1': { text: 'house', houseLie: true, realAnswer: false } };

/** Writes an update of marks into the game's players, as the database would. */
function apply(g, update) {
    Object.keys(update).forEach(path => {
        const [pid, field] = path.split('/');
        g.players[pid][field] = update[path];
    });
}

test('a mark names the phase, and tells when that phase started', () => {
    assert.strictEqual(sentMark({ id: 2, timestamp: T }), '2:100000');
    assert.strictEqual(sentMarkTime('2:100000'), T);
    for (const no of [undefined, null, '', 'yes', true, 5, '2:', ':5', '2:abc', { id: 2 }]) {
        assert.strictEqual(sentMarkTime(no), 0);
    }
});

test('a lie marks its seat with the phase, once, and only a seat of the game', () => {
    const g = game(3, 0, S.ShowQuestion);
    assert.deepStrictEqual(sentUpdate(g, ['p2']), { 'p2/sent': '2:100000' });
    apply(g, sentUpdate(g, ['p2']));
    assert.deepStrictEqual(sentUpdate(g, ['p2']), {}, 'nothing to write a second time');
    assert.deepStrictEqual(sentUpdate(g, ['nobody', 'constructor', '__proto__', 'toString']), {});
    assert.deepStrictEqual(sentUpdate(null, ['p1']), {});
    assert.deepStrictEqual(sentUpdate({ players: seats(2) }, ['p1']), {}, 'no phase, no mark');
});

test('a mark carries nothing of what was sent', () => {
    const g = game(2, 0, S.ShowQuestion, { answers: { p1: lie('a secret lie') } });
    assert.doesNotMatch(JSON.stringify(sentUpdate(g, ['p1'])), /secret|lie/);
    const picking = game(2, 0, S.ShowAnswers, { answers: Object.assign({ p1: lie('a secret lie') }, table), answerSelections: { p2: { text: 'a secret lie' } } });
    assert.deepStrictEqual(pickMarks(picking), { 'p2/sent': '3:100000' });
});

test('picks: only the picks that count mark a seat, and each seat once', () => {
    const g = game(3, 0, S.ShowAnswers, {
        answers: Object.assign({ p1: lie('mine') }, table),
        answerSelections: {
            p1: { text: 'mine' },          // a player's own lie: no pick
            p2: { text: 'truth' },
            stranger: { text: 'truth' },   // not a seat
            p3: { text: '' },              // no text
        },
    });
    assert.deepStrictEqual(pickMarks(g), { 'p2/sent': '3:100000' });
    apply(g, pickMarks(g));
    g.answerSelections.p3 = { text: 'house' };
    assert.deepStrictEqual(pickMarks(g), { 'p3/sent': '3:100000' }, 'the second pick writes one mark, not two');
    assert.deepStrictEqual(pickMarks(game(3, 0, S.GameStaging, { answerSelections: { p1: { text: 'x' } } })), {});
    assert.deepStrictEqual(pickMarks(null), {});
});

test('a pick looked at after its phase marks only a seat with no mark from this game', () => {
    // The reveal has started; p1 was marked while writing, p2 never, p3 carries a mark from before the game.
    const g = game(3, 0, S.RevealTheTruth, { answerSelections: { p1: { text: 'truth' }, p2: { text: 'truth' }, p3: { text: 'truth' } } });
    g.players.p1.sent = '2:90000';
    g.players.p3.sent = '3:40000';
    assert.deepStrictEqual(pickMarks(g), { 'p2/sent': '4:100000', 'p3/sent': '4:100000' });
    apply(g, pickMarks(g));
    assert.deepStrictEqual(pickMarks(g), {});
});

test('the row: ticks follow the marks of this phase only', () => {
    const g = game(4, 0, S.ShowQuestion);
    assert.strictEqual(waitingRow(g.players, g.state, 0, MADE).known, false, 'an older server marks nobody');
    apply(g, sentUpdate(g, ['p1', 'p3']));
    let row = waitingRow(g.players, g.state, 0, MADE);
    assert.strictEqual(row.known, true);
    assert.deepStrictEqual(row.seats.map(s => [s.pid, s.index, s.nickname, s.done, s.away]), [
        ['p1', 0, 'n1', true, false], ['p2', 1, 'n2', false, false], ['p3', 2, 'n3', true, false], ['p4', 3, 'n4', false, false],
    ]);
    assert.deepStrictEqual(row.waiting.map(s => s.pid), ['p2', 'p4']);

    // The picks start: the lies' marks tick nobody.
    row = waitingRow(g.players, { id: S.ShowAnswers, timestamp: T + 20000 }, 0, MADE);
    assert.deepStrictEqual(row.seats.map(s => s.done), [false, false, false, false]);
    assert.deepStrictEqual(row.waiting.map(s => s.pid), ['p1', 'p2', 'p3', 'p4']);
});

test('the row never shows a seat the empty seats rule leaves out as waited for', () => {
    // Question 2: p3 sent nothing on question 1.
    const g = game(3, 1, S.ShowQuestion, { playedFrom: 0, played: { p1: true, p2: true } });
    g.players.p1.sent = '3:80000';
    g.players.p2.sent = '3:80000';
    let row = waitingRow(g.players, g.state, 1, MADE);
    assert.deepStrictEqual(row.seats.map(s => s.away), [false, false, true]);
    assert.deepStrictEqual(row.waiting.map(s => s.pid), seatsToWaitFor(g));

    // A late player sends a lie: the seat is in, and counts from here on.
    g.answers = { p3: lie('late') };
    apply(g, sentUpdate(g, ['p3']));
    row = waitingRow(g.players, g.state, 1, MADE);
    assert.deepStrictEqual(row.seats.map(s => [s.done, s.away]), [[false, false], [false, false], [true, false]]);
    assert.deepStrictEqual(row.waiting.map(s => s.pid), ['p1', 'p2']);
});

test('a mark older than the game (a Replay from an older server) does not count as played', () => {
    const g = game(2, 1, S.ShowQuestion);
    g.players.p1.sent = '3:80000';
    g.players.p2.sent = '3:40000';      // before the game was made
    const row = waitingRow(g.players, g.state, 1, MADE);
    assert.deepStrictEqual(row.seats.map(s => s.away), [false, true]);
});

test('the row copes with a game that is not all there', () => {
    assert.deepStrictEqual(waitingRow(null, null, null, null), { known: false, seats: [], waiting: [] });
    assert.deepStrictEqual(waitingRow({ p1: null, p2: 'x' }, { id: 2, timestamp: T }, 0, MADE), { known: false, seats: [], waiting: [] });
    const row = waitingRow({ p1: { score: 0 } }, undefined, undefined, undefined);
    assert.deepStrictEqual(row.seats, [{ pid: 'p1', nickname: '', index: 0, done: false, away: false }]);
});

/**
 * Whole games in small: every question, some seats lie and some pick, and after each thing sent the
 * seats the row shows as waited for are the seats the server waits for and have not sent yet.
 */
test('through whole games the row waits for exactly the seats the server waits for', () => {
    let seed = 7;
    const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    for (let round = 0; round < 200; round++) {
        const n = 2 + Math.floor(random() * 7);
        const g = game(n, 0, S.RoundIntro, {});
        const pids = Object.keys(g.players);
        // Some seats never play, some play now and then.
        const keen = {};
        pids.forEach(pid => keen[pid] = random() < 0.2 ? 0 : random() < 0.3 ? 0.5 : 1);
        let clock = T;

        const check = (sent, what) => {
            const row = waitingRow(g.players, g.state, g.questionIndex, g.timestamp);
            const expected = seatsToWaitFor(g).filter(pid => !sent[pid]);
            assert.deepStrictEqual(row.waiting.map(s => s.pid), expected, `${what}, question ${g.questionIndex + 1}, ${n} seats`);
            row.seats.forEach(s => assert.strictEqual(s.done, !!sent[s.pid], `${what}: tick of ${s.pid}`));
        };

        for (let q = 0; q < 4; q++) {
            g.questionIndex = q;
            g.state = { id: S.ShowQuestion, timestamp: clock += 1000 };
            g.answers = {};
            g.answerSelections = {};
            check({}, 'lies open');
            pids.filter(pid => random() < keen[pid]).forEach(pid => {
                g.answers[pid] = lie('lie ' + pid);
                apply(g, sentUpdate(g, [pid]));
                check(g.answers, 'a lie');
            });

            g.state = { id: S.ShowAnswers, timestamp: clock += 1000 };
            Object.assign(g.answers, table);
            check({}, 'picks open');
            pids.filter(pid => random() < keen[pid]).forEach(pid => {
                g.answerSelections[pid] = { text: 'truth' };
                apply(g, pickMarks(g));
                check(playerPicks(g), 'a pick');
            });

            Object.assign(g, playedUpdate(g));
            g.state = { id: S.RevealTheTruth, timestamp: clock += 1000 };
            apply(g, pickMarks(g));
        }
    }
});
