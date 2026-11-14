// Where a visit started, sent with a game the browser creates (src/app/services/arrival.ts), and the
// same note as a plain page keeps it (the script seo/build-pages.js writes into every plain page).
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const ts = require('typescript');

const app = path.join(__dirname, '..', 'src', 'app');

/** Loads a TypeScript file of the app, and the files it imports, with `window` and `document` given. */
function load(file, globals) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    const mod = { exports: {} };
    const req = (name) => name.charAt(0) === '.' ? load(path.resolve(path.dirname(file), name) + '.ts', globals) : require(name);
    new Function('module', 'exports', 'require', 'window', 'document', out)(mod, mod.exports, req, globals.window, globals.document);
    return mod.exports;
}

function fakeStorage(initial, blocked) {
    const data = Object.assign({}, initial);
    return {
        data,
        getItem(k) { if (blocked) { throw new Error('blocked'); } return k in data ? data[k] : null; },
        setItem(k, v) { if (blocked) { throw new Error('blocked'); } data[k] = String(v); },
    };
}

/** One tab: its address, where it came from, and what the browser holds. */
function tab({ pathname = '/', hostname = 'bullshit.wtf', referrer = '', session = {}, local = {}, blocked = false } = {}) {
    const sessionStorage = fakeStorage(session, blocked);
    const localStorage = fakeStorage(local, blocked);
    const window = { location: { pathname, hostname }, localStorage };
    Object.defineProperty(window, 'sessionStorage', { get() { if (blocked) { throw new Error('blocked'); } return sessionStorage; } });
    const document = { referrer };
    return { window, document, sessionStorage, localStorage, arrival: load(path.join(app, 'services', 'arrival.ts'), { window, document }) };
}

const pure = tab().arrival;

test('hostOf keeps the host name alone, in lower case', () => {
    assert.strictEqual(pure.hostOf('https://www.google.com/search?q=party+game&secret=1'), 'www.google.com');
    assert.strictEqual(pure.hostOf('https://M.Facebook.com/groups/123/posts/456#x'), 'm.facebook.com');
    assert.strictEqual(pure.hostOf('http://user:pass@example.org:8080/a/b'), 'example.org');
    assert.strictEqual(pure.hostOf('android-app://com.google.android.googlequicksearchbox/'), 'com.google.android.googlequicksearchbox');
    assert.strictEqual(pure.hostOf('https://l.instagram.com'), 'l.instagram.com');
    for (const none of ['', null, undefined, 'about:blank', 'www.google.com', 'https://', 'https://bad host/', 'https://' + 'a'.repeat(61) + '.com/']) {
        assert.strictEqual(pure.hostOf(none), null, String(none));
    }
});

test('the first page is the page that loads, with the site the browser came from', () => {
    assert.deepStrictEqual(pure.firstPage('/', 'bullshit.wtf', 'https://www.google.com/search?q=x', 5),
        { page: '/', ref: 'www.google.com', at: 5 });
    assert.deepStrictEqual(pure.firstPage('/he/join-game/ABCD', 'bullshit.wtf', '', 5),
        { page: '/he/join-game/ABCD', ref: null, at: 5 });
    assert.deepStrictEqual(pure.firstPage('/daily', 'bullshit.wtf', 'https://t.co/abc', 5), { page: '/daily', ref: 't.co', at: 5 });
});

test('a visit that reached the app from a page of the site with no note began on that page', () => {
    // A plain page built before the note (or with tab storage blocked) and its Start button.
    assert.deepStrictEqual(pure.firstPage('/create-game', 'bullshit.wtf', 'https://bullshit.wtf/he/hanukkah?via=fb-he-x&k=1#top', 9),
        { page: '/he/hanukkah', ref: null, at: 9 });
    assert.deepStrictEqual(pure.firstPage('/create-game', '127.0.0.1', 'http://127.0.0.1:4200/how-to-play', 9),
        { page: '/how-to-play', ref: null, at: 9 });
    assert.deepStrictEqual(pure.firstPage('/create-game', 'bullshit.wtf', 'https://bullshit.wtf', 9), { page: '/', ref: null, at: 9 });
    // Another site whose name only ends like ours is another site.
    assert.strictEqual(pure.firstPage('/', 'bullshit.wtf', 'https://notbullshit.wtf/x', 9).ref, 'notbullshit.wtf');
});

test('the app notes the first page once, and a later page of the same tab keeps it', () => {
    const t = tab({ pathname: '/he', referrer: 'https://m.facebook.com/groups/1/posts/2' });
    t.arrival.rememberArrival();
    const kept = JSON.parse(t.sessionStorage.data.BS_ARRIVAL);
    assert.strictEqual(kept.page, '/he');
    assert.strictEqual(kept.ref, 'm.facebook.com');
    assert.deepStrictEqual(Object.keys(kept).sort(), ['at', 'page', 'ref']);

    // The same tab, reloaded on another page with another referrer: the first note stays.
    const later = tab({ pathname: '/create-game', referrer: 'https://bullshit.wtf/he', session: t.sessionStorage.data });
    later.arrival.rememberArrival();
    assert.deepStrictEqual(JSON.parse(later.sessionStorage.data.BS_ARRIVAL), kept);
    const sent = later.arrival.newGameArrival(kept.at + 5 * 60000 + 59000);
    assert.deepStrictEqual(sent, { page: '/he', ref: 'm.facebook.com', played: false, hosted: false, minutes: 5 });
});

test('the note holds no query string, no full address and no id of its own', () => {
    const t = tab({ pathname: '/join-game/ABCD', referrer: 'https://chat.example.com/thread/777?token=SECRET' });
    t.window.location.search = '?via=link&name=Dana';
    t.arrival.rememberArrival();
    const text = t.sessionStorage.data.BS_ARRIVAL;
    assert.ok(!/SECRET|thread|777|Dana|via=|\?/.test(text), text);
    assert.deepStrictEqual(Object.keys(t.arrival.newGameArrival()).sort(), ['hosted', 'minutes', 'page', 'played', 'ref']);
});

test('played and hosted come from what the browser held before this game', () => {
    const stranger = tab();
    stranger.arrival.rememberArrival();
    assert.deepStrictEqual([stranger.arrival.newGameArrival().played, stranger.arrival.newGameArrival().hosted], [false, false]);

    const guest = tab({ local: { BS_PLAYER: JSON.stringify({ nickname: 'dana', pid: 'p2', uid: 'u2' }) } });
    guest.arrival.rememberArrival();
    assert.deepStrictEqual([guest.arrival.newGameArrival().played, guest.arrival.newGameArrival().hosted], [true, false]);

    const crew = tab({ local: { BS_CREWS: JSON.stringify([{ id: 'k3j9' }]) } });
    crew.arrival.rememberArrival();
    assert.deepStrictEqual([crew.arrival.newGameArrival().played, crew.arrival.newGameArrival().hosted], [true, false]);

    const host = tab({ local: { BS_HOST_KEYS: JSON.stringify({ ABCD: 'key' }) } });
    host.arrival.rememberArrival();
    assert.deepStrictEqual([host.arrival.newGameArrival().played, host.arrival.newGameArrival().hosted], [true, true]);
});

test('the game is created with the arrival read before its own host key is kept', () => {
    const api = fs.readFileSync(path.join(app, 'services', 'api.service.ts'), 'utf8');
    const create = api.slice(api.indexOf('async createGame('));
    const sent = create.indexOf('arrival: newGameArrival()');
    assert.ok(sent > 0, 'createGame sends the arrival');
    assert.ok(sent < create.indexOf('rememberHostKey('), 'before the host key of the new game is kept');
    const root = fs.readFileSync(path.join(app, 'app.component.ts'), 'utf8');
    assert.ok(/constructor\(\) \{[^}]*rememberArrival\(\);/.test(root), 'noted once, at start-up, for every page of the app');
});

test('blocked storage: the page load keeps its own note and nothing throws', () => {
    const t = tab({ pathname: '/', referrer: 'https://www.bing.com/', blocked: true });
    t.arrival.rememberArrival();
    const sent = t.arrival.newGameArrival();
    assert.strictEqual(sent.page, '/');
    assert.strictEqual(sent.ref, 'www.bing.com');
    assert.deepStrictEqual([sent.played, sent.hosted], [false, false]);
    // Never noted (an app that did not pass start-up): nothing is sent, the game is made all the same.
    assert.strictEqual(tab({ blocked: true }).arrival.newGameArrival(), null);
});

test('a broken or foreign value under the key reads as no note', () => {
    for (const junk of ['', 'x', '[]', '{"page":"https://evil.example/x"}', '{"page":7}', 'null']) {
        assert.strictEqual(pure.parseFirstPage(junk), null, junk);
    }
    assert.deepStrictEqual(pure.parseFirstPage('{"page":"/how-to-play","ref":"https://x.example/full/address?q=1","at":"soon"}'),
        { page: '/how-to-play', ref: null, at: 0 });
    const t = tab({ pathname: '/learn', session: { BS_ARRIVAL: '{"page":7}' } });
    t.arrival.rememberArrival();
    assert.strictEqual(JSON.parse(t.sessionStorage.data.BS_ARRIVAL).page, '/learn');
});

// ---- the plain pages ----

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-pages-'));
execFileSync(process.execPath, [path.join(__dirname, '..', 'seo', 'build-pages.js'), out], { stdio: 'pipe' });
test.after(() => fs.rmSync(out, { recursive: true, force: true }));

function noteScript(file) {
    const html = fs.readFileSync(path.join(out, file), 'utf8');
    const scripts = html.match(/<script>[\s\S]*?<\/script>/g).filter(s => s.indexOf('BS_ARRIVAL') >= 0);
    assert.strictEqual(scripts.length, 1, file + ' carries the note once');
    return scripts[0].replace(/<\/?script>/g, '');
}

/** Opens a built plain page as a browser would: runs its note with this address, referrer and storage. */
function openPlain(file, { pathname, referrer = '', session = {}, blocked = false }) {
    const sessionStorage = fakeStorage(session, blocked);
    const window = {};
    Object.defineProperty(window, 'sessionStorage', { get() { if (blocked) { throw new Error('blocked'); } return sessionStorage; } });
    vm.runInNewContext(noteScript(file), { window, document: { referrer }, location: { pathname, hostname: 'bullshit.wtf' }, JSON, Date });
    return sessionStorage;
}

test('every plain page keeps the note', () => {
    const pages = require('../seo/pages');
    assert.ok(pages.length >= 8);
    pages.forEach(p => noteScript(p.path.replace(/^\//, '') + '.html'));
});

test('a plain page notes its own path and the site the visitor came from, and the app sends it on', () => {
    const s = openPlain('how-to-play.html', { pathname: '/how-to-play', referrer: 'https://www.google.com/search?q=how+to+play+bullshit' });
    const kept = JSON.parse(s.data.BS_ARRIVAL);
    assert.strictEqual(kept.page, '/how-to-play');
    assert.strictEqual(kept.ref, 'www.google.com');
    assert.ok(!/search|\?|q=/.test(s.data.BS_ARRIVAL));

    // The Start button opens the app in the same tab: the app keeps the page's note.
    const t = tab({ pathname: '/create-game', referrer: 'https://bullshit.wtf/how-to-play', session: s.data });
    t.arrival.rememberArrival();
    const sent = t.arrival.newGameArrival(kept.at + 61000);
    assert.deepStrictEqual(sent, { page: '/how-to-play', ref: 'www.google.com', played: false, hosted: false, minutes: 1 });
});

test('a plain page leaves an earlier note alone, and never notes a move inside the site', () => {
    const first = JSON.stringify({ page: '/', ref: 'www.google.com', at: 1 });
    assert.strictEqual(openPlain('how-to-play.html', { pathname: '/how-to-play', referrer: 'https://bullshit.wtf/', session: { BS_ARRIVAL: first } }).data.BS_ARRIVAL, first);
    assert.strictEqual(openPlain('how-to-play.html', { pathname: '/how-to-play', referrer: 'https://bullshit.wtf/' }).data.BS_ARRIVAL, undefined);
    assert.strictEqual(JSON.parse(openPlain('he/hanukkah.html', { pathname: '/he/hanukkah' }).data.BS_ARRIVAL).ref, null);
    assert.doesNotThrow(() => openPlain('how-to-play.html', { pathname: '/how-to-play', blocked: true }));
});
