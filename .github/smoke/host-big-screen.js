#!/usr/bin/env node
// Local run: a host on a computer makes that computer the big screen
// (game/src/app/pages/game-staging/big-screen-host.ts, functions: hostToBigScreen in start.ts),
// in headless Chromium against the Firebase emulators, in English and in Hebrew.
//
// It checks what no unit test can: the button on a computer host's lobby and not on a phone's or a
// guest's; that a press frees the host's seat and turns the same browser into the big screen with the
// QR code and START; that a guest who was already in the lobby is told the game starts from the big
// screen without reloading; that the host joins from a phone as an ordinary player who cannot start
// the game, and neither can anyone who calls the functions without the host key; that START on the
// big screen starts the game; and (English) that the game then plays to the final scoreboard with the
// big screen showing no player's screen. Also a host who presses the button while alone.
//
// Nothing reaches production: see emulator-game.js, whose emulators and phones this run uses.
// From the repository root, with game/ and functions/ built and the root's npm ci done:
//   node .github/smoke/host-big-screen.js [path to dist]
// ONLY=en-new,he-alone-new,... runs only those. SHOTS=<dir> saves screenshots.
// Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { serve, fileIn, HOST } = require('./smoke');
const emu = require('./emulator-game');

const { ROOT, DIST, startEmulators, stopEmulators, up, db, seed, newPhone, visible, sleep, log } = emu;
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const SHOTS = process.env.SHOTS || '';
const FUNCTIONS = `http://${HOST}:5001/${emu.PROJECT}/us-central1`;

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
const staging = path.join(ROOT, 'game', 'src', 'app', 'pages', 'game-staging');
const bigScreen = loadTs(path.join(staging, 'big-screen-host.ts'));
const lobbyHost = loadTs(path.join(staging, 'lobby-host.ts'));

const NAMES = { en: ['Ana', 'Ben', 'Cleo'], he: ['דנה', 'יוסי', 'מיכל'] };
const COMPUTER = { width: 1280, height: 720 };

async function shot(page, name) {
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }).catch(() => { });
}

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

async function until(fn, ms = 20000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (await fn().catch(() => false)) return true;
        await sleep(250);
    }
    return false;
}

async function join(phone, base, pin, he, name = phone.name) {
    await phone.page.goto(`${base}${he ? '/he' : ''}/join-game/${pin}?via=qr`);
    const input = phone.page.locator('input[name="nickname"]');
    await input.waitFor({ timeout: 30000 });
    await input.fill(name);
    await phone.page.locator('form button[type="submit"]').first().click();
    await phone.page.waitForURL(/\/game-staging\//, { timeout: 30000 });
}

/** A call to a function as any phone could make it, with no host key unless one is given. */
async function post(name, body) {
    const res = await fetch(`${FUNCTIONS}/${name}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
}

const screenOf = (page) => new URL(page.url()).pathname.replace(/^\/he(?=\/|$)/, '').split('/')[1] || 'home';

/** One look at a player's phone, and the move a player would make there. */
async function play(phone, pin) {
    const page = phone.page;
    const screen = screenOf(page);
    if (screen === 'show-question') {
        const input = page.locator('form input.input');
        if (await visible(input)) {
            const question = await db('GET', `games/${pin}/questionIndex`);
            if (phone.lies[phone.lies.length - 1] !== question) {
                await input.fill(`${phone.name} lie ${question}`);
                await page.locator('form button[type="submit"]').first().click();
                phone.lies.push(question);
            }
        }
    } else if (screen === 'show-answers') {
        const buttons = page.locator('button.answer:not([disabled])');
        const n = await buttons.count();
        if (n > 0) {
            const question = await db('GET', `games/${pin}/questionIndex`);
            if (phone.picks[phone.picks.length - 1] !== question) {
                await buttons.nth(Math.floor(Math.random() * n)).click().catch(() => { });
                phone.picks.push(question);
            }
        }
    } else if (screen === 'reveal-the-truth') {
        const next = page.locator('button.next');
        if (await visible(next)) await next.first().click().catch(() => { });
    } else if (screen === 'score-board-final') {
        phone.done = true;
    }
}

/**
 * One game. The host makes it on a computer. `alone`: the host presses the button before anyone is in.
 * Otherwise a guest is in the lobby first, and (`whole`) the game is played to its end.
 */
async function run(browser, base, { locale, alone, whole, half }, problems) {
    const he = locale === 'he';
    const tag = `${locale}${alone ? '-alone' : ''}-${half}`;
    const check = (ok, text) => { if (!ok) problems.push(`${tag}: ${text}`); };
    const words = bigScreen.bigScreenStrings(locale);
    const names = NAMES[locale];
    // The emulator's phones keep the desktop's user agent: the page tells them apart by width.
    const computer = await newPhone(browser, base, 'computer', 'screen');
    await computer.page.setViewportSize(COMPUTER);
    const guest = await newPhone(browser, base, names[1], 'player');
    const third = await newPhone(browser, base, names[2], 'player');
    const hostPhone = await newPhone(browser, base, names[0], 'player');
    const all = [computer, guest, third, hostPhone];
    const result = { tag };

    try {
        // ---- the host makes the game on a computer and takes a seat there, as today ----
        const page = computer.page;
        // The lobby's half of the lone-host test, by the tester's switch (HALF_OVERRIDE_KEY in lone-host.ts).
        await page.addInitScript((value) => { try { localStorage.setItem('BS_LONE_HOST', value); } catch (e) { } }, half);
        await page.goto(`${base}/create-game`);
        await page.locator('input[name="locale"]').nth(he ? 1 : 0).check();
        await page.locator('input[name="length"]').first().check();
        await page.locator('form button[type="submit"]').first().click();
        await page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
        const pin = new URL(page.url()).pathname.split('/').pop().toUpperCase();
        result.pin = pin;
        const input = page.locator('input[name="nickname"]');
        await input.waitFor({ timeout: 30000 });
        await input.fill(names[0]);
        await page.locator('form button[type="submit"]').first().click();
        await page.waitForURL(/\/game-staging\//, { timeout: 30000 });
        log(`${tag}: the host is in the lobby of ${pin}, on a computer`);

        const offer = page.locator('.big-screen-offer');
        const start = page.locator('.game-header > button');
        check(await until(() => visible(offer)), 'no "use as the big screen" on a computer host\'s lobby');
        const offerText = await offer.innerText().catch(() => '');
        for (const line of [words.ask, words.how, words.button]) check(offerText.includes(line), `the offer lacks "${line}"`);
        check((await offer.getAttribute('dir')) === (he ? 'rtl' : null), `the offer's direction is ${await offer.getAttribute('dir')}`);
        const fits = async (size) => {
            const box = await offer.boundingBox();
            check(box && box.y + box.height <= size.height, `the offer runs below a ${size.width}x${size.height} screen`);
            const wide = await page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
            check(wide <= 12, `the page scrolls sideways by ${wide} px at ${size.width}x${size.height}`);
        };
        await fits(COMPUTER);
        await shot(page, `${tag}-1-computer-host-alone`);
        const hostSeat = Object.keys(await db('GET', `games/${pin}/players`))[0];

        // A narrow window is a phone to the lobby: no offer there.
        await page.setViewportSize({ width: 390, height: 800 });
        await page.reload();
        check(await until(() => visible(page.locator('app-invite'))), 'the lobby did not come back after a reload');
        await sleep(800);
        check(!(await visible(offer)), 'a phone-sized host page offers the big screen');
        await page.setViewportSize(COMPUTER);
        await page.reload();
        check(await until(() => visible(offer)), 'the offer is gone after a reload on a computer');

        if (!alone) {
            await join(guest, base, pin, he);
            check(await until(() => visible(start)), 'with a guest in: no START for the host');
            check(await visible(offer), 'with a guest in: the offer is gone');
            check(!(await visible(guest.page.locator('.big-screen-offer'))), 'a guest is offered the big screen');
            for (const size of [COMPUTER, { width: 1024, height: 768 }, { width: 1920, height: 1080 }]) {
                await page.setViewportSize(size);
                await sleep(300);
                await fits(size);
                const pictures = await page.locator('.lobby .player .picture').evaluateAll((list) => list.map((el) => el.getBoundingClientRect().bottom));
                check(pictures.length === 2 && pictures.every((b) => b <= size.height), `the players are below a ${size.width}x${size.height} screen`);
                const offerBox = await offer.boundingBox();
                const tops = await page.locator('.lobby .player .picture').evaluateAll((list) => list.map((el) => el.getBoundingClientRect().top));
                check(offerBox && tops.every((t) => t >= offerBox.y + offerBox.height), `the offer runs into the players at ${size.width}x${size.height}`);
                const invite = await page.locator('app-invite').first().boundingBox();
                check(offerBox && invite && invite.y >= offerBox.y + offerBox.height, `the offer runs into the invite at ${size.width}x${size.height}`);
                if (size.width === 1920) await shot(page, `${tag}-2-computer-host-one-guest-1920x1080`);
            }
            await page.setViewportSize(COMPUTER);
            await sleep(300);
            await shot(page, `${tag}-2-computer-host-one-guest`);
        }

        // ---- nobody without the host key can free the seat ----
        const refused = await post('hostToBigScreen', { pin });
        check(refused.status === 403 && refused.body.code === 'NOT_HOST', `a call without the host key got ${refused.status}`);
        const wrongKey = await post('hostToBigScreen', { pin, hostKey: 'X'.repeat(24) });
        check(wrongKey.status === 403, `a call with a made-up key got ${wrongKey.status}`);
        check(!!(await db('GET', `games/${pin}/players/${hostSeat}`)), 'a refused call freed the host\'s seat');

        // ---- the press ----
        await offer.locator('button').click();
        check(await until(() => visible(page.locator('.invite-presenter'))), 'the computer did not become the big screen');
        check(screenOf(page) === 'game-staging', `the computer is on ${screenOf(page)}`);
        const game = await db('GET', `games/${pin}`);
        check(game.hasHost === 'screen', `hasHost is ${JSON.stringify(game.hasHost)}`);
        check(game.presenter === true, `presenter is ${JSON.stringify(game.presenter)}`);
        check(!(game.players || {})[hostSeat], 'the host\'s seat on the computer is still there');
        check(Object.keys(game.players || {}).length === (alone ? 0 : 1), `${Object.keys(game.players || {}).length} seats after the press`);
        check(!(await visible(offer)), 'the big screen still offers the button');
        check(await visible(page.locator('.invite-presenter app-qr-code')), 'the big screen shows no QR code');
        check(await until(() => visible(start)), 'the big screen has no START');
        if (alone) {
            const waiting = page.locator('.waiting-for-players');
            check((await waiting.innerText().catch(() => '')).trim() === words.joinNow, `the empty big screen says "${await waiting.innerText().catch(() => '')}"`);
            const line = await waiting.evaluate((el) => {
                const range = document.createRange();
                range.selectNodeContents(el);
                const r = range.getBoundingClientRect();
                return { left: r.left, right: r.right };
            });
            const card = await page.locator('.invite-presenter').boundingBox();
            check(card && (line.right <= card.x || line.left >= card.x + card.width), 'the line runs over the QR card');
            await shot(page, `${tag}-3-big-screen-nobody-in`);
        } else {
            // The guest was in the lobby before the press: told without a reload, and given no START.
            const message = guest.page.locator('.lobby-message');
            const wanted = lobbyHost.lobbyText({ canStart: false, wait: 'big-screen', hostName: null, alone: false }, 1, locale).message;
            check(await until(async () => (await message.innerText()).trim() === wanted), `the guest reads "${await message.innerText().catch(() => '')}", not "${wanted}"`);
            check(!(await visible(guest.page.locator('.game-header > button'))), 'the guest has START');
            check((await guest.page.locator('.lobby .player').count()) === 1, 'the guest still sees the host\'s old seat');
            await shot(guest.page, `${tag}-3-guest-after-the-press`);
        }

        // ---- the host joins from a phone, like everyone else ----
        await join(hostPhone, base, pin, he, names[0]);
        const phoneMessage = hostPhone.page.locator('.lobby-message');
        const wanted = lobbyHost.lobbyText({ canStart: false, wait: 'big-screen', hostName: null, alone: false }, 1, locale).message;
        check(await until(async () => (await phoneMessage.innerText()).trim() === wanted), `the host's phone reads "${await phoneMessage.innerText().catch(() => '')}"`);
        check(!(await visible(hostPhone.page.locator('.game-header > button'))), 'the host\'s phone has START');
        check(!(await visible(hostPhone.page.locator('.big-screen-offer'))), 'the host\'s phone offers the big screen');
        const players = await db('GET', `games/${pin}/players`);
        check(Object.values(players).every((p) => !p.host), 'a seat is marked as the host after the press');
        await shot(hostPhone.page, `${tag}-4-host-phone`);
        await join(third, base, pin, he);
        if (alone) await join(guest, base, pin, he);
        check(await until(async () => (await page.locator('.lobby .player').count()) === 3), 'the big screen does not show three players');
        const onScreen = await page.locator('.lobby .player span').allInnerTexts();
        check(onScreen.map((n) => n.trim()).includes(names[0]), `the host's name is not on the big screen (${onScreen.join(', ')})`);
        await shot(page, `${tag}-5-big-screen-three-in`);

        // ---- only the big screen starts the game ----
        const noKey = await post('startGame', { pin });
        check(noKey.status === 403 && noKey.body.code === 'NOT_HOST', `START without the host key got ${noKey.status}`);
        check((await db('GET', `games/${pin}/state/id`)) === 0, 'the game started without the host key');
        await start.first().click();
        check(await until(async () => (await db('GET', `games/${pin}/state/id`)) !== 0), 'START on the big screen did not start the game');
        const late = await post('hostToBigScreen', { pin });
        check(late.status === 403 || late.status === 400, `a call after the start got ${late.status}`);
        const phones = [hostPhone, guest, third];
        check(await until(async () => phones.every((p) => screenOf(p.page) !== 'game-staging'), 30000), 'a phone stayed in the lobby after START');
        // The big screen shows the question and takes no lie: it is nobody's seat any more.
        check(await until(async () => screenOf(page) === 'show-question', 30000), `the big screen is on ${screenOf(page)}, not the question`);
        check(!(await visible(page.locator('form input.input'))), 'the big screen asks for a lie');
        await shot(page, `${tag}-6-big-screen-question`);

        if (whole) {
            const deadline = Date.now() + 8 * 60 * 1000;
            while (Date.now() < deadline && !(phones.every((p) => p.done) && screenOf(page) === 'score-board-final')) {
                await Promise.all(phones.filter((p) => !p.done).map((p) => play(p, pin).catch(() => { })));
                if (screenOf(page) === 'show-answers' && await visible(page.locator('button.answer'))) {
                    check(await visible(page.locator('.game-main > .presenter')), 'the big screen shows a player\'s answers page');
                }
                await sleep(400);
            }
            const final = await db('GET', `games/${pin}`);
            check(final.state.id === 6, `the game ended in state ${final.state.id}`);
            check(screenOf(page) === 'score-board-final', `the big screen ended on ${screenOf(page)}`);
            phones.forEach((p) => check(p.done, `${p.name} never saw the final scoreboard`));
            check(Object.keys(final.players).length === 3, `${Object.keys(final.players).length} seats on the final scoreboard`);
            check(phones.every((p) => p.lies.length === 5), `lies sent: ${phones.map((p) => p.lies.length).join(', ')}`);
            result.scores = Object.values(final.players).map((p) => `${p.nickname}: ${p.score}`);
            await shot(page, `${tag}-7-big-screen-final`);
        }

        // ---- what went to BigQuery's shares table ----
        await sleep(1500);
        const mine = shares().filter((r) => r.content_type === 'lobby-help' && r.crew_id === pin && r.method === 'big-screen');
        check(mine.length === 1 && mine[0].locale === locale, `${mine.length} big-screen rows in shares`);
        all.forEach((p) => p.problems.forEach((x) => problems.push(`${tag}: ${p.name}: ${x}`)));
        log(`${tag}: done`);
    } catch (e) {
        problems.push(`${tag}: ${e.message.split('\n')[0]}`);
        await shot(computer.page, `${tag}-error`);
    } finally {
        for (const p of all) await p.context.close().catch(() => { });
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
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`, '--autoplay-policy=no-user-gesture-required'] });
        // One game at a time, in both halves of the lone-host test (the lobby differs between them).
        const games = [
            { locale: 'en', half: 'new', whole: true },
            { locale: 'he', half: 'classic' },
            { locale: 'he', half: 'new' },
            { locale: 'en', half: 'classic', alone: true },
            { locale: 'en', half: 'new', alone: true },
            { locale: 'he', half: 'new', alone: true },
        ];
        for (const g of games) {
            const tag = `${g.locale}${g.alone ? '-alone' : ''}-${g.half}`;
            if (only && !only.includes(tag)) continue;
            results.push(await run(browser, base, g, problems));
        }
        console.log('\nRESULT ' + JSON.stringify({ build: DIST, games: results, problems }, null, 2));
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
