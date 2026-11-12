// Tests for the words of the taste, the five pick-only questions of a host who starts alone
// (src/app/pages/taste-strings.ts), and for how a phone reads the taste off the game's state
// (tasteOf in game-model.ts).
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
    new Function('module', 'exports', 'require', out)(mod, mod.exports, () => ({}));
    return mod.exports;
}

const root = path.join(__dirname, '..', '..');
const { tasteStrings } = load(path.join(root, 'game', 'src', 'app', 'pages', 'taste-strings.ts'));
const { tasteOf, TASTE_QUESTIONS, TASTE_OPTIONS } = load(path.join(root, 'game-model.ts'));
const lobby = fs.readFileSync(path.join(root, 'game', 'src', 'app', 'pages', 'game-staging', 'lobby-host.ts'), 'utf8');

const en = tasteStrings('en');
const he = tasteStrings('he');
const hebrew = /[֐-׿]/;
const latin = /[A-Za-z]/;

test('a taste is five questions of four answers', () => {
    assert.strictEqual(TASTE_QUESTIONS, 5);
    assert.strictEqual(TASTE_OPTIONS, 4);
});

test('both languages have every line, Hebrew in Hebrew and English in English', () => {
    assert.deepStrictEqual(Object.keys(he).sort(), Object.keys(en).sort());
    Object.keys(en).forEach(key => {
        const say = t => typeof t[key] === 'function' ? t[key](3, 5) : t[key];
        assert.ok(say(en) && !hebrew.test(say(en)), `English ${key}`);
        assert.ok(say(he) && hebrew.test(say(he)) && !latin.test(say(he)), `Hebrew ${key}`);
    });
    assert.strictEqual(tasteStrings('fr'), en, 'any other language reads in English');
});

test('the card before the first question names the number of questions', () => {
    assert.strictEqual(en.introTitle(TASTE_QUESTIONS), '5 QUICK QUESTIONS');
    assert.strictEqual(he.introTitle(TASTE_QUESTIONS), '5 שאלות מהירות');
});

test('the final headline counts the truths found, from none to all', () => {
    assert.strictEqual(en.found(0, 5), 'YOU FOUND 0 OF 5 TRUTHS');
    assert.strictEqual(en.found(3, 5), 'YOU FOUND 3 OF 5 TRUTHS');
    assert.strictEqual(en.found(5, 5), '5 OF 5! YOU FOUND EVERY TRUTH');
    assert.strictEqual(he.found(3, 5), 'מצאת את האמת ב־3 מתוך 5 שאלות');
    assert.strictEqual(he.found(5, 5), '5 מתוך 5! מצאת את האמת בכל שאלה');
});

test('the lobby\'s link names the same number of questions as the game plays', () => {
    assert.ok(lobby.indexOf(`'Try ${TASTE_QUESTIONS} quick questions alone'`) > 0);
    assert.ok(lobby.indexOf(`'לנסות לבד ${TASTE_QUESTIONS} שאלות מהירות'`) > 0);
});

test('a phone reads the taste off the state, and nothing off any other state', () => {
    assert.deepStrictEqual(tasteOf({ id: 3, timestamp: 1, taste: { found: 2, length: 9 } }), { found: 2, length: 9 });
    for (const state of [null, undefined, 7, 'x', {}, { id: 3, timestamp: 1 }, { taste: null }, { taste: true }, { taste: 0 }]) {
        assert.strictEqual(tasteOf(state), null);
    }
    // Numbers that cannot be read count as nothing, never as NaN on the screen.
    assert.deepStrictEqual(tasteOf({ taste: { found: 'x', length: -2 } }), { found: 0, length: 0 });
});
