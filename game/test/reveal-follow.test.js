// Tests for the staged reveal on a phone: where the page scrolls to when the scores arrive
// (src/app/pages/reveal-the-truth/reveal-follow.ts), and the direction of the points in its template.
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const dir = path.join(__dirname, '..', 'src', 'app', 'pages', 'reveal-the-truth');

function load() {
    const out = ts.transpileModule(fs.readFileSync(path.join(dir, 'reveal-follow.ts'), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const { followScrollTop, TRUTH_MARGIN_PX } = load();

test('before the truth is up, the page follows the newest row to the bottom', () => {
    assert.strictEqual(followScrollTop(900, 400, null), 500);
    assert.strictEqual(followScrollTop(900, 400, undefined), 500);
    assert.strictEqual(followScrollTop(300, 400, null), 0);
});

test('everything fits below the truth: the page goes to the bottom, as before', () => {
    // 390x844 with 8 players: the truth starts at 380, the bottom is at 250.
    assert.strictEqual(followScrollTop(950, 700, 380), 250);
});

test('a short phone with many players: the page stops with the truth row at the top', () => {
    // 320x568 with 8 players: the bottom would be 520, far below the truth row's top at 210.
    const top = followScrollTop(980, 460, 210);
    assert.strictEqual(top, 210 - TRUTH_MARGIN_PX);
    assert.ok(top <= 210, 'the top of the truth row is not above the edge');
});

test('the scroll position is never negative, and never past the bottom', () => {
    assert.strictEqual(followScrollTop(980, 460, 2), 0);
    assert.strictEqual(followScrollTop(980, 460, 5000), 520);
    assert.strictEqual(followScrollTop(980, 460, NaN), 520);
});

test('every points figure of the staged reveal is marked left to right', () => {
    // Inside the right-to-left stage an unmarked "+500" is drawn as "500+".
    const html = fs.readFileSync(path.join(dir, 'reveal-the-truth.component.html'), 'utf8');
    const stage = html.slice(html.indexOf('class="reveal stage"'));
    const spans = stage.match(/<(span|p)[^>]*>\s*\{\{[^}]*\|\s*bsPoints\s*\}\}/g) || [];
    assert.ok(spans.length >= 5, `found ${spans.length} points figures`);
    spans.forEach(tag => assert.ok(/dir="ltr"/.test(tag), tag));
});
