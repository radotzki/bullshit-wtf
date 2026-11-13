// Tests that automated browser runs stay out of Sentry (src/app/sentry/automated.ts).
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const dir = path.join(__dirname, '..', 'src', 'app', 'sentry');

function load() {
    const out = ts.transpileModule(fs.readFileSync(path.join(dir, 'automated.ts'), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const { isAutomatedBrowser } = load();

test('a browser under automation is recognised', () => {
    assert.strictEqual(isAutomatedBrowser({ webdriver: true }), true);
});

test('real players are never treated as automated', () => {
    assert.strictEqual(isAutomatedBrowser({ webdriver: false }), false);
    assert.strictEqual(isAutomatedBrowser({}), false);
    assert.strictEqual(isAutomatedBrowser(null), false);
    assert.strictEqual(isAutomatedBrowser(undefined), false);
    assert.strictEqual(isAutomatedBrowser({ webdriver: 'true' }), false);
});

test('a navigator whose webdriver getter throws counts as a player', () => {
    const nav = {};
    Object.defineProperty(nav, 'webdriver', { get() { throw new Error('blocked'); } });
    assert.strictEqual(isAutomatedBrowser(nav), false);
});

test('the Sentry client is configured to drop events from automated browsers', () => {
    const src = fs.readFileSync(path.join(dir, 'sentry.module.ts'), 'utf8');
    assert.match(src, /shouldSendCallback:\s*\(\)\s*=>\s*!isAutomatedBrowser\(/);
    assert.match(src, /import \{ isAutomatedBrowser \} from '\.\/automated';/);
});
