#!/usr/bin/env node
// Screenshots of the game's layout in Discord (spec row 6; src/app/portal/discord.ts, "the layout in
// Discord"), with no Discord account: a fake Discord client frames the Activity with Discord's launch
// parameters, answers the SDK's handshake, and can send Discord's layout mode (focused,
// picture-in-picture, grid). Not a pull request check: it is the look, checked by eye, before a real call.
//
// Three players in one call play against the Firebase emulators: Ana on a computer (a wide frame),
// Ben and Cleo on phones (Discord's safe-area insets set as a phone with a notch would have them).
// For the lobby and the first question it saves:
//   computer-<screen>.png   Ana's wide frame (1280x720): the phone-width column in the middle;
//   pip-<screen>.png        Ana's frame as a small picture-in-picture window (400x225), layout mode PIP;
//   phone-<screen>.png      Ben's phone (390x844, notch and home bar insets);
// plus computer-join.png and phone-join.png (the nickname step before the lobby), phone-refused-lie.png
// and site-<screen>.png: the same build on the site (no Discord), unchanged.
// It also checks: html carries bs-discord only in Discord; the column is at most 30rem wide and
// centred; the picture-in-picture card shows in PIP and goes in focused; a phone asked for portrait.
//
// Needs Java, functions/ built, game/ built, and .github/smoke installed (npm ci there).
//   node game/scripts/discord-layout-shots.js <folder for the pictures> [path to dist]
// Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SMOKE = path.join(ROOT, '.github', 'smoke');
const OUT = path.resolve(process.argv[2] || path.join(os.tmpdir(), 'bs-discord-layout'));
const SOURCE = path.resolve(process.argv[3] || path.join(ROOT, 'game', 'dist'));
const COPY = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-discord-layout-'));
process.argv[2] = COPY;

const { chromium } = require(path.join(SMOKE, 'node_modules', 'playwright'));
const { serve } = require(path.join(SMOKE, 'smoke'));
const { HOST, DB, PROJECT, log, sleep, up, startEmulators, stopEmulators, db, seed, newPhone, act, visible } = require(path.join(SMOKE, 'emulator-game'));

const PLACEHOLDER = 'DISCORD_APP_ID_PLACEHOLDER';
const APP_ID = '1300000000000000001';
const SIZES = {
    computer: { width: 1280, height: 720 },
    pip: { width: 400, height: 225 },
    phone: { width: 390, height: 844 },
};
// A phone with a notch: what Discord's mobile app gives the Activity as its safe-area insets.
const PHONE_INSETS = { top: 47, bottom: 34 };

const FAKE_CLIENT = `<!doctype html><html><head><meta charset="utf-8"><title>fake Discord client</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;height:100%;background:#313338}iframe{border:0;width:100%;height:100%;display:block}</style></head><body>
<script>
window.__commands = [];
window.__subs = {};
var activity = null;
addEventListener('message', function (e) {
    var m = e.data; if (!Array.isArray(m)) return;
    var op = m[0], p = m[1] || {};
    activity = e.source;
    if (op === 0) {
        e.source.postMessage([1, { cmd: 'DISPATCH', evt: 'READY', nonce: null,
            data: { v: 1, config: { cdn_host: 'cdn.discordapp.com', api_endpoint: '//discord.com/api', environment: 'production' } } }], '*');
    } else if (op === 1 && p.cmd) {
        window.__commands.push({ cmd: p.cmd, args: p.args, evt: p.evt });
        if (p.cmd === 'SUBSCRIBE') window.__subs[p.evt] = true;
        e.source.postMessage([1, { cmd: p.cmd, nonce: p.nonce, evt: null, data: p.cmd === 'SUBSCRIBE' ? { evt: p.evt } : {} }], '*');
        if (p.cmd === 'SUBSCRIBE' && p.evt === 'ACTIVITY_LAYOUT_MODE_UPDATE') window.__layout(0);
    }
});
window.__layout = function (mode) {
    if (activity) activity.postMessage([1, { cmd: 'DISPATCH', evt: 'ACTIVITY_LAYOUT_MODE_UPDATE', nonce: null, data: { layout_mode: mode } }], '*');
};
var f = document.createElement('iframe');
f.src = '/' + location.search;
document.body.appendChild(f);
</script></body></html>`;

function copyWithAppId() {
    fs.cpSync(SOURCE, COPY, { recursive: true });
    let swapped = 0;
    for (const f of fs.readdirSync(COPY)) {
        if (!/\.js$/.test(f)) continue;
        const p = path.join(COPY, f);
        const s = fs.readFileSync(p, 'utf8');
        if (s.includes(PLACEHOLDER)) {
            fs.writeFileSync(p, s.split(PLACEHOLDER).join(APP_ID));
            swapped++;
        }
    }
    if (!swapped) throw new Error(`no ${PLACEHOLDER} in ${SOURCE}: is it a build of this branch?`);
    fs.writeFileSync(path.join(COPY, 'fake-discord.html'), FAKE_CLIENT);
}

async function waitFor(what, fn, ms = 30000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const v = await fn().catch(() => null);
        if (v) return v;
        await sleep(250);
    }
    throw new Error(`timed out: ${what}`);
}

function routeOf(frame) {
    const hash = new URL(frame.url()).hash.replace(/^#/, '').split('?')[0];
    const parts = hash.split('/').filter(Boolean);
    return parts.length ? parts : ['home'];
}

function asPage(frame) {
    return { url: () => `http://x/${routeOf(frame).join('/')}`, locator: (s) => frame.locator(s) };
}

async function openInCall(browser, base, name, size, platform, instance, problems) {
    const phone = await newPhone(browser, base, name, platform === 'desktop' ? 'screen' : 'player');
    phone.role = 'player';
    await phone.page.setViewportSize(size);
    phone.page.on('pageerror', (err) => problems.push(`${name}: uncaught exception: ${err.message}`));
    const search = `?instance_id=${instance}&frame_id=f-${name}&platform=${platform}&guild_id=900&channel_id=901`;
    await phone.page.goto(`${base}/fake-discord.html${search}`);
    const frame = await waitFor(`${name}'s Activity frame`, async () => phone.page.frames().find((f) => f !== phone.page.mainFrame() && /^http/.test(f.url())));
    if (platform === 'mobile') {
        // Discord's mobile app gives the Activity its safe-area insets as CSS variables.
        await frame.waitForLoadState('domcontentloaded');
        await frame.evaluate((i) => {
            document.documentElement.style.setProperty('--discord-safe-area-inset-top', `${i.top}px`);
            document.documentElement.style.setProperty('--discord-safe-area-inset-bottom', `${i.bottom}px`);
        }, PHONE_INSETS);
    }
    return Object.assign(phone, { frame, page: asPage(frame), tab: phone.page, lies: [], picks: [], done: false });
}

/** Where the column sits in a frame: its box, the frame's width, and whether html is marked. */
async function columnOf(frame, selector) {
    return frame.evaluate((sel) => {
        const el = document.querySelector(sel);
        const r = el ? el.getBoundingClientRect() : null;
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
        return {
            classes: document.documentElement.className,
            frameWidth: window.innerWidth,
            rem,
            box: r && { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), right: Math.round(window.innerWidth - r.right) },
            pipCard: (() => { const c = document.querySelector('.bs-discord-pip-card'); return !!c && getComputedStyle(c).display !== 'none'; })(),
        };
    }, selector);
}

async function shot(player, name) {
    const file = path.join(OUT, `${name}.png`);
    await player.tab.screenshot({ path: file });
    return path.basename(file);
}

async function main() {
    fs.mkdirSync(OUT, { recursive: true });
    copyWithAppId();
    const emulators = await startEmulators();
    const problems = [];
    const summary = { out: OUT, shots: [] };
    let browser;
    let site;
    try {
        if (!(await up(`http://${DB}/.json?ns=${PROJECT}`))) throw new Error('no database emulator on :9000');
        await seed();
        site = await serve(COPY);
        const base = `http://${HOST}:${site.address().port}`;
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`] });
        const CALL = 'i-layout-shots-0001';
        const ana = await openInCall(browser, base, 'Ana', SIZES.computer, 'desktop', CALL, problems);
        const pinRoute = await waitFor('Ana in the call\'s game', async () => { const r = routeOf(ana.frame); return r[0] === 'join-game' && r[1] ? r : null; });
        const pin = pinRoute[1].toUpperCase();
        ana.role = 'host';
        const ben = await openInCall(browser, base, 'Ben', SIZES.phone, 'mobile', CALL, problems);
        const cleo = await openInCall(browser, base, 'Cleo', SIZES.phone, 'mobile', CALL, problems);
        // The join step (the nickname), before anyone joins.
        await ana.frame.locator('input[name="nickname"]').waitFor({ timeout: 20000 });
        await waitFor('Ben\'s join step', async () => routeOf(ben.frame)[0] === 'join-game' && visible(ben.frame.locator('input[name="nickname"]')));
        await sleep(800);
        summary.shots.push(await shot(ana, 'computer-join'));
        summary.shots.push(await shot(ben, 'phone-join'));
        const players = [ana, ben, cleo];
        const game = { pin };

        // The lobby: everyone in, nobody presses START yet.
        await waitFor('everyone in the lobby', async () => {
            await Promise.all(players.map((p) => act(p, game).catch(() => { })));
            return players.every((p) => routeOf(p.frame)[0] === 'game-staging');
        }, 60000);
        await sleep(1500);
        await shoot('lobby', '.game-container');

        // The first question.
        game.everyoneIn = true;
        await waitFor('the first question', async () => {
            if (routeOf(ana.frame)[0] !== 'show-question') await act(ana, game).catch(() => { });
            return players.every((p) => routeOf(p.frame)[0] === 'show-question') && visible(ana.frame.locator('form input.input'));
        }, 90000);
        await sleep(800);
        await shoot('question', '.game-container');

        // The phones asked Discord for portrait; the computer did not.
        const commands = async (p) => p.tab.evaluate(() => window.__commands);
        const benLock = (await commands(ben)).find((c) => c.cmd === 'SET_ORIENTATION_LOCK_STATE');
        const anaLock = (await commands(ana)).find((c) => c.cmd === 'SET_ORIENTATION_LOCK_STATE');
        summary.orientation = { phone: benLock && benLock.args, computer: anaLock ? anaLock.args : null };
        if (!benLock || benLock.args.lock_state !== 2) problems.push(`the phone did not ask for portrait: ${JSON.stringify(benLock)}`);
        if (anaLock) problems.push('the computer asked for an orientation lock');
        const subs = (await commands(ana)).filter((c) => c.cmd === 'SUBSCRIBE').map((c) => c.evt);
        summary.subscribed = subs;
        if (subs.indexOf('ACTIVITY_LAYOUT_MODE_UPDATE') < 0) problems.push('the layout mode was not subscribed to');

        // A lie refused in Discord: the word filter, and the player's message.
        await ben.frame.locator('form input.input').fill('a whore');
        await ben.frame.locator('form button[type="submit"]').first().click();
        const refused = await waitFor('the refused lie\'s message', async () => {
            const t = await ben.frame.locator('.notification.is-danger').first().innerText().catch(() => '');
            return /Keep it clean/.test(t) ? t.trim() : null;
        }, 15000).catch(() => null);
        summary.refusedLie = refused;
        if (!refused) problems.push('a flagged lie was not refused in Discord');
        summary.shots.push(await shot(ben, 'phone-refused-lie'));

        // The site: the same build, no Discord. Nothing of the Discord look.
        const visitor = await newPhone(browser, base, 'Site', 'screen');
        visitor.page.on('pageerror', (err) => problems.push(`site: uncaught exception: ${err.message}`));
        await visitor.page.goto(`${base}/join-game/${pin}`);
        await visitor.page.locator('input[name="nickname"]').waitFor({ timeout: 20000 });
        const siteLook = await visitor.page.evaluate(() => document.documentElement.className);
        summary.siteClasses = siteLook;
        if (/bs-discord/.test(siteLook)) problems.push(`the site carries the Discord look: ${siteLook}`);
        await visitor.page.screenshot({ path: path.join(OUT, 'site-join.png') });
        summary.shots.push('site-join.png');

        async function shoot(screen, selector) {
            // Computer, focused.
            const wide = await columnOf(ana.frame, selector);
            summary[`computer-${screen}`] = wide;
            if (!/bs-discord/.test(wide.classes)) problems.push(`${screen}: no bs-discord in Discord`);
            if (!wide.box || wide.box.width > 30 * wide.rem + 1) problems.push(`${screen}: the column is ${wide.box && wide.box.width}px wide on a computer`);
            if (wide.box && Math.abs(wide.box.left - wide.box.right) > 2) problems.push(`${screen}: the column is not centred (${JSON.stringify(wide.box)})`);
            if (wide.pipCard) problems.push(`${screen}: the picture-in-picture card shows in focused`);
            summary.shots.push(await shot(ana, `computer-${screen}`));
            // Picture-in-picture: a small window, layout mode PIP.
            await ana.tab.setViewportSize(SIZES.pip);
            await ana.tab.evaluate(() => window.__layout(1));
            await sleep(400);
            const pip = await columnOf(ana.frame, selector);
            summary[`pip-${screen}`] = { pipCard: pip.pipCard, classes: pip.classes };
            if (!pip.pipCard) problems.push(`${screen}: no picture-in-picture card in PIP`);
            summary.shots.push(await shot(ana, `pip-${screen}`));
            // Back to focused.
            await ana.tab.evaluate(() => window.__layout(0));
            await ana.tab.setViewportSize(SIZES.computer);
            await sleep(400);
            const back = await columnOf(ana.frame, selector);
            if (back.pipCard) problems.push(`${screen}: the picture-in-picture card stayed after focused`);
            // Phone.
            const phone = await columnOf(ben.frame, selector);
            summary[`phone-${screen}`] = phone;
            if (!phone.box || phone.box.top < PHONE_INSETS.top) problems.push(`${screen}: the phone's screen starts under the notch (${JSON.stringify(phone.box)})`);
            summary.shots.push(await shot(ben, `phone-${screen}`));
        }
    } catch (e) {
        problems.push(`stopped: ${e.message}`);
    } finally {
        summary.problems = problems;
        console.log('\nRESULT ' + JSON.stringify(summary, null, 2));
        console.log(problems.length ? 'FAIL' : 'PASS');
        process.exitCode = problems.length ? 1 : 0;
        if (browser) await browser.close().catch(() => { });
        if (site) site.close();
        stopEmulators(emulators);
        fs.rmSync(COPY, { recursive: true, force: true });
    }
}

main().catch((e) => {
    console.error('FAIL', e.stack || e);
    process.exit(1);
});
