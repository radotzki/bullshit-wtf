// The English links on Hebrew pages open the English home in English, and keep it English.
// "/" alone opens a Hebrew menu for a browser in Hebrew or one that saw /he (BS_SITE_LOCALE 'he'),
// so /he's "Bullshit in English" and the Hebrew search pages' language link go to /?lang=en, which
// saves English for the menu and for the Hebrew-browser move on "/" (BS:HE-AUTO in src/index.html).
//   node --test test/english-from-hebrew.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const ts = require('typescript');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');

function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}
const source = load(path.join(root, 'src', 'app', 'services', 'join-source.ts'));

const store = (data) => ({
    getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); },
    get length() { return Object.keys(data).length; },
});

/** Open an address of the app (as app.component does) in a browser in Hebrew; return the menu's language. */
function open(address, local) {
    const url = new URL(address, 'https://bullshit.wtf');
    global.window = { location: { pathname: url.pathname, search: url.search }, localStorage: store(local), sessionStorage: store({}) };
    const had = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    Object.defineProperty(globalThis, 'navigator', { value: { language: 'he-IL' }, configurable: true, writable: true });
    try {
        source.rememberArrivalSource();
        return source.preferredLocale();
    } finally {
        delete global.window;
        delete globalThis.navigator;
        if (had) Object.defineProperty(globalThis, 'navigator', had);
    }
}

/** Run the BS:HE-AUTO script on "/" in a Hebrew phone; return where it sent the browser (null: it stayed). */
function heAuto(search, local) {
    const index = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
    const script = /<!-- BS:HE-AUTO:START -->\s*<script>([\s\S]*?)<\/script>/.exec(index)[1];
    let went = null;
    const sandbox = {
        location: { pathname: '/', search, hash: '', hostname: 'bullshit.wtf', replace: (to) => { went = to; } },
        navigator: { languages: ['he-IL'], language: 'he-IL', userAgent: 'Mozilla/5.0 (iPhone) Mobile Safari/604.1', webdriver: false },
        document: { referrer: '' }, localStorage: store(local), sessionStorage: store({}), JSON, Date,
    };
    sandbox.window = sandbox;
    vm.runInNewContext(script, sandbox);
    return went;
}

test("/he's \"Bullshit in English\" goes to /?lang=en", () => {
    const he = fs.readFileSync(path.join(root, 'scripts', 'build-he.js'), 'utf8');
    const links = [...he.matchAll(/<a href="([^"]*)"[^>]*lang="en"[^>]*>([^<]*)<\/a>/g)];
    assert.strictEqual(links.length, 1, 'one English link on /he');
    assert.strictEqual(links[0][1], '/?lang=en');
    assert.strictEqual(links[0][2], 'Bullshit in English');
});

test('a Hebrew phone sent to /he that taps English gets the English menu, now and on the next visit to "/"', () => {
    const local = {};
    assert.strictEqual(open('/he?via=he-auto', local), 'he');
    assert.strictEqual(local.BS_SITE_LOCALE, 'he');
    // Before: "/" kept the Hebrew menu.
    assert.strictEqual(open('/', { ...local }), 'he');
    // The link: English, and saved.
    assert.strictEqual(heAuto('?lang=en', local), null, 'the link itself is not moved back to /he');
    assert.strictEqual(open('/?lang=en', local), 'en');
    assert.strictEqual(local.BS_SITE_LOCALE, 'en');
    // Next visit to "/": no move to /he, English menu.
    assert.strictEqual(heAuto('', local), null);
    assert.strictEqual(open('/', local), 'en');
    // A Hebrew search page's link with its tag works the same.
    const fresh = {};
    assert.strictEqual(open('/?lang=en&via=seo-he-gibush', fresh), 'en');
    assert.strictEqual(fresh.BS_SITE_LOCALE, 'en');
});

test('every Hebrew search page links English to its twin or to /?lang=en, never to a bare "/"', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-pages-'));
    execFileSync('node', [path.join(root, 'seo', 'build-pages.js'), out], { stdio: 'pipe' });
    const files = fs.readdirSync(path.join(out, 'he'), { recursive: true }).filter(f => /\.html$/.test(f));
    let home = 0;
    for (const f of files) {
        const html = fs.readFileSync(path.join(out, 'he', f), 'utf8');
        const link = /<a class="lang" href="([^"]*)" hreflang="en"/.exec(html);
        assert.ok(link, f);
        const href = link[1];
        assert.ok(!/^\/(\?|$)/.test(href) || /^\/\?lang=en(&via=[a-z0-9-]+)?$/.test(href), `${f}: ${href}`);
        assert.ok(!/^\/he(\/|$|\?)/.test(href), `${f}: ${href}`);
        if (/^\/\?/.test(href)) { home++; }
    }
    assert.ok(files.length >= 10, files.length + ' Hebrew pages');
    assert.ok(home >= 1, 'some Hebrew page has no twin and links the English home');
});
