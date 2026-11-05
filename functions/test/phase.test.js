// Unit tests for the phase rules. Run with: npm test (needs Node 18+ for node:test).
const test = require('node:test');
const assert = require('node:assert');
const { tickAllowed, phaseDuration, withDeadline, legacyFromState, revealDoneWait, maxPhaseDuration } = require('../dist/controllers/phase');

const S = { GameStaging: 0, RoundIntro: 1, ShowQuestion: 2, ShowAnswers: 3, RevealTheTruth: 4, ScoreBoard: 5, ScoreBoardFinal: 6 };

function game(id, timestamp, deadline, tick) {
    return { state: { id, timestamp, deadline }, tick };
}

test('every timed phase gets a deadline', () => {
    assert.strictEqual(withDeadline({ id: S.ShowQuestion, timestamp: 1000 }, {}).deadline, 26000);
    assert.strictEqual(withDeadline({ id: S.ShowAnswers, timestamp: 1000 }, {}).deadline, 21000);
    assert.strictEqual(withDeadline({ id: S.RoundIntro, timestamp: 1000 }, {}).deadline, 4000);
    assert.strictEqual(withDeadline({ id: S.ScoreBoard, timestamp: 1000 }, {}).deadline, 4000);
    assert.strictEqual(withDeadline({ id: S.GameStaging, timestamp: 1000 }, {}).deadline, undefined);
    assert.strictEqual(withDeadline({ id: S.ScoreBoardFinal, timestamp: 1000 }, {}).deadline, undefined);
});

const revealAnswers = [
    { text: 'a', selectors: ['p1'], realAnswer: false },
    { text: 'b', realAnswer: false },               // nobody picked it: no row
    { text: 'c', selectors: [], realAnswer: false }, // nobody picked it: no row
    { text: 'truth', selectors: ['p2'], realAnswer: true },
];

test('on phones the reveal lasts 1.6 s per row shown, plus 3 s to see your result after the last writer', () => {
    assert.strictEqual(phaseDuration(S.RevealTheTruth, { revealAnswers }), 2 * 1600 - 800 + 3000);
    assert.strictEqual(phaseDuration(S.RevealTheTruth, {}), 1600 - 800 + 3000);
});

test('with a big screen each row gets 4.5 s', () => {
    assert.strictEqual(phaseDuration(S.RevealTheTruth, { revealAnswers, presenter: true }), 2 * 4500 - 2250 + 3000);
});

test('the longest reveal (8 players and the truth, on a big screen) fits the server timer', () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ text: 't' + i, selectors: ['p'], realAnswer: i === 8 }));
    assert.ok(phaseDuration(S.RevealTheTruth, { revealAnswers: nine, presenter: true }) <= maxPhaseDuration);
});

function revealGame(done, extra) {
    return Object.assign({
        state: { id: S.RevealTheTruth, timestamp: 1000 },
        players: { p1: {}, p2: {} },
        revealAnswers,
        revealDone: done,
    }, extra);
}

test('NEXT ends the reveal only when every player tapped, after the last row', () => {
    const allShownAt = 1000 + 2 * 1600 - 800;
    assert.strictEqual(revealDoneWait(revealGame({ p1: true }), allShownAt), undefined, 'one player still watching');
    assert.strictEqual(revealDoneWait(revealGame(undefined), allShownAt), undefined, 'nobody tapped');
    assert.strictEqual(revealDoneWait(revealGame({ p1: true, p2: true }), allShownAt), 0, 'everyone tapped');
    assert.strictEqual(revealDoneWait(revealGame({ p1: true, p2: true }), allShownAt + 9999), 0, 'late taps');
    // a tap a moment early (clock skew) waits for the rest of the last row, minus the tolerance
    assert.strictEqual(revealDoneWait(revealGame({ p1: true, p2: true }), 1000), allShownAt - 1500 - 1000);
});

test('NEXT taps do nothing outside the reveal', () => {
    const g = revealGame({ p1: true, p2: true }, { state: { id: S.ScoreBoard, timestamp: 1000 } });
    assert.strictEqual(revealDoneWait(g, 99999), undefined);
    assert.strictEqual(revealDoneWait(null, 99999), undefined);
});

test('a current-style tick only counts for the phase it names, after its deadline', () => {
    const g = game(S.ShowQuestion, 1000, 26000, '2:1000');
    assert.strictEqual(tickAllowed(g, '2:1000', 10000), false, 'too early');
    assert.strictEqual(tickAllowed(g, '2:1000', 26000), true, 'at the deadline');
    assert.strictEqual(tickAllowed(g, '2:999', 30000), false, 'an earlier question phase');
    assert.strictEqual(tickAllowed(g, '5:1000', 30000), false, 'another phase');
});

test('a small clock skew is tolerated', () => {
    assert.strictEqual(tickAllowed(game(S.ShowQuestion, 1000, 26000), '2:1000', 25000), true);
});

test('legacy ticks (from phones on the old build) still work, but cannot skip a phase', () => {
    assert.strictEqual(legacyFromState(999), S.ScoreBoard);
    assert.strictEqual(legacyFromState(S.ShowAnswers), S.ShowQuestion);
    // START in the lobby: no deadline
    assert.strictEqual(tickAllowed(game(S.GameStaging, 1000), S.RoundIntro, 1000), true);
    // old phone timer at the end of the question
    assert.strictEqual(tickAllowed(game(S.ShowQuestion, 1000, 26000), S.ShowAnswers, 26000), true);
    // a late "score board is over" tick arriving during the next question is ignored
    assert.strictEqual(tickAllowed(game(S.ShowQuestion, 1000, 26000), 999, 26000), false);
    // a tick equal to the current state is ignored, as before
    assert.strictEqual(tickAllowed(game(S.ShowAnswers, 1000, 21000), S.ShowAnswers, 30000), false);
    // games started before this change (no deadline) behave as before
    assert.strictEqual(tickAllowed(game(S.ShowQuestion, 1000), S.ShowAnswers, 2000), true);
});

test('nothing moves a finished game', () => {
    assert.strictEqual(tickAllowed(game(S.ScoreBoardFinal, 1000), '6:1000', 99999), false);
    assert.strictEqual(tickAllowed(game(S.ScoreBoardFinal, 1000), 7, 99999), false);
});
