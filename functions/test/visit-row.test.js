// One visit, end to end, with no Firebase project, no network and no credentials:
// the visit beacon exactly as it ships (the inline script of game/src/index.html) runs in a fake
// browser, its posts go to the compiled `visit` function, and a fake BigQuery keeps the rows.
// The run prints the rows of one local visit (a `# visits ...` line per row).
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

// ---- fake BigQuery: records every insert ----
const rows = [];
let failInserts = false;
class FakeBigQuery {
    dataset(name) {
        return { table: (table) => ({ insert: async (row, opts) => {
            if (failInserts) { throw new Error('Not found: Table bullshit-wtf-prod:analytics.visits'); }
            rows.push({ dataset: name, table, row, opts });
        } }) };
    }
}

// ---- fake firebase-functions v1, cors and database: keep each HTTP handler to call directly ----
const fakeFunctions = {
    https: { onRequest: (h) => ({ __handler: h }) },
    database: { ref: () => ({ onWrite: (h) => ({ __trigger: h }) }) },
};
// runWith keeps its options on the handler, so a test can read a function's limits.
fakeFunctions.runWith = (opts) => ({
    https: { onRequest: (h) => ({ __handler: h, __runWith: opts }) },
    database: fakeFunctions.database,
});
const noRef = () => ({ child: noRef, once: async () => ({ val: () => null }) });
const fakeFirebase = {
    gamesRef: noRef(), qHistoryRef: noRef(), gameCounterRef: noRef(), questionsRef: noRef(),
    seenQuestionsRef: noRef(), crewsRef: noRef(), get: async () => null,
};
const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
    if (request === 'firebase-functions/v1') return fakeFunctions;
    if (request === 'cors') return () => (req, res, next) => next();
    if (request === '@google-cloud/bigquery') return { BigQuery: FakeBigQuery };
    if (/[\\/]firebase$/.test(request)) return fakeFirebase;
    return realLoad.apply(this, arguments);
};
const api = require(path.join(__dirname, '..', 'dist', 'index'));

/** POST one beacon body to the visit function, as Hosting would hand it over. */
function post(body, headers) {
    return new Promise((resolve) => {
        const res = {
            code: 200, headers: {},
            set(k, v) { this.headers[k] = v; return this; },
            status(c) { this.code = c; return this; },
            send(b) { resolve({ code: this.code, body: b }); return this; },
        };
        api.visit.__handler({
            method: 'POST', rawBody: Buffer.from(body, 'utf8'), body, headers,
            // What a real request also carries, and the function must not keep.
            ip: '203.0.113.7', get: () => undefined,
        }, res);
    });
}

// ---- the beacon, exactly as index.html ships it ----
const html = fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'src', 'index.html'), 'utf8');
const beacon = /<!-- BS:VISIT:START -->\s*<script>([\s\S]*?)<\/script>\s*<!-- BS:VISIT:END -->/.exec(html)[1];

/** A fake browser tab on one address. Returns what the page can do and what the beacon posted. */
function openPage({ href, referrer = '', ua, language = 'en-US', stored = {}, sessionStored = {}, plain = false, webdriver = false }) {
    const url = new URL(href);
    const posts = [];
    const listeners = {};
    const timers = [];
    const writes = [];
    const store = (data) => ({
        get length() { return Object.keys(data).length; },
        getItem: (k) => (k in data ? data[k] : null),
        setItem: (k, v) => { writes.push(k); data[k] = String(v); },
        removeItem: (k) => { writes.push(k); delete data[k]; },
    });
    const appRoot = { children: [{ className: 'l' }], firstElementChild: { className: 'l' } };
    const document = {
        referrer,
        visibilityState: 'visible',
        documentElement: { getAttribute: (n) => (n === 'data-page' && plain ? 'plain' : null) },
        querySelector: (sel) => (sel === 'app-root' && !plain && document.bodyParsed ? appRoot : null),
        addEventListener: (name, fn) => { (listeners[name] = listeners[name] || []).push(fn); },
        get cookie() { writes.push('cookie read'); return ''; },
        set cookie(v) { writes.push('cookie'); },
    };
    const window = {
        document,
        location: { pathname: url.pathname, search: url.search, hostname: url.hostname, origin: url.origin },
        navigator: { language, userAgent: ua, webdriver, sendBeacon: (to, body) => { posts.push({ to, body }); return true; } },
        localStorage: store(stored),
        sessionStorage: store(sessionStored),
        addEventListener: (name, fn) => { (listeners[name] = listeners[name] || []).push(fn); },
        setTimeout: (fn, ms) => { timers.push({ fn, ms }); },
        Math, Date, JSON, String, decodeURIComponent,
    };
    window.window = window;
    vm.runInNewContext(beacon, Object.assign(window, { location: window.location, navigator: window.navigator }));
    return {
        posts, writes, window, timers,
        // The app drew: <app-root> holds the game instead of the spinner.
        boot() { document.bodyParsed = true; appRoot.children = [{ className: 'page' }]; appRoot.firstElementChild = appRoot.children[0]; },
        go(pathname) { window.location.pathname = pathname; },
        hide() { document.visibilityState = 'hidden'; (listeners.visibilitychange || []).forEach(fn => fn()); },
        // Send everything posted so far to the function, with this browser's user agent.
        async deliver() {
            while (posts.length) {
                const p = posts.shift();
                assert.strictEqual(p.to, '/_v');
                const res = await post(p.body, { 'user-agent': ua, 'content-type': 'text/plain;charset=UTF-8' });
                assert.strictEqual(res.code, 204);
            }
        },
    };
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';

const log = console.log;
const quiet = () => { console.log = () => {}; console.error = () => {}; };
const err = console.error;
const loud = () => { console.log = log; console.error = err; };
const visits = () => rows.filter(r => r.table === 'visits').map(r => r.row);

test('one local visit: a new phone opens the Hebrew home page from a post, creates a game, leaves', async (t) => {
    rows.length = 0;
    quiet();
    const page = openPage({
        href: 'https://bullshit.wtf/he?via=fb-he-hanukkah-parents', referrer: 'https://m.facebook.com/groups/1234/posts/5678?ref=share',
        ua: IPHONE, language: 'he-IL',
    });
    await page.deliver();                 // the view row, sent as the page opens
    page.boot();
    page.go('/create-game');
    page.window.bsVisit('create');        // what create-game.component.ts calls after newGame answers
    page.go('/join-game/ABCD');
    page.window.bsVisit('join');          // the host joins their own game
    page.go('/game-staging/ABCD');
    await page.deliver();
    page.hide();                          // the phone is locked or the tab closed
    await page.deliver();
    loud();

    const got = visits();
    got.forEach(r => t.diagnostic('visits ' + JSON.stringify(r)));
    assert.deepStrictEqual(got.map(r => r.kind), ['view', 'create', 'join', 'end']);

    const view = got[0];
    assert.ok(view.time instanceof Date);
    assert.match(view.view, /^[a-z0-9]{1,12}$/);
    assert.deepStrictEqual({ ...view, time: null, view: null, ms: null }, {
        time: null, kind: 'view', view: null, page: '/', last_page: '/', locale: 'he', lang: 'he-il',
        ref: 'm.facebook.com', tag: 'fb-he-hanukkah-parents', test: false, first_visit: true,
        created: false, joined: false, device: 'iphone', device_kind: 'phone', browser: 'safari 18.1',
        bot: false, booted: null, ms: null, err: null,
    });
    // Every row of the page view has the same id, page, referring site and tag.
    got.forEach(r => assert.deepStrictEqual([r.view, r.page, r.ref, r.tag, r.first_visit], [view.view, '/', 'm.facebook.com', 'fb-he-hanukkah-parents', true]));
    assert.deepStrictEqual(got.map(r => r.created), [false, true, true, true]);
    assert.deepStrictEqual(got.map(r => r.joined), [false, false, true, true]);
    assert.strictEqual(got[3].last_page, '/game-staging/:pin');
    assert.strictEqual(got[3].booted, true);

    // Nothing that names a person or a game: no IP, no user agent, no PIN, no path of the referrer.
    const all = JSON.stringify(rows);
    for (const secret of ['203.0.113.7', 'Mozilla', 'ABCD', 'groups', '5678', 'ref=share']) {
        assert.ok(all.indexOf(secret) < 0, secret + ' must not be in a row');
    }
    assert.deepStrictEqual(Object.keys(view).sort(), ['booted', 'bot', 'browser', 'created', 'device', 'device_kind', 'err',
        'first_visit', 'joined', 'kind', 'lang', 'last_page', 'locale', 'ms', 'page', 'ref', 'tag', 'test', 'time', 'view']);
    // The beacon reads what the game keeps and writes nothing: no cookie, no storage.
    assert.deepStrictEqual(page.writes, []);
    // The rows go to the same dataset as the others, and survive a table that lacks a column.
    assert.ok(rows.every(r => r.dataset === 'analytics' && r.table === 'visits' && r.opts.ignoreUnknownValues === true));
});

test('a returning browser is not a first visit, and each page load is a new view', async () => {
    rows.length = 0;
    quiet();
    const a = openPage({ href: 'https://bullshit.wtf/', ua: DESKTOP, stored: { BS_PLAYER: '{"nickname":"x"}' } });
    const b = openPage({ href: 'https://bullshit.wtf/', ua: DESKTOP, stored: { BS_PLAYER: '{"nickname":"x"}' } });
    await a.deliver();
    await b.deliver();
    loud();
    const got = visits();
    assert.deepStrictEqual(got.map(r => r.first_visit), [false, false]);
    assert.notStrictEqual(got[0].view, got[1].view);
    assert.deepStrictEqual([got[0].ref, got[0].tag, got[0].device_kind, got[0].locale], [null, null, 'desktop', 'en']);
    assert.ok(JSON.stringify(got).indexOf('nickname') < 0);
});

test('a play-test link marks its rows as tests, and the mark stays for the tab', async () => {
    rows.length = 0;
    quiet();
    const first = openPage({ href: 'https://bullshit.wtf/?via=test', ua: IPHONE });
    await first.deliver();
    // The same tab opens another page with no tag in the address: the game kept the tag for Create.
    const later = openPage({ href: 'https://bullshit.wtf/create-game', ua: IPHONE, referrer: 'https://bullshit.wtf/', sessionStored: { BS_CAMPAIGN: 'test' } });
    await later.deliver();
    const scripted = openPage({ href: 'https://bullshit.wtf/', ua: IPHONE, webdriver: true });
    await scripted.deliver();
    loud();
    const got = visits();
    assert.deepStrictEqual(got.map(r => [r.tag, r.test, r.bot]), [['test', true, false], ['test', true, false], [null, false, true]]);
    assert.strictEqual(got[1].ref, 'bullshit.wtf');
});

test('a tab that arrived as a play-test stays marked test on an invite link and a lobby code', async () => {
    rows.length = 0;
    quiet();
    // What the game keeps for the tab after it opened /he?via=test or /?via=test-qa.
    const cases = [
        ['https://bullshit.wtf/join-game/ABCD?via=link', 'test'],
        ['https://bullshit.wtf/he/join-game/ABCD?via=qr', 'test'],
        ['https://bullshit.wtf/join-game/ABCD?via=results', 'test-qa'],
        ['https://bullshit.wtf/?via=fb-he-hanukkah', 'test'],
        ['https://bullshit.wtf/join-game/ABCD', 'test'],
    ];
    for (const [href, kept] of cases) {
        const page = openPage({ href, ua: IPHONE, sessionStored: { BS_CAMPAIGN: kept } });
        page.boot();
        page.window.bsVisit('join');
        page.hide();
        await page.deliver();
        assert.deepStrictEqual(page.writes, []);
    }
    // A tab that did not arrive as a test is untouched: the link's own tag wins, as before.
    const real = openPage({ href: 'https://bullshit.wtf/join-game/ABCD?via=link', ua: IPHONE, sessionStored: { BS_CAMPAIGN: 'fb-he-hanukkah' } });
    await real.deliver();
    const fresh = openPage({ href: 'https://bullshit.wtf/join-game/ABCD?via=qr', ua: IPHONE });
    await fresh.deliver();
    // Words that only start like test are not test tags, kept or on the link.
    const tester = openPage({ href: 'https://bullshit.wtf/join-game/ABCD?via=link', ua: IPHONE, sessionStored: { BS_CAMPAIGN: 'testing' } });
    await tester.deliver();
    loud();
    const got = visits();
    const marked = got.slice(0, 15);
    assert.strictEqual(marked.length, 15);                    // view, join, end for each of the five
    assert.ok(marked.every(r => r.test === true), 'every row of a test tab is a test');
    assert.deepStrictEqual(marked.filter(r => r.kind === 'view').map(r => r.tag), ['test', 'test', 'test-qa', 'test', 'test']);
    assert.deepStrictEqual(got.slice(15).map(r => [r.tag, r.test]), [['link', false], ['qr', false], ['link', false]]);
});

test('the visit function has a cap on running copies, and only it', () => {
    const { VISIT_MAX_INSTANCES } = require(path.join(__dirname, '..', 'dist', 'controllers', 'visit'));
    assert.deepStrictEqual(api.visit.__runWith, { maxInstances: VISIT_MAX_INSTANCES });
    // Small enough to bound a flood, with room for a full lobby opening the join page at once.
    assert.ok(Number.isInteger(VISIT_MAX_INSTANCES) && VISIT_MAX_INSTANCES >= 2 && VISIT_MAX_INSTANCES <= 10, String(VISIT_MAX_INSTANCES));
    // The game's own functions keep their settings: none of them gets a cap by this change.
    for (const name of ['newGame', 'join', 'answer', 'startGame', 'onJoinGame', 'onShare']) {
        assert.strictEqual(api[name].__runWith, undefined, name);
    }
    // The source says it too, so a deploy sets it: 1st-gen runWith on the exported function.
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.ts'), 'utf8');
    assert.match(src, /exports\.visit = functions\.runWith\(\{ maxInstances: VISIT_MAX_INSTANCES \}\)\.https\.onRequest\(/);
});

test('a plain page is counted and never called stuck; a stuck app is', async () => {
    rows.length = 0;
    quiet();
    const plain = openPage({ href: 'https://bullshit.wtf/he/hanukkah?via=seo-he-hanukkah', referrer: 'https://www.google.com/', ua: IPHONE, plain: true });
    assert.strictEqual(plain.timers.length, 0);
    plain.hide();
    await plain.deliver();
    const app = openPage({ href: 'https://bullshit.wtf/join-game/ABCD?via=qr', ua: IPHONE });
    assert.deepStrictEqual(app.timers.map(x => x.ms), [12000]);
    app.timers[0].fn();                   // 12 s later the spinner is still there
    await app.deliver();
    loud();
    const got = visits();
    assert.deepStrictEqual(got.map(r => [r.kind, r.page, r.locale, r.ref, r.tag, r.booted]), [
        ['view', '/he/hanukkah', 'he', 'www.google.com', 'seo-he-hanukkah', null],
        ['end', '/he/hanukkah', 'he', 'www.google.com', 'seo-he-hanukkah', null],
        ['view', '/join-game/:pin', 'en', null, 'qr', null],
        ['stuck', '/join-game/:pin', 'en', null, 'qr', false],
    ]);
});

test('the function always answers 204: junk, a missing table, another method', async () => {
    rows.length = 0;
    quiet();
    assert.strictEqual((await post('not json', {})).code, 204);
    assert.strictEqual((await post(JSON.stringify({ k: 'nope' }), {})).code, 204);
    failInserts = true;
    assert.strictEqual((await post(JSON.stringify({ k: 'view', v: 'abc', first: '/' }), { 'user-agent': IPHONE })).code, 204);
    failInserts = false;
    loud();
    assert.strictEqual(visits().length, 0);
});
