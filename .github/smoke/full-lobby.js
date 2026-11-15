#!/usr/bin/env node
// Local run: a full lobby whose host steps away (game/src/app/pages/game-staging/lobby-host.ts and
// functions/src/controllers/start.ts), in headless Chromium against the Firebase emulators.
//
// Lobbies of 9 in English and in Hebrew: 7 guests join, the host's page is hidden (as when the host
// goes to WhatsApp), the 8th guest joins. The guests must be told at once that the host stepped away,
// with no START; the host's tab title must count the friends waiting. The host comes back: a big START
// with "8 friends are waiting for you", and the guests' line goes back to the usual wait. The host
// steps away again: after 45 s every guest gets START and the "anyone can press START" line, a guest
// starts the game, all 9 phones leave the lobby, and the game says it was started by 'host-away'.
// A lobby of 3: the guests get the line and never START, however long the host is away, and the host
// who comes back gets no big panel and starts as before.
// A lobby of 5 that fills while the host is away (en-5-late, he-5-late): the host hides before anyone
// joins (gone to WhatsApp to send the link), three friends join, 50 s pass, and the fifth joins. The
// fifth must find no START: it shows only 45 s after the fifth joined, as the server counts (fullSince).
//
// The page is "hidden" by overriding document.hidden and firing visibilitychange: the page's timers
// keep running, as on an Android phone (an iPhone stops them; the away report is sent at once either way).
//
// Nothing reaches production: see emulator-game.js, whose emulators and phones this run uses.
// From the repository root, with game/ and functions/ built and the root's npm ci done:
//   node .github/smoke/full-lobby.js [path to dist]
// ONLY=en-9,he-9,en-3,en-5-late,he-5-late runs only those lobbies. SHOTS=<dir> saves screenshots.
// Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve, fileIn, HOST } = require('./smoke');
const emu = require('./emulator-game');

const { ROOT, DIST, startEmulators, stopEmulators, up, db, seed, newPhone, visible, sleep, log } = emu;
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const SHOTS = process.env.SHOTS || '';

const ts = require(path.join(ROOT, 'game', 'node_modules', 'typescript'));
function loadTs(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}
const lobbyHost = loadTs(path.join(ROOT, 'game', 'src', 'app', 'pages', 'game-staging', 'lobby-host.ts'));
const { HOST_AWAY_MS } = lobbyHost;

const NAMES = {
    en: ['Aviv', 'Ben', 'Cleo', 'Dov', 'Eli', 'Faye', 'Gil', 'Hila', 'Ido'],
    he: ['אביב', 'אביב זהבי', 'מיכל', 'עומר', 'נועה', 'יוסי', 'דנה', 'רון', 'שירה'],
};

async function shot(page, name) {
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }).catch(() => { });
}

async function until(fn, ms = 20000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (await fn().catch(() => false)) return true;
        await sleep(250);
    }
    return false;
}

/** The page goes to the background (another app) or comes back, as far as the page can tell. */
async function setHidden(page, hidden) {
    await page.evaluate((h) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
        document.dispatchEvent(new Event('visibilitychange'));
    }, hidden);
}

async function join(phone, base, pin, he) {
    await phone.page.goto(`${base}${he ? '/he' : ''}/join-game/${pin}?via=link`);
    const input = phone.page.locator('input[name="nickname"]');
    await input.waitFor({ timeout: 30000 });
    await input.fill(phone.name);
    await phone.page.locator('form button[type="submit"]').first().click();
    await phone.page.waitForURL(/\/game-staging\//, { timeout: 30000 });
}

const lineOf = (page) => page.locator('.lobby-message').innerText().then((t) => t.trim()).catch(() => '');
const startOf = (page) => page.locator('.game-header > button');

async function lobby(browser, base, { locale, size }, problems) {
    const he = locale === 'he';
    const tag = `${locale}-${size}`;
    const check = (ok, text) => { if (!ok) problems.push(`${tag}: ${text}`); return ok; };
    const strings = (view, n) => lobbyHost.lobbyText(view, n, locale).message;
    const names = NAMES[locale].slice(0, size);
    const hostName = names[0];
    const host = await newPhone(browser, base, hostName, 'host');
    const guests = [];
    for (const name of names.slice(1)) guests.push(await newPhone(browser, base, name, 'player'));
    const result = { tag };
    const away = strings({ canStart: false, wait: 'host', hostName, hostAway: hostName }, size);
    const open = strings({ canStart: true, wait: 'none', hostName: null, hostAwayOpen: hostName }, size);
    const waiting = strings({ canStart: false, wait: 'host', hostName }, size);

    try {
        await host.page.goto(`${base}/create-game`);
        await host.page.locator('input[name="locale"]').nth(he ? 1 : 0).check();
        await host.page.locator('input[name="length"]').first().check();
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
        const pin = new URL(host.page.url()).pathname.split('/').pop().toUpperCase();
        result.pin = pin;
        const input = host.page.locator('input[name="nickname"]');
        await input.waitFor({ timeout: 30000 });
        await input.fill(hostName);
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/\/game-staging\//, { timeout: 30000 });
        log(`${tag}: ${hostName} is in the lobby of ${pin}`);

        // All but the last guest join; the host's page is hidden; then the last guest joins.
        for (const g of guests.slice(0, -1)) await join(g, base, pin, he);
        const title = await host.page.title();
        await setHidden(host.page, true);
        const last = guests[guests.length - 1];
        await join(last, base, pin, he);
        check(await until(async () => (await db('GET', `games/${pin}/hostAwaySince`)) !== null, 5000), 'the server never heard the host was away');
        const seats = Object.keys((await db('GET', `games/${pin}/players`)) || {}).length;
        check(seats === size, `${seats} seats, not ${size}`);
        const told = await until(async () => (await Promise.all(guests.map((g) => lineOf(g.page)))).every((l) => l === away), 8000);
        check(told, `the guests are not told the host stepped away: "${await lineOf(guests[0].page)}"`);
        check(!(await visible(startOf(guests[0].page))), 'a guest has START the moment the host steps away');
        const tabTitle = await host.page.title();
        result.hiddenTitle = tabTitle;
        if (guests.length >= 1) check(tabTitle === lobbyHost.hiddenTitle(size, locale), `the hidden tab's title is "${tabTitle}"`);
        await shot(guests[0].page, `${tag}-1-guest-host-stepped-away`);
        await shot(last.page, `${tag}-1-last-guest-host-stepped-away`);

        // The host comes back after 20 s: the big START for a full lobby; the guests wait as usual.
        await sleep(20000);
        check(!(await visible(startOf(guests[1].page))), 'a guest has START 20 s after the host stepped away');
        await setHidden(host.page, false);
        check(await host.page.title() === title, `the tab's title is not given back: "${await host.page.title()}"`);
        const panel = host.page.locator('.start-panel');
        const wantPanel = size >= 5;
        if (wantPanel) {
            check(await until(() => visible(panel), 5000), 'no big START for the host back to a full lobby');
            const words = (await panel.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
            const p = lobbyHost.startPanel(size, locale);
            check(words.includes(p.line) && words.includes(p.button), `the big START says "${words}"`);
            const box = await panel.boundingBox();
            check(box && box.width >= 340, `the big START is ${box && box.width} px wide`);
            check((await lineOf(host.page)) === lobbyHost.lobbyText({ canStart: true, wait: 'none', isHost: true }, size, locale).message,
                `the host's line is "${await lineOf(host.page)}"`);
            // The hint says the count: no second count line under it.
            check(!(await visible(host.page.locator('.lobby-count'))), 'the host sees the count twice');
            await shot(host.page, `${tag}-2-host-back-big-start`);
        } else {
            await sleep(1500);
            check(!(await visible(panel)), 'a big START in a small lobby nobody joined while the host was away');
            await shot(host.page, `${tag}-2-host-back`);
        }
        check(await until(async () => (await db('GET', `games/${pin}/hostAwaySince`)) === null, 5000), 'the host is still away on the server');
        check(await until(async () => (await lineOf(guests[0].page)) === waiting, 8000), `the guests' line after the host is back: "${await lineOf(guests[0].page)}"`);

        // The host steps away again, for good.
        await setHidden(host.page, true);
        const hiddenAt = Date.now();
        check(await until(async () => (await lineOf(guests[0].page)) === away, 8000), 'the guests are not told the second time');
        if (size >= 5) {
            // Guests' lobbies look again every 5 s, so START shows within 45 to about 51 s.
            const opened = await until(async () => visible(startOf(guests[2].page)), HOST_AWAY_MS + 15000);
            const after = Date.now() - hiddenAt;
            result.startShownAfterMs = after;
            check(opened, 'no START for the guests 60 s after the host stepped away');
            check(after >= HOST_AWAY_MS - 1000, `START showed after only ${after} ms`);
            check((await lineOf(guests[2].page)) === open, `the guests' line once START is theirs: "${await lineOf(guests[2].page)}"`);
            await shot(guests[2].page, `${tag}-3-guest-anyone-can-start`);
            await startOf(guests[2].page).click();
            const left = await until(async () => (await Promise.all([host].concat(guests).map((p) => p.page.url()))).every((u) => !/game-staging/.test(u)), 20000);
            check(left, 'not every phone left the lobby after a guest pressed START');
            const startBy = await db('GET', `games/${pin}/startBy`);
            result.startBy = startBy;
            check(startBy === 'host-away', `startBy is ${startBy}`);
            await sleep(1500);
            await shot(guests[2].page, `${tag}-4-guest-game-started`);
            await shot(host.page, `${tag}-4-host-phone-game-started`);
        } else {
            await sleep(HOST_AWAY_MS + 8000);
            check(!(await visible(startOf(guests[0].page))), `a guest of a lobby of ${size} got START`);
            check((await lineOf(guests[0].page)) === away, `the line after 53 s: "${await lineOf(guests[0].page)}"`);
            await shot(guests[0].page, `${tag}-3-guest-still-waits`);
            await setHidden(host.page, false);
            await sleep(1500);
            check(!(await visible(host.page.locator('.start-panel'))), 'a big START in a lobby of 3');
            await startOf(host.page).click();
            check(await until(async () => !/game-staging/.test(guests[0].page.url()), 20000), 'the host could not start');
            result.startBy = await db('GET', `games/${pin}/startBy`);
            check(result.startBy === 'host', `startBy is ${result.startBy}`);
        }
    } catch (e) {
        problems.push(`${tag}: ${e.stack || e.message || e}`);
    }
    for (const p of [host].concat(guests)) {
        p.problems.forEach((x) => problems.push(`${tag} ${p.name}: ${x}`));
        await p.context.close().catch(() => { });
    }
    return result;
}

/** The host hides before the room is full; the fifth friend comes in long after: 45 s from the fifth. */
async function lateFifth(browser, base, { locale }, problems) {
    const he = locale === 'he';
    const tag = `${locale}-5-late`;
    const check = (ok, text) => { if (!ok) problems.push(`${tag}: ${text}`); return ok; };
    const strings = (view, n) => lobbyHost.lobbyText(view, n, locale).message;
    const names = NAMES[locale].slice(0, 5);
    const hostName = names[0];
    const host = await newPhone(browser, base, hostName, 'host');
    const guests = [];
    for (const name of names.slice(1)) guests.push(await newPhone(browser, base, name, 'player'));
    const result = { tag };
    const away = strings({ canStart: false, wait: 'host', hostName, hostAway: hostName }, 5);
    const open = strings({ canStart: true, wait: 'none', hostName: null, hostAwayOpen: hostName }, 5);
    try {
        await host.page.goto(`${base}/create-game`);
        await host.page.locator('input[name="locale"]').nth(he ? 1 : 0).check();
        await host.page.locator('input[name="length"]').first().check();
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
        const pin = new URL(host.page.url()).pathname.split('/').pop().toUpperCase();
        result.pin = pin;
        const input = host.page.locator('input[name="nickname"]');
        await input.waitFor({ timeout: 30000 });
        await input.fill(hostName);
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/\/game-staging\//, { timeout: 30000 });
        // Straight to WhatsApp to send the link, before anyone is in.
        await setHidden(host.page, true);
        const hiddenAt = Date.now();
        check(await until(async () => (await db('GET', `games/${pin}/hostAwaySince`)) !== null, 5000), 'the server never heard the host was away');
        for (const g of guests.slice(0, 3)) await join(g, base, pin, he);
        check((await db('GET', `games/${pin}/fullSince`)) === null, 'four players, and the lobby is called full');
        // Long past 45 s since the host hid.
        await sleep(Math.max(0, HOST_AWAY_MS + 5000 - (Date.now() - hiddenAt)));
        check(!(await visible(startOf(guests[0].page))), 'START in a lobby of 4');
        const fifth = guests[3];
        await join(fifth, base, pin, he);
        const fifthAt = Date.now();
        result.hostAwayBeforeFifthMs = fifthAt - hiddenAt;
        check(await until(async () => typeof (await db('GET', `games/${pin}/fullSince`)) === 'number', 5000), 'no fullSince after the fifth joined');
        // Guests' lobbies look again every 5 s: give them two looks, then START must still be the host's.
        await sleep(11000);
        for (const g of guests) check(!(await visible(startOf(g.page))), `${g.name} has START right after the fifth came in`);
        check((await lineOf(fifth.page)) === away, `the fifth friend's line: "${await lineOf(fifth.page)}"`);
        await shot(fifth.page, `${tag}-1-fifth-in-hang-on`);
        const opened = await until(async () => visible(startOf(fifth.page)), HOST_AWAY_MS + 15000);
        const after = Date.now() - fifthAt;
        result.startShownAfterFifthMs = after;
        check(opened, 'no START 60 s after the fifth came in');
        check(after >= HOST_AWAY_MS - 1000, `START showed ${after} ms after the fifth came in`);
        check((await lineOf(fifth.page)) === open, `the line once START is theirs: "${await lineOf(fifth.page)}"`);
        await shot(fifth.page, `${tag}-2-fifth-anyone-can-start`);
        await startOf(fifth.page).click();
        const left = await until(async () => (await Promise.all([host].concat(guests).map((p) => p.page.url()))).every((u) => !/game-staging/.test(u)), 20000);
        check(left, 'not every phone left the lobby after the fifth pressed START');
        result.startBy = await db('GET', `games/${pin}/startBy`);
        check(result.startBy === 'host-away', `startBy is ${result.startBy}`);
    } catch (e) {
        problems.push(`${tag}: ${e.stack || e.message || e}`);
    }
    for (const p of [host].concat(guests)) {
        p.problems.forEach((x) => problems.push(`${tag} ${p.name}: ${x}`));
        await p.context.close().catch(() => { });
    }
    return result;
}

async function main() {
    if (!fileIn(DIST, '/index.html')) throw new Error(`No built game at ${DIST}`);
    if (!fs.existsSync(path.join(ROOT, 'functions', 'dist', 'index.js'))) throw new Error('Build functions/ first: npm run build there');
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const emulators = await startEmulators();
    const problems = [];
    const results = [];
    let browser;
    let server;
    try {
        if (!(await up(`http://${emu.DB}/.json?ns=${emu.PROJECT}`))) throw new Error('no database emulator on :9000');
        await seed();
        server = await serve(DIST);
        const base = `http://${HOST}:${server.address().port}`;
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`] });
        const runs = [{ locale: 'en', size: 9 }, { locale: 'he', size: 9 }, { locale: 'en', size: 3 }]
            .filter((r) => !only || only.includes(`${r.locale}-${r.size}`));
        for (const run of runs) results.push(await lobby(browser, base, run, problems));
        for (const locale of ['en', 'he'].filter((l) => !only || only.includes(`${l}-5-late`))) {
            results.push(await lateFifth(browser, base, { locale }, problems));
        }
    } catch (e) {
        problems.push(e.stack || e.message || String(e));
    } finally {
        if (browser) await browser.close().catch(() => { });
        if (server) server.close();
        stopEmulators(emulators);
    }
    console.log(JSON.stringify({ results, problems }, null, 2));
    process.exit(problems.length ? 1 : 0);
}

main();
