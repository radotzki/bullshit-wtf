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

test('a caller that passes null gets null, not a guessed 0, when the call failed', async () => {
    let calls = 0;
    const answers = [
        () => Promise.reject(new Error('offline')),
        () => Promise.resolve(300000),
    ];
    const offset = clockSync(() => answers[calls++]());
    assert.strictEqual(await offset(null), null);
    assert.strictEqual(await offset(null), 300000);
    assert.strictEqual(await offset(), 300000);
});

test('callers sharing one failed call each get their own fallback', async () => {
    const offset = clockSync(() => Promise.reject(new Error('offline')));
    const results = await Promise.all([offset(), offset(null), offset(0)]);
    assert.deepStrictEqual(results, [0, null, 0]);
});

test('a measured offset of 0 is kept as 0 for every caller', async () => {
    const offset = clockSync(() => Promise.resolve(0));
    assert.strictEqual(await offset(null), 0);
    assert.strictEqual(await offset(), 0);
});

// A request that never settles: no answer and no error, ever.
const never = () => new Promise(() => {});
function later(ms, value) {
    return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

test('a call that never settles counts as failed after the timeout, and the next call asks again', async () => {
    let calls = 0;
    const errors = [];
    const answers = [never, () => Promise.resolve(-800)];
    const offset = clockSync(() => answers[calls++](), err => errors.push(err.message), 20);

    // The countdown gets the phone's own clock, the lobby gets "unknown": neither waits for good.
    assert.deepStrictEqual(await Promise.all([offset(), offset(null)]), [0, null]);
    assert.strictEqual(errors.length, 1);
    assert.match(errors[0], /timed out/);

    assert.strictEqual(await offset(null), -800);
    assert.strictEqual(await offset(), -800);
    assert.strictEqual(calls, 2);
});

test('an answer that arrives after the timeout never replaces a newer one', async () => {
    let calls = 0;
    const answers = [() => later(60, 111111), () => Promise.resolve(222)];
    const offset = clockSync(() => answers[calls++](), undefined, 20);

    assert.strictEqual(await offset(null), null);
    assert.strictEqual(await offset(null), 222);
    await later(80);
    assert.strictEqual(await offset(null), 222);
    assert.strictEqual(calls, 2);
});

test('the default timeout is a few seconds', async () => {
    const { CLOCK_TIMEOUT_MS } = load();
    assert.ok(CLOCK_TIMEOUT_MS >= 3000 && CLOCK_TIMEOUT_MS <= 15000, String(CLOCK_TIMEOUT_MS));
});

test('no timer outlives a call, answered or failed', async () => {
    const realSet = global.setTimeout;
    const realClear = global.clearTimeout;
    const live = new Set();
    global.setTimeout = (fn, ms) => {
        const t = realSet(() => { live.delete(t); fn(); }, ms);
        live.add(t);
        return t;
    };
    global.clearTimeout = t => { live.delete(t); realClear(t); };
    try {
        const good = clockSync(() => Promise.resolve(5));
        assert.strictEqual(await good(), 5);
        const bad = clockSync(() => Promise.reject(new Error('offline')));
        assert.strictEqual(await bad(), 0);
        assert.strictEqual(live.size, 0);
    } finally {
        global.setTimeout = realSet;
        global.clearTimeout = realClear;
    }
});
