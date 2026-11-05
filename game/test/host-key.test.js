// Tests for the phone's one-game host keys (src/app/services/host-key.ts).
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const file = path.join(__dirname, '..', 'src', 'app', 'services', 'host-key.ts');
const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 },
}).outputText;

function fakeStorage(store = {}) {
    return {
        getItem: k => k in store ? store[k] : null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; },
    };
}

function load(window) {
    const mod = { exports: {} };
    new Function('module', 'exports', 'window', js)(mod, mod.exports, window);
    return mod.exports;
}

test('a new key is 24 letters and digits, and different each time', () => {
    const k = load({ crypto: require('crypto').webcrypto });
    const a = k.newHostKey(), b = k.newHostKey();
    assert.match(a, /^[A-Za-z0-9]{24}$/);
    assert.notStrictEqual(a, b);
    // The server accepts it (cleanHostKey in functions/src/index.ts).
    assert.match(a, /^[A-Za-z0-9_-]{16,64}$/);
});

test('the key is remembered per game, survives a reload, and is found by any case of PIN', () => {
    const store = {};
    const first = load({ localStorage: fakeStorage(store) });
    first.rememberHostKey('juPk', 'key-1');
    const again = load({ localStorage: fakeStorage(store) });
    assert.strictEqual(again.hostKeyFor('JUPK'), 'key-1');
    assert.strictEqual(again.hostKeyFor('jupk'), 'key-1');
    assert.strictEqual(again.hostKeyFor('JUPL'), undefined);
    assert.strictEqual(again.hostKeyFor(null), undefined);
});

test('only the last 10 games are kept', () => {
    const k = load({ localStorage: fakeStorage() });
    for (let i = 0; i < 12; i++) k.rememberHostKey('G' + i, 'key' + i);
    assert.strictEqual(k.hostKeyFor('G0'), undefined);
    assert.strictEqual(k.hostKeyFor('G1'), undefined);
    assert.strictEqual(k.hostKeyFor('G2'), 'key2');
    assert.strictEqual(k.hostKeyFor('G11'), 'key11');
});

test('with storage blocked, the key still lasts for this page', () => {
    const window = {};
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
    Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('blocked'); } });
    const k = load(window);
    k.rememberHostKey('ABCD', 'key-x');
    assert.strictEqual(k.hostKeyFor('ABCD'), 'key-x');
});

test('broken saved data is ignored', () => {
    const k = load({ localStorage: fakeStorage({ BS_HOST_KEYS: '{not json' }) });
    assert.strictEqual(k.hostKeyFor('ABCD'), undefined);
    k.rememberHostKey('ABCD', 'key-y');
    assert.strictEqual(k.hostKeyFor('ABCD'), 'key-y');
});
