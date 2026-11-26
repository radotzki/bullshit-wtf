#!/usr/bin/env node
// Local run: Hanukkah night on the final screen (game/src/app/components/hanukkah-night), in headless
// Chromium against the Firebase emulators. Three phones and the big screen play a whole test game (?via=test)
// to the final scoreboard, in English (a game of the Hanukkah pack) and in Hebrew (any Hebrew game). Then each
// browser's clock is moved, in Israel's time zone:
//   - today (no move): nothing new on the final screen;
//   - night 1 (Friday 4 December 2026, 20:30) and night 4 (Monday 7 December, 21:10): "Hanukkah, night N of 8"
//     under the winner on every screen, SAME TABLE TOMORROW on each player's phone, and no REMIND ME beside it;
//     its press saves a calendar file for tomorrow evening with the table's link, tagged hanukkah-night-<N+1>;
//   - night 8 (Friday 11 December, 21:30): the line, and no button (there is no tomorrow);
//   - after Hanukkah (Saturday 12 December, 21:00): nothing new.
// Then the saved link is opened the next evening by a player, with the game's test mark taken off: the recap
// shows (in either half), says which night it is, sends seen-hanukkah, and PLAY AGAIN, SAME TABLE opens the
// table's lobby with campaign hanukkah-night-<N+1>.
//
// Nothing reaches production: see emulator-game.js, whose emulators and phones this run uses.
// From the repository root, with game/ and functions/ built and the root's npm ci done:
//   node .github/smoke/emulator-hanukkah-night.js [path to dist]
// ONLY=en or ONLY=he plays one language. SHOTS=<dir> saves screenshots of the final screen on night 4.
// Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');
const { serve, fileIn, HOST } = require('./smoke');
const emu = require('./emulator-game');

const { ROOT, DIST, startEmulators, stopEmulators, up, db, seed, newPhone, visible, sleep, log, act } = emu;
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const SHOTS = process.env.SHOTS || '';
const GAME_TIMEOUT_MS = Number(process.env.GAME_MINUTES || 8) * 60 * 1000;

const ts = require(path.join(ROOT, 'game', 'node_modules', 'typescript'));
/** Loads a TypeScript file of the app, following its relative imports. */
function loadTs(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    const req = (name) => name.startsWith('.') ? loadTs(path.join(path.dirname(file), name + '.ts')) : require(name);
    new Function('module', 'exports', 'require', out)(mod, mod.exports, req);
    return mod.exports;
}
const hn = loadTs(path.join(ROOT, 'game', 'src', 'app', 'components', 'hanukkah-night', 'hanukkah-night.ts'));
const na = loadTs(path.join(ROOT, 'game', 'src', 'app', 'pages', 'join-game', 'night-after.ts'));

const NAMES = { en: ['Ana', 'Ben', 'Cleo'], he: ['דנה', 'יוסי', 'מיכל'] };
const ZONE = 'Asia/Jerusalem';
// Israel is UTC+2 in December.
const IL = (day, hm) => Date.parse(`${day}T${hm}:00+02:00`);
const MOMENTS = [
    { name: 'today', at: null, night: null },
    { name: 'night-1', at: IL('2026-12-04', '20:30'), night: 1 },
    { name: 'night-4', at: IL('2026-12-07', '21:10'), night: 4 },
    { name: 'night-8', at: IL('2026-12-11', '21:30'), night: 8 },
    { name: 'after', at: IL('2026-12-12', '21:00'), night: null },
];
const screenOf = (page) => new URL(page.url()).pathname.replace(/^\/he(?=\/|$)/, '').split('/');

/** Moves the page's clock to `at` (ms), keeping it running; the next turn of the app redraws. */
async function setClock(page, at) {
    await page.evaluate((target) => {
        const Real = window.__RealDate || Date;
        window.__RealDate = Real;
        const off = target === null ? 0 : target - Real.now();
        class Shifted extends Real {
            constructor(...a) { if (a.length) super(...a); else super(Real.now() + off); }
            static now() { return Real.now() + off; }
        }
        window.Date = Shifted;
        // A timer through the app's zone: change detection runs after it.
        setTimeout(() => { }, 0);
    }, at);
    await sleep(600);
}

/**
 * The big screen: nothing on it runs the app's timers once the final scores are up, so a clock moved under it
 * is not drawn until something happens. It reloads instead, with its clock read at the start of the page
 * (a real big screen on a Hanukkah night has the right clock from the start).
 */
async function clockByReload(context) {
    await context.addInitScript(() => {
        let at = null;
        try { at = sessionStorage.getItem('BS_TEST_CLOCK'); } catch (e) { }
        if (!at) return;
        const Real = Date;
        const off = Number(at) - Real.now();
        class Shifted extends Real {
            constructor(...a) { if (a.length) super(...a); else super(Real.now() + off); }
            static now() { return Real.now() + off; }
        }
        window.Date = Shifted;
    });
}

async function setScreenClock(page, at) {
    await page.evaluate((target) => {
        try {
            if (target === null) sessionStorage.removeItem('BS_TEST_CLOCK'); else sessionStorage.setItem('BS_TEST_CLOCK', String(target));
        } catch (e) { }
    }, at);
    await page.reload();
    await page.locator('.final .hero').first().waitFor({ timeout: 15000 }).catch(() => { });
    await sleep(2500);
}

/** The same clock for every page this browser opens from now on (the link opened the next evening). */
async function clockForNewPages(context, at) {
    await context.addInitScript((target) => {
        const Real = Date;
        const off = target - Real.now();
        class Shifted extends Real {
            constructor(...a) { if (a.length) super(...a); else super(Real.now() + off); }
            static now() { return Real.now() + off; }
        }
        window.Date = Shifted;
    }, at);
}

async function playToFinal(phones, game, problems) {
    const deadline = Date.now() + GAME_TIMEOUT_MS;
    const there = (p) => { const s = screenOf(p.page); return s[1] === 'score-board-final' && (s[2] || '').toUpperCase() === game.pin; };
    while (Date.now() < deadline && !phones.every(there)) {
        if (!game.everyoneIn) {
            const players = await db('GET', `games/${game.pin}/players`);
            const seated = phones.filter((p) => p.role !== 'screen');
            game.everyoneIn = !!players && Object.keys(players).length === seated.length && seated.every((p) => p.joined);
        }
        await Promise.all(phones.filter((p) => !there(p)).map((p) => act(p, game).catch((e) => {
            if (!/Target closed|Execution context was destroyed|navigation/.test(e.message)) log(`${p.name}: ${e.message.split('\n')[0]}`);
        })));
        await sleep(400);
    }
    if (!phones.every(there)) problems.push(`game ${game.pin}: not every phone reached its final scoreboard`);
    // The final screen reads the players, the pack and the asks: give it a moment.
    await sleep(4000);
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
    if (!SHOTS) return;
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: !/screen/.test(name) }).catch(() => { });
}

/** The emulators' log, for the rows the functions sent to BigQuery `shares`. */
function sharesOf(pin) {
    const files = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith('bs-emulators-'))
        .map((d) => path.join(os.tmpdir(), d, 'emulators.log')).filter((f) => fs.existsSync(f));
    const file = files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
    if (!file) return [];
    const rows = [];
    const re = /Insert to BigQuery, table: 'shares', data: (\{.*?\})\s*$/gm;
    const text = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = re.exec(text))) {
        try {
            const row = JSON.parse(m[1]);
            if (row.crew_id === pin) rows.push(`${row.content_type}/${row.method}`);
        } catch (e) { /* a cut line */ }
    }
    return rows;
}

/** What one phone's final screen shows of Hanukkah. */
async function readNight(page) {
    const text = async (sel) => (await page.locator(sel).first().textContent().catch(() => '') || '').replace(/\s+/g, ' ').trim();
    return {
        line: (await visible(page.locator('.hero .night-line'))) ? (await text('.hero .night-line')).replace('🕎', '').trim() : null,
        button: (await visible(page.locator('.night-tomorrow'))) ? await text('.night-tomorrow') : null,
        remind: await visible(page.locator('app-host-ask .ask-remind')),
        hostAsk: await visible(page.locator('app-host-ask')),
    };
}

async function language(base, locale) {
    const problems = [];
    const check = (ok, what) => { if (!ok) problems.push(`${locale}: ${what}`); return ok; };
    const he = locale === 'he';
    const t = hn.nightStrings(locale);
    const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`] });
    const result = { locale, moments: {} };
    try {
        const names = NAMES[locale];
        const phones = [];
        for (let i = 0; i < names.length; i++) phones.push(await newPhone(browser, base, names[i], i === 0 ? 'host' : 'player'));
        const screen = await newPhone(browser, base, 'big screen', 'screen');
        await clockByReload(screen.context);
        // Guests keep today's ask (the INVITE ANOTHER GROUP test is off on Hanukkah evenings for the pack).
        for (const p of phones) await p.context.addInitScript(() => { try { localStorage.setItem('BS_HOST_INVITE', 'classic'); } catch (e) { } });
        const host = phones[0];
        // English: a game of the Hanukkah pack (the Hanukkah page's Start). Hebrew: any Hebrew game.
        await host.page.goto(`${base}/create-game?via=test${he ? '' : '&pack=hanukkah'}`);
        await host.page.locator('input[name="locale"]').nth(he ? 1 : 0).check();
        await host.page.locator('input[name="length"]').first().check();
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
        const game = { pin: new URL(host.page.url()).pathname.split('/').pop().toUpperCase() };
        log(`${locale}: game ${game.pin} created (a test game)`);
        await screen.page.goto(`${base}/present-game/${game.pin}`);
        const link = `${base}${he ? '/he' : ''}/join-game/${game.pin}`;
        for (const p of phones.slice(1)) await p.page.goto(link);
        await playToFinal(phones.concat(screen), game, problems);
        const g = await db('GET', `games/${game.pin}`);
        check(g && g.campaign === 'test' && g.state.id === 6, `the game is not a finished test game (${g && g.campaign})`);
        result.pin = game.pin;
        result.pack = g && g.pack || null;
        const guest = phones[1];

        for (const m of MOMENTS) {
            for (const p of phones) await setClock(p.page, m.at);
            await setScreenClock(screen.page, m.at);
            const seen = {};
            for (const p of phones.concat(screen)) seen[p.name] = await readNight(p.page);
            result.moments[m.name] = seen;
            const next = m.night && m.night < 8 ? m.night + 1 : null;
            for (const p of phones.concat(screen)) {
                const s = seen[p.name];
                const want = m.night ? t.line(m.night) : null;
                check(s.line === want, `${m.name}: ${p.name}'s line is ${JSON.stringify(s.line)}, not ${JSON.stringify(want)}`);
                const button = next && p.role !== 'screen' ? t.button(next) : null;
                check(s.button === button, `${m.name}: ${p.name}'s button is ${JSON.stringify(s.button)}, not ${JSON.stringify(button)}`);
                if (p === guest) {
                    check(s.hostAsk, `${m.name}: the guest lost the start-your-own-game ask`);
                    check(s.remind === !next, `${m.name}: the guest's REMIND ME is ${s.remind ? 'shown' : 'hidden'}; one calendar button only`);
                }
            }
            if (m.name === 'night-4') {
                await shot(guest.page, `${locale}-night-4-guest-phone`);
                await shot(host.page, `${locale}-night-4-host-phone`);
                await shot(screen.page, `${locale}-night-4-big-screen`);
                // The press saves tomorrow evening, with the table's tagged link.
                const [download] = await Promise.all([
                    guest.page.waitForEvent('download', { timeout: 10000 }),
                    guest.page.locator('.night-tomorrow').click(),
                ]);
                const ics = fs.readFileSync(await download.path(), 'utf8').replace(/\r?\n[ \t]/g, '');
                const url = `https://bullshit.wtf${he ? '/he' : ''}/join-game/${game.pin}?via=hanukkah-night-5`;
                check(ics.indexOf(url) >= 0, `the calendar file has no ${url}`);
                check(/DTSTART[^\n]*20261208T/.test(ics), `the calendar file is not for 8 December: ${(ics.match(/DTSTART[^\n]*/) || [''])[0]}`);
                check(await visible(guest.page.locator('.night-saved')), 'no "one more step" line after the press');
                result.calendar = { url: (ics.match(/https:\/\/bullshit\.wtf\S*/) || [''])[0], start: (ics.match(/DTSTART[^\n]*/) || [''])[0].trim() };
                await shot(guest.page, `${locale}-night-4-guest-phone-saved`);
            }
        }

        // The next evening (night 5), the player opens the saved link, as a real game (test mark off).
        await db('PUT', `games/${game.pin}/campaign`, null);
        const at = IL('2026-12-08', '20:45');
        const ctx = guest.context;
        await clockForNewPages(ctx, at);
        // The tester's switch on the other half: the tagged link shows the recap all the same.
        await ctx.addInitScript(() => { try { localStorage.setItem('BS_NIGHT_AFTER', 'control'); } catch (e) { } });
        const page = await ctx.newPage();
        const shares = [];
        page.on('request', (r) => { if (/\/onShare$/.test(r.url())) shares.push(JSON.parse(r.postData() || '{}')); });
        await page.goto(`${link}?via=hanukkah-night-5`);
        await waitFor('the tagged link shows no recap', () => visible(page.locator('.night-after')), problems);
        const recapLine = ((await page.locator('.recap-hanukkah').textContent().catch(() => '')) || '').replace('🕎', '').trim();
        check(recapLine === t.recapLine(5), `the recap says ${JSON.stringify(recapLine)}, not ${JSON.stringify(t.recapLine(5))}`);
        const again = ((await page.locator('.night-after .recap-again').first().textContent().catch(() => '')) || '').trim();
        check(again === na.nightAfterWords(locale).playAgain, `the player's button is "${again}"`);
        await shot(page, `${locale}-night-5-recap-from-link`);
        await page.locator('.night-after .recap-again').first().click();
        const lobbyPin = await waitFor('PLAY AGAIN, SAME TABLE opened no lobby',
            async () => { const s = screenOf(page); return s[1] !== 'join-game' || (s[2] && s[2].toUpperCase() !== game.pin) ? (s[2] || '').toUpperCase() : null; },
            problems, 20000);
        const lobby = lobbyPin ? await db('GET', `games/${lobbyPin}`) : null;
        result.lobby = lobby ? { pin: lobbyPin, campaign: lobby.campaign || null, origin: lobby.origin || null, parent: lobby.parent || null } : null;
        check(lobby && lobby.campaign === 'hanukkah-night-5' && lobby.origin === 'table' && lobby.parent === game.pin,
            `the table's lobby is ${JSON.stringify(result.lobby)}`);
        await sleep(3000);
        result.rows = sharesOf(game.pin).sort();
        check(result.rows.indexOf('night-after/seen-hanukkah') >= 0 && result.rows.indexOf('night-after/same-table') >= 0,
            `rows ${JSON.stringify(result.rows)}`);
        check(!result.rows.some((r) => /seen-(player|other|control)/.test(r)), 'the tagged visit was counted in the test\'s halves');

        for (const p of phones.concat(screen)) (p.problems || []).forEach((x) => problems.push(`${locale}: ${p.name}: ${x}`));
    } finally {
        await browser.close().catch(() => { });
    }
    result.problems = problems;
    return result;
}

async function main() {
    if (!fileIn(DIST, '/index.html')) throw new Error(`No built game at ${DIST}`);
    if (!fs.existsSync(path.join(ROOT, 'functions', 'dist', 'index.js'))) throw new Error('Build functions/ first: npm run build there');
    if (process.env.EMULATORS === 'running') throw new Error('This run reads the emulators\' log: let it start them itself');
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    process.env.TZ = ZONE;
    const emulators = await startEmulators();
    let server;
    const results = [];
    try {
        if (!(await up(`http://${HOST}:9000/.json?ns=${emu.PROJECT}`))) throw new Error('no database emulator on :9000');
        await seed();
        server = await serve(DIST);
        const base = `http://${HOST}:${server.address().port}`;
        for (const locale of ['en', 'he'].filter((l) => !only || only.includes(l))) {
            results.push(await language(base, locale).catch((e) => ({ locale, problems: [`${locale}: ${e.stack || e}`] })));
        }
    } finally {
        if (server) server.close();
        stopEmulators(emulators);
    }
    const problems = results.flatMap((r) => r.problems || []);
    console.log('\nRESULT ' + JSON.stringify({ build: DIST, results, problems }, null, 2));
    console.log(problems.length ? 'FAIL' : 'PASS');
    process.exitCode = problems.length ? 1 : 0;
}

main().catch((e) => {
    console.error('FAIL', e.stack || e);
    process.exit(1);
});
