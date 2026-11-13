#!/usr/bin/env node
// Local run: a guest whose invite link opens in an empty browser (a chat app's) twice in one game, on the
// built client (game/dist) against the Firebase emulators, in headless Chromium. Each browser is its own
// empty profile, as a chat app's browser is.
//
//  1. The host creates a game and joins. Noa opens the invite link in an empty browser and joins: her
//     seat is marked as here (games/$pin/seen/$pid is true) under the database rules as they are. A
//     signed-out write and another sign-in's write of her mark are refused, and a mark changed from
//     elsewhere while her page is here is set back to true by her page.
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

/** A new anonymous sign-in on the Auth emulator: its ID token. */
async function anonymousToken() {
    const res = await fetch(`http://${HOST}:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
    });
    const body = await res.json();
    if (!body.idToken) throw new Error(`no anonymous sign-in: ${JSON.stringify(body)}`);
    return body.idToken;
}

/** The uid inside an ID token. */
const tokenUid = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')).user_id;

/** Writes a seat's mark under the rules, as a phone would: signed out (token null) or with an ID token. */
async function markAs(pin, pid, value, token) {
    const res = await fetch(`http://${DB}/games/${pin}/seen/${pid}.json?ns=${PROJECT}${token ? `&auth=${token}` : ''}`, {
        method: 'PUT', body: JSON.stringify(value),
    });
    return res.status;
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

        // 1b. Only the sign-in that holds the seat may write or read its mark: a signed-out write and
        // another sign-in's write are refused, and her mark stays true.
        const signedOut = await markAs(pin, pid, 1, null);
        check(signedOut === 401 || signedOut === 403, `a signed-out write of her mark was not refused (${signedOut})`);
        const stranger = await anonymousToken();
        const otherWrite = await markAs(pin, pid, 1, stranger);
        check(otherWrite === 401 || otherWrite === 403, `another sign-in's write of her mark was not refused (${otherWrite})`);
        // The same sign-in may mark a seat it holds (so the refusal above is the rule, not a bad token).
        const own = await db('POST', `games/${pin}/players`, { nickname: 'probe', score: 0, uid: tokenUid(stranger) });
        const ownWrite = await markAs(pin, own.name, true, stranger);
        check(ownWrite === 200, `a sign-in could not mark its own seat (${ownWrite})`);
        await db('DELETE', `games/${pin}/players/${own.name}`);
        await db('DELETE', `games/${pin}/seen/${own.name}`);
        const otherRead = await fetch(`http://${DB}/games/${pin}/seen/${pid}.json?ns=${PROJECT}&auth=${stranger}`);
        check(otherRead.status === 401 || otherRead.status === 403, `another sign-in could read her mark (${otherRead.status})`);
        check((await db('GET', `games/${pin}/seen/${pid}`)) === true, 'her mark changed after the refused writes');
        // A mark changed from elsewhere while her page is here (here by the owner, past every rule) is set back.
        await db('PUT', `games/${pin}/seen/${pid}`, 1);
        await until('her page to set her mark back to true', async () => (await db('GET', `games/${pin}/seen/${pid}`)) === true, 15000)
            .catch(() => problems.push('her page did not set her mark back to true'));
        log(`signed-out write: ${signedOut}, another sign-in's write: ${otherWrite}, its own seat: ${ownWrite}, read: ${otherRead.status}; her page set the mark back`);

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
