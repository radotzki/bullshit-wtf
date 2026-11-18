#!/usr/bin/env node
// Local run: START A SECOND TABLE (game/src/app/pages/join-game/second-table.ts), on the built client
// (game/dist) against the Firebase emulators, in headless Chromium. For each language:
//
//  1. A host creates a game and joins; 11 more seats are added, so the table holds 12. The table gets a
//     seasonal pack (Hanukkah) and a post's tag, as a real one may.
//  2. A 13th phone opens the invite link and joins: refused, as before, but the page says the table is
//     full and offers START A SECOND TABLE, in the page's language (Hebrew right to left), at 390 and 320 px.
//  3. It taps it: a new game in the full table's language, with its length and pack, tagged second-table,
//     hosted by this phone under the name it typed, which lands on the lobby with the invite in front.
//  4. A play-test phone (?via=test) refused at a full table makes a second table tagged test, so it
//     stays out of every count. A phone already seated at the full table still gets its seat back.
//  5. A computer (1280 px) refused at the full table sees the same offer.
//  6. (3b) Two more phones refused at the same table are offered JOIN <host>'S SECOND TABLE, with START ANOTHER
//     TABLE below it, at 390 and 320 px; one tap lands each in the first second table, which then holds 3.
//     A computer refused after another started a second table joins it the same way.
//     In English, a fourth phone taps START ANOTHER TABLE: its own table, and the first stays the one offered.
//
// Needs what emulator-game.js needs (Java, functions/ built, the root's npm ci). From the repository root:
//   node .github/smoke/emulator-second-table.js [path to dist]
// SHOTS=<dir> saves screenshots. Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve, fileIn } = require('./smoke');
const { startEmulators, stopEmulators, db, seed, newPhone, visible, log, sleep, HOST, DIST } = require('./emulator-game');

const SHOTS = process.env.SHOTS;

async function until(what, fn, ms = 30000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const v = await fn().catch(() => undefined);
        if (v) return v;
        await sleep(300);
    }
    throw new Error(`timed out waiting for ${what}`);
}

async function shot(phone, name) {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    await phone.page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

const pinOf = (url) => new URL(url).pathname.split('/').pop().toUpperCase();

/** A host creates a game in `locale` and joins it; resolves to its PIN. */
async function hostGame(browser, base, locale, name) {
    const host = await newPhone(browser, base, name, 'host');
    await host.page.goto(`${base}/create-game?lang=${locale}`);
    await host.page.locator('input[name="locale"]').nth(locale === 'he' ? 1 : 0).check();
    await host.page.locator('input[name="length"]').nth(2).check(); // 9 questions
    await host.page.locator('form button[type="submit"]').first().click();
    await host.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
    const pin = pinOf(host.page.url());
    const input = host.page.locator('input[name="nickname"]');
    await until('the host join form', () => visible(input));
    await input.fill(name);
    await host.page.locator('form button[type="submit"]').first().click();
    await host.page.waitForURL(/\/game-staging\//, { timeout: 30000 });
    return { host, pin };
}

/** Fills the table to 12 seats, straight in the database. */
async function fillTable(pin) {
    const players = (await db('GET', `games/${pin}/players`)) || {};
    let i = Object.keys(players).length;
    while (i < 12) {
        i++;
        await db('PUT', `games/${pin}/players/zz-seat-${String(i).padStart(2, '0')}`, { nickname: `guest${i}`, score: 0, uid: `seat-uid-${i}` });
    }
    return i;
}

/** Opens the invite link and taps JOIN under `name`. */
async function joinByLink(phone, base, pin, locale, via = 'link') {
    await phone.page.goto(`${base}${locale === 'he' ? '/he' : ''}/join-game/${pin}?via=${via}`);
    const input = phone.page.locator('input[name="nickname"]');
    await until('the join form', () => visible(input));
    await input.fill(phone.name);
    await phone.page.locator('form button[type="submit"]').first().click();
}

async function main() {
    if (!fileIn(DIST, '/index.html')) throw new Error(`No built game at ${DIST}`);
    const emulators = await startEmulators();
    const problems = [];
    const check = (ok, text) => { if (!ok) problems.push(text); };
    const summary = {};
    let browser;
    let server;
    try {
        await seed();
        server = await serve(DIST);
        const base = `http://${HOST}:${server.address().port}`;
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`] });
        const phones = [];

        for (const locale of ['he', 'en']) {
            const { host, pin } = await hostGame(browser, base, locale, locale === 'he' ? 'נועה' : 'Ana');
            phones.push(host);
            await db('PATCH', `games/${pin}`, { pack: 'hanukkah', campaign: locale === 'he' ? 'pitch-he-zofim' : 'reddit-en' });
            const hostPid = Object.keys(await db('GET', `games/${pin}/players`))[0];
            await fillTable(pin);
            log(`${locale}: table ${pin} holds 12`);

            // 2. The 13th phone.
            const late = await newPhone(browser, base, locale === 'he' ? 'דני' : 'Dan', 'player');
            phones.push(late);
            await joinByLink(late, base, pin, locale);
            const card = late.page.locator('.second-table');
            check(await until(`${locale}: the second-table offer`, () => visible(card)).catch(() => false), `${locale}: no offer at a full table`);
            const text = (await card.innerText()).replace(/\s+/g, ' ').trim();
            const dir = await late.page.locator('.join-game').getAttribute('dir');
            check(locale === 'he' ? dir === 'rtl' && /השולחן הזה מלא/.test(text) : dir === null && /This table is full/.test(text),
                `${locale}: the offer is not in the page's language: dir=${dir} "${text}"`);
            check(!(await visible(late.page.locator('input[name="nickname"]'))), `${locale}: the nickname box still shows beside the offer`);
            check(Object.keys(await db('GET', `games/${pin}/players`)).length === 12, `${locale}: a 13th seat was made`);
            await shot(late, `${locale}-1-full-table-390`);
            await late.page.setViewportSize({ width: 320, height: 640 });
            // The offer, its words and its buttons stay inside the screen.
            const wide = await late.page.evaluate(() => [...document.querySelectorAll('.second-table, .second-table *')]
                .map((el) => ({ el: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`, r: el.getBoundingClientRect() }))
                .filter((x) => x.r.left < 0 || x.r.right > 320).map((x) => `${x.el} ${x.r.left}-${x.r.right}`));
            check(!wide.length, `${locale}: past the screen at 320: ${wide.join(', ')}`);
            await shot(late, `${locale}-1-full-table-320`);
            await late.page.setViewportSize({ width: 390, height: 800 });

            // 3. START A SECOND TABLE.
            await late.page.locator('.second-table-start').click();
            await late.page.waitForURL(/\/game-staging\//, { timeout: 30000 });
            const second = pinOf(late.page.url());
            const game = await db('GET', `games/${second}`);
            const seats = Object.values(game.players || {});
            check(second !== pin, `${locale}: the second table is the full one`);
            check(game.locale === locale, `${locale}: the second table plays in ${game.locale}`);
            check(game.totalQ === 9, `${locale}: the second table has ${game.totalQ} questions, not the full table's 9`);
            check(game.pack === 'hanukkah', `${locale}: the second table's pack is ${game.pack}`);
            check(game.campaign === 'second-table', `${locale}: the second table is tagged ${game.campaign}`);
            check(seats.length === 1 && seats[0].host === true && seats[0].nickname === late.name,
                `${locale}: the second table's seats: ${JSON.stringify(seats)}`);
            const invite = late.page.locator('.invite-inline');
            check(await until(`${locale}: the lobby's invite`, () => visible(invite)).catch(() => false), `${locale}: the lobby shows no invite in front`);
            await sleep(800);
            await shot(late, `${locale}-2-second-table-lobby-390`);
            summary[locale] = { full: pin, second, locale: game.locale, totalQ: game.totalQ, pack: game.pack, campaign: game.campaign, text };
            log(`${locale}: refused phone started ${second} (${game.locale}, ${game.totalQ} q, ${game.pack}, ${game.campaign})`);

            // 3b. Two more phones refused at the same full table: offered the first second table, by its host's
            //     name, ahead of START ANOTHER TABLE, and one tap lands each in it. One table of three, not three of one.
            const kept = await db('GET', `games/${pin}/secondTable`);
            check(kept && kept.pin === second, `${locale}: the full table keeps ${JSON.stringify(kept)}, not ${second}`);
            const more = locale === 'he' ? ['עומר', 'טל'] : ['Omer', 'Tal'];
            for (let i = 0; i < more.length; i++) {
                const next = await newPhone(browser, base, more[i], 'player');
                phones.push(next);
                await joinByLink(next, base, pin, locale);
                const joinBtn = next.page.locator('.second-table-join');
                check(await until(`${locale}: ${next.name}'s join offer`, () => visible(joinBtn)).catch(() => false),
                    `${locale}: refused phone ${i + 2} is not offered the second table`);
                const label = (await joinBtn.innerText()).replace(/\s+/g, ' ').trim();
                check(label.toUpperCase().includes(late.name.toUpperCase()), `${locale}: the join button does not name the host: "${label}"`);
                check(await visible(next.page.locator('.second-table-another')), `${locale}: no START ANOTHER TABLE below the join`);
                check(!(await visible(next.page.locator('.second-table-start'))), `${locale}: START A SECOND TABLE still leads`);
                if (i === 0) {
                    await shot(next, `${locale}-5-join-second-table-390`);
                    await next.page.setViewportSize({ width: 320, height: 640 });
                    const wide2 = await next.page.evaluate(() => [...document.querySelectorAll('.second-table, .second-table *')]
                        .map((el) => ({ el: `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`, r: el.getBoundingClientRect() }))
                        .filter((x) => x.r.left < 0 || x.r.right > 320).map((x) => `${x.el} ${x.r.left}-${x.r.right}`));
                    check(!wide2.length, `${locale}: the join offer is past the screen at 320: ${wide2.join(', ')}`);
                    await shot(next, `${locale}-5-join-second-table-320`);
                    await next.page.setViewportSize({ width: 390, height: 800 });
                }
                await joinBtn.click();
                await next.page.waitForURL(new RegExp(`/game-staging/${second}`, 'i'), { timeout: 30000 })
                    .catch(() => problems.push(`${locale}: ${next.name} did not land in ${second}: ${next.page.url()}`));
            }
            const secondSeats = Object.values((await db('GET', `games/${second}/players`)) || {});
            check(secondSeats.length === 3, `${locale}: the second table holds ${secondSeats.length}, not 3`);
            check(Object.keys(await db('GET', `games/${pin}/players`)).length === 12, `${locale}: a 13th seat after the joins`);
            await sleep(800);
            await shot(late, `${locale}-6-second-table-host-lobby-3-players-390`);
            summary[locale].secondSeats = secondSeats.map((x) => x.nickname);
            log(`${locale}: ${secondSeats.length} at ${second}: ${secondSeats.map((x) => x.nickname).join(', ')}`);

            // 3c. A fourth refused phone that taps START ANOTHER TABLE gets a table of its own; the first stays the
            //     one offered while it has seats.
            if (locale === 'en') {
                const own = await newPhone(browser, base, 'Uri', 'player');
                phones.push(own);
                await joinByLink(own, base, pin, locale);
                await until('the fourth offer', () => visible(own.page.locator('.second-table-another')));
                await own.page.locator('.second-table-another').click();
                await own.page.waitForURL(/\/game-staging\//, { timeout: 30000 });
                const third = pinOf(own.page.url());
                check(third !== second && third !== pin, `en: START ANOTHER TABLE went to ${third}`);
                const thirdGame = await db('GET', `games/${third}`);
                check(thirdGame.campaign === 'second-table' && thirdGame.locale === 'en', `en: another table: ${thirdGame.campaign} ${thirdGame.locale}`);
                const still = await db('GET', `games/${pin}/secondTable/pin`);
                check(still === second, `en: the offered second table became ${still}`);
                summary.en.another = third;
            }

            // The host, already seated at the full table, still gets the seat back.
            const hostSeat = await db('GET', `games/${pin}/players/${hostPid}`);
            check(hostSeat && hostSeat.host === true, `${locale}: the full table's host lost the seat`);
        }

        // 4. A play-test phone at a full test table, and a play-test tab at a real table.
        const { host: testHost, pin: testPin } = await hostGame(browser, base, 'en', 'Tess');
        phones.push(testHost);
        await fillTable(testPin);
        const tester = await newPhone(browser, base, 'Tom', 'player');
        phones.push(tester);
        await joinByLink(tester, base, testPin, 'en', 'test');
        await until('the test offer', () => visible(tester.page.locator('.second-table')));
        // A tag on the join link counts as the tab's arrival (?via=test, rememberArrivalSource).
        await tester.page.locator('.second-table-start').click();
        await tester.page.waitForURL(/\/game-staging\//, { timeout: 30000 });
        const testSecond = await db('GET', `games/${pinOf(tester.page.url())}/campaign`);
        check(testSecond === 'test', `a play-test tab's second table is tagged ${testSecond}, not test`);
        summary.test = { full: testPin, campaign: testSecond };
        log(`test: second table tagged ${testSecond}`);

        // A phone seated at the full table that opens the link again gets its seat back, no offer.
        const testSeats = await db('GET', `games/${testPin}/players`);
        const hostPid = Object.keys(testSeats).find((k) => testSeats[k].host);
        await joinByLink(testHost, base, testPin, 'en');
        await testHost.page.waitForURL(/\/game-staging\//, { timeout: 30000 }).catch(() => problems.push('the seated host was not let back in'));
        check(Object.keys(await db('GET', `games/${testPin}/players`)).length === 12, 'the seated host took a 13th seat');
        check((await db('GET', `games/${testPin}/players/${hostPid}/host`)) === true, 'the seated host lost the seat');

        // 5. A computer.
        const { pin: bigPin, host: bigHost } = await hostGame(browser, base, 'he', 'מיכל');
        phones.push(bigHost);
        await fillTable(bigPin);
        const computer = await newPhone(browser, base, 'רון', 'screen');
        phones.push(computer);
        await joinByLink(computer, base, bigPin, 'he');
        check(await until('the computer offer', () => visible(computer.page.locator('.second-table'))).catch(() => false), 'no offer on a computer');
        await shot(computer, 'he-3-full-table-computer-1280');
        const computerEn = await newPhone(browser, base, 'Ron', 'screen');
        phones.push(computerEn);
        await joinByLink(computerEn, base, bigPin, 'en');
        await until('the computer offer, English page', () => visible(computerEn.page.locator('.second-table')));
        await shot(computerEn, 'en-3-full-table-computer-1280');
        await computerEn.page.locator('.second-table-start').click();
        await computerEn.page.waitForURL(/\/game-staging\//, { timeout: 30000 });
        const fromEnglishPage = await db('GET', `games/${pinOf(computerEn.page.url())}/locale`);
        // The full table is Hebrew: its second table is Hebrew, whatever the page's language.
        check(fromEnglishPage === 'he', `an English page's second table of a Hebrew table plays in ${fromEnglishPage}`);
        await sleep(800);
        await shot(computerEn, 'en-4-second-table-lobby-computer-1280');
        // The next computer refused at that table is offered the English page's second table, and joins it.
        const computerNext = await newPhone(browser, base, 'יעל', 'screen');
        phones.push(computerNext);
        await joinByLink(computerNext, base, bigPin, 'he');
        const bigJoin = computerNext.page.locator('.second-table-join');
        check(await until('the computer join offer', () => visible(bigJoin)).catch(() => false), 'no join offer on a computer');
        await shot(computerNext, 'he-7-join-second-table-computer-1280');
        await bigJoin.click();
        const bigSecond = pinOf(computerEn.page.url());
        await computerNext.page.waitForURL(new RegExp(`/game-staging/${bigSecond}`, 'i'), { timeout: 30000 })
            .catch(() => problems.push(`the computer did not land in ${bigSecond}: ${computerNext.page.url()}`));

        phones.forEach((p) => p.problems.forEach((x) => problems.push(`${p.name}: ${x}`)));
    } catch (e) {
        problems.push(`run failed: ${e.stack || e.message}`);
    } finally {
        if (browser) await browser.close().catch(() => { });
        if (server) server.close();
        stopEmulators(emulators);
    }
    console.log(JSON.stringify({ ok: !problems.length, problems, summary }, null, 2));
    process.exit(problems.length ? 1 : 0);
}

main();
