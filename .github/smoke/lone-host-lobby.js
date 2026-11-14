#!/usr/bin/env node
// Local run: the lone-host help (game/src/app/pages/game-staging/lone-host.ts) in headless Chromium,
// against the Firebase emulators. A host opens a lobby on a phone and on a computer, in English and
// in Hebrew, in each half of the 50/50 test, and guests join one by one up to four players.
//
// It checks what no unit test can: the half the page works out from a real PIN, the help on the
// screen alone and with one guest (the phone's buttons, the computer's card, its link and QR code,
// right to left in Hebrew), that it is gone from the third player on, that START is never held back,
// that nothing runs off a 320 px phone, the rows sent to `shares`, and that a test game's lobby
// (?via=test) sends none.
//
// Nothing reaches production: see emulator-game.js, whose emulators and phones this run uses.
// From the repository root, with game/ and functions/ built and the root's npm ci done:
//   node .github/smoke/lone-host-lobby.js [path to dist]
// ONLY=en-new-computer,he-classic-phone,... runs only those lobbies. SHOTS=<dir> saves screenshots.
// Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');
const { serve, fileIn, HOST } = require('./smoke');
const emu = require('./emulator-game');

const { ROOT, DIST, startEmulators, stopEmulators, up, db, seed, newPhone, visible, sleep, log } = emu;
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const SHOTS = process.env.SHOTS || '';

// The game's own words, so the run checks the screen against them and not against a copy.
const ts = require(path.join(ROOT, 'game', 'node_modules', 'typescript'));
function loadTs(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}
const help = loadTs(path.join(ROOT, 'game', 'src', 'app', 'pages', 'game-staging', 'lone-host.ts'));

/** The half a lobby falls in, as BigQuery will work it out. */
const half = (pin) => crypto.createHash('sha256').update('lone-host:' + pin.toUpperCase(), 'utf8').digest()[0] % 2 === 1;
/** The PIN the game counter gives (generateGameName in new-game.ts). */
const pinOf = (counter) => counter.toString(26).replace(/\d/g, (d) => 'qrstuvwxyz'[d]).toUpperCase().padStart(4, 'Q');

const NAMES = { en: ['Ana', 'Ben', 'Cleo', 'Dov'], he: ['דנה', 'יוסי', 'מיכל', 'עומר'] };
const COMPUTER = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 800 };
const SMALL_PHONE = { width: 320, height: 568 };

async function shot(page, name) {
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }).catch(() => { });
}

/** The log of the emulators this run started: the newest one in the temp folder. */
function emulatorsLog() {
    const files = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith('bs-emulators-'))
        .map((d) => path.join(os.tmpdir(), d, 'emulators.log')).filter((f) => fs.existsSync(f));
    return files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || '';
}

/** Every row the functions sent to `shares`, read from the emulators' log. */
function shares() {
    const text = fs.readFileSync(emulatorsLog(), 'utf8');
    const rows = [];
    const re = /Insert to BigQuery, table: 'shares', data: (\{.*?\})\s*$/gm;
    let m;
    while ((m = re.exec(text))) {
        try {
            rows.push(JSON.parse(m[1]));
        } catch (e) { /* a cut line */ }
    }
    return rows;
}

async function until(what, fn, ms = 20000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (await fn().catch(() => false)) return true;
        await sleep(250);
    }
    return false;
}

async function join(phone, base, pin, he) {
    await phone.page.goto(`${base}${he ? '/he' : ''}/join-game/${pin}?via=link`);
    const input = phone.page.locator('input[name="nickname"]');
    await input.waitFor({ timeout: 30000 });
    await input.fill(phone.name);
    await phone.page.locator('form button[type="submit"]').first().click();
    await phone.page.waitForURL(/\/game-staging\//, { timeout: 30000 });
}

// The lobby's row of players is wider than a computer's window (Bulma's columns: 4 px at 1280, 9 px at
// 1920), in both halves and before this change: that much is let through, so the check is about the help alone.
const noSideScroll = (page) => page.evaluate(() => document.scrollingElement.scrollWidth <= window.innerWidth + (window.innerWidth >= 769 ? 12 : 1));

/** One lobby: a host on `device`, in `locale`, in the half asked for, then guests up to four players. */
async function lobby(browser, base, { locale, wantNew, device, testGame }, problems) {
    const he = locale === 'he';
    const tag = `${locale}-${testGame ? 'test' : wantNew ? 'new' : 'classic'}-${device}`;
    const check = (ok, text) => { if (!ok) problems.push(`${tag}: ${text}`); };
    const words = help.loneHostStrings(locale);
    const names = NAMES[locale];
    const computer = device === 'computer';
    // The emulator's phones keep the desktop's user agent: the page tells them apart by width, as it
    // does a narrow window. The user agents are in game/test/lone-host.test.js.
    const host = await newPhone(browser, base, names[0], computer ? 'screen' : 'host');
    await host.page.setViewportSize(computer ? COMPUTER : PHONE);
    await host.context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => { });
    host.context.on('page', (popup) => popup.close().catch(() => { }));
    const guests = [];
    for (const name of names.slice(1)) guests.push(await newPhone(browser, base, name, 'player'));
    const result = { tag };

    try {
        // The PIN decides the half, so the counter is moved to one whose next PIN is in the half asked for.
        let counter = await db('GET', 'gameCounter');
        while (half(pinOf(counter + 1)) !== wantNew) counter++;
        await db('PUT', 'gameCounter', counter);
        await host.page.goto(`${base}/create-game${testGame ? '?via=test' : ''}`);
        await host.page.locator('input[name="locale"]').nth(he ? 1 : 0).check();
        await host.page.locator('input[name="length"]').first().check();
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
        const pin = new URL(host.page.url()).pathname.split('/').pop().toUpperCase();
        result.pin = pin;
        check(half(pin) === wantNew, `game ${pin} is not in the half asked for`);
        const input = host.page.locator('input[name="nickname"]');
        await input.waitFor({ timeout: 30000 });
        await input.fill(host.name);
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/\/game-staging\//, { timeout: 30000 });
        log(`${tag}: ${host.name} is in the lobby of ${pin}`);

        const page = host.page;
        const card = page.locator('.invite-computer');
        const inline = page.locator('.invite-inline');
        const sheetButton = page.locator('.invite-phone .invite-button');
        const best = page.locator('.best-with');
        const start = page.locator('.game-header > button');
        const tryAlone = page.locator('.start-alone-link');
        const link = `bullshit.wtf${he ? '/he' : ''}/join-game/${pin}`;

        // ---- alone ----
        check(await until('the invite', async () => (await visible(card)) || (await visible(inline))), 'no invite on the page of a host alone');
        check(await visible(tryAlone), 'alone: the "try alone" link is gone');
        check(!(await visible(start)), 'alone: START is in the header (today it waits behind the link)');
        if (wantNew) {
            check((await best.innerText().catch(() => '')).trim() === words.best, `alone: the line is "${await best.innerText().catch(() => '')}"`);
            if (computer) {
                check(await visible(card), 'alone: no card on a computer');
                check(!(await visible(inline)), 'alone: the phone\'s invite shows on a computer too');
                const text = await card.innerText();
                for (const line of [words.title, words.scanOrOpen, words.call, words.room, link]) check(text.includes(line), `alone: the card lacks "${line}"`);
                check((await card.getAttribute('dir')) === (he ? 'rtl' : null), `alone: the card's direction is ${await card.getAttribute('dir')}`);
                const qr = await card.locator('app-qr-code').boundingBox();
                check(qr && qr.width >= 230 && Math.abs(qr.width - qr.height) < 2, `alone: the QR code is ${qr && qr.width}x${qr && qr.height}`);
                const box = await card.boundingBox();
                check(box && box.y + box.height <= COMPUTER.height, 'alone: the card runs below a 1280x720 screen');
                // Hebrew: the QR code sits on the right, the words on its left.
                const wordsBox = await card.locator('.words').boundingBox();
                check(he ? qr.x > wordsBox.x : qr.x < wordsBox.x, 'alone: the QR code is on the wrong side');
            } else {
                check(await visible(inline), 'alone: no invite on a phone');
                check(!(await visible(card)), 'alone: the computer\'s card shows on a phone');
                check(await visible(inline.locator('.whatsapp')), 'alone: no WhatsApp button');
                check(await visible(inline.locator('button:has(.fa-link)')), 'alone: no COPY LINK button');
                check(await visible(inline.locator('app-qr-code')), 'alone: no QR code');
            }
            const scope = computer ? card : inline;
            const href = await scope.locator('a.whatsapp').getAttribute('href');
            check(new URL(href).origin === 'https://wa.me', 'the WhatsApp link does not open WhatsApp');
            check(decodeURIComponent(href).includes(`https://${link}?via=link`), `the WhatsApp text lacks the join link (${decodeURIComponent(href).slice(-60)})`);
            await shot(page, `${tag}-1-alone`);
            if (!computer) {
                await page.setViewportSize(SMALL_PHONE);
                await sleep(300);
                check(await noSideScroll(page), 'alone: the page scrolls sideways at 320 px');
                await shot(page, `${tag}-1-alone-320`);
                await page.setViewportSize(PHONE);
            }
            check(await noSideScroll(page), 'alone: the page scrolls sideways');
            // COPY LINK, then WhatsApp: both are counted.
            await scope.locator('button:has(.fa-link)').click();
            check(await until('copied', async () => (await scope.locator('button .fa-check').count()) === 1), 'COPY LINK does not say the link was copied');
            const copied = await page.evaluate(() => navigator.clipboard.readText()).catch(() => null);
            check(copied === null || copied === `https://${link}?via=link`, `the clipboard holds "${copied}"`);
            // WhatsApp opens in a new tab, which never leaves this machine: its row below says it was pressed.
            await scope.locator('a.whatsapp').click();
            await sleep(500);
        } else {
            check(!(await visible(card)), 'the other half shows the computer\'s card');
            check(!(await visible(best)), 'the other half shows the "best with" line');
            check(await visible(inline), 'the other half lost today\'s invite');
            await shot(page, `${tag}-1-alone`);
        }

        // ---- one guest ----
        await join(guests[0], base, pin, he);
        check(await until('START', () => visible(start)), 'with one guest: no START for the host');
        if (wantNew) {
            check(await visible(computer ? card : inline), 'with one guest: the help is gone');
            check(!(await visible(sheetButton)), 'with one guest: the folded invite button shows beside the help');
            check((await best.innerText().catch(() => '')).trim() === words.bestWithOne, `with one guest: the line is "${await best.innerText().catch(() => '')}"`);
            check(!(await visible(tryAlone)), 'with one guest: the "try alone" link is still there');
            const names2 = await page.locator('.lobby .player span').allInnerTexts();
            check(names2.length === 2, `with one guest: ${names2.length} players on the page`);
            // The line must not touch the players' pictures, at every window size.
            const clear = async (size) => {
                const line = await best.boundingBox();
                const pictures = await page.locator('.lobby .player .picture').evaluateAll((list) => list.map((el) => {
                    const r = el.getBoundingClientRect();
                    return { top: r.top, bottom: r.bottom, height: r.height };
                }));
                check(line && pictures.length === 2 && pictures.every((r) => r.top >= line.y + line.height),
                    `with one guest, ${size}: the line (to ${line && Math.round(line.y + line.height)}) runs into a picture (from ${pictures.map((r) => Math.round(r.top))})`);
                check(await noSideScroll(page), `with one guest, ${size}: the page scrolls sideways`);
                return pictures;
            };
            if (computer) {
                for (const [width, height] of [[800, 600], [1024, 768], [1280, 720], [1366, 768], [1920, 1080]]) {
                    await page.setViewportSize({ width, height });
                    await sleep(300);
                    const pictures = await clear(`${width}x${height}`);
                    check(pictures.every((r) => r.height >= 60), `with one guest, ${width}x${height}: the pictures are ${pictures.map((r) => Math.round(r.height))} px high`);
                    if (height === 720) check(pictures.every((r) => r.bottom <= height), 'with one guest: a picture is below a 1280x720 screen');
                    if (width === 1920) await shot(page, `${tag}-2-one-guest-1920x1080`);
                }
                await page.setViewportSize(COMPUTER);
                await sleep(300);
            } else {
                // A small QR code for the friend on the same couch, where the screen is tall enough for it.
                const qr = await inline.locator('app-qr-code').boundingBox();
                check(qr && Math.round(qr.width) === 120 && Math.round(qr.height) === 120, `with one guest: the phone's QR code is ${qr && qr.width}x${qr && qr.height}`);
                const lastPlayer = await page.locator('.lobby .player').last().boundingBox();
                check(lastPlayer && lastPlayer.y + lastPlayer.height <= PHONE.height, 'with one guest: the players are below a 390x800 screen');
                await clear('390x800');
                await page.setViewportSize(SMALL_PHONE);
                await sleep(300);
                check(!(await visible(inline.locator('app-qr-code'))), 'with one guest: a 568 px high phone shows the QR code');
                await clear('320x568');
                await page.setViewportSize(PHONE);
                await sleep(300);
            }
        } else {
            check(await visible(sheetButton), 'the other half, one guest: no INVITE FRIENDS button');
            check(!(await visible(inline)) && !(await visible(card)) && !(await visible(best)), 'the other half, one guest: the help shows');
        }
        await shot(page, `${tag}-2-one-guest`);

        // ---- three, then four players: today's lobby in both halves ----
        await join(guests[1], base, pin, he);
        check(await until('three', async () => (await page.locator('.lobby .player').count()) === 3), 'the third player never showed');
        check(await until('folded', () => visible(sheetButton)), 'three players: no INVITE FRIENDS button');
        check(!(await visible(inline)) && !(await visible(card)) && !(await visible(best)), 'three players: the help is still there');
        await join(guests[2], base, pin, he);
        check(await until('four', async () => (await page.locator('.lobby .player').count()) === 4), 'the fourth player never showed');
        check(!(await visible(inline)) && !(await visible(card)) && !(await visible(best)), 'four players: the help is still there');
        check(await visible(sheetButton) && await visible(start), 'four players: no INVITE FRIENDS button or no START');
        await shot(page, `${tag}-3-four-players`);
        // A guest never sees the help, and START works.
        const guestPage = guests[0].page;
        check(!(await visible(guestPage.locator('.invite-computer'))) && !(await visible(guestPage.locator('.best-with'))), 'a guest sees the help');
        await start.first().click();
        check(await until('started', async () => (await db('GET', `games/${pin}/state/id`)) !== 0), 'START did not start the game');

        // ---- what went to BigQuery's shares table ----
        await sleep(1500);
        const game = await db('GET', `games/${pin}`);
        const hostRow = Object.values(game.players).find((p) => p.host) || {};
        const mine = shares().filter((r) => r.content_type === 'lobby-help' && r.crew_id === pin);
        result.rows = mine.map((r) => r.method);
        if (testGame) {
            check(game.campaign === 'test', `not a test game (campaign ${game.campaign})`);
            check(mine.length === 0, `a test game's lobby sent ${mine.length} lobby-help rows`);
        } else {
            const seen = `seen-${wantNew ? 'new' : 'classic'}-${device}`;
            check(mine.filter((r) => r.method.startsWith('seen-')).length === 1 && mine.some((r) => r.method === seen),
                `the seen rows are ${JSON.stringify(mine.filter((r) => r.method.startsWith('seen-')).map((r) => r.method))}, not one ${seen}`);
            check(mine.every((r) => r.locale === locale && r.uid === hostRow.uid), 'a row with another language or browser id');
            if (wantNew) {
                check(mine.filter((r) => r.method === 'copy').length === 1, 'no single copy row');
                check(mine.filter((r) => r.method === 'whatsapp').length === 1, 'no single whatsapp row');
                const invites = shares().filter((r) => r.content_type === 'invite' && r.uid === hostRow.uid).map((r) => r.method);
                check(invites.includes('copy') && invites.includes('whatsapp'), `the invite rows are ${JSON.stringify(invites)}`);
            }
        }
        const all = [host].concat(guests);
        all.forEach((p) => p.problems.forEach((x) => problems.push(`${tag}: ${p.name}: ${x}`)));
        log(`${tag}: done (${result.rows.join(', ') || 'no rows'})`);
    } catch (e) {
        problems.push(`${tag}: ${e.message.split('\n')[0]}`);
        await shot(host.page, `${tag}-error`);
    } finally {
        for (const p of [host].concat(guests)) await p.context.close().catch(() => { });
    }
    return result;
}

async function main() {
    if (!fileIn(DIST, '/index.html')) throw new Error(`No built game at ${DIST}`);
    if (!fs.existsSync(path.join(ROOT, 'functions', 'dist', 'index.js'))) throw new Error('Build functions/ first: npm run build there');
    if (process.env.EMULATORS === 'running') throw new Error('This run reads the emulators\' log: let it start them itself');
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
        const lobbies = [];
        for (const locale of ['en', 'he']) {
            for (const device of ['phone', 'computer']) {
                lobbies.push({ locale, device, wantNew: true });
                lobbies.push({ locale, device, wantNew: false });
            }
        }
        lobbies.push({ locale: 'en', device: 'computer', wantNew: true, testGame: true });
        for (const l of lobbies) {
            const tag = `${l.locale}-${l.testGame ? 'test' : l.wantNew ? 'new' : 'classic'}-${l.device}`;
            if (only && !only.includes(tag)) continue;
            results.push(await lobby(browser, base, l, problems));
        }
        console.log('\nRESULT ' + JSON.stringify({ build: DIST, lobbies: results, problems }, null, 2));
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
