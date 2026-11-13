#!/usr/bin/env node
// Local run: a guest whose invite link opens in an empty browser (a chat app's) twice in one game, on the
// built client (game/dist) against the Firebase emulators, in headless Chromium. Each browser is its own
// empty profile, as a chat app's browser is.
//
//  1. The host creates a game and joins. Noa opens the invite link in an empty browser and joins: her
//     seat is marked as here (games/$pin/seen/$pid is true) under the database rules as they are.
//  2. That browser closes. The database marks her seat gone by itself (seen becomes a time).
//  3. She taps the same link again: a new empty browser, the same phone (browser string), the same name.
//     She gets her old seat back: still two seats, and her new browser holds the old player id.
//  4. Another Noa, on the same model of phone (the same browser string), joins while the first is here:
//     a seat of her own. Two players with one name stay two seats.
//
// Needs what emulator-game.js needs (Java, functions/ built, the root's npm ci). From the repository root:
//   node .github/smoke/emulator-rejoin.js [path to dist]
// Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const { chromium } = require('playwright');
const { serve, fileIn } = require('./smoke');
const { startEmulators, stopEmulators, db, seed, newPhone, visible, log, sleep, HOST, DB, PROJECT, DIST } = require('./emulator-game');

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';

async function until(what, fn, ms = 30000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const v = await fn().catch(() => undefined);
        if (v) return v;
        await sleep(300);
    }
    throw new Error(`timed out waiting for ${what}`);
}

/** Opens the invite link and joins under the phone's name; resolves when the lobby shows. */
async function joinByLink(phone, base, pin) {
    await phone.page.goto(`${base}/join-game/${pin}?via=link`);
    const input = phone.page.locator('input[name="nickname"]');
    await until('the join form', () => visible(input));
    await input.fill(phone.name);
    await phone.page.locator('form button[type="submit"]').first().click();
    await phone.page.waitForURL(/\/game-staging\//, { timeout: 30000 });
}

/** The player id this browser keeps (session.service.ts, BS_PLAYER). */
const storedPid = (phone) => phone.page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('BS_PLAYER')).pid; } catch (e) { return null; }
});

async function main() {
    if (!fileIn(DIST, '/index.html')) throw new Error(`No built game at ${DIST}`);
    const emulators = await startEmulators();
    const problems = [];
    const check = (ok, text) => { if (!ok) problems.push(text); };
    let browser;
    let server;
    try {
        await seed();
        server = await serve(DIST);
        const base = `http://${HOST}:${server.address().port}`;
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`] });

        const host = await newPhone(browser, base, 'Ana', 'host');
        await host.page.goto(`${base}/create-game`);
        await host.page.locator('input[name="locale"]').nth(0).check();
        await host.page.locator('input[name="length"]').first().check();
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
        const pin = new URL(host.page.url()).pathname.split('/').pop().toUpperCase();
        const input = host.page.locator('input[name="nickname"]');
        await until('the host join form', () => visible(input));
        await input.fill('Ana');
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/\/game-staging\//, { timeout: 30000 });
        log(`game ${pin}: the host is in`);

        // 1. Noa, from the invite link, in an empty browser.
        const first = await newPhone(browser, base, 'Noa', 'player', IPHONE);
        await joinByLink(first, base, pin);
        const pid = await storedPid(first);
        const seenFirst = await until('her seat marked as here', async () => (await db('GET', `games/${pin}/seen/${pid}`)) === true);
        check(seenFirst === true, 'the first seat was never marked as here');
        const agent = await db('GET', `games/${pin}/agents/${pid}`);
        check(agent === IPHONE, `the seat keeps the browser string: got ${JSON.stringify(agent)}`);
        log(`Noa joined as ${pid}; seat marked here`);

        // 2. The chat app's browser closes.
        await first.context.close();
        const goneAt = await until('the database to mark her seat gone', async () => {
            const v = await db('GET', `games/${pin}/seen/${pid}`);
            return typeof v === 'number' ? v : undefined;
        }, 90000);
        log(`her browser closed; the database marked the seat gone at ${goneAt}`);

        // 3. The same link again, in a new empty browser, same phone, same name.
        const again = await newPhone(browser, base, 'Noa', 'player', IPHONE);
        await joinByLink(again, base, pin);
        const pidAgain = await storedPid(again);
        const afterRejoin = await db('GET', `games/${pin}/players`);
        check(pidAgain === pid, `the rejoin got seat ${pidAgain}, not her old seat ${pid}`);
        check(Object.keys(afterRejoin || {}).length === 2, `${Object.keys(afterRejoin || {}).length} seats after the rejoin, not 2`);
        await until('her seat marked as here again', async () => (await db('GET', `games/${pin}/seen/${pid}`)) === true);
        log(`the same link again: seat ${pidAgain}, ${Object.keys(afterRejoin).length} seats`);

        // 4. Another Noa on the same model of phone, while the first is here.
        const other = await newPhone(browser, base, 'Noa', 'player', IPHONE);
        await joinByLink(other, base, pin);
        const pidOther = await storedPid(other);
        const afterOther = await db('GET', `games/${pin}/players`);
        check(pidOther && pidOther !== pid, `the second Noa got seat ${pidOther}, the first Noa's is ${pid}`);
        check(Object.keys(afterOther || {}).length === 3, `${Object.keys(afterOther || {}).length} seats with the second Noa, not 3`);
        log(`another Noa while the first is here: seat ${pidOther}, ${Object.keys(afterOther).length} seats`);

        [host, again, other].forEach((p) => p.problems.forEach((x) => problems.push(`${p.name}: ${x}`)));
        const summary = { pin, firstSeat: pid, rejoinSeat: pidAgain, otherNoaSeat: pidOther,
            seats: Object.values(afterOther).map((p) => p.nickname), problems };
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
