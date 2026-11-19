#!/usr/bin/env node
// Local run: a lobby's own address (/game-staging/PIN) opened by a browser with no seat in it, on the
// built client (game/dist) in headless Chromium against the Firebase emulators, with the phones and the
// emulators of emulator-game.js (game/src/app/services/lobby-door.ts). A host creates a test game from a
// ?via=test link and joins it; then:
//   1. A first-time phone, 360 x 640, opens the lobby's address: it lands on the lobby's join form
//      (/join-game/PIN?via=lobby-address, under /he for a Hebrew game) on the nickname, joins, is in the
//      lobby, and the join is sent with via "lobby-address".
//   2. The host reloads the lobby: it stays in the lobby, its seat and host controls as before.
//   3. The guest of step 1 reloads the lobby: it stays in the lobby.
//   4. A phone that played an earlier game (a saved player with no seat here) opens the address: the join form.
//   5. A first-time phone opens the address of a PIN with no game: the home page, as before.
//
// Nothing reaches production (see emulator-game.js). From the repository root, with functions/ and
// game/ built:
//   node .github/smoke/emulator-lobby-address.js [path to dist] [--locale en|he]
// SHOTS=<dir> saves a screenshot of each step. BEFORE=1 only takes the screenshots (for a build
// without the change). Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const path = require('path');
const { chromium } = require('playwright');
const { serve } = require('./smoke');
const { LOCALE, HOST, DB, PROJECT, DIST, log, sleep, up, startEmulators, stopEmulators, db, seed, newPhone, visible } = require('./emulator-game');

const he = LOCALE === 'he';
const BEFORE = !!process.env.BEFORE;
const WORDS = he ? { host: 'דנה', guest: 'נועה', old: 'גיל' } : { host: 'Dana', guest: 'Noa', old: 'Gil' };
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

async function main() {
    const emulators = await startEmulators();
    const problems = [];
    const steps = [];
    const summary = { locale: LOCALE, before: BEFORE };
    const check = (ok, what) => {
        if (BEFORE) {
            steps.push(`seen ${what}`);
            return;
        }
        steps.push(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
        log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
        if (!ok) problems.push(what);
    };
    let browser;
    let server;
    try {
        if (!(await up(`http://${DB}/.json?ns=${PROJECT}`))) throw new Error('no database emulator on :9000');
        await seed();
        server = await serve(DIST);
        const base = `http://${HOST}:${server.address().port}`;
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`] });
        const lang = he ? '/he' : '';

        const phone = async (name, size) => {
            const p = await newPhone(browser, base, name, 'player');
            p.joins = [];
            await p.page.setViewportSize(size);
            await p.context.addInitScript((ua) => Object.defineProperty(navigator, 'userAgent', { get: () => ua }), PHONE_UA);
            p.page.on('request', (req) => {
                if (/\/onJoinGame/.test(req.url()) && req.method() === 'POST') {
                    try { p.joins.push(JSON.parse(req.postData() || '{}')); } catch (e) { /* not JSON */ }
                }
            });
            return p;
        };
        const shot = async (p, name) => {
            if (process.env.SHOTS) {
                await sleep(800);
                await p.page.screenshot({ path: path.join(process.env.SHOTS, `${BEFORE ? 'before' : 'after'}-${LOCALE}-${name}.png`) }).catch(() => { });
            }
        };
        const until = async (what, fn, ms = 20000) => {
            const end = Date.now() + ms;
            while (Date.now() < end) {
                const v = await fn().catch(() => false);
                if (v) return v;
                await sleep(250);
            }
            check(false, `${what} (waited ${ms / 1000} s)`);
            return null;
        };
        const where = (p) => { const u = new URL(p.page.url()); return u.pathname + u.search; };
        const settle = async (p, ms = 6000) => {
            // Wait until the address stops changing.
            let last = '';
            const end = Date.now() + ms;
            while (Date.now() < end) {
                await sleep(500);
                const now = p.page.url();
                if (now === last) break;
                last = now;
            }
            await sleep(500);
        };

        // The host opens the site from a test link, creates the game and joins it: a test game.
        const host = await phone('Host', { width: 360, height: 640 });
        await host.page.goto(`${base}/create-game?via=test`);
        await host.page.locator('input[name="locale"]').nth(he ? 1 : 0).check();
        await host.page.locator('input[name="length"]').first().check();
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
        const pin = new URL(host.page.url()).pathname.split('/').pop().toUpperCase();
        await host.page.locator('input[name="nickname"]').fill(WORDS.host);
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/\/game-staging\//, { timeout: 30000 });
        if ((await db('GET', `games/${pin}/campaign`)) !== 'test') problems.push(`the game ${pin} is not a test game`);
        summary.pin = pin;
        await settle(host);
        await shot(host, '0-host-lobby');

        // 1. A first-time phone opens the lobby's own address (with the test tag, so it stays out of the counts).
        const guest = await phone(WORDS.guest, { width: 360, height: 640 });
        await guest.page.goto(`${base}/game-staging/${pin}?via=test`);
        await settle(guest);
        summary.firstTimeLands = where(guest);
        await shot(guest, '1-first-time-phone-opens-lobby-address');
        check(summary.firstTimeLands === `${lang}/join-game/${pin}?via=lobby-address`, `a first-time phone lands on ${lang}/join-game/${pin}?via=lobby-address (${summary.firstTimeLands})`);
        const nick = guest.page.locator('input[name="nickname"]');
        if (!BEFORE && await until('the join form opens on the nickname', () => visible(nick))) {
            await nick.fill(WORDS.guest);
            await shot(guest, '1b-nickname-typed');
            await guest.page.locator('form button[type="submit"]').first().click();
            await guest.page.waitForURL(/\/game-staging\//, { timeout: 30000 }).catch(() => { });
            check(new URL(guest.page.url()).pathname === `/game-staging/${pin}`, 'the guest is in the lobby');
            await until('the join is sent with via "lobby-address"', async () => guest.joins.some((j) => j.via === 'lobby-address'), 10000);
            summary.guestJoinVia = guest.joins.map((j) => j.via);
            const seats = await db('GET', `games/${pin}/players`);
            check(Object.values(seats || {}).some((s) => (s.nickname || '').toLowerCase() === WORDS.guest.toLowerCase()), `${WORDS.guest} has a seat in ${pin}`);
            await settle(guest);
            await shot(guest, '1c-guest-in-lobby');

            // 3. The guest reloads the lobby: stays.
            await guest.page.reload();
            await settle(guest);
            check(where(guest) === `/game-staging/${pin}`, `the seated guest's reload stays in the lobby (${where(guest)})`);
        }

        // 2. The host reloads the lobby: stays, as before.
        await host.page.reload();
        await settle(host);
        summary.hostReload = where(host);
        check(new URL(host.page.url()).pathname === `/game-staging/${pin}`, `the host's reload stays in the lobby (${summary.hostReload})`);
        await shot(host, '2-host-reloads-lobby');

        // 4. A phone that played an earlier game: its saved player has no seat here.
        const old = await phone(WORDS.old, { width: 360, height: 640 });
        await old.context.addInitScript((nick) => {
            try { localStorage.setItem('BS_PLAYER', JSON.stringify({ nickname: nick, pid: '-OldGamePid123', uid: 'old-uid' })); } catch (e) { }
        }, WORDS.old.toLowerCase());
        await old.page.goto(`${base}/game-staging/${pin}?via=test`);
        await settle(old);
        summary.oldPlayerLands = where(old);
        await shot(old, '4-old-player-opens-lobby-address');
        check(summary.oldPlayerLands === `${lang}/join-game/${pin}?via=lobby-address`, `a player of an earlier game lands on the join form (${summary.oldPlayerLands})`);

        // 5. A PIN with no game: home, as before.
        const lost = await phone('Lost', { width: 360, height: 640 });
        await lost.page.goto(`${base}/game-staging/QZQZ?via=test`);
        await settle(lost);
        summary.unknownPinLands = where(lost);
        await shot(lost, '5-unknown-pin');
        check(/^\/(m|he)?(\?|$)/.test(summary.unknownPinLands) || summary.unknownPinLands.startsWith('/m'), `a PIN with no game goes home, as before (${summary.unknownPinLands})`);

        for (const p of [host, guest, old, lost]) {
            const crash = p.problems.filter((x) => !/Failed to load|ERR_/.test(x));
            check(crash.length === 0, `${p.name} shows no error${crash.length ? ': ' + crash.join('; ') : ''}`);
        }
    } catch (e) {
        problems.push(`the run stopped: ${e && e.stack || e}`);
    } finally {
        if (browser) await browser.close();
        if (server) server.close();
        stopEmulators(emulators);
    }
    summary.steps = steps;
    summary.problems = problems;
    console.log(JSON.stringify(summary, null, 2));
    process.exit(problems.length ? 1 : 0);
}

main();
