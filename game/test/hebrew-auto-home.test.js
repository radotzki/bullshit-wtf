// A browser in Hebrew that opens the bare English home "/" goes to the Hebrew home, tagged
// via=he-auto, before anything is drawn (the BS:HE-AUTO script in src/index.html). Never with a
// language given before, a query or hash, on another address, for a robot or an automated browser.
// The sitemap names each language pair's x-default.
//   node --test test/hebrew-auto-home.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
const match = /<!-- BS:HE-AUTO:START -->\s*<script>([\s\S]*?)<\/script>\s*<!-- BS:HE-AUTO:END -->/.exec(index);
const PHONE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';

/** Run the script in a bare fake page; return where it sent the browser (null: it stayed) and the tab's storage. */
function run({ pathname = '/', search = '', hash = '', languages = ['he-IL', 'en-US'], language, ua = PHONE,
    webdriver = false, local = {}, session = {}, referrer = 'https://www.google.com/', blocked = false } = {}) {
    let went = null;
    const store = (data) => ({ getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); } });
    const sandbox = {
        location: { pathname, search, hash, hostname: 'bullshit.wtf', replace: (to) => { went = to; } },
        navigator: { languages, language: language || (languages && languages[0]), userAgent: ua, webdriver },
        document: { referrer },
        sessionStorage: store(session),
        JSON, Date,
    };
    Object.defineProperty(sandbox, 'localStorage', {
        get() {
            if (blocked) { throw new Error('blocked'); }
            return store(local);
        },
    });
    sandbox.window = sandbox;
    vm.runInNewContext(match[1], sandbox);
    return { went, session };
}

test('the script sits in <head> before the visit beacon, and only on the English home', () => {
    assert.ok(match, 'BS:HE-AUTO markers in src/index.html');
    const at = index.indexOf('<!-- BS:HE-AUTO:START -->');
    assert.ok(at < index.indexOf('<!-- BS:VISIT:START -->'), 'before the beacon, so "/" is not counted twice');
    assert.ok(at < index.indexOf('</head>'));
    // The beacon block that the plain pages and the 404 page copy does not carry it.
    const visit = /<!-- BS:VISIT:START -->[\s\S]*?<!-- BS:VISIT:END -->/.exec(index)[0];
    assert.ok(!/he-auto/.test(visit));
});

test('a Hebrew phone on a bare "/" goes to /he?via=he-auto and keeps where it came from', () => {
    const { went, session } = run();
    assert.strictEqual(went, '/he?via=he-auto');
    const note = JSON.parse(session.BS_ARRIVAL);
    assert.strictEqual(note.page, '/');
    assert.strictEqual(note.ref, 'www.google.com');
    // The old code for Hebrew, and a plain "he", count too.
    assert.strictEqual(run({ languages: ['iw'] }).went, '/he?via=he-auto');
    assert.strictEqual(run({ languages: ['he'] }).went, '/he?via=he-auto');
    // An older browser with navigator.language only.
    assert.strictEqual(run({ languages: undefined, language: 'he-IL' }).went, '/he?via=he-auto');
    // No referrer, or this same site: no host is kept.
    assert.strictEqual(JSON.parse(run({ referrer: '' }).session.BS_ARRIVAL).ref, null);
    assert.strictEqual(JSON.parse(run({ referrer: 'https://bullshit.wtf/how-to-play' }).session.BS_ARRIVAL).ref, null);
    // An earlier note of this tab wins.
    const kept = JSON.stringify({ page: '/he/hanukkah', ref: 'www.facebook.com', at: 1 });
    assert.strictEqual(run({ session: { BS_ARRIVAL: kept } }).session.BS_ARRIVAL, kept);
});

test('a tab that already carries a post tag keeps it', () => {
    assert.strictEqual(run({ session: { BS_CAMPAIGN: 'fb-he-hanukkah' } }).went, '/he');
    assert.strictEqual(run({ session: { BS_CAMPAIGN: 'test' } }).went, '/he');
});

test('it stays on "/" for everyone else', () => {
    const stays = {
        'an English browser': { languages: ['en-US', 'he-IL'] },
        'a browser with Hebrew second': { languages: ['en-IL', 'he'] },
        'a Russian browser': { languages: ['ru-RU'] },
        'a language picked before (English)': { local: { BS_SITE_LOCALE: 'en' } },
        'a language picked before (Hebrew, from /he: its "in English" link)': { local: { BS_SITE_LOCALE: 'he' } },
        'a ?via= link': { search: '?via=test' },
        'a ?lang= link': { search: '?lang=en' },
        'a hash': { hash: '#x' },
        'a join link': { pathname: '/join-game/ABCD' },
        'the Hebrew home itself': { pathname: '/he' },
        'a game screen': { pathname: '/game-staging/ABCD' },
        'the create page': { pathname: '/create-game' },
        Googlebot: { ua: 'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
        'a link-preview fetcher': { ua: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' },
        'Bing': { ua: 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)' },
        'a headless browser': { ua: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0 Safari/537.36' },
        'an automated browser (play-tests, smoke tests)': { webdriver: true },
        'storage that throws': { blocked: true },
    };
    for (const [who, opts] of Object.entries(stays)) {
        assert.strictEqual(run(opts).went, null, who);
    }
});

test('the English home names itself and says it is not the card game; /he leads with בולשיט', () => {
    const title = /<title>([^<]*)<\/title>/.exec(index)[1];
    assert.match(title, /^Bullshit: /);
    assert.match(title, /party game/);
    assert.match(title, /phones?/);
    assert.match(title, /not the card game/);
    assert.ok(title.length <= 60, title.length + ' characters');
    const description = /<meta name="description" content="([^"]*)">/.exec(index)[1];
    assert.match(description, /^Not the card game: Bullshit is a free bluffing party game/);
    assert.match(description, /phone/);
    const he = fs.readFileSync(path.join(root, 'scripts', 'build-he.js'), 'utf8');
    assert.match(/const pageTitle = '([^']*)'/.exec(he)[1], /^בולשיט: משחק/);
    assert.match(/<meta name="description" content="([^"]*)">/.exec(he)[1], /^בולשיט הוא משחק/);
});

test('the sitemap pairs each language twin with x-default on the English page', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-sitemap-'));
    execFileSync('node', [path.join(root, 'seo', 'build-pages.js'), out], { stdio: 'pipe' });
    const xml = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
    const urls = xml.split('<url>').slice(1);
    const home = urls.filter(u => /<loc>https:\/\/bullshit\.wtf\/(he)?<\/loc>/.test(u));
    assert.strictEqual(home.length, 2);
    home.forEach(u => assert.match(u, /hreflang="x-default" href="https:\/\/bullshit\.wtf\/"/));
    let pairs = 0;
    for (const u of urls) {
        const langs = [...u.matchAll(/hreflang="([^"]+)" href="([^"]+)"/g)];
        if (langs.length < 2) {
            continue;
        }
        pairs++;
        const en = langs.find(l => l[1] === 'en')[2];
        const x = langs.find(l => l[1] === 'x-default');
        assert.ok(x, u);
        assert.strictEqual(x[2], en, u);
    }
    assert.ok(pairs >= 4, pairs + ' twins');
    // The Hebrew home links the Hebrew family-at-home page, and so does every Hebrew search page.
    const hanukkah = fs.readFileSync(path.join(out, 'he', 'hanukkah.html'), 'utf8');
    assert.match(hanukkah, /href="\/he\/home-together"/);
    assert.match(fs.readFileSync(path.join(root, 'scripts', 'build-he.js'), 'utf8'), /href="\/he\/home-together"/);
});
