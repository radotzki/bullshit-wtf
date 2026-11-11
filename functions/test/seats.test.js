// Unit tests for the seats nobody plays (controllers/seats.ts). Run with: npm test.
const test = require('node:test');
const assert = require('node:assert');
const { seatsToWaitFor, everyoneSent, leftOutGuardWait, playedUpdate, endsAfterGuard, guardedPhase, revealEndWait, LEFT_OUT_GUARD_MS } =
    require('../dist/controllers/seats');

const S = { GameStaging: 0, RoundIntro: 1, ShowQuestion: 2, ShowAnswers: 3, RevealTheTruth: 4, ScoreBoard: 5, ScoreBoardFinal: 6 };
const T = 100000;

function seats(n) {
    const players = {};
    for (let i = 1; i <= n; i++) players['p' + i] = { nickname: 'n' + i, score: 0, uid: 'u' + i };
    return players;
}

/** A game of `n` seats on question `q` (0 = the first), in phase `id` that started at T. */
function game(n, q, id, extra) {
    return Object.assign({
        state: { id, timestamp: T }, questionIndex: q, roundIndex: 0, totalQ: 7, players: seats(n),
    }, extra);
}

const lie = text => ({ text, houseLie: false, realAnswer: false });

/** What the server stores as question `q`'s picks close, given who lied and who picked. */
function closeQuestion(g, liars, pickers) {
    const answers = { truth: { text: 'truth', houseLie: false, realAnswer: true }, '-house1': { text: 'house', houseLie: true, realAnswer: false } };
    liars.forEach(pid => answers[pid] = lie('lie ' + pid));
    const answerSelections = {};
    pickers.forEach(pid => answerSelections[pid] = { text: 'truth' });
    return playedUpdate(Object.assign({}, g, { answers, answerSelections }));
}

test('question 1 waits for every seat, whoever has played', () => {
    const g = game(3, 0, S.ShowQuestion, { answers: { p1: lie('a'), p2: lie('b') } });
    assert.deepStrictEqual(seatsToWaitFor(g), ['p1', 'p2', 'p3']);
    assert.strictEqual(everyoneSent(g, g.answers), false, 'the lies wait for the third seat');
    assert.strictEqual(leftOutGuardWait(g, T), 0, 'nobody is left out, so no guard');

    const picks = game(3, 0, S.ShowAnswers, { answers: g.answers, answerSelections: { p1: { text: 'x' }, p2: { text: 'x' } } });
    assert.strictEqual(everyoneSent(picks, picks.answerSelections), false, 'the picks wait too');

    const reveal = game(3, 0, S.RevealTheTruth, { answers: g.answers, revealDone: { p1: true, p2: true } });
    assert.strictEqual(revealEndWait(reveal, T + 60000), undefined, 'and NEXT');
});

test('the flags are stored as the first question closes: who sent a lie or a pick', () => {
    const g = game(4, 0, S.ShowAnswers);
    // p1 lied and picked, p2 only lied, p3 only picked, p4 did nothing.
    assert.deepStrictEqual(closeQuestion(g, ['p1', 'p2'], ['p1', 'p3']), { played: { p1: true, p2: true, p3: true }, playedFrom: 0 });
    // Nobody played at all: the game is still marked, with no flag.
    assert.deepStrictEqual(closeQuestion(g, [], []), { played: {}, playedFrom: 0 });
    // House lies and the truth are not seats.
    assert.deepStrictEqual(Object.keys(closeQuestion(g, ['p1'], []).played), ['p1']);
});

test('a seat that never plays: from question 2 the lies, the picks and NEXT stop waiting for it', () => {
    const flags = closeQuestion(game(3, 0, S.ShowAnswers), ['p1', 'p2'], ['p1', 'p2']);

    const lies = game(3, 1, S.ShowQuestion, Object.assign({ answers: { p1: lie('a') } }, flags));
    assert.deepStrictEqual(seatsToWaitFor(lies), ['p1', 'p2']);
    assert.strictEqual(everyoneSent(lies, lies.answers), false, 'p2 is playing and has not sent');
    lies.answers.p2 = lie('b');
    assert.strictEqual(everyoneSent(lies, lies.answers), true, 'both who play have sent');

    const picks = game(3, 1, S.ShowAnswers, Object.assign({ answers: lies.answers, answerSelections: { p1: { text: 'b' }, p2: { text: 'a' } } }, flags));
    assert.strictEqual(everyoneSent(picks, picks.answerSelections), true);

    const reveal = game(3, 1, S.RevealTheTruth, Object.assign({ revealDone: { p1: true, p2: true } }, flags));
    assert.strictEqual(revealEndWait(reveal, T + 60000), 0);
    reveal.revealDone = { p1: true };
    assert.strictEqual(revealEndWait(reveal, T + 60000), undefined, 'p2 has not tapped');

    // The seat is still a seat: on the scoreboard, and in the flags of every later question as absent.
    assert.deepStrictEqual(closeQuestion(picks, ['p1', 'p2'], ['p1', 'p2']), { played: { p1: true, p2: true } });
    assert.ok(picks.players.p3);
});

test('no phase ends early in its first 10 seconds while a seat is left out', () => {
    const flags = { played: { p1: true, p2: true }, playedFrom: 0 };
    const lies = game(3, 1, S.ShowQuestion, Object.assign({ answers: { p1: lie('a'), p2: lie('b') } }, flags));
    assert.strictEqual(LEFT_OUT_GUARD_MS, 10000);
    assert.strictEqual(leftOutGuardWait(lies, T + 4000), 6000);
    assert.strictEqual(leftOutGuardWait(lies, T + 10000), 0);
    assert.strictEqual(endsAfterGuard(lies, T + 9999), false, 'still inside the guard');
    assert.strictEqual(endsAfterGuard(lies, T + 10000), true, 'the phase timer ends it when the guard is over');

    const waiting = game(3, 1, S.ShowQuestion, Object.assign({ answers: { p1: lie('a') } }, flags));
    assert.strictEqual(endsAfterGuard(waiting, T + 10000), false, 'p2 has not sent: the phase runs on');

    const picks = game(3, 1, S.ShowAnswers, Object.assign({ answerSelections: { p1: { text: 'x' }, p2: { text: 'x' } } }, flags));
    assert.strictEqual(endsAfterGuard(picks, T + 10000), true);
    assert.strictEqual(guardedPhase(S.RevealTheTruth), false, 'the reveal has its own check');

    // The reveal: NEXT taps wait for the guard too (here the last row was shown long before).
    const reveal = game(3, 1, S.RevealTheTruth, Object.assign({ revealDone: { p1: true, p2: true } }, flags));
    assert.strictEqual(revealEndWait(reveal, T + 7000), 3000);

    // A full table has no guard: it ends as soon as everyone is in, as before.
    const full = game(2, 1, S.ShowQuestion, Object.assign({ answers: { p1: lie('a'), p2: lie('b') } }, flags));
    assert.strictEqual(leftOutGuardWait(full, T + 1), 0);
    assert.strictEqual(everyoneSent(full, full.answers), true);
    assert.strictEqual(endsAfterGuard(full, T + 10000), false, 'nothing for the timer to do: the answer check ended it');
});

test('a seat that joins in late counts again from the moment it sends', () => {
    const flags = { played: { p1: true, p2: true }, playedFrom: 0 };

    // Question 3: the third seat writes a lie. It counts at once, in this very phase.
    const lies = game(3, 2, S.ShowQuestion, Object.assign({ answers: { p1: lie('a'), p2: lie('b') } }, flags));
    assert.strictEqual(everyoneSent(lies, lies.answers), true);
    assert.ok(leftOutGuardWait(lies, T + 2000) > 0);
    lies.answers.p3 = lie('c');
    assert.deepStrictEqual(seatsToWaitFor(lies), ['p1', 'p2', 'p3']);
    assert.strictEqual(leftOutGuardWait(lies, T + 2000), 0, 'nobody is left out any more: no guard');

    // Its picks are waited for in the same question, before any flag is stored.
    const picks = game(3, 2, S.ShowAnswers, Object.assign({ answers: lies.answers, answerSelections: { p1: { text: 'c' }, p2: { text: 'c' } } }, flags));
    assert.strictEqual(everyoneSent(picks, picks.answerSelections), false, 'the late seat has not picked yet');

    // And from then on for good, even on a question where it sends nothing.
    const stored = closeQuestion(game(3, 2, S.ShowAnswers, flags), ['p1', 'p2', 'p3'], ['p1', 'p2']);
    assert.deepStrictEqual(stored, { played: { p1: true, p2: true, p3: true } });
    const next = game(3, 3, S.ShowQuestion, Object.assign({ answers: { p1: lie('a'), p2: lie('b') } }, stored, { playedFrom: 0 }));
    assert.strictEqual(everyoneSent(next, next.answers), false);

    // A pick alone brings a seat back too.
    const byPick = game(3, 2, S.ShowAnswers, Object.assign({ answerSelections: { p3: { text: 'a' } } }, flags));
    assert.deepStrictEqual(seatsToWaitFor(byPick), ['p1', 'p2', 'p3']);
    // A NEXT tap is not a lie or a pick: it does not.
    const byNext = game(3, 2, S.RevealTheTruth, Object.assign({ revealDone: { p3: true } }, flags));
    assert.deepStrictEqual(seatsToWaitFor(byNext), ['p1', 'p2']);
});

test('a table of two with one empty seat: the one player moves it on alone, after the guard', () => {
    const flags = closeQuestion(game(2, 0, S.ShowAnswers), ['p1'], ['p1']);
    const lies = game(2, 1, S.ShowQuestion, Object.assign({ answers: { p1: lie('a') } }, flags));
    assert.strictEqual(everyoneSent(lies, lies.answers), true);
    assert.strictEqual(endsAfterGuard(lies, T + 3000), false);
    assert.strictEqual(endsAfterGuard(lies, T + 10000), true);
});

test('a game nobody plays runs on its clocks', () => {
    const flags = closeQuestion(game(3, 0, S.ShowAnswers), [], []);
    const lies = game(3, 1, S.ShowQuestion, flags);
    assert.deepStrictEqual(seatsToWaitFor(lies), []);
    assert.strictEqual(everyoneSent(lies, lies.answers), false);
    assert.strictEqual(endsAfterGuard(lies, T + 10000), false);
    const reveal = game(3, 1, S.RevealTheTruth, Object.assign({ revealDone: {} }, flags));
    assert.strictEqual(revealEndWait(reveal, T + 60000), undefined);
});

test('a rematch that copied a dead seat starts with no flags, and drops the seat from its question 2', () => {
    // Replay copies the players and nothing else of this (fork.ts builds the game field by field).
    // p4 played the game before and went home: it must not carry a flag over.
    const rematch = game(4, 0, S.ShowQuestion);
    assert.strictEqual(rematch.played, undefined);
    assert.deepStrictEqual(seatsToWaitFor(rematch), ['p1', 'p2', 'p3', 'p4'], 'question 1 waits for the dead seat once');
    const flags = closeQuestion(rematch, ['p1', 'p2', 'p3'], ['p1', 'p2', 'p3']);
    const second = game(4, 1, S.ShowQuestion, Object.assign({ answers: { p1: lie('a'), p2: lie('b'), p3: lie('c') } }, flags));
    assert.deepStrictEqual(seatsToWaitFor(second), ['p1', 'p2', 'p3']);
    assert.strictEqual(endsAfterGuard(second, T + 10000), true);
});

test('a game that was running when this was released has no flags and plays as before', () => {
    // Question 4 of a game started by the old functions: no played, no playedFrom.
    const old = game(3, 3, S.ShowQuestion, { answers: { p1: lie('a'), p2: lie('b') } });
    assert.deepStrictEqual(seatsToWaitFor(old), ['p1', 'p2', 'p3']);
    assert.strictEqual(everyoneSent(old, old.answers), false, 'every seat is waited for');
    assert.strictEqual(leftOutGuardWait(old, T), 0);
    assert.strictEqual(endsAfterGuard(old, T + 10000), false);
    old.answers.p3 = lie('c');
    assert.strictEqual(everyoneSent(old, old.answers), true, 'and a full table still ends early');

    // The new functions store nothing for it, so it stays that way to its last question.
    assert.deepStrictEqual(closeQuestion(old, ['p1', 'p2'], ['p1', 'p2']), {});
    const reveal = game(3, 3, S.RevealTheTruth, { revealDone: { p1: true, p2: true } });
    assert.strictEqual(revealEndWait(reveal, T + 60000), undefined);
});

test('odd input never throws', () => {
    assert.deepStrictEqual(seatsToWaitFor(null), []);
    assert.strictEqual(everyoneSent(null, null), false);
    assert.strictEqual(leftOutGuardWait(null, T), 0);
    assert.strictEqual(endsAfterGuard(null, T), false);
    assert.strictEqual(everyoneSent({ state: { id: 3, timestamp: T } }, {}), false, 'no seats');
});
