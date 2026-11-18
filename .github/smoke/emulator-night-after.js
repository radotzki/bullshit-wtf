#!/usr/bin/env node
// Local run: "The night after" (game/src/app/pages/join-game/night-after.ts, functions/src/controllers/
// night-after.ts) in headless Chromium, against the Firebase emulators. Three phones and the big screen
// play a whole test game (?via=test) to the final scoreboard, in English and in Hebrew. Then the game's own
// link (/join-game/<PIN>, /he/join-game/<PIN>) is opened again:
//   - by a player of that game (the guest's own browser): the recap, with HOST THE NEXT ONE;
//   - by someone who didn't play (a fresh browser): the recap, "You missed it", START YOUR OWN GAME, whose
//     press opens the Create page tagged night-after;
//   - in the other half (the tester's switch set to control): today's "Game over" page, with its ask;
//   - with no switch: the half the server drew for the PIN.
// It checks the recap's words against the game's own (night-after.ts), its scores against the database,
// that no question and no true answer is on the page, and the rows: a test game sends none, and the same
// game with its test mark taken off sends seen-player, seen-other, seen-control-other and create.
//
// Nothing reaches production: see emulator-game.js, whose emulators and phones this run uses.
// From the repository root, with game/ and functions/ built and the root's npm ci done:
//   node .github/smoke/emulator-night-after.js [path to dist]
// ONLY=en or ONLY=he plays one language. SHOTS=<dir> saves screenshots (390 px and 320 px wide).
// Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');
const { serve, fileIn, HOST } = require('./smoke');
const emu = require('./emulator-game');

const { ROOT, DIST, startEmulators, stopEmulators, up, db, seed, newPhone, visible, sleep, log, act } = emu;
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const SHOTS = process.env.SHOTS || '';
const GAME_TIMEOUT_MS = Number(process.env.GAME_MINUTES || 8) * 60 * 1000;

const ts = require(path.join(ROOT, 'game', 'node_modules', 'typescript'));
function loadTs(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}
const na = loadTs(path.join(ROOT, 'game', 'src', 'app', 'pages', 'join-game', 'night-after.ts'));
const joinWords = loadTs(path.join(ROOT, 'game', 'src', 'app', 'pages', 'join-game', 'join-strings.ts'));

/** The half the server draws for a PIN (night-after.ts). */
const half = (pin) => crypto.createHash('sha256').update('night-after:' + pin.toUpperCase(), 'utf8').digest()[0] % 2 === 1;

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
    const size = page.viewportSize();
    await page.setViewportSize({ width: 320, height: size.height });
    await sleep(300);
    await page.screenshot({ path: path.join(SHOTS, `${name}-320.png`), fullPage: true }).catch(() => { });
    await page.setViewportSize(size);
}

/** The emulators' log, for the rows the functions sent to BigQuery `shares`. */
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
            if (row.content_type === 'night-after' && row.crew_id === pin) rows.push(row.method);
        } catch (e) { /* a cut line */ }
    }
    return rows;
}

/** A browser that opens the link: a phone of its own (or a player's), the tester's switch set or not. */
async function visitor(browser, base, name, forced) {
    const phone = await newPhone(browser, base, name, 'player');
    if (forced) await phone.context.addInitScript((v) => { try { localStorage.setItem('BS_NIGHT_AFTER', v); } catch (e) { } }, forced);
    phone.shareCalls = [];
    phone.page.on('request', (r) => { if (/\/onShare$/.test(r.url())) phone.shareCalls.push(JSON.parse(r.postData() || '{}')); });
    return phone;
}

/** What the recap shows on a page. */
async function readRecap(page) {
    const text = async (sel) => (await page.locator(sel).first().textContent().catch(() => '') || '').trim();
    return {
        heading: await text('.night-after .recap-heading'),
        winner: await text('.night-after .recap-winner .recap-name'),
        biggest: await text('.night-after .recap-biggest .recap-name'),
        lie: await text('.night-after .recap-lie-text'),
        rows: await page.locator('.night-after .recap-row').evaluateAll((els) => els.map((e) => ({
            name: e.querySelector('.recap-row-name').textContent.trim(),
            score: Number(e.querySelector('.recap-row-score').textContent.trim()),
            place: Number(e.querySelector('.recap-place').textContent.trim()),
        }))),
        askTitle: await text('.night-after .recap-ask-title'),
        button: await text('.night-after .recap-create'),
        all: await text('.night-after'),
    };
}

async function language(base, locale) {
    const problems = [];
    const check = (ok, what) => { if (!ok) problems.push(`${locale}: ${what}`); return ok; };
    const he = locale === 'he';
    const n = na.nightAfterWords(locale);
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
        const link = `${base}${he ? '/he' : ''}/join-game/${game.pin}`;
        for (const p of phones.slice(1)) await p.page.goto(link);
        await playToFinal(phones.concat(screen), game, problems);
        const g = await db('GET', `games/${game.pin}`);
        check(g && g.campaign === 'test' && g.state.id === 6, `the game is not a finished test game (${g && g.campaign}, ${g && JSON.stringify(g.state)})`);
        result.pin = game.pin;
        result.serverHalf = half(game.pin) ? 'new' : 'control';
        const seats = Object.values(g.players);
        const expected = seats.map((p) => ({ name: p.nickname, score: p.score || 0 })).sort((a, b) => b.score - a.score);
        const truths = await db('GET', 'questions');

        // 1. A player of that game reopens the link from the group chat, in the new half.
        const player = phones[1];
        await player.context.addInitScript(() => { try { localStorage.setItem('BS_NIGHT_AFTER', 'new'); } catch (e) { } });
        player.shareCalls = [];
        player.page.on('request', (r) => { if (/\/onShare$/.test(r.url())) player.shareCalls.push(JSON.parse(r.postData() || '{}')); });
        await player.page.goto(link);
        await waitFor('the player sees no recap', () => visible(player.page.locator('.night-after')), problems);
        const seen = await readRecap(player.page);
        result.player = { heading: seen.heading, winner: seen.winner, biggest: seen.biggest, lie: seen.lie, button: seen.button };
        const w = na.whenWas(g.state.timestamp, Date.now());
        check(seen.heading === n.heading(w, host.name), `heading "${seen.heading}", not "${n.heading(w, host.name)}"`);
        check(JSON.stringify(seen.rows.map((r) => [r.name, r.score])) === JSON.stringify(expected.map((r) => [r.name, r.score])),
            `scores ${JSON.stringify(seen.rows)} against the database's ${JSON.stringify(expected)}`);
        const top = expected[0].score;
        check(expected.filter((r) => r.score === top).every((r) => seen.winner.indexOf(r.name) >= 0), `winner "${seen.winner}"`);
        check(seen.askTitle === n.playerTitle && seen.button === n.createPlayer, `the player's ask is "${seen.askTitle}" / "${seen.button}"`);
        // Nothing of the questions: no question text, no true answer.
        const leaks = Object.values(truths).filter((q) => q.lang === locale)
            .filter((q) => seen.all.indexOf(q.realAnswer) >= 0 || seen.all.indexOf(q.questionText.slice(0, 20)) >= 0);
        check(leaks.length === 0, `the recap shows a question or a truth: ${JSON.stringify(leaks.map((q) => q.realAnswer))}`);
        check(he ? /[֐-׿]/.test(seen.all) && (await player.page.locator('.join-game[dir="rtl"]').count()) === 1 : !/[֐-׿]/.test(seen.all.replace(/דנה|יוסי|מיכל/g, '')),
            'the page is not in the game\'s language and direction');
        check(player.shareCalls.length === 0, `a test game's link sent ${player.shareCalls.length} rows`);
        await shot(player.page, `${locale}-1-player`);

        // 2. Someone in the chat who didn't come: "You missed it", and START YOUR OWN GAME, tagged.
        const other = await visitor(browser, base, 'outsider', 'new');
        await other.page.goto(link);
        await waitFor('the outsider sees no recap', () => visible(other.page.locator('.night-after')), problems);
        const theirs = await readRecap(other.page);
        result.other = { askTitle: theirs.askTitle, button: theirs.button };
        check(theirs.askTitle === n.missedTitle && theirs.button === n.create, `the outsider's ask is "${theirs.askTitle}" / "${theirs.button}"`);
        check(theirs.heading === seen.heading && theirs.rows.length === expected.length, 'the outsider sees another recap');
        await shot(other.page, `${locale}-2-other`);
        await other.page.locator('.night-after .recap-create').click();
        await waitFor('START YOUR OWN GAME opened no Create page', () => /\/create-game/.test(other.page.url()), problems);
        const to = new URL(other.page.url());
        check(to.searchParams.get('via') === 'night-after' && to.searchParams.get('lang') === locale, `the Create page opened as ${to.pathname}${to.search}`);
        check(other.shareCalls.length === 0, `a test game's link sent ${other.shareCalls.length} rows`);

        // 3. The other half: today's "Game over", with its ask.
        const control = await visitor(browser, base, 'control', 'control');
        await control.page.goto(link);
        await waitFor('the control browser sees no Game over', () => visible(control.page.locator('.game-over')), problems);
        check(!(await visible(control.page.locator('.night-after'))), 'the control half shows the recap');
        check(((await control.page.locator('.game-over-title').textContent()) || '').trim() === joinWords.joinStrings(locale).gameOverTitle, 'the control half lost today\'s title');
        check(await visible(control.page.locator('app-host-ask .ask-create')), 'the control half lost its START MY OWN GAME ask');
        await shot(control.page, `${locale}-3-control`);

        // 4. No switch: the server's half for this PIN.
        const plain = await visitor(browser, base, 'plain', null);
        await plain.page.goto(link);
        await waitFor('the plain browser sees neither page', async () => (await visible(plain.page.locator('.night-after'))) || (await visible(plain.page.locator('.game-over'))), problems);
        const plainHalf = (await visible(plain.page.locator('.night-after'))) ? 'new' : 'control';
        check(plainHalf === result.serverHalf, `with no switch the page shows ${plainHalf}, the server drew ${result.serverHalf}`);

        // 5. The rows: the same game without its test mark (as a real game) sends them.
        await db('PUT', `games/${game.pin}/campaign`, null);
        const real = [await visitor(browser, base, 'real-other', 'new'), await visitor(browser, base, 'real-control', 'control')];
        for (const v of real) {
            await v.page.goto(link);
            await waitFor(`${v.name} sees neither page`, async () => (await visible(v.page.locator('.night-after'))) || (await visible(v.page.locator('.game-over'))), problems);
        }
        await player.page.reload();
        await waitFor('the player sees no recap after a reload', () => visible(player.page.locator('.night-after')), problems);
        await real[0].page.locator('.night-after .recap-create').click();
        await sleep(3000);
        result.rows = sharesOf(game.pin).sort();
        const want = ['create', 'seen-control-other', 'seen-other', 'seen-player'];
        check(JSON.stringify(result.rows) === JSON.stringify(want), `rows ${JSON.stringify(result.rows)}, not ${JSON.stringify(want)}`);

        for (const p of phones.concat(screen, other, control, plain, ...real)) {
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
