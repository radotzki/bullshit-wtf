#!/usr/bin/env node
// A local run of the Discord Activity's shell (src/app/portal/discord.ts), with Discord's launch
// parameters faked: no Discord account, no Discord app. It is not a pull request check (those live in
// .github/smoke and run the build as it is, with the app id's placeholder, where the shell is off);
// it is the proof, before the owner's Discord app exists, that the shell's flow works, and the start
// of the Discord check once the build carries the real app id.
//
// It builds nothing: it copies a built game (game/dist), puts a test app id in place of the
// placeholder in the copy (so the shell is on), and plays against the Firebase emulators with the
// smoke test's helpers (.github/smoke: emulator-game.js, discord-proxy.js).
//
// A. Inside the stand-in for Discord's proxy (discord-proxy.js: the Activity in a frame at
//    https://<app id>.discordsays.com, a strict content policy, the URL mappings). The stand-in's
//    client is not Discord, so the SDK never becomes ready there: this also proves the shell goes on
//    without it.
//    1. Four players open the Activity in one call (one instance id): each lands in the same game's
//       join step with no PIN typed, joins, and the game is played to the final scoreboard.
//    2. A fifth person opens the Activity in that call after the game ended: the waiting-for-rematch
//       screen, not the old scores. Their REMATCH makes the next game; a sixth person then lands in it.
//    3. A call whose game has its 12 players: the 13th person sees "this game is full"; when that game
//       ends, the screen moves to the waiting-for-rematch one.
// B. With a fake Discord client (a page on the game's own origin that answers the SDK's handshake and
//    commands the way Discord's client does): the SDK becomes ready, INVITE TO THIS CALL opens Discord's
//    invite dialog, and a link out of the game goes to openExternalLink.
//
// Needs Java, functions/ built, game/ built, and .github/smoke installed (npm ci there).
//   node game/scripts/discord-shell-run.js [path to dist]
// Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SMOKE = path.join(ROOT, '.github', 'smoke');
const SOURCE = path.resolve(process.argv[2] || path.join(ROOT, 'game', 'dist'));
const COPY = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-discord-shell-'));
// emulator-game.js reads the build's path from the command line.
process.argv[2] = COPY;

const { chromium } = require(path.join(SMOKE, 'node_modules', 'playwright'));
const { serve } = require(path.join(SMOKE, 'smoke'));
const { HOST, DB, PROJECT, log, sleep, up, startEmulators, stopEmulators, db, seed, newPhone, act, visible } = require(path.join(SMOKE, 'emulator-game'));
const { startDiscordProxy, BROWSER_ARGS, BROWSER_ENV, ACTIVITY_HOST, APP_ID } = require(path.join(SMOKE, 'discord-proxy'));

const PLACEHOLDER = 'DISCORD_APP_ID_PLACEHOLDER';
const GAME_TIMEOUT_MS = 8 * 60 * 1000;
const PHONE_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

/** The built game with the test app id in place of the placeholder: the shell is on in this copy. */
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
    // B's fake Discord client, on the game's own origin (the SDK takes messages from its own origin).
    fs.writeFileSync(path.join(COPY, 'fake-discord.html'), FAKE_CLIENT);
}

/**
 * A stand-in for Discord's client: it frames the Activity with Discord's launch parameters (from its
 * own address), answers the SDK's handshake with READY, and answers each command, keeping a list.
 */
const FAKE_CLIENT = `<!doctype html><html><head><meta charset="utf-8"><title>fake Discord client</title>
<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style></head><body>
<script>
window.__commands = [];
addEventListener('message', function (e) {
    var m = e.data; if (!Array.isArray(m)) return;
    var op = m[0], p = m[1] || {};
    if (op === 0) {
        window.__handshake = p;
        e.source.postMessage([1, { cmd: 'DISPATCH', evt: 'READY', nonce: null,
            data: { v: 1, config: { cdn_host: 'cdn.discordapp.com', api_endpoint: '//discord.com/api', environment: 'production' } } }], '*');
    } else if (op === 1 && p.cmd) {
        window.__commands.push({ cmd: p.cmd, args: p.args });
        e.source.postMessage([1, { cmd: p.cmd, nonce: p.nonce, evt: null, data: p.cmd === 'OPEN_EXTERNAL_LINK' ? { opened: true } : p.cmd === 'SUBSCRIBE' ? { evt: p.args && p.args.evt || p.evt } : {} }], '*');
    }
});
var f = document.createElement('iframe');
f.src = '/' + location.search;
document.body.appendChild(f);
</script></body></html>`;

async function waitFor(what, fn, ms = 30000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        const v = await fn().catch(() => null);
        if (v) return v;
        await sleep(250);
    }
    throw new Error(`timed out: ${what}`);
}

/** The route in a frame's hash (#/join-game/ABCD?x): ['join-game', 'ABCD'], ['home'] for the home. */
function routeOf(frame) {
    const hash = new URL(frame.url()).hash.replace(/^#/, '').split('?')[0];
    const parts = hash.split('/').filter(Boolean);
    return parts.length ? parts : ['home'];
}

/** The frame as emulator-game.js's act() reads a page: the hash route as the address's path. */
function asPage(frame) {
    return {
        url: () => `http://x/${routeOf(frame).join('/')}`,
        locator: (s) => frame.locator(s),
    };
}

// ---------- A: inside the proxy stand-in ----------

async function openActivity(browser, proxy, name, instance, desktop, problems) {
    const context = await browser.newContext(desktop
        ? { serviceWorkers: 'block', viewport: { width: 1280, height: 720 } }
        : { serviceWorkers: 'block', viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true, userAgent: PHONE_UA });
    const tab = await context.newPage();
    const player = { name, role: 'player', context, tab, lies: [], picks: [], done: false, screens: [] };
    tab.on('pageerror', (err) => problems.push(`${name}: uncaught exception: ${err.message}`));
    if (process.env.VERBOSE) tab.on('console', (msg) => log(`[${name} console.${msg.type()}] ${msg.text().slice(0, 300)}`));
    await tab.goto(proxy.client(desktop ? 'desktop' : 'mobile', `f-${name}`, instance));
    player.frame = await waitFor(`${name}'s Activity frame`, async () => tab.frames().find((f) => new URL(f.url()).hostname === ACTIVITY_HOST));
    player.page = asPage(player.frame);
    return player;
}

async function pinOf(player, what) {
    const route = await waitFor(what, async () => {
        const r = routeOf(player.frame);
        return r[0] === 'join-game' && r[1] ? r : null;
    }).catch(async (e) => {
        const text = await player.frame.evaluate(() => document.body.innerText).catch(() => '');
        throw new Error(`${e.message} (at ${player.frame.url()}: ${text.replace(/\s+/g, ' ').slice(0, 200)})`);
    });
    return route[1].toUpperCase();
}

async function partA(browser, proxy, problems, summary) {
    const CALL = 'i-shell-run-0001-gc-1-2';
    const ana = await openActivity(browser, proxy, 'Ana', CALL, false, problems);
    const pin = await pinOf(ana, 'Ana in the call\'s game');
    ana.role = 'host';
    const others = [];
    for (const [name, desktop] of [['Ben', false], ['Cleo', false], ['Dov', true]]) {
        const p = await openActivity(browser, proxy, name, CALL, desktop, problems);
        const theirs = await pinOf(p, `${name} in the call's game`);
        if (theirs !== pin) problems.push(`${name} landed in ${theirs}, not the call's game ${pin}`);
        others.push(p);
    }
    const players = [ana].concat(others);
    const row = await db('GET', `discord/${CALL}`);
    const created = await db('GET', `games/${pin}`);
    summary.call = { pin, row, campaign: created && created.campaign, creator: !!(created && created.creator) };
    if (!row || row.pin !== pin) problems.push(`the call's row does not point at ${pin}: ${JSON.stringify(row)}`);
    if (!created || created.campaign !== 'discord-activity') problems.push(`the call's game is not tagged discord-activity (${created && created.campaign})`);

    // Play it: join, lobby, START, every question, the final scoreboard.
    const game = { pin };
    const deadline = Date.now() + GAME_TIMEOUT_MS;
    let lobbyChecked = false;
    while (Date.now() < deadline && !players.every((p) => p.done)) {
        if (!game.everyoneIn) {
            const seated = await db('GET', `games/${pin}/players`);
            game.everyoneIn = seated && Object.keys(seated).length === players.length && players.every((p) => p.joined);
        }
        if (!lobbyChecked && routeOf(ana.frame)[0] === 'game-staging' && await visible(ana.frame.locator('.invite-discord'))) {
            lobbyChecked = true;
            summary.lobby = {
                discordInvite: await visible(ana.frame.locator('.invite-discord')),
                // No SDK in the stand-in (its client is not Discord): no invite button, the hint only.
                inviteButton: await visible(ana.frame.locator('.invite-call')),
                hint: await visible(ana.frame.locator('.invite-call-hint')),
                qrShown: await visible(ana.frame.locator('app-qr-code')),
                whatsappShown: await visible(ana.frame.locator('.whatsapp')),
                classes: await ana.frame.evaluate(() => document.documentElement.className),
            };
        }
        for (const p of players) {
            const s = routeOf(p.frame)[0];
            if (p.screens[p.screens.length - 1] !== s) p.screens.push(s);
        }
        await Promise.all(players.filter((p) => !p.done).map((p) => act(p, game).catch(() => { })));
        await sleep(400);
    }
    const final = await db('GET', `games/${pin}`);
    summary.game = {
        finalState: final && final.state && final.state.id,
        reachedFinal: Object.fromEntries(players.map((p) => [p.name, p.done])),
        screens: Object.fromEntries(players.map((p) => [p.name, p.screens.join(' > ')])),
    };
    if (!final || !final.state || final.state.id !== 6) problems.push('the call\'s game did not reach the final scoreboard');
    players.forEach((p) => { if (!p.done) problems.push(`${p.name} never showed the final scoreboard`); });
    if (!summary.lobby) problems.push('the lobby never showed the Discord invite');
    else {
        if (summary.lobby.qrShown) problems.push('the lobby shows a QR code in Discord');
        if (summary.lobby.whatsappShown) problems.push('the lobby shows WhatsApp in Discord');
        if (!summary.lobby.hint) problems.push('the lobby has no "everyone in this call can join" line');
        if (summary.lobby.inviteButton) problems.push('INVITE TO THIS CALL shows with no SDK');
    }
    // The results card's share waits for sign-in with Discord: hidden on the final scoreboard.
    summary.resultsShareShown = await visible(ana.frame.locator('app-share-results'));
    if (summary.resultsShareShown) problems.push('the results card\'s share shows in Discord before sign-in');

    // 2. Someone opens the Activity after the game ended: the waiting-for-rematch screen.
    const eve = await openActivity(browser, proxy, 'Eve', CALL, false, problems);
    await waitFor('Eve\'s waiting-for-rematch screen', async () => visible(eve.frame.locator('.discord-ended')));
    summary.ended = { waitingScreen: true, onOldScores: routeOf(eve.frame)[0] === 'score-board-final' };
    await eve.frame.locator('.discord-rematch').click();
    const next = await pinOf(eve, 'Eve in the rematch');
    const after = await db('GET', `discord/${CALL}`);
    const old = await db('GET', `games/${pin}/fork`);
    const fay = await openActivity(browser, proxy, 'Fay', CALL, false, problems);
    const fays = await pinOf(fay, 'Fay in the rematch');
    const rematch = await db('GET', `games/${next}`);
    Object.assign(summary.ended, { rematch: next, oldGameFork: old, callRow: after && after.pin, fay: fays, campaign: rematch && rematch.campaign });
    if (next === pin) problems.push('REMATCH on the waiting screen did not make a new game');
    if (old !== next) problems.push(`the finished game's rematch is ${old}, not ${next}`);
    if (!after || after.pin !== next) problems.push('the call was not moved to the rematch');
    if (fays !== next) problems.push(`a person opening the Activity after the rematch landed in ${fays}, not ${next}`);
    if (!rematch || rematch.campaign !== 'discord-activity') problems.push('the rematch lost the discord-activity tag');
    // Ana, on her final scores, is offered the rematch the waiting screen made.
    await sleep(1500);
    summary.ended.anaFinalScreen = routeOf(ana.frame).join('/');

    // 3. The 13th person in a call: a game with its 12 players.
    const FULL = 'i-shell-run-full-0001';
    const fullPin = 'FULLZ';
    const now = Date.now();
    const seats = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`p${i}`, { nickname: `seat${i}`, score: 0, uid: `u${i}` }]));
    await db('PUT', `games/${fullPin}`, {
        state: { id: 0, timestamp: now }, locale: 'en', timestamp: now, hostSeen: now, roundIndex: 0, questionIndex: 0,
        totalQ: 5, qids: ['q1', 'q2', 'q3', 'q4', 'q5'], tick: 0, presenter: false, players: seats, campaign: 'discord-activity',
    });
    await db('PUT', `discord/${FULL}`, { pin: fullPin, time: now });
    const gus = await openActivity(browser, proxy, 'Gus', FULL, false, problems);
    await waitFor('Gus\'s "this game is full" screen', async () => visible(gus.frame.locator('.discord-full')));
    summary.full = { fullScreen: true, words: (await gus.frame.locator('.discord-full').innerText()).replace(/\s+/g, ' ').trim() };
    // The game ends: the full screen follows the call to the waiting-for-rematch screen.
    await db('PATCH', `games/${fullPin}`, { state: { id: 6, timestamp: Date.now() } });
    await waitFor('Gus moves to the waiting-for-rematch screen', async () => visible(gus.frame.locator('.discord-ended')), 20000);
    summary.full.afterTheEnd = 'waiting for rematch';
}

// ---------- B: a fake Discord client, the SDK ready ----------

async function partB(browser, base, problems, summary) {
    const hal = await newPhone(browser, base, 'Hal', 'host');
    const search = `?instance_id=i-shell-run-sdk-0001&frame_id=f-hal&platform=mobile&guild_id=900&channel_id=901`;
    await hal.page.goto(`${base}/fake-discord.html${search}`);
    const frame = await waitFor('Hal\'s Activity frame', async () => hal.page.frames().find((f) => f !== hal.page.mainFrame()));
    const player = { name: 'Hal', role: 'host', page: asPage(frame), frame, lies: [], picks: [], done: false };
    await pinOf(player, 'Hal in the call\'s game');
    await waitFor('Hal in the lobby', async () => {
        await act(player, {}).catch(() => { });
        return routeOf(frame)[0] === 'game-staging' && visible(frame.locator('.invite-call'));
    });
    const handshake = await hal.page.evaluate(() => window.__handshake);
    await frame.locator('.invite-call').click();
    await sleep(500);
    // A link that leaves the game: it opens through Discord, and the game stays where it is.
    const before = frame.url();
    await frame.evaluate(() => {
        const a = document.createElement('a');
        a.href = '/how-to-play';
        a.textContent = 'how to play';
        document.body.appendChild(a);
        a.click();
    });
    await sleep(500);
    const commands = await hal.page.evaluate(() => window.__commands);
    summary.sdk = { handshake, commands, stayed: frame.url() === before };
    if (!handshake || handshake.client_id !== APP_ID) problems.push('the SDK\'s handshake did not carry the app id');
    if (!commands.some((c) => c.cmd === 'OPEN_INVITE_DIALOG')) problems.push('INVITE TO THIS CALL did not open Discord\'s invite dialog');
    const link = commands.find((c) => c.cmd === 'OPEN_EXTERNAL_LINK');
    if (!link || link.args.url !== 'https://bullshit.wtf/how-to-play') problems.push(`the link out did not go to openExternalLink: ${JSON.stringify(link)}`);
    if (frame.url() !== before) problems.push('the link out navigated the Activity\'s frame');
    hal.problems.forEach((x) => problems.push(`Hal: ${x}`));
}

async function main() {
    copyWithAppId();
    const emulators = await startEmulators();
    const problems = [];
    const summary = { build: SOURCE, copy: COPY, appId: APP_ID };
    let browser;
    let site;
    let proxy;
    try {
        if (!(await up(`http://${DB}/.json?ns=${PROJECT}`))) throw new Error('no database emulator on :9000');
        await seed();
        site = await serve(COPY);
        const base = `http://${HOST}:${site.address().port}`;
        proxy = await startDiscordProxy({
            site: base, db: DB, auth: `${HOST}:9099`, functions: `http://${HOST}:5001/${PROJECT}/us-central1`, project: PROJECT,
        });
        browser = await chromium.launch({ args: BROWSER_ARGS.concat(['--autoplay-policy=no-user-gesture-required']), env: BROWSER_ENV });
        if (process.env.ONLY !== 'B') await partA(browser, proxy, problems, summary);
        await browser.close();
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`] });
        await partB(browser, base, problems, summary);
    } catch (e) {
        problems.push(`stopped: ${e.message}`);
    } finally {
        summary.problems = problems;
        console.log('\nRESULT ' + JSON.stringify(summary, null, 2));
        console.log(problems.length ? 'FAIL' : 'PASS');
        process.exitCode = problems.length ? 1 : 0;
        if (browser) await browser.close().catch(() => { });
        if (proxy) proxy.server.close();
        if (site) site.close();
        stopEmulators(emulators);
        fs.rmSync(COPY, { recursive: true, force: true });
    }
}

main().catch((e) => {
    console.error('FAIL', e.stack || e);
    process.exit(1);
});
