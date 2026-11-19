#!/usr/bin/env node
// Local run: a stranger's first game on two phones at 360 x 640, in headless Chromium against the
// Firebase emulators, in English and in Hebrew. It walks the screens the new-host walk of 19 Nov 2026
// found unclear, and checks that each now explains itself:
// - the host's first screen after Create says the game is ready and asks for a name, with Continue;
// - a guest's join screen says who invited them, in the game's language even when the phone last
//   played in the other one;
// - the lobby of two has START in the body (and the host starts with it);
// - the answers screen shows the question and "Which one is true?" before any tap;
// - the picked answer stays marked on the waiting screen;
// - the footer's score moves with the reveal's board, while the server still holds the old total;
// - a second Create in the same browser has the last nickname filled in.
//
// From the repository root, with game/ and functions/ built and the root's npm ci done:
//   node .github/smoke/first-game.js [path to dist]
// LOCALES=en or he runs one language. SHOTS=<dir> saves a screenshot of each screen. EMULATORS=running
// uses emulators you already run. Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve, fileIn, HOST } = require('./smoke');
const emu = require('./emulator-game');

const { ROOT, DIST, startEmulators, stopEmulators, up, db, seed, newPhone, visible, sleep, log } = emu;
const SHOTS = process.env.SHOTS || '';
const LOCALES = (process.env.LOCALES || 'en,he').split(',');
const PROJECT = 'demo-bullshit';

const ts = require(path.join(ROOT, 'game', 'node_modules', 'typescript'));
function loadTs(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    const mod = { exports: {} };
    const req = (name) => name.startsWith('.') ? loadTs(path.join(path.dirname(file), `${name}.ts`)) : require(name);
    new Function('module', 'exports', 'require', out)(mod, mod.exports, req);
    return mod.exports;
}
const app = path.join(ROOT, 'game', 'src', 'app');
const { joinStrings } = loadTs(path.join(app, 'pages', 'join-game', 'join-strings.ts'));
const { gameStrings } = loadTs(path.join(app, 'pages', 'game-strings.ts'));

const NAMES = { en: ['Aviv', 'Ben'], he: ['אביב', 'מיכל'] };
const PHONE = { width: 360, height: 640 };
// What a nickname box, a heading or a line says, with the bidi isolates the page puts around names.
const text = (locator) => locator.first().innerText({ timeout: 2000 }).then((t) => t.replace(/[⁨⁩]/g, '').trim()).catch(() => '');

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

const screenOf = (page) => new URL(page.url()).pathname.replace(/^\/he(?=\/|$)/, '').split('/')[1] || 'home';

async function phone(browser, base, name, role, savedLocale) {
    const p = await newPhone(browser, base, name, role);
    await p.page.setViewportSize(PHONE);
    // The language this phone last played in (join-source.ts, preferredLocale).
    if (savedLocale) await p.context.addInitScript((l) => { try { localStorage.setItem('BS_SITE_LOCALE', l); } catch (e) { } }, savedLocale);
    return p;
}

async function create(host, base, he) {
    await host.page.goto(`${base}${he ? '/create-game?lang=he' : '/create-game?lang=en'}`);
    await host.page.locator('input[name="locale"]').nth(he ? 1 : 0).check();
    await host.page.locator('input[name="length"]').first().check();
    await host.page.locator('form button[type="submit"]').first().click();
    await host.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
    const pin = new URL(host.page.url()).pathname.split('/').pop().toUpperCase();
    await host.page.locator('input[name="nickname"]').waitFor({ timeout: 30000 });
    return pin;
}

async function run(browser, base, locale, problems) {
    const he = locale === 'he';
    const other = he ? 'en' : 'he';
    const j = joinStrings(locale);
    const g = gameStrings(locale);
    const tag = locale;
    const check = (ok, what) => { if (!ok) problems.push(`${tag}: ${what}`); return ok; };
    const [hostName, guestName] = NAMES[locale];
    const host = await phone(browser, base, hostName, 'host', locale);
    // The guest's phone last played in the other language: the join link must follow the game's.
    const guest = await phone(browser, base, guestName, 'player', other);
    const result = { locale };

    try {
        // 3. The host's first screen after Create.
        const pin = await create(host, base, he);
        result.pin = pin;
        await host.page.locator('h3.host-ready').waitFor({ timeout: 10000 }).catch(() => { });
        check((await text(host.page.locator('h3.sub-title'))) === j.hostHeading, `host heading: "${await text(host.page.locator('h3.sub-title'))}"`);
        check((await text(host.page.locator('form button[type="submit"]'))) === j.hostButton.trim(), 'host button is not Continue');
        await shot(host.page, `${locale}-3-host-ready`);
        await host.page.locator('input[name="nickname"]').fill(hostName);
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/\/game-staging\//, { timeout: 30000 });

        // 4 and 7. The guest opens the link on the address of the other language, as a phone that
        // last played there might, and gets the game's language and who invited them.
        await guest.page.goto(`${base}${he ? '' : '/he'}/join-game/${pin}?via=link`);
        const line = guest.page.locator('.invited-line');
        check(await until(() => visible(line), 15000), 'no invite line for the guest');
        const said = await text(line);
        result.invited = said;
        check(said === j.invited(hostName).replace(/[⁨⁩]/g, ''), `invite line: "${said}"`);
        check((await text(guest.page.locator('h3.sub-title'))) === j.nicknameHeading, 'the join page is not in the game\'s language');
        check((await guest.page.locator('.join-game').getAttribute('dir')) === (he ? 'rtl' : null), 'the join page\'s direction');
        await shot(guest.page, `${locale}-4-7-guest-invited`);
        await guest.page.locator('input[name="nickname"]').fill(guestName);
        await guest.page.locator('form button[type="submit"]').first().click();
        await guest.page.waitForURL(/\/game-staging\//, { timeout: 30000 });

        // 5. The lobby of two: START in the body, under the count.
        const bodyStart = host.page.locator('.start-body-button');
        check(await until(() => visible(bodyStart), 15000), 'no START in the lobby\'s body');
        const box = await bodyStart.boundingBox().catch(() => null);
        result.startWidth = box && Math.round(box.width);
        check(box && box.width >= 300 && box.y + box.height <= PHONE.height, `body START at ${JSON.stringify(box)}`);
        check(await visible(host.page.locator('.game-header > button')), 'the corner START is gone');
        check(!(await visible(guest.page.locator('.start-body-button'))), 'the guest has START in the body');
        await shot(host.page, `${locale}-5-lobby-start`);
        await bodyStart.click();

        // A lie each, then 6: the answers screen.
        let lied = { host: false, guest: false };
        let picked = false;
        let footerChecked = false;
        const end = Date.now() + 4 * 60 * 1000;
        while (Date.now() < end && !footerChecked) {
            for (const [who, p] of [['host', host], ['guest', guest]]) {
                const screen = screenOf(p.page);
                if (screen === 'show-question' && !lied[who]) {
                    const input = p.page.locator('form input.input');
                    if (await visible(input)) {
                        await input.fill(`${p.name} ${he ? 'שקר' : 'lie'}`);
                        await p.page.locator('form button[type="submit"]').first().click();
                        lied[who] = true;
                    }
                }
                if (screen === 'show-answers' && who === 'guest' && !picked) {
                    const buttons = p.page.locator('button.answer:not([disabled])');
                    if (await buttons.count() > 0) {
                        const q = p.page.locator('.pick-question');
                        check(await visible(q), 'no question above the answers');
                        check((await text(q)).length > 10, 'the question above the answers is empty');
                        check((await text(p.page.locator('.which-is-true'))) === g.whichIsTrue, 'no "Which one is true?"');
                        const qBox = await q.boundingBox();
                        const aBox = await buttons.first().boundingBox();
                        check(qBox && aBox && qBox.y < aBox.y, 'the question is not above the answers');
                        await shot(p.page, `${locale}-6-answers-question`);
                        // The guest picks the host's lie, so the host scores on this question.
                        const all = await buttons.allInnerTexts();
                        const lie = all.findIndex((t) => t.indexOf(hostName.toUpperCase()) >= 0);
                        const choice = lie >= 0 ? lie : 0;
                        result.guestPicked = all[choice].trim();
                        await buttons.nth(choice).click();
                        picked = true;
                        const mine = p.page.locator('.your-pick .answer.picked');
                        check(await until(() => visible(mine), 10000), 'the pick is not marked after the tap');
                        check((await text(mine)) === result.guestPicked, `marked pick "${await text(mine)}", picked "${result.guestPicked}"`);
                        check((await text(p.page.locator('.your-pick-label'))) === g.yourPick, 'no "Your pick" label');
                        await shot(p.page, `${locale}-14-picked`);
                    }
                }
                // The host picks after the guest, so the guest's waiting screen stays up to be seen.
                if (screen === 'show-answers' && who === 'host' && picked) {
                    const buttons = p.page.locator('button.answer:not([disabled])');
                    if (await buttons.count() > 0) {
                        const all = await buttons.allInnerTexts();
                        const truth = all.findIndex((t) => /^(TRUTH\d+|אמת\d+)$/.test(t.trim()));
                        await buttons.nth(truth >= 0 ? truth : 0).click().catch(() => { });
                    }
                }
            }
            // 12. On the reveal, the host's footer moves to the new total while the server holds the old one.
            if (screenOf(host.page) === 'reveal-the-truth') {
                const pid = Object.entries((await db('GET', `games/${pin}/players`)) || {}).find(([, v]) => v.nickname === hostName.toLowerCase() || v.nickname === hostName);
                const before = pid ? Number(pid[1].score) || 0 : 0;
                const footer = host.page.locator('.game-footer .score');
                const moved = await until(async () => Number(await text(footer)) > before, 40000);
                const shown = Number(await text(footer));
                const state = await db('GET', `games/${pin}/state/id`);
                const server = pid ? Number(await db('GET', `games/${pin}/players/${pid[0]}/score`)) || 0 : 0;
                const board = await text(host.page.locator('.score-row.me .total'));
                result.footer = { before, shown, server, board, state };
                check(moved, `the footer stayed at ${shown} through the reveal`);
                if (board) check(Number(board) === shown, `footer ${shown}, board ${board}`);
                await shot(host.page, `${locale}-12-footer-with-board`);
                footerChecked = true;
            }
            await sleep(300);
        }
        check(footerChecked, 'the game never reached the reveal');

        // 15. A second game in the same browser: the last nickname is filled in.
        await create(host, base, he);
        const value = await host.page.locator('input[name="nickname"]').inputValue();
        result.prefill = value;
        check(value.toLowerCase() === hostName.toLowerCase(), `the second Create's nickname box has "${value}"`);
        await shot(host.page, `${locale}-15-prefill`);
    } catch (e) {
        problems.push(`${tag}: ${e.stack || e}`);
    }
    for (const p of [host, guest]) {
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
        if (!(await up(`http://${HOST}:9000/.json?ns=${PROJECT}`))) throw new Error('no database emulator on :9000');
        await seed();
        server = await serve(DIST);
        const base = `http://${HOST}:${server.address().port}`;
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`, '--autoplay-policy=no-user-gesture-required'] });
        for (const locale of LOCALES) results.push(await run(browser, base, locale, problems));
    } finally {
        if (browser) await browser.close().catch(() => { });
        if (server) server.close();
        stopEmulators(emulators);
    }
    console.log(JSON.stringify({ results, problems }, null, 2));
    console.log(problems.length ? 'FAIL' : 'PASS');
    process.exit(problems.length ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
