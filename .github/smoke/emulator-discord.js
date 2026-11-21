#!/usr/bin/env node
// Local run and pull request check: a whole game of the built client (game/dist) played INSIDE A
// STAND-IN FOR DISCORD, against the Firebase emulators. It is the first step of the game as a Discord
// Activity: proof that the live game runs through Discord's proxy, under its content policy.
//
// Each player opens the "Discord client" (discord-proxy.js), which shows the Activity in a frame at
// https://<app id>.discordsays.com, as Discord does. Nothing in the browser sends the game's requests
// anywhere: the game's own start-up (src/discord/boot.ts) must rewrite them to the Activity's mapped
// paths, the stand-in forwards those to the emulators, and the content policy refuses everything else.
// Chromium resolves no host but the two stand-in names, so nothing can reach production.
//
// Three phones and a computer play every question to the final scoreboard: the host creates the game
// from the Activity's home, the others type its PIN in the home's code box.
//
// It checks: the game reaches the final scoreboard on every player; sign-in, every game action and the
// live database went through their mappings; the database stayed on its WebSocket (no long polling);
// an error report reaches the Sentry mapping; no request left the Activity's host; the only requests
// the content policy refused are the ones the later build steps move into the game's own files (outside
// fonts and icons, the inline scripts); the game's stylesheet is on; and, off Discord, the same build
// patches nothing.
//
// Needs Java (for the database emulator), functions/ built and game/ built. From the repository root:
//   node .github/smoke/emulator-discord.js [path to dist]
// EMULATORS=running uses emulators you already run (see emulator-game.js). VERBOSE=1 logs each request
// through the stand-in and every console line; SHOTS=<dir> saves a screenshot of each player at the end.
// Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const path = require('path');
const { chromium } = require('playwright');
const { serve } = require('./smoke');
const { DIST, HOST, DB, PROJECT, log, sleep, up, startEmulators, stopEmulators, db, seed, act, visible } = require('./emulator-game');
const { startDiscordProxy, BROWSER_ARGS, BROWSER_ENV, ACTIVITY_HOST, CLIENT_HOST } = require('./discord-proxy');

const QUESTIONS = 5;
const GAME_TIMEOUT_MS = Number(process.env.GAME_MINUTES || 8) * 60 * 1000;
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

// Refused by the content policy, and expected to be: the page's inline scripts (the visit beacon, the
// stylesheet switch, the icons' onload), which boot.ts makes up for from files (the beacon from
// visit-beacon.js, the stylesheets turned on by itself). Also Firebase sign-in's helper for pop-up and
// redirect sign-in (apis.google.com/js/api.js), which it loads on start and the game never uses (it
// signs in anonymously). None of them stops the game. The fonts, the icons and the background photo come
// from the game's own files, so a request for them to another site fails the check.
const EXPECTED_BLOCKS = [
    /^https:\/\/apis\.google\.com\/js\/api\.js/,
    /^inline$/,
];
// The fields of every visit row (the beacon in src/index.html): the same inside Discord as off it.
const VISIT_FIELDS = ['k', 'v', 'first', 'last', 'booted', 'ms', 'err', 'lang', 'ref', 'tag', 'fv', 'cr', 'jn', 'pl', 'wd'].sort().join(',');

/** What a page's own fonts, icons and photo came to: each font loaded from this host, and where from. */
async function ownAssets(frame) {
    return frame.evaluate(async () => {
        const tries = { 'Luckiest Guy': 'BULLSHIT', 'Suez One': '\u05d1\u05d5\u05dc\u05e9\u05d9\u05d8', FontAwesome: '\uf00c' };
        const fonts = {};
        for (const [family, text] of Object.entries(tries)) {
            const faces = await document.fonts.load(`20px "${family}"`, text).catch(() => []);
            fonts[family] = faces.some((f) => f.status === 'loaded');
        }
        const files = performance.getEntriesByType('resource').map((e) => e.name);
        const icons = Array.from(document.querySelectorAll('link[data-bs-later]')).map((l) => l.media);
        return {
            fonts,
            fontFiles: files.filter((u) => /\.(woff2?|ttf|eot)(\?|$)/.test(u)).map((u) => new URL(u).host),
            iconsOn: icons.length > 0 && icons.every((m) => m === 'all'),
            photo: files.filter((u) => /arcade/.test(u)),
            marked: document.documentElement.hasAttribute('data-bs-discord'),
            beaconFile: files.some((u) => /\/visit-beacon\.js$/.test(u)),
        };
    });
}
const ALLOWED_CONSOLE_ERRORS = [
    // The browser's own line for each refusal above.
    /^Refused to (load|apply|execute|connect)/,
    /^Executing inline (event handler|script) violates/,
    /^Loading the (stylesheet|font|image|script) '.*' violates/,
    /^Failed to load resource: net::ERR_(BLOCKED_BY_CSP|FAILED|NAME_NOT_RESOLVED)/,
    // Chromium lets no page in another site's frame move the focus by itself (the game's autofocus
    // directive): the player taps the box. Inside Discord too; a later step can drop the autofocus there.
    /^Blocked autofocusing on a <input> element in a cross-origin subframe/,
];

/** The script each frame runs first: it records every content-policy refusal the page meets. */
function watchPolicy() {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
        window.__csp.push({ blocked: e.blockedURI, directive: e.effectiveDirective, source: (e.sourceFile || '').slice(0, 120), line: e.lineNumber });
    });
}

async function newPlayer(browser, proxy, name, role, desktop) {
    const context = await browser.newContext(desktop
        ? { serviceWorkers: 'block', viewport: { width: 1280, height: 720 } }
        : { serviceWorkers: 'block', viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true, userAgent: PHONE_UA });
    await context.addInitScript(watchPolicy);
    const player = { name, role, context, problems: [], screens: [], lies: [], picks: [], done: false, escaped: [], visits: [] };
    context.on('request', (req) => {
        if (new URL(req.url()).pathname === '/_v') {
            try { player.visits.push(JSON.parse(req.postData())); } catch (e) { player.visits.push({ bad: String(req.postData()).slice(0, 80) }); }
        }
        const host = new URL(req.url()).hostname;
        if (host !== ACTIVITY_HOST && host !== CLIENT_HOST && !req.url().startsWith('data:') && !req.url().startsWith('blob:')) {
            player.escaped.push(req.url().slice(0, 160));
        }
    });
    const page = await context.newPage();
    if (process.env.VERBOSE) {
        page.on('websocket', (ws) => {
            log(`[${name} socket] ${ws.url()}`);
            let n = 0;
            const show = (dir) => (f) => { if (n++ < 60) log(`[${name} socket ${dir}] ${String(f.payload).slice(0, 200)}`); };
            ws.on('framesent', show('>'));
            ws.on('framereceived', show('<'));
            ws.on('close', () => log(`[${name} socket] closed`));
        });
    }
    page.on('pageerror', (err) => player.problems.push(`uncaught exception: ${err.stack || err.message || err}`));
    page.on('crash', () => player.problems.push('the page crashed'));
    page.on('console', (msg) => {
        if (process.env.VERBOSE) log(`[${name} console.${msg.type()}] ${msg.text().slice(0, 300)}`);
        if (msg.type() !== 'error') return;
        const text = msg.text();
        if (ALLOWED_CONSOLE_ERRORS.some((re) => re.test(text))) return;
        player.problems.push(`console error: ${text.slice(0, 300)}`);
    });
    await page.goto(proxy.client(desktop ? 'desktop' : 'mobile', `f-${name}`));
    const frame = await waitFor(`${name}'s Activity frame`, async () => page.frames().find((f) => new URL(f.url()).hostname === ACTIVITY_HOST && f.url().includes('/')));
    // act() (emulator-game.js) plays a screen from page.url() and page.locator(): the frame has both.
    player.page = frame;
    player.tab = page;
    return player;
}

async function waitFor(what, fn, ms = 30000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const v = await fn().catch(() => null);
        if (v) return v;
        await sleep(250);
    }
    throw new Error(`timed out: ${what}`);
}

const screenOf = (frame) => new URL(frame.url()).pathname.replace(/^\/he(?=\/|$)/, '').split('/')[1] || 'home';

async function main() {
    const emulators = await startEmulators();
    const problems = [];
    let browser;
    let site;
    let proxy;
    try {
        if (!(await up(`http://${DB}/.json?ns=${PROJECT}`))) throw new Error('no database emulator on :9000');
        await seed();
        site = await serve(DIST);
        proxy = await startDiscordProxy({
            site: `http://${HOST}:${site.address().port}`, db: DB, auth: `${HOST}:9099`,
            functions: `http://${HOST}:5001/${PROJECT}/us-central1`, project: PROJECT,
        });
        if (process.env.VERBOSE) {
            const push = proxy.events.push.bind(proxy.events);
            proxy.events.push = (e) => { log(`[proxy] ${e.method} ${e.kind} ${e.path}`); return push(e); };
        }
        browser = await chromium.launch({ args: BROWSER_ARGS.concat(['--autoplay-policy=no-user-gesture-required']), env: BROWSER_ENV });

        const host = await newPlayer(browser, proxy, 'Ana', 'host');
        const p2 = await newPlayer(browser, proxy, 'Ben', 'player');
        const p3 = await newPlayer(browser, proxy, 'Cleo', 'player');
        const p4 = await newPlayer(browser, proxy, 'Dov', 'player', true);
        const players = [host, p2, p3, p4];
        const game = {};

        // Inside Discord the page patched itself before the app started.
        const marked = await host.page.evaluate(() => window.bsDiscordProxy === true);
        if (!marked) problems.push('the Activity page was not patched for the proxy (window.bsDiscordProxy)');

        // The host: the Activity's home, then Create.
        await waitFor('the host\'s home', async () => visible(host.page.locator('.menu-button.create-game')));
        await host.page.locator('.menu-button.create-game').first().click();
        await waitFor('the create page', async () => screenOf(host.page) === 'create-game' && visible(host.page.locator('input[name="locale"]')));
        await host.page.locator('input[name="locale"]').nth(0).check();
        await host.page.locator('input[name="length"]').first().check();
        await host.page.locator('form button[type="submit"]').first().click();
        await waitFor('the game is created', async () => /\/join-game\/[A-Za-z0-9]+/.test(host.page.url()));
        game.pin = new URL(host.page.url()).pathname.split('/').pop().toUpperCase();
        log(`game ${game.pin} created inside the stand-in`);
        const created = await db('GET', `games/${game.pin}`);
        if (!created || !created.creator) problems.push('the game has no creator uid: anonymous sign-in did not reach newGame through the proxy');

        // The others: the PIN in the home's code box, as a friend in the call would.
        for (const p of [p2, p3, p4]) {
            await waitFor(`${p.name}'s home code box`, async () => visible(p.page.locator('form.code-box .code-input')));
            await p.page.locator('form.code-box .code-input').first().fill(game.pin.toLowerCase());
            await p.page.locator('form.code-box .code-join').first().click();
        }

        const deadline = Date.now() + GAME_TIMEOUT_MS;
        while (Date.now() < deadline && !players.every((p) => p.done)) {
            if (!game.everyoneIn) {
                const seated = await db('GET', `games/${game.pin}/players`);
                game.everyoneIn = seated && Object.keys(seated).length === players.length && players.every((p) => p.joined);
            }
            for (const p of players) {
                const s = screenOf(p.page);
                if (p.screens[p.screens.length - 1] !== s) p.screens.push(s);
            }
            await Promise.all(players.filter((p) => !p.done).map((p) => act(p, game).catch((e) => {
                if (!/Target closed|Execution context was destroyed|navigation|detached/.test(e.message)) log(`${p.name}: ${e.message.split('\n')[0]}`);
            })));
            await sleep(400);
        }

        // An error report through the Sentry mapping. The game's own Sentry sends nothing from an automated
        // browser (shouldSendCallback), so this sends one the way raven-js does, by fetch, to sentry.io.
        const sent = await host.page.evaluate(async () => {
            const r = await fetch('https://sentry.io/api/144992/store/?sentry_version=7&sentry_key=test', { method: 'POST', body: '{"message":"stand-in test"}' });
            return r.status;
        }).catch((e) => String(e));
        const sentry = proxy.events.filter((e) => e.kind === 'sentry');

        if (process.env.SHOTS) {
            for (const p of players) await p.tab.screenshot({ path: path.join(process.env.SHOTS, `discord-${p.name}.png`) }).catch(() => { });
        }

        const blocks = [];
        for (const p of players) {
            const csp = await p.page.evaluate(() => window.__csp || []).catch(() => []);
            csp.forEach((v) => blocks.push(Object.assign({ player: p.name }, v)));
        }
        const unexpected = blocks.filter((b) => !EXPECTED_BLOCKS.some((re) => re.test(b.blocked)));
        const styled = await host.page.evaluate(() => Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
            .filter((l) => /styles-[^/]*\.css$/.test(l.href)).every((l) => l.media === 'all' || l.media === '')).catch(() => false);
        const kinds = {};
        proxy.events.forEach((e) => { const k = `${e.method === 'WEBSOCKET' ? 'ws' : 'http'} ${e.kind}`; kinds[k] = (kinds[k] || 0) + 1; });
        const longPolls = proxy.events.filter((e) => e.kind === 'fb' && /\/\.lp$/.test(e.path));
        const sockets = proxy.events.filter((e) => e.method === 'WEBSOCKET' && e.kind === 'fb' && e.status === 101);
        const failed = proxy.events.filter((e) => e.kind !== 'sentry' && e.status >= 500);
        const final = await db('GET', `games/${game.pin}`);

        // The fonts, icons and photo inside Discord, from the Activity's own host.
        const assets = {};
        for (const p of players) assets[p.name] = await ownAssets(p.page).catch((e) => ({ error: String(e) }));

        // Off Discord: the same build on its own host patches nothing, and the inline beacon counts the visit.
        const plain = await browser.newContext();
        const plainVisits = [];
        const plainOut = [];
        plain.on('request', (req) => {
            const u = new URL(req.url());
            // On this host (not one of the site's own) the beacon posts straight to the visit function.
            if (u.pathname === '/_v' || /cloudfunctions\.net$/.test(u.hostname) && u.pathname === '/visit') { try { plainVisits.push(JSON.parse(req.postData())); } catch (e) { } }
            if (u.hostname !== HOST && !/^(data|blob):/.test(req.url())) plainOut.push(u.hostname);
        });
        const plainPage = await plain.newPage();
        await plainPage.goto(`http://${HOST}:${site.address().port}/create-game`);
        await waitFor('the plain page draws', async () => plainVisits.some((r) => r.k === 'drawn'));
        const offDiscord = await plainPage.evaluate(() => window.bsDiscordProxy === undefined);
        const plainAssets = await ownAssets(plainPage.mainFrame()).catch((e) => ({ error: String(e) }));
        await plain.close();

        const summary = {
            build: DIST,
            activity: proxy.activityOrigin,
            pin: game.pin,
            seconds: Math.round((Date.now() - (game.started || Date.now())) / 1000),
            finalState: final && final.state && final.state.id,
            scores: final && final.players ? Object.values(final.players).map((p) => `${p.nickname}: ${p.score}`) : null,
            reachedFinal: Object.fromEntries(players.map((p) => [p.name, p.done])),
            lies: Object.fromEntries(players.map((p) => [p.name, p.lies.map((q) => q + 1)])),
            screens: Object.fromEntries(players.map((p) => [p.name, p.screens.join(' > ')])),
            throughTheProxy: kinds,
            databaseSockets: sockets.length,
            sentryReport: { status: sent, received: sentry.length },
            refusedByPolicy: Array.from(new Set(blocks.map((b) => `${b.directive} ${b.blocked}`))),
            assets,
            visits: Object.fromEntries(players.map((p) => [p.name, p.visits.map((r) => r.k).join(' ')])),
            offDiscordUnpatched: offDiscord,
            offDiscord: { visits: plainVisits.map((r) => r.k).join(' '), assets: plainAssets, outsideHosts: Array.from(new Set(plainOut)) },
            policy: proxy.policy,
        };

        if (!final || !final.state || final.state.id !== 6) problems.push(`the game did not reach the final scoreboard (state ${final && final.state && final.state.id})`);
        players.forEach((p) => { if (!p.done) problems.push(`${p.name} never showed the final scoreboard`); });
        players.forEach((p) => { if (p.lies.length < QUESTIONS) problems.push(`${p.name} sent ${p.lies.length} lies, not ${QUESTIONS}`); });
        if (!kinds['http gapi']) problems.push('no sign-in request went through /gapi');
        if (!kinds['http cf']) problems.push('no game action went through /cf');
        if (!sockets.length) problems.push('the database never opened its WebSocket through /fb');
        if (longPolls.length) problems.push(`the database fell back to long polling ${longPolls.length} times`);
        if (sent !== 200 || !sentry.length) problems.push(`the error report did not reach the Sentry mapping (${sent})`);
        if (failed.length) problems.push(`${failed.length} requests through the stand-in failed: ${failed.slice(0, 3).map((e) => `${e.kind} ${e.path} ${e.status}`).join(', ')}`);
        if (!styled) problems.push('the game\'s stylesheet is not on inside Discord');
        if (!offDiscord) problems.push('off Discord the page was patched');
        players.forEach((p) => {
            const a = assets[p.name] || {};
            Object.entries(a.fonts || {}).forEach(([family, ok]) => { if (!ok) problems.push(`${p.name}: the font ${family} did not load inside Discord`); });
            if (!a.fonts) problems.push(`${p.name}: could not read the fonts (${a.error})`);
            (a.fontFiles || []).forEach((h) => { if (!h.startsWith(ACTIVITY_HOST)) problems.push(`${p.name}: a font came from ${h}`); });
            if (!a.iconsOn) problems.push(`${p.name}: the icons' stylesheet is not on inside Discord`);
            if (!a.marked) problems.push(`${p.name}: the page is not marked data-bs-discord`);
            if (!a.beaconFile) problems.push(`${p.name}: visit-beacon.js was not loaded inside Discord`);
            (a.photo || []).forEach((u) => { if (!u.startsWith(proxy.activityOrigin + '/assets/images/')) problems.push(`${p.name}: the background photo came from ${u}`); });
            const views = p.visits.filter((r) => r.k === 'view');
            if (views.length !== 1) problems.push(`${p.name}: ${views.length} view rows inside Discord, not 1`);
            if (!p.visits.some((r) => r.k === 'drawn')) problems.push(`${p.name}: no drawn row inside Discord`);
            p.visits.forEach((r) => { if (Object.keys(r).sort().join(',') !== VISIT_FIELDS) problems.push(`${p.name}: a visit row with other fields: ${Object.keys(r).join(',')}`); });
            const want = p.role === 'host' ? 'create' : 'join';
            if (!p.visits.some((r) => r.k === want)) problems.push(`${p.name}: no ${want} row inside Discord (${p.visits.map((r) => r.k).join(' ')})`);
        });
        if (!(assets[host.name] && assets[host.name].photo && assets[host.name].photo.length)) problems.push('the host never loaded the background photo inside Discord');
        // Off Discord: the inline beacon alone (no file), the same fields, fonts and icons from the site.
        if (plainVisits.filter((r) => r.k === 'view').length !== 1) problems.push(`off Discord: ${plainVisits.filter((r) => r.k === 'view').length} view rows, not 1`);
        plainVisits.forEach((r) => { if (Object.keys(r).sort().join(',') !== VISIT_FIELDS) problems.push(`off Discord: a visit row with other fields: ${Object.keys(r).join(',')}`); });
        if (plainAssets.beaconFile) problems.push('off Discord the page loaded visit-beacon.js too');
        if (plainAssets.marked) problems.push('off Discord the page is marked data-bs-discord');
        if (!plainAssets.iconsOn) problems.push('off Discord the icons\' stylesheet is not on');
        ['Luckiest Guy', 'Suez One', 'FontAwesome'].forEach((f) => { if (!(plainAssets.fonts || {})[f]) problems.push(`off Discord the font ${f} did not load`); });
        plainOut.filter((h) => /fonts\.googleapis|fonts\.gstatic|maxcdn/.test(h)).forEach((h) => problems.push(`off Discord a request went to ${h}`));
        unexpected.forEach((b) => problems.push(`${b.player}: the content policy refused ${b.blocked} (${b.directive}, ${b.source}:${b.line})`));
        players.forEach((p) => {
            Array.from(new Set(p.escaped)).forEach((u) => {
                if (!EXPECTED_BLOCKS.some((re) => re.test(u))) problems.push(`${p.name}: a request left the Activity's host: ${u}`);
            });
            p.problems.forEach((x) => problems.push(`${p.name}: ${x}`));
        });

        summary.problems = problems;
        console.log('\nRESULT ' + JSON.stringify(summary, null, 2));
        console.log(problems.length ? 'FAIL' : 'PASS');
        process.exitCode = problems.length ? 1 : 0;
    } finally {
        if (browser) await browser.close();
        if (proxy) proxy.server.close();
        if (site) site.close();
        stopEmulators(emulators);
    }
}

main().catch((e) => {
    console.error('FAIL', e.stack || e);
    process.exit(1);
});
