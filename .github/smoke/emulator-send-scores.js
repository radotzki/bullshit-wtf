#!/usr/bin/env node
// Local run: SEND THE SCORES TO THE GROUP (game/src/app/components/send-scores), in headless Chromium,
// against the Firebase emulators. Three phones and the big screen play a whole test game (?via=test) to
// the final scoreboard, in English and in Hebrew. Then it checks:
//   - the host's phone shows the button directly under REMATCH, in the game's language; the guests' phones
//     and the big screen don't;
//   - the button is a WhatsApp link with the winner, the points and the game's own link tagged ?via=scores;
//   - a press in a test game sends no row; the same game with its test mark taken off sends scores/whatsapp;
//   - the link (?via=scores) opens the game's page: in the recap's half its START YOUR OWN GAME opens Create
//     tagged after-game-late-scores, and in the other half the "Game over" ask's START MY OWN GAME does too;
//   - the seen rows of those visits are night-after seen-scores-other, not seen-other / seen-control-other.
//
// Nothing reaches production: see emulator-game.js, whose emulators and phones this run uses.
// From the repository root, with game/ and functions/ built and the root's npm ci done:
//   node .github/smoke/emulator-send-scores.js [path to dist]
// ONLY=en or ONLY=he plays one language. SHOTS=<dir> saves screenshots (390 px wide).
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
const loaded = {};
function loadTs(file) {
    if (loaded[file]) return loaded[file].exports;
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = loaded[file] = { exports: {} };
    const req = (name) => {
        if (!/^\.\.?\//.test(name)) return require(name);
        const base = path.resolve(path.dirname(file), name);
        const src = [base + '.ts', path.join(base, 'index.ts')].find((f) => fs.existsSync(f));
        return src ? loadTs(src) : require(base);
    };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, req);
    return mod.exports;
}
const sc = loadTs(path.join(ROOT, 'game', 'src', 'app', 'components', 'send-scores', 'send-scores.ts'));

const NAMES = { en: ['Ana', 'Ben', 'Cleo'], he: ['דנה', 'יוסי', 'מיכל'] };
const screenOf = (page) => new URL(page.url()).pathname.replace(/^\/he(?=\/|$)/, '').split('/');

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
    await sleep(2000);
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
    await page.screenshot({ path: path.join(SHOTS, `${name}-390.png`), fullPage: true }).catch(() => { });
}

/** The emulators' log, for the rows the functions sent to BigQuery `shares`, of this PIN. */
function emulatorsLog() {
    const files = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith('bs-emulators-'))
        .map((d) => path.join(os.tmpdir(), d, 'emulators.log')).filter((f) => fs.existsSync(f));
    return files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || '';
}
function sharesOf(pin) {
    const file = emulatorsLog();
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

/** A browser that opens the link, in a half of the night-after test. */
async function visitor(browser, base, name, forced) {
    const phone = await newPhone(browser, base, name, 'player');
    if (forced) await phone.context.addInitScript((v) => { try { localStorage.setItem('BS_NIGHT_AFTER', v); } catch (e) { } }, forced);
    return phone;
}

async function language(base, locale) {
    const problems = [];
    const check = (ok, what) => { if (!ok) problems.push(`${locale}: ${what}`); return ok; };
    const he = locale === 'he';
    const t = sc.scoresWords(locale);
    const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`] });
    const result = { locale };
    try {
        const names = NAMES[locale];
        const phones = [];
        for (let i = 0; i < names.length; i++) phones.push(await newPhone(browser, base, names[i], i === 0 ? 'host' : 'player'));
        const screen = await newPhone(browser, base, 'big screen', 'screen');
        const host = phones[0];
        await host.page.goto(`${base}/create-game?via=test`);
        await host.page.locator('input[name="locale"]').nth(he ? 1 : 0).check();
        await host.page.locator('input[name="length"]').first().check();
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
        const game = { pin: new URL(host.page.url()).pathname.split('/').pop().toUpperCase() };
        log(`${locale}: game ${game.pin} created (a test game)`);
        await screen.page.goto(`${base}/present-game/${game.pin}`);
        const joinLink = `${base}${he ? '/he' : ''}/join-game/${game.pin}`;
        for (const p of phones.slice(1)) await p.page.goto(joinLink);
        await playToFinal(phones.concat(screen), game, problems);
        const g = await db('GET', `games/${game.pin}`);
        check(g && g.campaign === 'test' && g.state.id === 6, `the game is not a finished test game (${g && g.campaign})`);
        result.pin = game.pin;

        // 1. The host's phone has the button, under REMATCH; nobody else's has it.
        const button = host.page.locator('app-send-scores .send-scores-whatsapp');
        await waitFor('the host sees no SEND THE SCORES TO THE GROUP', () => visible(button), problems);
        const label = ((await button.textContent()) || '').trim();
        check(label === t.button, `the button says "${label}", not "${t.button}"`);
        const order = await host.page.evaluate(() => {
            const all = Array.from(document.querySelectorAll('.actions .rematch, app-send-scores, app-share-results'));
            return all.map((e) => e.tagName.toLowerCase() === 'app-send-scores' ? 'scores' : e.tagName.toLowerCase() === 'app-share-results' ? 'share' : 'rematch');
        });
        check(order.join(',') === 'rematch,scores,share', `the order on the host's screen is ${order.join(',')}`);
        for (const p of phones.slice(1).concat(screen)) {
            check((await p.page.locator('app-send-scores').count()) === 0, `${p.name} sees the button`);
        }

        // 2. Its link: WhatsApp, with the winner, the points and the game's own tagged link.
        const href = await button.getAttribute('href');
        const text = decodeURIComponent((href || '').replace(/^https:\/\/wa\.me\/\?text=/, ''));
        const seats = Object.values(g.players).map((p) => ({ nickname: p.nickname, score: p.score || 0 })).sort((a, b) => b.score - a.score);
        const winners = seats.filter((p) => p.score === seats[0].score);
        const want = `${sc.scoresMessage(winners, locale)}\n${sc.scoresUrl(game.pin, locale)}`;
        result.message = text;
        check(/^https:\/\/wa\.me\/\?text=/.test(href || ''), `the button opens ${href}`);
        check(text === want, `the message is ${JSON.stringify(text)}, not ${JSON.stringify(want)}`);
        await shot(host.page, `${locale}-1-host-final`);
        await shot(phones[1].page, `${locale}-1-guest-final`);

        // 3. A press in a test game sends no row; without the test mark it sends scores/whatsapp.
        const calls = [];
        host.page.on('request', (r) => { if (/\/onShare$/.test(r.url())) calls.push(JSON.parse(r.postData() || '{}')); });
        const press = async () => {
            const popup = host.context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
            await button.click();
            const p = await popup;
            if (p) await p.close().catch(() => { });
        };
        await press();
        await sleep(1500);
        check(calls.some((c) => c.content_type === 'scores' && c.method === 'whatsapp' && c.crew === game.pin), `the press sent ${JSON.stringify(calls)}`);
        check(await visible(host.page.locator('app-send-scores .send-scores-hint .tick')), 'no tick after the press');
        await db('PUT', `games/${game.pin}/campaign`, null);
        await press();
        await sleep(3000);

        // 4. The link, opened from the group chat by someone who didn't play: each half, tagged.
        const link = sc.scoresUrl(game.pin, locale).replace('https://bullshit.wtf', base);
        const other = await visitor(browser, base, 'scores-other', 'new');
        await other.page.goto(link);
        await waitFor('the recap half shows no recap', () => visible(other.page.locator('.night-after .recap-create')), problems);
        await shot(other.page, `${locale}-2-link-recap`);
        await other.page.locator('.night-after .recap-create').click();
        await waitFor('START YOUR OWN GAME opened no Create page', () => /\/create-game/.test(other.page.url()), problems);
        const to = new URL(other.page.url());
        check(to.searchParams.get('via') === sc.SCORES_CREATE_TAG, `the recap's Create page opened as ${to.pathname}${to.search}`);

        const control = await visitor(browser, base, 'scores-control', 'control');
        await control.page.goto(link);
        await waitFor('the control half shows no Game over ask', () => visible(control.page.locator('app-host-ask .ask-create')), problems);
        await shot(control.page, `${locale}-3-link-control`);
        await control.page.locator('app-host-ask .ask-create').click();
        await waitFor('START MY OWN GAME opened no Create page', () => /\/create-game/.test(control.page.url()), problems);
        const to2 = new URL(control.page.url());
        check(to2.searchParams.get('via') === sc.SCORES_CREATE_TAG, `the Game over Create page opened as ${to2.pathname}${to2.search}`);

        // 5. The rows: one press (the test press sent none), the two seen rows of the scores link.
        await sleep(3000);
        result.rows = sharesOf(game.pin).sort();
        const rows = ['night-after/create', 'night-after/seen-scores-other', 'night-after/seen-scores-other', 'scores/whatsapp'];
        check(JSON.stringify(result.rows) === JSON.stringify(rows), `rows ${JSON.stringify(result.rows)}, not ${JSON.stringify(rows)}`);

        for (const p of phones.concat(screen, other, control)) {
            (p.problems || []).forEach((x) => problems.push(`${locale}: ${p.name}: ${x}`));
        }
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
