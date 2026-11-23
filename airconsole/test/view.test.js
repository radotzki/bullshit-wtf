// The AirConsole version's rules: the tag, the new game it asks for, what it shares with the
// controllers, the lobby, the picks, the reveal, the scores. Run: cd airconsole && npm test
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./bundle');

let V;
let M;
test.before(async () => {
    V = await load('src/view.js');
    M = await load('../game-model.ts');
});

const t = {
    needMore: n => `needs ${n}`,
    masterStarts: name => `${name} starts`,
};

test('the tag is portal-airconsole, a campaign the server keeps and never a test', () => {
    assert.strictEqual(V.AIRCONSOLE_TAG, 'portal-airconsole');
    assert.strictEqual(M.cleanCampaign(V.AIRCONSOLE_TAG), 'portal-airconsole');
    assert.strictEqual(M.isTestCampaign(V.AIRCONSOLE_TAG), false);
});

test('the new game: tagged, started by the screen, three rounds, no test draws it cannot show', () => {
    const body = V.newGameBody('he', 'uid1', 'K'.repeat(24), 120);
    assert.strictEqual(body.campaign, 'portal-airconsole');
    assert.strictEqual(body.locale, 'he');
    assert.strictEqual(body.count, 5);
    assert.strictEqual(body.serverStart, true);
    assert.strictEqual(body.stagedReveal, false);
    assert.strictEqual(body.aboutUs, false);
    assert.strictEqual(body.uid, 'uid1');
    assert.strictEqual(V.newGameBody('fr').locale, 'en');
    // The server keeps the arrival page, so opened_games can tell AirConsole hosts apart.
    assert.deepStrictEqual(M.cleanArrival(body.arrival), { page: '/portal/airconsole' });
});

test('a host key the server accepts', () => {
    for (let i = 0; i < 20; i++) {
        assert.match(V.newHostKey(), /^[A-Za-z0-9_-]{16,64}$/);
    }
    assert.notStrictEqual(V.newHostKey(), V.newHostKey());
});

test('the game speaks Hebrew for every Hebrew language tag, else English', () => {
    ['he', 'he-IL', 'HE', 'iw', 'iw-IL', 'he_IL'].forEach(tag => assert.strictEqual(V.localeFor(tag), 'he', tag));
    ['en', 'en-US', 'de', '', undefined, null, 'hel', 'iwx'].forEach(tag => assert.strictEqual(V.localeFor(tag), 'en', String(tag)));
});

test('the lobby says how many players are missing, then who starts', () => {
    assert.strictEqual(V.lobbyLine(0, 'Ana', t), 'needs 2');
    assert.strictEqual(V.lobbyLine(1, 'Ana', t), 'needs 1');
    assert.strictEqual(V.lobbyLine(2, 'Ana', t), 'Ana starts');
    assert.strictEqual(V.lobbyLine(3, '', t), '');
});

const players = {
    '-a': { nickname: 'Ana', score: 1500, uid: 'u1' },
    '-b': { nickname: 'Ben', score: 3000, uid: 'u2' },
    '-c': { nickname: 'Cleo', score: 1500, uid: 'u3' },
    '-d': null,
};

test('seats keep the server order and the picture of their place', () => {
    assert.deepStrictEqual(V.seats(players).map(s => [s.nickname, s.avatar, s.score]), [['Ana', 0, 1500], ['Ben', 1, 3000], ['Cleo', 2, 1500]]);
    const many = {};
    for (let i = 0; i < 13; i++) many[`-p${String(i).padStart(2, '0')}`] = { nickname: `P${i}`, score: 0 };
    assert.strictEqual(V.seats(many)[12].avatar, 0);
});

test('the ranking shares a place on equal scores; the winners are everyone on top', () => {
    assert.deepStrictEqual(V.ranking(players).map(p => [p.nickname, p.place]), [['Ben', 1], ['Ana', 2], ['Cleo', 2]]);
    assert.deepStrictEqual(V.winners(players).map(p => p.nickname), ['Ben']);
    assert.deepStrictEqual(V.winners({ '-a': { nickname: 'A', score: 5 }, '-b': { nickname: 'B', score: 5 } }).map(p => p.nickname), ['A', 'B']);
    assert.deepStrictEqual(V.winners({}), []);
});

const answers = {
    '-a': { text: 'cheese', houseLie: false, realAnswer: false },
    '-b': { text: 'blue moon', houseLie: false, realAnswer: false },
    '-h1': { text: 'lie b', houseLie: true, realAnswer: false },
    '-t': { text: 'truth2', houseLie: false, realAnswer: true },
    '-c': { text: 'cheese', houseLie: false, realAnswer: false },
    '-x': { text: 'decoy for ben', houseLie: true, realAnswer: false, decoyOf: '-b' },
};

test('a controller is offered every answer once, without its own lie or its own decoy', () => {
    const shared = V.picksForControllers(answers);
    assert.deepStrictEqual(V.pickList(shared, '-b'), ['cheese', 'lie b', 'truth2']);
    assert.deepStrictEqual(V.pickList(shared, '-a'), ['blue moon', 'decoy for ben', 'lie b', 'truth2']);
    assert.deepStrictEqual(V.pickList(null, '-a'), []);
});

test('what the controllers get never says which answer is the truth', () => {
    const shared = V.picksForControllers(answers);
    Object.keys(shared).forEach(k => {
        assert.deepStrictEqual(Object.keys(shared[k]).filter(f => f !== 'text' && f !== 'decoyOf'), []);
    });
    const game = {
        pin: 'ABCD', locale: 'en', players, answers, currentQ: 'Q $blank$',
        state: { id: M.GameState.ShowAnswers, timestamp: 1000, deadline: 21000 }, questionIndex: 1, totalQ: 5,
        hostKey: 'SECRETSECRETSECRET',
    };
    const s = V.sharedState(game, { serverNow: 6000, master: 1 });
    const json = JSON.stringify(s);
    assert.ok(!/realAnswer|houseLie|SECRET|uid/.test(json), json);
    assert.strictEqual(s.endsIn, 15000);
    assert.strictEqual(s.key, `${M.GameState.ShowAnswers}:1000`);
    assert.strictEqual(s.master, 1);
    assert.strictEqual(s.qi, 1);
});

test('the question reaches the controllers only while they write or pick, the reveal only on the reveal', () => {
    const base = { pin: 'ABCD', locale: 'he', players, answers, currentQ: 'Q', revealAnswers: [] };
    const at = id => V.sharedState(Object.assign({}, base, { state: { id, timestamp: 1 } }), { serverNow: 1 });
    assert.strictEqual(at(M.GameState.GameStaging).question, undefined);
    assert.strictEqual(at(M.GameState.ShowQuestion).question, 'Q');
    assert.strictEqual(at(M.GameState.ShowQuestion).picks, undefined);
    assert.ok(at(M.GameState.ShowAnswers).picks);
    assert.strictEqual(at(M.GameState.ShowAnswers).reveal, undefined);
    assert.ok(Array.isArray(at(M.GameState.RevealTheTruth).reveal));
    assert.strictEqual(at(M.GameState.RevealTheTruth).locale, 'he');
    assert.strictEqual(V.sharedState({ pin: 'X' }, {}).step, null);
});

const reveal = [
    { text: 'cheese', selectors: ['-b'], creators: ['-a', '-c'], realAnswer: false, houseLie: false, points: 500 },
    { text: 'lie b', selectors: ['-a'], creators: [], realAnswer: false, houseLie: true, points: -500, pointsBy: { '-a': -500 } },
    { text: 'blue moon', selectors: [], creators: ['-b'], realAnswer: false, houseLie: false, points: 0 },
    { text: 'truth2', selectors: ['-c'], creators: [], realAnswer: true, houseLie: false, points: 1000 },
];

test('the reveal shows picked rows and the truth, and the lies nobody picked at the end', () => {
    const v = V.revealView(reveal, players);
    assert.deepStrictEqual(v.rows.map(r => r.text), ['cheese', 'lie b', 'truth2']);
    assert.deepStrictEqual(v.rows[0].writers, ['Ana', 'Cleo']);
    assert.deepStrictEqual(v.rows[0].pickers, ['Ben']);
    assert.deepStrictEqual(v.unpicked.map(r => r.text), ['blue moon']);
    const times = V.revealTimes(reveal);
    assert.strictEqual(times.starts.length, 3);
    assert.deepStrictEqual(times.starts, [0, 4500, 9000]);
    assert.ok(times.duration > times.allShown);
});

test('each controller gets its own result lines, in the site words', async () => {
    const { gameStrings } = await load('../game/src/app/pages/game-strings.ts');
    const rows = V.revealForControllers(reveal);
    const p = { '-a': { nickname: 'Ana' }, '-b': { nickname: 'Ben' }, '-c': { nickname: 'Cleo' } };
    assert.deepStrictEqual(V.myResult('-b', rows, p, gameStrings('en')), ['You fell for Ana and Cleo\'s bullshit.', 'Nobody fell for your answer.']);
    assert.deepStrictEqual(V.myResult('-c', rows, p, gameStrings('en')), ['You found the truth! +1000', 'You fooled Ben! +500']);
    assert.deepStrictEqual(V.myResult('-a', rows, p, gameStrings('en')), ['You fell for our bullshit. -500', 'You fooled Ben! +500']);
    assert.match(V.myResult('-c', rows, p, gameStrings('he'))[0], /מצאת את האמת/);
});

test('the final names the biggest bullshitters and the best lie', () => {
    const hl = { '-a': { text: 'cheese', fooled: 2, points: 1000, total: 3 }, '-b': { text: 'moon', fooled: 1, points: 500, total: 3 } };
    const f = V.finalHighlights(players, hl);
    assert.deepStrictEqual(f.biggest, ['Ana', 'Ben']);
    assert.deepStrictEqual(f.bestLie, { nickname: 'Ana', text: 'cheese' });
    assert.deepStrictEqual(V.finalHighlights(players, null), { biggest: [], bestLie: null });
});

test('the blank is drawn as on the site', () => {
    assert.strictEqual(V.questionText('The capital is $blank$.'), 'The capital is ________.');
    assert.strictEqual(V.questionText('A $ blank $ b $BLANK$'), 'A ________ b ________');
    assert.strictEqual(V.questionText(null), '');
});
