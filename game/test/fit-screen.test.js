// Tests for the scale that fits a page of the big screen to a TV's height
// (src/app/directives/fit-screen.ts, used by fit-screen.directive.ts), and that the three pages the
// room watches ask for it only on the big screen. Run: npm test (from game/). Needs Node 20+.
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

const app = path.join(__dirname, '..', 'src', 'app');
const { fittingScale, SMALLEST_SCALE } = load(path.join(app, 'directives', 'fit-screen.ts'));

// A page whose height shrinks with its scale: `tall` pixels at scale 1, on a screen of `screen` pixels.
function page(tall, screen) {
    const looks = [];
    const fitsAt = (scale) => {
        looks.push(scale);
        return tall * scale <= screen;
    };
    return { fitsAt, looks };
}

test('a page that fits is left alone, after one look', () => {
    const p = page(700, 720);
    assert.strictEqual(fittingScale(p.fitsAt), 1);
    assert.deepStrictEqual(p.looks, [1]);
});

test('a page too tall gets the largest scale that fits, to a hundredth', () => {
    // 12 players' answers at 1280x720 were 898 px tall: 720 / 898 = 0.8018.
    assert.strictEqual(fittingScale(page(898, 720).fitsAt), 0.8);
    assert.strictEqual(fittingScale(page(811, 720).fitsAt), 0.88);
    assert.strictEqual(fittingScale(page(1158, 1080).fitsAt), 0.93);
    assert.strictEqual(fittingScale(page(721, 720).fitsAt), 0.99);
});

test('the scale it returns fits, and one hundredth more does not', () => {
    for (let tall = 721; tall <= 1440; tall += 7) {
        const scale = fittingScale(page(tall, 720).fitsAt);
        assert.ok(tall * scale <= 720, `${tall} px at ${scale}`);
        assert.ok(scale === 1 || tall * (scale + 0.01) > 720, `${tall} px could be larger than ${scale}`);
    }
});

test('it never shrinks below the smallest readable scale, and takes few looks', () => {
    const p = page(5000, 720);
    assert.strictEqual(fittingScale(p.fitsAt), SMALLEST_SCALE);
    assert.ok(SMALLEST_SCALE >= 0.5, 'half size is the least a sofa can read');
    assert.ok(p.looks.length <= 8, `${p.looks.length} looks`);
    assert.ok(p.looks.every((s) => s >= SMALLEST_SCALE && s <= 1));
});

test('a page that reflows as it shrinks (its height is not its scale times a constant) still fits', () => {
    // Lines join as the page widens: the height drops in steps.
    const fitsAt = (scale) => (scale > 0.9 ? 900 : scale > 0.7 ? 760 : 600) * scale <= 720;
    const scale = fittingScale(fitsAt);
    assert.ok(fitsAt(scale));
    assert.strictEqual(scale, 0.9);
});

test('the lobby, the answers and the final ask for the fit on the big screen only', () => {
    for (const name of ['game-staging', 'show-answers', 'score-board-final']) {
        const html = fs.readFileSync(path.join(app, 'pages', name, `${name}.component.html`), 'utf8');
        const section = /<section class="game-container[^>]*>/.exec(html);
        assert.ok(section, `${name} has no outer section`);
        assert.ok(section[0].includes('[appFitScreen]="presenter"'), `${name}: the outer section needs [appFitScreen]="presenter"`);
    }
    const directive = fs.readFileSync(path.join(app, 'directives', 'fit-screen.directive.ts'), 'utf8');
    assert.ok(/if \(this\.on && !this\.watching && supportsZoom\(\)\)/.test(directive), 'a phone (false) must not be watched or scaled');
    const styles = fs.readFileSync(path.join(app, '..', 'styles', 'game.scss'), 'utf8');
    assert.ok(/\.game-container\.fit-screen\s*{\s*overflow: hidden;/.test(styles), 'the fit measures what .fit-screen hides');
});
