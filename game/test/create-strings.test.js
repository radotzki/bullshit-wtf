// Tests for the Create page's words (src/app/pages/create-game/create-strings.ts).
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
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const page = path.join(__dirname, '..', 'src', 'app', 'pages', 'create-game');
const { createStrings } = load(path.join(page, 'create-strings.ts'));

test('English visitors keep the English Create page word for word', () => {
    const en = createStrings('en');
    assert.strictEqual(createStrings(undefined), en);
    assert.strictEqual(createStrings('fr'), en);
    assert.deepStrictEqual(en, {
        lang: 'en',
        dir: 'ltr',
        title: 'Bullshit',
        heading: 'Create new game',
        language: 'Language:',
        english: 'English',
        hebrew: 'Hebrew',
        length: 'Length:',
        questions: 'questions',
        special: 'Special:',
        create: 'CREATE',
        error: 'oops, something went wrong. Please try again',
    });
});

test('Hebrew visitors get every word in Hebrew, right to left', () => {
    const he = createStrings('he');
    assert.strictEqual(he.lang, 'he');
    assert.strictEqual(he.dir, 'rtl');
    for (const [key, value] of Object.entries(he)) {
        if (key === 'lang' || key === 'dir') continue;
        assert.ok(/[֐-׿]/.test(value), `${key} is not Hebrew: ${value}`);
        assert.ok(!/[A-Za-z]/.test(value), `${key} has Latin letters: ${value}`);
    }
    assert.deepStrictEqual(Object.keys(he).sort(), Object.keys(createStrings('en')).sort());
});

test('the page has no fixed English words left: every word comes from the strings', () => {
    const html = fs.readFileSync(path.join(page, 'create-game.component.html'), 'utf8');
    const text = html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\{\{[\s\S]*?\}\}/g, '')
        .replace(/<[^>]*>/g, '');
    assert.ok(!/[A-Za-z]/.test(text), `fixed words in the template: ${text.replace(/\s+/g, ' ').trim()}`);
    const component = fs.readFileSync(path.join(page, 'create-game.component.ts'), 'utf8');
    assert.ok(component.indexOf('this.errorMsg = this.t.error') >= 0);
});
