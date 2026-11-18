// Unit tests for the host's controls (controllers/host-controls.ts): hide a lie, remove a player, and
// what they change in the writing's early end (seats.ts), the answers (tick.ts) and the picks that score.
// Run with: npm test.
const test = require('node:test');
const assert = require('node:assert');
const hc = require('../dist/controllers/host-controls');
const { everyoneSent } = require('../dist/controllers/seats');
const { scoreQuestion } = require('../dist/controllers/scoring');

const S = { GameStaging: 0, RoundIntro: 1, ShowQuestion: 2, ShowAnswers: 3, RevealTheTruth: 4, ScoreBoard: 5, ScoreBoardFinal: 6 };
const KEY = 'K'.repeat(24);

function game(stateId, extra) {
    return Object.assign({
        hostKey: KEY,
        state: { id: stateId, timestamp: 1000 },
        questionIndex: 1, roundIndex: 0, totalQ: 5,
        players: {
            host: { nickname: 'Dana', score: 0, uid: 'u-host', host: true },
            ben: { nickname: 'Ben', score: 500, uid: 'u-ben' },
            troll: { nickname: 'Troll', score: 0, uid: 'u-troll' },
        },
        answers: {
            host: { text: 'dana lie', houseLie: false, realAnswer: false },
            ben: { text: 'ben lie', houseLie: false, realAnswer: false },
            troll: { text: 'something crude', houseLie: false, realAnswer: false },
        },
    }, extra);
}

test('only the game\'s host key opens the controls', () => {
    assert.strictEqual(hc.isHostKey(game(S.ShowQuestion), KEY), true);
    assert.strictEqual(hc.isHostKey(game(S.ShowQuestion), 'X'.repeat(24)), false);
    assert.strictEqual(hc.isHostKey(game(S.ShowQuestion), undefined), false);
    assert.strictEqual(hc.isHostKey(game(S.ShowQuestion, { hostKey: undefined }), undefined), false);
    assert.strictEqual(hc.isHostKey(null, KEY), false);
});

test('the host sees the other players\' lies while they are written, never their own, never names', () => {
    const lies = hc.liesForHost(game(S.ShowQuestion));
    assert.deepStrictEqual(lies.map(l => l.text), ['ben lie', 'something crude']);
    assert.ok(lies.every(l => Object.keys(l).sort().join() === 'hidden,id,text'));
    assert.deepStrictEqual(hc.liesForHost(game(S.ShowAnswers)), [], 'nothing once the answers are out');
    // A big-screen host has no seat: every lie is listed.
    const screen = game(S.ShowQuestion);
    delete screen.players.host.host;
    assert.strictEqual(hc.liesForHost(screen).length, 3);
});

test('while the host looks at the lies, the last lie does not end the writing; the picks are not held', () => {
    const g = game(S.ShowQuestion);
    assert.strictEqual(everyoneSent(g, g.answers), true);
    g.checking = { q: 1, pid: 'host' };
    assert.strictEqual(hc.hostChecking(g), true);
    assert.strictEqual(everyoneSent(g, g.answers), false);
    // A look at an earlier question holds nothing.
    g.checking = { q: 0, pid: 'host' };
    assert.strictEqual(everyoneSent(g, g.answers), true);
    // The picks: the hold is for the writing only.
    const picks = game(S.ShowAnswers, { checking: { q: 1, pid: 'host' } });
    assert.strictEqual(hc.hostChecking(picks), false);
    assert.strictEqual(everyoneSent(picks, { host: 1, ben: 1, troll: 1 }), true);
});

test('a hidden lie is left out of this question\'s answers only', () => {
    const g = game(S.ShowQuestion, { hidden: { troll: 1, ben: 0 } });
    assert.deepStrictEqual(Object.keys(hc.withoutHidden(g.answers, g)).sort(), ['ben', 'host']);
    assert.strictEqual(hc.liesForHost(g).find(l => l.id === 'troll').hidden, true);
    assert.strictEqual(hc.liesForHost(g).find(l => l.id === 'ben').hidden, false, 'hidden on another question');
    assert.deepStrictEqual(hc.withoutHidden(null, g), {});
});

test('a hidden lie scores nothing and nobody can pick it; the host who read the lies scores no pick', () => {
    const g = game(S.ShowAnswers, { checking: { q: 1, pid: 'host' }, hidden: { troll: 1 } });
    g.answers = Object.assign(hc.withoutHidden(g.answers, g), {
        truth: { text: 'the truth', houseLie: false, realAnswer: true },
        h1: { text: 'house one', houseLie: true, realAnswer: false },
    });
    g.answerSelections = {
        host: { text: 'the truth' },
        ben: { text: 'dana lie' },
        troll: { text: 'the truth' },
    };
    const scored = scoreQuestion(Object.assign({}, g, { answerSelections: hc.picksToScore(g.answerSelections, g) }));
    assert.strictEqual(scored.answerSelections.host, undefined, 'the host\'s pick does not count');
    assert.strictEqual(scored.answerSelections.troll.score, 1000);
    assert.strictEqual(scored.answers.host.score, 500, 'the host\'s own lie still scores');
    assert.strictEqual(scored.answers.troll, undefined);
    assert.ok(!scored.revealAnswers.some(r => r.text === 'something crude'));
    // Without a look, the host's pick counts as usual.
    assert.deepStrictEqual(hc.picksToScore(g.answerSelections, Object.assign({}, g, { checking: null })), g.answerSelections);
    assert.deepStrictEqual(hc.picksToScore(g.answerSelections, Object.assign({}, g, { checking: { q: 1, pid: null } })), g.answerSelections);
});

test('remove a player: the seat goes, its browser and seat are kept out, the host\'s own seat stays', () => {
    let n = 0;
    const key = () => `new${n++}`;
    const { update } = hc.removeUpdate(game(S.ShowQuestion), 'troll', 5000, key);
    assert.strictEqual(update['players/troll'], null);
    assert.strictEqual(update['answers/troll'], null);
    assert.deepStrictEqual(update['removed/troll'], { uid: 'u-troll', nickname: 'Troll', at: 5000 });
    assert.ok(!Object.keys(update).some(p => p.startsWith('answers/new')), 'no house lie while the lies are written');

    assert.strictEqual(hc.removeUpdate(game(S.ShowQuestion), 'host', 1, key).error.code, 'OWN_SEAT');
    assert.strictEqual(hc.removeUpdate(game(S.ShowQuestion), 'nobody', 1, key).error.code, 'NOT_A_PLAYER');
    assert.strictEqual(hc.removeUpdate(game(S.ScoreBoardFinal), 'troll', 1, key).error.code, 'GAME_OVER');
});

test('a seat removed while the answers are on the screens leaves its lie there as a house lie', () => {
    const { update } = hc.removeUpdate(game(S.ShowAnswers), 'troll', 1, () => 'k1');
    assert.strictEqual(update['answers/troll'], null);
    assert.deepStrictEqual(update['answers/k1'], { text: 'something crude', houseLie: true, realAnswer: false });
    assert.strictEqual(update['answerSelections/troll'], null);
});

test('a lobby that drops below five forgets when it was full', () => {
    const g = game(S.GameStaging, { fullSince: 123, answers: null });
    ['p4', 'p5'].forEach(p => g.players[p] = { nickname: p, score: 0, uid: p });
    assert.strictEqual(hc.removeUpdate(g, 'troll', 1, () => 'k', 5).update.fullSince, null);
    g.players.p6 = { nickname: 'p6', score: 0, uid: 'p6' };
    assert.ok(!('fullSince' in hc.removeUpdate(g, 'troll', 1, () => 'k', 5).update));
});

test('a removed browser can\'t join again, by its sign-in or its seat; anyone else can', () => {
    const g = game(S.ShowQuestion, { removed: { troll: { uid: 'u-troll', nickname: 'Troll', at: 1 } } });
    assert.strictEqual(hc.removedJoin(g, 'u-troll', null).code, 'REMOVED');
    assert.strictEqual(hc.removedJoin(g, null, 'troll').code, 'REMOVED');
    assert.strictEqual(hc.removedJoin(g, 'u-new', 'other'), null);
    assert.strictEqual(hc.removedJoin(game(S.ShowQuestion), 'u-troll', 'troll'), null);
    // A seat removed with no sign-in (uid null) never blocks a browser without one.
    const noUid = game(S.ShowQuestion, { removed: { troll: { uid: null, at: 1 } } });
    assert.strictEqual(hc.removedJoin(noUid, null, null), null);
    assert.strictEqual(hc.removedJoin(noUid, '', 'x'), null);
});
