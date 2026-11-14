#!/usr/bin/env node
// Local run: does the big screen fit a TV? Whole games of the built client (game/dist) in headless
// Chromium, against the Firebase emulators, like emulator-game.js. Each game has 2 to 12 phones and
// three big screens (1280x720, 1920x1080 and 1366x768), and at the lobby, the answers of the first
// and the last question, and the final, every big screen is measured and photographed:
//
// - the page must not be taller or wider than the screen (a TV can't scroll), and
// - every avatar and the invite card (lobby), every answer and the question (answers), every
//   player's card and the crew button (final) must be whole inside the screen.
//
// Players have short and 11-letter names, and some send a long lie, so answers wrap.
// Games start from a ?via=test-tv-fit link: test games, kept out of every count.
//
// Needs what emulator-game.js needs (Java, functions/ built, the root's npm ci). From the root:
//   node .github/smoke/tv-fit.js [path to dist] [--players 2,3,12] [--locales en,he]
//        [--shots <dir>] [--tag after] [--parallel 1]
// EMULATORS=running uses emulators you already run. Prints a JSON summary; exits non-zero when
// something is off a screen, or a game doesn't reach its final.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { serve, fileIn, HOST } = require('./smoke');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const OPTIONS = ['--players', '--locales', '--shots', '--tag', '--parallel'];
const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !OPTIONS.includes(args[i - 1]));
const DIST = path.resolve(positional[0] || path.join(ROOT, 'game', 'dist'));
const PLAYERS = option('--players', '2,3,4,5,6,7,8,9,10,11,12').split(',').map(Number);
const LOCALES = option('--locales', 'en,he').split(',');
const SHOTS = option('--shots', null);
const TAG = option('--tag', 'after');
const PARALLEL = Number(option('--parallel', 1));
const PROJECT = 'demo-bullshit';
// PORTS=<n> moves the three emulators n ports up, so several runs can play side by side, each on
// emulators of its own (games that share emulators make the functions emulator start too many workers).
const PORTS = Number(process.env.PORTS || 0);
const DB = `${HOST}:${9000 + PORTS}`;
const FUNCTIONS = `http://${HOST}:${5001 + PORTS}/${PROJECT}/us-central1`;
const AUTH = `http://${HOST}:${9099 + PORTS}`;
const GAME_TIMEOUT_MS = Number(process.env.GAME_MINUTES || 12) * 60 * 1000;
const QUESTIONS = 5;
const SCREENS = [[1280, 720], [1920, 1080], [1366, 768]];
const NAMES = {
    en: ['Ana', 'Bartholomew', 'Cleo', 'Dan', 'Evangelinaa', 'Fay', 'Gus', 'Hildegard', 'Ivy', 'Jo', 'Kit', 'Leopold'],
    he: ['דנה', 'יוסי', 'מיכל', 'אלכסנדרהלה', 'עומר', 'נועה', 'איתי', 'שירה', 'בנימין', 'טל', 'רותי', 'יהונתן'],
};
const LONG_LIE = {
    en: 'a very long lie that takes much more room than the others do',
    he: 'שקר ארוך מאוד שתופס הרבה יותר מקום מכל שאר השקרים',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s`, ...a);

// ---------- emulators (as in emulator-game.js) ----------

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
    if (process.env.EMULATORS === 'running') return null;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-emulators-'));
    fs.symlinkSync(path.join(ROOT, 'functions'), path.join(dir, 'functions'));
    fs.writeFileSync(path.join(dir, 'firebase.json'), JSON.stringify({
        functions: { source: 'functions', runtime: 'nodejs22' },
        emulators: {
            auth: { host: HOST, port: 9099 + PORTS },
            database: { host: HOST, port: 9000 + PORTS },
            functions: { host: HOST, port: 5001 + PORTS },
            hub: { host: HOST, port: 4400 + PORTS },
            logging: { host: HOST, port: 4500 + PORTS },
            ui: { enabled: false },
            singleProjectMode: true,
        },
    }, null, 2));
    fs.writeFileSync(path.join(dir, 'loopback.js'), NO_PROXY_FOR_LOOPBACK);
    const tools = path.join(ROOT, 'node_modules', 'firebase-tools');
    // No Google account for the functions: their BigQuery inserts then fail at once, as they should
    // here. On a cloud machine they otherwise ask its metadata server for a token, slowly, on every row.
    const env = Object.assign({}, process.env, { FIREBASE_TOOLS_DIR: tools, METADATA_SERVER_DETECTION: 'none', GCE_METADATA_HOST: '127.0.0.1:9' });
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
                ? { lang, questionText: `Test question ${i}: the only animal that can sleep for three years without waking is the ___`, realAnswer: `truth${i}`, fakeAnswers: ['lie a', 'lie b', 'lie c', 'lie d'], citation: '' }
                : { lang, questionText: `שאלת בדיקה ${i}: בעל החיים היחיד שיכול לישון שלוש שנים בלי להתעורר הוא ___`, realAnswer: `אמת${i}`, fakeAnswers: ['שקר א', 'שקר ב', 'שקר ג', 'שקר ד'], citation: '' };
        }
    }
    await db('PUT', 'questions', questions);
    await db('PUT', 'gameCounter', 100000 + Math.floor(Math.random() * 100000));
}

// ---------- browsers ----------

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

// The game's two fonts come from Google Fonts, which this run can't reach. FONTS=<dir> serves them
// from a folder that holds fonts.css (the stylesheet Google sends) and its .woff2 files, so the
// screens are measured in the fonts a TV shows. Without it the browser's own font stands in.
function localFont(url) {
    const dir = process.env.FONTS;
    if (!dir) return null;
    const u = new URL(url);
    if (u.hostname === 'fonts.googleapis.com') return { contentType: 'text/css', body: fs.readFileSync(path.join(dir, 'fonts.css'), 'utf8') };
    if (u.hostname === 'fonts.gstatic.com') {
        const file = path.join(dir, path.basename(u.pathname));
        if (fs.existsSync(file)) return { contentType: 'font/woff2', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(file) };
    }
    return null;
}

async function newPhone(browser, base, name, role, size) {
    const context = await browser.newContext(role === 'screen'
        ? { serviceWorkers: 'block', viewport: { width: size[0], height: size[1] } }
        : { serviceWorkers: 'block', viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true });
    const phone = { name, role, size, context, problems: [], lies: [], picks: [], done: false };
    const ours = (u) => new URL(u).host === new URL(base).host;
    await context.route((url) => !ours(url.toString()), async (route) => {
        const font = localFont(route.request().url());
        if (font) return route.fulfill(font);
        const target = redirect(route.request().url());
        if (!target) return route.abort('blockedbyclient');
        try {
            const response = await route.fetch({ url: target });
            return route.fulfill({ response });
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
    page.on('crash', () => phone.problems.push('the page crashed'));
    phone.page = page;
    return phone;
}

const screenOf = (page) => new URL(page.url()).pathname.replace(/^\/he(?=\/|$)/, '').split('/')[1] || 'home';
const visible = async (locator) => (await locator.count()) > 0 && locator.first().isVisible().catch(() => false);

// What the room must see whole, on each screen of the game.
const MUST_SHOW = {
    // Of a player, the picture and the name: the box around them has empty padding below.
    lobby: ['.lobby .player .picture', '.lobby .player span', '.invite-presenter', '.invite-presenter .url', '.lobby-status', '.pack-banner', '.game-header .registration'],
    answers: ['.presenter .question', '.presenter .answer', '.presenter app-waiting-row .seat'],
    final: ['.hero', '.players .player', '.players .player .lie', '.crew-panel .button'],
};

/** Runs in the page: what is off the screen, and how small the text got. */
function measure(selectors) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const doc = document.documentElement;
    const off = [];
    const counts = {};
    for (const selector of selectors) {
        const all = Array.from(document.querySelectorAll(selector)).filter((el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
        });
        counts[selector] = all.length;
        const out = all.filter((el) => {
            const r = el.getBoundingClientRect();
            return r.top < -0.5 || r.left < -0.5 || r.bottom > h + 0.5 || r.right > w + 0.5;
        });
        if (out.length) off.push(`${out.length} of ${all.length} ${selector}`);
    }
    const fit = document.querySelector('[data-fit]');
    return {
        page: `${doc.scrollWidth}x${doc.scrollHeight}`,
        scrolls: doc.scrollHeight > h || doc.scrollWidth > w,
        off,
        counts,
        fit: fit ? Number(fit.getAttribute('data-fit')) : null,
    };
}

async function capture(game, moment, kind) {
    await sleep(kind === 'final' ? 5000 : 1200);
    for (const s of game.screens) {
        const m = await s.page.evaluate(measure, MUST_SHOW[kind]);
        const key = `${game.id} ${s.size.join('x')} ${moment}`;
        const expected = kind === 'lobby' ? ['.lobby .player', game.n]
            : kind === 'final' ? ['.players .player', game.n]
                : ['.presenter .answer', 2];
        const have = await s.page.locator(expected[0]).count();
        const bad = [];
        if (m.scrolls) bad.push(`the page is ${m.page}`);
        if (m.off.length) bad.push(`off the screen: ${m.off.join(', ')}`);
        if (kind === 'answers' ? have < expected[1] : have !== expected[1]) bad.push(`${have} ${expected[0]}, expected ${expected[1]}`);
        game.results.push({ key, fit: m.fit, shown: have, ok: !bad.length, bad });
        if (bad.length) log(`NOT FITTING ${key}: ${bad.join('; ')}`);
        if (SHOTS) await s.page.screenshot({ path: path.join(SHOTS, `${TAG}-${game.locale}-${String(game.n).padStart(2, '0')}-${moment}-${s.size.join('x')}.png`) }).catch(() => { });
    }
}

async function act(phone, game) {
    const page = phone.page;
    const screen = screenOf(page);
    if (phone.role === 'screen') {
        if (screen === 'score-board-final') phone.done = true;
        // The screens this change leaves alone: only noted, the tallest each got (see "otherScreens").
        if (['show-question', 'reveal-the-truth', 'score-board', 'round-intro'].includes(screen)) {
            const tall = await page.evaluate(() => document.documentElement.scrollHeight);
            const key = `${screen} ${phone.size.join('x')}`;
            game.others[key] = Math.max(game.others[key] || 0, tall);
        }
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
        if (phone.role === 'host' && game.lobbyShot && !game.started) {
            const start = page.locator('.game-header > button');
            if (await visible(start) && !(await start.first().evaluate((b) => b.classList.contains('is-loading')))) {
                game.started = Date.now();
                await start.first().click();
            }
        }
    } else if (screen === 'show-question') {
        const input = page.locator('form input.input');
        if (await visible(input)) {
            const question = await db('GET', `games/${game.pin}/questionIndex`);
            if (phone.lies[phone.lies.length - 1] !== question) {
                // Every third player lies at length, so the answers wrap.
                const lie = phone.index % 3 === 1 ? `${phone.index} ${LONG_LIE[game.locale]}` : `${phone.name} ${question}`;
                await input.fill(lie);
                await page.locator('form button[type="submit"]').first().click();
                phone.lies.push(question);
            }
        }
    } else if (screen === 'show-answers') {
        const question = await db('GET', `games/${game.pin}/questionIndex`);
        // The big screens are photographed first: the answers leave when the last phone picks.
        if ((question === 0 || question === QUESTIONS - 1) && !game.answersShot[question]) return;
        const buttons = page.locator('button.answer:not([disabled])');
        const n = await buttons.count();
        if (n > 0 && phone.picks[phone.picks.length - 1] !== question) {
            await buttons.nth(Math.floor(Math.random() * n)).click().catch(() => { });
            phone.picks.push(question);
        }
    } else if (screen === 'reveal-the-truth') {
        const next = page.locator('button.next');
        if (await visible(next)) await next.first().click().catch(() => { });
    } else if (screen === 'score-board-final') {
        phone.done = true;
    }
}

async function play(base, n, locale) {
    // A browser of its own for each game: fifteen pages are enough for one.
    const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`, '--autoplay-policy=no-user-gesture-required', '--disable-dev-shm-usage'] });
    const he = locale === 'he';
    const game = { id: `${locale} ${n} players`, n, locale, results: [], answersShot: {}, others: {}, problems: [] };
    const phones = [];
    for (let i = 0; i < n; i++) {
        const phone = await newPhone(browser, base, NAMES[locale][i], i === 0 ? 'host' : 'player');
        phone.index = i;
        phones.push(phone);
    }
    game.screens = [];
    for (const size of SCREENS) game.screens.push(await newPhone(browser, base, `screen ${size.join('x')}`, 'screen', size));
    const everyone = phones.concat(game.screens);
    try {
        const host = phones[0];
        await host.page.goto(`${base}/create-game?via=test-tv-fit`);
        await host.page.locator('input[name="locale"]').nth(he ? 1 : 0).check();
        await host.page.locator('input[name="length"]').first().check();
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
        game.pin = new URL(host.page.url()).pathname.split('/').pop().toUpperCase();
        const created = await db('GET', `games/${game.pin}`);
        if (!created || created.campaign !== 'test-tv-fit') game.problems.push(`the game is not marked a test game (campaign ${created && created.campaign})`);
        log(`${game.id}: game ${game.pin}`);
        for (const s of game.screens) await s.page.goto(`${base}/present-game/${game.pin}`);
        for (const p of phones.slice(1)) await p.page.goto(`${base}${he ? '/he' : ''}/join-game/${game.pin}`);

        const deadline = Date.now() + GAME_TIMEOUT_MS;
        while (Date.now() < deadline && !everyone.every((p) => p.done)) {
            if (!game.lobbyShot) {
                const players = await db('GET', `games/${game.pin}/players`);
                if (players && Object.keys(players).length === n && phones.every((p) => p.joined)
                    && game.screens.every((s) => screenOf(s.page) === 'game-staging')) {
                    await capture(game, 'lobby', 'lobby');
                    game.lobbyShot = true;
                }
            } else if (game.started) {
                const question = await db('GET', `games/${game.pin}/questionIndex`);
                if ((question === 0 || question === QUESTIONS - 1) && !game.answersShot[question]
                    && game.screens.every((s) => screenOf(s.page) === 'show-answers')) {
                    await capture(game, `answers-q${question + 1}`, 'answers');
                    game.answersShot[question] = true;
                }
            }
            if (process.env.VERBOSE && Date.now() - (game.said || 0) > 15000) {
                game.said = Date.now();
                log(`${game.id}: ${everyone.map((p) => screenOf(p.page)).join(' ')}`);
            }
            // One phone at a time: the functions emulator starts a worker for every call that overlaps
            // another, and twelve phones sending at once filled the machine's memory.
            for (const p of everyone.filter((x) => !x.done)) await act(p, game).catch(() => { });
            await sleep(300);
        }
        everyone.forEach((p) => { if (!p.done) game.problems.push(`${p.name} never showed the final scoreboard`); });
        if (game.screens.every((s) => s.done)) await capture(game, 'final', 'final');
        everyone.forEach((p) => p.problems.forEach((x) => game.problems.push(`${p.name}: ${x}`)));
        for (const moment of ['lobby', 'answers-q1', `answers-q${QUESTIONS}`, 'final']) {
            if (!game.results.some((r) => r.key.endsWith(` ${moment}`))) game.problems.push(`no look at ${moment}`);
        }
        log(`${game.id}: done, ${game.results.filter((r) => !r.ok).length} looks not fitting, ${game.problems.length} problems`);
    } catch (e) {
        game.problems.push(`stopped: ${e.message.split('\n')[0]}`);
    } finally {
        await browser.close().catch(() => { });
    }
    return game;
}

async function main() {
    if (!fileIn(DIST, '/index.html')) throw new Error(`No built game at ${DIST}`);
    if (!fs.existsSync(path.join(ROOT, 'functions', 'dist', 'index.js'))) throw new Error('Build functions/ first: npm run build there');
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const emulators = await startEmulators();
    let server;
    try {
        await seed();
        server = await serve(DIST);
        const base = `http://${HOST}:${server.address().port}`;
        const queue = [];
        for (const locale of LOCALES) for (const n of PLAYERS) queue.push([n, locale]);
        // The biggest tables first: they take the longest.
        queue.sort((a, b) => b[0] - a[0]);
        const games = [];
        await Promise.all(Array.from({ length: PARALLEL }, async () => {
            while (queue.length) {
                const [n, locale] = queue.shift();
                games.push(await play(base, n, locale));
            }
        }));
        games.sort((a, b) => a.locale.localeCompare(b.locale) || a.n - b.n);
        const looks = games.flatMap((g) => g.results);
        const problems = games.flatMap((g) => g.problems.map((p) => `${g.id}: ${p}`));
        const summary = {
            build: DIST,
            tag: TAG,
            games: games.length,
            looks: looks.length,
            fitting: looks.filter((r) => r.ok).length,
            notFitting: looks.filter((r) => !r.ok).map((r) => `${r.key}: ${r.bad.join('; ')}`),
            // The scale each look was drawn at (1 = untouched), per screen size: the smallest of the run.
            smallestScale: Object.fromEntries(SCREENS.map((s) => [s.join('x'),
                Math.min(...looks.filter((r) => r.key.includes(` ${s.join('x')} `)).map((r) => (r.fit === null ? 1 : r.fit)))])),
            scales: Object.fromEntries(looks.map((r) => [r.key, r.fit])),
            // Not checked: the other screens of the game that were taller than their big screen, and by how much.
            otherScreens: games.flatMap((g) => Object.entries(g.others)
                .filter(([key, tall]) => tall > Number(key.split('x').pop()))
                .map(([key, tall]) => `${g.id} ${key}: ${tall} px tall`)),
            problems,
        };
        console.log('\nRESULT ' + JSON.stringify(summary, null, 2));
        const failed = problems.length || summary.notFitting.length;
        console.log(failed ? 'FAIL' : 'PASS');
        process.exitCode = failed ? 1 : 0;
    } finally {
        if (server) server.close();
        stopEmulators(emulators);
    }
}

main().catch((e) => {
    console.error('FAIL', e.stack || e);
    process.exit(1);
});
