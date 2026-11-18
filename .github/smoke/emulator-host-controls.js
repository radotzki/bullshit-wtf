#!/usr/bin/env node
// Local run: the host's two controls (functions/src/controllers/host-controls.ts), on the built client
// (game/dist) against the Firebase emulators, in headless Chromium, with phones 390 px wide.
//
//  1. The host creates a game and joins; Ben, Cleo, Troll and a Stranger join. In the lobby the host opens
//     the players list and removes the Stranger: the Stranger's phone says the host removed it, and the
//     same browser, back on the join page, is refused (REMOVED) and told so.
//  2. Question 1. The host sends a lie, opens CHECK THE LIES (after the warning that their pick won't score),
//     sees the other lies with no names, and hides Troll's. The last lie does not end the writing while the
//     host looks; SHOW THE ANSWERS does. Troll's lie is in no answer on any screen; Troll's phone alone says
//     the host hid it, and the host's phone says its pick doesn't score. On the reveal, the host's pick is no pick.
//  3. Question 2. The host removes Cleo from the writing screen: Cleo's phone says so, and the game goes on.
//  4. Question 2's answers (or the next question that isn't an About question). Ben picks Troll's lie, then
//     the host removes Troll: the lie stays up, marked as a removed seat's, and Ben's pick of it scores 0
//     (not a house lie's take-back).
//
// Needs what emulator-game.js needs (Java, functions/ built, the root's npm ci). From the repository root:
//   node .github/smoke/emulator-host-controls.js [path to dist] [--locale en|he]
// SHOTS=<dir> saves the screens of the host's controls there (<locale>-<n>-<what>.png).
// Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve, fileIn } = require('./smoke');
const { startEmulators, stopEmulators, db, seed, newPhone, visible, log, sleep, HOST, DB, PROJECT, DIST, LOCALE } = require('./emulator-game');

const he = LOCALE === 'he';
const SHOTS = process.env.SHOTS || '';
const problems = [];
const check = (ok, what) => { if (!ok) problems.push(what); };

async function shot(phone, name) {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    await phone.page.screenshot({ path: path.join(SHOTS, `${LOCALE}-${name}.png`) }).catch(() => { });
}

async function until(what, fn, ms = 30000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        try {
            const v = await fn();
            if (v) return v;
        } catch (e) { /* try again */ }
        await sleep(250);
    }
    throw new Error(`timed out: ${what}`);
}

const screenOf = (phone) => new URL(phone.page.url()).pathname.replace(/^\/he(?=\/|$)/, '').split('/')[1] || 'home';
const textOf = (phone) => phone.page.evaluate(() => document.body.innerText).catch(() => '');

async function join(phone, base, pin) {
    await phone.page.goto(`${base}${he ? '/he' : ''}/join-game/${pin}`);
    const input = phone.page.locator('input[name="nickname"]');
    await until(`${phone.name} sees the name box`, () => visible(input));
    await input.fill(phone.name);
    await phone.page.locator('form button[type="submit"]').first().click();
    await until(`${phone.name} is in the lobby`, () => screenOf(phone) === 'game-staging');
}

async function sendLie(phone, text) {
    const input = phone.page.locator('form input.input');
    await until(`${phone.name} sees the question`, () => visible(input));
    await input.fill(text);
    await phone.page.locator('form button[type="submit"]').first().click();
}

async function main() {
    if (!fileIn(DIST, '/index.html')) throw new Error(`No built game at ${DIST}`);
    const emulators = await startEmulators();
    let browser;
    let server;
    const summary = { locale: LOCALE };
    try {
        await seed();
        server = await serve(DIST);
        const base = `http://${HOST}:${server.address().port}`;
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`] });
        const names = he ? ['דנה', 'בן', 'קליאו', 'טרול', 'זר'] : ['Dana', 'Ben', 'Cleo', 'Troll', 'Stranger'];
        const [host, ben, cleo, troll, stranger] = await Promise.all(names.map((n, i) => newPhone(browser, base, n, i === 0 ? 'host' : 'player')));
        const phones = [host, ben, cleo, troll, stranger];

        // The host creates the game and joins it.
        await host.page.goto(`${base}/create-game`);
        await host.page.locator('input[name="locale"]').nth(he ? 1 : 0).check();
        await host.page.locator('input[name="length"]').first().check();
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
        const pin = new URL(host.page.url()).pathname.split('/').pop().toUpperCase();
        summary.pin = pin;
        log(`game ${pin} created (${LOCALE})`);
        const nick = host.page.locator('input[name="nickname"]');
        await until('the host sees the name box', () => visible(nick));
        await nick.fill(host.name);
        await host.page.locator('form button[type="submit"]').first().click();
        await until('the host is in the lobby', () => screenOf(host) === 'game-staging');
        for (const p of [ben, cleo, troll, stranger]) await join(p, base, pin);
        await until('five seats', async () => Object.keys(await db('GET', `games/${pin}/players`) || {}).length === 5);

        // 1. The lobby: remove the Stranger.
        const playersButton = host.page.locator('.host-players');
        await until('the host has the players button', () => visible(playersButton));
        check(!(await visible(ben.page.locator('.host-players'))), 'a guest has the players button');
        await playersButton.first().click();
        await until('the players list is open', () => visible(host.page.locator('.host-players-modal.is-active')));
        await shot(host, '1-players-list');
        const row = host.page.locator('.host-seat', { hasText: stranger.name });
        await row.locator('.host-remove').click();
        await shot(host, '2-remove-confirm');
        await row.locator('.host-remove-yes').click();
        await until('the Stranger is gone from the players', async () => {
            const players = await db('GET', `games/${pin}/players`);
            return players && !Object.values(players).some((p) => p.nickname === stranger.name);
        });
        await until('the Stranger\'s phone says it was removed', () => visible(stranger.page.locator('.removed-modal.is-active')));
        await shot(stranger, '3-removed-phone');
        await host.page.locator('.host-players-modal .modal-card-foot .button').click();
        const removed = await db('GET', `games/${pin}/removed`);
        check(removed && Object.keys(removed).length === 1, 'the removed seat is not kept');
        // The same browser tries again: refused, and told why.
        await stranger.page.goto(`${base}${he ? '/he' : ''}/join-game/${pin}`);
        const again = stranger.page.locator('input[name="nickname"]');
        await until('the Stranger sees the name box again', () => visible(again));
        await again.fill(`${stranger.name} 2`);
        await stranger.page.locator('form button[type="submit"]').first().click();
        const refused = he ? 'המארחים הוציאו אותך' : 'The host removed you';
        await until('the Stranger is refused', async () => (await textOf(stranger)).includes(refused));
        await shot(stranger, '4-join-refused');
        check(Object.keys(await db('GET', `games/${pin}/players`)).length === 4, 'the removed browser sat down again');

        // 2. Question 1: the host checks the lies and hides Troll's.
        const start = host.page.locator('.game-header > button');
        await until('START', () => visible(start));
        await start.first().click();
        await until('question 1', async () => (await db('GET', `games/${pin}/state`)).id === 2, 60000);
        const crude = he ? 'משהו גס' : 'something crude';
        await sendLie(host, he ? 'שקר של דנה' : 'dana lie');
        await sendLie(ben, he ? 'שקר של בן' : 'ben lie');
        await sendLie(cleo, he ? 'שקר של קליאו' : 'cleo lie');
        const checkButton = host.page.locator('.check-lies');
        await until('CHECK THE LIES', () => visible(checkButton));
        await shot(host, '5-check-button');
        await checkButton.click();
        await shot(host, '6-check-warning');
        await host.page.locator('.open-lies').click();
        await until('the lies list', () => visible(host.page.locator('.check-list')));
        const state1 = await db('GET', `games/${pin}/state`);
        // Troll's lie arrives while the host looks: the last lie, and the writing stays open.
        await sendLie(troll, crude);
        const trollRow = host.page.locator('.check-lie', { hasText: crude.toUpperCase() });
        await until('Troll\'s lie in the host\'s list', () => visible(trollRow));
        await sleep(1500);
        const stillWriting = await db('GET', `games/${pin}/state`);
        check(stillWriting.timestamp === state1.timestamp, 'the last lie ended the writing while the host looked');
        const listText = await host.page.locator('.check-list').innerText();
        // The names, outside the lies themselves (a Hebrew test lie says whose it is).
        const outsideLies = (await host.page.locator('.check-list').evaluate((el) => {
            const copy = el.cloneNode(true);
            copy.querySelectorAll('.check-text').forEach((t) => t.remove());
            return copy.innerText;
        }));
        check(![ben, cleo, troll].some((p) => outsideLies.includes(p.name)), 'the lies list names a writer');
        check(!listText.includes((he ? 'שקר של דנה' : 'dana lie').toUpperCase()), 'the host\'s own lie is in their list');
        await trollRow.locator('button').click();
        await until('Troll\'s lie hidden', () => visible(host.page.locator('.check-lie.is-hidden-lie')));
        await shot(host, '7-lie-hidden');
        await host.page.locator('.show-now').click();
        await until('the answers', async () => (await db('GET', `games/${pin}/state`)).id === 3, 15000);
        const answers = await db('GET', `games/${pin}/answers`);
        check(!Object.values(answers).some((a) => a.text === crude), 'the hidden lie is among the answers');
        summary.answersQ1 = Object.values(answers).map((a) => a.text).sort();
        await until('Troll\'s phone shows the answers', () => visible(troll.page.locator('button.answer')));
        const notice = troll.page.locator('.own-lie-notice');
        await until('Troll is told the host hid the lie', () => visible(notice));
        await shot(troll, '8-your-lie-hidden');
        await until('the host is told the pick won\'t score', () => visible(host.page.locator('.own-lie-notice')));
        await shot(host, '9-host-pick-no-score');
        for (const p of [ben, cleo]) {
            await until(`${p.name} has answers`, () => visible(p.page.locator('button.answer')));
            check(!(await visible(p.page.locator('.own-lie-notice'))), `${p.name} sees a notice`);
            check(!(await textOf(p)).toLowerCase().includes(crude), `${p.name} sees the hidden lie`);
        }
        // Everyone picks the truth if it is there.
        for (const p of [host, ben, cleo, troll]) {
            const truth = p.page.locator('button.answer', { hasText: he ? 'אמת' : 'TRUTH' });
            await ((await truth.count()) ? truth.first() : p.page.locator('button.answer').first()).click().catch(() => { });
        }
        await until('the reveal', async () => (await db('GET', `games/${pin}/state`)).id === 4, 30000);
        const reveal = await db('GET', `games/${pin}/revealAnswers`);
        const hostPid = Object.entries(await db('GET', `games/${pin}/players`)).find(([, p]) => p.host)[0];
        check(!(reveal || []).some((r) => (r.selectors || []).includes(hostPid)), 'the checking host\'s pick counted');
        check(!(reveal || []).some((r) => r.text === crude), 'the hidden lie is on the reveal');

        // 3. Question 2: remove Cleo from the writing screen.
        await until('question 2', async () => {
            const [s, q] = await Promise.all([db('GET', `games/${pin}/state`), db('GET', `games/${pin}/questionIndex`)]);
            return s.id === 2 && q === 1;
        }, 60000);
        await until('the host\'s question screen', () => visible(host.page.locator('form input.input')));
        await host.page.locator('.host-players').first().click();
        const cleoRow = host.page.locator('.host-seat', { hasText: cleo.name });
        await cleoRow.locator('.host-remove').click();
        await cleoRow.locator('.host-remove-yes').click();
        await until('Cleo\'s phone says it was removed', () => visible(cleo.page.locator('.removed-modal.is-active')));
        await shot(cleo, '10-removed-mid-game');
        await host.page.locator('.host-players-modal .modal-card-foot .button').click();
        const players = await db('GET', `games/${pin}/players`);
        summary.playersAfter = Object.values(players).map((p) => p.nickname).sort();
        check(Object.keys(players).length === 3, 'Cleo still has a seat');
        // The rest still play: three lies end the writing.
        await sendLie(host, 'host 2');
        await sendLie(ben, 'ben 2');
        await sendLie(troll, 'troll 2');
        await until('question 2\'s answers', async () => (await db('GET', `games/${pin}/state`)).id === 3, 30000);

        // 4. The answers on the screens: Ben picks Troll's lie, then the host removes Troll. Troll's lie
        // stays up, marked, and Ben's pick of it scores 0: no house lie's take-back. An About question
        // (Troll's answer would be the truth, or one phone has no pick) is played through to the next.
        const pidOf = async (name) => Object.entries(await db('GET', `games/${pin}/players`)).find(([, p]) => p.nickname === name)[0];
        const benPid = await pidOf(ben.name);
        let qi = 1;
        const label = new Map([[host, 'host'], [ben, 'ben'], [troll, 'troll']]);
        const playable = async () => {
            // Not an About question, and Troll's lie is up (an About question about a removed seat is
            // replaced by a bank question from a fresh start, whose writing nobody here fills).
            const [st, answers] = await Promise.all([db('GET', `games/${pin}/state`), db('GET', `games/${pin}/answers`)]);
            return !st.about && Object.values(answers || {}).some((a) => a.text === `troll ${qi + 1}` && !a.realAnswer);
        };
        while (!(await playable())) {
            if (qi >= 4) throw new Error('no question to remove a seat during the answers');
            summary.aboutPlayedThrough = (summary.aboutPlayedThrough || []).concat(qi + 1);
            for (const p of [host, ben, troll]) {
                await p.page.locator('button.answer').first().click({ timeout: 3000 }).catch(() => { });
            }
            await until(`question ${qi + 2}`, async () => {
                const [s, q] = await Promise.all([db('GET', `games/${pin}/state`), db('GET', `games/${pin}/questionIndex`)]);
                return s.id === 2 && q === qi + 1;
            }, 120000);
            qi++;
            for (const p of [host, ben, troll]) await sendLie(p, `${label.get(p)} ${qi + 1}`);
            await until(`question ${qi + 1}'s answers`, async () => (await db('GET', `games/${pin}/state`)).id === 3, 30000);
        }
        const trollLie = `troll ${qi + 1}`;
        summary.removedAt = qi + 1;
        const benBefore = (await db('GET', `games/${pin}/players/${benPid}`)).score || 0;
        await until('Ben has answers', () => visible(ben.page.locator('button.answer')));
        await ben.page.locator('button.answer', { hasText: trollLie }).first().click({ timeout: 10000 }).catch(async (e) => {
            summary.benSees = await ben.page.locator('button.answer').allInnerTexts();
            summary.answersThen = await db('GET', `games/${pin}/answers`);
            summary.stateThen = await db('GET', `games/${pin}/state`);
            throw e;
        });
        await until('Ben\'s pick is in', async () => !!(await db('GET', `games/${pin}/answerSelections/${benPid}`)));
        await host.page.locator('.host-players').first().click();
        const trollSeat = host.page.locator('.host-seat', { hasText: troll.name });
        await trollSeat.locator('.host-remove').click();
        await trollSeat.locator('.host-remove-yes').click();
        await until('Troll\'s phone says it was removed', () => visible(troll.page.locator('.removed-modal.is-active')));
        const close = host.page.locator('.host-players-modal .modal-card-foot .button');
        if (await visible(close)) await close.click();
        const answersQ2 = await db('GET', `games/${pin}/answers`);
        summary.answersAtRemoval = Object.values(answersQ2);
        const kept = Object.values(answersQ2).find((a) => a.text === trollLie);
        check(kept && kept.houseLie === true && kept.removedSeat === true, 'the removed seat\'s lie is not kept, marked');
        const truthQ2 = Object.values(answersQ2).find((a) => a.realAnswer).text;
        await until('the host has answers', () => visible(host.page.locator('button.answer')));
        await host.page.locator('button.answer', { hasText: truthQ2 }).first().click();
        await until('question 2\'s reveal', async () => (await db('GET', `games/${pin}/state`)).id >= 4, 30000);
        const rowQ2 = ((await db('GET', `games/${pin}/revealAnswers`)) || []).find((r) => r.text === trollLie);
        summary.removedLieRow = rowQ2;
        check(rowQ2 && (rowQ2.selectors || []).includes(benPid), 'Ben\'s pick of the removed lie is not on the reveal');
        check(rowQ2 && rowQ2.points === 0, 'the removed lie\'s row is not worth 0');
        await until('question 2\'s scores', async () => (await db('GET', `games/${pin}/state`)).id >= 5, 90000);
        const benAfter = (await db('GET', `games/${pin}/players/${benPid}`)).score || 0;
        summary.benQ2 = { before: benBefore, after: benAfter };
        check(benAfter === benBefore, `Ben's pick of the removed lie changed his score (${benBefore} to ${benAfter})`);
        await shot(ben, '11-removed-lie-scored-0');

        phones.forEach((p) => p.problems.forEach((x) => problems.push(`${p.name}: ${x}`)));
    } catch (e) {
        problems.push(e.message);
    } finally {
        summary.problems = problems;
        console.log('\nRESULT ' + JSON.stringify(summary, null, 2));
        console.log(problems.length ? 'FAIL' : 'PASS');
        process.exitCode = problems.length ? 1 : 0;
        if (browser) await browser.close();
        if (server) server.close();
        stopEmulators(emulators);
    }
}

main().catch((e) => {
    console.error('FAIL', e.stack || e);
    process.exit(1);
});
