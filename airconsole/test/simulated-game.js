#!/usr/bin/env node
// A whole game of the AirConsole build (airconsole/dist), in headless Chromium, against the Firebase
// emulators: the screen and four controllers under a local stand-in for AirConsole's platform
// (airconsole/harness), which runs AirConsole's own API 1.11.0 in every frame.
//
// What it checks: the screen makes a game tagged portal-airconsole and holds its host key; every
// controller takes a seat of its own under its AirConsole nickname, also the three that share one
// browser origin (one storage, one Firebase sign-in), as all phones do in AirConsole's simulator; the first controller (AirConsole's master)
// starts it; lies, picks, reveals and scores through every question of three rounds to the final
// scores; a controller that leaves mid-game and one that joins mid-game; the master's PLAY AGAIN,
// with AirConsole's ad break first, opens a new game that every controller joins. In Hebrew, both
// the screen and the controllers read right to left.
//
// Nothing reaches production: the build names the production project, and every request it makes is
// sent to the emulators from the browser, as .github/smoke/emulator-game.js does (whose emulator
// start-up and seed this reuses). AirConsole's API script is served from a local copy of
// github.com/AirConsole/airconsole-api (AIRCONSOLE_API, the path of airconsole-1.11.0.js).
//
//   cd airconsole && npm ci && node build.js
//   (cd functions && npm ci && npm run build); npm ci at the repository root (firebase-tools)
//   AIRCONSOLE_API=/path/to/airconsole-1.11.0.js node airconsole/test/simulated-game.js [--locale he] [--shots dir]

'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const smoke = require('../../.github/smoke/emulator-game');
// Playwright as the repository's smoke tests install it (.github/smoke), else wherever Node finds it.
const { chromium } = (() => {
    try {
        return require(require.resolve('playwright', { paths: [path.join(__dirname, '..', '..', '.github', 'smoke')] }));
    } catch (e) {
        return require('playwright');
    }
})();

const { HOST, DB, PROJECT, log, sleep, startEmulators, stopEmulators, seed, db, up } = smoke;
const HERE = path.resolve(__dirname, '..');
const DIST = path.join(HERE, 'dist');
const HARNESS = path.join(HERE, 'harness');
const args = process.argv.slice(2);
const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
};
const LOCALE = option('--locale', 'en');
const SHOTS = option('--shots', null);
const API_FILE = process.env.AIRCONSOLE_API;
const API_URL = 'https://www.airconsole.com/api/airconsole-1.11.0.js';
const FUNCTIONS = `http://${HOST}:5001/${PROJECT}/us-central1`;
const AUTH = `http://${HOST}:9099`;
const CONTROLLERS = 4;
// Controllers 1-3 and the one that joins mid-game come from one origin, as every phone of AirConsole's
// simulator does (one browser: one storage, one Firebase uid); controller 4 from its own, as a real phone.
const SHARED = [1, 2, 3];
const GAME_TIMEOUT_MS = Number(process.env.GAME_MINUTES || 10) * 60 * 1000;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png' };

/** Serves one folder on its own port: an origin of its own, so its own storage and Firebase sign-in. */
function serve(dir) {
    return new Promise(resolve => {
        const server = http.createServer((req, res) => {
            const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
            const file = path.join(dir, p === '/' ? 'index.html' : p);
            if (!file.startsWith(dir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
                res.writeHead(404);
                return res.end('not found');
            }
            res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
            fs.createReadStream(file).pipe(res);
        });
        server.listen(0, HOST, () => resolve(server));
    });
}
const origin = server => `http://${HOST}:${server.address().port}`;

function redirect(url) {
    const u = new URL(url);
    if (u.hostname.endsWith('.cloudfunctions.net')) return `${FUNCTIONS}${u.pathname}${u.search}`;
    if (u.hostname === 'identitytoolkit.googleapis.com' || u.hostname === 'securetoken.googleapis.com') return `${AUTH}/${u.hostname}${u.pathname}${u.search}`;
    if (u.hostname.endsWith('.firebaseio.com') || u.host === DB) {
        const to = new URL(`http://${DB}${u.pathname}${u.search}`);
        to.searchParams.set('ns', PROJECT);
        return to.toString();
    }
    return null;
}

async function openHarness(browser, servers, problems) {
    const context = await browser.newContext({ viewport: { width: 1400, height: 1250 }, deviceScaleFactor: 1 });
    const local = u => new URL(u).hostname === HOST;
    await context.route(u => !local(u.toString()), async route => {
        const url = route.request().url();
        if (url === API_URL) {
            return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(API_FILE, 'utf8') });
        }
        const target = redirect(url);
        if (!target) {
            problems.push(`a request went outside: ${url.slice(0, 120)}`);
            return route.abort('blockedbyclient');
        }
        try {
            return route.fulfill({ response: await route.fetch({ url: target }) });
        } catch (e) {
            return route.abort('failed');
        }
    });
    await context.routeWebSocket(u => /\/\.ws$/.test(u.pathname), ws => {
        const target = new URL(redirect(ws.url().replace(/^ws/, 'http')));
        target.protocol = 'ws:';
        const upstream = new WebSocket(target.toString());
        const waiting = [];
        upstream.onopen = () => waiting.splice(0).forEach(m => upstream.send(m));
        upstream.onmessage = e => ws.send(e.data);
        upstream.onclose = () => ws.close({ code: 1000 });
        upstream.onerror = () => ws.close({ code: 1006 });
        ws.onMessage(m => (upstream.readyState === 1 ? upstream.send(m) : waiting.push(m)));
        ws.onClose(() => upstream.close());
    });
    const page = await context.newPage();
    page.on('pageerror', err => problems.push(`uncaught exception: ${err.message}`));
    page.on('console', msg => {
        if (process.env.VERBOSE) log(`[console.${msg.type()}] ${msg.text().slice(0, 200)}`);
        if (msg.type() === 'error' && !/Failed to load resource|WebSocket connection/.test(msg.text())) {
            problems.push(`console error: ${msg.text().slice(0, 200)}`);
        }
    });
    const names = LOCALE === 'he' ? ['דנה', 'יוסי', 'מיכל', 'אבי', 'נועה'] : ['Ana', 'Ben', 'Cleo', 'Dov', 'Eli'];
    const controllers = servers.controllers.slice(0, CONTROLLERS).map(s => `${origin(s)}/controller.html`);
    const q = new URLSearchParams({
        screen: `${origin(servers.screen)}/screen.html`,
        controllers: controllers.join(','),
        lang: LOCALE,
        names: names.join(','),
        // The other phones that share controller 1's origin load once it has its seat, one by one, as
        // phones added with the simulator's "Add Controller": they find its Firebase uid already kept.
        hold: SHARED.slice(1).join(','),
    });
    await page.goto(`${origin(servers.harness)}/harness.html?${q}`);
    return { context, page, names };
}

const frame = (page, name) => page.frames().find(f => f.name() === name);
const text = async (f, sel) => (await f.locator(sel).first().textContent().catch(() => '')) || '';

async function until(what, fn, ms = 30000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const v = await fn().catch(() => null);
        if (v) return v;
        await sleep(250);
    }
    throw new Error(`timed out waiting for ${what}`);
}

const shotsTaken = new Set();
async function shot(page, name, label) {
    if (!SHOTS || shotsTaken.has(label)) return;
    shotsTaken.add(label);
    fs.mkdirSync(SHOTS, { recursive: true });
    const el = name === 'harness' ? page : page.locator(`iframe[name="${name}"]`);
    await el.screenshot({ path: path.join(SHOTS, `${LOCALE}-${label}.png`) }).catch(e => log(`no shot ${label}: ${e.message}`));
}

/** One controller's move on the step it shows. Returns what it did. */
async function act(f, step, lie, n) {
    if (!f) return null;
    const send = f.locator('[data-do="send"]');
    if (await send.count()) {
        // Typed on the controller's own keyboard, key by key, as a thumb would.
        await f.evaluate(word => {
            for (const ch of Array.from(word)) {
                const key = document.querySelector(`[data-key="${ch}"]`);
                if (!key) throw new Error(`no key ${ch}`);
                key.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            }
        }, lie);
        await send.click();
        return 'lie';
    }
    const picks = f.locator('[data-do="pick"]');
    if (await picks.count()) {
        // Each controller picks a different place in the list, so the reveal has lies that fooled someone.
        await picks.nth(n % (await picks.count())).click();
        return 'pick';
    }
    const next = f.locator('[data-do="next"]');
    if (await next.count()) {
        await next.click();
        return 'next';
    }
    return null;
}

async function main() {
    if (!API_FILE || !fs.existsSync(API_FILE)) throw new Error('Set AIRCONSOLE_API to a local airconsole-1.11.0.js (github.com/AirConsole/airconsole-api)');
    if (!fs.existsSync(path.join(DIST, 'screen.html'))) throw new Error('Build first: cd airconsole && node build.js');
    const emulators = await startEmulators();
    const problems = [];
    const result = { locale: LOCALE, steps: [], checks: {} };
    let browser;
    const servers = { controllers: [] };
    try {
        if (!(await up(`http://${DB}/.json?ns=${PROJECT}`))) throw new Error('no database emulator on :9000');
        await seed();
        servers.harness = await serve(HARNESS);
        servers.screen = await serve(DIST);
        // servers.controllers[i - 1] serves controller i; the shared ones (and the late joiner) reuse one server.
        const shared = await serve(DIST);
        for (let i = 1; i <= CONTROLLERS; i++) servers.controllers.push(SHARED.includes(i) ? shared : await serve(DIST));
        servers.controllers.push(shared);
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`] });
        const { page, names } = await openHarness(browser, servers, problems);
        const screen = () => frame(page, 'screen');

        // The phones that share an origin with controller 1 come in one by one once it has its seat.
        for (const id of SHARED.slice(1)) {
            await until(`controller ${id - 1} seated`, async () => {
                const s = await page.evaluate(() => window.harness.devices[0].data.custom);
                return s && s.pin && (await text(frame(page, `controller-${id - 1}`), '.lobby .big'));
            }, 60000);
            await page.evaluate(i => window.harness.release(i), id);
            log(`controller ${id} added`);
        }
        // The lobby: four controllers take their seats under their AirConsole nicknames.
        await until('the screen to show 4 players', async () => (await screen().locator('.lobby .seat').count()) === CONTROLLERS, 60000);
        const pin = await until('the game PIN', async () => {
            const s = await page.evaluate(() => window.harness.devices[0].data.custom);
            return s && s.pin;
        });
        log(`game ${pin}, players in the lobby`);
        const lobbyGame = await db('GET', `games/${pin}`);
        result.checks.campaign = lobbyGame.campaign;
        result.checks.hasHost = lobbyGame.hasHost;
        result.checks.presenter = lobbyGame.presenter;
        result.checks.lobbyNames = Object.values(lobbyGame.players || {}).map(p => p.nickname).sort();
        result.checks.lobbySeats = Object.keys(lobbyGame.players || {}).length;
        // No two seats carry one uid (the controllers that share an origin may share one uid, or not).
        const uids = Object.values(lobbyGame.players || {}).map(p => p.uid).filter(Boolean);
        result.checks.lobbyUids = uids.length;
        result.checks.lobbyUidsDistinct = new Set(uids).size;
        result.checks.youreIn = await until('every controller to say it is in', async () => {
            const said = await Promise.all([1, 2, 3, 4].map(i => text(frame(page, `controller-${i}`), '.lobby .big')));
            return said.every(Boolean) && said;
        }).catch(() => Promise.all([1, 2, 3, 4].map(i => text(frame(page, `controller-${i}`), '.lobby .big'))));
        result.checks.dirScreen = await screen().evaluate(() => document.documentElement.dir);
        result.checks.dirController = await frame(page, 'controller-1').evaluate(() => document.documentElement.dir);
        await shot(page, 'harness', '0-lobby-all');
        await shot(page, 'screen', '1-lobby-screen');
        await shot(page, 'controller-1', '1-lobby-master');

        // Only the master starts: a START from another controller is ignored.
        await until('START on the master', async () => (await frame(page, 'controller-1').locator('[data-do="start"]:not([disabled])').count()) === 1);
        result.checks.startOnOthers = await frame(page, 'controller-2').locator('[data-do="start"]').count();
        // The functions emulator loads a function on its first call, which can take half a minute: load
        // the one a question calls first, so question 1 runs on time as it does in production.
        // The emulator starts one worker per call at the same moment, so warm as many as there are phones.
        await Promise.all(['answer', 'answer', 'answer', 'answer', 'answer', 'answer'].map(fn => fetch(`${FUNCTIONS}/${fn}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: 'ZZZZ' }),
        }).catch(() => null)));
        await frame(page, 'controller-1').locator('[data-do="start"]').click();

        const lies = LOCALE === 'he' ? ['גבינה', 'ירח כחול', 'סבתא', 'חתול', 'בננה'] : ['cheese', 'blue moon', 'grandma', 'a cat', 'banana'];
        const end = Date.now() + GAME_TIMEOUT_MS;
        const seenSteps = new Set();
        let dropped = false;
        let late = null;
        let q = -1;
        while (Date.now() < end) {
            const g = await db('GET', `games/${pin}/state`);
            const step = g && g.id;
            const key = `${step}:${g && g.timestamp}`;
            if (!seenSteps.has(key)) {
                seenSteps.add(key);
                const qi = await db('GET', `games/${pin}/questionIndex`);
                result.steps.push(`${step}@q${qi}`);
                q = qi;
                log(`step ${step}, question ${qi}`);
                await sleep(700);
                if (q === 0 && step === 2) { await shot(page, 'screen', '2-question-screen'); }
                if (q === 0 && step === 3) { await shot(page, 'screen', '4-answers-screen'); }
                if (step === 6) break;
            }
            // From question 2 on, a controller leaves, and a new one joins.
            if (q >= 1 && !dropped) {
                dropped = await page.evaluate(() => window.harness.drop(4));
                log('controller 4 left the game');
            }
            if (q >= 1 && !late) {
                late = await page.evaluate(([u, n]) => window.harness.addController(u, n), [`${origin(servers.controllers[CONTROLLERS])}/controller.html`, names[4]]);
                log(`controller ${late} joined mid-game`);
            }
            // Screenshots of question 1, on the master's controller and the screen.
            const f = frame(page, 'controller-1');
            if (q === 0 && f) {
                if (step === 2 && (await f.locator('[data-do="send"]').count())) await shot(page, 'controller-1', '3-question-controller');
                if (step === 3 && (await f.locator('[data-do="pick"]').count())) await shot(page, 'controller-1', '5-answers-controller');
                if (step === 4 && (await f.locator('[data-do="next"]').count())) {
                    await shot(page, 'controller-1', '7-reveal-controller');
                    await shot(page, 'screen', '6-reveal-screen');
                }
            }
            const lf = late && frame(page, `controller-${late}`);
            if (lf && step === 2 && (await lf.locator('[data-do="send"]').count())) await shot(page, `controller-${late}`, '10-late-joiner');
            const did = await Promise.all([1, 2, 3, 4, 5].map(i => act(frame(page, `controller-${i}`), step, lies[(i + q + 5) % lies.length], i + q)
                .catch(e => `error: ${e.message.slice(0, 700)}`)));
            if (did.some(Boolean)) log(`  controllers: ${did.map((d, i) => `${i + 1}:${d || '-'}`).join(' ')}`);
            if (q === 0 && step === 5) await shot(page, 'screen', '8-scores-screen');
            await sleep(400);
        }
        const final = await db('GET', `games/${pin}`);
        if (!final || !final.state || final.state.id !== 6) throw new Error(`the game did not reach the final scores: ${JSON.stringify(final && final.state)}`);
        await sleep(1500);
        await shot(page, 'harness', '9-final-all');
        await shot(page, 'screen', '9-final-screen');
        await shot(page, 'controller-1', '9-final-master');
        result.checks.roundIntros = result.steps.filter(s => s.startsWith('1@')).length;
        result.checks.roundIndexAtEnd = final.roundIndex;
        result.checks.questions = final.totalQ;
        result.checks.finalPlayers = Object.values(final.players || {}).map(p => `${p.nickname}:${p.score}`);
        result.checks.idle = !!final.idle;
        result.checks.lateJoinerSeated = Object.values(final.players || {}).some(p => p.nickname === names[4]);

        // PLAY AGAIN on the master: AirConsole's ad break, then a new game that every controller joins.
        await until('PLAY AGAIN on the master', async () => (await frame(page, 'controller-1').locator('[data-do="again"]').count()) === 1);
        await frame(page, 'controller-1').locator('[data-do="again"]').click();
        const pin2 = await until('a new game', async () => {
            const s = await page.evaluate(() => window.harness.devices[0].data.custom);
            return s && s.pin && s.pin !== pin && s.pin;
        });
        await until('the controllers in the new game', async () => {
            const players = await db('GET', `games/${pin2}/players`);
            return players && Object.keys(players).length >= CONTROLLERS;
        });
        result.checks.again = { pin: pin2, campaign: await db('GET', `games/${pin2}/campaign`) };
        result.checks.adBreaks = (await page.evaluate(() => window.harnessLog)).filter(l => l.startsWith('ad by 0')).length;
        result.pin = pin;
    } finally {
        if (browser) await browser.close();
        new Set(Object.values(servers).flat()).forEach(s => s && s.close && s.close());
        stopEmulators(emulators);
        await sleep(5000); // let the emulators shut down before this process ends
    }

    const c = result.checks;
    const fails = [];
    if (c.campaign !== 'portal-airconsole') fails.push(`campaign is ${c.campaign}`);
    if (c.lobbySeats !== CONTROLLERS || new Set(c.lobbyNames).size !== CONTROLLERS) fails.push(`the lobby has ${c.lobbySeats} seats (${c.lobbyNames}), not one per controller`);
    if (c.lobbyUids !== 2 || c.lobbyUidsDistinct !== 2) fails.push(`seats carry ${c.lobbyUids} uids, ${c.lobbyUidsDistinct} distinct, not one per origin`);
    if (c.youreIn.some(t => !t)) fails.push(`a seated controller does not say it is in: ${JSON.stringify(c.youreIn)}`);
    if (c.hasHost !== 'screen') fails.push(`hasHost is ${c.hasHost}`);
    if (c.presenter !== true) fails.push('the game has no big screen');
    if (c.startOnOthers !== 0) fails.push('a controller that is not the master shows START');
    if (c.roundIndexAtEnd !== 2) fails.push(`the game ended in round ${c.roundIndexAtEnd + 1}, not 3`);
    if (c.idle) fails.push('the game ended idle');
    if (!c.lateJoinerSeated) fails.push('the controller that joined mid-game has no seat');
    if (!c.again || c.again.campaign !== 'portal-airconsole') fails.push('PLAY AGAIN did not open a tagged game');
    if (c.adBreaks < 1) fails.push('no ad break before PLAY AGAIN');
    const rtl = LOCALE === 'he' ? 'rtl' : 'ltr';
    if (c.dirScreen !== rtl || c.dirController !== rtl) fails.push(`direction is ${c.dirScreen}/${c.dirController}, not ${rtl}`);
    fails.push(...problems);
    result.ok = fails.length === 0;
    result.fails = fails;
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exit(1);
}

main().catch(e => {
    console.error('FAIL', e.stack || e);
    process.exit(1);
});
