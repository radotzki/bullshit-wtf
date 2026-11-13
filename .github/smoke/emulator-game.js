#!/usr/bin/env node
// Local run: a whole game of the built client (game/dist) in headless Chromium, against the
// Firebase emulators (Realtime Database, Cloud Functions, Auth). Three phones and the big screen,
// each its own browser profile, play every question to the final scoreboard. One phone loses its
// connection for a while in the middle of the game and comes back without the browser saying
// "online", the case the reconnect nudge (game/src/app/services/reconnect-nudge.ts) is for.
//
// It checks what no unit test can: anonymous sign-in, the database listeners, .info/connected
// and reconnecting, the calls to the functions, and that every screen of the game shows and moves on.
//
// Nothing reaches production. The built game still names the production project, so every request
// it makes is caught in the browser and sent to the emulators instead: functions calls to :5001,
// sign-in to :9099, and the database's WebSocket (and long polling) to :9000 under the emulator's
// project. Any other outside request is refused, and Chromium resolves no host but 127.0.0.1.
//
// Needs Java (for the database emulator) and functions/ built (npm ci && npm run build there).
// From the repository root, with the root's npm ci done (firebase-tools):
//   node .github/smoke/emulator-game.js [path to dist] [--locale en|he] [--keep]
// It starts the emulators itself, from a scratch config, and stops them at the end. To use emulators
// you already run (database, functions, auth on the default ports, project demo-bullshit):
// EMULATORS=running. DROP_SECONDS (default 25) is how long the phone is away.
// VERBOSE=1 logs every request the game makes and every console line; SHOTS=<dir> saves a screenshot of
// each screen at the end. Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { serve, fileIn, HOST } = require('./smoke');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
};
const positional = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--locale');
const DIST = path.resolve(positional[0] || path.join(ROOT, 'game', 'dist'));
const LOCALE = option('--locale', 'en');
const PROJECT = 'demo-bullshit';
const DB = `${HOST}:9000`;
const FUNCTIONS = `http://${HOST}:5001/${PROJECT}/us-central1`;
const AUTH = `http://${HOST}:9099`;
const DROP_MS = Number(process.env.DROP_SECONDS || 25) * 1000;
const GAME_TIMEOUT_MS = Number(process.env.GAME_MINUTES || 8) * 60 * 1000;
const QUESTIONS = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s`, ...a);

// ---------- emulators ----------

// firebase-tools sends its own calls to the emulators through HTTPS_PROXY when one is set, and
// ignores NO_PROXY. Behind a proxy that refuses 127.0.0.1 the functions emulator then can't register
// its database triggers. This preload sends loopback calls direct; every other call still goes via the proxy.
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

async function up(url) {
    try {
        await fetch(url);
        return true;
    } catch (e) {
        return false;
    }
}

async function startEmulators() {
    if (process.env.EMULATORS === 'running') return null;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-emulators-'));
    fs.symlinkSync(path.join(ROOT, 'functions'), path.join(dir, 'functions'));
    fs.writeFileSync(path.join(dir, 'firebase.json'), JSON.stringify({
        functions: { source: 'functions', runtime: 'nodejs22' },
        emulators: {
            auth: { host: HOST, port: 9099 },
            database: { host: HOST, port: 9000 },
            functions: { host: HOST, port: 5001 },
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
    const out = fs.openSync(path.join(dir, 'emulators.log'), 'w');
    const child = spawn(path.join(ROOT, 'node_modules', '.bin', 'firebase'),
        ['emulators:start', '--project', PROJECT], { cwd: dir, env, stdio: ['ignore', out, out], detached: true });
    log(`starting the emulators (log: ${path.join(dir, 'emulators.log')})`);
    const until = Date.now() + 120000;
    while (Date.now() < until) {
        const logText = fs.readFileSync(path.join(dir, 'emulators.log'), 'utf8');
        if (/All emulators ready/.test(logText)) return child;
        if (child.exitCode !== null) throw new Error(`the emulators stopped:\n${logText.slice(-2000)}`);
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

// The database as its owner: no rule applies.
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
            questions[`${lang}${i}`] = lang === 'en'
                ? { lang, questionText: `Test question ${i}: the capital of Testland is ___`, realAnswer: `truth${i}`, fakeAnswers: ['lie a', 'lie b', 'lie c', 'lie d'], citation: '' }
                : { lang, questionText: `שאלת בדיקה ${i}: הבירה של ארץ הבדיקה היא ___`, realAnswer: `אמת${i}`, fakeAnswers: ['שקר א', 'שקר ב', 'שקר ג', 'שקר ד'], citation: '' };
        }
    }
    await db('PUT', 'questions', questions);
    await db('PUT', 'gameCounter', 100000 + Math.floor(Math.random() * 100000));
}

// ---------- phones ----------

const ALLOWED_CONSOLE_ERRORS = [
    /^Failed to load resource: net::ERR_(FAILED|BLOCKED_BY_CLIENT|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED)/,
    /WebSocket connection to 'wss?:\/\/[^']*' failed/,
    // The phone that drops sees its calls fail while it is away.
    /Failed to load resource/,
];

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

async function newPhone(browser, base, name, role) {
    const context = await browser.newContext(role === 'screen'
        ? { serviceWorkers: 'block', viewport: { width: 1280, height: 720 } }
        : { serviceWorkers: 'block', viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
    const phone = { name, role, context, away: false, sockets: [], connects: [], problems: [], screens: [], lies: [], picks: [], done: false };
    const ours = (u) => new URL(u).host === new URL(base).host;

    await context.route((url) => !ours(url.toString()), async (route) => {
        const target = redirect(route.request().url());
        if (process.env.VERBOSE) log(`[${name}] ${route.request().method()} ${route.request().url().slice(0, 140)} -> ${target ? 'emulator' : 'refused'}`);
        if (!target) return route.abort('blockedbyclient');
        if (phone.away) return route.abort('internetdisconnected');
        try {
            const response = await route.fetch({ url: target });
            return route.fulfill({ response });
        } catch (e) {
            return route.abort('failed');
        }
    });
    // The database's WebSocket: Playwright stands in for the server, and this pipes each frame to and
    // from a socket on the database emulator (Node's own WebSocket), under the emulator's project.
    await context.routeWebSocket((url) => /\/\.ws$/.test(url.pathname), (ws) => {
        if (phone.away) return ws.close({ code: 1006, reason: 'no network' });
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
        const link = { ws, upstream };
        phone.sockets.push(link);
        phone.connects.push(Date.now());
    });

    const page = await context.newPage();
    page.on('pageerror', (err) => phone.problems.push(`uncaught exception: ${err.stack || err.message || err}`));
    page.on('crash', () => phone.problems.push('the page crashed'));
    page.on('console', (msg) => {
        if (process.env.VERBOSE) log(`[${name} console.${msg.type()}] ${msg.text().slice(0, 300)}`);
        if (msg.type() !== 'error') return;
        const text = msg.text();
        if (ALLOWED_CONSOLE_ERRORS.some((re) => re.test(text))) return;
        phone.problems.push(`console error: ${text}`);
    });
    page.on('framenavigated', (frame) => {
        if (frame !== page.mainFrame()) return;
        const screen = new URL(frame.url()).pathname.replace(/^\/he(?=\/|$)/, '').split('/')[1] || 'home';
        if (phone.screens[phone.screens.length - 1] !== screen) phone.screens.push(screen);
    });
    phone.page = page;
    return phone;
}

/** Cut the phone off: every request and socket fails, and the browser never says it is offline. */
function dropConnection(phone) {
    phone.away = true;
    phone.droppedAt = Date.now();
    phone.sockets.forEach((link) => {
        link.upstream.close();
        link.ws.close({ code: 1006, reason: 'network lost' }).catch(() => { });
    });
    phone.sockets = [];
}

function restoreConnection(phone) {
    phone.away = false;
    phone.restoredAt = Date.now();
}

const visible = async (locator) => (await locator.count()) > 0 && locator.first().isVisible().catch(() => false);

/** One look at the phone's screen, and the move a player would make there. */
async function act(phone, game) {
    const page = phone.page;
    const screen = new URL(page.url()).pathname.replace(/^\/he(?=\/|$)/, '').split('/')[1] || 'home';
    if (phone.role === 'screen') {
        if (screen === 'score-board-final') phone.done = true;
        return;
    }
    if (screen === 'join-game') {
        const input = page.locator('input[name="nickname"]');
        if (await visible(input) && !phone.joining) {
            phone.joining = true;
            await input.fill(phone.name);
            await page.locator('form button[type="submit"]').first().click();
        }
    } else if (screen === 'game-staging') {
        phone.joined = true;
        if (phone.role === 'host' && game.everyoneIn && !game.started) {
            const start = page.locator('.game-header > button');
            if (await visible(start) && !(await start.first().evaluate((b) => b.classList.contains('is-loading')))) {
                game.started = Date.now();
                await start.first().click();
                log(`${phone.name} pressed START`);
            }
        }
    } else if (screen === 'show-question') {
        const input = page.locator('form input.input');
        if (await visible(input)) {
            const question = await db('GET', `games/${game.pin}/questionIndex`);
            if (phone.lies[phone.lies.length - 1] !== question) {
                await input.fill(`${phone.name} lie ${question}`);
                await page.locator('form button[type="submit"]').first().click();
                phone.lies.push(question);
                log(`${phone.name} sent a lie on question ${question + 1}`);
            }
        }
    } else if (screen === 'show-answers') {
        const buttons = page.locator('button.answer:not([disabled])');
        const n = await buttons.count();
        if (n > 0) {
            const question = await db('GET', `games/${game.pin}/questionIndex`);
            if (phone.picks[phone.picks.length - 1] !== question) {
                await buttons.nth(Math.floor(Math.random() * n)).click().catch(() => { });
                phone.picks.push(question);
                log(`${phone.name} picked on question ${question + 1}`);
            }
        }
    } else if (screen === 'reveal-the-truth') {
        const next = page.locator('button.next');
        if (await visible(next)) await next.first().click().catch(() => { });
    } else if (screen === 'score-board-final') {
        phone.done = true;
    }
}

async function main() {
    if (!fileIn(DIST, '/index.html')) throw new Error(`No built game at ${DIST}`);
    if (!fs.existsSync(path.join(ROOT, 'functions', 'dist', 'index.js'))) throw new Error('Build functions/ first: npm run build there');
    const emulators = await startEmulators();
    const problems = [];
    let browser;
    let server;
    try {
        if (!(await up(`http://${DB}/.json?ns=${PROJECT}`))) throw new Error('no database emulator on :9000');
        await seed();
        server = await serve(DIST);
        const base = `http://${HOST}:${server.address().port}`;
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`, '--autoplay-policy=no-user-gesture-required'] });

        const he = LOCALE === 'he';
        const names = he ? ['דנה', 'יוסי', 'מיכל'] : ['Ana', 'Ben', 'Cleo'];
        const host = await newPhone(browser, base, names[0], 'host');
        const p2 = await newPhone(browser, base, names[1], 'player');
        const p3 = await newPhone(browser, base, names[2], 'player');
        const screen = await newPhone(browser, base, 'big screen', 'screen');
        const phones = [host, p2, p3, screen];
        const game = {};

        // The host creates the game in the chosen language, then joins it.
        await host.page.goto(`${base}/create-game`);
        // The language radios: English first, Hebrew second (their values are bound, not attributes).
        await host.page.locator('input[name="locale"]').nth(he ? 1 : 0).check();
        await host.page.locator('input[name="length"]').first().check();
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
        game.pin = new URL(host.page.url()).pathname.split('/').pop().toUpperCase();
        log(`game ${game.pin} created (${LOCALE})`);
        const created = await db('GET', `games/${game.pin}`);
        if (!created || created.locale !== LOCALE) problems.push(`the game's locale is ${created && created.locale}, not ${LOCALE}`);
        if (!created || !created.creator) problems.push('the game has no creator uid: anonymous sign-in did not reach newGame');

        await screen.page.goto(`${base}/present-game/${game.pin}`);
        await p2.page.goto(`${base}${he ? '/he' : ''}/join-game/${game.pin}`);
        await p3.page.goto(`${base}${he ? '/he' : ''}/join-game/${game.pin}`);

        const deadline = Date.now() + GAME_TIMEOUT_MS;
        let dropped = false;
        while (Date.now() < deadline && !phones.every((p) => p.done)) {
            if (!game.everyoneIn) {
                const players = await db('GET', `games/${game.pin}/players`);
                game.everyoneIn = players && Object.keys(players).length === 3 && phones.slice(0, 3).every((p) => p.joined);
            }
            // The third phone drops when question 2 is on screen, before it sends its lie.
            if (!dropped && game.started) {
                const state = await db('GET', `games/${game.pin}/state`);
                const q = await db('GET', `games/${game.pin}/questionIndex`);
                if (state && state.id === 2 && q === 1) {
                    dropped = true;
                    dropConnection(p3);
                    log(`${p3.name} lost the connection`);
                    setTimeout(() => {
                        restoreConnection(p3);
                        log(`${p3.name}'s network is back (no "online" event)`);
                    }, DROP_MS);
                }
            }
            await Promise.all(phones.filter((p) => !p.away && !p.done).map((p) => act(p, game).catch((e) => {
                if (!/Target closed|Execution context was destroyed|navigation/.test(e.message)) log(`${p.name}: ${e.message.split('\n')[0]}`);
            })));
            await sleep(400);
        }

        if (process.env.SHOTS) {
            for (const p of phones) await p.page.screenshot({ path: path.join(process.env.SHOTS, `${p.role}-${p.name}.png`) }).catch(() => { });
        }
        // Every screen ends on the final scoreboard in the game's language: Hebrew letters in a Hebrew game.
        for (const p of phones) {
            const text = await p.page.evaluate(() => document.body.innerText).catch(() => '');
            if (he !== /[\u0590-\u05FF]/.test(text.replace(/(דנה|יוסי|מיכל)/g, ''))) problems.push(`${p.name}'s last screen is not in ${he ? 'Hebrew' : 'English'}`);
        }
        const final = await db('GET', `games/${game.pin}`);
        const reconnect = p3.restoredAt ? (p3.connects.find((t) => t >= p3.restoredAt) || null) : null;
        const summary = {
            build: DIST,
            locale: LOCALE,
            pin: game.pin,
            seconds: Math.round((Date.now() - (game.started || t0)) / 1000),
            finalState: final && final.state && final.state.id,
            scores: final && final.players ? Object.values(final.players).map((p) => `${p.nickname}: ${p.score}`) : null,
            reachedFinal: Object.fromEntries(phones.map((p) => [p.name, p.done])),
            lies: Object.fromEntries(phones.slice(0, 3).map((p) => [p.name, p.lies.map((q) => q + 1)])),
            picks: Object.fromEntries(phones.slice(0, 3).map((p) => [p.name, p.picks.map((q) => q + 1)])),
            dropped: p3.name,
            awaySeconds: DROP_MS / 1000,
            reconnectSecondsAfterNetworkBack: reconnect ? Math.round((reconnect - p3.restoredAt) / 100) / 10 : null,
            screens: Object.fromEntries(phones.map((p) => [p.name, p.screens.join(' > ')])),
        };

        if (!final || !final.state || final.state.id !== 6) problems.push(`the game did not reach the final scoreboard (state ${final && final.state && final.state.id})`);
        phones.forEach((p) => { if (!p.done) problems.push(`${p.name} never showed the final scoreboard`); });
        if (!reconnect) problems.push(`${p3.name} never reconnected after its network came back`);
        else if (reconnect - p3.restoredAt > 10000) problems.push(`${p3.name} took ${summary.reconnectSecondsAfterNetworkBack} s to reconnect`);
        const later = p3.lies.filter((q) => q >= 2);
        if (!later.length) problems.push(`${p3.name} sent no lie after it came back`);
        [host, p2].forEach((p) => { if (p.lies.length < QUESTIONS) problems.push(`${p.name} sent ${p.lies.length} lies, not ${QUESTIONS}`); });
        phones.forEach((p) => p.problems.forEach((x) => problems.push(`${p.name}: ${x}`)));

        summary.problems = problems;
        console.log('\nRESULT ' + JSON.stringify(summary, null, 2));
        console.log(problems.length ? 'FAIL' : 'PASS');
        process.exitCode = problems.length ? 1 : 0;
        if (flag('--keep')) await sleep(1e9);
    } finally {
        if (browser) await browser.close();
        if (server) server.close();
        stopEmulators(emulators);
    }
}

main().catch((e) => {
    console.error('FAIL', e.stack || e);
    process.exit(1);
});
