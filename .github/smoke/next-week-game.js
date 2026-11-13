#!/usr/bin/env node
// Local run: "Same time next week?" (game/src/app/components/next-week) in headless Chromium, against
// the Firebase emulators. Three phones and the big screen play two games of one sitting, the second
// from REMATCH, as a test game (?via=test), in each half of the 50/50 test and in English and Hebrew.
//
// In the new half it checks what no unit test can: the server's half on the final state, the button
// on every phone and its words for the winner and the rest, the sheet making the crew with tonight's
// two games counted, the WhatsApp link's text, the date landing on the crew, the banner and I'M IN on
// the other phones, the calendar file, the big screen's line, the rows sent to `shares`, and (once)
// a renamed crew, the buttons swapping after 40 seconds, and a third game that opens on the banner.
// In the other half it checks that the final screen is today's, with its save-crew offer.
//
// Nothing reaches production: see emulator-game.js, whose emulators, phones and moves this run uses.
// From the repository root, with game/ and functions/ built and the root's npm ci done:
//   node .github/smoke/next-week-game.js [path to dist]
// ONLY=en-new,he-new,en-old,he-old plays only those sittings. SHOTS=<dir> saves screenshots of the final screen, the sheet and the banner. PLAYERS=<n> (default 3,
// up to the table's size) and PHONE=<width>x<height> (default 390x800) play a bigger table on a
// smaller phone. Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');
const { serve, fileIn, HOST } = require('./smoke');
const emu = require('./emulator-game');

const { ROOT, DIST, startEmulators, stopEmulators, up, db, seed, newPhone, act, visible, sleep, log } = emu;
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const SHOTS = process.env.SHOTS || '';
const PLAYERS = Math.max(3, Number(process.env.PLAYERS || 3));
const PHONE = /^(\d+)x(\d+)$/.exec(process.env.PHONE || '');
const GAME_TIMEOUT_MS = Number(process.env.GAME_MINUTES || 6) * 60 * 1000;

// The game's own code, so the run checks the screen against it and not against a copy.
const ts = require(path.join(ROOT, 'game', 'node_modules', 'typescript'));
function loadTs(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    const req = (name) => (name.startsWith('.') ? loadTs(path.join(path.dirname(file), name + '.ts')) : require(name));
    new Function('module', 'exports', 'require', out)(mod, mod.exports, req);
    return mod.exports;
}
const words = loadTs(path.join(ROOT, 'game', 'src', 'app', 'components', 'next-week', 'next-week.ts'));
const night = loadTs(path.join(ROOT, 'game', 'src', 'app', 'pages', 'crew', 'next-night.ts'));
const finalWords = loadTs(path.join(ROOT, 'game', 'src', 'app', 'pages', 'score-board-final', 'final-strings.ts')).finalStrings;
const model = require(path.join(ROOT, 'functions', 'dist', 'game-model.js'));

/** The half a sitting falls in, as functions/src/controllers/next-week.ts works it out. */
const half = (root) => crypto.createHash('sha256').update('next-week:' + root.toUpperCase(), 'utf8').digest()[0] % 2 === 1;
/** The PIN the game counter gives (generateGameName in new-game.ts). */
const pinOf = (counter) => counter.toString(26).replace(/\d/g, (d) => 'qrstuvwxyz'[d]).toUpperCase().padStart(4, 'Q');

const NAMES = {
    en: ['Ana', 'Ben', 'Cleo', 'Dov', 'Eli', 'Fay', 'Gil', 'Hen', 'Ido', 'Jo', 'Kim', 'Lev'],
    he: ['דנה', 'יוסי', 'מיכל', 'עומר', 'נועה', 'אבי', 'גיל', 'חן', 'טל', 'יעל', 'ליאור', 'רון'],
};

const screenOf = (page) => new URL(page.url()).pathname.replace(/^\/he(?=\/|$)/, '').split('/');

/** Plays the game every phone is in (or on its way to) until all of them show its final scoreboard. */
async function playToFinal(phones, game, problems) {
    const deadline = Date.now() + GAME_TIMEOUT_MS;
    const there = (p) => { const s = screenOf(p.page); return s[1] === 'score-board-final' && (s[2] || '').toUpperCase() === game.pin; };
    phones.forEach((p) => { p.lies = []; p.picks = []; p.done = false; });
    while (Date.now() < deadline && !phones.every(there)) {
        if (!game.everyoneIn) {
            const players = await db('GET', `games/${game.pin}/players`);
            game.everyoneIn = !!players && Object.keys(players).length === phones.filter((p) => p.role !== 'screen').length
                && phones.filter((p) => p.role !== 'screen').every((p) => p.joined);
        }
        await Promise.all(phones.filter((p) => !there(p)).map((p) => {
            // A phone still on the last game's final screen waits there: it follows when the rematch starts.
            if (screenOf(p.page)[1] === 'score-board-final') return null;
            return act(p, game).catch((e) => {
                if (!/Target closed|Execution context was destroyed|navigation/.test(e.message)) log(`${p.name}: ${e.message.split('\n')[0]}`);
            });
        }));
        await sleep(400);
    }
    if (!phones.every(there)) problems.push(`game ${game.pin}: not every phone reached its final scoreboard`);
    // The final screen reads its players and the server's half before it settles.
    await sleep(2500);
}

async function waitFor(what, check, problems, ms = 15000) {
    const until = Date.now() + ms;
    let last;
    while (Date.now() < until) {
        try {
            last = await check();
            if (last) return last;
        } catch (e) { last = e.message; }
        await sleep(300);
    }
    problems.push(`${what} (waited ${ms / 1000} s; last: ${JSON.stringify(last)})`);
    return null;
}

async function shot(page, name) {
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false }).catch(() => { });
}

/** One sitting: two games (three when `third`), in the language and the half asked for. */
async function sitting(base, emulators, { locale, wantNew, rename, swap, third, senderWins }) {
    const tag = `${locale}-${wantNew ? 'new' : 'old'}`;
    const problems = [];
    const check = (ok, what) => { if (!ok) problems.push(what); return ok; };
    const he = locale === 'he';
    const t = words.nextWeekWords(locale);
    log(`--- ${tag}: ${PLAYERS} phones and the big screen ---`);
    // A browser of its own: one browser with every sitting's pages in it crashed its pages.
    const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`, '--autoplay-policy=no-user-gesture-required'] });

    const names = NAMES[locale].slice(0, PLAYERS);
    const phones = [];
    for (let i = 0; i < names.length; i++) phones.push(await newPhone(browser, base, names[i], i === 0 ? 'host' : 'player'));
    if (PHONE) for (const p of phones) await p.page.setViewportSize({ width: +PHONE[1], height: +PHONE[2] });
    const screen = await newPhone(browser, base, 'big screen', 'screen');
    const all = phones.concat(screen);
    const downloads = [];
    phones.forEach((p) => {
        p.page.on('download', (d) => downloads.push({ phone: p.name, download: d }));
        // WhatsApp opens in a new tab, which never leaves this machine.
        p.context.on('page', (popup) => { p.popups = (p.popups || []).concat(popup.url()); popup.close().catch(() => { }); });
    });

    try {
        // Game 1: a test game, from a ?via=test link. Its PIN decides the half, so the counter is moved
        // to one whose next PIN is in the half asked for (one sitting at a time: they share the counter).
        const host = phones[0];
        const first = await oneAtATime(async () => {
            let counter = await db('GET', 'gameCounter');
            while (half(pinOf(counter + 1)) !== wantNew) counter++;
            await db('PUT', 'gameCounter', counter);
            await host.page.goto(`${base}/create-game?via=test`);
            await host.page.locator('input[name="locale"]').nth(he ? 1 : 0).check();
            await host.page.locator('input[name="length"]').first().check();
            await host.page.locator('form button[type="submit"]').first().click();
            await host.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
            return { pin: new URL(host.page.url()).pathname.split('/').pop().toUpperCase() };
        });
        check(half(first.pin) === wantNew, `${tag}: the first game ${first.pin} is not in the half asked for`);
        await screen.page.goto(`${base}/present-game/${first.pin}`);
        for (const p of phones.slice(1)) await p.page.goto(`${base}${he ? '/he' : ''}/join-game/${first.pin}`);
        await playToFinal(all, first, problems);

        const g1 = await db('GET', `games/${first.pin}`);
        check(g1.campaign === 'test', `${tag}: game 1 is not a test game (campaign ${g1.campaign})`);
        check(g1.state.id === 6 && !('nextWeek' in g1.state), `${tag}: a sitting's first game is in the test (state ${JSON.stringify(g1.state)})`);
        for (const p of phones) check(!(await visible(p.page.locator('.next-week-button'))), `${tag}: ${p.name} sees the new button after the first game`);
        await shot(phones[1].page, `${tag}-1-first-game-final`);

        // Game 2: the second phone presses REMATCH and hosts it.
        const presser = phones[1];
        await presser.page.locator('button.rematch:not(.join-rematch)').first().click();
        const secondPin = await waitFor(`${tag}: REMATCH made no game`, () => db('GET', `games/${first.pin}/fork`), problems);
        if (!secondPin) return { tag, problems };
        const second = { pin: secondPin, everyoneIn: false };
        phones.forEach((p) => { p.role = p === presser ? 'host' : 'player'; });
        const g2start = await db('GET', `games/${second.pin}`);
        check(g2start.root === first.pin && g2start.parent === first.pin, `${tag}: game 2 has root ${g2start.root}, parent ${g2start.parent}`);
        check(g2start.campaign === 'test', `${tag}: the rematch is not a test game`);
        // The others tap JOIN THE REMATCH; the big screen follows by itself.
        for (const p of phones.filter((x) => x !== presser)) {
            await waitFor(`${tag}: ${p.name} got no JOIN THE REMATCH`, () => visible(p.page.locator('button.join-rematch')), problems);
            await p.page.locator('button.join-rematch').first().click().catch(() => { });
        }
        await playToFinal(all, second, problems);

        const g2 = await db('GET', `games/${second.pin}`);
        check(g2.state.id === 6 && g2.state.nextWeek === wantNew, `${tag}: game 2's final state says nextWeek ${g2.state.nextWeek}, not ${wantNew}`);
        const scores = Object.values(g2.players);
        const top = Math.max(...scores.map((p) => p.score || 0));
        const won = (p) => (scores.find((s) => s.nickname === p.name) || {}).score === top && top > 0 || scores.every((s) => (s.score || 0) === top);
        const result = { tag, pins: [first.pin, second.pin], scores: scores.map((p) => `${p.nickname}: ${p.score}`) };
        // The rows this sitting's phones sent to `shares`, told apart by each browser's id.
        const uids = scores.map((p) => p.uid).filter((u) => !!u);
        check(uids.length === phones.length, `${tag}: only ${uids.length} of ${phones.length} phones are signed in`);

        if (!wantNew) {
            // The other half: today's screen. This group played twice, so the save-crew offer is up.
            for (const p of phones) {
                check(!(await visible(p.page.locator('app-next-week'))), `${tag}: ${p.name} sees the new button in the other half`);
                check(await visible(p.page.locator('.crew-first .save-crew')), `${tag}: ${p.name} lost today's save-crew offer`);
            }
            check(!(await visible(screen.page.locator('.next-week-screen'))), `${tag}: the big screen shows the new line in the other half`);
            await shot(phones[0].page, `${tag}-2-second-game-final`);
            await sleep(1500);
            result.shares = sharesOf(emulators, uids);
            check(result.shares.filter((r) => r.method === 'seen-control').length === phones.length,
                `${tag}: ${result.shares.filter((r) => r.method === 'seen-control').length} seen-control rows, not ${phones.length}`);
            check(!result.shares.some((r) => r.method === 'seen-card'), `${tag}: a seen-card row in the other half`);
            return Object.assign(result, { problems });
        }

        // The new half: every phone has the button, in its own words, and no save-crew offer.
        for (const p of phones) {
            const button = p.page.locator('.next-week-button');
            await waitFor(`${tag}: ${p.name} has no next-week button`, () => visible(button), problems);
            const label = ((await button.first().innerText().catch(() => '')) || '').trim();
            check(label === (won(p) ? t.defend : t.revenge), `${tag}: ${p.name} (${won(p) ? 'winner' : 'not the winner'}) reads "${label}"`);
            check((await p.page.locator('.next-week-line').first().innerText().catch(() => '')).trim() === t.line, `${tag}: ${p.name} has no line under the button`);
            check(!(await visible(p.page.locator('.save-crew'))) && !(await visible(p.page.locator('.crew-offer'))), `${tag}: ${p.name} still sees the save-crew offer`);
            check(await visible(p.page.locator('button.rematch')), `${tag}: ${p.name} lost REMATCH`);
            check(await visible(p.page.locator('.share-results-button')), `${tag}: ${p.name} lost SHARE RESULTS`);
            const order = await p.page.evaluate(() => {
                const y = (s) => { const e = document.querySelector(s); return e ? e.getBoundingClientRect().top : -1; };
                return { rematch: y('button.rematch'), next: y('.next-week-button'), share: y('.share-results-button'), list: y('ol.players') };
            });
            check(order.rematch < order.next && order.next < order.share && (order.list < 0 || order.share < order.list),
                `${tag}: ${p.name}'s buttons are out of order ${JSON.stringify(order)}`);
            const wide = await p.page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
            check(wide <= 0, `${tag}: ${p.name}'s final screen scrolls sideways by ${wide}px`);
        }
        check((await screen.page.locator('.next-week-screen').first().innerText().catch(() => '')).trim() === t.bigScreen, `${tag}: the big screen has no line`);
        check(!(await visible(screen.page.locator('.next-week-button'))), `${tag}: the big screen has a button`);
        await shot(phones[0].page, `${tag}-2-button`);
        await shot(screen.page, `${tag}-2-big-screen`);

        if (swap) {
            // Nobody pressed REMATCH: 40 seconds after the screen came up, the new button is first.
            const p = phones[0];
            await waitFor(`${tag}: the buttons did not swap after 40 seconds`, () => visible(p.page.locator('.actions.next-week-first')), problems, 50000);
            const order = await p.page.evaluate(() => {
                const y = (s) => document.querySelector(s).getBoundingClientRect().top;
                return { rematch: y('button.rematch'), next: y('.next-week-button') };
            });
            check(order.next < order.rematch, `${tag}: after the swap REMATCH is still first ${JSON.stringify(order)}`);
            await shot(p.page, `${tag}-2-swapped`);
        }

        // One player opens the sheet: the crew is made, with tonight's two games.
        const sender = phones.find((p) => won(p) === !!senderWins) || phones[0];
        const opened = new Date();
        await sender.page.locator('.next-week-button').first().click();
        const href = await waitFor(`${tag}: the WhatsApp link never got ready`,
            () => sender.page.locator('a.sheet-whatsapp').first().getAttribute('href'), problems);
        if (!href) return Object.assign(result, { problems });
        const crewId = await db('GET', `games/${second.pin}/crew`);
        let crew = await db('GET', `crews/${crewId}`);
        const hostName = presser.name;
        check(!!crew && crew.auto === true, `${tag}: the sheet made no crew`);
        check(crew.name === words.defaultCrewName(hostName, locale), `${tag}: the crew is named "${crew.name}"`);
        check(crew.gameCount === 2 && !!crew.games[first.pin] && !!crew.games[second.pin], `${tag}: the crew counts ${crew.gameCount} games, not tonight's 2`);
        check(crew.test === 'test', `${tag}: the crew of a test game is not a test crew`);
        check((await sender.page.locator('.sheet-title').first().innerText()).trim() === t.title, `${tag}: the sheet's title is wrong`);

        // The date: tonight plus seven days. The text: the game's own, with the leader line and the crew link.
        const when = words.sameTimeNextWeek(opened);
        const label = night.nightLabel(when, locale);
        check((await sender.page.locator('.sheet-when .when').first().innerText()).trim() === label, `${tag}: the sheet's date is not "${label}"`);
        const firstStanding = model.crewStandings(crew)[0];
        const leader = firstStanding && firstStanding.wins > 0 ? model.crewLeaderLine(crew, locale) : '';
        const crewUrl = `https://bullshit.wtf${he ? '/he' : ''}/c/${crewId}?via=crew`;
        const expected = `${words.nextWeekText({ winner: won(sender), when, leader, locale })}\n${crewUrl}`;
        const sentText = new URL(href).searchParams.get('text');
        check(new URL(href).origin === 'https://wa.me', `${tag}: the link does not open WhatsApp (${href.slice(0, 40)})`);
        check(sentText === expected, `${tag}: the WhatsApp text is\n${sentText}\nnot\n${expected}`);
        result.whatsapp = sentText;
        result.sender = `${sender.name} (${won(sender) ? 'winner' : 'not the winner'})`;
        await shot(sender.page, `${tag}-3-sheet`);

        if (rename) {
            // The phone that made the crew may name it; the others read its name.
            const input = sender.page.locator('input.crew-name');
            if (check(await visible(input), `${tag}: the sender cannot change the crew's name`)) {
                await input.fill('kkk crew');
                check(await visible(sender.page.locator('.sheet-error')), `${tag}: a refused crew name shows no error`);
                check((await sender.page.locator('a.sheet-whatsapp').first().getAttribute('href')) === null, `${tag}: a refused name can still be sent`);
                await input.fill(he ? 'שקרני שישי' : 'Friday Liars');
            }
        }

        // The tap: WhatsApp opens at once, and the date goes on the crew.
        await sender.page.locator('a.sheet-whatsapp').first().click();
        const set = await waitFor(`${tag}: the date never reached the crew`, async () => (await db('GET', `crews/${crewId}/night`)), problems);
        check(!!set && set.time === when.getTime() && set.by === sender.name && Object.keys(set.in || {}).length === 1,
            `${tag}: the crew's night is ${JSON.stringify(set)}`);
        await waitFor(`${tag}: WhatsApp did not open on the tap`, () => (sender.popups || []).length > 0, problems, 5000);
        check((await sender.page.locator('.sheet-set').first().innerText().catch(() => '')).includes(t.set(label)), `${tag}: the sheet does not say the night is set`);
        if (rename) {
            crew = await waitFor(`${tag}: the new crew name never reached the crew`, async () => {
                const c = await db('GET', `crews/${crewId}`);
                return c.name === (he ? 'שקרני שישי' : 'Friday Liars') ? c : null;
            }, problems);
        }
        await shot(sender.page, `${tag}-4-sheet-sent`);
        await sender.page.locator('.sheet-done').first().click();

        // Every other phone swaps the button for the banner, and says I'M IN.
        const others = phones.filter((p) => p !== sender);
        for (const p of others) {
            const banner = p.page.locator('.next-week-banner');
            await waitFor(`${tag}: ${p.name} got no banner`, () => visible(banner), problems);
            const text = (await banner.first().innerText().catch(() => '')).replace(/\s+/g, ' ');
            check(text.includes(t.next(label)) && text.includes(t.call(sender.name)) && text.includes(t.imIn), `${tag}: ${p.name}'s banner reads "${text}"`);
            check(!(await visible(p.page.locator('.next-week-button'))), `${tag}: ${p.name} still has the button beside the banner`);
        }
        await shot(others[0].page, `${tag}-5-banner`);
        for (const p of others) await p.page.locator('.banner-in').first().click();
        const list = await waitFor(`${tag}: not everyone who tapped I'M IN is on the list`, async () => {
            const n = await db('GET', `crews/${crewId}/night/in`);
            return n && Object.keys(n).length === phones.length ? n : null;
        }, problems);
        result.in = list ? Object.values(list) : null;
        for (const p of others) {
            check((await p.page.locator('.banner-youre-in').first().innerText().catch(() => '')).includes(t.youreIn), `${tag}: ${p.name} is not told "${t.youreIn}"`);
        }
        // The sender's own phone shows the night too, and that they are in.
        await waitFor(`${tag}: the sender got no banner after closing the sheet`, () => visible(sender.page.locator('.next-week-banner .banner-youre-in')), problems);
        const wide = await others[0].page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        check(wide <= 0, `${tag}: the banner makes the screen scroll sideways by ${wide}px`);
        await shot(others[0].page, `${tag}-6-banner-in`);

        // ADD TO MY CALENDAR: one entry for that night, with the crew link.
        await others[0].page.locator('.banner-calendar').first().click();
        const got = await waitFor(`${tag}: no calendar file was saved`, () => downloads.find((d) => d.phone === others[0].name), problems, 8000);
        if (got) {
            const ics = fs.readFileSync(await got.download.path(), 'utf8').replace(/\r\n /g, '');
            const utc = when.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
            check(ics.includes(`DTSTART:${utc}`) && ics.includes(`URL:${crewUrl}`) && !/RRULE/.test(ics), `${tag}: the calendar file is not one entry for the night:\n${ics}`);
            result.calendar = { file: got.download.suggestedFilename(), summary: (/SUMMARY:(.*)/.exec(ics) || [])[1] };
        }

        if (third) {
            // A third game of the sitting: the same half, and the final screen opens on the banner.
            const starter = phones[0];
            await starter.page.locator('button.rematch:not(.join-rematch)').first().click();
            const thirdPin = await waitFor(`${tag}: the second REMATCH made no game`, () => db('GET', `games/${second.pin}/fork`), problems);
            if (thirdPin) {
                const game3 = { pin: thirdPin, everyoneIn: false };
                phones.forEach((p) => { p.role = p === starter ? 'host' : 'player'; });
                for (const p of phones.filter((x) => x !== starter)) {
                    await waitFor(`${tag}: ${p.name} got no JOIN THE REMATCH`, () => visible(p.page.locator('button.join-rematch')), problems);
                    await p.page.locator('button.join-rematch').first().click().catch(() => { });
                }
                await playToFinal(all, game3, problems);
                const g3 = await db('GET', `games/${thirdPin}`);
                check(g3.root === first.pin && g3.state.nextWeek === wantNew && g3.crew === crewId, `${tag}: game 3 has root ${g3.root}, nextWeek ${g3.state.nextWeek}, crew ${g3.crew}`);
                for (const p of phones) {
                    await waitFor(`${tag}: ${p.name} has no banner after the third game`, () => visible(p.page.locator('.next-week-banner')), problems);
                    check(!(await visible(p.page.locator('.next-week-button'))), `${tag}: ${p.name} is asked again after the third game`);
                }
                const after = await db('GET', `crews/${crewId}`);
                check(after.gameCount === 3 && after.night && after.night.time === when.getTime(), `${tag}: after game 3 the crew has ${after.gameCount} games, night ${JSON.stringify(after.night)}`);
                result.pins.push(thirdPin);
                await shot(phones[1].page, `${tag}-7-third-game-final`);
            }
        }

        // What went to BigQuery's shares table (the emulated functions log each row they would insert).
        await sleep(1500);
        result.shares = sharesOf(emulators, uids);
        const count = (type, method) => result.shares.filter((r) => r.content_type === type && r.method === method).length;
        check(count('next-week', 'seen-card') === phones.length * (third ? 2 : 1), `${tag}: ${count('next-week', 'seen-card')} seen-card rows`);
        // After the third game the crew is there, and the phones' rows carry its id.
        check(!third || result.shares.filter((r) => r.method === 'seen-card' && r.crew_id === crewId).length === phones.length,
            `${tag}: the third game's seen-card rows lack the crew id`);
        check(count('next-week', 'seen-control') === 0, `${tag}: a seen-control row in the new half`);
        check(count('next-week', 'open') === 1 && count('next-week', 'whatsapp') === 1 && count('crew-save', 'next-week') === 1,
            `${tag}: open ${count('next-week', 'open')}, whatsapp ${count('next-week', 'whatsapp')}, crew-save ${count('crew-save', 'next-week')}`);
        check(count('next-week', 'in') === others.length && count('next-week', 'calendar') === 1,
            `${tag}: in ${count('next-week', 'in')}, calendar ${count('next-week', 'calendar')}`);
        check(result.shares.filter((r) => !['seen-card', 'open'].includes(r.method)).every((r) => r.crew_id === crewId && r.locale === locale),
            `${tag}: a row lacks the crew id or the language`);
        all.forEach((p) => p.problems.forEach((x) => problems.push(`${tag}: ${p.name}: ${x}`)));
        return Object.assign(result, { crew: crew && { id: crewId, name: crew.name, games: crew.gameCount, leader }, problems });
    } finally {
        await browser.close().catch(() => { });
    }
}

/** Runs one step at a time across the sittings, which otherwise play side by side. */
let queue = Promise.resolve();
function oneAtATime(step) {
    const run = queue.then(step);
    queue = run.catch(() => { });
    return run;
}

/** The rows the functions sent to `shares` for these browsers, read from the emulators' log. */
function sharesOf(emulators, uids) {
    if (!emulators || !emulators.logFile) return [];
    const fresh = fs.readFileSync(emulators.logFile, 'utf8');
    const rows = [];
    const re = /Insert to BigQuery, table: 'shares', data: (\{.*?\})\s*$/gm;
    let m;
    while ((m = re.exec(fresh))) {
        try {
            const row = JSON.parse(m[1]);
            if ((row.content_type === 'next-week' || row.content_type === 'crew-save') && uids.includes(row.uid)) rows.push(row);
        } catch (e) { /* a cut line */ }
    }
    return rows.map((r) => ({ content_type: r.content_type, method: r.method, crew_id: r.crew_id, locale: r.locale }));
}

async function main() {
    if (!fileIn(DIST, '/index.html')) throw new Error(`No built game at ${DIST}`);
    if (!fs.existsSync(path.join(ROOT, 'functions', 'dist', 'index.js'))) throw new Error('Build functions/ first: npm run build there');
    if (process.env.EMULATORS === 'running') throw new Error('This run reads the emulators\' log: let it start them itself');
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const emulators = await startEmulators();
    let server;
    const results = [];
    try {
        if (!(await up(`http://${HOST}:9000/.json?ns=${emu.PROJECT}`))) throw new Error('no database emulator on :9000');
        await seed();
        // A sitting of three games needs more questions than the seed's twelve a language.
        for (const lang of ['en', 'he']) {
            for (let i = 12; i < 40; i++) {
                await db('PUT', `questions/${lang}${i}`, lang === 'en'
                    ? { lang, questionText: `Test question ${i}: the capital of Testland is ___`, realAnswer: `truth${i}`, fakeAnswers: ['lie a', 'lie b', 'lie c', 'lie d'], citation: '' }
                    : { lang, questionText: `שאלת בדיקה ${i}: הבירה של ארץ הבדיקה היא ___`, realAnswer: `אמת${i}`, fakeAnswers: ['שקר א', 'שקר ב', 'שקר ג', 'שקר ד'], citation: '' });
            }
        }
        server = await serve(DIST);
        const base = `http://${HOST}:${server.address().port}`;
        const plan = [
            { key: 'en-new', locale: 'en', wantNew: true, rename: true, third: true, senderWins: false },
            { key: 'he-new', locale: 'he', wantNew: true, swap: true, senderWins: true },
            { key: 'en-old', locale: 'en', wantNew: false },
            { key: 'he-old', locale: 'he', wantNew: false },
        ].filter((s) => !only || only.includes(s.key));
        // Two sittings play side by side: a game takes about five minutes whatever the phones do.
        const next = async () => {
            for (let s = plan.shift(); s; s = plan.shift()) {
                const key = s.key;
                results.push(await sitting(base, emulators, s).catch((e) => ({ tag: key, problems: [`${key}: ${e.stack || e}`] })));
            }
        };
        await Promise.all([next(), next()]);
    } finally {
        if (server) server.close();
        stopEmulators(emulators);
    }
    const problems = results.flatMap((r) => r.problems || []);
    console.log('\nRESULT ' + JSON.stringify({ build: DIST, players: PLAYERS, phone: process.env.PHONE || '390x800', sittings: results, problems }, null, 2));
    console.log(problems.length ? 'FAIL' : 'PASS');
    process.exitCode = problems.length ? 1 : 0;
}

main().catch((e) => {
    console.error('FAIL', e.stack || e);
    process.exit(1);
});
