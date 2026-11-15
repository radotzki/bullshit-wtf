// node --test .github/scripts/*.test.js
// The IndexNow ping: which URLs it sends, that it checks the key file first, that it sends at most
// one request, and that nothing that goes wrong makes it throw.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { HOST, KEY, KEY_FILE, KEY_LOCATION, ENDPOINT, urlsFromSitemap, payload, run } = require('./indexnow.js');

const ROOT = path.join(__dirname, '..', '..');

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <url>
    <loc>https://bullshit.wtf/</loc>
    <xhtml:link rel="alternate" hreflang="en" href="https://bullshit.wtf/"/>
  </url>
  <url>
    <loc>https://bullshit.wtf/he</loc>
  </url>
  <url>
    <loc> https://bullshit.wtf/how-to-play </loc>
  </url>
  <url><loc>https://bullshit.wtf/how-to-play</loc></url>
  <url><loc>http://bullshit.wtf/plain</loc></url>
  <url><loc>https://example.com/other</loc></url>
  <url><loc>https://www.bullshit.wtf/www</loc></url>
  <url><loc>https://bullshit.wtf.example.com/x</loc></url>
  <url><loc>https://bullshit.wtf:8443/port</loc></url>
  <url><loc>https://user@bullshit.wtf/user</loc></url>
  <url><loc>https://bullshit.wtf/q?a=1&amp;b=2</loc></url>
  <url><loc>https://bullshit.wtf/frag#x</loc></url>
  <url><loc>not a url</loc></url>
</urlset>
`;

function tmpSite({ sitemap = SITEMAP, key = KEY } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'indexnow-'));
    if (sitemap !== null) {
        fs.writeFileSync(path.join(dir, 'sitemap.xml'), sitemap);
    }
    if (key !== null) {
        fs.writeFileSync(path.join(dir, KEY_FILE), key);
    }
    return { sitemap: path.join(dir, 'sitemap.xml'), dist: dir };
}

// A fake fetch: the key file and the IndexNow endpoint, recording every call.
function fakeFetch({ keyStatus = 200, keyType = 'text/plain; charset=utf-8', keyBody = KEY, post = 200, throwOn = null } = {}) {
    const calls = [];
    const fn = async (url, opts = {}) => {
        calls.push({ url, opts });
        if (throwOn && url.startsWith(throwOn)) {
            throw new Error('network down');
        }
        if (url === KEY_LOCATION) {
            return { status: keyStatus, headers: new Map([['content-type', keyType]]), text: async () => keyBody };
        }
        if (url === ENDPOINT) {
            return { status: post, headers: new Map(), text: async () => '' };
        }
        throw new Error('unexpected address ' + url);
    };
    return { fn, calls };
}

const quiet = () => {
    const lines = [];
    return { log: l => lines.push(l), lines };
};

test('only https pages of bullshit.wtf itself, each once, in the sitemap\'s order', () => {
    assert.deepStrictEqual(urlsFromSitemap(SITEMAP), [
        'https://bullshit.wtf/',
        'https://bullshit.wtf/he',
        'https://bullshit.wtf/how-to-play',
    ]);
    assert.deepStrictEqual(urlsFromSitemap(''), []);
    // hreflang alternates are not <loc>s and are never sent on their own.
    assert.deepStrictEqual(urlsFromSitemap('<xhtml:link href="https://bullshit.wtf/x"/>'), []);
});

test('the request names the host, the key and the key file at the site\'s root', () => {
    assert.strictEqual(HOST, 'bullshit.wtf');
    assert.match(KEY, /^[0-9a-f]{32}$/);
    assert.strictEqual(KEY_LOCATION, 'https://bullshit.wtf/' + KEY + '.txt');
    assert.strictEqual(ENDPOINT, 'https://api.indexnow.org/indexnow');
    assert.deepStrictEqual(payload(['https://bullshit.wtf/']), {
        host: 'bullshit.wtf', key: KEY, keyLocation: KEY_LOCATION, urlList: ['https://bullshit.wtf/'],
    });
});

test('the key file is in the site\'s source, holds the key, and the build copies it to the root', () => {
    const src = path.join(ROOT, 'game', 'src', KEY_FILE);
    assert.strictEqual(fs.readFileSync(src, 'utf8').trim(), KEY);
    const angular = JSON.parse(fs.readFileSync(path.join(ROOT, 'game', 'angular.json'), 'utf8'));
    const assets = Object.values(angular.projects).map(p => p.architect.build.options.assets).flat();
    assert.ok(assets.includes('src/' + KEY_FILE), 'angular.json does not copy src/' + KEY_FILE);
    // Hosting serves a real file before any rewrite; no rewrite or header may catch the key file.
    const hosting = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8')).hosting;
    for (const r of [...(hosting.rewrites || []), ...(hosting.redirects || [])]) {
        if (r.regex) {
            assert.doesNotMatch('/' + KEY_FILE, new RegExp(r.regex), JSON.stringify(r));
        }
    }
    // A built site, when there is one here, has it at the root.
    const built = path.join(ROOT, 'game', 'dist', KEY_FILE);
    if (fs.existsSync(path.join(ROOT, 'game', 'dist', 'index.html'))) {
        assert.strictEqual(fs.readFileSync(built, 'utf8').trim(), KEY);
    }
});

test('a dry run prints the URLs and sends no request at all', async () => {
    const site = tmpSite();
    const f = fakeFetch();
    const q = quiet();
    assert.strictEqual(await run({ ...site, dryRun: true, fetchFn: f.fn, log: q.log }), 'dry-run');
    assert.strictEqual(f.calls.length, 0);
    assert.ok(q.lines.includes('  https://bullshit.wtf/he'));
    assert.ok(!q.lines.some(l => l.includes('example.com')));
});

test('a release sends one POST, after reading the live key file', async () => {
    const site = tmpSite();
    const f = fakeFetch();
    const q = quiet();
    assert.strictEqual(await run({ ...site, fetchFn: f.fn, log: q.log }), 'sent');
    assert.deepStrictEqual(f.calls.map(c => c.url), [KEY_LOCATION, ENDPOINT]);
    const post = f.calls[1].opts;
    assert.strictEqual(post.method, 'POST');
    assert.match(post.headers['Content-Type'], /^application\/json/);
    assert.deepStrictEqual(JSON.parse(post.body), payload(['https://bullshit.wtf/', 'https://bullshit.wtf/he', 'https://bullshit.wtf/how-to-play']));
    assert.ok(post.signal, 'the request has a timeout');
    // 202 is a yes too.
    assert.strictEqual(await run({ ...site, fetchFn: fakeFetch({ post: 202 }).fn, log: q.log }), 'sent');
});

test('the key file not served as IndexNow reads it: nothing is sent', async () => {
    const site = tmpSite();
    for (const opts of [
        { keyStatus: 404 },
        { keyStatus: 301 },
        { keyType: 'text/html; charset=utf-8' },
        { keyBody: '<!doctype html><html></html>' },
        { throwOn: KEY_LOCATION },
    ]) {
        const f = fakeFetch(opts);
        const q = quiet();
        assert.strictEqual(await run({ ...site, fetchFn: f.fn, log: q.log }), 'not-sent', JSON.stringify(opts));
        assert.deepStrictEqual(f.calls.map(c => c.url), [KEY_LOCATION]);
        assert.match(q.lines.join('\n'), /::warning title=IndexNow, nothing sent/);
    }
});

test('a refused or failed request is a warning, never a throw', async () => {
    const site = tmpSite();
    for (const post of [400, 403, 422, 429, 500]) {
        const q = quiet();
        assert.strictEqual(await run({ ...site, fetchFn: fakeFetch({ post }).fn, log: q.log }), 'refused');
        assert.match(q.lines.join('\n'), new RegExp('::warning title=IndexNow refused the URLs.*' + post));
    }
    const q = quiet();
    assert.strictEqual(await run({ ...site, fetchFn: fakeFetch({ throwOn: ENDPOINT }).fn, log: q.log }), 'not-sent');
});

test('no sitemap, no page of the site in it, or no key file in the build: nothing is sent', async () => {
    for (const opts of [{ sitemap: null }, { sitemap: '<urlset><url><loc>https://example.com/</loc></url></urlset>' }, { key: null }, { key: 'wrong' }]) {
        const f = fakeFetch();
        const q = quiet();
        assert.strictEqual(await run({ ...tmpSite(opts), fetchFn: f.fn, log: q.log }), 'not-sent', JSON.stringify(opts));
        assert.strictEqual(f.calls.length, 0);
    }
});

test('run from the command line, it exits 0 also when there is nothing to send', () => {
    const missing = path.join(os.tmpdir(), 'indexnow-no-such-dir', 'sitemap.xml');
    const out = execFileSync(process.execPath, [path.join(__dirname, 'indexnow.js'), '--dry-run', missing], { encoding: 'utf8' });
    assert.match(out, /nothing sent/);
});
