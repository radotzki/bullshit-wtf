// The two home pages as search engines read them, the "not found" page, and the game's screens kept
// out of search: scripts/build-he.js, scripts/build-404.js, src/index.html (BS:ABOUT), firebase.json
// and src/app/services/home-about.ts. Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ts = require('typescript');
const pages = require('../seo/pages');

const GAME = path.join(__dirname, '..');
const ROOT = path.join(GAME, '..');

function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}
const { aboutPlace } = load(path.join(GAME, 'src', 'app', 'services', 'home-about.ts'));

// build-he.js and build-404.js run on a copy of src/index.html, as they do on the built one.
function built() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-homes-'));
    fs.copyFileSync(path.join(GAME, 'src', 'index.html'), path.join(dir, 'index.html'));
    execFileSync(process.execPath, [path.join(GAME, 'scripts', 'build-he.js'), dir], { stdio: 'pipe' });
    execFileSync(process.execPath, [path.join(GAME, 'scripts', 'build-404.js'), dir], { stdio: 'pipe' });
    const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8');
    const out = { en: read('index.html'), he: read('he.html'), notFound: read('404.html') };
    fs.rmSync(dir, { recursive: true, force: true });
    return out;
}
const html = built();

// The text a search engine reads without running anything: the BS:ABOUT block, tags taken out.
function aboutText(page) {
    const m = /<!-- BS:ABOUT:START -->([\s\S]*?)<!-- BS:ABOUT:END -->/.exec(page);
    assert.ok(m, 'BS:ABOUT block');
    return m[1];
}
const words = (s) => s.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean);
const links = (s) => [...s.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
const paths = pages.map(p => p.path).concat(['/', '/he']);

test('he.html is a Hebrew page: language and direction, title, schema.org block', () => {
    assert.match(html.he, /<html lang="he" dir="rtl"/);
    assert.match(html.en, /<html lang="en"/);
    const title = /<title>([^<]*)<\/title>/.exec(html.he)[1];
    assert.match(title, /^בולשיט: /);
    assert.match(title, /משחק/);
    assert.ok(title.length <= 60, title);
    const ld = JSON.parse(/<script type="application\/ld\+json">([^<]*)<\/script>/.exec(html.he)[1]);
    assert.strictEqual(ld.name, 'בולשיט');
    assert.strictEqual(ld.url, 'https://bullshit.wtf/he');
    // The English page keeps its own.
    const enLd = JSON.parse(/<script type="application\/ld\+json">([^<]*)<\/script>/.exec(html.en)[1]);
    assert.strictEqual(enLd.name, 'Bullshit');
    assert.strictEqual(enLd.url, 'https://bullshit.wtf/');
    // The link-preview tags and hreflang stay as they were.
    assert.match(html.he, /<link rel="canonical" href="https:\/\/bullshit.wtf\/he">/);
    assert.match(html.he, /<meta property="og:locale" content="he_IL">/);
    assert.match(html.he, /hreflang="x-default" href="https:\/\/bullshit.wtf\/"/);
});

test('both home pages carry real text, headings and links to the search pages, in their own language', () => {
    const en = aboutText(html.en);
    const he = aboutText(html.he);
    assert.match(en, /<main id="bs-about"[^>]*lang="en"/);
    assert.match(he, /<main id="bs-about"[^>]*lang="he" dir="rtl"/);
    for (const [text, min] of [[en, 120], [he, 100]]) {
        assert.ok(words(text).length >= min, words(text).length + ' words');
        assert.ok((text.match(/<h2>/g) || []).length >= 2, 'two headings');
        assert.ok(/<ol>[\s\S]*<li>[\s\S]*<li>[\s\S]*<li>/.test(text), 'three steps');
        // Not only for people with JavaScript off: the text is outside <noscript>.
        assert.ok(words(text.replace(/<noscript>[\s\S]*?<\/noscript>/g, '')).length >= min - 20);
        links(text).forEach(l => assert.ok(paths.includes(l), 'a page that exists: ' + l));
    }
    assert.ok(!/[א-ת]/.test(words(en).filter(w => !/hreflang|lang=/.test(w)).join(' ').replace(/בולשיט בעברית/, '')), 'English text in English');
    assert.ok(links(he).filter(l => l.startsWith('/he/')).length >= 5);
    assert.ok(links(en).filter(l => l !== '/he' && !l.startsWith('/he/')).length >= 5);
    // No left-over English text on the Hebrew page.
    assert.ok(!/A free party game for phones/.test(he));
});

test('the text shows on the home screens only', () => {
    assert.strictEqual(aboutPlace('/'), 'home');
    assert.strictEqual(aboutPlace('/he'), 'home');
    assert.strictEqual(aboutPlace('/he/?via=fb'), 'home');
    assert.strictEqual(aboutPlace('/m'), 'm');
    assert.strictEqual(aboutPlace('/m?via=qr'), 'm');
    assert.strictEqual(aboutPlace('/d'), 'd');
    for (const url of ['/join-game', '/join-game/ABCD', '/he/join-game/ABCD', '/create-game?via=x', '/c/k3j9',
        '/game-staging/ABCD', '/learn', '/present-game', '/no-such-page']) {
        assert.strictEqual(aboutPlace(url), null, url);
    }
});

test('404.html: both languages, no index, links home', () => {
    assert.match(html.notFound, /<meta name="robots" content="noindex">/);
    assert.match(html.notFound, /lang="he" dir="rtl"/);
    assert.ok(links(html.notFound).includes('/') && links(html.notFound).includes('/he'));
    assert.match(html.notFound, /data-page="plain"/);
    assert.match(html.notFound, /BS_CAMPAIGN/, 'counted by the visit beacon');
});

// Firebase Hosting serves a file first, then the first rewrite that matches; nothing else gets
// 404.html with a 404 status. Header rules apply on their own.
const hosting = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8')).hosting;
const glob = (g) => new RegExp('^' + g.split(/(\*\*|\*)/).map(p => p === '**' ? '.*' : p === '*' ? '[^/]*' : p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('') + '$');
const match = (r, url) => (r.regex ? new RegExp(r.regex) : glob(r.source)).test(url);
const rewriteOf = (url) => hosting.rewrites.find(r => match(r, url));
const noindex = (url) => (hosting.headers || []).some(h => match(h, url) && h.headers.some(x => x.key === 'X-Robots-Tag' && /noindex/.test(x.value)));

test('firebase.json: every screen of the game has its page, and nothing else does', () => {
    const en = ['/m', '/d', '/create-game', '/create-game/', '/join-game', '/present-game', '/present-game/ABCD', '/learn',
        '/c/k3j9', '/game-staging/ABCD', '/round-intro/ABCD', '/show-question/ABCD', '/show-answers/ABCD',
        '/reveal-the-truth/ABCD', '/score-board/ABCD', '/score-board-final/ABCD', '/step/ABCD'];
    en.forEach(u => assert.strictEqual((rewriteOf(u) || {}).destination, '/index.html', u));
    ['/he', '/he/', '/he/join-game', '/he/c/k3j9'].forEach(u => assert.strictEqual((rewriteOf(u) || {}).destination, '/he.html', u));
    ['/join-game/ABCD', '/he/join-game/ABCD'].forEach(u => assert.strictEqual((rewriteOf(u) || {}).function, 'joinPreview', u));
    assert.strictEqual(rewriteOf('/_v').function, 'visit');
    // Not found: a mistyped page, an old path, a Hebrew page that doesn't exist, a screen with two parts.
    ['/no-such-page', '/how-to-plya', '/he/no-such-page', '/he/m', '/c', '/game-staging/ABCD/x', '/index.php'].forEach(u =>
        assert.strictEqual(rewriteOf(u), undefined, u));
});

test('firebase.json: the game screens are kept out of search, the homes and search pages are not', () => {
    ['/m', '/d', '/create-game', '/join-game', '/join-game/ABCD', '/he/join-game/ABCD', '/present-game/ABCD', '/learn',
        '/c/k3j9', '/he/c/k3j9', '/game-staging/ABCD', '/score-board-final/ABCD', '/step/ABCD'].forEach(u =>
        assert.ok(noindex(u), u));
    paths.forEach(u => assert.ok(!noindex(u), u));
    assert.ok(!noindex('/sitemap.xml') && !noindex('/robots.txt'));
});

test('the English phone page is full, and the long English titles are short', () => {
    const phone = pages.find(p => p.path === '/party-games-on-your-phone');
    assert.ok(words(phone.body).length >= 500, words(phone.body).length + ' words');
    assert.match(phone.body, /<h2>What a question looks like<\/h2>/);
    assert.match(phone.body, /<h2>How to start a game on your phones<\/h2>/);
    assert.match(phone.body, /<h2>Questions people ask<\/h2>/);
    ['/party-games-on-your-phone', '/free-jackbox-alternative', '/office-holiday-party-game', '/classroom-game', '/team-building-game']
        .forEach(p => {
            const page = pages.find(x => x.path === p);
            assert.ok(page.title.length <= 60, `${p}: ${page.title.length} characters`);
        });
});
