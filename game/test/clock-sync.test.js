// Tests for the phone's clock sync with the server (src/app/services/clock-sync.ts).
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load() {
    const file = path.join(__dirname, '..', 'src', 'app', 'services', 'clock-sync.ts');
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const { clockSync } = load();

test('a good answer is asked for once and kept', async () => {
    let calls = 0;
    const offset = clockSync(() => { calls++; return Promise.resolve(1500); });
    assert.strictEqual(await offset(), 1500);
    assert.strictEqual(await offset(), 1500);
    assert.strictEqual(calls, 1);
});

test('one failed call falls back to the phone clock and the next call asks again (BULLSHIT-WS)', async () => {
    let calls = 0;
    const errors = [];
    const answers = [
        () => Promise.reject(new Error('Network error calling time')),
        () => Promise.resolve(-800),
    ];
    const offset = clockSync(() => answers[calls++](), err => errors.push(err.message));

    assert.strictEqual(await offset(), 0);
    assert.deepStrictEqual(errors, ['Network error calling time']);

    assert.strictEqual(await offset(), -800);
    assert.strictEqual(await offset(), -800);
    assert.strictEqual(calls, 2);
});

test('a call that throws before it returns a promise is handled the same way', async () => {
    let calls = 0;
    const offset = clockSync(() => {
        calls++;
        if (calls === 1) {
            throw new Error('boom');
        }
        return Promise.resolve(42);
    });
    assert.strictEqual(await offset(), 0);
    assert.strictEqual(await offset(), 42);
});

test('callers waiting on the failed call all get the fallback, not a rejection', async () => {
    const offset = clockSync(() => Promise.reject(new Error('offline')));
    const results = await Promise.all([offset(), offset(), offset()]);
    assert.deepStrictEqual(results, [0, 0, 0]);
});
