#!/usr/bin/env node
// Local run: CHALLENGE ANOTHER GROUP (game/src/app/components/challenge, functions/src/controllers/challenge.ts)
// in headless Chromium, against the Firebase emulators, in English and in Hebrew:
//   1. Table A, three phones and the big screen, plays a whole test game (?via=test) to the final scores.
//   2. A guest of table A presses CHALLENGE ANOTHER GROUP: the sheet's WhatsApp link is the challenge link
//      (/challenge/<PIN>?via=challenge-whatsapp, /he/... for a Hebrew game) and the game's challenge is open.
//   3. Table B, three fresh phones, opens that link: the page shows table A's challenge number; START THE CHALLENGE
//      makes table B's game, and table B plays it to the end.
//   4. Table B's game played table A's questions, in the same order; at its end every phone shows both
//      tables side by side, with table A's scores as the database has them, and the verdict line.
//   5. A link of a game that was never challenged says the challenge is over.
// Both tables are test games (B keeps A's test tag), so no row is sent; the run checks that too.
//
// Nothing reaches production: see emulator-game.js, whose emulators and phones this run uses.
// From the repository root, with game/ and functions/ built and the root's npm ci done:
//   node .github/smoke/emulator-challenge.js [path to dist]
// ONLY=en or ONLY=he plays one language. SHOTS=<dir> saves screenshots (390 px and 320 px wide).
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
function loadTs(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}
const ch = loadTs(path.join(ROOT, 'game', 'src', 'app', 'components', 'challenge', 'challenge.ts'));

const NAMES = { en: [['Ana', 'Ben', 'Cleo'], ['Dov', 'Eli', 'Fay']], he: [['דנה', 'יוסי', 'מיכל'], ['אורי', 'נועה', 'רון']] };
const screenOf = (page) => new URL(page.url()).pathname.replace(/^\/he(?=\/|$)/, '').split('/');
const pinOf = (page) => new URL(page.url()).pathname.split('/').pop().toUpperCase();

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
            if (row.content_type === 'challenge' && row.crew_id === pin) rows.push(row.method);
        } catch (e) { /* a cut line */ }
    }
    return rows;
}


function watchShares(phone) {
    phone.shareCalls = [];
    phone.page.on('request', (r) => { if (/\/onShare$/.test(r.url())) phone.shareCalls.push(JSON.parse(r.postData() || '{}')); });
}

async function language(base, locale) {
    const problems = [];
    const check = (ok, what) => { if (!ok) problems.push(`${locale}: ${what}`); return ok; };
    const he = locale === 'he';
    const t = ch.challengeWords(locale);
    const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`] });
    const result = { locale };
    const all = [];
    try {
        // 1. Table A.
        const a = [];
        for (let i = 0; i < 3; i++) a.push(await newPhone(browser, base, NAMES[locale][0][i], i === 0 ? 'host' : 'player'));
        const screen = await newPhone(browser, base, 'big screen', 'screen');
        all.push(...a, screen);
        a.forEach(watchShares);
        await a[0].page.goto(`${base}/create-game?via=test`);
        await a[0].page.locator('input[name="locale"]').nth(he ? 1 : 0).check();
        await a[0].page.locator('input[name="length"]').first().check();
        await a[0].page.locator('form button[type="submit"]').first().click();
        await a[0].page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
        const gameA = { pin: pinOf(a[0].page) };
        log(`${locale}: table A's game ${gameA.pin}`);
        await screen.page.goto(`${base}/present-game/${gameA.pin}`);
        for (const p of a.slice(1)) await p.page.goto(`${base}${he ? '/he' : ''}/join-game/${gameA.pin}`);
        await playToFinal(a.concat(screen), gameA, problems);
        const A = await db('GET', `games/${gameA.pin}`);
        check(A && A.state.id === 6 && A.campaign === 'test', 'table A is not a finished test game');
        const scoresA = Object.values(A.players).map((p) => ({ name: p.nickname, score: p.score || 0 })).sort((x, y) => y.score - x.score);
        result.a = { pin: gameA.pin, scores: scoresA };
        // A challenge is judged by each table's challenge number: its scores plus its house-lie credit, a player
        // (challengeNumber in the functions). Three players see house lies, and the credit is kept from question 1.
        check(typeof A.houseCredit === 'number' && A.houseCredit >= 0, `table A's house-lie credit is ${A.houseCredit}`);
        const numberOf = (g) => Math.round((Object.values(g.players).reduce((sum, p) => sum + Math.max(0, p.score || 0), 0)
            + (g.houseCredit || 0)) / Object.keys(g.players).length);
        const averageA = numberOf(A);
        result.a.houseCredit = A.houseCredit;
        result.a.number = averageA;

        // 2. A guest of table A presses CHALLENGE ANOTHER GROUP.
        const guest = a[1];
        await waitFor('no CHALLENGE ANOTHER GROUP on the final screen', () => visible(guest.page.locator('.challenge-open')), problems);
        check(((await guest.page.locator('.challenge-open').textContent()) || '').trim() === t.button, 'the button\'s words');
        check(!(await visible(screen.page.locator('.challenge-open'))), 'the big screen shows the button');
        await guest.page.locator('.challenge-open').click();
        const href = await waitFor('the WhatsApp button never got its link', async () => {
            const h = await guest.page.locator('.challenge-whatsapp').getAttribute('href');
            return h && h.indexOf('wa.me') >= 0 ? h : null;
        }, problems);
        const message = href ? decodeURIComponent(new URL(href).searchParams.get('text')) : '';
        const linkLine = message.split('\n').pop();
        const want = `https://bullshit.wtf${he ? '/he' : ''}/challenge/${gameA.pin}?via=challenge-whatsapp`;
        check(linkLine === want, `the link is ${linkLine}, not ${want}`);
        check(message.indexOf(t.message(averageA, A.totalQ)) === 0, `the message: ${message}`);
        result.message = message;
        check((await db('GET', `games/${gameA.pin}/challengeOpen`)) === true, 'the challenge is not open');
        await shot(guest.page, `${locale}-1-sheet`);
        await guest.page.locator('.challenge-modal .modal-card-foot button').click();

        // 3. Table B opens the link.
        const b = [];
        for (let i = 0; i < 3; i++) b.push(await newPhone(browser, base, NAMES[locale][1][i], i === 0 ? 'host' : 'player'));
        all.push(...b);
        b.forEach(watchShares);
        const local = linkLine.replace('https://bullshit.wtf', base);
        await b[0].page.goto(local);
        await waitFor('the challenge page shows no score', () => visible(b[0].page.locator('.challenge-top')), problems);
        const top = Number(((await b[0].page.locator('.challenge-top').textContent()) || '').trim());
        check(top === averageA, `the page shows ${top} to beat, table A's number is ${averageA}`);
        const note = ((await b[0].page.locator('.challenge-house').textContent().catch(() => '')) || '').trim();
        check(note === t.houseNote, `the page's house-lie line is "${note}"`);
        const table = ((await b[0].page.locator('.challenge-table').textContent()) || '').trim();
        check(table === t.table(a[0].name, 3), `the page names "${table}"`);
        check(he ? (await b[0].page.locator('.challenge-page[dir="rtl"]').count()) === 1 : true, 'the Hebrew page is not right to left');
        await shot(b[0].page, `${locale}-2-challenge-page`);
        await b[0].page.locator('.challenge-start').click();
        await b[0].page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
        const gameB = { pin: pinOf(b[0].page) };
        check(gameB.pin !== gameA.pin, 'START THE CHALLENGE went to table A\'s game');
        check(he ? /^\/he\//.test(new URL(b[0].page.url()).pathname) : true, 'the Hebrew host left the Hebrew pages');
        log(`${locale}: table B's game ${gameB.pin}`);
        const made = await db('GET', `games/${gameB.pin}`);
        check(made.challenge && made.challenge.from === gameA.pin, 'table B\'s game carries no challenge');
        check(made.campaign === 'test', `table B's game is tagged ${made.campaign}: a test's challenge is a test`);
        check(made.locale === locale && made.totalQ === A.totalQ, 'table B plays another language or length');
        for (const p of b.slice(1)) await p.page.goto(`${base}${he ? '/he' : ''}/join-game/${gameB.pin}`);
        await playToFinal(b, gameB, problems);
        const B = await db('GET', `games/${gameB.pin}`);
        check(JSON.stringify(B.qids) === JSON.stringify(A.qids), `table B played ${JSON.stringify(B.qids)}, table A ${JSON.stringify(A.qids)}`);
        result.b = { pin: gameB.pin, qids: B.qids, sameQuestions: JSON.stringify(B.qids) === JSON.stringify(A.qids) };

        // 4. Both tables side by side, on every phone of table B.
        const scoresB = Object.values(B.players).map((p) => p.score || 0);
        check(typeof B.houseCredit === 'number', `table B's house-lie credit is ${B.houseCredit}`);
        const averageB = numberOf(B);
        result.b.houseCredit = B.houseCredit;
        result.b.number = averageB;
        const line = ch.verdictLine(scoresB, { rows: scoresA, played: scoresA.length, host: a[0].name, average: averageA, ours: averageB }, locale);
        for (const p of b) {
            await waitFor(`${p.name} sees no side-by-side scores`, () => visible(p.page.locator('.versus')), problems);
            const shown = ((await p.page.locator('.versus-line').textContent()) || '').trim();
            check(shown === line, `${p.name}: "${shown}", not "${line}"`);
            const tops = await p.page.locator('.versus-top').evaluateAll((els) => els.map((e) => Number(e.textContent.trim())));
            check(JSON.stringify(tops) === JSON.stringify([averageB, averageA]), `${p.name}: the big numbers ${JSON.stringify(tops)}`);
            check(await visible(p.page.locator('.versus-house')), `${p.name}: no house-lie line under the scores`);
            const theirs = await p.page.locator('.versus-table.theirs .versus-row').evaluateAll((els) => els.map((e) => ({
                name: e.querySelector('.versus-row-name').textContent.trim(), score: Number(e.querySelector('.versus-row-score').textContent.trim()) })));
            check(JSON.stringify(theirs.map((r) => r.score)) === JSON.stringify(scoresA.map((r) => r.score)), `${p.name}: table A's scores ${JSON.stringify(theirs)}`);
            check(theirs.every((r) => scoresA.some((s) => s.name === r.name)), `${p.name}: table A's names ${JSON.stringify(theirs)}`);
            check(await visible(p.page.locator('.challenge-open')), `${p.name}: no button to challenge the next group`);
        }
        result.verdict = line;
        await shot(b[1].page, `${locale}-3-versus`);
        // Table A's own final screen shows no side-by-side scores: it played against nobody.
        await a[2].page.reload();
        await sleep(3000);
        check(!(await visible(a[2].page.locator('.versus'))), 'table A shows side-by-side scores');

        // 5. A game that was never challenged.
        const stranger = await newPhone(browser, base, 'stranger', 'player');
        all.push(stranger);
        await stranger.page.goto(`${base}${he ? '/he' : ''}/challenge/${gameB.pin}?via=challenge-copy`);
        await waitFor('a link never opened does not say the challenge is over', () => visible(stranger.page.locator('.challenge-new')), problems);
        check(!(await visible(stranger.page.locator('.challenge-top'))), 'a link never opened shows a score');
        await shot(stranger.page, `${locale}-4-over`);

        // Test games send no challenge row.
        const sent = all.flatMap((p) => (p.shareCalls || []).filter((c) => c.content_type === 'challenge'));
        check(sent.length === 0, `test games sent challenge rows: ${JSON.stringify(sent)}`);
        result.rowsLogged = sharesOf(gameA.pin);
        all.forEach((p) => (p.problems || []).forEach((x) => problems.push(`${locale}: ${p.name}: ${x}`)));
    } finally {
        await browser.close().catch(() => { });
    }
    result.problems = problems;
    return result;
}

async function main() {
    if (!fileIn(DIST, '/index.html')) throw new Error(`No built game at ${DIST}`);
    if (!fs.existsSync(path.join(ROOT, 'functions', 'dist', 'index.js'))) throw new Error('Build functions/ first: npm run build there');
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
