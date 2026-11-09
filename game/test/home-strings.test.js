// Tests for the home menu's words (src/app/pages/landing/home-strings.ts).
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

const app = path.join(__dirname, '..', 'src', 'app');
const { homeStrings } = load(path.join(app, 'pages', 'landing', 'home-strings.ts'));
const source = load(path.join(app, 'services', 'join-source.ts'));

test('English visitors keep the English menu word for word', () => {
    const en = homeStrings('en');
    assert.strictEqual(homeStrings(undefined), en);
    assert.strictEqual(homeStrings('fr'), en);
    assert.strictEqual(en.dir, 'ltr');
    assert.strictEqual(en.title, 'BULLSHIT');
    assert.strictEqual(en.join, 'Join Game');
    assert.strictEqual(en.joinHint, 'Join a game by entering its PIN');
    assert.strictEqual(en.create, 'Create Game');
    assert.strictEqual(en.present, 'Present Game');
    assert.strictEqual(en.learn, 'How Do I Play?');
    assert.strictEqual(en.joinShort, 'Join');
    assert.strictEqual(en.learnShort, 'Learn');
    assert.strictEqual(en.switchTo, 'he');
});

test('Hebrew visitors get every word in Hebrew, right to left', () => {
    const he = homeStrings('he');
    assert.strictEqual(he.dir, 'rtl');
    assert.strictEqual(he.switchTo, 'en');
    for (const [key, value] of Object.entries(he)) {
        if (['lang', 'dir', 'switchTo', 'switchLabel'].indexOf(key) >= 0) continue;
        assert.ok(/[֐-׿]/.test(value), `${key} is not Hebrew: ${value}`);
        assert.ok(!/[A-Za-z]/.test(value), `${key} has Latin letters: ${value}`);
    }
    assert.deepStrictEqual(Object.keys(he).sort(), Object.keys(homeStrings('en')).sort());
});

function withBrowser(language, saved, fn) {
    const store = {};
    if (saved) store.BS_SITE_LOCALE = saved;
    global.window = { localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } };
    // Node 21+ has a read-only global navigator: replace it for the test, then put it back.
    const had = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { language }, configurable: true, writable: true });
    try { return fn(store); } finally {
        delete global.window;
        delete globalThis.navigator;
        if (had) Object.defineProperty(globalThis, 'navigator', had);
    }
}

test('the browser language picks the menu until the visitor switches', () => {
    assert.strictEqual(withBrowser('he-IL', null, () => source.preferredLocale()), 'he');
    assert.strictEqual(withBrowser('iw', null, () => source.preferredLocale()), 'he');
    assert.strictEqual(withBrowser('en-US', null, () => source.preferredLocale()), 'en');
    assert.strictEqual(withBrowser('en-US', 'he', () => source.preferredLocale()), 'he');
    withBrowser('he-IL', null, store => {
        source.setPreferredLocale('en');
        assert.strictEqual(store.BS_SITE_LOCALE, 'en');
        assert.strictEqual(source.preferredLocale(), 'en');
        source.setPreferredLocale('xx');
        assert.strictEqual(store.BS_SITE_LOCALE, 'en');
    });
});
