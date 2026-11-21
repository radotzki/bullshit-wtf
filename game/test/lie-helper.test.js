// Tests for the round-1 lie helper on the writing screen (src/app/pages/show-question/lie-helper.ts).
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load() {
    const file = path.join(__dirname, '..', 'src', 'app', 'pages', 'show-question', 'lie-helper.ts');
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const { lieHelperView, nextIdea, lieHelperStrings } = load();
const ideas = ['reverse paradise', 'gloom atoll'];

test('games without the helper: no hint, no button, but the box keeps its name', () => {
    assert.deepStrictEqual(lieHelperView(false, 0, 0, 'en', ideas, 0), { hint: null, placeholder: 'Your lie', button: null });
    assert.deepStrictEqual(lieHelperView(undefined, 2, 6, 'he', ideas, 0), { hint: null, placeholder: 'השקר שלך', button: null });
});

test('rounds 2 and 3: no hint and no STUCK? (round 1 only, by design), but the box keeps its name', () => {
    // A 5-question game: question 3 is round 2's first. The kids and Christmas play-test found the box unnamed here.
    assert.deepStrictEqual(lieHelperView(true, 1, 2, 'en', ideas, 0), { hint: null, placeholder: 'Your lie', button: null });
    assert.deepStrictEqual(lieHelperView(true, 2, 6, 'en', ideas, 0), { hint: null, placeholder: 'Your lie', button: null });
    assert.deepStrictEqual(lieHelperView(true, 1, 3, 'he', ideas, 0), { hint: null, placeholder: 'השקר שלך', button: null });
});

test('the writing screen names the box for a screen reader on every question', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'pages', 'show-question', 'show-question.component.html'), 'utf8');
    assert.match(html, /\[attr\.aria-label\]="aboutMe \? aboutWords\.placeholder : helper\.placeholder"/);
    const ts = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'pages', 'show-question', 'show-question.component.ts'), 'utf8');
});

test('questions 1 and 2 show the line, the placeholder and the button', () => {
    [0, 1].forEach(q => assert.deepStrictEqual(lieHelperView(true, 0, q, 'en', ideas, 0), {
        hint: 'Make up a fake answer that sounds true. +500 for every friend who picks it.',
        placeholder: 'Your lie',
        button: 'STUCK? GIVE ME A LIE',
    }));
});

test('later round-1 questions drop the line but keep the placeholder and button', () => {
    assert.deepStrictEqual(lieHelperView(true, 0, 2, 'en', ideas, 0), { hint: null, placeholder: 'Your lie', button: 'STUCK? GIVE ME A LIE' });
});

test('Hebrew games get Hebrew words', () => {
    assert.deepStrictEqual(lieHelperView(true, 0, 0, 'he', ideas, 0), {
        hint: 'המציאו תשובה מזויפת שנשמעת אמיתית. 500+ על כל חבר שבוחר בה.',
        placeholder: 'השקר שלך',
        button: 'תקועים? תנו לי שקר',
    });
    assert.strictEqual(lieHelperStrings('fr').placeholder, 'Your lie');
});

test('two taps give two lies, then the button goes away', () => {
    assert.strictEqual(nextIdea(ideas, 0), 'reverse paradise');
    assert.strictEqual(lieHelperView(true, 0, 0, 'en', ideas, 1).button, 'STUCK? GIVE ME A LIE');
    assert.strictEqual(nextIdea(ideas, 1), 'gloom atoll');
    assert.strictEqual(lieHelperView(true, 0, 0, 'en', ideas, 2).button, null);
    assert.strictEqual(nextIdea(ideas, 2), null);
});

test('no ideas (none to offer, or not readable): no button, the rest stays', () => {
    assert.deepStrictEqual(lieHelperView(true, 0, 0, 'en', [], 0).button, null);
    assert.deepStrictEqual(lieHelperView(true, 0, 0, 'en', null, 0).placeholder, 'Your lie');
    assert.strictEqual(nextIdea(null, 0), null);
});
