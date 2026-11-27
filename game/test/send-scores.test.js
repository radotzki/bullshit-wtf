// Tests for SEND THE SCORES TO THE GROUP (src/app/components/send-scores/send-scores.ts): who sees it, the
// message and link it sends, and the join page's tag for a visit that link brings.
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const app = path.join(__dirname, '..', 'src', 'app');

/** Loads a TypeScript file of the app, following its relative imports. */
function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5, lib: ['es2016', 'dom'] },
    }).outputText;
    const mod = { exports: {} };
    const req = name => name.startsWith('.') ? load(path.join(path.dirname(file), name + '.ts')) : require(name);
    new Function('module', 'exports', 'require', out)(mod, mod.exports, req);
    return mod.exports;
}

const s = load(path.join(app, 'components', 'send-scores', 'send-scores.ts'));
const n = load(path.join(app, 'pages', 'join-game', 'night-after.ts'));
const j = load(path.join(app, 'services', 'join-source.ts'));

const host = { presenter: false, hosted: true, played: true, players: 3, taste: false, portal: false };

test('only the host\'s phone sees it, in a game of 3 or more', () => {
    assert.strictEqual(s.showSendScores(host), true);
    assert.strictEqual(s.showSendScores({ ...host, players: 12 }), true);
    assert.strictEqual(s.showSendScores({ ...host, hosted: false }), false, 'a guest keeps their own ask');
    assert.strictEqual(s.showSendScores({ ...host, players: 2 }), false);
    assert.strictEqual(s.showSendScores({ ...host, presenter: true }), false, 'not on the big screen');
    assert.strictEqual(s.showSendScores({ ...host, played: false }), false);
    assert.strictEqual(s.showSendScores({ ...host, taste: true }), false, 'not after a solo taste');
    assert.strictEqual(s.showSendScores({ ...host, portal: true }), false, 'not on CrazyGames');
});

test('the words are the report\'s, in both languages', () => {
    assert.strictEqual(s.scoresWords('en').button, 'SEND THE SCORES TO THE GROUP');
    assert.strictEqual(s.scoresWords('he').button, 'לשלוח את התוצאות לקבוצה');
    assert.strictEqual(s.scoresWords('en').hint, 'Everyone gets the scores and the best lies.');
    assert.strictEqual(s.scoresWords('he').hint, 'כולם יקבלו את התוצאות ואת השקרים הכי טובים.');
    assert.deepStrictEqual(Object.keys(s.scoresStrings.he).sort(), Object.keys(s.scoresStrings.en).sort());
});

test('the link is the game\'s own join page, in its language, tagged via=scores', () => {
    assert.strictEqual(s.scoresUrl('abcd', 'en'), 'https://bullshit.wtf/join-game/ABCD?via=scores');
    assert.strictEqual(s.scoresUrl('ABCD', 'he'), 'https://bullshit.wtf/he/join-game/ABCD?via=scores');
});

test('the message names the winner and the points', () => {
    assert.strictEqual(s.scoresMessage([{ nickname: 'Noa', score: 4500 }], 'en'),
        '🏆 Noa won tonight\'s Bullshit with 4500 points. Scores, the best lies, and a game of your own:');
    assert.strictEqual(s.scoresMessage([{ nickname: 'נועה', score: 4500 }], 'he'),
        '🏆 נועה לקח/ה את הבולשיט הערב עם 4500 נקודות. התוצאות, השקרים הכי טובים, ומשחק משלכם:');
});

test('a tie names every winner; no winner, no name', () => {
    assert.strictEqual(s.scoresMessage([{ nickname: 'Noa', score: 3000 }, { nickname: 'Ben', score: 3000 }], 'en'),
        '🏆 Noa & Ben tied for tonight\'s Bullshit with 3000 points. Scores, the best lies, and a game of your own:');
    assert.strictEqual(s.scoresMessage([{ nickname: 'נועה', score: 3000 }, { nickname: 'דני', score: 3000 }], 'he'),
        '🏆 תיקו בבולשיט הערב: נועה ודני עם 3000 נקודות. התוצאות, השקרים הכי טובים, ומשחק משלכם:');
    assert.strictEqual(s.scoresMessage([{ nickname: 'נועה', score: 3000 }, { nickname: 'Joe', score: 3000 }], 'he'),
        '🏆 תיקו בבולשיט הערב: נועה ו-Joe עם 3000 נקודות. התוצאות, השקרים הכי טובים, ומשחק משלכם:');
    assert.ok(!/undefined/.test(s.scoresMessage([], 'en')));
    assert.ok(!/undefined/.test(s.scoresMessage(null, 'he')));
});

test('the scores link is a visit tag and a campaign, not a join source of its own', () => {
    assert.strictEqual(j.readCampaign('?via=scores'), 'scores');
    assert.strictEqual(j.readCampaign('?via=' + s.SCORES_CREATE_TAG), 'after-game-late-scores');
    assert.ok(s.SCORES_CREATE_TAG.indexOf('after-game') === 0, 'campaign LIKE after-game% still counts it');
    assert.strictEqual(j.isTestTag('scores'), false);
});

test('the join page counts a scores visit apart, and none beside an open rematch', () => {
    assert.strictEqual(s.isScoresVisit('scores'), true);
    assert.strictEqual(s.isScoresVisit('SCORES'), true);
    assert.strictEqual(s.isScoresVisit('link'), false);
    assert.strictEqual(s.isScoresVisit(undefined), false);
    assert.strictEqual(s.scoresSeenMethod(n.seenMethod('new', true), true), 'seen-scores-player');
    assert.strictEqual(s.scoresSeenMethod(n.seenMethod('control', false), false), 'seen-scores-other');
    assert.strictEqual(s.scoresSeenMethod(n.seenMethod('new', true, 'WXYZ'), true), null);
});

test('the final screen shows it under REMATCH, and only by its flag', () => {
    const html = fs.readFileSync(path.join(app, 'pages', 'score-board-final', 'score-board-final.component.html'), 'utf8');
    const rematch = html.indexOf('{{ rematchLine }}');
    const scores = html.indexOf('<app-send-scores *ngIf="sendScores"');
    const share = html.indexOf('<app-share-results');
    assert.ok(rematch > 0 && scores > rematch && scores < share);
});
