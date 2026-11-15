#!/usr/bin/env node
// Local run: old games close to strangers (functions/src/controllers/old-games.ts), on the Firebase
// emulators (Hosting serving game/dist, Cloud Functions, Realtime Database with the repository's own
// rules, Auth). Not part of npm test: it needs Java and the built game.
//
// 1. Five games are written: a live one, one that ended an hour ago, one that ended 7 hours ago (with
//    its crew), an earlier game of that same night, and a lobby made 48 hours ago and never played.
// 2. A signed-out stranger reads every one's players, lies and picks: all readable, as on master.
// 3. The daily puzzle answers without sweeping; a game's phase change runs the sweep, as in production.
// 4. The stranger again: the old game's and the old lobby's private parts read as nothing, and
//    their new home (kept) and the whole game are refused. The live game and the one that ended an
//    hour ago read as before.
// 5. The server's readers on the old game: the PIN check says "game over", the join link preview still
//    names its host, Replay seats its players, its crew saves and the crew's rematch makes a game.
// 6. In headless Chromium: the old game's final screen goes to its join page, which says "Game over";
//    the final screen of the game that ended an hour ago draws its players as before.
//
// Nothing reaches production: the built game's requests are caught and sent to the emulators.
//   node functions/test/old-games-emulator.js [path to dist]     (SHOTS=<dir> saves screenshots)

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');

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

// firebase-tools sends its own calls to the emulators through HTTPS_PROXY when one is set (see
// .github/smoke/emulator-game.js): send loopback calls direct.
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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-old-games-emulators-'));
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

/** Stops the emulators, and waits until they are gone, so the next run starts its own. */
async function stopEmulators(child) {
    if (!child) return;
    try {
        process.kill(-child.pid, 'SIGINT');
    } catch (e) { return; }
    const until = Date.now() + 20000;
    while (Date.now() < until && child.exitCode === null && child.signalCode === null) {
        await sleep(500);
    }
    try {
        process.kill(-child.pid, 'SIGKILL');
    } catch (e) { /* gone */ }
    // The database emulator (Java) can outlive its parent: stop it too, or the next run finds its port taken.
    require('child_process').spawnSync('pkill', ['-f', 'firebase-database-emulator']);
}

async function db(method, p, body) {
    const res = await fetch(`http://${DB}/${p}.json?ns=${PROJECT}`, {
        method, headers: { Authorization: 'Bearer owner' }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${method} ${p}: ${res.status} ${await res.text()}`);
    return res.json();
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


/** A signed-out stranger reads one path, as a phone does (REST, no token). */
async function stranger(p) {
    const res = await fetch(`http://${DB}/${p}.json?ns=${PROJECT}`);
    return { status: res.status, value: res.ok ? await res.json() : null };
}

const H = 60 * 60 * 1000;
const PRIVATE = ['players', 'highlights', 'answers', 'revealAnswers', 'answerSelections', 'currentQ', 'creator'];
const CREW = 'testcrew01';

function game(stateId, stateAt, madeAt, extra = {}) {
    return Object.assign({
        state: { id: stateId, timestamp: stateAt }, timestamp: madeAt, locale: 'en', totalQ: 4, roundIndex: 1, questionIndex: 3,
        qids: { 0: 'en0', 1: 'en1', 2: 'en2', 3: 'en3' }, tick: 0, presenter: false, origin: 'create', campaign: 'test',
        creator: 'uDana',
        players: {
            p1: { nickname: 'Dana', score: 900, uid: 'uDana', host: true },
            p2: { nickname: 'Yossi', score: 500, uid: 'uYossi' },
            p3: { nickname: 'Noa', score: 300, uid: 'uNoa' },
        },
        highlights: { p1: { text: 'a secret lie', fooled: 2, question: 'Test question 3 ___' } },
        highlightsFrom: 0,
        answers: { p1: { text: 'a secret lie', realAnswer: false } },
        revealAnswers: [{ text: 'a secret lie', writers: ['p1'], pickers: ['p2', 'p3'] }],
        answerSelections: { p2: 'a secret lie', p3: 'a secret lie' },
        currentQ: 'Test question 3 ___',
    }, extra);
}

async function seed() {
    const rules = await fetch(`http://${DB}/.settings/rules.json?ns=${PROJECT}`, {
        method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: fs.readFileSync(path.join(ROOT, 'database-rules.json'), 'utf8'),
    });
    if (!rules.ok) throw new Error(`could not load the database rules: ${rules.status}`);
    const questions = {};
    for (let i = 0; i < 12; i++) {
        questions[`en${i}`] = { lang: 'en', questionText: `Test question ${i} ___`, realAnswer: `truth${i}`, fakeAnswers: ['lie a', 'lie b', 'lie c', 'lie d'], citation: '' };
    }
    await db('PUT', 'questions', questions);
    const now = Date.now();
    // PINs as the counter makes them, for the first five games ever made: the sweep starts from counter 1.
    const pin = (c) => c.toString(26).replace(/\d/g, d => 'qrstuvwxyz'[d]).toUpperCase().padStart(4, 'Q');
    const pins = { earlier: pin(1), open: pin(2), old: pin(3), lobby: pin(4), hour: pin(5), live: pin(6) };
    await db('PUT', `games/${pins.earlier}`, game(6, now - 8 * H, now - 9 * H));
    // A lobby made 30 hours ago that is still open in a host's tab (it reports in every 20 seconds):
    // the sweep passes over it, notes it, and goes on to the old games after it.
    await db('PUT', `games/${pins.open}`, game(0, now - 30 * H, now - 30 * H, { roundIndex: 0, questionIndex: 0, hostSeen: now - 20000 }));
    await db('PUT', `games/${pins.old}`, game(6, now - 7 * H, now - 7.5 * H, { parent: pins.earlier }));
    await db('PUT', `games/${pins.lobby}`, game(0, now - 48 * H, now - 48 * H, { roundIndex: 0, questionIndex: 0 }));
    await db('PUT', `games/${pins.hour}`, game(6, now - H, now - 1.5 * H));
    await db('PUT', `games/${pins.live}`, game(3, now - 5000, now - 10 * 60 * 1000, { serverStart: true }));
    await db('PUT', 'gameCounter', 6);
    return pins;
}

async function call(name, body) {
    const res = await fetch(`${FUNCTIONS}/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
    const checks = [];
    const check = (name, ok, detail) => { checks.push({ name, ok: !!ok, detail }); log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
    let emulators;
    let browser;
    try {
        emulators = await startEmulators();
        const pins = await seed();
        log('games', JSON.stringify(pins));

        // 2. Before the sweep: everything is readable by a stranger, as on master.
        for (const which of ['open', 'old', 'lobby', 'hour', 'live']) {
            const r = await stranger(`games/${pins[which]}/players`);
            check(`before: a stranger reads the ${which} game's players`, r.status === 200 && r.value && r.value.p1, `${r.status}`);
        }

        // 3. The daily puzzle answers without running the sweep: it runs from a game's phase change alone.
        const asked = Date.now();
        const daily = await fetch(`${FUNCTIONS}/daily?lang=en`);
        log(`daily answered ${daily.status} in ${Date.now() - asked} ms`);
        check('the daily puzzle answers', daily.status === 200 || daily.status === 503, `${daily.status}`);
        // A phase change runs the sweep. The project sweeps at most once a minute, and the games' own
        // writes above may have just run it: change the live game's phase time again until it has.
        const until = Date.now() + 150000;
        while (Date.now() < until && ((await db('GET', 'qHistory/gameSweep')) || {}).next !== 5) {
            await db('PUT', `games/${pins.live}/state/timestamp`, Date.now());
            log('the live game\'s phase time changed');
            await sleep(10000);
        }
        const sweep = await db('GET', 'qHistory/gameSweep');
        check('the sweep ran past the open lobby and stopped at the game that ended an hour ago', sweep && sweep.next === 5, JSON.stringify(sweep));
        check('the open lobby is noted for a later look', sweep && sweep.wait && sweep.wait[pins.open] > Date.now(), JSON.stringify(sweep && sweep.wait));
        check('the sweep\'s start time is kept, for the once-a-minute limit', sweep && sweep.at > 0 && sweep.lease === 0, JSON.stringify(sweep));

        // 4. After the sweep.
        for (const which of ['old', 'lobby']) {
            for (const part of PRIVATE) {
                const r = await stranger(`games/${pins[which]}/${part}`);
                check(`after: the ${which} game's ${part} reads as nothing`, r.status === 200 && r.value === null, `${r.status} ${JSON.stringify(r.value)}`);
            }
            const kept = await stranger(`games/${pins[which]}/kept`);
            check(`after: the ${which} game's kept is refused to a stranger`, kept.status === 401, `${kept.status}`);
            const whole = await stranger(`games/${pins[which]}`);
            check(`after: the whole ${which} game is refused to a stranger`, whole.status === 401, `${whole.status}`);
            const state = await stranger(`games/${pins[which]}/state`);
            check(`after: the ${which} game's state still reads`, state.status === 200 && state.value && typeof state.value.id === 'number', `${state.status}`);
        }
        const moved = await db('GET', `games/${pins.old}/kept`);
        check('nothing erased: the old game\'s parts are all under kept', PRIVATE.every(p => moved && moved[p] !== undefined)
            && moved.players.p1.nickname === 'Dana' && moved.highlights.p1.text === 'a secret lie', Object.keys(moved || {}).join(','));
        for (const which of ['open', 'hour', 'live']) {
            for (const part of PRIVATE) {
                const r = await stranger(`games/${pins[which]}/${part}`);
                check(`after: the ${which} game's ${part} still reads`, r.status === 200 && r.value !== null, `${r.status}`);
            }
        }
        // The live game still plays: a pick is written and taken as before.
        const pick = await fetch(`http://${DB}/games/${pins.live}/answerSelections/p1.json?ns=${PROJECT}`, { method: 'PUT', body: JSON.stringify('lie a') });
        check('the live game still takes a pick from a phone', pick.ok, `${pick.status}`);

        // 6. The final screens, in a browser.
        browser = await chromium.launch();
        const shots = process.env.SHOTS;
        // A player's phone that reloads the old final screen, and the big screen left open on it.
        const phone = await newPhone(browser, 'late');
        await phone.context.addInitScript(() => localStorage.setItem('BS_PLAYER', JSON.stringify({ nickname: 'yossi', pid: 'p2', uid: 'uYossi' })));
        await phone.page.goto(`${SITE}/score-board-final/${pins.old}`);
        await phone.page.waitForURL(new RegExp(`/join-game/${pins.old}`), { timeout: 30000 }).catch(() => null);
        await phone.page.getByText('Game over').first().waitFor({ timeout: 20000 }).catch(() => null);
        const url = phone.page.url();
        const over = await phone.page.getByText('Game over').count();
        check('the old game\'s final screen goes to its join page, which says Game over', /\/join-game\//.test(url) && over > 0, url.replace(SITE, ''));
        if (shots) await phone.page.screenshot({ path: path.join(shots, 'old-final-to-join.png') });
        const screen = await newPhone(browser, 'screen', { viewport: { width: 1280, height: 720 }, isMobile: false, hasTouch: false });
        await screen.context.addInitScript(() => sessionStorage.setItem('BS_PRESENTER', 'true'));
        await screen.page.goto(`${SITE}/score-board-final/${pins.old}`);
        await screen.page.getByText('Game over').first().waitFor({ timeout: 20000 }).catch(() => null);
        check('the big screen on the old final screen goes to the join page too', /\/join-game\//.test(screen.page.url())
            && (await screen.page.getByText('Game over').count()) > 0, screen.page.url().replace(SITE, ''));
        if (shots) await screen.page.screenshot({ path: path.join(shots, 'old-final-big-screen.png') });
        const fresh = await newPhone(browser, 'fresh');
        await fresh.context.addInitScript(() => localStorage.setItem('BS_PLAYER', JSON.stringify({ nickname: 'yossi', pid: 'p2', uid: 'uYossi' })));
        await fresh.page.goto(`${SITE}/score-board-final/${pins.hour}`);
        await fresh.page.getByText('Dana').first().waitFor({ timeout: 30000 }).catch(() => null);
        const named = await fresh.page.getByText('Dana').count();
        check('the final screen of the game that ended an hour ago draws its players', /score-board-final/.test(fresh.page.url()) && named > 0, fresh.page.url().replace(SITE, ''));
        if (shots) await fresh.page.screenshot({ path: path.join(shots, 'hour-final.png') });
        // 5. The server's readers on the old game.
        const v = await call('validateGameName', { pin: pins.old.toLowerCase() });
        check('the PIN check says the old game is over', v.status === 400 && v.body && v.body.code === 'GAME_OVER', JSON.stringify(v.body));
        // A finished game's link gets the generic preview, on master as here (previewOf); a live one names its host.
        const bot = { headers: { 'User-Agent': 'WhatsApp/2.24.21.80 A' } };
        const oldPreview = await (await fetch(`${SITE}/join-game/${pins.old}`, bot)).text();
        check('the old game\'s join link gets the same generic preview as on master', /<title>/.test(oldPreview) && !/invited you/.test(oldPreview));
        const livePreview = await (await fetch(`${SITE}/join-game/${pins.live}`, bot)).text();
        check('the live game\'s join link still names its host', /Dana invited you to play Bullshit/.test(livePreview));
        const crew = await call('createCrew', { pin: pins.old, name: 'The Testers', uid: 'uDana' });
        check('the old game saves as a crew, with its players', crew.status === 200 && crew.body && crew.body.id, JSON.stringify(crew.body));
        if (crew.body && crew.body.id) {
            const saved = await db('GET', `crews/${crew.body.id}`);
            check('the crew holds the old game\'s players and its earlier game of the night', saved && JSON.stringify(saved.members || {}).includes('dana')
                && JSON.stringify(saved).includes(pins.earlier), Object.keys((saved && saved.members) || {}).join(','));
            const rematch = await call('crewRematch', { crew: crew.body.id, uid: 'uDana' });
            check('the crew\'s rematch makes a new game', rematch.status === 200 && rematch.body && rematch.body.pin, JSON.stringify(rematch.body));
        }
        const replay = await call('fork', { pin: pins.old, uid: 'uDana', pid: 'p1' });
        const replayGame = replay.body && replay.body.pin ? await db('GET', `games/${replay.body.pin}`) : null;
        check('Replay of the old game seats its players', replayGame && Object.keys(replayGame.players || {}).length === 3 && replayGame.parent === pins.old,
            `${replay.status} ${replay.body && replay.body.pin} ${Object.keys((replayGame && replayGame.players) || {}).join(',')}`);
        const after = await stranger(`games/${pins.old}/players`);
        check('the old game stays closed after those calls', after.status === 200 && after.value === null, JSON.stringify(after.value));

        const problems = phone.problems.concat(fresh.problems);
        if (problems.length) log('page problems:', JSON.stringify(problems));
    } catch (e) {
        check('the run finished', false, e && e.stack ? e.stack : String(e));
    } finally {
        if (browser) await browser.close().catch(() => null);
        await stopEmulators(emulators);
    }
    const failed = checks.filter(c => !c.ok);
    console.log(JSON.stringify({ checks: checks.length, failed: failed.map(c => c.name) }, null, 2));
    process.exit(failed.length ? 1 : 0);
}

main();
