#!/usr/bin/env node
// Local run: THE CODE BOX on the home page ("Got a code? [ ____ ] Join") and the facts line under the
// pitch, on the built client (game/dist) in headless Chromium against the Firebase emulators, with the
// phones and the emulators of emulator-game.js. A host creates a test game (from a ?via=test link);
// then first-time visitors open the home from a ?via=test link and use the box.
//
// What it walks through, each step checked on the page:
//   1. A first-time phone, 360 x 640: the code box is at the top, the facts line under the pitch, and
//      Create leads the menu, whole on the first screen.
//   2. Join with an empty box: a line under the box, the phone stays home.
//   3. A wrong PIN: the PIN page's own words under the box, the phone stays home.
//   4. The host's PIN typed in lower case: the PIN's join page opens on the nickname, with ?via=home
//      (under /he for the Hebrew home), the guest joins, and the join is sent with via "home".
//   5. A 390 x 844 phone: the same first screen, for the screenshots.
//   6. The computer home, 1280 x 720 and 1920 x 1080: the box above the pitch, the facts line, the big
//      Host button still on the first screen; the PIN typed with Enter joins the same way, and the PIN
//      typed on a Hebrew keyboard (in Hebrew letters) opens the same join page, from the home's box
//      and from the PIN page.
//
// Nothing reaches production (see emulator-game.js). From the repository root, with functions/ and
// game/ built:
//   node .github/smoke/emulator-home-code.js [path to dist] [--locale en|he]
// SHOTS=<dir> saves a screenshot of each step. Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const path = require('path');
const { chromium } = require('playwright');
const { serve } = require('./smoke');
const { LOCALE, HOST, DB, PROJECT, DIST, log, sleep, up, startEmulators, stopEmulators, db, seed, newPhone, visible } = require('./emulator-game');

const he = LOCALE === 'he';
const WORDS = he
    ? { ask: 'יש לכם קוד?', facts: 'חינם · בלי אפליקציה · 2 עד 12 שחקנים, כל אחד מהטלפון שלו', wrong: 'קוד המשחק שגוי', empty: 'הקלידו את קוד המשחק', guest: 'נועה', computer: 'גיל' }
    : { ask: 'Got a code?', facts: 'Free · no app · 2 to 12 players, each on their own phone', wrong: 'Wrong game PIN', empty: 'Type the game PIN', guest: 'Noa', computer: 'Gil' };
// What each English letter key types on the standard Israeli keyboard.
const ISRAELI_KEYS = { Q: '/', W: '\'', E: 'ק', R: 'ר', T: 'א', Y: 'ט', U: 'ו', I: 'ן', O: 'ם', P: 'פ', A: 'ש', S: 'ד', D: 'ג', F: 'כ', G: 'ע', H: 'י', J: 'ח', K: 'ל', L: 'ך', Z: 'ז', X: 'ס', C: 'ב', V: 'ה', B: 'נ', N: 'מ', M: 'צ' };
const hebrewKeys = (pin) => pin.split('').map((ch) => ISRAELI_KEYS[ch]).join('');
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

async function main() {
    const emulators = await startEmulators();
    const problems = [];
    const steps = [];
    const summary = { locale: LOCALE };
    const check = (ok, what) => {
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
        const home = `${base}${he ? '/he' : '/'}?via=test`;

        /** A phone (or computer) whose join counts are caught on their way to the functions. */
        const device = async (name, size, mobile) => {
            const p = await newPhone(browser, base, name, mobile ? 'player' : 'screen');
            p.joins = [];
            await p.page.setViewportSize(size);
            if (mobile) {
                // The home sends a phone to /m by its user agent (landing.component.ts).
                await p.context.addInitScript((ua) => Object.defineProperty(navigator, 'userAgent', { get: () => ua }), PHONE_UA);
            }
            p.page.on('request', (req) => {
                if (/\/onJoinGame/.test(req.url()) && req.method() === 'POST') {
                    try { p.joins.push(JSON.parse(req.postData() || '{}')); } catch (e) { /* not JSON */ }
                }
            });
            return p;
        };
        const shot = async (p, name) => {
            if (process.env.SHOTS) await p.page.screenshot({ path: path.join(process.env.SHOTS, `${LOCALE}-${name}.png`) }).catch(() => { });
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
        const box = (p) => p.page.locator('form.code-box');
        const text = (p, sel) => p.page.locator(sel).first().innerText().catch(() => '');

        // The host opens the site from a test link and creates the game in that tab: a test game.
        const host = await device('Host', { width: 390, height: 844 }, true);
        await host.page.goto(`${base}/create-game?via=test`);
        await host.page.locator('input[name="locale"]').nth(he ? 1 : 0).check();
        await host.page.locator('input[name="length"]').first().check();
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
        const pin = new URL(host.page.url()).pathname.split('/').pop().toUpperCase();
        await host.page.locator('input[name="nickname"]').fill(he ? 'דנה' : 'Dana');
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/\/game-staging\//, { timeout: 30000 });
        check((await db('GET', `games/${pin}/campaign`)) === 'test', `the game ${pin} is a test game, in ${LOCALE}`);
        summary.pin = pin;

        // 1. A first-time phone, 360 x 640.
        const small = await device(WORDS.guest, { width: 360, height: 640 }, true);
        await small.page.goto(home);
        await until('the phone home opens with the code box', () => visible(box(small)));
        check(/\/m$/.test(new URL(small.page.url()).pathname), `the phone lands on the phone home (${new URL(small.page.url()).pathname})`);
        check((await text(small, '.code-ask')).trim() === WORDS.ask, `the box asks "${WORDS.ask}"`);
        check((await text(small, '.front-door .facts')).replace(/\u00a0/g, ' ').trim() === WORDS.facts, 'the facts line is under the pitch');
        const layout = await small.page.evaluate(() => {
            const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; };
            const buttons = Array.from(document.querySelectorAll('.home .menu-button')).map((b) => b.className);
            return { box: r('form.code-box'), pitch: r('.front-door .pitch'), facts: r('.front-door .facts'), create: r('.menu-button.create-game'), join: r('.menu-button.join-game'), buttons, height: window.innerHeight, dir: document.querySelector('.home').getAttribute('dir') };
        });
        summary.small = layout;
        check(layout.box && layout.pitch && layout.box.bottom <= layout.pitch.top, 'the code box sits above the pitch');
        check(layout.facts && layout.pitch && layout.facts.top >= layout.pitch.bottom, 'the facts line sits under the pitch');
        check(/create-game/.test(layout.buttons[0] || ''), 'Create leads the menu for a visitor with no code');
        check(layout.create && layout.create.bottom <= layout.height, `Create is whole on the 640 px screen (its foot at ${layout.create && Math.round(layout.create.bottom)} px)`);
        check(layout.dir === (he ? 'rtl' : 'ltr'), `the home reads ${he ? 'right to left' : 'left to right'}`);
        await shot(small, 'phone-360x640-first-screen');

        // 2. An empty box.
        await small.page.locator('.code-join').click();
        await until('an empty box says what to type', async () => (await text(small, '.code-error')).includes(WORDS.empty));
        check(/\/m$/.test(new URL(small.page.url()).pathname), 'an empty box stays home');
        await shot(small, 'phone-360x640-empty');

        // 3. A wrong PIN.
        await small.page.locator('.code-input').fill('qzqzqz');
        await small.page.locator('.code-join').click();
        await until('a wrong PIN is said under the box', async () => (await text(small, '.code-error')).includes(WORDS.wrong));
        check(/\/m$/.test(new URL(small.page.url()).pathname), 'a wrong PIN stays home');
        await shot(small, 'phone-360x640-wrong-pin');

        // 4. The host's PIN, typed in lower case.
        await small.page.locator('.code-input').fill(pin.toLowerCase());
        const caps = await small.page.locator('.code-input').evaluate((el) => getComputedStyle(el).textTransform);
        check(caps === 'uppercase', 'the box shows the PIN in capitals');
        await shot(small, 'phone-360x640-typed');
        await small.page.locator('.code-join').click();
        await small.page.waitForURL(/\/join-game\/[A-Z]+\?via=home$/, { timeout: 30000 }).catch(() => { });
        const joinUrl = new URL(small.page.url());
        summary.phoneJoinPage = joinUrl.pathname + joinUrl.search;
        check(joinUrl.pathname === `${lang}/join-game/${pin}` && joinUrl.search === '?via=home', `the box opens ${lang}/join-game/${pin}?via=home (${summary.phoneJoinPage})`);
        const nick = small.page.locator('input[name="nickname"]');
        await until('the join page opens on the nickname', () => visible(nick));
        await shot(small, 'phone-360x640-nickname');
        await nick.fill(WORDS.guest);
        await small.page.locator('form button[type="submit"]').first().click();
        await small.page.waitForURL(/\/game-staging\//, { timeout: 30000 }).catch(() => { });
        check(/\/game-staging\//.test(small.page.url()), 'the guest is in the lobby');
        await until('the join is sent with via "home"', async () => small.joins.some((j) => j.via === 'home'), 10000);
        summary.phoneJoinVia = small.joins.map((j) => j.via);
        const seats = await db('GET', `games/${pin}/players`);
        check(Object.values(seats || {}).some((s) => (s.nickname || '').toLowerCase() === WORDS.guest.toLowerCase()), `${WORDS.guest} has a seat in ${pin}`);

        // 5. A 390 x 844 phone, for the screenshots.
        const tall = await device('Tall', { width: 390, height: 844 }, true);
        await tall.page.goto(home);
        await until('the 390 px phone home opens with the code box', () => visible(box(tall)));
        await sleep(600);
        await shot(tall, 'phone-390x844-first-screen');

        // 6. The computer home.
        for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
            const pc = await device(WORDS.computer, size, false);
            await pc.page.goto(home);
            await until(`the computer home (${size.width} x ${size.height}) opens with the code box`, () => visible(box(pc)));
            check(/\/d$/.test(new URL(pc.page.url()).pathname), `the computer lands on the computer home (${new URL(pc.page.url()).pathname})`);
            // The computer home shows the facts line in parts, each with its dot drawn in front (the dot that would start a line is hidden).
            const parts = await pc.page.$$eval('.facts .fact', (els) => els.map((el) => el.textContent.replace(/\u00a0/g, ' ').trim()));
            check(parts.join(' · ') === WORDS.facts, `the computer home has the facts line (${parts.join(' · ')})`);
            const factLines = await pc.page.$eval('.facts', (el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));
            summary[`computerFactsLines${size.width}`] = factLines;
            const look = await pc.page.evaluate(() => {
                const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; };
                return { box: r('form.code-box'), pitch: r('.pitch'), host: r('.host-button'), height: window.innerHeight };
            });
            summary[`computer${size.width}`] = look;
            check(look.box && look.pitch && look.box.bottom <= look.pitch.top, 'the computer code box sits above the pitch');
            check(look.host && look.host.bottom <= look.height, `the Host button is on the first screen (its foot at ${look.host && Math.round(look.host.bottom)} px)`);
            await sleep(600);
            await shot(pc, `computer-${size.width}x${size.height}`);
            if (size.width === 1920) {
                // A guest with a Hebrew keyboard up types the PIN in Hebrew letters: the same keys find the game.
                await pc.page.locator('.code-input').fill(hebrewKeys(pin));
                await pc.page.locator('.code-input').press('Enter');
                await pc.page.waitForURL(/\/join-game\/[A-Z]+\?via=home$/, { timeout: 30000 }).catch(() => { });
                check(new URL(pc.page.url()).pathname === `${lang}/join-game/${pin}`, `the PIN typed in Hebrew (${hebrewKeys(pin)}) opens the join page of ${pin}`);
                // The PIN page itself: the same code typed in Hebrew is shown in English letters and goes on to the nickname.
                await pc.page.goto(`${base}${lang}/join-game?via=test`);
                const pinBox = pc.page.locator('input[name="pin"]');
                await until('the PIN page opens', () => visible(pinBox));
                await pinBox.fill(hebrewKeys(pin));
                await pinBox.press('Enter');
                if (await until('the PIN page takes the PIN typed in Hebrew and asks for the nickname', () => visible(pc.page.locator('input[name="nickname"]')))) {
                    check(true, `the PIN page reads ${hebrewKeys(pin)} as ${pin}`);
                }
            }
            if (size.width === 1280) {
                await pc.page.locator('.code-input').fill(` ${pin.slice(0, 2).toLowerCase()}${pin.slice(2)} `);
                await pc.page.locator('.code-input').press('Enter');
                await pc.page.waitForURL(/\/join-game\/[A-Z]+\?via=home$/, { timeout: 30000 }).catch(() => { });
                check(new URL(pc.page.url()).pathname === `${lang}/join-game/${pin}`, `Enter in the computer box opens the join page of ${pin}`);
                const n = pc.page.locator('input[name="nickname"]');
                await until('the computer join page opens on the nickname', () => visible(n));
                await n.fill(WORDS.computer);
                await pc.page.locator('form button[type="submit"]').first().click();
                await pc.page.waitForURL(/\/game-staging\//, { timeout: 30000 }).catch(() => { });
                check(/\/game-staging\//.test(pc.page.url()), 'the computer guest is in the lobby');
                await until('the computer join is sent with via "home"', async () => pc.joins.some((j) => j.via === 'home'), 10000);
            }
            const crash = pc.problems.filter((x) => !/Failed to load|ERR_/.test(x));
            check(crash.length === 0, `the computer home shows no error${crash.length ? ': ' + crash.join('; ') : ''}`);
        }
        const phoneProblems = small.problems.filter((x) => !/Failed to load|ERR_/.test(x));
        check(phoneProblems.length === 0, `the phone shows no error${phoneProblems.length ? ': ' + phoneProblems.join('; ') : ''}`);
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
