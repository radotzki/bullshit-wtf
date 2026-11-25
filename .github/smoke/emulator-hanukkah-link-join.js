#!/usr/bin/env node
// Local run: the Hanukkah night link in a browser that didn't play, and the join page of a Hanukkah game
// (game/src/app/pages/join-game), in headless Chromium against the Firebase emulators, in Hebrew.
//   1. A Hebrew Hanukkah-pack test game (?via=test): the guest's nickname page says "🕎 משחק חנוכה", and the
//      host's WhatsApp invite says "משחק חנוכה". Two phones play it to the final scoreboard.
//   2. The next evening (Saturday 5 December 2026, 20:30 Israel time), the link SAME TABLE TOMORROW saves
//      (?via=hanukkah-night-2) opens on a phone that didn't play (360 px): it waits for the table, and is
//      not told "you missed it".
//   3. A player of the game opens the same link and presses PLAY AGAIN, SAME TABLE: the waiting phone, with
//      no reload, offers JOIN THEM, and joins that lobby.
//   4. The player starts that game. A second phone that didn't play (320 px) opens the link: JOIN NOW, into
//      the game under way.
// Nothing reaches production: see emulator-game.js, whose emulators and phones this run uses.
// From the repository root, with game/ and functions/ built and the root's npm ci done:
//   node .github/smoke/emulator-hanukkah-link-join.js [path to dist]
// SHOTS=<dir> saves the phones' screenshots. Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { serve, fileIn, HOST } = require('./smoke');
const emu = require('./emulator-game');

const { ROOT, DIST, startEmulators, stopEmulators, up, db, seed, newPhone, visible, sleep, log, act } = emu;
const SHOTS = process.env.SHOTS || '';
const GAME_TIMEOUT_MS = Number(process.env.GAME_MINUTES || 8) * 60 * 1000;
const ZONE = 'Asia/Jerusalem';
const IL = (day, hm) => Date.parse(`${day}T${hm}:00+02:00`);
const screenOf = (page) => new URL(page.url()).pathname.replace(/^\/he(?=\/|$)/, '').split('/');

async function clockForNewPages(context, at) {
    await context.addInitScript((target) => {
        const Real = Date;
        const off = target - Real.now();
        class Shifted extends Real {
            constructor(...a) { if (a.length) super(...a); else super(Real.now() + off); }
            static now() { return Real.now() + off; }
        }
        window.Date = Shifted;
    }, at);
}

async function waitFor(what, check, problems, ms = 20000) {
    const until = Date.now() + ms;
    let last;
    while (Date.now() < until) {
        try {
            last = await check();
            if (last) return last;
        } catch (e) { last = e.message; }
        await sleep(300);
    }
    problems.push(`${what} (waited ${ms / 1000} s; last: ${JSON.stringify(last)})`);
    return null;
}

async function shot(page, name) {
    if (!SHOTS) return;
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true }).catch(() => { });
}

const text = async (page, sel) => ((await page.locator(sel).first().textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();

/** No sideways scroll: the page is no wider than the phone. */
const fits = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

function sharesOf(pin) {
    const files = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith('bs-emulators-'))
        .map((d) => path.join(os.tmpdir(), d, 'emulators.log')).filter((f) => fs.existsSync(f));
    const file = files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    if (!file) return [];
    const rows = [];
    const re = /Insert to BigQuery, table: 'shares', data: (\{.*?\})\s*$/gm;
    const all = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = re.exec(all))) {
        try {
            const row = JSON.parse(m[1]);
            if (row.crew_id === pin) rows.push(`${row.content_type}/${row.method}`);
        } catch (e) { /* a cut line */ }
    }
    return rows;
}

async function play(phones, game, problems) {
    const deadline = Date.now() + GAME_TIMEOUT_MS;
    const there = (p) => { const s = screenOf(p.page); return s[1] === 'score-board-final' && (s[2] || '').toUpperCase() === game.pin; };
    while (Date.now() < deadline && !phones.every(there)) {
        if (!game.everyoneIn) {
            const players = await db('GET', `games/${game.pin}/players`);
            game.everyoneIn = !!players && Object.keys(players).length === phones.length && phones.every((p) => p.joined);
        }
        await Promise.all(phones.filter((p) => !there(p)).map((p) => act(p, game).catch(() => { })));
        await sleep(400);
    }
    if (!phones.every(there)) problems.push(`game ${game.pin}: not every phone reached its final scoreboard`);
    await sleep(3000);
}

/** A phone that never played this game: its own browser, Hebrew, the next evening's clock, `width` px wide. */
async function stranger(browser, base, name, width, at) {
    const p = await newPhone(browser, base, name, 'player');
    await p.page.setViewportSize({ width, height: 700 });
    await clockForNewPages(p.context, at);
    await p.context.addInitScript(() => { try { localStorage.setItem('BS_LANG', 'he'); } catch (e) { } });
    return p;
}

async function run(base) {
    const problems = [];
    const check = (ok, what) => { if (!ok) problems.push(what); return ok; };
    const result = {};
    const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`] });
    try {
        const host = await newPhone(browser, base, 'דנה', 'host');
        const guest = await newPhone(browser, base, 'יוסי', 'player');
        await guest.page.setViewportSize({ width: 360, height: 700 });
        await host.page.goto(`${base}/create-game?via=test&pack=hanukkah`);
        await host.page.locator('input[name="locale"]').nth(1).check();
        await host.page.locator('input[name="length"]').first().check();
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
        const game = { pin: new URL(host.page.url()).pathname.split('/').pop().toUpperCase() };
        const g0 = await db('GET', `games/${game.pin}`);
        result.pin = game.pin;
        result.pack = g0 && g0.pack;
        check(result.pack === 'hanukkah', `the game's pack is ${JSON.stringify(result.pack)}`);
        log(`game ${game.pin} created (a test game, pack ${result.pack})`);
        const link = `${base}/he/join-game/${game.pin}`;

        // 1. The guest's nickname page, from the family chat's link, and the host's WhatsApp text.
        await guest.page.goto(link);
        const line = await waitFor('the nickname page has no Hanukkah line', async () => (await visible(guest.page.locator('.pack-game-title'))) && text(guest.page, '.pack-game-title'), problems);
        result.nicknameLine = line;
        check(line === '🕎 משחק חנוכה', `the nickname page says ${JSON.stringify(line)}`);
        result.nicknameHow = await text(guest.page, '.pack-game-how');
        check(await fits(guest.page), 'the nickname page scrolls sideways at 360 px');
        await shot(guest.page, 'he-360-join-page-hanukkah-game');
        // The host's lobby: the invite's WhatsApp link carries the text.
        await host.page.locator('input[name="nickname"]').fill(host.name);
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/game-staging/, { timeout: 20000 });
        const wa = await waitFor('the lobby has no WhatsApp link', async () => {
            const hrefs = await host.page.locator('a[href*="whatsapp"], a[href*="wa.me"]').evaluateAll((as) => as.map((a) => a.href));
            return hrefs.find((h) => /%D7%97%D7%A0%D7%95%D7%9B%D7%94|חנוכה/.test(h)) || (hrefs.length ? `none says Hanukkah: ${hrefs[0]}` : null);
        }, problems);
        result.whatsapp = wa ? decodeURIComponent(wa.replace(/\+/g, ' ')).slice(0, 200) : null;
        check(result.whatsapp && result.whatsapp.indexOf('בואו לשחק איתי בולשיט, משחק חנוכה!') >= 0, `the invite text: ${result.whatsapp}`);
        host.joined = true;
        await play([host, guest], game, problems);

        // 2. The next evening: a phone that didn't play opens the saved link.
        await db('PUT', `games/${game.pin}/campaign`, null);
        const at = IL('2026-12-05', '20:30');
        const a = await stranger(browser, base, 'סבתא', 360, at);
        await a.page.goto(`${link}?via=hanukkah-night-2`);
        await waitFor('the link shows no recap', () => visible(a.page.locator('.night-after')), problems);
        const waiting = await waitFor('the stranger is not waiting for the table', () => visible(a.page.locator('.recap-hanukkah-wait')), problems);
        result.wait = { title: await text(a.page, '.recap-hanukkah-wait .recap-ask-title'), text: await text(a.page, '.recap-hanukkah-wait .recap-ask-text') };
        check(waiting && !(await visible(a.page.locator('.recap-create.is-primary'))), 'the "you missed it" ask still shows');
        check((await a.page.content()).indexOf('פספסתם') < 0, 'the page still says "you missed it"');
        check(await fits(a.page), 'the waiting page scrolls sideways at 360 px');
        await shot(a.page, 'he-360-link-waits-for-table');

        // 3. A player opens the link and opens the table; the waiting phone offers JOIN THEM by itself.
        await clockForNewPages(guest.context, at);
        const gp = await guest.context.newPage();
        await gp.setViewportSize({ width: 360, height: 700 });
        await gp.goto(`${link}?via=hanukkah-night-2`);
        await waitFor('the player has no PLAY AGAIN, SAME TABLE', () => visible(gp.locator('.night-after .recap-again')), problems);
        await gp.locator('.night-after .recap-again').first().click();
        const lobbyPin = await waitFor('PLAY AGAIN, SAME TABLE opened no lobby', async () => {
            const s = screenOf(gp); return s[1] === 'game-staging' ? (s[2] || '').toUpperCase() : null;
        }, problems);
        result.lobby = lobbyPin;
        const joinThem = await waitFor('the waiting phone offers no JOIN THEM after the table opened', () => visible(a.page.locator('.recap-join-them')), problems, 30000);
        if (joinThem) {
            await shot(a.page, 'he-360-link-table-open-join-them');
            await a.page.locator('.recap-join-them').click();
            await waitFor('JOIN THEM led to no nickname box', () => visible(a.page.locator('input[name="nickname"]')), problems);
            check(screenOf(a.page)[2] && screenOf(a.page)[2].toUpperCase() === lobbyPin, `JOIN THEM went to ${a.page.url()}`);
            await waitFor('the lobby\'s nickname page has no Hanukkah line', () => visible(a.page.locator('.pack-game-title')), problems);
            await a.page.locator('input[name="nickname"]').fill(a.name);
            await a.page.locator('form button[type="submit"]').first().click();
            await waitFor('the stranger is not in the lobby', () => screenOf(a.page)[1] === 'game-staging', problems);
        }

        // 4. The player starts that game; a second stranger (320 px) gets JOIN NOW.
        const table = { pin: lobbyPin, everyoneIn: true };
        const starter = { name: 'יוסי', role: 'host', page: gp, lies: [], picks: [] };
        await waitFor('the table\'s game did not start', async () => {
            await act(starter, table).catch(() => { });
            const st = await db('GET', `games/${lobbyPin}/state`);
            return st && st.id !== 1 ? st.id : null;
        }, problems, 30000);
        const b = await stranger(browser, base, 'סבא', 320, at);
        await b.page.goto(`${link}?via=hanukkah-night-2`);
        const joinNow = await waitFor('the second stranger has no JOIN NOW while the table plays', () => visible(b.page.locator('.recap-join-now')), problems, 30000);
        result.playing = { title: await text(b.page, '.recap-hanukkah-playing .recap-ask-title'), text: await text(b.page, '.recap-hanukkah-playing .recap-ask-text') };
        check(await fits(b.page), 'the JOIN NOW page scrolls sideways at 320 px');
        await shot(b.page, 'he-320-link-table-playing-join-now');
        if (joinNow) {
            await b.page.locator('.recap-join-now').click();
            await waitFor('JOIN NOW led to no nickname box', () => visible(b.page.locator('input[name="nickname"]')), problems);
            await waitFor('the game under way\'s nickname page has no Hanukkah line', () => visible(b.page.locator('.pack-game-title')), problems);
            check(await fits(b.page), 'the nickname page scrolls sideways at 320 px');
            await shot(b.page, 'he-320-join-page-game-under-way');
            await b.page.locator('input[name="nickname"]').fill(b.name);
            await b.page.locator('form button[type="submit"]').first().click();
            const where = await waitFor('the second stranger did not get into the game', () => {
                const s = screenOf(b.page)[1]; return s !== 'join-game' ? s : null;
            }, problems);
            result.joinedTo = where;
            const players = await db('GET', `games/${lobbyPin}/players`);
            result.tablePlayers = Object.values(players || {}).map((p) => p.nickname);
            check(result.tablePlayers.some((n) => /סבא/.test(n)), `the table's players: ${JSON.stringify(result.tablePlayers)}`);
        }
        await sleep(3000);
        result.rows = sharesOf(game.pin).sort();
        check(result.rows.indexOf('night-after/join-them') >= 0 && result.rows.indexOf('night-after/join-playing') >= 0,
            `rows ${JSON.stringify(result.rows)}`);
        for (const p of [host, guest, a, b]) (p.problems || []).forEach((x) => problems.push(`${p.name}: ${x}`));
    } finally {
        await browser.close().catch(() => { });
    }
    result.problems = problems;
    return result;
}

async function main() {
    if (!fileIn(DIST, '/index.html')) throw new Error(`No built game at ${DIST}`);
    if (!fs.existsSync(path.join(ROOT, 'functions', 'dist', 'index.js'))) throw new Error('Build functions/ first: npm run build there');
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    process.env.TZ = ZONE;
    const emulators = await startEmulators();
    let server;
    let result;
    try {
        if (!(await up(`http://${HOST}:9000/.json?ns=${emu.PROJECT}`))) throw new Error('no database emulator on :9000');
        await seed();
        // The real Hanukkah pack, so the game is a pack game.
        const pack = JSON.parse(fs.readFileSync(path.join(ROOT, 'functions', 'data', 'hanukkah-questions.json'), 'utf8'));
        for (const id of Object.keys(pack)) await db('PUT', `questions/${id}`, pack[id]);
        server = await serve(DIST);
        result = await run(`http://${HOST}:${server.address().port}`).catch((e) => ({ problems: [`${e.stack || e}`] }));
    } finally {
        if (server) server.close();
        stopEmulators(emulators);
    }
    console.log('\nRESULT ' + JSON.stringify(result, null, 2));
    console.log(result.problems.length ? 'FAIL' : 'PASS');
    process.exitCode = result.problems.length ? 1 : 0;
}

main().catch((e) => {
    console.error('FAIL', e.stack || e);
    process.exit(1);
});
