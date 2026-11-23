// Where a phone shows the question (src/app/pages/show-answers/question-on-phone.ts): above the answers
// in a game with no big screen, behind "what was the question?" with one. Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}
const app = path.join(__dirname, '..', 'src', 'app');
const { bigScreenInGame, answersQuestion } = load(path.join(app, 'pages', 'show-answers', 'question-on-phone.ts'));
const read = f => fs.readFileSync(path.join(app, f), 'utf8');

test('a big screen is a presenter, or the host\'s computer made the big screen', () => {
    assert.strictEqual(bigScreenInGame(true, false), true);
    assert.strictEqual(bigScreenInGame(null, 'screen'), true);
    assert.strictEqual(bigScreenInGame(null, true), false);
    assert.strictEqual(bigScreenInGame(undefined, undefined), false);
    assert.strictEqual(bigScreenInGame(false, null), false);
});

test('a phone-only game shows the question above the answers, with no button', () => {
    assert.deepStrictEqual(answersQuestion({ isPresenter: false, taste: false, bigScreen: false }), { above: true, askButton: false });
});

test('with a big screen the phone keeps the "what was the question?" button, as before', () => {
    assert.deepStrictEqual(answersQuestion({ isPresenter: false, taste: false, bigScreen: true }), { above: false, askButton: true });
});

test('a taste shows the question above, as before, whatever is known of a big screen', () => {
    for (const bigScreen of [null, true, false]) {
        assert.deepStrictEqual(answersQuestion({ isPresenter: false, taste: true, bigScreen }), { above: true, askButton: false });
    }
});

test('until the big screen is known, neither shows (no button flashes in a phone-only game)', () => {
    assert.deepStrictEqual(answersQuestion({ isPresenter: false, taste: false, bigScreen: null }), { above: false, askButton: false });
});

test('the big screen itself is untouched: it has its own question line', () => {
    assert.deepStrictEqual(answersQuestion({ isPresenter: true, taste: false, bigScreen: true }), { above: false, askButton: false });
    const html = read('pages/show-answers/show-answers.component.html');
    assert.match(html, /answers && presenter" class="presenter">\s*<p class="question"/);
});

test('the answers screen uses the view, and the question is about 18 px on a phone', () => {
    const html = read('pages/show-answers/show-answers.component.html');
    assert.match(html, /\*ngIf="questionView\.above && question" class="phone-question"/);
    assert.match(html, /\*ngIf="!showQuestion && questionView\.askButton"/);
    const scss = read('pages/show-answers/show-answers.component.scss');
    assert.match(scss, /\.phone-question \{[^}]*font-size: 1\.3rem/);
});

test('the writing screen sets the question larger only in a game with no big screen', () => {
    const html = read('pages/show-question/show-question.component.html');
    assert.match(html, /\[class\.phone-only\]="phoneOnly"/);
    const scss = read('pages/show-question/show-question.component.scss');
    assert.match(scss, /\.phone-only \.question \{[^}]*font-size: 1\.3rem/);
    const comp = read('pages/show-question/show-question.component.ts');
    assert.match(comp, /phoneOnly = false;/);
    assert.match(comp, /gameHasBigScreen\(this\.pin\)\.then\(bigScreen => this\.phoneOnly = !bigScreen\)/);
});
