#!/usr/bin/env node
// Local run: the CrazyGames version (game/src/app/portal) played whole inside a test frame that
// mimics CrazyGames, against the Firebase emulators. Nothing reaches production or CrazyGames.
//
// Inside one Chromium, each phone its own browser profile (390 x 844, touch):
// - https://www.crazygames.com/game/bullshit is a test page standing in for CrazyGames' game page: it
//   frames https://bullshit.wtf/portal/crazygames?via=portal-crazygames and logs every SDK call.
// - https://sdk.crazygames.com/crazygames-sdk-v3.js is a stand-in SDK with the v3 calls the portal uses
//   (init, environment, loading and gameplay, inviteLink, inviteParams, isInstantMultiplayer,
//   updateRoom, leftRoom, getUser, systemInfo.locale, settings.muteAudio). The real SDK's host is never
//   contacted.
// - https://bullshit.wtf/ is game/dist, with firebase.json's rewrites (smoke.js) and its headers, so the
//   portal path's frame-ancestors is enforced by the browser as on Hosting.
// - Firebase calls go to the emulators (as emulator-game.js does); every other host is refused.
//
// It checks: a host makes a game in the frame (nickname = CrazyGames username), the game carries
// campaign portal-crazygames, the lobby's invite is CrazyGames' link, a friend opening that invite
// link lands on the game's join step, a third friend joins by PIN, a flagged lie is refused and the
// player writes another, the game plays to the final scoreboard with gameplay and room calls, no
// link leaves for bullshit.wtf, Instant Multiplayer opens a new 5-question lobby, another site
// can't frame the portal, and how long the portal takes to draw on a 4x slower CPU.
//
// Needs Java (database emulator), functions/ built, game/dist built, and the root's npm ci.
// From the repository root:  node .github/smoke/portal-crazygames.js [dist] [--shots <dir>]
// EMULATORS=running uses emulators you already run (see emulator-game.js).

'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve, fileIn, HOST } = require('./smoke');
const { ROOT, DB, PROJECT, log, sleep, up, startEmulators, stopEmulators, db, seed } = require('./emulator-game');

const args = process.argv.slice(2);
const option = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
};
const positional = args.filter((a, i) => !a.startsWith('--') && !['--shots'].includes(args[i - 1]));
const DIST = path.resolve(positional[0] || path.join(ROOT, 'game', 'dist'));
const SHOTS = option('--shots', process.env.SHOTS || '');
const FUNCTIONS = `http://${HOST}:5001/${PROJECT}/us-central1`;
const AUTH = `http://${HOST}:9099`;
const GAME_TIMEOUT_MS = Number(process.env.GAME_MINUTES || 8) * 60 * 1000;
const SITE = 'https://bullshit.wtf';
const CG = 'https://www.crazygames.com/game/bullshit';
const FLAGGED = 'a cheap whore';

const HOSTING = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8')).hosting;
function globToRegExp(glob) {
    const re = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0001').replace(/\*\*/g, '\u0002').replace(/\*/g, '[^/]*')
        .replace(/\u0001/g, '(?:.*/)?').replace(/\u0002/g, '.*');
    return new RegExp('^' + re + '$');
}
/** The headers firebase.json adds to a path, as Hosting sends them. */
function hostingHeaders(p) {
    const out = {};
    for (const rule of HOSTING.headers) {
        const re = rule.regex ? new RegExp(rule.regex) : globToRegExp(rule.source);
        if (re.test(p)) rule.headers.forEach((h) => { out[h.key.toLowerCase()] = h.value; });
    }
    return out;
}

/** Where a Firebase request goes instead: an emulator URL, or null to refuse it (as emulator-game.js). */
function redirect(url) {
    const u = new URL(url);
    if (u.hostname.endsWith('.cloudfunctions.net')) return `${FUNCTIONS}${u.pathname}${u.search}`;
    if (u.hostname === 'identitytoolkit.googleapis.com' || u.hostname === 'securetoken.googleapis.com') return `${AUTH}/${u.hostname}${u.pathname}${u.search}`;
    if (u.hostname === 'www.googleapis.com' && u.pathname.startsWith('/identitytoolkit/')) return `${AUTH}/www.googleapis.com${u.pathname}${u.search}`;
    if (u.hostname.endsWith('.firebaseio.com') || u.host === DB) {
        const to = new URL(`http://${DB}${u.pathname}${u.search}`);
        to.searchParams.set('ns', PROJECT);
        return to.toString();
    }
    return null;
}

// ---------- the stand-in CrazyGames page and SDK ----------

/** CrazyGames' game page, as far as the game can tell: a page that frames it and hands the SDK its data. */
function crazyGamesPage(url) {
    const q = url.searchParams;
    const cfg = {
        username: q.get('cg_user') || null,
        locale: q.get('cg_locale') || 'en-US',
        instant: q.get('cg_instant') === '1',
        inviteParams: q.get('roomId') ? { roomId: q.get('roomId') } : null,
    };
    const src = q.get('cg_src') || `${SITE}/portal/crazygames?via=portal-crazygames`;
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>CrazyGames test frame</title>
<style>body{margin:0;background:#0c0d14;font-family:Arial,sans-serif}
header{height:40px;display:flex;align-items:center;gap:8px;padding:0 12px;background:#6842ff;color:#fff;font-weight:bold;font-size:14px}
header small{font-weight:normal;opacity:.8}iframe{border:0;width:100%;height:calc(100vh - 40px);display:block;background:#000}</style></head>
<body><header>CrazyGames <small>test frame · Bullshit${cfg.username ? ' · signed in as ' + cfg.username : ''}</small></header>
<script>
window.__calls = [];
addEventListener('message', function (e) { if (e.data && e.data.cgFake) { window.__calls.push({ call: e.data.call, args: e.data.args, at: Date.now() }); } });
var f = document.createElement('iframe');
f.id = 'game';
f.allow = 'autoplay; clipboard-write; fullscreen';
f.name = ${JSON.stringify(JSON.stringify(cfg))};
f.src = ${JSON.stringify(src)};
document.body.appendChild(f);
</script></body></html>`;
}

// The v3 calls the portal uses, each one reported to the test page (window.__calls there).
const FAKE_SDK = `(function () {
  var cfg = {};
  try { cfg = JSON.parse(window.name || '{}'); } catch (e) { }
  function tell(call, args) { try { window.parent.postMessage({ cgFake: true, call: call, args: args || [] }, '*'); } catch (e) { } }
  var settingsListeners = [], joinListeners = [];
  var params = cfg.inviteParams || null;
  var SDK = {
    environment: 'uninitialized',
    init: function () { tell('init'); return new Promise(function (r) { setTimeout(function () { SDK.environment = 'crazygames'; r(); }, 30); }); },
    game: {
      settings: { disableChat: false, muteAudio: false },
      isInstantMultiplayer: !!cfg.instant,
      inviteParams: params,
      getInviteParam: function (k) { return params && params[k] != null ? String(params[k]) : null; },
      inviteLink: function (p) {
        tell('inviteLink', [p]);
        var qs = Object.keys(p || {}).map(function (k) { return k + '=' + encodeURIComponent(p[k]); }).join('&');
        return Promise.resolve('${CG}' + (qs ? '?' + qs : ''));
      },
      loadingStart: function () { tell('loadingStart'); },
      loadingStop: function () { tell('loadingStop'); },
      gameplayStart: function () { tell('gameplayStart'); },
      gameplayStop: function () { tell('gameplayStop'); },
      happytime: function () { tell('happytime'); },
      updateRoom: function (d) { tell('updateRoom', [d]); },
      leftRoom: function () { tell('leftRoom'); },
      addSettingsChangeListener: function (f) { settingsListeners.push(f); },
      removeSettingsChangeListener: function () { },
      addJoinRoomListener: function (f) { joinListeners.push(f); },
      removeJoinRoomListener: function () { }
    },
    user: {
      isUserAccountAvailable: true,
      systemInfo: { locale: cfg.locale || 'en-US', countryCode: 'US', device: { type: 'mobile' } },
      getUser: function () { tell('getUser'); return Promise.resolve(cfg.username ? { username: cfg.username, profilePictureUrl: '' } : null); }
    }
  };
  window.CrazyGames = { SDK: SDK };
})();`;

// ---------- phones ----------

const ALLOWED_CONSOLE_ERRORS = [
    /^Failed to load resource/,
    /WebSocket connection to 'wss?:\/\/[^']*' failed/,
    // Chromium's own note in any cross-origin frame (CrazyGames' too): the nickname and lie boxes
    // don't take the focus by themselves there; a tap does. Nothing breaks.
    /^Blocked autofocusing on a <input> element in a cross-origin subframe\.$/,
];

async function newPhone(browser, base, name, opts = {}) {
    const context = await browser.newContext({
        serviceWorkers: 'block', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
    });
    const phone = Object.assign({ name, context, problems: [], screens: [], lies: [], picks: [], refused: 0, done: false, outside: new Set() }, opts);

    await context.route(() => true, async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        if (url.hostname === 'www.crazygames.com' && url.pathname === '/game/bullshit') {
            return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: crazyGamesPage(url) });
        }
        if (url.hostname === 'other-site.example') {
            return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><title>Another site</title><iframe id="game" src="${SITE}/portal/crazygames"></iframe>` });
        }
        if (url.hostname === 'sdk.crazygames.com' && url.pathname === '/crazygames-sdk-v3.js') {
            return route.fulfill({ status: 200, contentType: 'application/javascript', body: FAKE_SDK });
        }
        if (url.origin === SITE) {
            if (url.pathname === '/_v') return route.fulfill({ status: 204, body: '' });
            try {
                const response = await route.fetch({ url: `${base}${url.pathname}${url.search}` });
                return route.fulfill({ response, headers: Object.assign({}, response.headers(), hostingHeaders(url.pathname)) });
            } catch (e) {
                return route.abort('failed');
            }
        }
        if (url.host === new URL(base).host) return route.continue();
        const target = redirect(req.url());
        if (!target) {
            phone.outside.add(url.hostname);
            return route.abort('blockedbyclient');
        }
        try {
            const response = await route.fetch({ url: target });
            return route.fulfill({ response });
        } catch (e) {
            return route.abort('failed');
        }
    });
    await context.routeWebSocket((url) => /\/\.ws$/.test(url.pathname), (ws) => {
        const target = new URL(redirect(ws.url().replace(/^ws/, 'http')));
        target.protocol = 'ws:';
        const upstream = new WebSocket(target.toString());
        const waiting = [];
        upstream.onopen = () => waiting.splice(0).forEach((m) => upstream.send(m));
        upstream.onmessage = (e) => ws.send(e.data);
        upstream.onclose = () => ws.close({ code: 1000 });
        upstream.onerror = () => ws.close({ code: 1006 });
        ws.onMessage((m) => (upstream.readyState === 1 ? upstream.send(m) : waiting.push(m)));
        ws.onClose(() => upstream.close());
    });

    const page = await context.newPage();
    page.on('pageerror', (err) => phone.problems.push(`uncaught exception: ${err.stack || err.message || err}`));
    page.on('crash', () => phone.problems.push('the page crashed'));
    page.on('console', (msg) => {
        if (process.env.VERBOSE) log(`[${name} console.${msg.type()}] ${msg.text().slice(0, 300)}`);
        if (msg.type() !== 'error') return;
        const text = msg.text();
        if (ALLOWED_CONSOLE_ERRORS.some((re) => re.test(text))) return;
        phone.problems.push(`console error: ${text}`);
    });
    phone.page = page;
    return phone;
}

/** The game's frame inside the test page. */
function gameFrame(phone) {
    return phone.page.frames().find((f) => f.url().startsWith(`${SITE}/`)) || null;
}

/** The game's screen: the route in the frame's hash (#/game-staging/ABCD), 'home' for the portal's home. */
function screenOf(frame) {
    if (!frame) return null;
    const hash = new URL(frame.url()).hash.replace(/^#/, '');
    return hash.split(/[?/]/).filter(Boolean)[0] || 'home';
}

async function calls(phone) {
    return phone.page.evaluate(() => window.__calls || []).catch(() => []);
}

const visible = async (locator) => (await locator.count()) > 0 && locator.first().isVisible().catch(() => false);

async function shot(phone, label) {
    if (!SHOTS) return;
    const file = path.join(SHOTS, `${String(++shot.n).padStart(2, '0')}-${phone.name.toLowerCase()}-${label}.png`);
    await phone.page.screenshot({ path: file }).catch(() => { });
}
shot.n = 0;

/** One look at the phone's screen, and the move a player would make there. */
async function act(phone, game) {
    const frame = gameFrame(phone);
    const screen = screenOf(frame);
    if (!frame || !screen) return;
    if (phone.screens[phone.screens.length - 1] !== screen) {
        phone.screens.push(screen);
        if (phone.shoot) {
            await sleep(700);
            await shot(phone, screen);
        }
    }
    if (screen === 'join-game') {
        const input = frame.locator('input[name="nickname"]');
        if (await visible(input) && !phone.joining) {
            await sleep(500);
            phone.prefilled = await input.inputValue();
            if (!phone.prefilled) await input.fill(phone.name);
            if (phone.shoot) await shot(phone, 'nickname');
            phone.joining = true;
            await frame.locator('form button[type="submit"]').first().click();
        }
    } else if (screen === 'game-staging') {
        phone.joined = true;
        if (phone.host && game.everyoneIn && !game.started) {
            const start = frame.locator('.game-header > button');
            if (await visible(start) && !(await start.first().evaluate((b) => b.classList.contains('is-loading')))) {
                if (phone.shoot) await shot(phone, 'lobby-full');
                game.started = Date.now();
                await start.first().click();
                log(`${phone.name} pressed START`);
            }
        }
    } else if (screen === 'show-question') {
        const input = frame.locator('form input.input');
        if (await visible(input) && !phone.sending) {
            const question = await db('GET', `games/${game.pin}/questionIndex`);
            if (phone.lies[phone.lies.length - 1] !== question) {
                phone.sending = true;
                try {
                    // The guest's first lie is one the word filter refuses: the page says so, and they write another.
                    if (phone.swears && !phone.refused) {
                        await input.fill(FLAGGED);
                        await frame.locator('form button[type="submit"]').first().click();
                        const note = frame.locator('.notification.is-danger');
                        await note.first().waitFor({ state: 'visible', timeout: 8000 });
                        phone.refusedText = (await note.first().innerText()).trim();
                        phone.refused++;
                        log(`${phone.name}'s lie "${FLAGGED}" was refused: ${phone.refusedText}`);
                        await shot(phone, 'lie-refused');
                    }
                    await input.fill(`${phone.name} lie ${question}`);
                    await frame.locator('form button[type="submit"]').first().click();
                    phone.lies.push(question);
                    log(`${phone.name} sent a lie on question ${question + 1}`);
                } finally {
                    phone.sending = false;
                }
            }
        }
    } else if (screen === 'show-answers') {
        const buttons = frame.locator('button.answer:not([disabled])');
        const n = await buttons.count();
        if (n > 0) {
            const question = await db('GET', `games/${game.pin}/questionIndex`);
            if (phone.picks[phone.picks.length - 1] !== question) {
                await buttons.nth(Math.floor(Math.random() * n)).click().catch(() => { });
                phone.picks.push(question);
            }
        }
    } else if (screen === 'reveal-the-truth') {
        const next = frame.locator('button.next');
        if (await visible(next)) await next.first().click().catch(() => { });
    } else if (screen === 'score-board-final') {
        phone.done = true;
    }
}

/** Every link on the frame's screen that would leave for a page that isn't CrazyGames' or WhatsApp's. */
async function linksOut(frame) {
    return frame.evaluate(() => Array.from(document.querySelectorAll('a[href]'))
        .filter((a) => a.offsetParent !== null)
        .map((a) => a.href)
        .filter((h) => /^https?:/.test(h))
        .filter((h) => !/^https?:\/\/([^/]*\.)?crazygames\.com\//.test(h) && !/^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(h))
        .filter((h) => !(h.indexOf(location.origin + location.pathname + location.search + '#') === 0)));
}

async function main() {
    if (!fileIn(DIST, '/index.html')) throw new Error(`No built game at ${DIST}`);
    if (!fs.existsSync(path.join(ROOT, 'functions', 'dist', 'index.js'))) throw new Error('Build functions/ first: npm run build there');
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const emulators = await startEmulators();
    const problems = [];
    const summary = {};
    let browser;
    let server;
    try {
        if (!(await up(`http://${DB}/.json?ns=${PROJECT}`))) throw new Error('no database emulator on :9000');
        await seed();
        server = await serve(DIST);
        const base = `http://${HOST}:${server.address().port}`;
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`, '--autoplay-policy=no-user-gesture-required'] });

        // ---- A11: time to the portal's home, CPU 4x slower (a mid phone) ----
        {
            const probe = await newPhone(browser, base, 'Probe');
            const cdp = await probe.context.newCDPSession(probe.page);
            await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
            const t = Date.now();
            await probe.page.goto(`${CG}?cg_user=Probe`);
            await probe.page.frameLocator('#game').locator('.portal-create').waitFor({ state: 'visible', timeout: 30000 });
            summary.homeDrawnMsCpu4x = Date.now() - t;
            await sleep(1500);
            summary.probeSdkCalls = (await calls(probe)).map((c) => c.call);
            await probe.context.close();
        }

        // ---- Another site can't frame the portal ----
        {
            const other = await newPhone(browser, base, 'Other');
            await other.page.goto('https://other-site.example/');
            await sleep(3000);
            const f = other.page.frames().find((x) => x !== other.page.mainFrame());
            const drawn = f ? await f.evaluate(() => !!document.querySelector('app-root')).catch(() => false) : false;
            summary.otherSiteFramed = drawn;
            if (drawn) problems.push('another site framed the portal');
            await other.context.close();
        }

        // ---- The game: a host, a friend by invite link, a friend by PIN ----
        const host = await newPhone(browser, base, 'Host', { host: true, shoot: true });
        const guest = await newPhone(browser, base, 'Guest', { swears: true, shoot: true });
        const third = await newPhone(browser, base, 'Third');
        const phones = [host, guest, third];
        const game = {};

        await host.page.goto(`${CG}?cg_user=CoolHost`);
        const hf = host.page.frameLocator('#game');
        await hf.locator('.portal-create').waitFor({ state: 'visible', timeout: 30000 });
        await sleep(800);
        await shot(host, 'portal-home');
        await hf.locator('.portal-create').click();
        await hf.locator('input[name="length"]').first().waitFor({ state: 'attached', timeout: 15000 });
        await hf.locator('input[name="length"]').first().check();
        await shot(host, 'create');
        await hf.locator('form button[type="submit"]').first().click();
        const until = Date.now() + 30000;
        while (Date.now() < until && screenOf(gameFrame(host)) !== 'join-game') await sleep(200);
        game.pin = new URL(gameFrame(host).url()).hash.split('/')[2].split('?')[0].toUpperCase();
        log(`game ${game.pin} created in the frame`);
        const created = await db('GET', `games/${game.pin}`);
        summary.pin = game.pin;
        summary.campaign = created && created.campaign;
        if (!created || created.campaign !== 'portal-crazygames') problems.push(`the game's campaign is ${created && created.campaign}, not portal-crazygames`);

        // The host joins (nickname from CrazyGames), and the lobby's invite is CrazyGames' link.
        const lobbyBy = Date.now() + 30000;
        while (Date.now() < lobbyBy && screenOf(gameFrame(host)) !== 'game-staging') {
            await act(host, game).catch(() => { });
            await sleep(300);
        }
        await sleep(1500);
        const invite = await gameFrame(host).evaluate(() => {
            const wa = document.querySelector('a.whatsapp');
            return { whatsapp: wa ? wa.getAttribute('href') : null, text: document.body.innerText };
        });
        summary.hostNickname = host.prefilled;
        summary.lobbyWhatsapp = invite.whatsapp && decodeURIComponent(invite.whatsapp);
        const inviteUrl = `${CG}?roomId=${game.pin}`;
        if (host.prefilled !== 'CoolHost') problems.push(`the host's nickname box started with "${host.prefilled}", not the CrazyGames username`);
        if (!summary.lobbyWhatsapp || summary.lobbyWhatsapp.indexOf(inviteUrl) < 0) problems.push(`the lobby's WhatsApp invite has no CrazyGames link: ${summary.lobbyWhatsapp}`);
        if (/bullshit\.wtf/i.test(summary.lobbyWhatsapp || '') || /bullshit\.wtf/i.test(invite.text)) problems.push('the lobby names bullshit.wtf');
        await shot(host, 'lobby-invite');

        // The friend opens the invite link (CrazyGames hands the game its roomId); the third types the PIN.
        await guest.page.goto(`${inviteUrl}&cg_user=GuestStar`);
        await third.page.goto(`${CG}`);
        const tf = third.page.frameLocator('#game');
        await tf.locator('#portal-code').waitFor({ state: 'visible', timeout: 30000 });
        await tf.locator('#portal-code').fill(game.pin.toLowerCase());
        await tf.locator('.portal-join').click();

        const deadline = Date.now() + GAME_TIMEOUT_MS;
        while (Date.now() < deadline && !phones.every((p) => p.done)) {
            if (!game.everyoneIn) {
                const players = await db('GET', `games/${game.pin}/players`);
                game.everyoneIn = players && Object.keys(players).length === 3 && phones.every((p) => p.joined);
            }
            await Promise.all(phones.filter((p) => !p.done).map((p) => act(p, game).catch((e) => {
                if (!/Target closed|Execution context was destroyed|navigation|detached/.test(e.message)) log(`${p.name}: ${e.message.split('\n')[0]}`);
            })));
            await sleep(400);
        }
        await sleep(2500);
        await shot(host, 'final-host');
        await shot(guest, 'final-guest');

        summary.guestPrefilled = guest.prefilled;
        summary.guestScreens = guest.screens.join(' > ');
        if (guest.screens[0] !== 'join-game') problems.push(`the invite link opened ${guest.screens[0]}, not the game's join step`);
        if (guest.prefilled !== 'GuestStar') problems.push(`the guest's nickname box started with "${guest.prefilled}"`);
        if (!guest.refused) problems.push('the flagged lie was not refused');
        summary.refusedLie = guest.refusedText || null;
        const stored = await db('GET', `games/${game.pin}/answers`);
        if (stored && Object.values(stored).some((a) => a && /whore/.test(a.text))) problems.push('the flagged lie was stored');

        // No link leaves for bullshit.wtf on the final screen, and a tap on one does nothing.
        const ff = gameFrame(host);
        summary.finalLinksOut = await linksOut(ff);
        if (summary.finalLinksOut.length) problems.push(`links out on the final screen: ${summary.finalLinksOut.join(', ')}`);
        const before = ff.url();
        await ff.evaluate(() => {
            const a = document.createElement('a');
            a.href = '/daily?via=daily-game';
            a.id = 'probe-link';
            a.textContent = 'probe';
            a.style.cssText = 'position:fixed;top:45%;left:30%;z-index:2147483647;background:#fff;padding:8px';
            document.body.appendChild(a);
        });
        await ff.locator('#probe-link').click();
        await sleep(1500);
        summary.blockedLinkStayed = gameFrame(host) && gameFrame(host).url() === before;
        if (!summary.blockedLinkStayed) problems.push('a link to the daily puzzle left the portal');
        const finalText = await ff.evaluate(() => document.body.innerText);
        if (/bullshit\.wtf/i.test(finalText)) problems.push('the final screen names bullshit.wtf');

        // What CrazyGames heard from the host's game.
        const heard = await calls(host);
        const names = heard.map((c) => c.call);
        summary.hostSdkCalls = names.filter((n, i) => n !== names[i - 1]).join(' > ');
        const rooms = heard.filter((c) => c.call === 'updateRoom').map((c) => c.args[0]);
        summary.rooms = rooms;
        if (!names.includes('init') || !names.includes('loadingStop')) problems.push('no init or loadingStop');
        if (!names.includes('gameplayStart') || names.lastIndexOf('gameplayStop') < names.lastIndexOf('gameplayStart')) problems.push('gameplay start/stop missing or out of order');
        if (!rooms.some((r) => r.roomId === game.pin && r.isJoinable === true)) problems.push('no joinable room for the game');
        if (!rooms.some((r) => r.roomId === game.pin && r.isJoinable === false)) problems.push('the room was not closed at the final scoreboard');
        if (!heard.some((c) => c.call === 'inviteLink' && c.args[0] && c.args[0].roomId === game.pin)) problems.push('no invite link asked for the game');

        const final = await db('GET', `games/${game.pin}`);
        summary.finalState = final && final.state && final.state.id;
        summary.scores = final && final.players ? Object.values(final.players).map((p) => `${p.nickname}: ${p.score}`) : null;
        if (!final || !final.state || final.state.id !== 6) problems.push(`the game did not reach the final scoreboard (state ${final && final.state && final.state.id})`);
        phones.forEach((p) => { if (!p.done) problems.push(`${p.name} never showed the final scoreboard`); });

        // ---- Instant Multiplayer: straight into a new lobby, default settings ----
        {
            const instant = await newPhone(browser, base, 'Instant', { shoot: false });
            await instant.page.goto(`${CG}?cg_user=Speedy&cg_instant=1`);
            const by = Date.now() + 30000;
            while (Date.now() < by && screenOf(gameFrame(instant)) !== 'join-game') await sleep(200);
            const ipin = gameFrame(instant) ? (new URL(gameFrame(instant).url()).hash.split('/')[2] || '').split('?')[0].toUpperCase() : '';
            const igame = ipin ? await db('GET', `games/${ipin}`) : null;
            summary.instant = igame ? { pin: ipin, totalQ: igame.totalQ, campaign: igame.campaign, locale: igame.locale } : null;
            if (!igame) problems.push('Instant Multiplayer made no game');
            else if (igame.campaign !== 'portal-crazygames') problems.push(`the instant game's campaign is ${igame.campaign}`);
            await sleep(1200);
            await shot(instant, 'instant-multiplayer');
            instant.problems.forEach((x) => problems.push(`Instant: ${x}`));
            await instant.context.close();
        }

        // Hebrew: a Hebrew CrazyGames locale opens the portal's home in Hebrew.
        {
            const he = await newPhone(browser, base, 'Hebrew');
            await he.page.goto(`${CG}?cg_locale=he-IL`);
            const hhf = he.page.frameLocator('#game');
            await hhf.locator('.portal-create').waitFor({ state: 'visible', timeout: 30000 });
            await sleep(1500);
            // The home follows CrazyGames' language once the SDK says it, and the game page after it.
            summary.hebrewHome = /[\u0590-\u05FF]/.test(await gameFrame(he).evaluate(() => document.body.innerText));
            if (!summary.hebrewHome) problems.push('a Hebrew CrazyGames locale did not give a Hebrew home');
            await shot(he, 'hebrew-home');
            await hhf.locator('.portal-create').click();
            await sleep(1500);
            const text = await gameFrame(he).evaluate(() => document.body.innerText);
            summary.hebrewCreatePage = /[֐-׿]/.test(text);
            if (!summary.hebrewCreatePage) problems.push('a Hebrew CrazyGames locale did not give a Hebrew game page');
            await shot(he, 'hebrew-create');
            await he.context.close();
        }

        summary.outsideHostsRefused = Array.from(new Set(phones.flatMap((p) => Array.from(p.outside))));
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
