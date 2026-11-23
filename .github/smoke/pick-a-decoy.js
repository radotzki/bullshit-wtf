#!/usr/bin/env node
// Local run: "Pick a decoy" (functions/src/controllers/pair.ts and game/src/app/pages/pair-strings.ts),
// decoys for every two-player game, in headless Chromium against the Firebase emulators. Each sitting is
// one test game (?via=test) of five questions, with the big screen on.
//
//   en-pair, he-pair      two phones, PIN in the ended test's decoy half. Checks: pair true at START; the first question's
//                         card says how it plays; the writing screen offers decoy chips on every question
//                         (the second phone at 320 px wide); the host taps a chip, the friend taps none;
//                         each phone lists three answers, never its own lie or decoy, and no house lie is
//                         on the table; a decoy that fooled shows its DECOY tag on the reveal and pays
//                         half a lie's points; question_results rows say pair true and count decoy_picks.
//   en-one-writer, he-one-writer  as en-pair, but on the first question the friend writes no lie. Checks:
//                         both players still have a decoy, so the writer's phone lists two answers (the
//                         truth and the friend's decoy), not the truth alone; the friend's lists three.
//   en-old-control, he-old-control  as en-pair, with a PIN from the ended test's no-decoy half: decoys too.
//   en-three              three phones, PIN in the old decoy half: not a pair game, nothing changes.
//
// Nothing reaches production: see emulator-game.js, whose emulators and phones this run uses.
// From the repository root, with game/ and functions/ built and the root's npm ci done:
//   node .github/smoke/pick-a-decoy.js [path to dist]
// ONLY=en-pair,he-pair,en-one-writer,he-one-writer,en-old-control,he-old-control,en-three plays only those. SHOTS=<dir> saves screenshots.
// Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');
const { serve, fileIn, HOST } = require('./smoke');
const emu = require('./emulator-game');

const { ROOT, DIST, startEmulators, stopEmulators, up, db, seed, newPhone, visible, sleep, log } = emu;
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
const SHOTS = process.env.SHOTS || '';
const GAME_TIMEOUT_MS = Number(process.env.GAME_MINUTES || 7) * 60 * 1000;

const ts = require(path.join(ROOT, 'game', 'node_modules', 'typescript'));
function loadTs(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}
const { pairStrings } = loadTs(path.join(ROOT, 'game', 'src', 'app', 'pages', 'pair-strings.ts'));
const DECOY_POINTS = [250, 375, 500];

/** The half a PIN fell in during the ended 50/50 test (true: decoys). Only to show that both halves get decoys now. */
const half = (pin) => crypto.createHash('sha256').update('pair:' + pin.toUpperCase(), 'utf8').digest()[0] % 2 === 1;
/** The PIN the game counter gives (generateGameName in new-game.ts). */
const pinOf = (counter) => counter.toString(26).replace(/\d/g, (d) => 'qrstuvwxyz'[d]).toUpperCase().padStart(4, 'Q');

const NAMES = { en: ['Ana', 'Ben', 'Cleo'], he: ['דנה', 'יוסי', 'מיכל'] };
const screenOf = (page) => new URL(page.url()).pathname.replace(/^\/he(?=\/|$)/, '').split('/');

async function shot(page, name) {
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true }).catch(() => { });
}

let queue = Promise.resolve();
function oneAtATime(step) {
    const run = queue.then(step);
    queue = run.catch(() => { });
    return run;
}

/** One phone's next move. Records what the decoy screens showed in `game.seen`. */
async function act(phone, game, sitting) {
    const page = phone.page;
    const screen = screenOf(page)[1] || 'home';
    const seen = game.seen;
    const q = () => db('GET', `games/${game.pin}/questionIndex`);
    if (phone.role === 'screen') {
        if (screen === 'show-answers' && !seen.screenAnswers) {
            const n = await page.locator('.answer').count();
            if (n > 0) {
                seen.screenAnswers = n;
                await shot(page, `${sitting.key}-big-screen-answers`);
            }
        }
        if (screen === 'reveal-the-truth' && sitting.pair && !seen.screenTag && await visible(page.locator('.tag-decoy'))) {
            seen.screenTag = true;
            await shot(page, `${sitting.key}-big-screen-reveal`);
        }
        return;
    }
    if (screen === 'join-game') {
        const input = page.locator('input[name="nickname"]');
        if (await visible(input) && !phone.joining) {
            phone.joining = true;
            await input.fill(phone.name);
            await page.locator('form button[type="submit"]').first().click();
        }
    } else if (screen === 'game-staging') {
        phone.joined = true;
        if (phone.role === 'host' && game.everyoneIn && !game.started) {
            const start = page.locator('.game-header > button');
            if (await visible(start) && !(await start.first().evaluate((b) => b.classList.contains('is-loading')))) {
                game.started = Date.now();
                await start.first().click();
                log(`${sitting.key}: ${phone.name} pressed START`);
            }
        }
    } else if (screen === 'round-intro') {
        if (await visible(page.locator('.pair-intro'))) {
            const text = (await page.locator('.pair-intro').first().innerText()).trim();
            const index = await q();
            seen.intro.push({ phone: phone.name, q: index, text });
            if (index === 0 && !seen.introShot) {
                seen.introShot = true;
                await shot(page, `${sitting.key}-round-intro-${phone.name}`);
            }
        }
    } else if (screen === 'show-question') {
        const input = page.locator('form input.input');
        if (!(await visible(input))) return;
        const index = await q();
        if (phone.lies[phone.lies.length - 1] === index) return;
        // The chooser loads a moment after the form: give it that moment.
        await sleep(1200);
        const chips = page.locator('.decoy-chip');
        const n = await chips.count();
        const label = n ? (await page.locator('.decoy-label').first().innerText()).trim() : null;
        seen.chips.push({ phone: phone.name, q: index, chips: n, label });
        if (n && !phone.choserShot) {
            phone.choserShot = true;
            await shot(page, `${sitting.key}-writing-${phone.name}-${page.viewportSize().width}`);
        }
        // The host taps the last chip; the friend taps none (the server picks one for them).
        let chosen = null;
        if (n && phone.role === 'host') {
            await chips.nth(n - 1).click();
            chosen = (await chips.nth(n - 1).innerText()).trim();
            if (!phone.choseShot) {
                phone.choseShot = true;
                await shot(page, `${sitting.key}-writing-chosen-${phone.name}`);
            }
        }
        // A one-writer sitting: the friend writes nothing on the first question and lets the time run out.
        if (sitting.silentQ === index && phone.role !== 'host') {
            phone.lies.push(index);
            phone.chosen[index] = null;
            return;
        }
        await input.fill(`${phone.name} lie ${index}`);
        await page.locator('form button[type="submit"]').first().click();
        phone.lies.push(index);
        phone.chosen[index] = chosen;
    } else if (screen === 'show-answers') {
        const buttons = page.locator('button.answer:not([disabled])');
        const n = await buttons.count();
        if (!n) return;
        const index = await q();
        if (phone.picks[phone.picks.length - 1] === index) return;
        const texts = (await buttons.allInnerTexts()).map((t) => t.trim().toLowerCase());
        const answers = await db('GET', `games/${game.pin}/answers`) || {};
        const pid = phone.pid;
        const mine = Object.keys(answers).filter((k) => k === pid || answers[k].decoyOf === pid).map((k) => answers[k].text.toLowerCase());
        const friendDecoy = Object.keys(answers).filter((k) => answers[k].decoyOf && answers[k].decoyOf !== pid).map((k) => answers[k].text.toLowerCase())[0];
        seen.answers.push({ phone: phone.name, q: index, buttons: n, ownShown: texts.filter((t) => mine.includes(t)) });
        if (!phone.answersShot) {
            phone.answersShot = true;
            await shot(page, `${sitting.key}-answers-${phone.name}`);
        }
        // In a pair game the host falls for the friend's decoy, to see it pay; everyone else picks at random.
        let target = Math.floor(Math.random() * n);
        if (sitting.pair && phone.role === 'host' && friendDecoy && texts.includes(friendDecoy)) target = texts.indexOf(friendDecoy);
        await buttons.nth(target).click().catch(() => { });
        phone.picks.push(index);
    } else if (screen === 'reveal-the-truth') {
        if (sitting.pair && phone.role !== 'host' && !phone.revealShot && await visible(page.locator('.tag-decoy'))) {
            phone.revealShot = true;
            await sleep(1500);
            await shot(page, `${sitting.key}-reveal-${phone.name}`);
        }
        if (sitting.pair && await visible(page.locator('.flash'))) {
            seen.flash.push((await page.locator('.flash').first().innerText()).trim());
        }
        if (sitting.pair && !phone.resultSeen && await visible(page.locator('.my-result'))) {
            phone.resultSeen = true;
            seen.results.push({ phone: phone.name, text: (await page.locator('.my-result').first().innerText()).trim() });
        }
        const next = page.locator('button.next');
        if (await visible(next)) await next.first().click().catch(() => { });
    } else if (screen === 'score-board-final') {
        phone.done = true;
    }
}

function emulatorsLog() {
    const files = fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith('bs-emulators-'))
        .map((d) => path.join(os.tmpdir(), d, 'emulators.log')).filter((f) => fs.existsSync(f));
    return files.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0] || '';
}

/** The question_results rows the functions sent for this game, read from the emulators' log. */
function rowsOf(pin) {
    const file = emulatorsLog();
    if (!file) return [];
    const rows = [];
    const re = /Insert to BigQuery, table: 'question_results', data: (\{.*?\})\s*$/gm;
    const text = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = re.exec(text))) {
        try {
            const row = JSON.parse(m[1]);
            if (row.id === pin) rows.push(row);
        } catch (e) { /* a cut line */ }
    }
    return rows;
}

async function sitting(base, s) {
    const problems = [];
    const check = (ok, what) => { if (!ok) problems.push(`${s.key}: ${what}`); return ok; };
    const he = s.locale === 'he';
    const words = pairStrings(s.locale);
    const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`, '--autoplay-policy=no-user-gesture-required'] });
    const phones = [];
    for (let i = 0; i < s.players; i++) {
        const p = await newPhone(browser, base, NAMES[s.locale][i], i === 0 ? 'host' : 'player');
        p.chosen = {};
        phones.push(p);
    }
    // The friend's phone is a small one: the chips must fit at 320 px.
    await phones[1].page.setViewportSize({ width: 320, height: 640 });
    const screen = await newPhone(browser, base, 'big screen', 'screen');
    const all = phones.concat(screen);
    const game = { seen: { intro: [], chips: [], answers: [], flash: [], results: [] } };
    try {
        const host = phones[0];
        game.pin = await oneAtATime(async () => {
            let counter = await db('GET', 'gameCounter');
            while (half(pinOf(counter + 1)) !== s.half) counter++;
            await db('PUT', 'gameCounter', counter);
            await host.page.goto(`${base}/create-game?via=test`);
            await host.page.locator('input[name="locale"]').nth(he ? 1 : 0).check();
            await host.page.locator('input[name="length"]').first().check();
            await host.page.locator('form button[type="submit"]').first().click();
            await host.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
            return new URL(host.page.url()).pathname.split('/').pop().toUpperCase();
        });
        log(`--- ${s.key}: game ${game.pin}, ${s.players} phones and the big screen ---`);
        check(half(game.pin) === s.half, `game ${game.pin} is not in the half asked for`);
        await screen.page.goto(`${base}/present-game/${game.pin}`);
        for (const p of phones.slice(1)) await p.page.goto(`${base}${he ? '/he' : ''}/join-game/${game.pin}`);

        const deadline = Date.now() + GAME_TIMEOUT_MS;
        const there = (p) => screenOf(p.page)[1] === 'score-board-final';
        while (Date.now() < deadline && !all.every(there)) {
            if (!game.everyoneIn) {
                const players = await db('GET', `games/${game.pin}/players`);
                game.everyoneIn = !!players && Object.keys(players).length === phones.length && phones.every((p) => p.joined);
                if (game.everyoneIn) {
                    phones.forEach((p) => { p.pid = Object.keys(players).find((k) => players[k].nickname === p.name); });
                }
            }
            await Promise.all(all.filter((p) => !there(p)).map((p) => act(p, game, s).catch((e) => {
                if (!/Target closed|Execution context was destroyed|navigation|detached/.test(e.message)) log(`${s.key} ${p.name}: ${e.message.split('\n')[0]}`);
            })));
            await sleep(300);
        }
        check(all.every(there), 'not every phone reached the final scoreboard');
        await sleep(2500);
        await shot(phones[0].page, `${s.key}-final-${phones[0].name}`);

        const g = await db('GET', `games/${game.pin}`);
        const seen = game.seen;
        check(g.campaign === 'test', `not a test game (campaign ${g.campaign})`);
        const want = s.players === 2 ? true : undefined;
        check(g.pair === want, `pair is ${g.pair}, not ${want}`);
        const rows = rowsOf(game.pin);
        check(rows.length === 5, `${rows.length} question_results rows, not 5`);
        rows.forEach((r) => check(r.pair === (want === undefined ? null : want), `row ${r.q_index}: pair ${r.pair}`));
        phones.forEach((p) => p.problems.forEach((x) => problems.push(`${s.key} ${p.name}: ${x}`)));
        screen.problems.forEach((x) => problems.push(`${s.key} big screen: ${x}`));

        if (s.pair) {
            const intro0 = seen.intro.filter((i) => i.q === 0);
            check(intro0.length >= 1 && intro0.every((i) => i.text === words.intro), `the first card's line: ${JSON.stringify(intro0)}`);
            check(seen.intro.every((i) => i.q === 0), `the card's line on a later question: ${JSON.stringify(seen.intro)}`);
            const friendOf = (name) => phones.find((p) => p.name !== name).name;
            check(seen.chips.length === 10 && seen.chips.every((c) => c.chips === 2 && c.label === words.label(friendOf(c.phone))),
                `the chooser on the writing screen: ${JSON.stringify(seen.chips)}`);
            // With one writer, the writer's phone lists the truth and the friend's decoy: two, never the truth alone.
            const listed = (a) => (s.silentQ === a.q && a.phone === phones[0].name ? 2 : 3);
            check(seen.answers.length === 10 && seen.answers.every((a) => a.buttons === listed(a) && !a.ownShown.length),
                `the answers each phone listed: ${JSON.stringify(seen.answers)}`);
            const onTable = s.silentQ === 0 ? 4 : 5;
            check(seen.screenAnswers === onTable, `the big screen listed ${seen.screenAnswers} answers, not the ${onTable} on the table`);
            if (s.silentQ !== undefined) {
                const row = rows.find((r) => r.q_index === s.silentQ);
                check(!!row && row.lies === 1 && row.decoy_picks >= 1, `the one-writer question: ${JSON.stringify(row)}`);
            }
            check(!!seen.screenTag, 'the big screen never showed the DECOY tag');
            check(rows.every((r) => r.house_picks === 0), 'a house lie was picked in a pair game');
            const decoyPicks = rows.reduce((n, r) => n + (r.decoy_picks || 0), 0);
            check(decoyPicks >= 5, `${decoyPicks} decoy picks over 5 questions (the host falls for one each time)`);
            check(rows.every((r) => r.friend_fooled + r.decoy_picks > 0), `a round fooled nobody: ${JSON.stringify(rows.map((r) => [r.friend_fooled, r.decoy_picks]))}`);
            // The host's chosen chip was their decoy, each question.
            const hostPid = phones[0].pid;
            check(Object.keys(phones[0].chosen).length === 5, `the host chose ${Object.keys(phones[0].chosen).length} decoys`);
            check(seen.results.length >= 1 && seen.results.some((r) => r.text.indexOf(words.fooled(phones[0].name, '').trim().slice(0, 12)) >= 0 || r.text.indexOf(words.flash(phones[0].name).slice(0, 12)) >= 0),
                `no phone's result said its decoy fooled: ${JSON.stringify(seen.results)}`);
            return { key: s.key, pin: game.pin, pair: g.pair, hostPid, scores: Object.values(g.players).map((p) => `${p.nickname}: ${p.score}`),
                rows: rows.map((r) => ({ q: r.q_index, round: r.round, lies: r.lies, picks: r.picks, friend_fooled: r.friend_fooled, decoy_picks: r.decoy_picks, truth_picks: r.truth_picks, house_picks: r.house_picks, pair: r.pair })),
                flash: [...new Set(seen.flash)], results: seen.results, problems };
        }
        check(seen.intro.length === 0, `the card's decoy line in a game of three: ${JSON.stringify(seen.intro)}`);
        check(seen.chips.every((c) => c.chips === 0), `decoy chips in a game of three: ${JSON.stringify(seen.chips)}`);
        check(rows.every((r) => !r.decoy_picks), 'decoy picks in a game of three');
        check(seen.answers.every((a) => a.buttons >= 4), `fewer answers than today: ${JSON.stringify(seen.answers)}`);
        return { key: s.key, pin: game.pin, pair: g.pair, scores: Object.values(g.players).map((p) => `${p.nickname}: ${p.score}`),
            answersListed: seen.answers.map((a) => a.buttons), problems };
    } catch (e) {
        problems.push(`${s.key}: ${e.stack || e}`);
        return { key: s.key, problems };
    } finally {
        await browser.close().catch(() => { });
    }
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
        for (const lang of ['en', 'he']) {
            for (let i = 12; i < 40; i++) {
                await db('PUT', `questions/${lang}${i}`, lang === 'en'
                    ? { lang, questionText: `Test question ${i}: the capital of Testland is ___`, realAnswer: `truth${i}`, fakeAnswers: ['lie a', 'lie b', 'lie c', 'lie d'], citation: '' }
                    : { lang, questionText: `שאלת בדיקה ${i}: הבירה של ארץ הבדיקה היא ___`, realAnswer: `אמת${i}`, fakeAnswers: ['שקר א', 'שקר ב', 'שקר ג', 'שקר ד'], citation: '' });
            }
        }
        server = await serve(DIST);
        const base = `http://${HOST}:${server.address().port}`;
        const plan = [
            { key: 'en-pair', locale: 'en', half: true, pair: true, players: 2 },
            { key: 'he-pair', locale: 'he', half: true, pair: true, players: 2 },
            { key: 'en-one-writer', locale: 'en', half: true, pair: true, players: 2, silentQ: 0 },
            { key: 'he-one-writer', locale: 'he', half: true, pair: true, players: 2, silentQ: 0 },
            { key: 'en-old-control', locale: 'en', half: false, pair: true, players: 2 },
            { key: 'he-old-control', locale: 'he', half: false, pair: true, players: 2 },
            { key: 'en-three', locale: 'en', half: true, players: 3 },
        ].filter((s) => !only || only.includes(s.key));
        const next = async () => {
            for (let s = plan.shift(); s; s = plan.shift()) results.push(await sitting(base, s));
        };
        await Promise.all([next(), next()]);
    } finally {
        if (server) server.close();
        stopEmulators(emulators);
    }
    const problems = results.flatMap((r) => r.problems || []);
    console.log('\nRESULT ' + JSON.stringify({ build: DIST, sittings: results, problems }, null, 2));
    console.log(problems.length ? 'FAIL' : 'PASS');
    process.exitCode = problems.length ? 1 : 0;
}

main().catch((e) => {
    console.error('FAIL', e.stack || e);
    process.exit(1);
});
