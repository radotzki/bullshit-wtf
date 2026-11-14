// A join link's own link preview (controllers/join-preview.ts and the joinPreview function in index.ts).
// Runs the compiled functions (dist/) with an in-memory database and a fake site, no Firebase project:
//   npm run build && npm test
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// ---- in-memory Realtime Database, recording every path read ----
const db = {};
const reads = [];
function at(parts) {
    let node = db;
    for (const p of parts) {
        if (node == null || typeof node !== 'object') return null;
        node = node[p];
    }
    return node === undefined ? null : node;
}
function ref(parts) {
    return {
        child: (p) => ref(parts.concat(String(p).split('/'))),
        once: async () => { reads.push(parts.join('/')); return { val: () => JSON.parse(JSON.stringify(at(parts))) }; },
        set: async () => { throw new Error('the preview never writes'); },
        update: async () => { throw new Error('the preview never writes'); },
    };
}
const fakeFirebase = {
    gamesRef: ref(['games']),
    qHistoryRef: ref(['qHistory']),
    gameCounterRef: ref(['gameCounter']),
    questionsRef: ref(['questions']),
    seenQuestionsRef: ref(['seenQuestions']),
    crewsRef: ref(['crews']),
    get: (r) => r.once('value').then(s => s.val()),
};
const fakeFunctions = {
    https: { onRequest: (h) => ({ __handler: h }) },
    database: { ref: () => ({ onWrite: (h) => ({ __trigger: h }) }) },
};
fakeFunctions.runWith = () => fakeFunctions;
class FakeBigQuery { dataset() { return { table: () => ({ insert: async () => { } }) }; } }
const realLoad = Module._load;
Module._load = function (request) {
    if (request === 'firebase-functions/v1') return fakeFunctions;
    if (request === 'cors') return () => (req, res, next) => next();
    if (request === '@google-cloud/bigquery') return { BigQuery: FakeBigQuery };
    if (/[\\/]firebase$/.test(request) || request === './../firebase' || request === '../firebase') return fakeFirebase;
    return realLoad.apply(this, arguments);
};

const dist = path.join(__dirname, '..', 'dist');
const jp = require(path.join(dist, 'controllers', 'join-preview'));
const api = require(path.join(dist, 'index'));
const { SWAP_NAMES } = require(path.join(dist, 'name-flag'));

// ---- the site's two real pages: game/src/index.html, and he.html as game/scripts/build-he.js makes it ----
const ROOT = path.join(__dirname, '..', '..');
const EN_SHELL = fs.readFileSync(path.join(ROOT, 'game', 'src', 'index.html'), 'utf8');
function hebrewShell() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-he-'));
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.mkdirSync(path.join(dir, 'dist'));
    fs.copyFileSync(path.join(ROOT, 'game', 'scripts', 'build-he.js'), path.join(dir, 'scripts', 'build-he.js'));
    fs.writeFileSync(path.join(dir, 'dist', 'index.html'), EN_SHELL);
    execFileSync(process.execPath, [path.join(dir, 'scripts', 'build-he.js')], { stdio: 'ignore' });
    return fs.readFileSync(path.join(dir, 'dist', 'he.html'), 'utf8');
}
const HE_SHELL = hebrewShell();

const now = Date.now();
const MIN = 60 * 1000;
function lobby(extra = {}) {
    return Object.assign({
        state: { id: 0, timestamp: now - MIN }, timestamp: now - MIN, locale: 'en', creator: 'uidHost',
        players: { p1: { nickname: 'Dana', uid: 'uidHost', score: 0, host: true }, p2: { nickname: 'Ben', uid: 'uidB', score: 0 } },
    }, extra);
}

/** Every content= of a meta tag, by its name/property/itemprop. */
function metas(html) {
    const out = {};
    const re = /<meta\s+(name|property|itemprop)="([^"]+)"\s+content="([^"]*)"/g;
    let m;
    while ((m = re.exec(html))) {
        (out[m[2]] = out[m[2]] || []).push(m[3]);
    }
    return out;
}
const one = (html, key) => { const v = metas(html)[key]; assert.ok(v, `no ${key}`); assert.strictEqual(new Set(v).size, 1); return v[0]; };

// ---- a fake site ----
function site(pages = { '/': EN_SHELL, '/he': HE_SHELL }) {
    const calls = [];
    const fetcher = async (url, init) => {
        calls.push({ url, init });
        const p = new URL(url).pathname;
        const body = pages[p];
        if (body === undefined) return { status: 404, headers: { get: () => null }, text: async () => 'no' };
        const etag = '"' + body.length + '"';
        if (init && init.headers && init.headers['If-None-Match'] === etag) {
            return { status: 304, headers: { get: (h) => (h.toLowerCase() === 'etag' ? etag : null) }, text: async () => '' };
        }
        return { status: 200, headers: { get: (h) => (h.toLowerCase() === 'etag' ? etag : null) }, text: async () => body };
    };
    return { fetcher, calls };
}
function deps(games, s = site(), extra = {}) {
    const faults = [];
    return Object.assign({
        readGame: async (pin) => (games[pin] === undefined ? null : JSON.parse(JSON.stringify(games[pin]))),
        fetcher: s.fetcher, project: 'bullshit-wtf-prod', emulator: false, now: () => now, fault: (e) => faults.push(e),
        faults,
    }, extra);
}
const PROD = { 'x-forwarded-host': 'bullshit.wtf' };

test.beforeEach(() => jp.forgetShells());

test('parseJoinPath: the PIN and which page, nothing else', () => {
    assert.deepStrictEqual(jp.parseJoinPath('/join-game/qbcd'), { pin: 'QBCD', shell: 'en' });
    assert.deepStrictEqual(jp.parseJoinPath('/he/join-game/QBCD'), { pin: 'QBCD', shell: 'he' });
    assert.deepStrictEqual(jp.parseJoinPath('/join-game/QBCD/'), { pin: 'QBCD', shell: 'en' });
    for (const bad of ['/join-game', '/join-game/', '/join-game/A', '/join-game/AB.CD', '/join-game/ABCD/x', '/xx/join-game/ABCD',
        '/join-game/ABCDEFGHIJKLM', '/join-game/%3Cb%3E', null, 7]) {
        assert.strictEqual(jp.parseJoinPath(bad), null, String(bad));
    }
});

test('shownName: the host\'s name, cut and cleaned; never a flagged name or a swap name', () => {
    assert.strictEqual(jp.shownName('Dana'), 'Dana');
    assert.strictEqual(jp.shownName('  דנה  '), 'דנה');
    assert.strictEqual(jp.shownName('Bartholomew the Great'), 'Bartholom');
    assert.strictEqual(jp.shownName('Da\u202Ena'), 'Dana');
    assert.strictEqual(jp.shownName('\u2066x\u2069'), 'x');
    assert.strictEqual(jp.shownName('...'), '');
    assert.strictEqual(jp.shownName(''), '');
    assert.strictEqual(jp.shownName(null), '');
    assert.strictEqual(jp.shownName(42), '');
    assert.strictEqual(jp.shownName('nigger'), '');
    assert.strictEqual(jp.shownName('n1gger'), '');
    for (const swap of SWAP_NAMES.en.concat(SWAP_NAMES.he)) {
        assert.strictEqual(jp.shownName(swap), '', swap);
        assert.strictEqual(jp.shownName(swap.toUpperCase()), '', swap);
    }
});

test('hostOf: the marked host (the newest mark), else the creator\'s seat, else nobody', () => {
    assert.strictEqual(jp.hostOf(lobby()), 'Dana');
    assert.strictEqual(jp.hostOf(lobby({ players: { a: { nickname: 'Old', host: true }, b: { nickname: 'New', host: true } } })), 'New');
    assert.strictEqual(jp.hostOf(lobby({ players: { a: { nickname: 'Ben', uid: 'x' }, b: { nickname: 'Cat', uid: 'uidHost' } } })), 'Cat');
    assert.strictEqual(jp.hostOf(lobby({ players: { a: { nickname: 'Ben', uid: 'x' } } })), undefined);
    assert.strictEqual(jp.hostOf(lobby({ players: undefined })), undefined);
    assert.strictEqual(jp.hostOf(lobby({ creator: undefined, players: { a: { nickname: 'Ben' } } })), undefined);
});

test('previewOf: English and Hebrew invites, nameless, and the generic card for games that are over', () => {
    const en = jp.previewOf(lobby(), 'QBCD', now);
    assert.strictEqual(en.title, 'Dana invited you to play Bullshit');
    assert.match(en.description, /join game QBCD/);
    assert.strictEqual(en.image, 'https://bullshit.wtf/assets/og-image.png');
    assert.strictEqual(en.locale, 'en');

    const he = jp.previewOf(lobby({ locale: 'he', players: { a: { nickname: 'נועה', host: true } } }), 'QBCD', now);
    assert.strictEqual(he.title, 'הזמנה לבולשיט: נועה מחכה לך');
    assert.match(he.description, /QBCD/);
    assert.strictEqual(he.image, 'https://bullshit.wtf/assets/og-image-he.png');
    // No gendered verb forms (מזמין/מזמינה, הוזמנה/הוזמן): only forms written the same for everyone.
    assert.doesNotMatch(he.title + he.description, /מזמינ|מזמין|\/ה/);

    const nameless = jp.previewOf(lobby({ players: {} }), 'QBCD', now);
    assert.strictEqual(nameless.title, 'You\'re invited to a game of Bullshit');
    assert.strictEqual(nameless.host, '');
    assert.strictEqual(jp.previewOf(lobby({ locale: 'he', players: {} }), 'QBCD', now).title, 'הוזמנת למשחק בולשיט');

    // A swapped host is a nameless invite, never "Grandma invited you".
    assert.strictEqual(jp.previewOf(lobby({ players: { a: { nickname: SWAP_NAMES.en[0], host: true } } }), 'QBCD', now).host, '');

    // Mid-game: still an invite (the join page lets people in until the game is over).
    assert.ok(jp.previewOf(lobby({ state: { id: 2, timestamp: now - MIN } }), 'QBCD', now).host);
    // Hanukkah games get the Hanukkah picture in their language.
    assert.strictEqual(jp.previewOf(lobby({ pack: 'hanukkah', locale: 'he' }), 'QBCD', now).image, 'https://bullshit.wtf/assets/og-hanukkah-he.png');
    assert.strictEqual(jp.previewOf(lobby({ pack: 'nope' }), 'QBCD', now).image, 'https://bullshit.wtf/assets/og-image.png');

    // Over: no game, the final scoreboard, still for six hours, junk.
    assert.strictEqual(jp.previewOf(null, 'QBCD', now), null);
    assert.strictEqual(jp.previewOf(lobby({ state: { id: 6, timestamp: now - MIN } }), 'QBCD', now), null);
    assert.strictEqual(jp.previewOf(lobby({ state: { id: 0, timestamp: now - 7 * 60 * MIN }, timestamp: now - 7 * 60 * MIN }), 'QBCD', now), null);
    assert.strictEqual(jp.previewOf({ locale: 'en' }, 'QBCD', now), null);
    assert.strictEqual(jp.previewOf('x', 'QBCD', now), null);
});

test('personalize: every preview tag of both real pages is set, the rest of the page untouched', () => {
    for (const [shell, locale] of [[EN_SHELL, 'en'], [HE_SHELL, 'he'], [EN_SHELL, 'he'], [HE_SHELL, 'en']]) {
        const preview = jp.previewOf(lobby({ locale }), 'QBCD', now);
        const page = jp.personalize(shell, preview, 'https://bullshit.wtf/join-game/QBCD');
        assert.ok(page, 'personalized');
        assert.strictEqual(one(page, 'og:title'), preview.title);
        assert.strictEqual(one(page, 'twitter:title'), preview.title);
        assert.strictEqual(one(page, 'og:description'), preview.description);
        assert.strictEqual(one(page, 'twitter:description'), preview.description);
        assert.strictEqual(one(page, 'description'), preview.description);
        assert.strictEqual(one(page, 'og:image'), preview.image);
        assert.strictEqual(one(page, 'twitter:image'), preview.image);
        assert.strictEqual(one(page, 'image'), preview.image);
        assert.strictEqual(one(page, 'og:url'), 'https://bullshit.wtf/join-game/QBCD');
        assert.strictEqual(one(page, 'og:locale'), locale === 'he' ? 'he_IL' : 'en_US');
        assert.strictEqual(one(page, 'robots'), 'noindex');
        assert.strictEqual(page.match(/<title>([^<]*)<\/title>/)[1], preview.title);
        // Outside the BS:META block the page is the same: scripts, app-root, the beacon.
        const outside = (h) => h.replace(/<!-- BS:META:START -->[\s\S]*?<!-- BS:META:END -->/, '').replace(/<title>[^<]*<\/title>/, '');
        assert.strictEqual(outside(page), outside(shell));
        // The tags come early in the page: WhatsApp reads only the start of a page.
        assert.ok(page.indexOf('og:title') < 16 * 1024);
    }
    assert.strictEqual(jp.personalize('<html>no markers</html>', jp.previewOf(lobby(), 'QBCD', now), 'u'), null);
    assert.strictEqual(jp.personalize(EN_SHELL.replace(/<meta property="og:image" [^>]*>/, ''), jp.previewOf(lobby(), 'QBCD', now), 'u'), null);
});

test('a nickname is escaped: no tag or attribute can be made from it', () => {
    const preview = jp.previewOf(lobby({ players: { a: { nickname: '"><b>x&', host: true } } }), 'QBCD', now);
    const page = jp.personalize(EN_SHELL, preview, 'https://bullshit.wtf/join-game/QBCD');
    assert.ok(page.includes('&quot;&gt;&lt;b&gt;x&amp; invited you'));
    assert.ok(!page.includes('"><b>x'));
    assert.strictEqual(jp.escapeHtml(`<'&">`), '&lt;&#39;&amp;&quot;&gt;');
});

test('originOf: only our own hosts; anything else is the site', () => {
    assert.strictEqual(jp.originOf({ 'x-forwarded-host': 'bullshit.wtf' }, 'bullshit-wtf-prod', false), 'https://bullshit.wtf');
    assert.strictEqual(jp.originOf({ 'x-forwarded-host': 'www.bullshit.wtf' }, 'bullshit-wtf-prod', false), 'https://www.bullshit.wtf');
    assert.strictEqual(jp.originOf({ 'x-forwarded-host': 'bullshit-wtf-prod.web.app' }, 'bullshit-wtf-prod', false), 'https://bullshit-wtf-prod.web.app');
    assert.strictEqual(jp.originOf({ 'x-forwarded-host': 'bullshit-wtf-prod--pr12-abc.web.app' }, 'bullshit-wtf-prod', false), 'https://bullshit-wtf-prod--pr12-abc.web.app');
    assert.strictEqual(jp.originOf({ 'x-forwarded-host': 'evil.example' }, 'bullshit-wtf-prod', false), 'https://bullshit.wtf');
    assert.strictEqual(jp.originOf({ 'x-forwarded-host': 'bullshit.wtf.evil.example' }, 'bullshit-wtf-prod', false), 'https://bullshit.wtf');
    assert.strictEqual(jp.originOf({ host: 'us-central1-bullshit-wtf-prod.cloudfunctions.net' }, 'bullshit-wtf-prod', false), 'https://bullshit.wtf');
    assert.strictEqual(jp.originOf({ host: 'x' }, 'bullshit-wtf-dev', false), 'https://bullshit-wtf-dev.web.app');
    assert.strictEqual(jp.originOf({ host: '127.0.0.1:5000' }, 'demo-bullshit', false), 'https://demo-bullshit.web.app');
    assert.strictEqual(jp.originOf({ host: '127.0.0.1:5000' }, 'demo-bullshit', true), 'http://127.0.0.1:5000');
    assert.strictEqual(jp.originOf({}, '', false), 'https://bullshit.wtf');
});

test('joinPreviewPage: a named preview from the page at the visitor\'s host, cached for minutes', async () => {
    const s = site();
    const d = deps({ QBCD: lobby() }, s);
    const a = await jp.joinPreviewPage('/join-game/qbcd', '?via=link', PROD, d);
    assert.strictEqual(a.kind, 'named');
    assert.strictEqual(a.status, 200);
    assert.strictEqual(a.headers['Content-Type'], 'text/html; charset=utf-8');
    assert.strictEqual(a.headers['Cache-Control'], 'public, max-age=300, s-maxage=600');
    assert.strictEqual(one(a.body, 'og:title'), 'Dana invited you to play Bullshit');
    assert.strictEqual(one(a.body, 'og:url'), 'https://bullshit.wtf/join-game/QBCD');
    assert.ok(a.body.includes('<app-root>'), 'the app is in the page');
    assert.deepStrictEqual(s.calls.map(c => c.url), ['https://bullshit.wtf/']);

    const h = await jp.joinPreviewPage('/he/join-game/QBCD', '', PROD, deps({ QBCD: lobby({ locale: 'he', players: { a: { nickname: 'נועה', host: true } } }) }, s));
    assert.strictEqual(h.kind, 'named');
    assert.strictEqual(one(h.body, 'og:title'), 'הזמנה לבולשיט: נועה מחכה לך');
    assert.strictEqual(one(h.body, 'og:url'), 'https://bullshit.wtf/he/join-game/QBCD');
    assert.match(h.body, /<html lang="en">|<html/);
    assert.strictEqual(s.calls[1].url, 'https://bullshit.wtf/he');
    assert.strictEqual(d.faults.length, 0);
});

test('joinPreviewPage: unknown, finished and old PINs get the page exactly as Hosting serves it', async () => {
    const games = { DONE: lobby({ state: { id: 6, timestamp: now - MIN } }), OLD: lobby({ state: { id: 0, timestamp: now - 9 * 60 * MIN }, timestamp: now - 9 * 60 * MIN }) };
    for (const p of ['/join-game/NOPE', '/join-game/DONE', '/join-game/OLD']) {
        const a = await jp.joinPreviewPage(p, '', PROD, deps(games));
        assert.strictEqual(a.kind, 'generic', p);
        assert.strictEqual(a.body, EN_SHELL, p);
        assert.strictEqual(a.headers['Cache-Control'], 'public, max-age=300, s-maxage=600');
    }
    const he = await jp.joinPreviewPage('/he/join-game/NOPE', '', PROD, deps(games));
    assert.strictEqual(he.body, HE_SHELL);
    // A path that is no join link with a PIN (the rewrite sends only those, but still).
    assert.strictEqual((await jp.joinPreviewPage('/join-game/a.b', '', PROD, deps(games))).body, EN_SHELL);
});

test('joinPreviewPage: no host yet is a nameless invite, cached one minute', async () => {
    const a = await jp.joinPreviewPage('/join-game/QBCD', '', PROD, deps({ QBCD: lobby({ players: {} }) }));
    assert.strictEqual(a.kind, 'nameless');
    assert.strictEqual(a.headers['Cache-Control'], 'public, max-age=60, s-maxage=60');
    assert.strictEqual(one(a.body, 'og:title'), 'You&#39;re invited to a game of Bullshit');
});

test('joinPreviewPage: a slow or failing database gets the generic page, cached one minute', async () => {
    const slow = deps({}, site(), { readGame: () => new Promise(() => { }) });
    const t0 = Date.now();
    const a = await jp.joinPreviewPage('/join-game/QBCD', '', PROD, slow);
    assert.ok(Date.now() - t0 < jp.READ_TIMEOUT_MS + 500);
    assert.strictEqual(a.kind, 'generic');
    assert.strictEqual(a.body, EN_SHELL);
    assert.strictEqual(a.headers['Cache-Control'], 'public, max-age=60, s-maxage=60');
    assert.strictEqual(slow.faults.length, 1);

    const failing = deps({}, site(), { readGame: async () => { throw new Error('permission denied'); } });
    assert.strictEqual((await jp.joinPreviewPage('/join-game/QBCD', '', PROD, failing)).body, EN_SHELL);
});

test('joinPreviewPage: the page is kept in memory, then checked with its ETag', async () => {
    const s = site();
    let t = now;
    const d = deps({ QBCD: lobby() }, s, { now: () => t });
    await jp.joinPreviewPage('/join-game/QBCD', '', PROD, d);
    t += 1000;
    await jp.joinPreviewPage('/join-game/QBCD', '', PROD, d);
    assert.strictEqual(s.calls.length, 1, 'fresh copy reused');
    t += jp.SHELL_FRESH_MS + 1;
    const a = await jp.joinPreviewPage('/join-game/QBCD', '', PROD, d);
    assert.strictEqual(s.calls.length, 2);
    assert.strictEqual(s.calls[1].init.headers['If-None-Match'], '"' + EN_SHELL.length + '"');
    assert.strictEqual(a.kind, 'named');
});

test('joinPreviewPage: a site that cannot be fetched gets a page that tries again, never cached', async () => {
    const down = deps({ QBCD: lobby() }, site({}));
    const a = await jp.joinPreviewPage('/join-game/QBCD', '?via=link', PROD, down);
    assert.strictEqual(a.kind, 'fallback');
    assert.strictEqual(a.headers['Cache-Control'], 'no-store');
    assert.ok(a.body.includes('http-equiv="refresh"'));
    assert.ok(a.body.includes('href="/join-game/QBCD?via=link"'));
    assert.strictEqual(down.faults.length, 1);
    // A query is escaped in the link.
    const b = await jp.joinPreviewPage('/join-game/QBCD', '?via="><script>', PROD, deps({}, site({})));
    assert.ok(!b.body.includes('"><script>'));
    // A page without the markers counts as down too, so a broken page never goes out.
    const odd = await jp.joinPreviewPage('/join-game/QBCD', '', PROD, deps({ QBCD: lobby() }, site({ '/': '<html><app-root></app-root></html>' })));
    assert.strictEqual(odd.kind, 'fallback');
});

test('the joinPreview function reads only what the preview needs, never writes, and answers the page', async () => {
    db.games = { QBCD: Object.assign(lobby(), { qids: { 0: 'q1' }, answers: { x: 1 }, hostKey: 'secretsecretsecret', revealAnswers: [] }) };
    reads.length = 0;
    const realFetch = global.fetch;
    const fetched = [];
    global.fetch = async (url, init) => { fetched.push(url); return site().fetcher(url, init); };
    const logs = [];
    const realLog = console.log;
    console.log = (line) => logs.push(String(line));
    try {
        const res = await new Promise((resolve) => {
            const out = { code: 200, headers: {} };
            const r = {
                set(k, v) { out.headers[k] = v; return this; },
                status(c) { out.code = c; return this; },
                send(b) { out.body = b; resolve(out); return this; },
            };
            api.joinPreview.__handler({ method: 'GET', url: '/join-game/QBCD?via=link', originalUrl: '/join-game/QBCD?via=link', headers: PROD, body: {} }, r);
        });
        assert.strictEqual(res.code, 200);
        assert.strictEqual(one(res.body, 'og:title'), 'Dana invited you to play Bullshit');
        assert.strictEqual(res.headers['Cache-Control'], 'public, max-age=300, s-maxage=600');
        assert.deepStrictEqual(reads.sort(), ['games/QBCD/creator', 'games/QBCD/hostSeen', 'games/QBCD/locale', 'games/QBCD/pack',
            'games/QBCD/players', 'games/QBCD/state', 'games/QBCD/timestamp']);
        assert.deepStrictEqual(fetched, ['https://bullshit.wtf/']);
        const line = logs.find(l => l.startsWith('joinPreview '));
        assert.ok(line, 'one log line');
        assert.ok(!line.includes('Dana'), 'no nickname in the log');
        assert.strictEqual(JSON.parse(line.slice('joinPreview '.length)).kind, 'named');
    } finally {
        global.fetch = realFetch;
        console.log = realLog;
    }
});

test('firebase.json sends both join paths to joinPreview, ahead of the Hebrew and catch-all rewrites', () => {
    const rewrites = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8')).hosting.rewrites;
    const at = (src) => rewrites.findIndex(r => r.source === src);
    assert.strictEqual(rewrites[at('/join-game/*')].function, 'joinPreview');
    assert.strictEqual(rewrites[at('/he/join-game/*')].function, 'joinPreview');
    assert.ok(at('/he/join-game/*') < at('/he/**'));
    assert.ok(at('/join-game/*') < at('**'));
    assert.strictEqual(rewrites[at('/_v')].function, 'visit');
    assert.strictEqual(rewrites[at('**')].destination, '/index.html');
});
