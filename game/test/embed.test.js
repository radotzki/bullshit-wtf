// The daily puzzle's embed (/embed/daily, /he/embed/daily), the page with its line of code
// (/daily-on-your-site, /he/daily-on-your-site), the links to that page, and the hosting headers that
// let other sites frame the embed and nothing else. Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const embed = require('../seo/embed-page');
const ec = require('../seo/embed-core');
const core = require('../seo/daily-core');
const words = require('../seo/embed-strings');
const daily = require('../seo/daily-strings');
const searchPages = require('../seo/pages');

const root = path.join(__dirname, '..', '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const html = { en: embed.renderEmbed('en'), he: embed.renderEmbed('he') };
const copy = { en: embed.renderCopy('en'), he: embed.renderCopy('he') };
const TAG = /^[a-z0-9][a-z0-9-]{0,39}$/;

// ---------- which site carries it, and its tag ----------

test('the host of the page that carries the embed, from its origin or its referrer', () => {
    assert.strictEqual(ec.hostOf('https://www.School.org.il/class/7?x=1#top'), 'www.school.org.il');
    assert.strictEqual(ec.hostOf('https://user:pw@blog.example.com:8443/a'), 'blog.example.com');
    assert.strictEqual(ec.hostOf('http://127.0.0.1:5000/'), '127.0.0.1');
    for (const no of ['', null, undefined, 'about:blank', 'not a url', 'https://', 'https://a b.com/', 'file:///c/x.html', 42]) {
        assert.strictEqual(ec.hostOf(no), '', String(no));
    }
    // The parent's origin wins where the browser gives it (Chrome, Safari); the referrer otherwise (Firefox).
    assert.strictEqual(ec.siteOf(['https://tnua.org.il'], 'https://other.com/page'), 'tnua.org.il');
    assert.strictEqual(ec.siteOf([], 'https://other.com/page'), 'other.com');
    assert.strictEqual(ec.siteOf(null, ''), '');
    assert.strictEqual(ec.siteOf({ length: 1, 0: 'null' }, 'https://x.co/'), 'x.co', 'an opaque parent falls back to the referrer');
});

test('the tag names the site, short and clean, and is always one the game keeps', () => {
    const tag = (via, site) => ec.embedTag(via, site, core.cleanTag);
    assert.strictEqual(tag('', 'www.school.org.il'), 'embed-school-org-il');
    assert.strictEqual(tag('', 'blog.example.com'), 'embed-blog-example-com');
    assert.strictEqual(tag('', 'www2.example.com'), 'embed-example-com');
    assert.strictEqual(tag('', 'xn--4dbrk0ce.co.il'), 'embed-xn-4dbrk0ce-co-il');
    assert.strictEqual(tag('', ''), 'embed', 'no referrer: the embed, site unknown');
    assert.strictEqual(tag('', '...'), 'embed');
    // The game's own site: the copy page's live preview.
    for (const own of ['bullshit.wtf', 'www.bullshit.wtf', 'bullshit-wtf-prod.web.app', 'bullshit-wtf-dev--pr-12-abc.web.app']) {
        assert.strictEqual(tag('', own), 'embed-preview', own);
    }
    assert.notStrictEqual(tag('', 'notbullshit.wtf.evil.com'), 'embed-preview');
    assert.strictEqual(ec.embedTag('', '127.0.0.1', core.cleanTag, '127.0.0.1'), 'embed-preview', 'the host the embed is served from');
    assert.strictEqual(ec.embedTag('', 'school.org', core.cleanTag, '127.0.0.1'), 'embed-school-org');
    // A long host is cut to fit 40 letters, never ending on a dash.
    const long = tag('', 'a-very-long-subdomain-name-for-a-class.school-district.example.org');
    assert.ok(TAG.test(long) && long.length <= 40 && !/-$/.test(long), long);
    // The iframe's own ?via= wins: a play-test stays a test, a site can have a tag of its own.
    assert.strictEqual(tag('test', 'www.school.org.il'), 'test');
    assert.strictEqual(tag('test-embed', 'www.school.org.il'), 'test-embed');
    assert.strictEqual(tag('embed-tnua', 'x.com'), 'embed-tnua');
    assert.strictEqual(tag('<script>', 'x.com'), 'embed-x-com', 'a tag the game would drop is ignored');
    // Every tag, from any address, is a clean one.
    for (const site of ['a', '1.2.3.4', 'localhost', 'x.y.z.w.v.u.t.s.r.q.p.o.n.m.l.k.j.i.h.g.f.e.d.c.b.a.example.com']) {
        assert.ok(TAG.test(tag('', site)), site);
    }
});

test('the links out: a game with friends on the game\'s site, and the puzzle, with the tag', () => {
    const origin = 'https://bullshit.wtf';
    assert.strictEqual(ec.playUrl(origin, daily.en, 'embed-school-org-il', '', core.createUrl), 'https://bullshit.wtf/create-game?via=embed-school-org-il');
    assert.strictEqual(ec.playUrl(origin, daily.he, 'embed-x-com', 'hanukkah', core.createUrl), 'https://bullshit.wtf/create-game?via=embed-x-com&lang=he&pack=hanukkah');
    assert.strictEqual(ec.playUrl(origin, daily.en, 'test', '', core.createUrl), 'https://bullshit.wtf/create-game?via=test', 'a play-test\'s game is a test game');
    assert.strictEqual(ec.dailyUrl(origin, daily.he, 'embed-x-com'), 'https://bullshit.wtf/he/daily?via=embed-x-com');
});

test('the server counts an embed\'s rows as a post\'s, so the site\'s tag gets its own open row', () => {
    // functions/src/controllers/daily.ts: a tag that is no puzzle arrival is a 'daily-post', and an
    // open from it adds a 'post-via' row with the tag in method; a 'test' tag writes nothing.
    const server = read('functions/src/controllers/daily.ts');
    const arrivals = /DAILY_ARRIVALS = \[([^\]]*)\]/.exec(server)[1];
    assert.ok(!/'embed/.test(arrivals), 'no embed tag is taken for one of the puzzle\'s own arrivals');
    assert.ok(server.includes('isTestCampaign(body.src)'));
});

// ---------- the embed page ----------

test('the embed: each language, noindex, light, and the answer never in the page', () => {
    assert.match(html.en, /<html lang="en" dir="ltr" data-page="plain">/);
    assert.match(html.he, /<html lang="he" dir="rtl" data-page="plain">/);
    for (const lang of ['en', 'he']) {
        const page = html[lang];
        assert.ok(page.includes('<meta name="robots" content="noindex">'), lang);
        assert.ok(!/<link[^>]+stylesheet/.test(page) && !/<script src=/.test(page) && !/<img/.test(page), 'nothing loads from elsewhere');
        assert.ok(!/document\.cookie/.test(page), 'no cookie');
        assert.ok(!/(window\.)?(parent|top)\.(postMessage|location|document)/.test(page), 'never touches the host page');
        assert.ok(Buffer.byteLength(page) < 45000, `${lang}: ${Buffer.byteLength(page)} bytes`);
        // The question and its answers come from /_daily: no answer of today's is in the page.
        assert.ok(page.includes('/_daily?lang='));
        assert.ok(!/realAnswer|fakeAnswers|"options"/.test(page));
        assert.ok(page.includes(`<link rel="canonical" href="https://bullshit.wtf${daily[lang].path}">`));
    }
    assert.ok(html.he.includes(daily.he.instruction) && html.en.includes(daily.en.instruction));
});

test('the embed\'s scripts parse, cannot be cut short, and set up their parts', () => {
    for (const lang of ['en', 'he']) {
        const body = html[lang].slice(html[lang].indexOf('<body'));
        const scripts = [...body.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
        assert.strictEqual(scripts.length, 4, 'the words, the puzzle\'s rules, the embed\'s rules, the embed\'s script');
        scripts.forEach(js => assert.doesNotThrow(() => new vm.Script(js)));
        const sandbox = {};
        sandbox.window = sandbox;
        sandbox.globalThis = sandbox;
        vm.createContext(sandbox);
        scripts.slice(0, 3).forEach(js => vm.runInContext(js, sandbox));
        assert.strictEqual(sandbox.BSEmbed.s.lang, lang);
        assert.strictEqual(sandbox.BSEmbed.e.play, words[lang].play);
        assert.strictEqual(typeof sandbox.BSDailyCore.createUrl, 'function');
        assert.strictEqual(sandbox.BSEmbedCore.embedTag('', 'a.com', sandbox.BSDailyCore.cleanTag), 'embed-a-com');
        for (const key of ['headTruth', 'headLie', 'truthLine', 'numbers', 'tooFew', 'played', 'kicker', 'path']) {
            assert.strictEqual(sandbox.BSEmbed.s[key], daily[lang][key], key);
        }
    }
});

test('the words, in English and Hebrew, with the same keys', () => {
    assert.deepStrictEqual(Object.keys(words.he), Object.keys(words.en));
    for (const lang of ['en', 'he']) {
        for (const [k, v] of Object.entries(words[lang])) {
            assert.ok(Array.isArray(v) ? v.every(x => x.trim()) : String(v).trim(), `${lang}.${k}`);
        }
        assert.strictEqual(words[lang].good.length, words.en.good.length);
    }
    assert.ok(/[א-ת]/.test(words.he.play) && /[א-ת]/.test(words.he.h1));
    assert.ok(words.en.play === 'PLAY THIS WITH FRIENDS');
});

// ---------- the line to copy, and its page ----------

test('the line to copy is one iframe of the embed, sandboxed, that fits 300 to 420 px', () => {
    for (const lang of ['en', 'he']) {
        const line = embed.snippet(lang);
        assert.match(line, /^<iframe [^<>]*><\/iframe>$/);
        assert.ok(line.includes(`src="https://bullshit.wtf${words[lang].embedPath}"`));
        assert.ok(line.includes('width="100%"') && line.includes('max-width:420px') && line.includes(`height="${embed.HEIGHT}"`));
        assert.ok(line.includes('sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"'));
        assert.ok(!/allow-top-navigation/.test(line), 'the embed can never move the host page');
        assert.ok(!/<script/i.test(line));
        // The textarea on the copy page holds that line, escaped, and the page previews the same embed.
        assert.ok(copy[lang].includes(line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')));
        assert.ok(copy[lang].includes(`<iframe src="${words[lang].embedPath}"`));
    }
    assert.strictEqual(embed.words.en.embedPath, '/embed/daily');
    assert.strictEqual(embed.words.he.embedPath, '/he/embed/daily');
});

test('the copy page: twins in two languages, for search, linked from the puzzle and every search page', () => {
    assert.match(copy.en, /<html lang="en" dir="ltr"/);
    assert.match(copy.he, /<html lang="he" dir="rtl"/);
    for (const lang of ['en', 'he']) {
        assert.ok(!/noindex/.test(copy[lang]));
        assert.ok(copy[lang].includes(`<link rel="canonical" href="https://bullshit.wtf${words[lang].path}">`));
        assert.ok(copy[lang].includes('hreflang="en" href="https://bullshit.wtf/daily-on-your-site"'));
        assert.ok(copy[lang].includes('hreflang="he" href="https://bullshit.wtf/he/daily-on-your-site"'));
        const scripts = [...copy[lang].matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
        scripts.forEach(js => assert.doesNotThrow(() => new vm.Script(js)));
    }
    assert.ok(!searchPages.some(p => [words.en.path, words.he.path, words.en.embedPath, words.he.embedPath].includes(p.path)), 'no search page takes these addresses');
    // The puzzle's page links to it, in its language.
    const dailyPage = require('../seo/daily-page');
    assert.ok(dailyPage.render('en').includes(`<a href="/daily-on-your-site">${words.en.link}</a>`));
    assert.ok(dailyPage.render('he').includes(`<a href="/he/daily-on-your-site">${words.he.link}</a>`));
    // Every search page's footer links to it.
    const build = read('game/seo/build-pages.js');
    assert.ok(build.includes('<footer>${esc(s.footer)} <a href="${embedWords[s.lang].path}">${esc(embedWords[s.lang].link)}</a></footer>'));
});

test('the build writes all four after the puzzle, lists only the copy pages in the sitemap, once', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'embed-build-'));
    const run = script => execFileSync(process.execPath, [path.join(root, 'game', 'seo', script), out], { stdio: 'pipe' });
    try {
        assert.throws(() => run('build-embed.js'), 'not before the search pages');
        run('build-pages.js');
        run('build-daily.js');
        run('build-embed.js');
        assert.strictEqual(fs.readFileSync(path.join(out, 'embed', 'daily.html'), 'utf8'), html.en);
        assert.strictEqual(fs.readFileSync(path.join(out, 'he', 'embed', 'daily.html'), 'utf8'), html.he);
        assert.strictEqual(fs.readFileSync(path.join(out, 'daily-on-your-site.html'), 'utf8'), copy.en);
        assert.strictEqual(fs.readFileSync(path.join(out, 'he', 'daily-on-your-site.html'), 'utf8'), copy.he);
        const sitemap = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
        for (const loc of ['/daily-on-your-site', '/he/daily-on-your-site', '/daily', '/he/daily']) {
            assert.strictEqual(sitemap.split(`<loc>https://bullshit.wtf${loc}</loc>`).length, 2, loc);
        }
        assert.ok(!sitemap.includes('/embed/'), 'the embed is not for search');
        assert.ok(fs.readFileSync(path.join(out, 'how-to-play.html'), 'utf8').includes('<a href="/daily-on-your-site">'));
        assert.throws(() => run('build-embed.js'), 'never twice into one folder');
    } finally {
        fs.rmSync(out, { recursive: true, force: true });
    }
    assert.ok(/build-daily\.js && node seo\/build-embed\.js"?$/.test(JSON.parse(read('game/package.json')).scripts.build));
});

// ---------- hosting: who may frame what ----------

const hosting = JSON.parse(read('firebase.json')).hosting;
function headersFor(p) {
    const out = {};
    for (const rule of hosting.headers) {
        const re = rule.regex ? new RegExp(rule.regex)
            : new RegExp('^' + rule.source.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '(?:.*/)?').replace(/\*/g, '[^/]*') + '$');
        if (re.test(p)) {
            rule.headers.forEach(h => { out[h.key.toLowerCase()] = h.value; });
        }
    }
    return out;
}

test('only the embed may be framed by any site; it is sent fresh and kept out of search', () => {
    for (const p of ['/embed/daily', '/he/embed/daily', '/embed/daily.html', '/he/embed/daily/']) {
        const h = headersFor(p);
        assert.strictEqual(h['content-security-policy'], 'frame-ancestors *', p);
        assert.strictEqual(h['cache-control'], 'no-cache', p);
        assert.strictEqual(h['x-robots-tag'], 'noindex', p);
        assert.ok(!('x-frame-options' in h), p);
    }
    for (const p of ['/', '/he', '/daily', '/he/daily', '/daily-on-your-site', '/he/daily-on-your-site', '/create-game', '/embed', '/embed/other', '/x/embed/daily']) {
        assert.ok(!/frame-ancestors \*/.test(headersFor(p)['content-security-policy'] || ''), p);
    }
    assert.strictEqual(headersFor('/daily-on-your-site')['cache-control'], 'no-cache');
    assert.strictEqual(headersFor('/he/daily-on-your-site')['cache-control'], 'no-cache');
    // No rewrite takes the embed's addresses: the built files answer them.
    for (const p of ['/embed/daily', '/he/embed/daily', '/daily-on-your-site', '/he/daily-on-your-site']) {
        assert.ok(!hosting.rewrites.some(r => r.regex && new RegExp(r.regex).test(p)), p);
    }
});
