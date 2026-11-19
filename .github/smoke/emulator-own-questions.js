#!/usr/bin/env node
// Local run: a whole game with the host's own questions (functions/src/controllers/own-questions.ts),
// on the built client against the Firebase emulators, three phones at 360x640. The host opens the
// create page's "Add your own questions" section, writes two questions (one with a blank, one without),
// and plays; the friends join by link. It checks that:
//   - the two own questions play as questions 2 and 4, in the game's language, and the others are the bank's;
//   - on them the host's phone says it is their own question, the host writes a lie and gets no pick buttons,
//     and the friends' picks end the answers without waiting for the host;
//   - the host's two wrong answers are on the table, and the truth's row is the host's truth;
//   - the texts are kept only where no phone reads them (games/{pin}/ownQs), never in the bank or qHistory;
//   - the game reaches the final scoreboard on every phone.
// SHOTS=<dir> saves 360x640 screenshots (device scale 2) of the create section, an own question, its answers
// and its reveal, on the host's phone and a friend's.
// From the repository root, with the root's npm ci done and functions/ and game/ built:
//   node .github/smoke/emulator-own-questions.js [path to dist] [--locale en|he]

'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve, fileIn, HOST } = require('./smoke');
const { ROOT, DIST, LOCALE, DB, PROJECT, log, sleep, up, startEmulators, stopEmulators, db, seed, newPhone, visible, act } = require('./emulator-game');

const SHOTS = process.env.SHOTS || null;
const GAME_TIMEOUT_MS = 8 * 60 * 1000;

const QUESTIONS = {
    en: [
        { text: 'On the class trip, Noa lost her ___', truth: 'left shoe', lies: ['phone', 'passport'] },
        { text: "Our team's first client was a", truth: 'bakery', lies: ['dentist', 'zoo'] },
    ],
    he: [
        { text: 'בטיול השנתי נועה איבדה את ה___ שלה', truth: 'נעל', lies: ['טלפון', 'דרכון'] },
        { text: 'הלקוח הראשון של הצוות שלנו היה', truth: 'מאפייה', lies: ['רופא שיניים', 'גן חיות'] },
    ],
};

/** A browser whose every context is a 360x640 phone, drawn at twice the pixels for people to look at. */
function phoneBrowser(browser) {
    return {
        newContext: (o) => browser.newContext(Object.assign({}, o, { viewport: { width: 360, height: 640 }, deviceScaleFactor: SHOTS ? 2 : 1 })),
    };
}

async function shot(phone, name) {
    if (!SHOTS) return;
    await sleep(900);
    await phone.page.screenshot({ path: path.join(SHOTS, `${LOCALE}-${name}.png`) }).catch((e) => log(`shot ${name}: ${e.message}`));
    log(`screenshot ${LOCALE}-${name}.png`);
}

async function main() {
    if (!fileIn(DIST, '/index.html')) throw new Error(`No built game at ${DIST}`);
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const emulators = await startEmulators();
    const problems = [];
    let browser;
    let server;
    try {
        if (!(await up(`http://${DB}/.json?ns=${PROJECT}`))) throw new Error('no database emulator on :9000');
        await seed();
        server = await serve(DIST);
        const base = `http://${HOST}:${server.address().port}`;
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`, '--autoplay-policy=no-user-gesture-required'] });
        const phones3 = phoneBrowser(browser);

        const he = LOCALE === 'he';
        const own = QUESTIONS[LOCALE];
        const names = he ? ['דנה', 'יוסי', 'מיכל'] : ['Ana', 'Ben', 'Cleo'];
        const host = await newPhone(phones3, base, names[0], 'host');
        const p2 = await newPhone(phones3, base, names[1], 'player');
        const p3 = await newPhone(phones3, base, names[2], 'player');
        const phones = [host, p2, p3];
        const game = {};

        // The host opens the create page in the game's language (a Hebrew visitor gets the Hebrew page).
        await host.page.goto(`${base}/create-game${he ? '?lang=he' : ''}`);
        await host.page.locator('input[name="locale"]').nth(he ? 1 : 0).check();
        await host.page.locator('input[name="length"]').first().check();
        if (await visible(host.page.locator('.own-questions'))) problems.push('the own questions section is open before it is tapped');
        await host.page.locator('button.own-open').click();
        await host.page.locator('button.own-add').click();
        for (let i = 0; i < own.length; i++) {
            await host.page.locator(`#own-text-${i}`).fill(own[i].text);
            await host.page.locator(`#own-truth-${i}`).fill(own[i].truth);
            const lies = host.page.locator('.own-card').nth(i).locator('input.own-lie');
            await lies.nth(0).fill(own[i].lies[0]);
            await lies.nth(1).fill(own[i].lies[1]);
        }
        // A wrong answer that is the truth is refused on the page, and nothing is created.
        await host.page.locator('.own-card').nth(1).locator('input.own-lie').nth(1).fill(own[1].truth);
        await host.page.locator('form button[type="submit"]').first().click();
        await sleep(500);
        if (!(await visible(host.page.locator('.own-error')))) problems.push('a wrong answer equal to the truth was not refused on the page');
        if (/join-game/.test(host.page.url())) problems.push('the game was created with a refused card');
        await host.page.locator('.own-card').nth(1).locator('input.own-lie').nth(1).fill(own[1].lies[1]);
        await sleep(300);
        if (await visible(host.page.locator('.own-error'))) {
            // The error stays until the next CREATE: that is the page's way. Take the shot of the filled cards without it.
        }
        await host.page.locator('.own-questions').scrollIntoViewIfNeeded();
        await host.page.evaluate(() => document.querySelectorAll('.own-error').forEach(e => e.remove()));
        await host.page.evaluate(() => { const el = document.querySelector('.own-questions'); if (el) el.scrollIntoView({ block: 'start' }); });
        await shot(host, '1-create-section');
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
        game.pin = new URL(host.page.url()).pathname.split('/').pop().toUpperCase();
        log(`game ${game.pin} created (${LOCALE}) with ${own.length} own questions`);

        const created = await db('GET', `games/${game.pin}`);
        const kept = created && created.ownQs ? Object.values(created.ownQs) : [];
        if (kept.length !== own.length) problems.push(`the game keeps ${kept.length} own questions, not ${own.length}`);
        if (created && created.aboutUs !== undefined && created.aboutUs !== null) problems.push('a game with own questions was drawn into the About test');

        await p2.page.goto(`${base}${he ? '/he' : ''}/join-game/${game.pin}`);
        await p3.page.goto(`${base}${he ? '/he' : ''}/join-game/${game.pin}`);

        const seen = {};
        const answersOpened = {};
        const deadline = Date.now() + GAME_TIMEOUT_MS;
        while (Date.now() < deadline && !phones.every((p) => p.done)) {
            if (!game.everyoneIn) {
                const players = await db('GET', `games/${game.pin}/players`);
                game.everyoneIn = players && Object.keys(players).length === 3 && phones.every((p) => p.joined);
            }
            if (game.started) {
                const g = await db('GET', `games/${game.pin}`);
                const q = g.questionIndex;
                const key = `${g.state.id}:${q}`;
                const isOwn = /^own-/.test(String(g.qids && g.qids[q]));
                if (!seen[key]) {
                    seen[key] = Date.now();
                    if (g.state.id === 2) {
                        log(`question ${q + 1}: ${isOwn ? 'OWN' : 'bank'} ${g.qids[q]} "${g.currentQ}"`);
                        if (isOwn !== (q === 1 || q === 3)) problems.push(`question ${q + 1} is ${isOwn ? 'an own question' : 'a bank question'}`);
                        if (isOwn && !(g.state.own && g.state.own.pid)) problems.push(`question ${q + 1}'s state does not name the host`);
                    }
                    if (g.state.id === 3) answersOpened[q] = Date.now();
                    if (g.state.id === 4 && isOwn) {
                        const opened = answersOpened[q];
                        const secs = opened ? (Date.now() - opened) / 1000 : null;
                        log(`question ${q + 1}: answers closed after ${secs} s`);
                        if (secs !== null && secs > 15) problems.push(`question ${q + 1}'s picks waited ${secs} s: the host was waited for`);
                        const rows = g.revealAnswers || [];
                        const truth = rows.find((r) => r.realAnswer);
                        const ownQ = own[Number(g.qids[q].slice(4))];
                        if (!truth || truth.text.toLowerCase() !== ownQ.truth.toLowerCase()) problems.push(`question ${q + 1}'s truth is ${truth && truth.text}`);
                        const texts = rows.map((r) => r.text.toLowerCase());
                        // The house lies are on the table when the table is small; with 3 players at least one shows.
                        if (!ownQ.lies.some((l) => texts.includes(l.toLowerCase())) && !Object.values(g.answers || {}).some((a) => a.houseLie)) {
                            problems.push(`question ${q + 1} shows none of the host's wrong answers`);
                        }
                        const hostPid = g.state.own.pid;
                        if (rows.some((r) => (r.selectors || []).includes(hostPid))) problems.push(`the host picked on question ${q + 1}`);
                    }
                }
                // Screenshots of the first own question (question 2).
                if (q === 1 && isOwn) {
                    if (g.state.id === 2 && !game.shotQ && await visible(p2.page.locator('form input.input'))) {
                        game.shotQ = true;
                        await shot(host, '2-question-host');
                        await shot(p2, '3-question-friend');
                        const title = await host.page.locator('.own-title').count();
                        if (!title) problems.push('the host\'s writing screen does not say it is their question');
                    }
                    if (g.state.id === 3 && !game.shotA && await visible(p2.page.locator('button.answer'))) {
                        game.shotA = true;
                        await shot(p2, '5-answers-friend');
                        await shot(host, '4-answers-host');
                        if (await host.page.locator('button.answer').count()) problems.push('the host has pick buttons on their own question');
                        if (!(await visible(host.page.locator('.about-watch')))) problems.push('the host\'s answers screen does not show the watch list');
                    }
                    // The reveal: nobody taps NEXT until the rows are out and the shots are taken.
                    game.hold = g.state.id === 4 && !game.shotR;
                    if (g.state.id === 4 && !game.shotR && Date.now() - seen[key] > 3500) {
                        game.shotR = true;
                        game.hold = false;
                        await shot(p2, '6-reveal-friend');
                        await shot(host, '7-reveal-host');
                    }
                }
            }
            await Promise.all(phones.filter((p) => !p.done && !game.hold).map((p) => {
                return act(p, game).catch((e) => {
                    if (!/Target closed|Execution context was destroyed|navigation/.test(e.message)) log(`${p.name}: ${e.message.split('\n')[0]}`);
                });
            }));
            await sleep(400);
        }

        const final = await db('GET', `games/${game.pin}`);
        const bank = await db('GET', 'questions');
        const history = await db('GET', 'qHistory');
        const everywhere = JSON.stringify({ bank, history });
        own.forEach((q) => { if (everywhere.includes(q.truth) || everywhere.includes(q.text.slice(0, 12))) problems.push(`own question "${q.text}" reached the bank or qHistory`); });
        if (!final || !final.state || final.state.id !== 6) problems.push(`the game did not reach the final scoreboard (state ${final && final.state && final.state.id})`);
        phones.forEach((p) => { if (!p.done) problems.push(`${p.name} never showed the final scoreboard`); });
        phones.forEach((p) => { if (p.lies.length < 5) problems.push(`${p.name} sent ${p.lies.length} lies, not 5`); });
        if (host.picks.length !== 3) problems.push(`the host picked on ${host.picks.length} questions, not the 3 bank questions`);
        phones.forEach((p) => p.problems.forEach((x) => problems.push(`${p.name}: ${x}`)));

        const summary = {
            locale: LOCALE,
            pin: game.pin,
            qids: final && final.qids,
            scores: final && final.players ? Object.values(final.players).map((p) => `${p.nickname}: ${p.score}`) : null,
            lies: Object.fromEntries(phones.map((p) => [p.name, p.lies.map((q) => q + 1)])),
            picks: Object.fromEntries(phones.map((p) => [p.name, p.picks.map((q) => q + 1)])),
            screens: Object.fromEntries(phones.map((p) => [p.name, p.screens.join(' > ')])),
            problems,
        };
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
