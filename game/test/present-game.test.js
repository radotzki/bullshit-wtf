// The Present Game page (the TV or computer that shows the game to the room): its words in the
// visitor's language, and a code that names no game answered on the page, not with an empty lobby.
// From the Hebrew Hanukkah night walk (2026-11-19): a Hebrew family's TV got an English page, and a
// mistyped code (or one typed on a Hebrew keyboard) opened "PIN: ZZZZ ... Waiting for players.." forever.
// Run: npm test (from game/).
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
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const page = path.join(__dirname, '..', 'src', 'app', 'pages', 'present-game');
const { presentStrings } = load(path.join(page, 'present-strings.ts'));
const html = fs.readFileSync(path.join(page, 'present-game.component.html'), 'utf8');
const src = fs.readFileSync(path.join(page, 'present-game.component.ts'), 'utf8');

test('English keeps its words; anything but Hebrew is English', () => {
    const en = presentStrings('en');
    assert.strictEqual(presentStrings(undefined), en);
    assert.strictEqual(presentStrings('fr'), en);
    assert.strictEqual(en.heading, 'Enter a game PIN');
    assert.strictEqual(en.present, 'PRESENT');
    assert.match(en.notFound('ZZZZ'), /ZZZZ/);
});

test('Hebrew: every word in Hebrew, right to left, the same keys as English', () => {
    const he = presentStrings('he');
    assert.strictEqual(he.dir, 'rtl');
    for (const [key, value] of Object.entries(he)) {
        if (key === 'lang' || key === 'dir') continue;
        const text = typeof value === 'function' ? value('ABCD').replace('ABCD', '') : value;
        assert.ok(/[א-ת]/.test(text), `${key} is not Hebrew: ${text}`);
        assert.ok(!/[A-Za-z]/.test(text), `${key} has Latin letters: ${text}`);
    }
    assert.match(he.notFound('ABCD'), /ABCD/);
    assert.deepStrictEqual(Object.keys(he).sort(), Object.keys(presentStrings('en')).sort());
});

test('the page has no fixed English words, and goes right to left in Hebrew', () => {
    const text = html.replace(/<!--[\s\S]*?-->/g, '').replace(/\{\{[\s\S]*?\}\}/g, '').replace(/<[^>]*>/g, '');
    assert.ok(!/[A-Za-z]/.test(text), `fixed words in the template: ${text.replace(/\s+/g, ' ').trim()}`);
    assert.match(html, /\[attr\.dir\]="t\.dir === 'rtl' \? 'rtl' : null"/);
    assert.match(html, /\[placeholder\]="t\.placeholder"/);
    assert.match(html, /\{\{ errorMsg \}\}/);
});

test('the page reads the code as the join boxes do, and shows only a game that exists', () => {
    assert.match(src, /cleanCode\(typed\)/);
    // The game is looked up before the screen is marked as its presenter, and a missing one says so.
    const look = src.indexOf('getGameLocale(pin)');
    const mark = src.indexOf('joinAsPresenter(pin)');
    assert.ok(look > 0 && mark > look, 'getGameLocale before joinAsPresenter');
    assert.match(src, /if \(!locale\) \{[\s\S]*?this\.t\.notFound\(pin\)/);
    // A failed call leaves the form with a message, not a spinner.
    assert.match(src, /catch \(e\) \{[\s\S]*?this\.loading = false;[\s\S]*?this\.errorMsg = this\.t\.error/);
    // Same language rule as the join page: ?lang=, then /he/, then the browser's last language.
    assert.match(src, /presentStrings\(joinLocale\(this\.router\.url, lang, preferredLocale\(\)\)\)/);
});
