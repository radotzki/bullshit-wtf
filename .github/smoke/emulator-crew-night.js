#!/usr/bin/env node
// Local run: WHO'S IN? on a crew page of the built client (game/dist), in headless Chromium against
// the Firebase emulators, with the phones and the emulators of emulator-game.js. A test crew (its
// link opened with ?via=test, its games test games), a date, three people saying "I'm in", one of
// them a friend the crew never had, and on the night the lobby opening for all three.
//
// What it walks through, each step checked on the page and in the database:
//   1. A member opens the crew link: no night yet, so the page is the plain crew page.
//   2. She sends the date from NEXT GAME NIGHT. The page now opens with GAME NIGHT: the date, the
//      countdown, who holds the title, and her name in the list. Her phone reads "You're in".
//   3. A second member taps I'M IN (one tap: the phone remembers his nickname), then "Can't make it",
//      then I'M IN again: one name, not two.
//   4. A friend who never played opens the link: one line on what the game is, a name to type. A
//      name the filter refuses is refused; a real one is in. Three are in, and ASK WHO ELSE IS IN
//      carries their names.
//   5. The night comes (the run moves the stored time to an hour from now, in place of waiting):
//      every phone shows IT'S GAME NIGHT and one button. The first tap opens the lobby, the others
//      land in the same one. The game is the crew's, in its language, and a test game.
//   6. The home page of a phone that remembers the crew leads with TONIGHT.
//   7. The night passes unplayed: the page offers PICK A NIGHT. Played: the plain page again.
//   8. Counting: a test crew's presses send no row. A crew that is not a test sends `in-new`.
//
// Nothing reaches production (see emulator-game.js); the count rows are caught in the browser and
// never sent on. From the repository root, with functions/ and game/ built:
//   node .github/smoke/emulator-crew-night.js [path to dist] [--locale en|he]
// SHOTS=<dir> saves a screenshot of each step. Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve, fileIn } = require('./smoke');
const { ROOT, DIST, LOCALE, HOST, DB, PROJECT, log, sleep, up, startEmulators, stopEmulators, db, seed, newPhone, visible } = require('./emulator-game');

const he = LOCALE === 'he';
const NAMES = he ? { a: 'דנה', b: 'אבי', c: 'נועה', friend: 'מאיה' } : { a: 'Dana', b: 'Avi', c: 'Noa', friend: 'Maya' };
const WORDS = he
    ? {
        gameNight: 'ערב המשחק', whosIn: 'מי בפנים?', imIn: 'אני בפנים', youreIn: 'נרשמת. נתראה ב', holds: `התואר אצל ${NAMES.a}`,
        whatIsIt: 'בולשיט הוא משחק חברתי בטלפונים', itsGameNight: 'ערב המשחק התחיל', openLobby: 'פותחים משחק', join: 'הצטרפו למשחק החוזר',
        inCount: (n) => `${n} בפנים:`, passed: 'הערב הזה עבר. קובעים חדש?', pick: 'קביעת ערב', nudge: 'כבר בפנים לבולשיט', missing: 'מי חסר?',
        refused: 'השם הזה לא עובר אצלנו', days: (d) => (d === 1 ? 'מחר' : d === 2 ? 'בעוד יומיים' : `בעוד ${d} ימים`),
    }
    : {
        gameNight: 'GAME NIGHT', whosIn: "WHO'S IN?", imIn: "I'M IN", youreIn: "You're in. See you ", holds: `${NAMES.a} holds the title`,
        whatIsIt: 'Bullshit is a party game on your phones', itsGameNight: "IT'S GAME NIGHT", openLobby: 'OPEN THE LOBBY', join: 'JOIN THE REMATCH',
        inCount: (n) => `${n} in:`, passed: 'That night has passed. Pick a new one?', pick: 'PICK A NIGHT', nudge: 'of us are in for Bullshit on', missing: "Who's missing?",
        refused: "That name's not allowed", days: (d) => (d === 1 ? 'tomorrow' : `in ${d} days`),
    };
const key = (name) => name.trim().toLowerCase();

/** A saved crew as the functions store one: three members, two counted games, the first member ahead. */
function crewOf(id, test) {
    const now = Date.now();
    const member = (nickname, wins, points, uid) => ({ nickname, games: 2, wins, points, best: 3000, uids: { [uid]: true } });
    const crew = {
        id,
        name: he ? `החבורה של ${NAMES.a}` : `${NAMES.a}'s crew`,
        locale: LOCALE,
        totalQ: 5,
        createdAt: now - 3600000,
        gameCount: 2,
        // Last played a week ago: not the night this run sets.
        lastPlayed: now - 7 * 24 * 3600000,
        members: {
            [key(NAMES.a)]: member(NAMES.a, 2, 6000, 'ua'),
            [key(NAMES.b)]: member(NAMES.b, 0, 3500, 'ub'),
            [key(NAMES.c)]: member(NAMES.c, 0, 2000, 'uc'),
        },
        games: {
            AAAA: { time: now - 7 * 24 * 3600000 - 1200000, players: 3, counted: true, winners: [key(NAMES.a)] },
            AAAB: { time: now - 7 * 24 * 3600000, players: 3, counted: true, winners: [key(NAMES.a)] },
        },
    };
    if (test) crew.test = 'test';
    return crew;
}

/** The phone remembers the crew and the nickname it played under, as after a crew game. */
async function remembers(phone, crew, nickname) {
    await phone.context.addInitScript(([id, name, nick]) => {
        if (!window.localStorage.getItem('BS_CREWS')) {
            window.localStorage.setItem('BS_CREWS', JSON.stringify([{ id, name, nickname: nick, time: Date.now() }]));
        }
    }, [crew.id, crew.name, nickname]);
}

async function main() {
    if (!fileIn(DIST, '/index.html')) throw new Error(`No built game at ${DIST}`);
    if (!fs.existsSync(path.join(ROOT, 'functions', 'dist', 'index.js'))) throw new Error('Build functions/ first: npm run build there');
    const emulators = await startEmulators();
    const problems = [];
    const steps = [];
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
        const crew = crewOf('k7m2qx', true);
        const counted = crewOf('p3n8wz', false);
        await db('PUT', `crews/${crew.id}`, crew);
        await db('PUT', `crews/${counted.id}`, counted);

        server = await serve(DIST);
        const base = `http://${HOST}:${server.address().port}`;
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`] });
        const link = `${base}${he ? '/he' : ''}/c/${crew.id}?via=test`;

        const a = await newPhone(browser, base, NAMES.a, 'player');
        const b = await newPhone(browser, base, NAMES.b, 'player');
        const friend = await newPhone(browser, base, NAMES.friend, 'player');
        const stranger = await newPhone(browser, base, 'stranger', 'player');
        const phones = [a, b, friend, stranger];
        const shares = [];
        for (const p of phones) {
            // The count rows (onShare) are caught here and never sent on: the run only reads them.
            await p.context.route(/cloudfunctions\.net\/onShare/, (route) => {
                if (route.request().method() === 'POST') {
                    shares.push(Object.assign({ phone: p.name }, route.request().postDataJSON()));
                }
                return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, body: '{"counted":true}' });
            });
            // WhatsApp and calendar links open a new tab, which goes nowhere here.
            p.context.on('page', (opened) => { if (opened !== p.page) opened.close().catch(() => { }); });
        }
        await remembers(a, crew, NAMES.a);
        await remembers(b, crew, NAMES.b);

        const text = (p) => p.page.evaluate(() => document.body.innerText).catch(() => '');
        const until = async (what, fn, ms = 15000) => {
            const end = Date.now() + ms;
            let last;
            while (Date.now() < end) {
                last = await fn().catch(() => false);
                if (last) return last;
                await sleep(250);
            }
            check(false, `${what} (waited ${ms / 1000} s)`);
            return null;
        };
        const shot = async (p, name) => {
            if (process.env.SHOTS) await p.page.screenshot({ path: path.join(process.env.SHOTS, `${LOCALE}-${name}.png`), fullPage: true }).catch(() => { });
        };
        const night = () => db('GET', `crews/${crew.id}/night`);

        // 1. No night yet: the plain crew page.
        await a.page.goto(link);
        await until('the crew page loads', () => visible(a.page.locator('table.standings')));
        check(!(await visible(a.page.locator('.game-night'))), 'with no night set, the page has no game night block');
        check(await visible(a.page.locator('button.rematch')), 'with no night set, REMATCH is where it was');
        await shot(a, '1-no-night');

        // 2. She sends the date from NEXT GAME NIGHT (next Friday 21:00 by default).
        await a.page.locator('a.night-whatsapp').click();
        const set = await until('the date is stored on the crew', async () => (await night()) || null);
        check(!!set && set.by === NAMES.a && set.in && set.in[key(NAMES.a)] === NAMES.a, `the night is stored with ${NAMES.a} in: ${JSON.stringify(set)}`);
        const days = Math.round((new Date(set.time).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000);
        await until('the page shows the game night block', () => visible(a.page.locator('.game-night.is-before')));
        let t = await text(a);
        check(t.includes(WORDS.gameNight) && t.includes(WORDS.whosIn), 'GAME NIGHT and WHO\'S IN? are on the page');
        check(t.includes(WORDS.days(days)), `the countdown reads "${WORDS.days(days)}"`);
        check(t.includes(WORDS.holds), `the title line reads "${WORDS.holds}"`);
        check(t.includes(WORDS.youreIn), `${NAMES.a}'s phone reads "${WORDS.youreIn}..."`);
        check(!t.includes(WORDS.whatIsIt), 'a returning player gets no line on what the game is');
        check(!(await visible(a.page.locator('a.nudge'))), 'with one name in, ASK WHO ELSE IS IN is not offered');
        await shot(a, '2-night-set');

        // 3. A second member: one tap, take it back, one tap again.
        await b.page.goto(link);
        await until(`${NAMES.b} sees I'M IN`, () => visible(b.page.locator('button.im-in')));
        check(!(await visible(b.page.locator('input.in-name-input'))), 'a phone the crew knows is not asked for a name');
        await b.page.locator('button.im-in').click();
        await until(`${NAMES.b} is in`, async () => ((await night()).in || {})[key(NAMES.b)] === NAMES.b);
        await until(`${NAMES.b}'s phone reads "You're in"`, async () => (await text(b)).includes(WORDS.youreIn));
        await b.page.locator('.cant-make-it button').click();
        await until(`"Can't make it" takes ${NAMES.b} off`, async () => !((await night()).in || {})[key(NAMES.b)]);
        await until(`${NAMES.b} sees I'M IN again`, () => visible(b.page.locator('button.im-in')));
        await b.page.locator('button.im-in').click();
        await until(`${NAMES.b} is in again`, async () => ((await night()).in || {})[key(NAMES.b)] === NAMES.b);
        check(Object.keys((await night()).in).length === 2, 'in, out and in again is one name: two are in');

        // 4. A friend who never played.
        await friend.page.goto(link);
        await until('the friend sees the name field', () => visible(friend.page.locator('input.in-name-input')));
        t = await text(friend);
        check(t.includes(WORDS.whatIsIt), 'a first-time visitor gets the line on what the game is');
        check(await friend.page.locator('button.im-in').isDisabled(), "I'M IN waits for a name");
        await shot(friend, '4-friend-arrives');
        await friend.page.locator('input.in-name-input').fill('cumshot');
        await friend.page.locator('button.im-in').click();
        await until('a refused name is refused on the page', async () => (await text(friend)).includes(WORDS.refused));
        check(Object.keys((await night()).in).length === 2, 'the refused name is not on the list');
        await friend.page.locator('input.in-name-input').fill(NAMES.friend);
        await friend.page.locator('button.im-in').click();
        await until(`${NAMES.friend} is in`, async () => ((await night()).in || {})[key(NAMES.friend)] === NAMES.friend);
        await until('the friend\'s phone reads "You\'re in"', async () => (await text(friend)).includes(WORDS.youreIn));
        const members = await db('GET', `crews/${crew.id}/members`);
        check(Object.keys(members).length === 3 && !members[key(NAMES.friend)], 'saying "I\'m in" does not put the friend in the standings');
        await until('every phone lists the three who are in', async () => {
            const all = await Promise.all([a, b, friend].map(text));
            return all.every((x) => [NAMES.a, NAMES.b, NAMES.friend].every((nm) => x.split(WORDS.whosIn)[1].includes(nm)));
        });
        const nudge = await until('ASK WHO ELSE IS IN is offered once two are in', () => a.page.locator('a.nudge').getAttribute('href'));
        const said = decodeURIComponent(nudge || '');
        check(said.includes(WORDS.nudge) && said.includes(WORDS.missing) && [NAMES.a, NAMES.b, NAMES.friend].every((nm) => said.includes(nm))
            && said.includes(`/c/${crew.id}`), `the nudge names who is in and carries the crew link: ${said}`);
        await shot(a, '4-three-in');
        await shot(friend, '4-friend-in');

        // 5. The night comes: the stored time moves to an hour from now.
        await db('PUT', `crews/${crew.id}/night/time`, Math.floor((Date.now() + 3600000) / 60000) * 60000);
        await until('every phone shows the lobby button', async () => (await Promise.all([a, b, friend].map((p) => visible(p.page.locator('button.open-lobby'))))).every(Boolean));
        t = await text(friend);
        check(t.includes(WORDS.itsGameNight) && t.includes(WORDS.openLobby) && t.includes(WORDS.inCount(3)), `on the night: "${WORDS.itsGameNight}", "${WORDS.openLobby}", "${WORDS.inCount(3)} ..."`);
        check(!(await visible(friend.page.locator('button.rematch'))) && !(await visible(friend.page.locator('button.im-in'))), 'on the night the top of the page is one button');
        await shot(friend, '5-on-the-night');

        // 6. The home page of a phone that remembers the crew leads with TONIGHT.
        await stranger.page.goto(`${base}/m`);
        await sleep(1500);
        check(!(await visible(stranger.page.locator('.crew.tonight'))), 'a phone that remembers no crew gets no TONIGHT line');
        const home = a.page;
        // The big-screen home page lists it first under "Your crews"; the phone menu leads with it.
        await home.goto(`${base}/d`);
        await until('the desktop home page shows TONIGHT', () => visible(home.locator('a.button.tonight')));
        await home.goto(`${base}/m`);
        const tonight = await until('the home page leads with TONIGHT', async () => (await visible(home.locator('.crew.tonight'))) && home.locator('.crew.tonight').innerText());
        check(!!tonight && /\d\d:\d\d/.test(tonight) && tonight.includes(crew.name) && tonight.includes(he ? 'הערב ב' : 'TONIGHT'), `the home page line reads "${tonight}"`);
        if (process.env.SHOTS) await home.screenshot({ path: path.join(process.env.SHOTS, `${LOCALE}-6-home-tonight.png`) }).catch(() => { });
        await home.locator('.crew.tonight').click();
        await until('the TONIGHT line opens the crew page', () => visible(home.locator('button.open-lobby')));

        // The first tap opens the lobby; the others land in the same one.
        await home.locator('button.open-lobby').click();
        await home.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
        const pin = new URL(home.url()).pathname.split('/').pop().toUpperCase();
        check(new URL(home.url()).searchParams.get('via') === 'crew', 'the lobby opens with via=crew');
        const game = await db('GET', `games/${pin}`);
        check(!!game && game.crew === crew.id && game.locale === LOCALE && game.origin === 'crew', `the lobby ${pin} is the crew's game, in ${LOCALE}`);
        check(!!game && game.campaign === 'test', 'a test crew\'s night opens a test game');
        await until(`${NAMES.b}'s button now reads "${WORDS.join}"`, async () => (await text(b)).includes(WORDS.join));
        for (const p of [b, friend]) {
            await p.page.locator('button.open-lobby').click();
            await p.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
            check(new URL(p.page.url()).pathname.split('/').pop().toUpperCase() === pin, `${p.name} lands in the same lobby`);
        }
        // Each phone's name is waiting in the join form: the friend's too, from the night's list.
        for (const [p, page] of [[a, home], [b, b.page], [friend, friend.page]]) {
            const input = page.locator('input[name="nickname"]');
            await until(`${p.name}'s name is filled in at the lobby`, async () => (await input.inputValue()) === p.name);
            await page.locator('form button[type="submit"]').first().click();
            await page.waitForURL(/\/game-staging\//, { timeout: 30000 });
        }
        const players = await db('GET', `games/${pin}/players`);
        check(Object.keys(players || {}).length === 3, `all three are in the lobby: ${Object.values(players || {}).map((p) => p.nickname).join(', ')}`);
        await shot(friend, '5-lobby');

        // 7. The night passes. Nobody played: PICK A NIGHT. Played: the plain page.
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 2);
        yesterday.setHours(21, 0, 0, 0);
        await db('PUT', `crews/${crew.id}/night/time`, yesterday.getTime());
        await stranger.page.goto(link);
        await until('after an unplayed night the page offers PICK A NIGHT', () => visible(stranger.page.locator('button.pick-night')));
        t = await text(stranger);
        check(t.includes(WORDS.passed) && t.includes(WORDS.pick), `it reads "${WORDS.passed}" and "${WORDS.pick}"`);
        check(await visible(stranger.page.locator('button.rematch')), 'REMATCH is back under the standings');
        await shot(stranger, '7-night-passed');
        await stranger.page.locator('button.pick-night').click();
        await until('PICK A NIGHT goes to the date inputs', () => stranger.page.evaluate(() => document.activeElement && document.activeElement.getAttribute('name') === 'nightDate'));
        await db('PUT', `crews/${crew.id}/lastPlayed`, yesterday.getTime() + 3600000);
        await until('after a played night the block is gone', async () => !(await visible(stranger.page.locator('.game-night'))));

        // 8. Counting. The test crew sent no row for the night block's presses.
        const mine = ['in', 'in-new', 'out', 'nudge', 'open-lobby'];
        const fromTest = shares.filter((s) => s.crew === crew.id && mine.includes(s.method));
        check(fromTest.length === 0, `a test crew's presses are not counted: ${JSON.stringify(fromTest)}`);
        // A crew that is not a test: a new name's I'M IN is one `in-new` row.
        await db('PUT', `crews/${counted.id}/night`, { time: set.time, by: NAMES.a, in: { [key(NAMES.a)]: NAMES.a } });
        await stranger.page.goto(`${base}${he ? '/he' : ''}/c/${counted.id}`);
        await until('the other crew\'s page asks for a name', () => visible(stranger.page.locator('input.in-name-input')));
        await stranger.page.locator('input.in-name-input').fill(NAMES.friend);
        await stranger.page.locator('button.im-in').click();
        const row = await until('a crew that is no test counts the press', async () => shares.find((s) => s.crew === counted.id && mine.includes(s.method)));
        check(!!row && row.content_type === 'crew-night' && row.method === 'in-new' && row.locale === LOCALE, `the row is crew-night / in-new: ${JSON.stringify(row)}`);

        // Every page is in the crew's language.
        for (const p of [b, friend, stranger]) {
            const body = (await text(p)).replace(new RegExp(Object.values(NAMES).join('|'), 'g'), '');
            if (he !== /[\u0590-\u05FF]/.test(body)) problems.push(`${p.name}'s last screen is not in ${he ? 'Hebrew' : 'English'}`);
        }
        phones.forEach((p) => p.problems.forEach((x) => problems.push(`${p.name}: ${x}`)));

        console.log('\nRESULT ' + JSON.stringify({ build: DIST, locale: LOCALE, crew: crew.id, pin, steps, shares: shares.map((s) => `${s.crew}: ${s.content_type}/${s.method}`), problems }, null, 2));
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
