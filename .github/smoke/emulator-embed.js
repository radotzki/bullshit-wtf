#!/usr/bin/env node
// Local run: the daily puzzle's embed (/embed/daily, /he/embed/daily) inside a plain page of another
// site, in headless Chromium at phone widths, against the Firebase emulators, in both languages.
//
// A page on "school.example.org" (served by this script) holds the line of code the copy page hands
// out, pointed at the built site. In each language and at 320 and 390 px: the embed shows today's
// question from the `daily` function, the answer is not in the embed's own HTML, nothing scrolls
// sideways, a pick shows the reveal, and PLAY THIS WITH FRIENDS opens the game in a new tab with
// ?via=embed-school-example-org; the game made there carries that tag. The host page never moves.
// The rows the function writes to `shares` carry the tag (a post-via row for the open), a ?via=test
// embed writes none, and the copy page (/daily-on-your-site) previews the embed as embed-preview and
// copies its line.
//
// Built on emulator-daily.js (the same emulators, question file and browsers). Nothing reaches
// production. Needs Java and functions/ built. From the repository root, with the root's npm ci done:
//   node .github/smoke/emulator-embed.js [path to dist]
// SHOTS=<dir> saves screenshots. Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve, fileIn, HOST } = require('./smoke');
const d = require('./emulator-daily');

const DIST = path.resolve(process.argv[2] || path.join(d.ROOT, 'game', 'dist'));
const SHOTS = process.env.SHOTS || '';
const embed = require(path.join(d.ROOT, 'game', 'seo', 'embed-page.js'));
const SITE = 'school.example.org';
const TAG = 'embed-school-example-org';
const { check, log, db } = d;

/** The other site's page: a heading, a paragraph and the line of code, as a teacher would paste it. */
function hostPage(lang, base, via) {
    let line = embed.snippet(lang, base);
    if (via) line = line.replace(embed.words[lang].embedPath + '"', `${embed.words[lang].embedPath}?via=${via}"`);
    return `<!doctype html><html lang="${lang}" dir="${lang === 'he' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Class 7B</title>
<style>body { margin: 0; padding: 12px; font: 16px/1.4 Georgia, serif; background: #eef3f8; } h1 { font-size: 20px; margin: 0 0 8px; }</style>
</head><body><h1>${lang === 'he' ? 'כיתה ז׳2: השאלה של היום' : 'Class 7B: today\'s puzzle'}</h1>
<p>${lang === 'he' ? 'מי מוצא את האמת?' : 'Who can spot the truth?'}</p>
${line}
<p id="after">${lang === 'he' ? 'שיעורי בית: עמוד 12.' : 'Homework: page 12.'}</p>
</body></html>`;
}

/** A visitor whose browser opens the other site's page; the embed's /_daily goes to the emulators. */
async function newReader(browser, base, name, width, lang, via) {
    const v = await d.newVisitor(browser, base, name, { width });
    v.context.removeAllListeners('page');
    await v.context.route((url) => url.hostname === SITE, (route) => route.fulfill({
        status: 200, contentType: 'text/html; charset=utf-8', body: hostPage(lang, base, via),
    }));
    return v;
}

async function embedFrame(page, lang) {
    const el = await page.waitForSelector('iframe', { timeout: 15000 });
    const frame = await el.contentFrame();
    // The iframe is lazy: it starts as about:blank, then loads the embed.
    await frame.waitForFunction(() => !!document.getElementById('e-reveal') && (document.querySelectorAll('#e-answers .answer').length > 0
        || !document.getElementById('e-reveal').hasAttribute('hidden') || !document.getElementById('e-error').hasAttribute('hidden')), null, { timeout: 20000 });
    check(`${lang}: the embed is in its language and direction`, (await frame.evaluate(() => document.documentElement.lang + '/' + document.documentElement.dir)) === (lang === 'he' ? 'he/rtl' : 'en/ltr'));
    return { el, frame };
}

async function shot(page, name) {
    if (!SHOTS) return;
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

async function noSideScroll(frame, what) {
    const sizes = await frame.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    check(`${what}: nothing scrolls sideways inside the embed`, sizes[0] <= sizes[1], sizes);
}

async function run(browser, base, lang) {
    const s = d.strings[lang];
    const w = d.WORDS[lang].today;
    const e = embed.words[lang];
    const L = lang;
    log(`--- ${lang}: ${e.embedPath} inside http://${SITE}/`);

    // The embed's own HTML holds no answer: the question comes from /_daily after it loads.
    const source = await (await fetch(base + e.embedPath)).text();
    check(`${L}: the embed's HTML holds none of today's answers`, ![w.realAnswer].concat(w.fakeAnswers).some((a) => source.includes(a)));
    check(`${L}: the embed is noindex`, source.includes('<meta name="robots" content="noindex">'));

    for (const width of [320, 390]) {
        const rowsBefore = d.shareRows().length;
        const v = await newReader(browser, base, `${lang}-${width}`, width, lang);
        await v.page.goto(`http://${SITE}/class-7b`, { waitUntil: 'load' });
        const { el, frame } = await embedFrame(v.page, lang);
        const box = await el.boundingBox();
        check(`${L} ${width}: the iframe fills the column, ${width - 24} px`, Math.abs(box.width - (width - 24)) <= 1, box);
        check(`${L} ${width}: the host page does not scroll sideways`, (await v.page.evaluate(() => document.documentElement.scrollWidth)) <= width);
        await noSideScroll(frame, `${L} ${width} question`);
        const shown = await frame.locator('#e-answers .answer').evaluateAll((l) => l.map((b) => b.textContent));
        check(`${L} ${width}: four answers, the truth among them`, shown.length === 4 && shown.includes(w.realAnswer), shown);
        check(`${L} ${width}: the question is today's`, (await frame.locator('#e-q').innerText()).includes(w.questionText.split('$blank$')[0].trim().slice(0, 20)));
        await shot(v.page, `${lang}-1-question-${width}`);

        // Pick: a lie at 320, the truth at 390.
        const wanted = width === 320 ? shown.find((t) => t !== w.realAnswer) : w.realAnswer;
        await frame.locator('#e-answers .answer').filter({ hasText: wanted }).first().click();
        await frame.locator('#e-reveal h2.head').waitFor({ timeout: 10000 });
        const head = (await frame.locator('#e-reveal h2.head').textContent()).trim();
        check(`${L} ${width}: the reveal says what happened`, head === (wanted === w.realAnswer ? s.headTruth : s.headLie), head);
        if (wanted !== w.realAnswer) {
            check(`${L} ${width}: the reveal names the truth`, (await frame.locator('#e-reveal .sub').textContent()).includes(w.realAnswer));
        }
        check(`${L} ${width}: four bars, the truth marked`, (await frame.locator('#e-reveal .bar').count()) === 4 && (await frame.locator('#e-reveal .bar.truth').count()) === 1);
        await noSideScroll(frame, `${L} ${width} reveal`);
        const scroll = await frame.evaluate(() => [document.documentElement.scrollHeight, window.innerHeight]);
        check(`${L} ${width}: the reveal fits the line's height (${embed.HEIGHT} px) without scrolling`, scroll[0] <= scroll[1], scroll);
        await shot(v.page, `${lang}-2-reveal-${width}`);

        const play = frame.locator('#e-reveal a.play');
        const href = await play.getAttribute('href');
        check(`${L} ${width}: PLAY THIS WITH FRIENDS is the game's create page, tagged with the site`,
            href === `${base}/create-game?via=${TAG}${lang === 'he' ? '&lang=he' : ''}` && (await play.textContent()) === e.play, href);
        check(`${L} ${width}: it opens in a new tab`, (await play.getAttribute('target')) === '_blank');
        check(`${L} ${width}: the puzzle link carries the tag too`, (await frame.locator('#e-reveal a.more').getAttribute('href')) === `${base}${s.path}?via=${TAG}`);

        // The posts: an open and a pick, with the site's tag.
        const posts = v.posts.map((p) => `${p.m}:${p.src}`);
        check(`${L} ${width}: it posted an open and the pick with the site's tag`,
            posts[0] === `open:${TAG}` && posts[1] === `${wanted === w.realAnswer ? 'truth' : 'house'}:${TAG}`, posts);

        if (width === 390) {
            // The game in a new tab, which carries the tag; the host page stays where it was.
            const popup = v.context.waitForEvent('page');
            await play.click();
            const tab = await popup;
            tab.on('pageerror', (err) => d.problems.push(`${lang} game tab: ${err.message}`));
            const game = await d.createGame({ page: tab });
            check(`${L}: the game made from the embed carries the site's tag`, game.campaign === TAG, game.campaign);
            check(`${L}: the host page did not move`, v.page.url() === `http://${SITE}/class-7b`, v.page.url());
            await tab.close();
        }

        // A second look the same day: the embed remembers the pick.
        await v.page.reload({ waitUntil: 'load' });
        const again = await embedFrame(v.page, lang);
        check(`${L} ${width}: a second look shows the reveal, not the question`, (await again.frame.locator('#e-reveal .note').textContent()) === s.played);
        await v.context.close();

        const rows = await d.waitFor(`${L} ${width}: the rows reached shares`, () => d.shareRows().slice(rowsBefore),
            (r) => r.some((x) => x.content_type === 'post-via') && r.some((x) => DAILY_PICKS.includes(x.method)));
        const via = rows.filter((r) => r.content_type === 'post-via');
        check(`${L} ${width}: one post-via row names the site`, via.length === 1 && via[0].method === TAG && via[0].locale === lang, via);
        check(`${L} ${width}: the open and the pick are daily-post rows of the same browser`,
            ['open', wanted === w.realAnswer ? 'truth' : 'house'].every((m) => rows.some((r) => r.content_type === 'daily-post' && r.uid === via[0].uid && r.method === m)), rows);
        if (width === 390) check(`${L}: the press on PLAY was counted`, rows.some((r) => r.method === 'create' && r.content_type === 'daily-post'), rows.map((r) => r.method));
    }

    // A play-test of the embed (?via=test on the iframe's address) writes nothing and tags its game test.
    const before = d.shareRows().length;
    const picksBefore = await db('GET', `qHistory/daily/${lang}/${d.TODAY}/picks`);
    const t = await newReader(browser, base, `${lang}-test`, 390, lang, 'test');
    await t.page.goto(`http://${SITE}/class-7b`, { waitUntil: 'load' });
    const tf = (await embedFrame(t.page, lang)).frame;
    await tf.locator('#e-answers .answer').first().click();
    await tf.locator('#e-reveal h2.head').waitFor({ timeout: 10000 });
    check(`${L}: a play-test's game link is tagged test`, (await tf.locator('#e-reveal a.play').getAttribute('href')).includes('via=test'));
    await d.sleep(2500);
    check(`${L}: a play-test of the embed wrote no row`, d.shareRows().length === before, d.shareRows().slice(before));
    check(`${L}: and changed no tally`, JSON.stringify(await db('GET', `qHistory/daily/${lang}/${d.TODAY}/picks`)) === JSON.stringify(picksBefore));
    await t.context.close();

    // The copy page: its line, the COPY button, and the live preview on the game's own site.
    const c = await d.newVisitor(browser, base, `${lang}-copy`, { width: 390 });
    await c.page.goto(base + e.path, { waitUntil: 'load' });
    const line = await c.page.locator('#e-line').inputValue();
    check(`${L}: the copy page shows the line`, line === embed.snippet(lang), line);
    await c.page.locator('#e-copy').click();
    await d.sleep(300);
    check(`${L}: COPY puts the line on the clipboard`, (await c.page.evaluate(() => navigator.clipboard.readText())) === line);
    const pf = (await embedFrame(c.page, lang)).frame;
    check(`${L}: the preview plays as embed-preview`, c.posts.some((p) => p.m === 'open' && p.src === 'embed-preview'), c.posts);
    check(`${L}: the copy page does not scroll sideways at 390 px`, (await c.page.evaluate(() => document.documentElement.scrollWidth)) <= 390);
    check(`${L}: the preview's answers show`, (await pf.locator('#e-answers .answer').count()) === 4);
    await shot(c.page, `${lang}-3-copy-page-390`);
    await c.context.close();

    // The ways in: the puzzle's page links to the copy page.
    const p = await d.newVisitor(browser, base, `${lang}-daily`, { width: 390 });
    await d.open(p, base + s.path + '?via=test');
    check(`${L}: the daily puzzle links to the copy page`, (await p.page.locator('.embed-link a').getAttribute('href')) === e.path);
    await p.context.close();
}

const DAILY_PICKS = ['truth', 'house', 'friend'];

async function main() {
    if (!fileIn(DIST, '/embed/daily.html')) throw new Error(`No embed in ${DIST} (run npm run build in game/ first)`);
    if (!fs.existsSync(path.join(d.ROOT, 'functions', 'dist', 'index.js'))) throw new Error('Build functions/ first: npm run build there');
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const emulators = await d.startEmulators();
    let browser;
    let server;
    try {
        await d.seed();
        server = await serve(DIST);
        const base = `http://${HOST}:${server.address().port}`;
        // The other site is a made-up public name and the built site is on 127.0.0.1: Chromium's
        // Local Network Access check would block a public page from framing a loopback address,
        // which in production (two public sites) never comes up.
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`, '--disable-features=LocalNetworkAccessChecks'] });
        await run(browser, base, 'en');
        await run(browser, base, 'he');
        const summary = { build: DIST, day: d.TODAY, checks: d.checks.length, problems: d.problems };
        console.log('\nRESULT ' + JSON.stringify(summary, null, 2));
        console.log(d.problems.length ? 'FAIL' : 'PASS');
        process.exitCode = d.problems.length ? 1 : 0;
    } finally {
        if (browser) await browser.close();
        if (server) server.close();
        d.stopEmulators(emulators);
    }
}

main().catch((err) => {
    console.error('FAIL', err.stack || err);
    process.exit(1);
});
