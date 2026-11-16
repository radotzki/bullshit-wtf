#!/usr/bin/env node
// Local run: join links' own link previews (functions/src/controllers/join-preview.ts), end to end on
// the Firebase emulators: Hosting (serving game/dist with the real firebase.json rewrites), Cloud
// Functions, Realtime Database and Auth.
//
// 1. Two hosts make a game each with the built game in headless Chromium, as people do: an English
//    one joins as "Dana", a Hebrew one as "נועה". Their lobbies show the invite link.
// 2. Link-preview fetchers (WhatsApp, Facebook, Telegram, iMessage, Slack, X) fetch each invite link
//    with their own user agent: the page must carry the game's own title, description and picture, in
//    the game's language, and still be the app's page.
// 3. An unknown PIN gets the generic preview, exactly the page Hosting serves for any other path.
// 4. A phone (iPhone user agent) opens the English invite link with its ?via=link: the join page
//    shows the nickname step for that PIN, the phone joins, reaches the lobby, sits in the game, and
//    its join is counted with via "link".
//
// Nothing reaches production: the built game names the production project, so every request it makes
// is caught in the browser and sent to the emulators instead. Any other outside request is refused.
// Needs Java (database emulator), functions/ built, game/ built, the root's npm ci (firebase-tools):
//   node .github/smoke/emulator-join-preview.js [path to dist]
// Prints a JSON summary; exits non-zero when a check fails. SHOTS=<dir> saves screenshots.

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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-preview-emulators-'));
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

/** Where a request the game makes goes instead: an emulator URL, or null to refuse it. */
function redirect(url) {
    const u = new URL(url);
    if (u.hostname.endsWith('.cloudfunctions.net')) return `${FUNCTIONS}${u.pathname}${u.search}`;
    if (u.hostname === 'identitytoolkit.googleapis.com' || u.hostname === 'securetoken.googleapis.com') return `${AUTH}/${u.hostname}${u.pathname}${u.search}`;
    if (u.hostname === 'www.googleapis.com' && u.pathname.startsWith('/identitytoolkit/')) return `${AUTH}/www.googleapis.com${u.pathname}${u.search}`;
    if (u.hostname.endsWith('.firebaseio.com') || u.host === DB) {
        const to = new URL(`http://${DB}${u.pathname}${u.search}`);
        to.searchParams.set('ns', PROJECT);
        return to.toString();
    }
    return null;
}

async function newPhone(browser, name, options = {}) {
    const context = await browser.newContext(Object.assign({ serviceWorkers: 'block', viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true }, options));
    const phone = { name, context, problems: [], calls: [] };
    await context.route((url) => new URL(url.toString()).host !== new URL(SITE).host, async (route) => {
        const target = redirect(route.request().url());
        if (!target) return route.abort('blockedbyclient');
        if (/cloudfunctions\.net/.test(route.request().url())) {
            phone.calls.push({ fn: new URL(route.request().url()).pathname.split('/').pop(), body: route.request().postData() });
        }
        try {
            return route.fulfill({ response: await route.fetch({ url: target }) });
        } catch (e) {
            return route.abort('failed');
        }
    });
    await context.routeWebSocket((url) => /\/\.ws$/.test(url.pathname), (ws) => {
        const target = new URL(redirect(ws.url().replace(/^ws/, 'http')));
        target.protocol = 'ws:';
        const upstream = new WebSocket(target.toString());
        const waiting = [];
        upstream.onopen = () => waiting.splice(0).forEach((m) => upstream.send(m));
        upstream.onmessage = (e) => ws.send(e.data);
        upstream.onclose = () => ws.close({ code: 1000 });
        upstream.onerror = () => ws.close({ code: 1006 });
        ws.onMessage((m) => (upstream.readyState === 1 ? upstream.send(m) : waiting.push(m)));
        ws.onClose(() => upstream.close());
    });
    const page = await context.newPage();
    page.on('pageerror', (err) => phone.problems.push(`uncaught exception: ${err.message || err}`));
    page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        if (/Failed to load resource|ERR_BLOCKED_BY_CLIENT|WebSocket connection/.test(msg.text())) return;
        phone.problems.push(`console error: ${msg.text()}`);
    });
    phone.page = page;
    return phone;
}

/** A host makes a game in `locale` and joins it as `nickname`; returns the PIN once the lobby shows. */
async function hostGame(browser, locale, nickname) {
    const host = await newPhone(browser, nickname);
    await host.page.goto(`${SITE}/create-game?via=test`);
    await host.page.locator('input[name="locale"]').nth(locale === 'he' ? 1 : 0).check();
    await host.page.locator('input[name="length"]').first().check();
    await host.page.locator('form button[type="submit"]').first().click();
    await host.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
    const pin = new URL(host.page.url()).pathname.split('/').pop().toUpperCase();
    const input = host.page.locator('input[name="nickname"]');
    await input.waitFor({ timeout: 30000 });
    await input.fill(nickname);
    await host.page.locator('form button[type="submit"]').first().click();
    await host.page.waitForURL(/\/game-staging\//, { timeout: 30000 });
    log(`${nickname} made game ${pin} (${locale}) and is in its lobby`);
    return { host, pin };
}

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

async function main() {
    if (!fs.existsSync(path.join(DIST, 'index.html')) || !fs.existsSync(path.join(DIST, 'he.html'))) throw new Error(`No built game at ${DIST}`);
    if (!fs.existsSync(path.join(ROOT, 'functions', 'dist', 'index.js'))) throw new Error('Build functions/ first: npm run build there');
    const emulators = await startEmulators();
    const problems = [];
    const summary = { previews: {} };
    let browser;
    try {
        await seed();
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`] });

        const en = await hostGame(browser, 'en', 'Dana');
        const he = await hostGame(browser, 'he', 'נועה');
        // The links the lobbies give, as the invite builds them (share.service.ts inviteUrl).
        const enLink = `${SITE}/join-game/${en.pin}?via=link`;
        const heLink = `${SITE}/he/join-game/${he.pin}?via=link`;
        const staticIndex = await (await fetch(`${SITE}/`)).text();
        const staticHe = await (await fetch(`${SITE}/he`)).text();
        const scriptOf = (html) => (html.match(/src="(main-[^"]+\.js)"/) || [])[1];

        for (const [bot, ua] of Object.entries(BOTS)) {
            const a = await asBot(enLink, ua);
            const b = await asBot(heLink, ua);
            summary.previews[bot] = { en: unescape(a.meta['og:title']), he: unescape(b.meta['og:title']) };
            const expectEn = 'Dana invited you to play Bullshit';
            const expectHe = 'הזמנה לבולשיט: נועה מחכה לך';
            if (a.status !== 200 || unescape(a.meta['og:title']) !== expectEn) problems.push(`${bot}: English link previewed as ${a.status} "${a.meta['og:title']}"`);
            if (unescape(a.meta['twitter:title']) !== expectEn || unescape(a.title) !== expectEn) problems.push(`${bot}: English twitter:title or <title> is not the invite`);
            if (!new RegExp(`join game ${en.pin}`).test(a.meta['og:description'] || '')) problems.push(`${bot}: English description lacks the PIN`);
            if (!/\/assets\/og-image\.png$/.test(a.meta['og:image'] || '')) problems.push(`${bot}: English image is ${a.meta['og:image']}`);
            if (a.meta['og:url'] !== `${SITE}/join-game/${en.pin}`) problems.push(`${bot}: English og:url is ${a.meta['og:url']}`);
            if (b.status !== 200 || unescape(b.meta['og:title']) !== expectHe) problems.push(`${bot}: Hebrew link previewed as ${b.status} "${b.meta['og:title']}"`);
            if (!/\/assets\/og-image-he\.png$/.test(b.meta['og:image'] || '')) problems.push(`${bot}: Hebrew image is ${b.meta['og:image']}`);
            if (b.meta['og:locale'] !== 'he_IL') problems.push(`${bot}: Hebrew og:locale is ${b.meta['og:locale']}`);
            if (scriptOf(a.body) !== scriptOf(staticIndex) || !/<app-root>/.test(a.body)) problems.push(`${bot}: the English page is not the app's page`);
            if (scriptOf(b.body) !== scriptOf(staticHe) || !b.body.includes('BS:META')) problems.push(`${bot}: the Hebrew page is not the app's page`);
            if (a.cache !== 'public, max-age=300, s-maxage=600') problems.push(`${bot}: Cache-Control is ${a.cache}`);
        }
        summary.description = { en: unescape((await asBot(enLink, BOTS.whatsapp)).meta['og:description']), he: unescape((await asBot(heLink, BOTS.whatsapp)).meta['og:description']) };

        // An unknown PIN: the page as Hosting serves it.
        const unknown = await asBot(`${SITE}/join-game/QZZZZZ?via=link`, BOTS.whatsapp);
        summary.unknownPin = unescape(unknown.meta['og:title']);
        if (unknown.body !== staticIndex) problems.push('an unknown PIN did not get the page exactly as Hosting serves it');
        const unknownHe = await asBot(`${SITE}/he/join-game/QZZZZZ`, BOTS.whatsapp);
        if (unknownHe.body !== staticHe) problems.push('an unknown Hebrew PIN did not get he.html exactly as Hosting serves it');
        // Other paths are untouched: home, the Hebrew home, a search page, the sitemap, the PIN-less join page.
        for (const p of ['/', '/he', '/how-to-play', '/sitemap.xml', '/join-game', '/he/join-game']) {
            const r = await fetch(`${SITE}${p}`);
            const body = await r.text();
            if (r.status !== 200 || /invited you|מחכה לך/.test(body)) problems.push(`${p} answered ${r.status} or carries an invite`);
        }

        // A phone taps the English link.
        const iphone = devices['iPhone 13'];
        const guest = await newPhone(browser, 'Ben', { userAgent: iphone.userAgent, viewport: iphone.viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
        const started = Date.now();
        await guest.page.goto(enLink);
        const input = guest.page.locator('input[name="nickname"]');
        await input.waitFor({ timeout: 30000 });
        summary.phoneNicknameStepMs = Date.now() - started;
        summary.phoneUrl = guest.page.url();
        if (!guest.page.url().endsWith(`/join-game/${en.pin}?via=link`)) problems.push(`the phone's address became ${guest.page.url()}`);
        await input.fill('Ben');
        await guest.page.locator('form button[type="submit"]').first().click();
        await guest.page.waitForURL(/\/game-staging\//, { timeout: 30000 });
        summary.phoneLobby = new URL(guest.page.url()).pathname;
        await sleep(1500);
        const players = await db('GET', `games/${en.pin}/players`);
        const names = Object.values(players || {}).map((p) => p.nickname);
        summary.players = names;
        if (!names.includes('Ben')) problems.push('Ben is not in the game after joining from the link');
        const counted = guest.calls.find((c) => c.fn === 'onJoinGame');
        summary.joinCountedVia = counted ? JSON.parse(counted.body || '{}').via : null;
        if (summary.joinCountedVia !== 'link') problems.push(`the join was counted with via ${summary.joinCountedVia}, not link`);
        if (process.env.SHOTS) {
            fs.mkdirSync(process.env.SHOTS, { recursive: true });
            await guest.page.screenshot({ path: path.join(process.env.SHOTS, 'guest-lobby.png') });
            await en.host.page.screenshot({ path: path.join(process.env.SHOTS, 'host-lobby.png') });
        }
        [en.host, he.host, guest].forEach((p) => p.problems.forEach((x) => problems.push(`${p.name}: ${x}`)));

        const fnLog = fs.readFileSync(emulators.logFile, 'utf8').split('\n').filter((l) => /joinPreview /.test(l));
        summary.functionLog = fnLog.slice(-4).map((l) => l.replace(/^.*?joinPreview /, 'joinPreview '));
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
