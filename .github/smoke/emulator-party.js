#!/usr/bin/env node
// Local run: a whole party-night game started the way a visitor starts one, on the built client
// (game/dist) in headless Chromium against the Firebase emulators, with the phones and emulators of
// emulator-game.js. The bank is the test questions of seed() plus the real party pack
// (functions/data/party-questions.json).
//
// What it walks through, each step checked:
//   1. The host opens a party-night page (/he/bachelorette in Hebrew, /weekend-away-games in English)
//      from a ?via=test link, so the game is a test game, and taps its Start button.
//   2. Create opens with the game's language picked and "🎉 Party night questions" ticked; Create.
//   3. The game carries pack "party", its first question is a party question of its language, and
//      the lobby shows the party line.
//   4. Two friends join and the big screen follows; every question is played to the final scoreboard.
//      Each party question that came up was on the screens with its own text.
//
// Nothing reaches production (see emulator-game.js). From the repository root, with functions/ and
// game/ built:
//   node .github/smoke/emulator-party.js [path to dist] [--locale en|he]
// SHOTS=<dir> saves a screenshot of the create page, the lobby and the final screens. Prints a JSON
// summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve } = require('./smoke');
const { ROOT, LOCALE, HOST, DB, PROJECT, DIST, log, sleep, up, startEmulators, stopEmulators, db, seed, newPhone, visible, act } = require('./emulator-game');

const he = LOCALE === 'he';
const PAGE = he ? '/he/bachelorette' : '/weekend-away-games';
const PARTY = JSON.parse(fs.readFileSync(path.join(ROOT, 'functions', 'data', 'party-questions.json'), 'utf8'));
const isParty = (id) => /^party-26-(en|he)-\d\d$/.test(id || '');
const GAME_TIMEOUT_MS = Number(process.env.GAME_MINUTES || 8) * 60 * 1000;

async function main() {
    const emulators = await startEmulators();
    const problems = [];
    const summary = { locale: LOCALE, page: PAGE };
    const check = (ok, what) => {
        log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
        if (!ok) problems.push(what);
    };
    const shot = async (p, name) => {
        if (process.env.SHOTS) await p.page.screenshot({ path: path.join(process.env.SHOTS, `party-${LOCALE}-${name}.png`) }).catch(() => { });
    };
    let browser;
    let server;
    try {
        if (!(await up(`http://${DB}/.json?ns=${PROJECT}`))) throw new Error('no database emulator on :9000');
        await seed();
        // The release adds the party pack with one update of questions/ (load-pack-questions.js).
        await db('PATCH', 'questions', PARTY);
        server = await serve(DIST);
        const base = `http://${HOST}:${server.address().port}`;
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`, '--autoplay-policy=no-user-gesture-required'] });

        const names = he ? ['דנה', 'יוסי', 'מיכל'] : ['Ana', 'Ben', 'Cleo'];
        const host = await newPhone(browser, base, names[0], 'host');
        const p2 = await newPhone(browser, base, names[1], 'player');
        const p3 = await newPhone(browser, base, names[2], 'player');
        const screen = await newPhone(browser, base, 'big screen', 'screen');
        const phones = [host, p2, p3, screen];
        const game = {};

        // 1. The party page, from a test link; its Start button.
        await host.page.goto(`${base}${PAGE}?via=test`);
        const start = host.page.locator('a.btn.primary[href*="/create-game"]').first();
        const href = await start.getAttribute('href');
        summary.startHref = href;
        check(/[?&]pack=party(&|$)/.test(href || '') && new RegExp(`[?&]lang=${LOCALE}(&|$)`).test(href || ''), `the page's Start asks for the party pack in ${LOCALE} (${href})`);
        check(/[?&]via=test(&|$)/.test(href || ''), 'the visit\'s test tag rides on Start, in place of the page\'s own');
        await start.click();
        await host.page.waitForURL(/\/create-game/, { timeout: 30000 });

        // 2. Create: the language picked, the pack ticked.
        const pack = host.page.locator('input[name="usePack"]');
        await pack.waitFor({ timeout: 20000 }).catch(() => { });
        check(await visible(pack), 'Create offers a pack');
        check(await pack.isChecked().catch(() => false), 'the pack is ticked');
        const label = await host.page.locator('label.pack-option').first().innerText().catch(() => '');
        summary.packLabel = label.trim();
        check(label.includes('🎉') && label.includes(he ? 'שאלות למסיבה' : 'Party night questions'), `the pack's line names the party pack (${label.trim()})`);
        check(await host.page.locator('input[name="locale"]').nth(he ? 1 : 0).isChecked(), `the game's language is ${LOCALE}`);
        await shot(host, '1-create');
        await host.page.locator('input[name="length"]').first().check();
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
        game.pin = new URL(host.page.url()).pathname.split('/').pop().toUpperCase();
        summary.pin = game.pin;

        // 3. The game: pack party, a test game, a party question first.
        const created = await db('GET', `games/${game.pin}`);
        check(created && created.pack === 'party', `the game carries pack party (${created && created.pack})`);
        check(created && created.campaign === 'test', `the game is a test game (${created && created.campaign})`);
        check(created && created.locale === LOCALE, `the game is in ${LOCALE}`);

        await screen.page.goto(`${base}/present-game/${game.pin}`);
        await p2.page.goto(`${base}${he ? '/he' : ''}/join-game/${game.pin}`);
        await p3.page.goto(`${base}${he ? '/he' : ''}/join-game/${game.pin}`);

        // 4. The whole game, every phone acting as in emulator-game.js; the host's question text is read.
        const shown = {};
        let bannerChecked = false;
        const deadline = Date.now() + GAME_TIMEOUT_MS;
        while (Date.now() < deadline && !phones.every((p) => p.done)) {
            if (!game.everyoneIn) {
                const players = await db('GET', `games/${game.pin}/players`);
                game.everyoneIn = players && Object.keys(players).length === 3 && phones.slice(0, 3).every((p) => p.joined);
            }
            const path_ = new URL(host.page.url()).pathname;
            if (!bannerChecked && /game-staging/.test(path_)) {
                const banner = await host.page.locator('.pack-banner').first().innerText().catch(() => '');
                if (banner) {
                    bannerChecked = true;
                    summary.lobbyLine = banner.trim();
                    check(banner.includes('🎉') && banner.includes(he ? 'מהדורת מסיבה' : 'Party edition'), `the lobby shows the party line (${banner.trim()})`);
                    await shot(host, '2-lobby');
                }
            }
            // Every text the host's phone and the big screen showed while question i was on. The host's
            // phone may send its lie before its question has drawn; the big screen shows it all along.
            const i = await db('GET', `games/${game.pin}/questionIndex`);
            for (const p of [host, screen]) {
                if (typeof i === 'number' && /show-question|present-game/.test(new URL(p.page.url()).pathname)) {
                    const text = await p.page.evaluate(() => document.body.innerText).catch(() => '');
                    if (text) shown[i] = (shown[i] || '') + '\n' + text;
                }
            }
            await Promise.all(phones.filter((p) => !p.done).map((p) => act(p, game).catch((e) => {
                if (!/Target closed|Execution context was destroyed|navigation/.test(e.message)) log(`${p.name}: ${e.message.split('\n')[0]}`);
            })));
            await sleep(400);
        }
        await shot(host, '3-final');
        await shot(screen, '4-final-big-screen');

        const final = await db('GET', `games/${game.pin}`);
        check(final && final.state && final.state.id === 6, `the game reached the final scoreboard (state ${final && final.state && final.state.id})`);
        phones.forEach((p) => check(p.done, `${p.name} showed the final scoreboard`));
        // The questions as picked at START (tick.ts picks them again for the players at the table).
        const finalQids = final && final.qids ? Object.values(final.qids) : [];
        summary.qids = finalQids;
        check(isParty(finalQids[0]), `a party question opens the game (${finalQids[0]})`);
        const partyIds = finalQids.filter(isParty);
        check(partyIds.length >= 2 && partyIds.length <= 4, `${partyIds.length} party questions in a ${finalQids.length}-question game`);
        check(partyIds.every((id) => PARTY[id].lang === LOCALE), 'every party question is in the game\'s language');
        // The question on the table's screens, by index: a party question's text, up to its blank.
        const seenParty = [];
        finalQids.forEach((id, i) => {
            if (!isParty(id) || !(i in shown)) return;
            const head = PARTY[id].questionText.split('$blank$')[0].trim().slice(0, 30);
            seenParty.push(id);
            check(shown[i].includes(head), `question ${i + 1} showed ${id} ("${head}...")`);
        });
        check(seenParty.length >= 1, `the screens showed ${seenParty.length} party questions`);
        summary.partyShown = seenParty;
        summary.scores = final && final.players ? Object.values(final.players).map((p) => `${p.nickname}: ${p.score}`) : null;
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
