// Tests for the laugh button's count on one phone (src/app/pages/reveal-the-truth/reveal-laughs.ts).
// Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load() {
    const file = path.join(__dirname, '..', 'src', 'app', 'pages', 'reveal-the-truth', 'reveal-laughs.ts');
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const { laughView } = load();

test('the count is the server\'s, and a tap counts at once, only once', () => {
    assert.deepStrictEqual(laughView(null, 'a', false), { count: 0, mine: false });
    assert.deepStrictEqual(laughView({ b: true, c: true }, 'a', false), { count: 2, mine: false });
    // Tapped: counted before the server has it...
    assert.deepStrictEqual(laughView({ b: true }, 'a', true), { count: 2, mine: true });
    // ...and not twice once it has.
    assert.deepStrictEqual(laughView({ a: true, b: true }, 'a', true), { count: 2, mine: true });
    // A laugh from an earlier load of the page, not tapped here.
    assert.deepStrictEqual(laughView({ a: true }, 'a', false), { count: 1, mine: true });
});

test('the big screen only counts; anything that is not a laugh counts for nothing', () => {
    assert.deepStrictEqual(laughView({ a: true, b: true }, null, true), { count: 2, mine: false });
    assert.deepStrictEqual(laughView({ a: false, b: 'yes', c: true }, 'x', false), { count: 1, mine: false });
    assert.deepStrictEqual(laughView('nonsense', 'a', false), { count: 0, mine: false });
});
