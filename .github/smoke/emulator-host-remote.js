#!/usr/bin/env node
// Local run: a big-screen host's controls on their phone ("on a second device" in
// functions/src/controllers/host-controls.ts), on the built client (game/dist) against the Firebase
// emulators, in headless Chromium: a computer as the big screen (1280x720), the host's phone as the
// controller, a stream viewer's phone, four players and a stranger (390 px phones).
//
//  1. The host makes the game on the computer and makes it the big screen. Ben, Cleo, Troll, Dee and a
//     Stranger join. Nobody pairs without a press on the big screen, and no made-up key opens anything.
//  2. The host presses "Host controls on your phone": a QR and link with a one-time code. A viewer who read
//     the link off the stream opens it first, and 19 more phones of a class or a stream chat claim at the
//     same moment (20 in all); the host's phone opens it next and still gets a number. Each phone shows its
//     own number; the big screen says 21 phones asked. A wrong number is refused; the host's phone's number
//     pairs it. The viewer's phone is told the link expired, and its key opens nothing.
//  3. The phone (no seat, not a player) removes the Stranger in the lobby. The big screen starts.
//  4. Question 1. The phone opens the lies (no names) while the big screen shows none of them, and hides
//     Troll's. The last lie does not end the writing while the phone looks; SHOW THE ANSWERS does. The
//     hidden lie is in no answer; every player's pick still scores (the host has no pick to lose).
//  5. Question 2. The phone removes Cleo from the writing.
//  6. The big screen disconnects the phone: its next press says it no longer has the host controls.
//  7. A full link: PAIR_MAX_CLAIMS phones claim a new code; the next phone is told the link is full (not
//     expired), and the big screen says so and offers NEW CODE.
//
// Needs what emulator-game.js needs (Java, functions/ built, the root's npm ci). From the repository root:
//   node .github/smoke/emulator-host-remote.js [path to dist] [--locale en|he]
// SHOTS=<dir> saves the screens there (<locale>-<n>-<what>.png).
// Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve, fileIn } = require('./smoke');
const { startEmulators, stopEmulators, db, seed, newPhone, visible, log, sleep, HOST, PROJECT, DIST, LOCALE } = require('./emulator-game');

const he = LOCALE === 'he';
const SHOTS = process.env.SHOTS || '';
const FUNCTIONS = `http://${HOST}:5001/${PROJECT}/us-central1`;
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

async function post(name, body) {
    const res = await fetch(`${FUNCTIONS}/${name}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
}

const screenOf = (phone) => new URL(phone.page.url()).pathname.replace(/^\/he(?=\/|$)/, '').split('/')[1] || 'home';
const textOf = (phone) => phone.page.evaluate(() => document.body.innerText).catch(() => '');
const storedRemote = (phone, pin) => phone.page.evaluate((p) => {
    try { return (JSON.parse(localStorage.getItem('BS_REMOTE_KEYS')) || {})[p] || null; } catch (e) { return null; }
}, pin);

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
        const names = he ? ['דנה', 'בן', 'קליאו', 'טרול', 'די', 'זר'] : ['Dana', 'Ben', 'Cleo', 'Troll', 'Dee', 'Stranger'];
        const screen = await newPhone(browser, base, 'screen', 'screen');
        await screen.page.setViewportSize({ width: 1280, height: 720 });
        const remote = await newPhone(browser, base, 'remote', 'player');
        const viewer = await newPhone(browser, base, 'viewer', 'player');
        const [ben, cleo, troll, dee, stranger] = await Promise.all(names.slice(1).map((n) => newPhone(browser, base, n, 'player')));
        const players = [ben, cleo, troll, dee];

        // 1. The game, on the computer, made the big screen.
        const page = screen.page;
        await page.goto(`${base}/create-game`);
        await page.locator('input[name="locale"]').nth(he ? 1 : 0).check();
        await page.locator('input[name="length"]').first().check();
        await page.locator('form button[type="submit"]').first().click();
        await page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
        const pin = new URL(page.url()).pathname.split('/').pop().toUpperCase();
        summary.pin = pin;
        const nick = page.locator('input[name="nickname"]');
        await until('the host sees the name box', () => visible(nick));
        await nick.fill(names[0]);
        await page.locator('form button[type="submit"]').first().click();
        await page.waitForURL(/\/game-staging\//, { timeout: 30000 });
        const offer = page.locator('.big-screen-offer');
        await until('the big-screen offer', () => visible(offer));
        await offer.locator('button').click();
        await until('the computer is the big screen', async () => (await db('GET', `games/${pin}/hasHost`)) === 'screen');
        log(`game ${pin} (${LOCALE}): the computer is the big screen`);
        for (const p of [...players, stranger]) await join(p, base, pin);
        await until('five seats', async () => Object.keys(await db('GET', `games/${pin}/players`) || {}).length === 5);

        // Nobody pairs or controls without the big screen.
        const noPress = await post('hostControl', { pin, act: 'claim', code: 'ABCDEFGH' });
        check(noPress.status === 400 && noPress.body.code === 'NO_OFFER', `a claim before the press got ${noPress.status} ${JSON.stringify(noPress.body)}`);
        const noKeyOpen = await post('hostControl', { pin, act: 'pairOpen' });
        check(noKeyOpen.status === 403, `a pairing opened without the host key: ${noKeyOpen.status}`);
        const madeUp = await post('hostControl', { pin, act: 'lies', remoteKey: 'R'.repeat(24) });
        check(madeUp.status === 403, `a made-up remote key got ${madeUp.status}`);

        // 2. The press, and the pairing.
        const button = page.locator('.host-remote-button');
        await until('the big screen has "Host controls on your phone"', () => visible(button));
        check(!(await visible(ben.page.locator('.host-remote-button'))), 'a player has the pairing button');
        await shot(screen, '1-big-screen-lobby-button');
        await button.click();
        const modal = page.locator('.host-remote-modal.is-active');
        await until('the pairing window with a link', () => visible(modal.locator('.remote-link')));
        const shown = (await modal.locator('.remote-link').innerText()).trim();
        summary.linkShown = shown;
        const pairing = await db('GET', `games/${pin}/pairing`);
        check(shown === `bullshit.wtf/host/${pin}?c=${pairing.code}`, `the link shown is ${shown}`);
        const hostKey = await db('GET', `games/${pin}/hostKey`);
        check(!(await textOf(screen)).includes(hostKey), 'the host key is on the big screen');
        await shot(screen, '2-big-screen-pairing-qr');
        // The whole window fits a 1280x720 big screen, down to the box for the number.
        summary.pairingBox = await modal.locator('.modal-content').evaluate((el) => {
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return { top: r.top, bottom: r.bottom, width: r.width, maxHeight: cs.maxHeight, scroll: el.scrollHeight - el.clientHeight, sideways: el.scrollWidth - el.clientWidth, cssWidth: cs.width, maxWidth: cs.maxWidth, inner: el.firstElementChild.getBoundingClientRect().width, parent: el.parentElement.getBoundingClientRect().width };
        });
        const safety = await modal.locator('.remote-safety').boundingBox();
        check(safety && safety.y + safety.height <= 720, `the pairing window runs below the big screen (${JSON.stringify(summary.pairingBox)})`);
        const link = `${base}/host/${pin}?c=${pairing.code}`;

        // A viewer who read the link off the stream opens it first, with 19 more phones of a crowd at the
        // same moment (20 in all); the host's phone next.
        const CROWD = 19;
        const [, ...crowd] = await Promise.all([
            viewer.page.goto(link),
            ...Array.from({ length: CROWD }, () => post('hostControl', { pin, act: 'claim', code: pairing.code })),
        ]);
        await until('the viewer\'s phone shows a number', () => visible(viewer.page.locator('.pair-number')));
        const crowdOk = crowd.filter((r) => r.status === 200 && /^\d{4}$/.test(r.body && r.body.digits));
        check(crowdOk.length === CROWD, `only ${crowdOk.length} of ${CROWD} crowd phones got a number: ${JSON.stringify(crowd.filter((r) => r.status !== 200).slice(0, 3))}`);
        summary.crowdClaimed = crowdOk.length + 1;
        await remote.page.goto(link);
        await until('the host\'s phone shows a number', () => visible(remote.page.locator('.pair-number')));
        const viewerNumber = (await viewer.page.locator('.pair-number').innerText()).replace(/\D/g, '');
        const hostNumber = (await remote.page.locator('.pair-number').innerText()).replace(/\D/g, '');
        summary.numbers = { viewer: viewerNumber, host: hostNumber };
        const crowdNumbers = crowdOk.map((r) => r.body.digits);
        check(/^\d{4}$/.test(hostNumber) && viewerNumber !== hostNumber && !crowdNumbers.includes(hostNumber), 'two phones show the same number');
        check(new Set([viewerNumber, hostNumber, ...crowdNumbers]).size === CROWD + 2, 'two crowd phones show the same number');
        check(!remote.page.url().includes('c='), 'the code stays in the phone\'s address bar');
        await shot(remote, '3-phone-number');
        await until('the big screen says 21 phones asked', async () => (await visible(modal.locator('.remote-asked')))
            && (await modal.locator('.remote-asked').innerText()).includes(String(CROWD + 2)), 10000);
        check(!(await visible(modal.locator('.remote-full'))), 'the big screen says the link is full after 21 phones');
        // Wrong number: refused, and nothing is paired.
        const wrong = ['1111', '2222', '3333', '4444', '5555'].find((n) => n !== viewerNumber && n !== hostNumber && !crowdNumbers.includes(n));
        await modal.locator('.remote-digits').fill(wrong);
        await modal.locator('.remote-pair-button').click();
        await until('a wrong number is refused', () => visible(modal.locator('.remote-error')));
        check(!(await db('GET', `games/${pin}/remote`)), 'a wrong number paired a phone');
        await shot(screen, '4-big-screen-21-asked-wrong-number');
        await modal.locator('.remote-digits').fill(`${hostNumber.slice(0, 2)} ${hostNumber.slice(2)}`);
        await modal.locator('.remote-pair-button').click();
        await until('the big screen says the phone is paired', () => visible(modal.locator('.remote-paired')));
        await shot(screen, '5-big-screen-paired');
        await page.locator('.host-remote-modal .remote-close').click();
        await until('the host\'s phone has the controls', () => visible(remote.page.locator('.remote-players')));
        await until('the viewer\'s phone is told the link expired', () => visible(viewer.page.locator('.remote-message')), 10000);
        await shot(viewer, '6-viewer-phone-expired');
        const viewerKey = await storedRemote(viewer, pin);
        const hostRemoteKey = await storedRemote(remote, pin);
        check(!viewerKey, 'the viewer\'s phone kept a key');
        check(hostRemoteKey && hostRemoteKey.key !== hostKey, 'the phone holds the host key');
        const game1 = await db('GET', `games/${pin}`);
        check(game1.remote && game1.remote.key === hostRemoteKey.key, 'the paired key is not the host phone\'s');
        check(!game1.pairing, 'the pairing is still open after it paired');
        // The used number and code, read off the stream, open nothing now.
        const again = await post('hostControl', { pin, act: 'claim', code: pairing.code });
        check(again.status === 400, `the used code claimed again: ${again.status}`);
        const remoteCantPair = await post('hostControl', { pin, act: 'pairOpen', remoteKey: hostRemoteKey.key });
        check(remoteCantPair.status === 403, `the remote opened a pairing: ${remoteCantPair.status}`);
        const remoteCantStart = await post('startGame', { pin, hostKey: hostRemoteKey.key });
        check(remoteCantStart.status >= 400, `the remote key started the game: ${remoteCantStart.status}`);

        // 3. The lobby: the phone removes the Stranger. The phone takes no seat.
        check(!Object.values(game1.players).some((p) => p.host), 'a seat is the host\'s');
        check(Object.keys(game1.players).length === 5, 'the phone took a seat');
        await shot(remote, '7-phone-lobby-players');
        const strangerRow = remote.page.locator('.host-seat', { hasText: stranger.name });
        await strangerRow.locator('.host-remove').click();
        await strangerRow.locator('.host-remove-yes').click();
        await until('the Stranger\'s phone says it was removed', () => visible(stranger.page.locator('.removed-modal.is-active')));
        check(Object.keys(await db('GET', `games/${pin}/players`)).length === 4, 'the Stranger still has a seat');

        const start = page.locator('.game-header > button');
        await until('START', () => visible(start));
        await start.first().click();
        await until('question 1', async () => (await db('GET', `games/${pin}/state`)).id === 2, 60000);

        // 4. Question 1: the lies on the phone, none on the big screen.
        const lies = he
            ? { ben: 'שקר של בן', cleo: 'שקר של קליאו', troll: 'משהו גס', dee: 'שקר של די' }
            : { ben: 'ben lie', cleo: 'cleo lie', troll: 'something crude', dee: 'dee lie' };
        await sendLie(ben, lies.ben);
        await sendLie(cleo, lies.cleo);
        const openLies = remote.page.locator('.open-lies');
        await until('the phone offers the lies', () => visible(openLies));
        await shot(remote, '8-phone-writing');
        await openLies.click();
        await until('the phone\'s lies list', () => visible(remote.page.locator('.check-list')));
        const state1 = await db('GET', `games/${pin}/state`);
        const checking = await db('GET', `games/${pin}/checking`);
        check(checking && !checking.pid, `checking is ${JSON.stringify(checking)}`);
        await sendLie(troll, lies.troll);
        await sendLie(dee, lies.dee);
        const trollRow = remote.page.locator('.check-lie', { hasText: lies.troll.toUpperCase() });
        await until('Troll\'s lie on the phone', () => visible(trollRow));
        await until('Dee\'s lie on the phone', () => visible(remote.page.locator('.check-lie', { hasText: lies.dee.toUpperCase() })));
        await sleep(1500);
        check((await db('GET', `games/${pin}/state`)).timestamp === state1.timestamp, 'the last lie ended the writing while the phone looked');
        const outsideLies = await remote.page.locator('.check-list').evaluate((el) => {
            const copy = el.cloneNode(true);
            copy.querySelectorAll('.check-text').forEach((t) => t.remove());
            return copy.innerText;
        });
        check(!players.some((p) => outsideLies.includes(p.name)), 'the phone\'s list names a writer');
        const bigText = (await textOf(screen)).toLowerCase();
        check(!Object.values(lies).some((l) => bigText.includes(l.toLowerCase())), 'a lie is on the big screen while they are written');
        await shot(screen, '9-big-screen-writing-no-lies');
        await trollRow.locator('button').click();
        await until('Troll\'s lie hidden', () => visible(remote.page.locator('.check-lie.is-hidden-lie')));
        await shot(remote, '10-phone-lie-hidden');
        await remote.page.locator('.show-now').click();
        await until('the answers', async () => (await db('GET', `games/${pin}/state`)).id === 3, 15000);
        const answers = await db('GET', `games/${pin}/answers`);
        check(!Object.values(answers).some((a) => a.text === lies.troll), 'the hidden lie is among the answers');
        summary.answersQ1 = Object.values(answers).map((a) => a.text).sort();
        await until('the big screen shows the answers', async () => (await textOf(screen)).toUpperCase().includes(lies.ben.toUpperCase()));
        check(!(await textOf(screen)).toLowerCase().includes(lies.troll.toLowerCase()), 'the hidden lie is on the big screen');
        await shot(screen, '11-big-screen-answers');
        await until('Troll is told the host hid the lie', () => visible(troll.page.locator('.own-lie-notice')));
        await until('the phone says the lies wait for the next question', () => visible(remote.page.locator('.remote-later')));
        for (const p of players) {
            await until(`${p.name} has answers`, () => visible(p.page.locator('button.answer')));
            const truth = p.page.locator('button.answer', { hasText: he ? 'אמת' : 'TRUTH' });
            await ((await truth.count()) ? truth.first() : p.page.locator('button.answer').first()).click().catch(() => { });
        }
        await until('the reveal', async () => (await db('GET', `games/${pin}/state`)).id === 4, 30000);
        const picks = Object.keys((await db('GET', `games/${pin}/answerSelections`)) || {});
        const reveal = (await db('GET', `games/${pin}/revealAnswers`)) || [];
        const pickers = new Set([].concat(...reveal.map((r) => r.selectors || [])));
        summary.picksQ1 = { sent: picks.length, onReveal: pickers.size };
        check(picks.length === 4 && picks.every((pid) => pickers.has(pid)), 'a player\'s pick did not count while the phone checked');

        // 5. Question 2: the phone removes Cleo while the lies are written.
        await until('question 2', async () => {
            const [s, q] = await Promise.all([db('GET', `games/${pin}/state`), db('GET', `games/${pin}/questionIndex`)]);
            return s.id === 2 && q === 1;
        }, 90000);
        await until('the phone is back to the lies button', () => visible(openLies));
        const cleoRow = remote.page.locator('.host-seat', { hasText: cleo.name });
        await cleoRow.locator('.host-remove').click();
        await until('the phone asks to confirm', () => visible(remote.page.locator('.host-confirm-line')));
        await shot(remote, '12-phone-remove-confirm');
        await cleoRow.locator('.host-remove-yes').click();
        await until('Cleo\'s phone says it was removed', () => visible(cleo.page.locator('.removed-modal.is-active')));
        summary.playersAfter = Object.values(await db('GET', `games/${pin}/players`)).map((p) => p.nickname).sort();
        check(summary.playersAfter.length === 3, 'Cleo still has a seat');

        // 6. The big screen disconnects the phone.
        await button.click();
        await until('the big screen says a phone is paired', () => visible(modal.locator('.remote-paired')));
        await modal.locator('.remote-unpair').click();
        await until('a new code after disconnecting', () => visible(modal.locator('.remote-link')));
        check(!(await db('GET', `games/${pin}/remote`)), 'the remote is still paired');
        await page.locator('.host-remote-modal .remote-close').click();
        const benRow = remote.page.locator('.host-seat', { hasText: ben.name });
        await benRow.locator('.host-remove').click();
        await benRow.locator('.host-remove-yes').click();
        await until('the phone says it no longer has the controls', () => visible(remote.page.locator('.remote-message')));
        check(!!(await db('GET', `games/${pin}/players`)) && Object.values(await db('GET', `games/${pin}/players`)).some((p) => p.nickname === ben.name),
            'a disconnected phone removed Ben');
        check(!(await storedRemote(remote, pin)), 'the disconnected phone kept its key');
        await shot(remote, '13-phone-disconnected');
        const oldKey = await post('hostControl', { pin, act: 'lies', remoteKey: hostRemoteKey.key });
        check(oldKey.status === 403, `the old remote key got ${oldKey.status}`);

        // 7. A full link: the press opens a new code, the cap's phones claim it; the next phone hears it is full.
        await button.click();
        await until('a new code on the big screen', () => visible(modal.locator('.remote-link')));
        const fresh = await db('GET', `games/${pin}/pairing`);
        const max = 50;
        for (let i = 0; i < max; i += 10) {
            const batch = await Promise.all(Array.from({ length: 10 }, () => post('hostControl', { pin, act: 'claim', code: fresh.code })));
            check(batch.every((r) => r.status === 200), `a claim under the cap was refused: ${JSON.stringify(batch.find((r) => r.status !== 200))}`);
        }
        const over = await post('hostControl', { pin, act: 'claim', code: fresh.code });
        check(over.status === 400 && over.body && over.body.code === 'PAIR_FULL', `claim ${max + 1} got ${over.status} ${JSON.stringify(over.body)}`);
        await viewer.page.evaluate(() => localStorage.removeItem('BS_REMOTE_KEYS'));
        await viewer.page.goto(`${base}/host/${pin}?c=${fresh.code}`);
        await until('the late phone is told the link is full', () => visible(viewer.page.locator('.remote-message.remote-full')), 15000);
        summary.fullText = (await viewer.page.locator('.remote-full').innerText()).trim();
        await shot(viewer, '14-phone-link-full');
        await until('the big screen says the link is full', () => visible(modal.locator('.remote-full')), 10000);
        const fullNew = await modal.locator('.remote-full-new').boundingBox();
        check(fullNew && fullNew.y + fullNew.height <= 720, `NEW CODE runs below the big screen when the link is full (${JSON.stringify(fullNew)})`);
        await shot(screen, '15-big-screen-link-full');
        await modal.locator('.remote-full-new').click();
        await until('a new code with room', async () => {
            const p = await db('GET', `games/${pin}/pairing`);
            return p && p.code !== fresh.code && !p.claims;
        });
        check(!(await visible(modal.locator('.remote-full'))), 'the new code is still full');

        [screen, remote, viewer, ...players].forEach((p) => p.problems.forEach((x) => problems.push(`${p.name}: ${x}`)));
    } catch (e) {
        problems.push(e.message);
    } finally {
        summary.problems = problems;
        console.log('\nRESULT ' + JSON.stringify(summary, null, 2));
        console.log(problems.length ? 'FAIL' : 'PASS');
        process.exitCode = problems.length ? 1 : 0;
        if (browser) await browser.close().catch(() => { });
        if (server) server.close();
        await stopEmulators(emulators);
    }
}

main();
