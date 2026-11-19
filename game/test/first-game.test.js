// Tests for a first game's self-explaining screens (new-host walk, 19 Nov 2026): who invited a guest
// (src/app/pages/join-game/join-invite.ts), the footer's score during a reveal
// (src/app/components/game-footer/footer-score.ts), and the screens' own words and marks.
// Run: npm test (from game/). Needs Node 20+, and the copied model (npm run copy-model, which build runs).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    const mod = { exports: {} };
    const req = (name) => name.startsWith('.') ? load(path.join(path.dirname(file), name + '.ts')) : require(name);
    new Function('module', 'exports', 'require', out)(mod, mod.exports, req);
    return mod.exports;
}

const app = path.join(__dirname, '..', 'src', 'app');
const read = (...p) => fs.readFileSync(path.join(app, ...p), 'utf8');
const { inviteHost } = load(path.join(app, 'pages', 'join-game', 'join-invite.ts'));
const { footerScore, revealSettled } = load(path.join(app, 'components', 'game-footer', 'footer-score.ts'));

test('the invite line names the seat the server marked as host', () => {
    const players = {
        a: { nickname: 'Ben', uid: 'u2', score: 0 },
        b: { nickname: 'Dana', uid: 'u1', score: 0, host: true },
    };
    assert.strictEqual(inviteHost(players, 'u2'), 'Dana');
});

test('with no host mark, the creator\'s own seat; with neither, no name', () => {
    const players = { a: { nickname: 'Ben', uid: 'u2', score: 0 }, b: { nickname: 'Dana', uid: 'u1', score: 0 } };
    assert.strictEqual(inviteHost(players, 'u1'), 'Dana');
    assert.strictEqual(inviteHost(players, 'u9'), '');
    assert.strictEqual(inviteHost(players, null), '');
    assert.strictEqual(inviteHost(null, 'u1'), '');
    assert.strictEqual(inviteHost({}, 'u1'), '');
});

test('the invite line never shows a name the link preview would not', () => {
    const one = (nickname) => inviteHost({ a: { nickname, uid: 'u1', score: 0, host: true } });
    // Bidi tricks and control characters go; a name of signs alone goes.
    assert.strictEqual(one('Da‮na'), 'Dana');
    assert.strictEqual(one('...'), '');
    assert.strictEqual(one('   '), '');
    assert.strictEqual(one(42), '');
    // Hebrew names stay.
    assert.strictEqual(one('דנה'), 'דנה');
    // Cut to the nickname length.
    assert.strictEqual(one('Abcdefghijklmnop').length, 9);
});

test('the footer moves with the reveal\'s board, and the server\'s total wins once it moves', () => {
    const shown = { pin: 'ABCD', pid: 'p1', before: 500, after: 1000 };
    // During the reveal the server still holds the old total: the footer shows the board's.
    assert.strictEqual(footerScore(500, shown, 'abcd', 'p1'), 1000);
    assert.strictEqual(revealSettled(500, shown, 'abcd', 'p1'), false);
    // The server added the question: its total.
    assert.strictEqual(footerScore(1000, shown, 'ABCD', 'p1'), 1000);
    assert.strictEqual(revealSettled(1000, shown, 'ABCD', 'p1'), true);
    // A first question: no score yet reads as 0.
    assert.strictEqual(footerScore(undefined, { pin: 'ABCD', pid: 'p1', before: 0, after: 1500 }, 'ABCD', 'p1'), 1500);
    assert.strictEqual(footerScore(0, { pin: 'ABCD', pid: 'p1', before: 0, after: 1500 }, 'ABCD', 'p1'), 1500);
    // Another game or another player: untouched.
    assert.strictEqual(footerScore(500, shown, 'WXYZ', 'p1'), 500);
    assert.strictEqual(footerScore(500, shown, 'ABCD', 'p2'), 500);
    assert.strictEqual(footerScore(500, null, 'ABCD', 'p1'), 500);
    assert.strictEqual(revealSettled(500, null, 'ABCD', 'p1'), false);
});

test('every phone screen with a footer gets it from the one component, which reads the reveal', () => {
    const footer = read('components', 'game-footer', 'game-footer.component.ts');
    assert.ok(footer.indexOf('footerScore(live, shown, pin, pid)') >= 0);
    const reveal = read('pages', 'reveal-the-truth', 'reveal-the-truth.component.ts');
    assert.ok(/revealedScore\.next\(this\.myScore\)/.test(reveal));
    assert.ok(/this\.staged \? this\.scoresMoved : this\.allShown/.test(reveal));
});

test('the answers screen shows the question and what to do, and keeps the pick marked', () => {
    const html = read('pages', 'show-answers', 'show-answers.component.html');
    const picking = html.slice(html.indexOf('answers && !answerSelected && !presenter && !aboutMe'));
    // The question comes before the first answer button, with no button to reveal it.
    assert.ok(picking.indexOf('class="pick-question"') < picking.indexOf('(click)="submit(answer)"'));
    assert.ok(picking.indexOf('{{t.whichIsTrue}}') >= 0);
    assert.ok(html.indexOf('showQuestion') < 0);
    assert.ok(html.indexOf('[class.picked]="answer === picked"') >= 0);
    // The waiting screen after the pick shows it.
    const waiting = html.slice(html.indexOf('*ngIf="answerSelected"'));
    assert.ok(waiting.indexOf('{{t.yourPick}}') >= 0 && waiting.indexOf('picked | uppercase') >= 0);
    const ts = read('pages', 'show-answers', 'show-answers.component.ts');
    // A failed send unmarks it, so the player picks again.
    assert.ok(/catch\(err => \{\s*this\.loading = false;\s*this\.picked = undefined;/.test(ts));
});

test('a lobby of two or more has START in the body as well as in the corner, for whoever may start', () => {
    const html = read('pages', 'game-staging', 'game-staging.component.html');
    const body = /<div \*ngIf="([^"]*)" class="start-body"/.exec(html);
    assert.ok(body, 'no START in the body');
    assert.ok(body[1].indexOf('showStartButton') >= 0);
    assert.ok(body[1].indexOf('players?.length >= 2') >= 0);
    assert.ok(body[1].indexOf('!lobby?.alone') >= 0 && body[1].indexOf('!presenter') >= 0 && body[1].indexOf('!panel') >= 0);
    // Under the count line.
    assert.ok(html.indexOf('class="lobby-count"') < html.indexOf('class="start-body"'));
    // The corner one stays.
    assert.ok(html.indexOf('[button]="t.start"') >= 0);
});

test('the host\'s nickname box is filled with the last name this browser played under', () => {
    const page = read('pages', 'join-game', 'join-game.component.ts');
    assert.ok(/this\.isHost = hostedHere\(this\.pin\);\s*if \(this\.isHost && !this\.nickname\) \{[\s\S]*?this\.sessionService\.lastNickname/.test(page));
    assert.ok(page.indexOf('this.sessionService.lastNickname = nickname;') >= 0);
});
