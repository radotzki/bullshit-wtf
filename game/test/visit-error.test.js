// The page reports its own errors to the visit beacon, so the night check counts them as bad views:
// an app error after drawing (src/app/sentry/visit-error.ts, called from Angular's error handler)
// and the 404 page (scripts/build-404.js). Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const dir = path.join(root, 'src', 'app', 'sentry');
const index = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
const beacon = /<!-- BS:VISIT:START -->\s*<script>([\s\S]*?)<\/script>\s*<!-- BS:VISIT:END -->/.exec(index)[1];

function load() {
    const out = ts.transpileModule(fs.readFileSync(path.join(dir, 'visit-error.ts'), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}
const { visitErrorText, markVisitError } = load();

/** The beacon in a bare fake page; returns its posts and the window. */
function page({ plain = false } = {}) {
    const posts = [];
    const w = {
        document: {
            referrer: '', visibilityState: 'visible',
            documentElement: { getAttribute: (n) => (n === 'data-page' && plain ? 'plain' : null) },
            querySelector: () => null, addEventListener: () => {},
        },
        location: { pathname: '/', search: '', hostname: 'bullshit.wtf', origin: 'https://bullshit.wtf' },
        navigator: { language: 'he-IL', sendBeacon: (to, body) => { posts.push(JSON.parse(body)); return true; } },
        localStorage: { length: 0 }, sessionStorage: { getItem: () => null },
        addEventListener: () => {}, setTimeout: () => {},
    };
    w.window = w;
    vm.runInNewContext(beacon, w);
    return { posts, w };
}

test('an app error becomes a short text with no address in it', () => {
    assert.strictEqual(visitErrorText(new TypeError('e is undefined')), 'app error: TypeError: e is undefined');
    assert.strictEqual(visitErrorText(new Error('boom')), 'app error: Error: boom');
    // A message that already starts with its name is not doubled.
    const fb = new Error('FirebaseError: permission denied'); fb.name = 'FirebaseError';
    assert.strictEqual(visitErrorText(fb), 'app error: FirebaseError: permission denied');
    // An address can carry a PIN or a crew id: it is dropped.
    assert.strictEqual(visitErrorText(new Error('failed to load https://bullshit.wtf/join-game/ABCD?x=1 now')), 'app error: Error: failed to load <url> now');
    assert.ok(visitErrorText(new Error('x'.repeat(500))).length <= 120);
    assert.strictEqual(visitErrorText(undefined), 'app error: undefined');
    assert.strictEqual(visitErrorText(new Error('')), 'app error: Error');
});

test('markVisitError hands the text to the beacon, and never throws', () => {
    const calls = [];
    markVisitError(new Error('boom'), { bsVisit: (k, t) => calls.push([k, t]) });
    assert.deepStrictEqual(calls, [['err', 'app error: Error: boom']]);
    // No beacon (blocked or a test page), a beacon that throws, no window: nothing breaks.
    markVisitError(new Error('boom'), {});
    markVisitError(new Error('boom'), null);
    markVisitError(new Error('boom'), { bsVisit: () => { throw new Error('beacon'); } });
    const bad = { get message() { throw new Error('getter'); } };
    assert.strictEqual(visitErrorText(bad), 'app error: error');
});

test("Angular's error handler gives the beacon the error, after Sentry", () => {
    const src = fs.readFileSync(path.join(dir, 'sentry.module.ts'), 'utf8');
    const body = /handleError\(err: any\): void \{([\s\S]*?)\n    \}/.exec(src)[1];
    assert.ok(/import \{ markVisitError \} from '\.\/visit-error';/.test(src));
    assert.ok(body.indexOf("reportError(cause, 'unhandled')") >= 0);
    assert.ok(body.indexOf('markVisitError(toError(cause))') > body.indexOf("reportError(cause, 'unhandled')"));
});

test("the beacon's err mark: one row at once, the first text wins, and later rows carry it", () => {
    const { posts, w } = page();
    w.bsVisit('err', 'app error: TypeError: x');
    w.bsVisit('err', 'app error: second');
    w.bsVisit('err');
    assert.deepStrictEqual(posts.map(p => [p.k, p.err]), [['view', ''], ['err', 'app error: TypeError: x']]);
    w.bsVisit('create');
    assert.strictEqual(posts[2].err, 'app error: TypeError: x');
    // No text: still marked.
    const other = page();
    other.w.bsVisit('err');
    assert.deepStrictEqual(other.posts.map(p => [p.k, p.err]), [['view', ''], ['err', 'error']]);
});

test('the 404 page runs the beacon, then marks its own view "404 page"', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-404-'));
    try {
        execFileSync(process.execPath, [path.join(root, 'scripts', 'build-404.js'), out], { stdio: 'pipe' });
        const html = fs.readFileSync(path.join(out, '404.html'), 'utf8');
        const scripts = [];
        html.slice(0, html.indexOf('</head>')).replace(/<script>([\s\S]*?)<\/script>/g, (all, js) => scripts.push(js));
        assert.strictEqual(scripts.length, 2, 'the beacon, then the mark');
        assert.strictEqual(scripts[0], beacon, 'the same beacon as the game page');
        assert.ok(/<html [^>]*data-page="plain"/.test(html));
        const { posts, w } = page({ plain: true });
        vm.runInNewContext(scripts[1], w);
        assert.deepStrictEqual(posts.map(p => [p.k, p.err, p.pl]), [['view', '', true], ['err', '404 page', true]]);
        // Without the beacon (a blocker removed it), the mark does nothing and throws nothing.
        vm.runInNewContext(scripts[1], { window: {} });
    } finally {
        fs.rmSync(out, { recursive: true, force: true });
    }
});
