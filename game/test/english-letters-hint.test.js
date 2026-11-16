// A wrong game code typed with Hebrew letters says that game codes are English letters
// (pinError in src/app/pages/join-game/join-strings.ts, typedHebrew in src/app/services/game-code.ts).
// A code typed on a computer's Hebrew keyboard already reaches its game (cleanCode); on a phone's
// Hebrew keyboard the guest can't type J or V, types something like "שלום", and got only
// "Wrong game PIN". Now both the home's code box and the PIN page add the hint, in both languages.
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const app = path.join(__dirname, '..', 'src', 'app');

function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    const mod = { exports: {} };
    const req = (name) => name.startsWith('.') ? load(path.join(path.dirname(file), name + '.ts')) : require(name);
    new Function('module', 'exports', 'require', out)(mod, mod.exports, req);
    return mod.exports;
}

const { typedHebrew } = load(path.join(app, 'services', 'game-code.ts'));
const { pinError } = load(path.join(app, 'pages', 'join-game', 'join-strings.ts'));
const { CodeBox } = load(path.join(app, 'pages', 'landing', 'code-box.ts'));
const { homeStrings } = load(path.join(app, 'pages', 'landing', 'home-strings.ts'));

const WRONG = { code: 'GAME_NOT_EXIST', message: 'Wrong game PIN' };
const FULL = { code: 'GAME_IS_FULL', message: 'Sorry, the game is full' };

test('typedHebrew sees any Hebrew letter, and nothing else', () => {
    assert.strictEqual(typedHebrew('שלום'), true);
    assert.strictEqual(typedHebrew('JVנב'), true);
    assert.strictEqual(typedHebrew('ABCD'), false);
    assert.strictEqual(typedHebrew('ab/cd\''), false);
    assert.strictEqual(typedHebrew('׳'), false);
    assert.strictEqual(typedHebrew(''), false);
    assert.strictEqual(typedHebrew(null), false);
    assert.strictEqual(typedHebrew(undefined), false);
});

test('a wrong PIN typed in Hebrew says codes are English letters, in English and in Hebrew', () => {
    assert.strictEqual(pinError('en', WRONG.code, WRONG.message, 'שלום'),
        'Wrong game PIN. Game codes are English letters.');
    assert.strictEqual(pinError('he', WRONG.code, WRONG.message, 'שלום'),
        'קוד המשחק שגוי. הקוד באותיות באנגלית.');
});

test('a wrong PIN typed in English letters says only that it is wrong', () => {
    assert.strictEqual(pinError('en', WRONG.code, WRONG.message, 'ABCD'), 'Wrong game PIN');
    assert.strictEqual(pinError('he', WRONG.code, WRONG.message, 'abcd'), 'קוד המשחק שגוי');
});

test('other failures never get the hint, even when typed in Hebrew', () => {
    assert.strictEqual(pinError('en', FULL.code, FULL.message, 'שלום'), 'Sorry, the game is full');
    assert.strictEqual(pinError('he', FULL.code, FULL.message, 'שלום'), 'מצטערים, המשחק מלא');
    assert.strictEqual(pinError('he', 'SOMETHING', 'x', 'שלום'), 'אופס, משהו השתבש. נסו שוב');
});

test('no second full stop when the words already end in one', () => {
    assert.strictEqual(pinError('en', WRONG.code, 'Wrong game PIN.', 'שלום'),
        'Wrong game PIN. Game codes are English letters.');
});

/** A home code box whose server knows no game, wired as the phone and computer homes wire it. */
function box(locale, failure) {
    const calls = { validate: [], navigate: [] };
    const b = new CodeBox({
        validate: pin => { calls.validate.push(pin); return Promise.reject(failure); },
        navigate: (p, q) => { calls.navigate.push({ path: p, query: q }); return Promise.resolve(true); },
        locale: () => locale,
        errorText: (code, message, typed) => pinError(locale, code, message, typed),
        emptyText: () => homeStrings(locale).codeEmpty,
    });
    return { b, calls };
}

for (const locale of ['en', 'he']) {
    test(`home code box (${locale}): "שלום" checks AKUO, stays, and says codes are English letters`, async () => {
        const { b, calls } = box(locale, WRONG);
        b.code = 'שלום';
        await b.submit();
        assert.deepStrictEqual(calls.validate, ['AKUO']);
        assert.deepStrictEqual(calls.navigate, []);
        assert.strictEqual(b.error, pinError(locale, WRONG.code, WRONG.message, 'שלום'));
        assert.ok(/English letters|באותיות באנגלית/.test(b.error));
        assert.strictEqual(b.busy, false);
    });

    test(`home code box (${locale}): a wrong English code has no hint`, async () => {
        const { b } = box(locale, WRONG);
        b.code = 'zzzz';
        await b.submit();
        assert.ok(!/English letters|באותיות באנגלית/.test(b.error));
        assert.ok(b.error.length > 0);
    });
}

test('the homes and the PIN page all use pinError with the text as typed', () => {
    for (const file of ['pages/landing/mobile-landing/mobile-landing.component.ts',
        'pages/landing/desktop-landing/desktop-landing.component.ts']) {
        const src = fs.readFileSync(path.join(app, file), 'utf8');
        assert.ok(/errorText: \(code, message, typed\) => pinError\(this\.t\.lang, code, message, typed\)/.test(src), file);
    }
    const pinPage = fs.readFileSync(path.join(app, 'pages/join-game/join-game.component.ts'), 'utf8');
    assert.ok(/const typed = this\.pin;\s*this\.pin = cleanCode\(typed\) \|\| typed;/.test(pinPage));
    assert.ok(/this\.errorMsg = pinError\(this\.t\.lang, err && err\.code, err && err\.message, typed\);/.test(pinPage));
});
