#!/usr/bin/env node
// Local run: a challenge link's own link preview (functions/src/controllers/challenge-preview.ts), end to
// end on the Firebase emulators: Hosting (serving game/dist with the real firebase.json rewrites), Cloud
// Functions and Realtime Database.
//
// 1. Finished tables are put in the database as the server keeps them (players, scores, question ids,
//    each player's best lie in `highlights`, `challengeOpen` set by CHALLENGE ANOTHER GROUP): an English
//    one, a Hebrew one, one whose best lie the nickname filter rejects, one where no lie fooled anyone,
//    an old one whose players and lies the sweep moved under `kept`, and one whose challenge was never opened.
// 2. Link-preview fetchers (WhatsApp first, then Facebook, Telegram, iMessage, Slack, X) fetch each
//    challenge link (/challenge/<PIN>?via=challenge-whatsapp, /he/challenge/<PIN>?via=challenge-whatsapp)
//    with their own user agent: the page must lead with the table's best lie and how many it fooled, in
//    the game's language, name no player, and still be the app's page.
// 3. A challenge nobody opened, and an unknown PIN, get the page exactly as Hosting serves it.
// 4. A phone opens the English link: the app's challenge page shows the score to beat.
//
// Nothing reaches production; any outside request is refused.
// Needs Java (database emulator), functions/ built, game/ built, the root's npm ci (firebase-tools):
//   node .github/smoke/emulator-challenge-preview.js [path to dist]
// Prints a JSON summary with every preview's tags; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium, devices } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const DIST = path.resolve(process.argv[2] || path.join(ROOT, 'game', 'dist'));
const HOST = '127.0.0.1';
const PROJECT = 'demo-bullshit';
const SITE = `http://${HOST}:5000`;
const DB = `${HOST}:9000`;
const FUNCTIONS = `http://${HOST}:5001/${PROJECT}/us-central1`;
const AUTH = `http://${HOST}:9099`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s`, ...a);

const BOTS = {
    whatsapp: 'WhatsApp/2.24.21.80 A',
    facebook: 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
    telegram: 'TelegramBot (like TwitterBot)',
    imessage: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_1) AppleWebKit/601.2.4 (KHTML, like Gecko) Version/9.0.1 Safari/601.2.4 facebookexternalhit/1.1 Facebot Twitterbot/1.0',
    slack: 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
    x: 'Twitterbot/1.0',
};

// firebase-tools sends its own calls to the emulators through HTTPS_PROXY when one is set (see
// emulator-game.js): send loopback calls direct.
const NO_PROXY_FOR_LOOPBACK = `
const undici = require(require.resolve('undici', { paths: [process.env.FIREBASE_TOOLS_DIR] }));
const Real = undici.ProxyAgent;
const direct = new undici.Agent();
class LoopbackDirect extends undici.Dispatcher {
    constructor(opts) { super(); this.proxy = new Real(opts); }
    dispatch(opts, handler) {
        const host = new URL(opts.origin).hostname;
        return (host === '127.0.0.1' || host === 'localhost' ? direct : this.proxy).dispatch(opts, handler);
    }
    close() { return this.proxy.close(); }
    destroy() { return this.proxy.destroy(); }
}
undici.ProxyAgent = LoopbackDirect;
`;

async function startEmulators() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-challenge-preview-emulators-'));
    fs.symlinkSync(path.join(ROOT, 'functions'), path.join(dir, 'functions'));
    const real = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
    // The real hosting config (its rewrites above all), serving the build under test.
    // The hosting emulator serves no file from an absolute "public" path: link the build in as public/.
    fs.symlinkSync(DIST, path.join(dir, 'public'));
    const hosting = Object.assign({}, real.hosting, { public: 'public' });
    fs.writeFileSync(path.join(dir, 'firebase.json'), JSON.stringify({
        hosting,
        functions: { source: 'functions', runtime: 'nodejs22' },
        emulators: {
            auth: { host: HOST, port: 9099 },
            database: { host: HOST, port: 9000 },
            functions: { host: HOST, port: 5001 },
            hosting: { host: HOST, port: 5000 },
            ui: { enabled: false },
            singleProjectMode: true,
        },
    }, null, 2));
    fs.writeFileSync(path.join(dir, 'loopback.js'), NO_PROXY_FOR_LOOPBACK);
    const tools = path.join(ROOT, 'node_modules', 'firebase-tools');
    const env = Object.assign({}, process.env, { FIREBASE_TOOLS_DIR: tools });
    if (process.env.HTTPS_PROXY || process.env.https_proxy) {
        env.NODE_OPTIONS = `${env.NODE_OPTIONS || ''} --require ${path.join(dir, 'loopback.js')}`.trim();
    }
    const logFile = path.join(dir, 'emulators.log');
    const out = fs.openSync(logFile, 'w');
    const child = spawn(path.join(ROOT, 'node_modules', '.bin', 'firebase'),
        ['emulators:start', '--project', PROJECT], { cwd: dir, env, stdio: ['ignore', out, out], detached: true });
    child.logFile = logFile;
    log(`starting the emulators (log: ${logFile})`);
    const until = Date.now() + 120000;
    while (Date.now() < until) {
        const text = fs.readFileSync(logFile, 'utf8');
        if (/All emulators ready/.test(text)) return child;
        if (child.exitCode !== null) throw new Error(`the emulators stopped:\n${text.slice(-2000)}`);
        await sleep(1000);
    }
    throw new Error('the emulators did not start within 2 minutes');
}

function stopEmulators(child) {
    if (!child) return;
    try {
        process.kill(-child.pid, 'SIGINT');
    } catch (e) { /* already gone */ }
}

async function db(method, p, body) {
    const res = await fetch(`http://${DB}/${p}.json?ns=${PROJECT}`, {
        method, headers: { Authorization: 'Bearer owner' }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${method} ${p}: ${res.status} ${await res.text()}`);
    return res.json();
}

async function seed() {
    const rules = await fetch(`http://${DB}/.settings/rules.json?ns=${PROJECT}`, {
        method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: fs.readFileSync(path.join(ROOT, 'database-rules.json'), 'utf8'),
    });
    if (!rules.ok) throw new Error(`could not load the database rules: ${rules.status}`);
    const questions = {};
    for (const lang of ['en', 'he']) {
        for (let i = 0; i < 12; i++) {
            questions[`${lang}${i}`] = { lang, questionText: `Test question ${i} ___`, realAnswer: `truth${i}`, fakeAnswers: ['lie a', 'lie b', 'lie c', 'lie d'], citation: '' };
        }
    }
    await db('PUT', 'questions', questions);
    await db('PUT', 'gameCounter', 100000 + Math.floor(Math.random() * 100000));
}


const MIN = 60 * 1000;
const QIDS = ['en0', 'en1', 'en2', 'en3', 'en4', 'en5', 'en6'];
const QIDS_HE = ['he0', 'he1', 'he2', 'he3', 'he4', 'he5', 'he6'];
function table(locale, highlights, extra = {}) {
    const now = Date.now();
    const names = locale === 'he' ? ['דנה', 'בן', 'מאיה', 'רון', 'טל', 'אבי'] : ['Dana', 'Ben', 'Maya', 'Ron', 'Tal', 'Avi'];
    const scores = [2400, 1800, 1200, 900, 600, 300];
    const players = {};
    names.forEach((n, i) => { players[`p${i + 1}`] = { nickname: n, uid: `u${i + 1}`, score: scores[i], host: i === 0 }; });
    return Object.assign({
        state: { id: 6, timestamp: now - 60 * MIN }, timestamp: now - 120 * MIN, locale, creator: 'u1', challengeOpen: true,
        totalQ: 7, qids: locale === 'he' ? QIDS_HE : QIDS, roundIndex: 1, questionIndex: 6, presenter: false, tick: 0,
        campaign: 'test', players, highlights, highlightsFrom: 0,
    }, extra);
}
const hl = (text, fooled, q, points = 1000) => ({ text, fooled, points, q, total: fooled });

const GAMES = {
    CHEN: table('en', { p1: hl('Penguins have knees', 4, 'en2'), p2: hl('They glue the eggs', 2, 'en5'), p3: hl('Same count, earlier', 4, 'en1', 3000) }),
    CHHE: table('he', { p1: hl('לפינגווינים יש ברכיים', 4, 'he2'), p2: hl('מדביקים את הביצים', 2, 'he5') }),
    CHCR: table('en', { p1: hl('Penguins star in porn', 5, 'en6'), p2: hl('They glue the eggs', 2, 'en5') }),
    CHNO: table('en', {}),
    CHNM: table('en', { p1: hl('Dana ate them all', 5, 'en6'), p2: hl('They glue the eggs', 3, 'en5') }),
    CHSH: table('en', { p1: hl('Penguins have knees', 4, 'en2') }, { challengeOpen: null }),
};
// An old table: the sweep moved its players, lies and creator under `kept` (old-games.ts).
const old = table('en', { p1: hl('Penguins have knees', 4, 'en2') });
GAMES.CHOL = Object.assign({}, old, { kept: { players: old.players, highlights: old.highlights, creator: old.creator } });
delete GAMES.CHOL.players; delete GAMES.CHOL.highlights; delete GAMES.CHOL.creator;

function metas(html) {
    const out = {};
    const re = /<meta\s+(name|property|itemprop)="([^"]+)"\s+content="([^"]*)"/g;
    let m;
    while ((m = re.exec(html))) out[m[2]] = m[3];
    return out;
}
const unescape = (s) => String(s || '').replace(/&#39;/g, '\'').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

async function asBot(url, ua) {
    const res = await fetch(url, { headers: { 'User-Agent': ua }, redirect: 'manual' });
    const body = await res.text();
    return { status: res.status, cache: res.headers.get('cache-control'), body, meta: metas(body), title: (body.match(/<title>([^<]*)<\/title>/) || [])[1] };
}

const EXPECT = {
    CHEN: '“Penguins have knees” fooled 4 of 5. Can your group spot the truth?',
    CHHE: '״לפינגווינים יש ברכיים״ עבד על 4 מתוך 5. תצליחו לזהות את האמת?',
    CHCR: '“They glue the eggs” fooled 2 of 5. Can your group spot the truth?',
    CHNO: 'Your group is challenged to a game of Bullshit',
    CHNM: '“They glue the eggs” fooled 3 of 5. Can your group spot the truth?',
    CHOL: '“Penguins have knees” fooled 4 of 5. Can your group spot the truth?',
};

async function main() {
    if (!fs.existsSync(path.join(DIST, 'index.html')) || !fs.existsSync(path.join(DIST, 'he.html'))) throw new Error(`No built game at ${DIST}`);
    if (!fs.existsSync(path.join(ROOT, 'functions', 'dist', 'index.js'))) throw new Error('Build functions/ first: npm run build there');
    const emulators = await startEmulators();
    const problems = [];
    const summary = { previews: {}, otherBots: {} };
    let browser;
    try {
        await seed();
        for (const [pin, game] of Object.entries(GAMES)) await db('PUT', `games/${pin}`, game);
        const staticIndex = await (await fetch(`${SITE}/`)).text();
        const staticHe = await (await fetch(`${SITE}/he`)).text();
        const scriptOf = (html) => (html.match(/src="(main-[^"]+\.js)"/) || [])[1];
        const link = (pin) => `${SITE}${GAMES[pin].locale === 'he' ? '/he' : ''}/challenge/${pin}?via=challenge-whatsapp`;

        for (const pin of Object.keys(EXPECT)) {
            const r = await asBot(link(pin), BOTS.whatsapp);
            const he = GAMES[pin].locale === 'he';
            const tags = {
                'og:title': unescape(r.meta['og:title']), 'og:description': unescape(r.meta['og:description']),
                'og:image': r.meta['og:image'], 'og:url': r.meta['og:url'], 'og:locale': r.meta['og:locale'], robots: r.meta.robots,
                title: unescape(r.title), 'Cache-Control': r.cache,
            };
            summary.previews[pin] = tags;
            if (r.status !== 200 || tags['og:title'] !== EXPECT[pin]) problems.push(`${pin}: previewed as ${r.status} "${tags['og:title']}"`);
            if (unescape(r.meta['twitter:title']) !== EXPECT[pin] || tags.title !== EXPECT[pin]) problems.push(`${pin}: twitter:title or <title> is not the preview`);
            if (!/7 (questions|שאלות)/.test(tags['og:description']) || !/2400/.test(tags['og:description'])) problems.push(`${pin}: the description lacks the questions or the score`);
            if (tags['og:url'] !== `${SITE}${he ? '/he' : ''}/challenge/${pin}`) problems.push(`${pin}: og:url is ${tags['og:url']}`);
            if (tags.robots !== 'noindex') problems.push(`${pin}: no robots noindex`);
            if (!new RegExp(he ? '/assets/og-image-he\\.png$' : '/assets/og-image\\.png$').test(tags['og:image'] || '')) problems.push(`${pin}: image is ${tags['og:image']}`);
            if (tags['og:locale'] !== (he ? 'he_IL' : 'en_US')) problems.push(`${pin}: og:locale is ${tags['og:locale']}`);
            const names = Object.values(GAMES.CHEN.players).concat(Object.values(GAMES.CHHE.players)).map((p) => p.nickname);
            const all = Object.keys(r.meta).map((k) => unescape(r.meta[k])).join(' ') + ' ' + tags.title;
            names.forEach((n) => { if (new RegExp(`(^|[^\\p{L}])${n}([^\\p{L}]|$)`, 'u').test(all)) problems.push(`${pin}: a tag names ${n}`); });
            if (scriptOf(r.body) !== scriptOf(he ? staticHe : staticIndex) || !/<app-root/.test(r.body)) problems.push(`${pin}: not the app's page`);
            // Browsers ask again every time; the CDN may keep it ten minutes (challengeCache).
            if (r.cache !== 'public, max-age=0, s-maxage=600') problems.push(`${pin}: Cache-Control is ${r.cache}`);
        }
        for (const [bot, ua] of Object.entries(BOTS)) {
            if (bot === 'whatsapp') continue;
            const a = unescape((await asBot(link('CHEN'), ua)).meta['og:title']);
            const b = unescape((await asBot(link('CHHE'), ua)).meta['og:title']);
            summary.otherBots[bot] = { en: a, he: b };
            if (a !== EXPECT.CHEN || b !== EXPECT.CHHE) problems.push(`${bot}: previewed as "${a}" / "${b}"`);
        }

        // Never opened, unknown: the page as Hosting serves it.
        const shut = await asBot(`${SITE}/challenge/CHSH?via=challenge-whatsapp`, BOTS.whatsapp);
        summary.neverOpened = unescape(shut.meta['og:title']);
        if (shut.body !== staticIndex) problems.push('a challenge nobody opened did not get the page exactly as Hosting serves it');
        const unknown = await asBot(`${SITE}/he/challenge/QZZZZZ`, BOTS.whatsapp);
        if (unknown.body !== staticHe) problems.push('an unknown Hebrew PIN did not get he.html exactly as Hosting serves it');
        // Join links still preview as before.
        const join = await asBot(`${SITE}/join-game/QZZZZZ?via=link`, BOTS.whatsapp);
        if (join.body !== staticIndex) problems.push('an unknown join PIN changed');

        // A phone opens the English link: the app's challenge page, with the score to beat.
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`] });
        const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
        await context.route((url) => new URL(url.toString()).host !== new URL(SITE).host, async (route) => {
            const u = new URL(route.request().url());
            if (u.hostname.endsWith('.cloudfunctions.net')) {
                try { return route.fulfill({ response: await route.fetch({ url: `${FUNCTIONS}${u.pathname}${u.search}` }) }); } catch (e) { return route.abort('failed'); }
            }
            return route.abort('blockedbyclient');
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e.message || e)));
        await page.goto(link('CHEN'));
        try {
            await page.waitForFunction(() => /2400/.test(document.body.innerText), null, { timeout: 30000 });
            summary.phoneShowsScore = true;
        } catch (e) {
            summary.phoneShowsScore = false;
            problems.push('the phone\'s challenge page did not show the score to beat');
        }
        summary.phoneUrl = page.url();
        if (process.env.SHOTS) {
            fs.mkdirSync(process.env.SHOTS, { recursive: true });
            await page.screenshot({ path: path.join(process.env.SHOTS, 'challenge-page.png') });
        }
        errors.forEach((e) => problems.push(`phone: ${e}`));

        const fnLog = fs.readFileSync(emulators.logFile, 'utf8').split('\n').filter((l) => /joinPreview /.test(l));
        summary.functionLog = fnLog.slice(-3).map((l) => l.replace(/^.*?joinPreview /, 'joinPreview '));
        summary.problems = problems;
        console.log('\nRESULT ' + JSON.stringify(summary, null, 2));
        console.log(problems.length ? 'FAIL' : 'PASS');
        process.exitCode = problems.length ? 1 : 0;
    } finally {
        if (browser) await browser.close();
        stopEmulators(emulators);
    }
}

main().catch((e) => {
    console.error('FAIL', e.stack || e);
    process.exitCode = 1;
});
