// The staged reveal ("big reveal"): the per-game 50/50 flag, the shared timing, the scores folded
// into the reveal, and what an older client and a game already in play see of it.
// Runs the compiled functions (dist/) with a fake Firebase and BigQuery: npm test.
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');
const fs = require('fs');

// ---- fakes, so fork.js loads without a Firebase project ----
const noRef = { child: () => noRef, once: async () => ({ val: () => null }), set: async () => undefined, update: async () => undefined };
const fakeFirebase = {
    gamesRef: noRef, qHistoryRef: noRef, gameCounterRef: noRef, questionsRef: noRef, seenQuestionsRef: noRef, crewsRef: noRef,
    get: async () => null,
};
const realLoad = Module._load;
Module._load = function (request) {
    if (request === '@google-cloud/bigquery') return { BigQuery: class { dataset() { return { table: () => ({ insert: async () => undefined }) }; } } };
    if (/[\\/]firebase$/.test(request)) return fakeFirebase;
    return realLoad.apply(this, arguments);
};

const dist = path.join(__dirname, '..', 'dist');
const model = require(path.join(dist, 'game-model'));
const { drawBigReveal, stagedHalf } = require(path.join(dist, 'controllers', 'big-reveal'));
const { generateGameName } = require(path.join(dist, 'controllers', 'new-game'));
const crypto = require('crypto');
// The halves of six PINs, as BigQuery itself gave them for the rule below (read 2026-11-12).
const KNOWN_HALVES = [false, false, true, false, false, true];
const { pickCoach, questionResult } = require(path.join(dist, 'controllers', 'lie-helper'));
const phase = require(path.join(dist, 'controllers', 'phase'));
const scoring = require(path.join(dist, 'controllers', 'scoring'));
const { createFork } = require(path.join(dist, 'controllers', 'fork'));
const { cleanShare } = require(path.join(dist, 'controllers', 'analytics'));

const S = { RevealTheTruth: 4, ScoreBoard: 5 };
const { revealSchedule, revealMoment, revealRowStart, revealScoreChanges, revealStandings, stagedRevealTiming, revealTiming } = model;

function rowsOf(n) {
    return Array.from({ length: n }, (_, i) => ({ text: 't' + i, selectors: ['p'], creators: [''], realAnswer: i === n - 1, houseLie: false, points: 0 }));
}

// ---------------------------------------------------------------------------- the flag

// PINs as the server gives them: a counter, in letters.
const pinAt = i => generateGameName(250000 + i);
// A PIN of each half.
const stagedPin = Array.from({ length: 50 }, (_, i) => pinAt(i)).filter(p => stagedHalf(p))[0];
const ordinaryPin = Array.from({ length: 50 }, (_, i) => pinAt(i)).filter(p => !stagedHalf(p))[0];

test('a game is in the test only when its client can show the staged reveal', () => {
    [stagedPin, ordinaryPin].forEach(pin => {
        assert.strictEqual(drawBigReveal(false, pin), undefined);
        assert.strictEqual(drawBigReveal(undefined, pin), undefined);
        assert.strictEqual(drawBigReveal('true', pin), undefined, 'only a real true counts');
    });
    assert.strictEqual(drawBigReveal(true, stagedPin), true);
    assert.strictEqual(drawBigReveal(true, ordinaryPin), false);
});

test('a game\'s half follows from its PIN alone, so it can be read wherever the PIN is', () => {
    // The rule the saved BigQuery queries use: the lowest bit of the first byte of SHA-256('big-reveal:' + PIN).
    for (let i = 0; i < 500; i++) {
        const pin = pinAt(i);
        const byte = crypto.createHash('sha256').update('big-reveal:' + pin).digest()[0];
        assert.strictEqual(stagedHalf(pin), byte % 2 === 1, pin);
        assert.strictEqual(stagedHalf(pin), stagedHalf(pin.toLowerCase()), 'capitals or not');
    }
    // Fixed values, read the same way in BigQuery (functions/bigquery/2026-11-big-reveal.sql).
    assert.deepStrictEqual(['QQQQ', 'ABCD', 'JVQP', 'JVRQ', 'JVRR', 'TEST'].map(stagedHalf), KNOWN_HALVES);
    const sql = fs.readFileSync(path.join(__dirname, '..', 'bigquery', '2026-11-big-reveal.sql'), 'utf8');
    assert.ok(sql.includes("MOD(TO_CODE_POINTS(SHA256(CONCAT('big-reveal:', UPPER(o.id))))[OFFSET(0)], 2) = 1"), 'the saved queries use the same rule');
});

test('half of the games in the test get the staged reveal, also among PINs given one after another', () => {
    let on = 0;
    let runs = 0;
    for (let i = 0; i < 4000; i++) {
        if (drawBigReveal(true, pinAt(i))) on++;
        if (i && stagedHalf(pinAt(i)) === stagedHalf(pinAt(i - 1))) runs++;
    }
    assert.ok(on > 1850 && on < 2150, `${on} of 4000`);
    // A game and the next one made (a Replay, often) share a half about half the time: no pattern.
    assert.ok(runs > 1850 && runs < 2150, `${runs} of 3999 neighbours alike`);
});

test('the staged reveal keeps its own 50/50 now that every game has the lie helper', () => {
    const cells = { tt: 0, tf: 0, ft: 0, ff: 0 };
    for (let i = 0; i < 8000; i++) {
        // The lie helper is on for every game; the staged half still follows from the PIN alone.
        const coach = pickCoach();
        const big = drawBigReveal(true, pinAt(i));
        cells[(coach ? 't' : 'f') + (big ? 't' : 'f')]++;
    }
    assert.strictEqual(cells.ft + cells.ff, 0, 'no game without the helper');
    assert.ok(cells.tt > 3700 && cells.tt < 4300, `staged: ${cells.tt} of 8000`);
    assert.ok(cells.tf > 3700 && cells.tf < 4300, `plain: ${cells.tf} of 8000`);
});

test('the usage rows carry no column for the test: the PIN is enough', () => {
    const game = { questionIndex: 1, roundIndex: 0, totalQ: 5, locale: 'en', players: { a: {} } };
    assert.strictEqual('big_reveal' in questionResult(stagedPin, Object.assign({ bigReveal: true }, game)), false);
    assert.strictEqual(questionResult(stagedPin, game).id, stagedPin);
});

test('Replay gets the half of its own new PIN, and only for a phone that can show it', () => {
    const parent = { locale: 'en', totalQ: 5, presenter: false, players: { a: { nickname: 'A', score: 500, uid: 'u' } }, bigReveal: true };
    const ordinary = createFork('AAAA', parent, ['q'], 'u', 'a', undefined, true, ordinaryPin);
    assert.strictEqual(ordinary.bigReveal, false, 'its own half, not the parent\'s');
    assert.strictEqual('staged' in ordinary.state, false);
    const staged = createFork('AAAA', parent, ['q'], 'u', 'a', undefined, true, stagedPin);
    assert.strictEqual(staged.bigReveal, true);
    assert.strictEqual(staged.state.staged, true, 'phones read it from the lobby on');
    const old = createFork('AAAA', parent, ['q'], 'u', 'a', undefined, false, stagedPin);
    assert.strictEqual('bigReveal' in old, false, 'an older phone pressed Replay: not in the test');
    assert.strictEqual('staged' in old.state, false);
});

test('phones read the flag from the game\'s state, under the rules as they are', () => {
    // No rule of its own: the state is readable by every phone and written by the server alone.
    const rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'database-rules.json'), 'utf8'));
    assert.deepStrictEqual(rules.rules.games.$pin.state, { '.read': 'true', '.write': "auth.uid == 'bl-service-worker'" });
    assert.strictEqual('bigReveal' in rules.rules.games.$pin, false);

    // Every state the server writes for a staged game says so; no other game's state does.
    [0, 1, 2, 3, 4, 5, 6].forEach(id => {
        const state = { id, timestamp: 1000 };
        assert.strictEqual(phase.withDeadline(state, { bigReveal: true }).staged, true, `state ${id}`);
        [{}, { bigReveal: false }, { bigReveal: null }, { bigReveal: 'true' }, { bigReveal: 1 }].forEach(flag =>
            assert.strictEqual('staged' in phase.withDeadline(state, flag), false, `state ${id} ${JSON.stringify(flag)}`));
    });
    // The key that names a phase does not change with it, so old and new functions still agree on a phase.
    assert.strictEqual(phase.stateKey(phase.withDeadline({ id: 4, timestamp: 1000 }, { bigReveal: true })), '4:1000');
});

test('mute taps are counted, and nothing else under "sound"', () => {
    assert.deepStrictEqual(cleanShare({ content_type: 'sound', method: 'mute', locale: 'he' }),
        { content_type: 'sound', method: 'mute', crew_id: null, locale: 'he', uid: null });
    assert.ok(cleanShare({ content_type: 'sound', method: 'unmute' }));
    assert.strictEqual(cleanShare({ content_type: 'sound', method: 'whatsapp' }), null);
});

// ---------------------------------------------------------------------------- the timing

test('a staged reveal on phones: 2.4 s a row, a beat before the truth, 3.5 s for the result and scores', () => {
    const three = rowsOf(3);
    const s = revealSchedule(three, false, true);
    assert.strictEqual(s.step, 2400);
    assert.strictEqual(s.allShown, 2 * 2400 + 1200 + 1400);
    assert.strictEqual(s.duration, s.allShown + 3500);
    assert.strictEqual(phase.phaseDuration(S.RevealTheTruth, { revealAnswers: three, bigReveal: true }), s.duration);
    assert.strictEqual(phase.phaseDuration(S.RevealTheTruth, { revealAnswers: three, bigReveal: true, presenter: true }),
        2 * 4500 + 2000 + 2600 + 5500);
});

test('games outside the staged arm keep today\'s reveal and scoreboard to the millisecond', () => {
    [{}, { bigReveal: false }, { bigReveal: null }, { bigReveal: 'true' }, { bigReveal: 1 }].forEach(flag => {
        const game = Object.assign({ revealAnswers: rowsOf(3) }, flag);
        assert.strictEqual(phase.phaseDuration(S.RevealTheTruth, game), 3 * 1600 - 800 + 3000, JSON.stringify(flag));
        assert.strictEqual(phase.phaseDuration(S.RevealTheTruth, Object.assign({ presenter: true }, game)), 3 * 4500 - 2250 + 3000);
        assert.strictEqual(phase.phaseDuration(S.ScoreBoard, game), 3000);
        assert.strictEqual(phase.withDeadline({ id: S.ScoreBoard, timestamp: 1000 }, game).deadline, 4000);
    });
});

test('a staged game has a scoreboard phase of no length, which the server leaves at once', () => {
    const state = phase.withDeadline({ id: S.ScoreBoard, timestamp: 1000 }, { bigReveal: true });
    assert.strictEqual(state.deadline, 1000);
    assert.strictEqual(phase.endsAtOnce(state), true);
    assert.strictEqual(phase.endsAtOnce(phase.withDeadline({ id: S.ScoreBoard, timestamp: 1000 }, {})), false);
    assert.strictEqual(phase.endsAtOnce({ id: 0, timestamp: 1000 }), false, 'the lobby has no deadline');
    assert.strictEqual(phase.endsAtOnce(null), false);
    // A phone's tick for that phase is accepted at once too (a phone on an older build sends one).
    assert.strictEqual(phase.tickAllowed({ state }, '5:1000', 1000), true);
});

test('a question stays about as long: within 1 s of today for 1 to 3 rows, at most 2.5 s more for 5', () => {
    // Today: the reveal, then 3 s of scoreboard. Staged: the reveal alone, with the scores in it.
    for (let n = 1; n <= 5; n++) {
        const today = revealSchedule(rowsOf(n), false).duration + 3000;
        const staged = revealSchedule(rowsOf(n), false, true).duration;
        const limit = n <= 3 ? 1000 : 2500;
        assert.ok(Math.abs(staged - today) <= limit, `${n} rows: today ${today}, staged ${staged}`);
    }
});

test('the longest staged reveal (8 lies and the truth, on a big screen) fits the server timer', () => {
    assert.ok(phase.phaseDuration(S.RevealTheTruth, { revealAnswers: rowsOf(9), presenter: true, bigReveal: true }) <= phase.maxPhaseDuration);
    assert.ok(phase.phaseDuration(S.RevealTheTruth, { revealAnswers: rowsOf(9), presenter: true }) <= phase.maxPhaseDuration);
});

test('NEXT ends a staged reveal only after its own last row', () => {
    const game = {
        state: { id: S.RevealTheTruth, timestamp: 1000 }, players: { p1: {}, p2: {} }, revealAnswers: rowsOf(3),
        revealDone: { p1: true, p2: true }, bigReveal: true,
    };
    const allShownAt = 1000 + revealSchedule(game.revealAnswers, false, true).allShown;
    assert.strictEqual(phase.revealDoneWait(game, allShownAt), 0);
    assert.strictEqual(phase.revealDoneWait(game, 1000), allShownAt - 1500 - 1000);
});

// ---------------------------------------------------------------------------- old and new together

test('an older client (which knows no third argument) computes today\'s timetable', () => {
    for (let n = 1; n <= 9; n++) {
        [false, true].forEach(presenter => {
            const old = revealSchedule(rowsOf(n), presenter);
            const timing = presenter ? revealTiming.presenter : revealTiming.phones;
            assert.strictEqual(old.step, timing.step);
            assert.strictEqual(old.allShown, n * timing.step - timing.step / 2);
            assert.strictEqual(old.duration, old.allShown + timing.hold);
            assert.strictEqual(old.staged, false);
        });
    }
});

test('an older client in a staged game has shown every row before the server ends the reveal', () => {
    for (let n = 1; n <= 9; n++) {
        [false, true].forEach(presenter => {
            const old = revealSchedule(rowsOf(n), presenter);
            const server = revealSchedule(rowsOf(n), presenter, true);
            assert.ok(old.allShown <= server.allShown, `${n} rows, big screen ${presenter}: NEXT would show before the last row could be over`);
            assert.ok(old.duration <= server.duration, `${n} rows, big screen ${presenter}: rows cut off`);
        });
    }
});

test('today\'s reveal, moment by moment, is what the client showed before', () => {
    [false, true].forEach(presenter => {
        for (let n = 1; n <= 9; n++) {
            const schedule = revealSchedule(rowsOf(n), presenter);
            for (let elapsed = 0; elapsed <= schedule.duration; elapsed += 50) {
                const m = revealMoment(schedule, elapsed);
                // The formulas of the reveal page before this change.
                assert.strictEqual(m.visibleRows, Math.min(n, Math.floor(elapsed / schedule.step) + 1), `${n} rows at ${elapsed}`);
                assert.strictEqual(m.writersShown, Math.min(n, Math.floor((elapsed + schedule.step / 2) / schedule.step)));
                assert.strictEqual(m.pickersShown, m.visibleRows, 'pickers arrive with the row');
                assert.strictEqual(m.allShown, elapsed >= schedule.allShown);
                assert.strictEqual(m.truthIntro, false);
            }
        }
    });
});

test('a staged reveal, beat by beat: the answer, who picked it, who wrote it; a beat before the truth', () => {
    const t = stagedRevealTiming.phones;
    const schedule = revealSchedule(rowsOf(3), false, true);
    const at = ms => revealMoment(schedule, ms);
    assert.deepStrictEqual(at(0), { visibleRows: 1, pickersShown: 0, writersShown: 0, truthIntro: false, allShown: false });
    assert.strictEqual(at(t.pickersAt - 1).pickersShown, 0);
    assert.deepStrictEqual(at(t.pickersAt), { visibleRows: 1, pickersShown: 1, writersShown: 0, truthIntro: false, allShown: false });
    assert.strictEqual(at(t.writerAt).writersShown, 1);
    assert.strictEqual(at(t.step).visibleRows, 2);
    // "And the truth is…": the truth row is not there yet.
    assert.deepStrictEqual(at(2 * t.step), { visibleRows: 2, pickersShown: 2, writersShown: 2, truthIntro: true, allShown: false });
    assert.strictEqual(at(2 * t.step + t.truthIntro - 1).visibleRows, 2);
    assert.deepStrictEqual(at(2 * t.step + t.truthIntro), { visibleRows: 3, pickersShown: 2, writersShown: 2, truthIntro: false, allShown: false });
    assert.strictEqual(revealRowStart(schedule, 2), 2 * t.step + t.truthIntro);
    assert.strictEqual(revealRowStart(schedule, 1), t.step);
    assert.deepStrictEqual(at(schedule.allShown), { visibleRows: 3, pickersShown: 3, writersShown: 3, truthIntro: false, allShown: true });
    // The truth alone (nobody picked a lie): the beat, then the row.
    const one = revealSchedule(rowsOf(1), false, true);
    assert.strictEqual(revealMoment(one, 0).truthIntro, true);
    assert.strictEqual(revealMoment(one, t.truthIntro).visibleRows, 1);
});

// ---------------------------------------------------------------------------- the scores

function playedQuestion(strayPicks) {
    // a and b wrote the same lie; c wrote another; d wrote none. Round 2 (750 a fooled friend, 1500 the truth).
    const game = {
        roundIndex: 1,
        players: {
            a: { nickname: 'Alice', score: 1000, uid: 'ua' }, b: { nickname: 'Ben', score: 200, uid: 'ub' },
            c: { nickname: 'Chen', score: 0, uid: 'uc' }, d: { nickname: 'Dana', score: 1000, uid: 'ud' },
        },
        answers: {
            a: { text: 'a goat', houseLie: false, realAnswer: false }, b: { text: 'a goat', houseLie: false, realAnswer: false },
            c: { text: 'paperclips', houseLie: false, realAnswer: false },
            h1: { text: 'soup', houseLie: true, realAnswer: false }, truth: { text: 'pills', houseLie: false, realAnswer: true },
        },
        answerSelections: Object.assign({
            a: { text: 'soup' },        // falls for the house: loses points
            b: { text: 'pills' },       // finds the truth
            c: { text: 'soup' },        // falls for the house with nothing to lose
            d: { text: 'a goat' },      // fooled by a and b
        }, strayPicks || {}),
    };
    const before = JSON.parse(JSON.stringify(game.players));
    // As tick.ts does when picking closes: the points, the picks that count and the reveal rows.
    Object.assign(game, scoring.scoreQuestion(game));
    return { game, before };
}

test('the changes a phone works out from the reveal rows are the ones the server adds', () => {
    const { game, before } = playedQuestion();
    const changes = revealScoreChanges(game.revealAnswers);
    const after = scoring.addQuestionScores(game);
    Object.keys(before).forEach(pid =>
        assert.strictEqual(before[pid].score + (changes[pid] || 0), after[pid].score, `${pid}: ${JSON.stringify(changes)}`));
    assert.strictEqual(changes.a + changes.b + changes.d !== 0, true);
    assert.strictEqual(changes.b, 750 + 1500, 'a fooled friend and the truth');
    assert.ok(changes.a < 750, 'the house took points back');
    assert.strictEqual(changes.c || 0, 0, 'nothing to lose');
    assert.deepStrictEqual(revealScoreChanges(null), {});
});

test('picks that are no player\'s change no reveal row, no score change on a phone and no total', () => {
    const clean = playedQuestion();
    const { game, before } = playedQuestion({
        ghost: { text: 'pills' },                       // an id that is no player's, on the truth
        constructor: { text: 'paperclips' },            // an id that every object has, on a player's lie
        '-Nstray': { text: 'soup', score: 999999 },     // on the house lie, carrying its own points
        nobody: 'pills',                                // not shaped like a pick
    });

    assert.deepStrictEqual(game.revealAnswers, clean.game.revealAnswers, 'the rows a staged reveal plays are the same');
    assert.deepStrictEqual(Object.keys(game.answerSelections).sort(), ['a', 'b', 'c', 'd'], 'only the players\' picks are kept');
    const ids = [].concat(...game.revealAnswers.map(row => row.selectors.concat(Object.keys(row.pointsBy || {}))));
    assert.deepStrictEqual(ids.filter(pid => !before[pid]), [], 'no row names an id that is no player\'s');

    const changes = revealScoreChanges(game.revealAnswers);
    assert.deepStrictEqual(changes, revealScoreChanges(clean.game.revealAnswers));
    const after = scoring.addQuestionScores(game);
    assert.deepStrictEqual(after, scoring.addQuestionScores(clean.game));
    Object.keys(before).forEach(pid => assert.strictEqual(before[pid].score + (changes[pid] || 0), after[pid].score, pid));
    // The folded scoreboard of the staged reveal: only the four players, before and after.
    const standings = revealStandings(before, changes);
    assert.deepStrictEqual(standings.map(p => p.nickname).sort(), ['Alice', 'Ben', 'Chen', 'Dana']);
    standings.forEach(p => assert.strictEqual(p.after, after[p.pid].score));
});

test('the folded scoreboard: before, change, after, places and the order on screen', () => {
    const players = {
        a: { nickname: 'Alice', score: 1000 }, b: { nickname: 'Ben', score: 500 }, c: { nickname: 'Chen', score: 500 },
    };
    const s = revealStandings(players, { c: 1000, a: -250 });
    assert.deepStrictEqual(s.map(p => p.nickname), ['Chen', 'Alice', 'Ben'], 'in the new order');
    const chen = s[0], alice = s[1], ben = s[2];
    assert.deepStrictEqual([chen.before, chen.change, chen.after, chen.placeBefore, chen.placeAfter, chen.rowBefore, chen.rowAfter, chen.seat],
        [500, 1000, 1500, 2, 1, 2, 0, 2]);
    assert.deepStrictEqual([alice.before, alice.change, alice.after, alice.placeBefore, alice.placeAfter, alice.rowBefore, alice.rowAfter],
        [1000, -250, 750, 1, 2, 0, 1]);
    assert.deepStrictEqual([ben.change, ben.placeBefore, ben.placeAfter, ben.rowBefore, ben.rowAfter], [0, 2, 3, 1, 2]);
    // A phone that read the scores after the server added the question gets the same picture.
    const added = { a: { nickname: 'Alice', score: 750 }, b: { nickname: 'Ben', score: 500 }, c: { nickname: 'Chen', score: 1500 } };
    assert.deepStrictEqual(revealStandings(added, { c: 1000, a: -250 }, true), s);
    assert.deepStrictEqual(revealStandings(null, {}), []);
});

test('every Replay gets the lie helper, whatever the parent had', () => {
    const base = { locale: 'he', totalQ: 5, presenter: false, players: { a: { nickname: 'A', score: 500, uid: 'u' } } };
    [true, false, undefined].forEach(parentCoach => {
        const parent = Object.assign({}, base, parentCoach === undefined ? {} : { coach: parentCoach });
        const forked = createFork('AAAA', parent, ['q'], 'u', 'a', undefined, true, stagedPin);
        assert.strictEqual(forked.coach, true, `parent coach ${parentCoach}`);
    });
});
