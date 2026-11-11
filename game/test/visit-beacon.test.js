// The visit beacon on the pages people land on: the game's own page carries it between the
// BS:VISIT markers, every plain page (how to play and the search pages) gets the same script,
// and the retired Google Analytics tag is gone from all of them.
//   node --test test/visit-beacon.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
const match = /<!-- BS:VISIT:START -->\s*(<script>([\s\S]*?)<\/script>)\s*<!-- BS:VISIT:END -->/.exec(index);

function htmlFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).reduce((all, e) => {
        const p = path.join(dir, e.name);
        return all.concat(e.isDirectory() ? htmlFiles(p) : /\.html$/.test(e.name) ? [p] : []);
    }, []);
}

/** Run the beacon in a bare fake page and return what it posted. */
function run(script, { plain, search = '', stored = {} } = {}) {
    const posts = [];
    const timers = [];
    const sandbox = {
        document: {
            referrer: 'https://www.google.com/search?q=party+game',
            visibilityState: 'visible',
            documentElement: { getAttribute: (n) => (n === 'data-page' && plain ? 'plain' : null) },
            querySelector: () => null,
            addEventListener: () => {},
        },
        location: { pathname: '/how-to-play', search, hostname: 'bullshit.wtf', origin: 'https://bullshit.wtf' },
        navigator: { language: 'en-GB', sendBeacon: (to, body) => { posts.push({ to, body: JSON.parse(body) }); return true; } },
        localStorage: { get length() { return Object.keys(stored).length; } },
        sessionStorage: { getItem: () => null },
        addEventListener: () => {},
        setTimeout: (fn, ms) => timers.push(ms),
    };
    sandbox.window = sandbox;
    vm.runInNewContext(script, sandbox);
    return { posts, timers, sandbox };
}

test('the game page carries the beacon first, and no Google Analytics', () => {
    assert.ok(match, 'BS:VISIT markers in src/index.html');
    assert.ok(index.indexOf('<!-- BS:VISIT:START -->') < index.indexOf('<meta name="description"'), 'before everything else in <head>');
    assert.ok(!/googletagmanager|google-analytics|gtag\(|dataLayer|UA-\d+/.test(index), 'the retired tag is gone');
    // The app no longer calls the tag where a missing one would throw.
    const session = fs.readFileSync(path.join(root, 'src', 'app', 'services', 'session.service.ts'), 'utf8');
    assert.ok(!/gtag/.test(session));
});

test('the beacon posts a view as the page opens, with no cookie and nothing stored', () => {
    const { posts, timers, sandbox } = run(match[2], { search: '?via=fb-he-friday&x=1' });
    assert.strictEqual(posts.length, 1);
    assert.strictEqual(posts[0].to, '/_v');
    const b = posts[0].body;
    assert.deepStrictEqual(Object.keys(b).sort(), ['booted', 'cr', 'err', 'first', 'fv', 'jn', 'k', 'lang', 'last', 'ms', 'pl', 'ref', 'tag', 'v', 'wd']);
    assert.deepStrictEqual([b.k, b.first, b.ref, b.tag, b.fv, b.cr, b.jn, b.pl, b.lang], ['view', '/how-to-play', 'www.google.com', 'fb-he-friday', true, false, false, false, 'en-GB']);
    assert.deepStrictEqual(timers, [12000]);
    // The script has no word for a cookie or for writing to storage.
    assert.ok(!/cookie|setItem|indexedDB/.test(match[2]));
    assert.strictEqual(typeof sandbox.bsVisit, 'function');
    sandbox.bsVisit('create');
    sandbox.bsVisit('something-else');
    assert.deepStrictEqual(posts.map(p => [p.body.k, p.body.cr]), [['view', false], ['create', true]]);
    assert.strictEqual(posts[1].body.v, posts[0].body.v);
    // A browser that already holds something of the game is not a first visit.
    assert.strictEqual(run(match[2], { stored: { BS_PLAYER: '{}' } }).posts[0].body.fv, false);
});

test('every plain page gets the same beacon and is marked plain; none has Google Analytics', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-pages-'));
    try {
        execFileSync(process.execPath, [path.join(root, 'seo', 'build-pages.js'), out], { stdio: 'pipe' });
        const files = htmlFiles(out);
        assert.ok(files.length >= 8, 'the plain pages were written');
        files.forEach(f => {
            const html = fs.readFileSync(f, 'utf8');
            assert.ok(html.indexOf(match[1]) > 0, path.relative(out, f) + ' carries the beacon');
            assert.ok(html.indexOf(match[1]) < html.indexOf('<title>'), path.relative(out, f) + ' runs it first');
            assert.ok(/<html [^>]*data-page="plain"/.test(html), path.relative(out, f) + ' is marked plain');
            assert.ok(!/googletagmanager|google-analytics|gtag\(/.test(html), path.relative(out, f));
        });
        // On a plain page there is no app to wait for: no 12 s timer, and the row says plain.
        const { posts, timers } = run(match[2], { plain: true });
        assert.deepStrictEqual(timers, []);
        assert.strictEqual(posts[0].body.pl, true);
    } finally {
        fs.rmSync(out, { recursive: true, force: true });
    }
});
