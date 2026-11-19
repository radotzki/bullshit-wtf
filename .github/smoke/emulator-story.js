#!/usr/bin/env node
// Local run: POST TO YOUR STORY, the tall best-lie card on the final screen, on the built client
// (game/dist) in headless Chromium against the Firebase emulators, with the phones and the emulators
// of emulator-game.js. A test game (created from a ?via=test link) is played to its final screen by
// a host and two guests. The guests always pick the host's lie and laugh at it, and the host picks the
// first guest's lie, so the host ends with a best lie that fooled 2 friends, BIGGEST BULLSHITTER and
// FUNNIEST LIE; the first guest fooled 1; the second guest fooled nobody and got no laugh.
//
// What it checks, on the page:
//   1. The host's final screen has one POST TO YOUR STORY button, under SHARE RESULTS.
//   2. Pressing it sends one shares row, results / story, in the game's language. Headless Chromium has
//      no share sheet, so the phone saves the picture: the run keeps that file, a 1080 by 1920 PNG.
//   3. The first guest has the button too (a lie that fooled 1); the second guest, who fooled nobody,
//      has none; the big screen has none.
//
// Nothing reaches production (see emulator-game.js); the count rows are caught in the browser and
// never sent on. From the repository root, with functions/ and game/ built:
//   node .github/smoke/emulator-story.js [path to dist] [--locale en|he]
// SHOTS=<dir> saves the story pictures and a 360px-wide final screen there. FONTS=<dir> serves the
// game's two Google fonts from that folder (fonts.css and its .woff2 files), since the run lets the
// browser reach no other host; without it the card falls back to the system's fonts.
// Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve, fileIn } = require('./smoke');
const { ROOT, DIST, LOCALE, HOST, log, sleep, startEmulators, stopEmulators, db, seed, newPhone, visible, act } = require('./emulator-game');

const he = LOCALE === 'he';
const NAMES = he ? ['דנה', 'יוסי', 'מיכל'] : ['Ana', 'Ben', 'Cleo'];
const HOST_LIES = he
    ? ['גבינה צהובה', 'תרנגולת', 'מגפיים', 'עז קטנה ועצבנית ששונאת ימי ראשון']
    : ['yellow cheese', 'a chicken', 'rain boots', 'a tiny grumpy goat who hated all Mondays'];
const BUTTON = he ? 'לפרסם בסטורי' : 'POST TO YOUR STORY';
const SHOTS = process.env.SHOTS;

/** The game's two fonts from a local folder: the browser may reach no other host in this run. */
async function serveFonts(context) {
    const dir = process.env.FONTS;
    if (!dir) return;
    await context.route(/fonts\.googleapis\.com|fonts\.gstatic\.com/, (route) => {
        const u = new URL(route.request().url());
        if (u.hostname === 'fonts.googleapis.com') {
            return route.fulfill({ contentType: 'text/css', body: fs.readFileSync(path.join(dir, 'fonts.css'), 'utf8') });
        }
        const file = path.join(dir, path.basename(u.pathname));
        return fs.existsSync(file) ? route.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(file) }) : route.abort();
    });
}

async function main() {
    if (!fileIn(DIST, '/index.html')) throw new Error(`No built game at ${DIST}`);
    if (!fs.existsSync(path.join(ROOT, 'functions', 'dist', 'index.js'))) throw new Error('Build functions/ first: npm run build there');
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const emulators = await startEmulators();
    const problems = [];
    let browser;
    let server;
    try {
        await seed();
        // Questions as the live bank writes them: the blank as $blank$, some of them long.
        const questions = {};
        for (const lang of ['en', 'he']) {
            for (let i = 0; i < 12; i++) {
                questions[`${lang}${i}`] = lang === 'en'
                    ? { lang, questionText: `In 1924, a town in Norway elected $blank$ as its honorary mayor for a whole year (${i}).`, realAnswer: `truth${i}`, fakeAnswers: ['lie a', 'lie b', 'lie c', 'lie d'], citation: '' }
                    : { lang, questionText: `ב-1924 עיירה בנורבגיה בחרה ב$blank$ לראש העיר של כבוד לשנה שלמה (${i}).`, realAnswer: `אמת${i}`, fakeAnswers: ['שקר א', 'שקר ב', 'שקר ג', 'שקר ד'], citation: '' };
            }
        }
        await db('PUT', 'questions', questions);
        server = await serve(DIST);
        const base = `http://${HOST}:${server.address().port}`;
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`, '--autoplay-policy=no-user-gesture-required'] });

        const host = await newPhone(browser, base, NAMES[0], 'host');
        const p2 = await newPhone(browser, base, NAMES[1], 'player');
        const p3 = await newPhone(browser, base, NAMES[2], 'player');
        const screen = await newPhone(browser, base, 'big screen', 'screen');
        const phones = [host, p2, p3, screen];
        for (const p of phones) await serveFonts(p.context);
        // The host's phone is a small one: the final screen is checked at 360px.
        await host.page.setViewportSize({ width: 360, height: 760 });
        // Count rows the phones send (onShare), kept here and never sent on.
        const shares = [];
        for (const p of phones) {
            await p.context.route(/\/onShare(\?|$)/, (route) => {
                try {
                    shares.push(Object.assign({ phone: p.name }, JSON.parse(route.request().postData() || '{}')));
                } catch (e) { /* not JSON */ }
                return route.fulfill({ status: 200, body: '{}' });
            });
        }
        const game = {};

        await host.page.goto(`${base}${he ? '/he' : ''}/?via=test-story`);
        await host.page.goto(`${base}/create-game`);
        await host.page.locator('input[name="locale"]').nth(he ? 1 : 0).check();
        await host.page.locator('input[name="length"]').first().check();
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
        game.pin = new URL(host.page.url()).pathname.split('/').pop().toUpperCase();
        const created = await db('GET', `games/${game.pin}`);
        log(`game ${game.pin} created (${LOCALE}, campaign ${created && created.campaign})`);
        if (!created || created.campaign !== 'test-story') problems.push(`the game is not a test game: campaign ${created && created.campaign}`);

        await screen.page.goto(`${base}/present-game/${game.pin}`);
        await p2.page.goto(`${base}${he ? '/he' : ''}/join-game/${game.pin}`);
        await p3.page.goto(`${base}${he ? '/he' : ''}/join-game/${game.pin}`);

        const lieOf = (phone, q) => phone === host ? HOST_LIES[Math.min(q, HOST_LIES.length - 1)] : `${phone.name} ${he ? 'שקר' : 'lie'} ${q}`;
        const deadline = Date.now() + 8 * 60 * 1000;
        while (Date.now() < deadline && !phones.every((p) => p.done)) {
            if (!game.everyoneIn) {
                const players = await db('GET', `games/${game.pin}/players`);
                game.everyoneIn = players && Object.keys(players).length === 3 && phones.slice(0, 3).every((p) => p.joined);
            }
            await Promise.all(phones.filter((p) => !p.done).map(async (p) => {
                const where = new URL(p.page.url()).pathname.replace(/^\/he(?=\/|$)/, '').split('/')[1] || 'home';
                if (p.role !== 'screen' && where === 'show-question') {
                    const input = p.page.locator('form input.input');
                    if (await visible(input)) {
                        const q = await db('GET', `games/${game.pin}/questionIndex`);
                        if (p.lies[p.lies.length - 1] !== q) {
                            await input.fill(lieOf(p, q));
                            await p.page.locator('form button[type="submit"]').first().click();
                            p.lies.push(q);
                        }
                    }
                    return;
                }
                if (p.role !== 'screen' && where === 'show-answers') {
                    const q = await db('GET', `games/${game.pin}/questionIndex`);
                    if (p.picks[p.picks.length - 1] === q) return;
                    const want = (p === host ? lieOf(p2, q) : lieOf(host, q)).toUpperCase();
                    const button = p.page.locator('button.answer:not([disabled])', { hasText: want });
                    if (await visible(button)) {
                        await button.first().click().catch(() => { });
                        p.picks.push(q);
                    }
                    return;
                }
                if (p !== host && p.role !== 'screen' && where === 'reveal-the-truth') {
                    const q = await db('GET', `games/${game.pin}/questionIndex`);
                    const laugh = p.page.locator('button.laugh:not(.laughed)');
                    const n = await laugh.count();
                    for (let i = 0; i < n; i++) {
                        const label = (await laugh.nth(i).getAttribute('aria-label').catch(() => '')) || '';
                        if (label.toUpperCase().includes(lieOf(host, q).toUpperCase())) await laugh.nth(i).click().catch(() => { });
                    }
                }
                return act(p, game);
            }).map((x) => x.catch((e) => {
                if (!/Target closed|Execution context was destroyed|navigation/.test(e.message)) log(e.message.split('\n')[0]);
            })));
            await sleep(400);
        }
        phones.forEach((p) => { if (!p.done) problems.push(`${p.name} never showed the final scoreboard`); });

        // Let the final screens settle (the story card is drawn a moment after the screen shows).
        await sleep(2500);
        const button = (p) => p.page.locator('button.story-button');
        const summary = { locale: LOCALE, pin: game.pin, buttons: {}, picture: null, shares: null };
        for (const p of phones) summary.buttons[p.name] = await button(p).count();
        if (summary.buttons[host.name] !== 1) problems.push(`the host has ${summary.buttons[host.name]} story buttons, not 1`);
        if (summary.buttons[p2.name] !== 1) problems.push(`${p2.name}, whose lie fooled 1, has no story button`);
        if (summary.buttons[p3.name] !== 0) problems.push(`${p3.name}, who fooled nobody, has a story button`);
        if (summary.buttons[screen.name] !== 0) problems.push('the big screen has a story button');

        const text = await button(host).first().innerText().catch(() => '');
        if (text.trim() !== BUTTON) problems.push(`the button says "${text.trim()}", not "${BUTTON}"`);
        const order = await host.page.evaluate(() => {
            const all = Array.from(document.querySelectorAll('.actions button'));
            return [all.findIndex((b) => b.classList.contains('share-results-button')), all.findIndex((b) => b.classList.contains('story-button'))];
        });
        if (!(order[0] >= 0 && order[1] === order[0] + 1)) problems.push(`the story button is not right under SHARE RESULTS (${order})`);

        if (SHOTS) {
            await host.page.screenshot({ path: path.join(SHOTS, `${LOCALE}-final-screen-360.png`) });
            await host.page.screenshot({ path: path.join(SHOTS, `${LOCALE}-final-screen-360-full.png`), fullPage: true });
        }

        for (const [p, name] of [[host, 'host'], [p2, 'guest']]) {
            const before = shares.length;
            const download = p.page.waitForEvent('download', { timeout: 15000 });
            await button(p).first().click();
            const file = await download;
            const saved = path.join(SHOTS || require('os').tmpdir(), `${LOCALE}-story-${name}.png`);
            await file.saveAs(saved);
            const png = fs.readFileSync(saved);
            const size = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
            if (name === 'host') summary.picture = Object.assign({ file: saved, name: file.suggestedFilename() }, size);
            if (size.width !== 1080 || size.height !== 1920) problems.push(`${p.name}'s story picture is ${size.width}x${size.height}`);
            await sleep(800);
            const rows = shares.slice(before).filter((r) => r.content_type === 'results');
            if (rows.length !== 1 || rows[0].method !== 'story' || rows[0].locale !== LOCALE) {
                problems.push(`${p.name}'s press sent ${JSON.stringify(rows)}, not one results / story row in ${LOCALE}`);
            }
        }
        summary.shares = shares.map((r) => `${r.phone}: ${r.content_type} / ${r.method} / ${r.locale}`);
        const saved = await host.page.locator('.story-saved').count();
        if (!saved) problems.push('no "saved" line after the picture was saved');
        if (SHOTS) await host.page.screenshot({ path: path.join(SHOTS, `${LOCALE}-final-screen-360-after-press.png`) });

        phones.forEach((p) => p.problems.forEach((x) => problems.push(`${p.name}: ${x}`)));
        summary.problems = problems;
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
