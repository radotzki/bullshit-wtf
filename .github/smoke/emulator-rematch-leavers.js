#!/usr/bin/env node
// Local run: a rematch seats only the players still here, and no question waits for one who left.
//
// The built game against the Firebase emulators, as emulator-game.js runs it (that file lends its
// emulators and phones). Five players and a big screen play a game; then:
//   - Priya closes her page after the game, before Sam presses REMATCH: she should get no seat;
//   - in the rematch, Dave's phone sleeps for 50 s on question 1, comes back and plays on;
//   - Mo closes his page on question 2 and never comes back: from then on no question should run out
//     its clock for him;
//   - Priya comes back on question 3 and joins the rematch in progress from its link, as a late guest does.
// Every game is a ?via=test game on the emulators. Nothing reaches a live project.
//   cd functions && npm run build && cd ../game && npm run build
//   cd ../.github/smoke && node emulator-rematch-leavers.js [path to game/dist]
'use strict';

const emu = require('./emulator-game');
const { serve, HOST } = require('./smoke');
const { chromium } = require('playwright');
const { DIST, startEmulators, stopEmulators, db, seed, newPhone, dropConnection, restoreConnection, visible, act, log, sleep } = emu;

const SLEEP_MS = 50000;

/** Follows a game's phases from the database: each phase's start, its deadline, and when it ended. */
function watchPhases(pin) {
    const phases = [];
    let stop = false;
    (async () => {
        let last = '';
        while (!stop) {
            const st = await db('GET', `games/${pin}/state`).catch(() => null);
            const q = await db('GET', `games/${pin}/questionIndex`).catch(() => null);
            const key = st ? `${st.id}:${st.timestamp}` : '';
            if (st && key !== last) {
                const now = Date.now();
                if (phases.length) phases[phases.length - 1].endedAt = now;
                phases.push({ id: st.id, q, startedAt: st.timestamp, deadline: st.deadline, seenAt: now });
                last = key;
            }
            if (st && st.id === 6) break;
            await sleep(300);
        }
    })();
    return { phases, stop: () => { stop = true; } };
}

async function play(pin, phones, game, events = []) {
    game.pin = pin;
    const deadline = Date.now() + 12 * 60000;
    while (Date.now() < deadline) {
        const st = await db('GET', `games/${pin}/state`).catch(() => null);
        game.state = st && st.id;
        game.q = await db('GET', `games/${pin}/questionIndex`).catch(() => -1);
        for (const ev of events) if (!ev.done && ev.when(game)) { ev.done = true; await ev.run(game); }
        await Promise.all(phones.filter((p) => !p.away && !p.closed && !p.done).map((p) => act(p, game).catch((e) => {
            if (!/Target closed|context was destroyed|navigation|has been closed/.test(e.message)) log(`${p.name}: ${e.message.split('\n')[0]}`);
        })));
        if (game.state === 6) { await sleep(3000); break; }
        await sleep(400);
    }
}

async function main() {
    const emulators = await startEmulators();
    const problems = [];
    let browser;
    let server;
    try {
        await seed();
        server = await serve(DIST);
        const base = `http://${HOST}:${server.address().port}`;
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`] });
        const sam = await newPhone(browser, base, 'Sam', 'host');
        const guests = [];
        for (const name of ['Tina', 'Dave', 'Mo', 'Priya']) guests.push(await newPhone(browser, base, name, 'player'));
        const [tina, dave, mo, priya] = guests;
        const screen = await newPhone(browser, base, 'TV', 'screen');
        const phones = [sam, ...guests, screen];

        await sam.page.goto(`${base}/create-game?via=test`);
        await sam.page.locator('input[name="locale"]').first().check();
        await sam.page.locator('input[name="length"]').first().check();
        await sam.page.locator('form button[type="submit"]').first().click();
        await sam.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
        const pin = new URL(sam.page.url()).pathname.split('/').pop().toUpperCase();
        const g0 = await db('GET', `games/${pin}`);
        log(`game ${pin}: ${g0.totalQ} questions, campaign ${g0.campaign}`);
        if (g0.campaign !== 'test') problems.push(`game 1 is not a test game (campaign ${g0.campaign})`);
        await screen.page.goto(`${base}/present-game/${pin}`);
        for (const g of guests) await g.page.goto(`${base}/join-game/${pin}`);

        // ---- game 1: everyone plays to the end ----
        const game = { everyoneIn: false };
        const waitIn = (async () => {
            while (!game.everyoneIn) {
                const players = await db('GET', `games/${pin}/players`).catch(() => null);
                game.everyoneIn = !!players && Object.keys(players).length === 5;
                await sleep(500);
            }
        })();
        const t1 = Date.now();
        await play(pin, phones, game);
        await waitIn;
        const game1 = Math.round((Date.now() - t1) / 1000);
        log(`game 1 over in ${game1} s`);

        // ---- Priya says goodnight and closes the page; Sam presses REMATCH 25 s later ----
        await priya.page.close();
        priya.closed = true;
        log('Priya closed her page');
        await sleep(25000);
        const seen1 = await db('GET', `games/${pin}/seen`);
        log(`marks on game 1 at the press: ${JSON.stringify(seen1)}`);
        await sam.page.locator('button.rematch').first().click();
        let rp = null;
        for (let i = 0; i < 40 && !rp; i++) { rp = await db('GET', `games/${pin}/fork`); if (!rp) await sleep(500); }
        if (!rp) throw new Error('no rematch was made');
        await sleep(2000);
        const seats0 = Object.values((await db('GET', `games/${rp}/players`)) || {}).map((p) => p.nickname);
        log(`rematch ${rp} seats: ${JSON.stringify(seats0)}`);
        if (seats0.some((n) => /priya/i.test(n))) problems.push('Priya, who had closed her page, got a seat in the rematch');
        if (seats0.length !== 4) problems.push(`the rematch has ${seats0.length} seats, not 4`);

        for (const p of [tina, dave, mo]) {
            const join = p.page.locator('button.join-rematch');
            if (await visible(join)) await join.first().click().catch(() => { });
        }
        for (const p of phones) { p.done = false; p.joining = false; p.lies = []; p.picks = []; }
        const rgame = { everyoneIn: false };
        setTimeout(() => { rgame.everyoneIn = true; }, 6000);
        const watch = watchPhases(rp);

        // ---- the rematch: Dave's phone sleeps on question 1, Mo leaves on question 2, Priya is back on 3 ----
        // A test game's rematch is a test game too.
        const r0 = await db('GET', `games/${rp}/campaign`);
        if (r0 !== 'test') problems.push(`the rematch is not a test game (campaign ${r0})`);
        let moLeftAt = 0;
        let daveBackAt = 0;
        const events = [
            { when: (g) => g.q === 0 && g.state === 2, run: async () => {
                dropConnection(dave);
                log('Dave puts his phone down: it sleeps for 50 s');
                setTimeout(async () => {
                    restoreConnection(dave);
                    daveBackAt = Date.now();
                    await dave.page.reload().catch(() => { });
                    log('Dave picks his phone back up');
                }, SLEEP_MS);
            } },
            { when: (g) => g.q === 1 && g.state === 2, run: async () => {
                await mo.page.close();
                mo.closed = true;
                moLeftAt = Date.now();
                log('Mo closes his page and goes');
            } },
            { when: (g) => g.q === 2 && g.state === 2, run: async () => {
                priya.page = await priya.context.newPage();
                priya.closed = false;
                priya.done = false;
                // First the link she has, game 1's: it offers the rematch only while its lobby is open.
                await priya.page.goto(`${base}/join-game/${pin}`);
                await sleep(2500);
                const old = (await priya.page.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ');
                log(`Priya on game 1's link: ${old.slice(0, 300)}`);
                // Then the rematch's own link, from the group chat or the TV, as any late guest joins.
                await priya.page.goto(`${base}/join-game/${rp}`);
                await sleep(2500);
                const text = (await priya.page.evaluate(() => document.body.innerText).catch(() => '')).replace(/\s+/g, ' ');
                log(`Priya sees: ${text.slice(0, 300)}`);
                const them = priya.page.locator('button:has-text("JOIN THEM"), a:has-text("JOIN THEM"), button:has-text("JUMP IN"), a:has-text("JUMP IN")');
                if (await visible(them)) { await them.first().click().catch(() => { }); log('Priya pressed JOIN THEM'); }
                log(`Priya opened game 1's link again: now on ${priya.page.url().replace(base, '')}`);
            } },
        ];
        const t2 = Date.now();
        await play(rp, phones, rgame, events);
        watch.stop();
        const rematch = Math.round((Date.now() - t2) / 1000);
        const final = await db('GET', `games/${rp}`);
        log(`rematch over in ${rematch} s: ${JSON.stringify(Object.values(final.players || {}).map((p) => `${p.nickname}:${p.score}`))}`);

        // What waited for whom: each lie and pick phase after Mo had been gone 20 s, against its clock.
        const timed = watch.phases.filter((p) => (p.id === 2 || p.id === 3) && p.endedAt && p.deadline);
        const afterMo = timed.filter((p) => moLeftAt && p.startedAt >= moLeftAt + 20000);
        const rows = timed.map((p) => ({ q: p.q + 1, phase: p.id === 2 ? 'lies' : 'picks', ran: Math.round((p.endedAt - p.startedAt) / 1000),
            clock: Math.round((p.deadline - p.startedAt) / 1000), early: p.endedAt < p.deadline - 1500 }));
        log(`phases: ${JSON.stringify(rows)}`);
        const ranOut = afterMo.filter((p) => p.endedAt >= p.deadline - 1500);
        if (!afterMo.length) problems.push('no lie or pick phase began after Mo had been gone 20 s');
        if (ranOut.length) problems.push(`${ranOut.length} phases after Mo left still ran out their clock`);
        const priyaSeat = Object.values(final.players || {}).find((p) => /priya/i.test(p.nickname));
        if (!priyaSeat) problems.push('Priya did not get a seat when she came back during the rematch');
        else if (!(priyaSeat.score >= 0)) problems.push('Priya has no score');
        const daveLater = dave.lies.filter((q) => q >= 2);
        if (!daveLater.length) problems.push('Dave sent no lie after his phone came back');
        if (final.state.id !== 6) problems.push('the rematch did not reach its final screen');
        phones.forEach((p) => p.problems.forEach((x) => problems.push(`${p.name}: ${x}`)));

        console.log('\nRESULT ' + JSON.stringify({
            game1Seconds: game1, rematchSeconds: rematch, rematchSeatsAtPress: seats0,
            finalSeats: Object.values(final.players || {}).map((p) => `${p.nickname}:${p.score}`),
            daveLies: dave.lies.map((q) => q + 1), priyaLies: priya.lies.map((q) => q + 1), daveBackAfter: daveBackAt ? 'yes' : 'no',
            moLies: mo.lies.map((q) => q + 1), screens: Object.fromEntries(phones.map((p) => [p.name, p.screens.join(' > ')])),
            phases: rows, problems,
        }, null, 2));
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
