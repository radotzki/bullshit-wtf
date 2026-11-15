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
function run(script, { plain, search = '', stored = {}, kept = null, blocked = false } = {}) {
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
        addEventListener: () => {},
        setTimeout: (fn, ms) => timers.push(ms),
    };
    // kept: the tag the game stored for this tab (BS_CAMPAIGN); blocked: reading storage throws.
    Object.defineProperty(sandbox, 'sessionStorage', {
        get() {
            if (blocked) { throw new Error('blocked'); }
            return { getItem: (k) => (k === 'BS_CAMPAIGN' ? kept : null) };
        },
    });
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

test('a tab that arrived as a play-test keeps its test tag on an invite link or a lobby code', () => {
    const tag = (opts) => run(match[2], opts).posts[0].body.tag;
    // The game stored the tag the tab arrived with; the link's own tag does not replace a test tag.
    assert.strictEqual(tag({ search: '?via=link', kept: 'test' }), 'test');
    assert.strictEqual(tag({ search: '?via=qr', kept: 'test-qa' }), 'test-qa');
    assert.strictEqual(tag({ search: '?via=fb-he-friday', kept: 'test' }), 'test');
    assert.strictEqual(tag({ search: '', kept: 'test' }), 'test');
    // Any other stored tag gives way to the link's tag, and fills in when the link has none.
    assert.strictEqual(tag({ search: '?via=link', kept: 'fb-he-friday' }), 'link');
    assert.strictEqual(tag({ search: '?via=link', kept: 'testing' }), 'link');
    assert.strictEqual(tag({ search: '', kept: 'fb-he-friday' }), 'fb-he-friday');
    // A browser that blocks storage still sends the link's tag.
    assert.strictEqual(tag({ search: '?via=link', blocked: true }), 'link');
    assert.strictEqual(tag({ search: '', blocked: true }), '');
});

/** Run a plain page's own scripts against its real links and return each link's address after. */
function linksAfter(html, search) {
    const links = [];
    html.replace(/<a\b[^>]*\bhref="([^"]*)"[^>]*>/g, (tagHtml, href) => {
        const attrs = { href: href.replace(/&amp;/g, '&') };
        links.push({ before: attrs.href, btn: /class="btn/.test(tagHtml), getAttribute: (n) => attrs[n], setAttribute: (n, v) => { attrs[n] = v; }, attrs });
    });
    const body = html.slice(html.indexOf('<body'));
    const scripts = [];
    body.replace(/<script>([\s\S]*?)<\/script>/g, (all, js) => scripts.push(js));
    assert.strictEqual(scripts.length, 1, 'one script in the body');
    vm.runInNewContext(scripts[0], {
        location: { search },
        document: { querySelectorAll: (sel) => {
            assert.strictEqual(sel, 'a[href]');
            return links;
        } },
    });
    return links.map(l => ({ before: l.before, after: l.attrs.href, btn: l.btn }));
}

test('every link from a plain page into the site keeps the post tag', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-pages-'));
    try {
        execFileSync(process.execPath, [path.join(root, 'seo', 'build-pages.js'), out], { stdio: 'pipe' });
        const files = htmlFiles(out);
        let into = 0;
        files.forEach(f => {
            const name = path.relative(out, f);
            const html = fs.readFileSync(f, 'utf8');
            const links = linksAfter(html, '?utm=1&via=fb-he-hanukkah-parents');
            assert.ok(links.length >= 4, name + ' has links');
            links.forEach(l => {
                if (/^\/(?!\/)/.test(l.before)) {
                    // A path of the site: the tag is added once, before any #fragment.
                    assert.match(l.after, /^\/[^#]*[?&]via=fb-he-hanukkah-parents(#.*)?$/, name + ': ' + l.before);
                    assert.strictEqual(l.after.split('via=').length, 2, name + ': ' + l.after);
                    // A link's own tag (a kit or occasion page's Start button) gives way to the post's.
                    const own = l.before.replace(/([?&])via=[^&#]*&?/, '$1').replace(/[?&](?=#|$)/, '');
                    assert.strictEqual(l.after.replace(/[?&]via=fb-he-hanukkah-parents/, ''), own, name);
                } else {
                    assert.strictEqual(l.after, l.before, name + ': a link to another site is left alone');
                }
            });
            // The ways into the game named in the review: the logo, the two buttons, the links in the text.
            const after = links.map(l => l.after);
            assert.ok(after.some(h => /^\/(he)?\?via=fb-he-hanukkah-parents$/.test(h)), name + ': the logo');
            assert.strictEqual(links.filter(l => l.btn && /via=fb-he-hanukkah-parents/.test(l.after)).length, links.filter(l => l.btn).length, name + ': every button');
            into += links.filter(l => !l.btn && /^\/(he\/)?(create-game|join-game|present-game)\?via=/.test(l.after)).length;
            // No tag on the address: nothing changes. A tag with other characters is not copied.
            assert.ok(linksAfter(html, '').every(l => l.after === l.before), name);
            assert.ok(linksAfter(html, '?via=<script>').every(l => l.after === l.before), name);
            assert.ok(linksAfter(html, '?via=a"b').every(l => l.after === l.before), name);
        });
        assert.ok(into >= 6, 'the text links into the game (create, join, present) carry the tag: ' + into);
    } finally {
        fs.rmSync(out, { recursive: true, force: true });
    }
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
