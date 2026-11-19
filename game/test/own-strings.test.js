// Tests for the words of the host's own questions: the create page's section (create-strings.ts own),
// the game screens' lines (own-strings.ts), and how a phone reads an own question off the game's state
// (ownOf, ownView in game-model.ts). The rules themselves are tested in functions/test/own-questions.test.js.
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, () => ({ nameFlag: () => false }));
    return mod.exports;
}

const root = path.join(__dirname, '..', '..');
const pages = path.join(root, 'game', 'src', 'app', 'pages');
const { ownStrings, ownLine } = load(path.join(pages, 'own-strings.ts'));
const { createStrings } = load(path.join(pages, 'create-game', 'create-strings.ts'));
const { ownOf, ownView, OWN_TEXT_MAX, OWN_ANSWER_MAX } = load(path.join(root, 'game-model.ts'));
const hebrew = /[א-ת]/;

function strings(o) {
    return Object.keys(o).map(k => typeof o[k] === 'function' ? o[k]('Noa') : o[k])
        .reduce((all, v) => all.concat(Array.isArray(v) ? v : typeof v === 'object' ? strings(v) : [v]), []);
}

test('every own-question line exists in both languages, Hebrew in Hebrew letters, no "undefined"', () => {
    const en = strings(ownStrings('en'));
    const he = strings(ownStrings('he'));
    assert.strictEqual(en.length, he.length);
    en.forEach(s => assert.ok(s && !/undefined/.test(s) && !hebrew.test(s), s));
    he.forEach(s => assert.ok(s && !/undefined/.test(s) && hebrew.test(s), s));
    const cen = strings(createStrings('en').own);
    const che = strings(createStrings('he').own);
    assert.strictEqual(cen.length, che.length);
    cen.forEach(s => assert.ok(s && !/undefined/.test(s), s));
    che.forEach(s => assert.ok(s && !/undefined/.test(s) && (hebrew.test(s) || /^\+/.test(s)), s));
});

test('the create page names the real limits and the host\'s rule', () => {
    const p = createStrings('en').own.problems;
    assert.ok(p.text.includes(String(OWN_TEXT_MAX)));
    assert.ok(p.truth.includes(String(OWN_ANSWER_MAX)) && p.lies.includes(String(OWN_ANSWER_MAX)));
    assert.ok(createStrings('he').own.problems.text.includes(String(OWN_TEXT_MAX)));
    assert.ok(/don't pick/.test(createStrings('en').own.hostRule));
    // Placeholders show the blank the way the page asks for it.
    assert.ok(createStrings('en').own.textPlaceholder.includes('___'));
    assert.ok(createStrings('he').own.textPlaceholder.includes('___'));
});

test('a phone reads an own question off the state: the host, a friend, the big screen', () => {
    const state = { id: 2, timestamp: 1, own: { pid: 'p1' } };
    const players = { p1: { nickname: 'Noa' }, p2: { nickname: 'Ben' } };
    assert.deepStrictEqual(ownOf(state), { pid: 'p1' });
    assert.strictEqual(ownOf({ id: 2, timestamp: 1 }), null);
    assert.strictEqual(ownOf(null), null);
    assert.deepStrictEqual(ownOf({ own: {} }), { pid: '' });

    const en = ownStrings('en');
    const host = ownView(ownOf(state), players, 'p1', false);
    assert.deepStrictEqual(host, { ownMe: true, ownName: 'Noa' });
    assert.strictEqual(ownLine(en, host, false), en.youHint);
    const friend = ownView(ownOf(state), players, 'p2', false);
    assert.strictEqual(ownLine(en, friend, false), "Noa's own question. Write a lie that fits.");
    const screen = ownView(ownOf(state), players, null, true);
    assert.strictEqual(screen.ownMe, false);
    assert.strictEqual(ownLine(en, screen, true), "Noa's own question");
    // A big-screen host (no host seat): nobody is the host, the line has no name.
    const none = ownView({ pid: '' }, players, 'p1', false);
    assert.deepStrictEqual(none, { ownMe: false, ownName: '' });
    assert.strictEqual(ownLine(en, none, false), en.lieHintNoName);
    assert.strictEqual(ownLine(en, null, false), null);
    assert.strictEqual(ownLine(ownStrings('he'), friend, false), 'השאלה של Noa. כתבו שקר שמתאים.');
});
