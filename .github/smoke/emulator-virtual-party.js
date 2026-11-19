#!/usr/bin/env node
// Local run: the virtual holiday party page's Start button (game/seo/pages-en-holidays.js,
// /virtual-holiday-party-game), played through in headless Chromium against the Firebase emulators.
//
// A host on a call opens the page on the computer they will share, from a ?via=test link (a play-test:
// test games stay out of every count). The run checks what the page tells that host to do:
//  - the page's Start buttons carry the page's own tag, seo-en-virtual-party, and a ?via=test arrival
//    takes the tag's place, so a play-test game is counted as a test;
//  - Start opens the Create form with the Christmas and New Year pack, and Create makes an English
//    game with that pack and that tag;
//  - in the lobby the computer host is offered the big screen, under "Everyone in one room, or on a
//    call?"; a press turns the computer into the big screen (QR code, PIN, START);
//  - the host and two colleagues join from phones, START on the big screen starts the game, and the
//    game plays to the final scoreboard with the big screen showing no player's screen;
//  - a game opened from the page without ?via=test carries the page's tag.
//
// Nothing reaches production: see emulator-game.js, whose emulators and phones this run uses.
// From the repository root, with game/ and functions/ built and the root's npm ci done:
//   node .github/smoke/emulator-virtual-party.js [path to dist]
// SHOTS=<dir> saves screenshots. Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve, fileIn, HOST } = require('./smoke');
const emu = require('./emulator-game');

const { ROOT, DIST, startEmulators, stopEmulators, up, db, seed, newPhone, visible, sleep, log } = emu;
const SHOTS = process.env.SHOTS || '';
const PAGE = '/virtual-holiday-party-game';
const TAG = 'seo-en-virtual-party';
const COMPUTER = { width: 1280, height: 720 };

const pageDef = require(path.join(ROOT, 'game', 'seo', 'pages')).find((p) => p.path === PAGE);
const ts = require(path.join(ROOT, 'game', 'node_modules', 'typescript'));
function loadTs(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}
const words = loadTs(path.join(ROOT, 'game', 'src', 'app', 'pages', 'game-staging', 'big-screen-host.ts')).bigScreenStrings('en');

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

const screenOf = (page) => new URL(page.url()).pathname.split('/')[1] || 'home';

async function join(phone, base, pin) {
    await phone.page.goto(`${base}/join-game/${pin}`);
    const input = phone.page.locator('input[name="nickname"]');
    await input.waitFor({ timeout: 30000 });
    await input.fill(phone.name);
    await phone.page.locator('form button[type="submit"]').first().click();
    await phone.page.waitForURL(/\/game-staging\//, { timeout: 30000 });
}

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

/** From the page's top Start button through Create and the nickname, to the lobby. Returns the PIN. */
async function startFromPage(page, base, via, check) {
    await page.goto(`${base}${PAGE}${via ? `?via=${via}` : ''}`);
    const top = page.locator('.cta.top a.btn.primary');
    const href = await top.getAttribute('href');
    const wanted = `/create-game?lang=en&pack=christmas&via=${via || TAG}`;
    check(href === wanted, `the Start button goes to ${href}, not ${wanted}`);
    check((await top.innerText()).trim() === pageDef.start.label, `the Start button says "${await top.innerText()}"`);
    await shot(page, `${via || 'no-via'}-1-page`);
    await top.click();
    await page.waitForURL(/\/create-game/, { timeout: 30000 });
    const pack = page.locator('input[name="usePack"]');
    check(await until(() => visible(pack)), 'the Create form offers no question pack');
    check(await pack.isChecked(), 'the pack is not ticked');
    const packLine = await page.locator('.pack-option').innerText().catch(() => '');
    check(/Christmas/i.test(packLine), `the pack on offer is "${packLine.trim()}"`);
    await shot(page, `${via || 'no-via'}-2-create`);
    await page.locator('input[name="length"]').first().check();
    await page.locator('form button[type="submit"]').first().click();
    await page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
    const pin = new URL(page.url()).pathname.split('/').pop().toUpperCase();
    const input = page.locator('input[name="nickname"]');
    await input.waitFor({ timeout: 30000 });
    await input.fill('Host');
    await page.locator('form button[type="submit"]').first().click();
    await page.waitForURL(/\/game-staging\//, { timeout: 30000 });
    const game = await db('GET', `games/${pin}`);
    check(game.campaign === (via || TAG), `the game's tag is ${JSON.stringify(game.campaign)}, not ${via || TAG}`);
    check(game.pack === 'christmas', `the game's pack is ${JSON.stringify(game.pack)}`);
    check(game.locale === 'en', `the game's language is ${JSON.stringify(game.locale)}`);
    check((game.qids || []).some((id) => /^christmas-/.test(id)), `no Christmas question among ${JSON.stringify(game.qids)}`);
    return pin;
}

async function run(browser, base, problems) {
    const check = (ok, text) => { if (!ok) problems.push(text); };
    const computer = await newPhone(browser, base, 'computer', 'screen');
    await computer.page.setViewportSize(COMPUTER);
    const hostPhone = await newPhone(browser, base, 'Host', 'player');
    const ana = await newPhone(browser, base, 'Ana', 'player');
    const ben = await newPhone(browser, base, 'Ben', 'player');
    const phones = [hostPhone, ana, ben];
    const all = [computer, ...phones];
    const result = {};
    try {
        // ---- the play-test: from a ?via=test link, on the computer that will be shared ----
        const page = computer.page;
        const pin = await startFromPage(page, base, 'test', check);
        result.pin = pin;
        log(`the host is in the lobby of ${pin}, on a computer`);

        const offer = page.locator('.big-screen-offer');
        check(await until(() => visible(offer)), 'no "use as the big screen" in the computer host\'s lobby');
        const offerText = await offer.innerText().catch(() => '');
        check(offerText.includes(words.ask), `the offer does not ask "${words.ask}"`);
        check(words.ask === 'Everyone in one room, or on a call?', `the offer asks "${words.ask}"`);
        check(offerText.toLowerCase().includes('use as the big screen'), 'the offer has no "Use as the big screen" button, the page\'s words');
        const box = await offer.boundingBox();
        check(box && box.y + box.height <= COMPUTER.height, 'the offer runs below a 1280x720 screen');
        await shot(page, 'test-3-lobby-offer');

        await offer.locator('button').click();
        check(await until(() => visible(page.locator('.invite-presenter'))), 'the computer did not become the big screen');
        check(await visible(page.locator('.invite-presenter app-qr-code')), 'the big screen shows no QR code');
        const game = await db('GET', `games/${pin}`);
        check(game.hasHost === 'screen' && game.presenter === true, `after the press: hasHost ${JSON.stringify(game.hasHost)}, presenter ${JSON.stringify(game.presenter)}`);
        await shot(page, 'test-4-big-screen');

        for (const p of phones) await join(p, base, pin);
        check(await until(async () => (await page.locator('.lobby .player').count()) === 3), 'the big screen does not show three players');
        await shot(page, 'test-5-big-screen-three-in');
        const start = page.locator('.game-header > button');
        check(await until(() => visible(start)), 'the big screen has no START');
        await start.first().click();
        check(await until(async () => (await db('GET', `games/${pin}/state/id`)) !== 0), 'START on the big screen did not start the game');
        check(await until(async () => screenOf(page) === 'show-question', 30000), `the big screen is on ${screenOf(page)}, not the question`);
        result.questions = await db('GET', `games/${pin}/qids`);
        await shot(page, 'test-6-big-screen-question');

        const deadline = Date.now() + 8 * 60 * 1000;
        while (Date.now() < deadline && !(phones.every((p) => p.done) && screenOf(page) === 'score-board-final')) {
            await Promise.all(phones.filter((p) => !p.done).map((p) => play(p, pin).catch(() => { })));
            await sleep(400);
        }
        const final = await db('GET', `games/${pin}`);
        check(final.state.id === 6, `the game ended in state ${final.state.id}`);
        check(screenOf(page) === 'score-board-final', `the big screen ended on ${screenOf(page)}`);
        phones.forEach((p) => check(p.done, `${p.name} never saw the final scoreboard`));
        check(phones.every((p) => p.lies.length === 5), `lies sent: ${phones.map((p) => p.lies.length).join(', ')}`);
        check(final.campaign === 'test', `the finished game's tag is ${JSON.stringify(final.campaign)}`);
        result.scores = Object.values(final.players).map((p) => `${p.nickname}: ${p.score}`);
        await shot(page, 'test-7-big-screen-final');

        // ---- the same page found by search, no ?via: the game carries the page's own tag ----
        const searcher = await newPhone(browser, base, 'searcher', 'screen');
        all.push(searcher);
        result.searchPin = await startFromPage(searcher.page, base, null, check);

        all.forEach((p) => p.problems.forEach((x) => problems.push(`${p.name}: ${x}`)));
    } catch (e) {
        problems.push(e.message.split('\n')[0]);
        await shot(computer.page, 'error');
    } finally {
        for (const p of all) await p.context.close().catch(() => { });
    }
    return result;
}

async function main() {
    if (!fileIn(DIST, '/index.html')) throw new Error(`No built game at ${DIST}`);
    if (!fileIn(DIST, PAGE + '.html')) throw new Error(`No ${PAGE} page in ${DIST}`);
    if (!fs.existsSync(path.join(ROOT, 'functions', 'dist', 'index.js'))) throw new Error('Build functions/ first: npm run build there');
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const emulators = await startEmulators();
    const problems = [];
    let result = {};
    let browser;
    let server;
    try {
        if (!(await up(`http://${emu.DB}/.json?ns=${emu.PROJECT}`))) throw new Error('no database emulator on :9000');
        await seed();
        // The Christmas and New Year pack, as the release writes it to the live question bank.
        await db('PATCH', 'questions', JSON.parse(fs.readFileSync(path.join(ROOT, 'functions', 'data', 'christmas-questions.json'), 'utf8')));
        server = await serve(DIST);
        const base = `http://${HOST}:${server.address().port}`;
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`, '--autoplay-policy=no-user-gesture-required'] });
        result = await run(browser, base, problems);
        console.log('\nRESULT ' + JSON.stringify({ build: DIST, result, problems }, null, 2));
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
