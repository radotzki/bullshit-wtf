#!/usr/bin/env node
// Local run: where a host came from, end to end. The built client (game/dist) in headless Chromium
// against the Firebase emulators (Realtime Database, Cloud Functions, Auth), like emulator-game.js.
//
//   1. A visitor arrives on a search page (/how-to-play) from a search engine, taps its Start
//      button, creates a game and joins it. The game must carry: first page /how-to-play, referring
//      site www.google.com, never played, never hosted.
//   2. A friend opens the invite link (/join-game/<PIN>?via=link) from a chat, joins, and the game
//      starts. Later, in the same tab, the friend creates a game of their own. That game must carry:
//      first page /join-game/:pin (the PIN replaced), the chat's host name, played before, never hosted.
//   3. The first host creates a second game: same first page and site, played and hosted before.
//
// It checks what the unit tests can't: that a plain page's note reaches the app through a real
// browser's tab storage and referrer, that newGame keeps it at games/<PIN>/arrival, that no phone
// can read it there, and that the rows the functions send to BigQuery carry it (read from the
// functions' log: BigQuery itself is not reachable here, and nothing reaches production).
//
// Needs Java and functions/ built, as emulator-game.js does. From the repository root:
//   node .github/smoke/emulator-arrival.js [path to dist]
// EMULATORS=running uses emulators you already run (the log check is then skipped). VERBOSE=1 logs
// every request. Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { serve, fileIn, HOST } = require('./smoke');

const ROOT = path.resolve(__dirname, '..', '..');
const DIST = path.resolve(process.argv.slice(2).filter((a) => !a.startsWith('--'))[0] || path.join(ROOT, 'game', 'dist'));
const PROJECT = 'demo-bullshit';
const DB = `${HOST}:9000`;
const FUNCTIONS = `http://${HOST}:5001/${PROJECT}/us-central1`;
const AUTH = `http://${HOST}:9099`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s`, ...a);
let emulatorLog = null;

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
    emulatorLog = path.join(dir, 'emulators.log');
    const out = fs.openSync(emulatorLog, 'w');
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
    /^Failed to load resource: net::ERR_(FAILED|BLOCKED_BY_CLIENT|NAME_NOT_RESOLVED)/,
    /WebSocket connection to 'wss?:\/\/[^']*' failed/,
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
    const phone = { name, role, context, sockets: [], connects: [], problems: [], screens: [] };
    const ours = (u) => new URL(u).host === new URL(base).host;

    await context.route((url) => !ours(url.toString()), async (route) => {
        const target = redirect(route.request().url());
        if (process.env.VERBOSE) log(`[${name}] ${route.request().method()} ${route.request().url().slice(0, 140)} -> ${target ? 'emulator' : 'refused'}`);
        if (!target) return route.abort('blockedbyclient');
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

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** On the Create page: English, the shortest game, create; returns the new game's PIN. */
async function create(phone) {
    const page = phone.page;
    await page.waitForURL(/\/create-game/, { timeout: 30000 });
    await page.locator('input[name="locale"]').first().check();
    await page.locator('input[name="length"]').first().check();
    await page.locator('form button[type="submit"]').first().click();
    await page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
    return new URL(page.url()).pathname.split('/').pop().toUpperCase();
}

async function join(phone) {
    const input = phone.page.locator('input[name="nickname"]');
    await input.waitFor({ state: 'visible', timeout: 30000 });
    await input.fill(phone.name);
    await phone.page.locator('form button[type="submit"]').first().click();
    await phone.page.waitForURL(/\/game-staging\//, { timeout: 30000 });
}

/** The rows of one table that the functions sent to BigQuery, read from the functions' log. */
function sentRows(table) {
    if (!emulatorLog) return null;
    const text = fs.readFileSync(emulatorLog, 'utf8');
    const rows = [];
    const re = new RegExp(`Insert to BigQuery, table: '${table}', data: (\\{.*\\})`, 'g');
    let m;
    while ((m = re.exec(text))) {
        try { rows.push(JSON.parse(m[1])); } catch (e) { /* a line cut by the log */ }
    }
    return rows;
}

async function main() {
    if (!fileIn(DIST, '/index.html')) throw new Error(`No built game at ${DIST}`);
    if (!fileIn(DIST, '/how-to-play.html')) throw new Error(`No plain pages in ${DIST}: run npm run build in game/`);
    if (!fs.existsSync(path.join(ROOT, 'functions', 'dist', 'index.js'))) throw new Error('Build functions/ first: npm run build there');
    const emulators = await startEmulators();
    const problems = [];
    const expect = (what, got, want) => {
        if (!same(got, want)) problems.push(`${what}: got ${JSON.stringify(got)}, expected ${JSON.stringify(want)}`);
        else log(`ok  ${what}: ${JSON.stringify(got)}`);
    };
    let browser;
    let server;
    try {
        if (!(await up(`http://${DB}/.json?ns=${PROJECT}`))) throw new Error('no database emulator on :9000');
        await seed();
        server = await serve(DIST);
        const base = `http://${HOST}:${server.address().port}`;
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`, '--autoplay-policy=no-user-gesture-required'] });
        const host = await newPhone(browser, base, 'Ana', 'host');
        const friend = await newPhone(browser, base, 'Ben', 'player');
        // Minutes are whole minutes since the visit began: 0 or 1 in a run this short.
        const arrivalOf = async (pin) => {
            const a = await db('GET', `games/${pin}/arrival`);
            if (a && (a.minutes === 0 || a.minutes === 1)) a.minutes = 'a moment';
            return a;
        };

        // 1. From a search engine to a search page, then its Start button.
        await host.page.goto(`${base}/how-to-play`, { referer: 'https://www.google.com/search?q=party+game+on+phones&sourceid=chrome' });
        const note = JSON.parse(await host.page.evaluate(() => window.sessionStorage.getItem('BS_ARRIVAL')));
        expect('the search page notes its path and the search engine', { page: note && note.page, ref: note && note.ref },
            { page: '/how-to-play', ref: 'www.google.com' });
        await host.page.locator('a.btn.primary').first().click();
        const first = await create(host);
        log(`game ${first} created from the search page`);
        expect('game from a search page', await arrivalOf(first),
            { hosted: false, minutes: 'a moment', page: '/how-to-play', played: false, ref: 'www.google.com' });
        await join(host);

        // No phone can read it: the database refuses a read without the server's own sign-in.
        const peek = await fetch(`http://${DB}/games/${first}/arrival.json?ns=${PROJECT}`);
        expect('a phone reading games/<PIN>/arrival is refused', peek.status, 401);
        const players = await fetch(`http://${DB}/games/${first}/players.json?ns=${PROJECT}`);
        expect('while games/<PIN>/players is readable, as always', players.status, 200);

        // 2. A friend opens the invite link from a chat, joins, and the host starts the game.
        await friend.page.goto(`${base}/join-game/${first}?via=link`, { referer: 'https://web.whatsapp.com/' });
        await join(friend);
        const start = host.page.locator('.game-header > button');
        await start.first().waitFor({ state: 'visible', timeout: 30000 });
        const until = Date.now() + 60000;
        while (Date.now() < until) {
            const state = await db('GET', `games/${first}/state`);
            if (state && state.id !== 0) break;
            if (!(await start.first().evaluate((b) => b.classList.contains('is-loading') || b.disabled).catch(() => true))) {
                await start.first().click().catch(() => { });
            }
            await sleep(500);
        }
        expect('the game started with two players', Object.keys((await db('GET', `games/${first}/players`)) || {}).length, 2);

        // Later, in the same tab, the friend creates a game of their own.
        await friend.page.goto(`${base}/create-game`);
        const second = await create(friend);
        log(`game ${second} created by the friend who came in by the invite link`);
        expect('game from a guest who came in by an invite link', await arrivalOf(second),
            { hosted: false, minutes: 'a moment', page: '/join-game/:pin', played: true, ref: 'web.whatsapp.com' });
        await join(friend);

        // 3. The first host creates another game: still the same visit, now with a game behind them.
        await host.page.goto(`${base}/create-game`);
        const third = await create(host);
        expect('second game of the first host', await arrivalOf(third),
            { hosted: true, minutes: 'a moment', page: '/how-to-play', played: true, ref: 'www.google.com' });

        // The rows the functions sent to BigQuery (from their log).
        let rows = null;
        const pick = (r) => r && { first_page: r.first_page, referrer: r.referrer, played_before: r.played_before, hosted_before: r.hosted_before };
        for (let i = 0; i < 40; i++) {
            rows = { users: sentRows('users'), opened: sentRows('opened_games') };
            if (!rows.users || (rows.opened.some((r) => r.id === first) && rows.users.filter((r) => r.via === 'host').length >= 2)) break;
            await sleep(500);
        }
        if (rows.users) {
            const byPin = (list, pin) => list.filter((r) => String(r.pin || r.id).toUpperCase() === pin);
            expect('opened_games row of the first game', pick(byPin(rows.opened, first)[0]),
                { first_page: '/how-to-play', referrer: 'www.google.com', played_before: false, hosted_before: false });
            expect('users row of the first host', pick(byPin(rows.users, first).find((r) => r.via === 'host')),
                { first_page: '/how-to-play', referrer: 'www.google.com', played_before: false, hosted_before: false });
            expect('users row of the friend as a guest carries none of it', pick(byPin(rows.users, first).find((r) => r.via === 'link')), {});
            expect('users row of the friend as a host', pick(byPin(rows.users, second).find((r) => r.via === 'host')),
                { first_page: '/join-game/:pin', referrer: 'web.whatsapp.com', played_before: true, hosted_before: false });
            const all = JSON.stringify(rows);
            if (/sourceid|party\+game|search\?/.test(all)) problems.push('a row holds part of the referring address beyond its host name');
        } else {
            log('emulators were already running: the rows in the functions\' log were not checked');
        }

        [host, friend].forEach((p) => p.problems.forEach((x) => problems.push(`${p.name}: ${x}`)));
        const summary = {
            build: DIST,
            games: { fromSearchPage: first, fromInviteLinkGuest: second, secondOfFirstHost: third },
            arrivals: { [first]: await db('GET', `games/${first}/arrival`), [second]: await db('GET', `games/${second}/arrival`), [third]: await db('GET', `games/${third}/arrival`) },
            rowsChecked: !!(rows && rows.users),
            screens: { [host.name]: host.screens.join(' > '), [friend.name]: friend.screens.join(' > ') },
            problems,
        };
        console.log('\nRESULT ' + JSON.stringify(summary, null, 2));
        console.log(problems.length ? 'FAIL' : 'PASS');
        process.exitCode = problems.length ? 1 : 0;
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
