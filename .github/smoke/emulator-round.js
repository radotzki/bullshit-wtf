#!/usr/bin/env node
// Local run: a chat group's round (the daily puzzle's group mode) on the built site (game/dist) in
// headless Chromium, against the Firebase emulators, with the harness of emulator-daily.js.
//
// In each language, one game at a time: Dana (in the group half of the 50/50 test) plays today's
// question and starts a round with a lie; Yossi opens the link, falls for Dana's lie, adds his own
// and tells the group; Noa finds the truth; Dad falls for a house lie. Dana comes back and sees
// what is new. "Not OK" from two browsers takes a lie down; another group gets a round of its own;
// a late opener plays yesterday's round after midnight; a browser that played today's elsewhere
// can only add a lie. And what must not happen: a full round takes nobody new, a round that is over
// shows its final board read-only, one past nine days is erased and shows nothing, a missing round
// falls back to today's question, the other half of the test keeps the puzzle as built, and a
// play-test's round (?via=test) writes no tally and no row.
//
// Needs Java and functions/ built. From the repository root, with the root's npm ci done:
//   node .github/smoke/emulator-round.js [path to dist]
// SHOTS=<dir> saves screenshots (390 and 320 px wide). VERBOSE=1 logs requests and console lines.
// Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { serve, fileIn, HOST } = require('./smoke');
const h = require('./emulator-daily');

const { ROOT, FUNCTIONS, TODAY, YESTERDAY, WORDS, strings, fill, log, addDays, db, shareRows, shot, fits320, raw, answers, waMessage, open, waitFor, check, problems, checks } = h;
const args = process.argv.slice(2);
const DIST = path.resolve(args.filter((a) => !a.startsWith('--'))[0] || path.join(ROOT, 'game', 'dist'));
const SHOTS = process.env.SHOTS || '';

// The browser ids decide the half of the 50/50 test: a to r is the group half.
const GROUP = (c) => (c + 'groupbrowser0000').slice(0, 16);
const PUZZLE_HALF = (c) => ('s' + c + 'plainbrowser000').slice(0, 16);

const MORE = {
    en: { yossi: 'whistling', noa: 'Noa', dad: 'Dad', yossiName: 'Yossi', other: 'humming', late: 'falling off', elsewhere: 'clapping' },
    he: { yossi: 'לשרוק', noa: 'נועה', dad: 'אבא', yossiName: 'יוסי', other: 'לזמזם', late: 'ליפול', elsewhere: 'למחוא כפיים' },
};

function visitor(browser, base, name, id, options) {
    return h.newVisitor(browser, base, name, Object.assign({ id }, options));
}

const roundOf = (lang, day, g) => db('GET', `qHistory/daily/${lang}/${day}/rounds/${g}`);
const rowsOf = (g) => shareRows().filter((r) => r.crew_id === g);
// textContent: the board shows lies in capitals by its style, but holds them as typed.
const boardRows = (page) => page.locator('.board .row').evaluateAll((rows) => rows.map((r) => r.textContent.replace(/\s+/g, ' ').trim()));
const idOf = (url) => (/[?&]g=([a-z0-9]{10})/.exec(url) || [])[1];

/** Starts a round straight on the function, as a page would: for days and states a browser can't reach. */
async function startByHand(lang, no, g, uid, name, lie, src) {
    const res = await fetch(`${FUNCTIONS}/daily`, {
        method: 'POST', headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ a: 'start', lang, no, g, uid, src: src || '', n: name, l: lie, m: 'round-start' }),
    });
    return res.json();
}

async function run(browser, base, lang) {
    const s = strings[lang];
    const w = WORDS[lang];
    const m = MORE[lang];
    const q = w.today;
    const P = base + s.path;
    const L = lang;
    const day = `qHistory/daily/${lang}/${TODAY}`;
    const others = [];
    log(`--- ${lang}: a chat group's round`);

    // Rounds of past days, put in before this language opens any round: the first round opened in a
    // day erases those past keeping.
    const old = (n) => addDays(TODAY, -n);
    const roundAt = (uid, name, lie) => ({ at: Date.now(), by: uid, names: { [uid]: name }, lies: { [uid]: { id: 'abc123', l: lie, at: Date.now(), seen: 2 } },
        picks: { [uid]: { k: 't', at: Date.now() }, ['x'.repeat(16)]: { k: 'abc123', at: Date.now() } } });
    await db('PUT', `qHistory/daily/${lang}/${old(3)}/rounds/overround0`, roundAt(GROUP('g'), w.name, m.late));
    await db('PUT', `qHistory/daily/${lang}/${old(9)}/rounds/goneround0`, roundAt(GROUP('g'), w.name, m.late));
    await db('PUT', `qHistory/daily/${lang}/${old(12)}/rounds/oldround00`, roundAt(GROUP('g'), w.name, m.late));

    // 0. The other half of the test keeps the puzzle as built.
    const plain = await visitor(browser, base, `${L} puzzle half`, PUZZLE_HALF('0'));
    others.push(plain);
    await open(plain, `${P}?via=daily-home`);
    await h.pickAnswer(plain, q.realAnswer);
    check(`${L}: the puzzle half keeps its two send buttons and lie card`, (await plain.page.locator('.card.fool').count()) === 1
        && (await plain.page.locator('.card.round-start').count()) === 0 && (await plain.page.locator('#d-reveal > .send').count()) === 1);

    // 1. Dana starts: the group card in place of the puzzle's.
    const dana = await visitor(browser, base, `${L} Dana`, GROUP('a'));
    others.push(dana);
    await open(dana, `${P}?via=daily-home`);
    const houseLie = (await answers(dana.page)).find((t) => q.fakeAnswers.includes(t));
    await h.pickAnswer(dana, houseLie);
    const card = dana.page.locator('.card.round-start');
    check(`${L}: the group half gets one card`, (await card.count()) === 1 && (await dana.page.locator('.card.fool').count()) === 0
        && (await dana.page.locator('#d-reveal > .send').count()) === 0);
    check(`${L}: the card's words`, (await raw(dana.page, '.card.round-start h2')) === s.roundTitle && (await raw(dana.page, '.card.round-start .send a.btn')) === s.roundSend);
    await shot(dana.page, `${L}-r1-starter-card`);
    await shot(dana.page, `${L}-r1-starter-card`, 320);
    await fits320(dana.page, `${L}: the starter's card`);
    const tryStart = async (lie, name) => {
        await card.locator('#d-lie').fill(lie);
        await card.locator('#d-name').fill(name);
        await card.locator('.send a.btn').click();
        return (await card.locator('.error').isVisible()) ? raw(dana.page, '.card.round-start .error') : '';
    };
    check(`${L}: the truth is no lie here either`, (await tryStart(q.realAnswer, w.name)) === s.lieIsTruth);
    check(`${L}: a lie needs a name`, (await tryStart(w.lie, '')) === s.nameNeeded);
    check(`${L}: a good lie and a name pass`, (await tryStart(w.lie, w.name)) === '');
    const msg1 = await waMessage(card.locator('.send a.btn'));
    const lines1 = msg1.split('\n');
    const g = idOf(lines1[3] || '');
    const link = `${P}?n=2&g=${g}`;
    check(`${L}: message 1`, lines1.length === 4 && lines1[0] === fill(s.startLie, { noTag: ' #2' }) && lines1[1] === `"${q.questionText.replace('$blank$', '____')}"`
        && lines1[2] === s.startAskLie && lines1[3] === link, msg1);
    check(`${L}: message 1 names no answer`, ![q.realAnswer].concat(q.fakeAnswers, [w.lie]).some((t) => msg1.includes(t)), msg1);
    const saved = await waitFor(`${L}: the round is saved`, () => roundOf(lang, TODAY, g), (r) => r && r.lies && Object.values(r.lies)[0].l === w.lie);
    check(`${L}: the starter is in, under her name, with her pick`, saved && Object.values(saved.names || {})[0] === w.name && Object.values(saved.picks)[0].k === 'h' && !saved.test, saved);
    await dana.page.locator('.card.round-start .see-board a').waitFor({ timeout: 8000 });
    check(`${L}: the card then links to the board`, (await raw(dana.page, '.see-board a')) === s.roundSeeBoard);
    await waitFor(`${L}: a round-start row, with the round in crew_id`, async () => rowsOf(g), (rows) => rows.some((r) => r.method === 'round-start' && r.content_type === 'daily-home' && r.locale === lang));
    await shot(dana.page, `${L}-r2-starter-sent`);

    // 2. Yossi opens the link: Dana's lie is among the answers, and he falls for it.
    const yossi = await visitor(browser, base, `${L} Yossi`, GROUP('b'));
    others.push(yossi);
    await open(yossi, link);
    check(`${L}: one liar under the kicker`, (await raw(yossi.page, '#d-how')) === fill(s.liarsOne, { name: w.name }), await raw(yossi.page, '#d-how'));
    const yAnswers = await answers(yossi.page);
    check(`${L}: four answers: the truth, Dana's lie and two of the house's`, yAnswers.length === 4 && yAnswers.includes(q.realAnswer) && yAnswers.includes(w.lie)
        && yAnswers.filter((t) => q.fakeAnswers.includes(t)).length === 2, yAnswers);
    await shot(yossi.page, `${L}-r3-friend-question`);
    await shot(yossi.page, `${L}-r3-friend-question`, 320);
    await fits320(yossi.page, `${L}: the round's question`);
    await yossi.page.reload();
    await yossi.page.locator('#d-answers .answer').first().waitFor();
    check(`${L}: the deal is kept on a reload`, (await answers(yossi.page)).join('|') === yAnswers.join('|'));
    await yossi.page.locator('#d-answers .answer').filter({ hasText: w.lie }).first().click();
    await yossi.page.locator('#d-reveal h2.head').waitFor({ timeout: 10000 });
    check(`${L}: the headline names who fooled him`, (await raw(yossi.page, '#d-reveal h2.head')) === fill(s.headFriendNamed, { name: w.name }));
    check(`${L}: the board after one friend`, (await raw(yossi.page, '.board-title')) === fill(s.boardTitle, { n: 2 }), await raw(yossi.page, '.board-title'));
    const yRows = await boardRows(yossi.page);
    check(`${L}: Dana's lie row says who fell for it`, yRows[0].includes(w.name) && yRows[0].includes(fill(s.boardFell, { names: '' }).trim()) && yRows.some((r) => r.includes(s.boardTruth)), yRows);
    check(`${L}: the erase line`, (await raw(yossi.page, '.erased')) === s.erased);
    await waitFor(`${L}: his pick adds to the day's friend tally`, () => db('GET', `${day}/picks`), (p) => p && p.f === 1);
    const lieCard = yossi.page.locator('.card.round-lie');
    await lieCard.locator('#d-name').fill(m.yossiName);
    await lieCard.locator('#d-lie').fill(m.yossi);
    await lieCard.locator('.send a.btn').click();
    const msg2 = await waMessage(lieCard.locator('.send a.btn'));
    check(`${L}: message 2, fell for a friend's lie and hid one`, msg2 === [fill(s.tellFriend, { name: w.name }), fill(s.tellAdded, { n: 2 }), fill(s.tellTurn, { link })].join(' '), msg2);
    await yossi.page.locator('.send.score').waitFor({ timeout: 8000 });
    const yBoard = await boardRows(yossi.page);
    check(`${L}: his lie is on the board, marked his`, yBoard.some((r) => r.includes(m.yossi)) && (await yossi.page.locator('.row.lie.mine').count()) === 1, yBoard);
    await waitFor(`${L}: rows for his pick, his lie and his message`, async () => rowsOf(g), (rows) => ['friend', 'round-lie', 'round-tell-whatsapp'].every((x) => rows.some((r) => r.method === x && r.content_type === 'daily-round')));
    await shot(yossi.page, `${L}-r4-friend-board`);
    await shot(yossi.page, `${L}-r4-friend-board`, 320);
    await fits320(yossi.page, `${L}: the board`);

    // 3. Noa finds the truth and gives her name, no lie.
    const noa = await visitor(browser, base, `${L} Noa`, GROUP('c'));
    others.push(noa);
    await open(noa, link);
    check(`${L}: two liars under the kicker`, (await raw(noa.page, '#d-how')) === fill(s.liarsTwo, { a: w.name, b: m.yossiName }), await raw(noa.page, '#d-how'));
    const nAnswers = await answers(noa.page);
    check(`${L}: the truth, both lies and one of the house's`, nAnswers.length === 4 && nAnswers.includes(w.lie) && nAnswers.includes(m.yossi), nAnswers);
    await noa.page.locator('#d-answers .answer').filter({ hasText: new RegExp(`^${q.realAnswer}$`) }).first().click();
    await noa.page.locator('#d-reveal h2.head').waitFor({ timeout: 10000 });
    check(`${L}: she spotted the truth`, (await raw(noa.page, '#d-reveal h2.head')) === s.headTruth);
    await noa.page.locator('.card.round-lie #d-name').fill(m.noa);
    await noa.page.locator('.card.round-lie .send a.btn').click();
    const msg3 = await waMessage(noa.page.locator('.card.round-lie .send a.btn'));
    check(`${L}: message 2, found the truth among two lies`, msg3 === [fill(s.tellTruthMany, { n: 2 }), fill(s.tellTurn, { link })].join(' '), msg3);
    await waitFor(`${L}: her name is on the truth's row`, () => boardRows(noa.page), (rows) => rows.some((r) => r.includes(s.boardTruth) && r.includes(m.noa)));

    // 4. Dad falls for a house lie: three played, the live game card shows.
    const dad = await visitor(browser, base, `${L} Dad`, GROUP('d'));
    others.push(dad);
    await open(dad, link);
    const dadHouse = (await answers(dad.page)).find((t) => q.fakeAnswers.includes(t));
    await dad.page.locator('#d-answers .answer').filter({ hasText: new RegExp(`^${dadHouse}$`) }).first().click();
    await dad.page.locator('#d-reveal h2.head').waitFor({ timeout: 10000 });
    check(`${L}: Dad fell for a house lie`, (await raw(dad.page, '#d-reveal h2.head')) === s.headLie);
    await dad.page.locator('.card.round-lie #d-name').fill(m.dad);
    await dad.page.locator('.card.round-lie .send a.btn').click();
    await waitFor(`${L}: the house row names him`, () => boardRows(dad.page), (rows) => rows.some((r) => r.includes(fill(s.boardHouse, { names: '' }).trim()) && r.includes(m.dad)));
    const live = dad.page.locator('.card.game a.btn');
    check(`${L}: from three players, the live game card, tagged daily-round`, (await live.count()) === 1
        && (await live.getAttribute('href')) === `/create-game?via=daily-round${lang === 'he' ? '&lang=he' : ''}`, (await live.count()) ? await live.getAttribute('href') : 'no card');
    await shot(dad.page, `${L}-r5-four-played`);

    // 5. Dana comes back: what is new, and the score.
    await open(dana, link);
    const back = await raw(dana.page, '#d-note');
    check(`${L}: Dana sees what is new since she sent it`, back === `${s.backHead} ${fill(s.backFell, { who: m.yossiName })} ${s.backLie}`, back);
    await dana.page.locator('.send.score a.btn').click();
    const score = await waMessage(dana.page.locator('.send.score a.btn'));
    check(`${L}: message 3, the score`, score === `${fill(s.scoreHead, { noTag: ' #2' })}${s.scoreMineLead.replace('{x}', 1).replace('{y}', 4)}${s.scoreAsk} ${link}`, score);
    await waitFor(`${L}: a round-back row`, async () => rowsOf(g), (rows) => rows.some((r) => r.method === 'round-back'));
    await shot(dana.page, `${L}-r6-starter-back`);
    await dana.page.goto(`${P}?via=daily-home`);
    await dana.page.locator('#d-reveal h2.head').waitFor({ timeout: 10000 });
    check(`${L}: the puzzle page still shows her own play`, (await raw(dana.page, '#d-reveal h2.head')) === s.headLie);
    await yossi.page.goto(P);
    await yossi.page.waitForURL(new RegExp(`g=${g}`), { timeout: 10000 });
    await yossi.page.locator('.board').waitFor({ timeout: 10000 });
    check(`${L}: a friend who played in the round opens today's page on the round`, true);
    await open(dana, link);
    check(`${L}: nothing new on the next look`, (await raw(dana.page, '#d-note')) === s.backNone, await raw(dana.page, '#d-note'));

    // 6. "Not OK" from two browsers takes Yossi's lie down.
    const yRow = (page) => page.locator('.row.lie').filter({ hasText: m.yossi });
    await open(dad, link);
    await yRow(dad.page).locator('button.link').click();
    await waitFor(`${L}: one tap says thanks`, () => raw(dad.page, '.row.lie:has-text("' + m.yossi + '") .lie-action'), (t) => t === s.flagged);
    check(`${L}: one tap keeps the lie up`, (await roundOf(lang, TODAY, g)).lies && !Object.values((await roundOf(lang, TODAY, g)).lies).some((l) => l.hidden));
    await open(noa, link);
    await yRow(noa.page).locator('button.link').click();
    await waitFor(`${L}: two taps take it down`, () => roundOf(lang, TODAY, g), (r) => Object.values(r.lies).some((l) => l.l === m.yossi && l.hidden));
    await open(dad, link);
    check(`${L}: the lie is gone from the board`, !(await boardRows(dad.page)).some((r) => r.includes(m.yossi)));
    await waitFor(`${L}: round-flag rows`, async () => rowsOf(g), (rows) => rows.filter((r) => r.method === 'round-flag').length === 2);
    check(`${L}: the writer can't flag their own, only remove it`, (await (async () => { await open(dana, link); return raw(dana.page, '.row.lie.mine button.link'); })()) === s.remove);

    // 7. Another group: a new round, with Dana's own lie as its first.
    await dana.page.locator('.other-group a').click();
    const otherMsg = await waMessage(dana.page.locator('.other-group a'));
    const g2 = idOf(otherMsg);
    check(`${L}: another group gets a round of its own`, !!g2 && g2 !== g && otherMsg.split('\n')[0] === fill(s.startLie, { noTag: ' #2' }), otherMsg);
    await waitFor(`${L}: with her lie as its first`, () => roundOf(lang, TODAY, g2), (r) => r && Object.values(r.lies || {}).some((l) => l.l === w.lie));
    await waitFor(`${L}: a round-other row`, async () => rowsOf(g2), (rows) => rows.some((r) => r.method === 'round-other'));

    // 8. Played today's elsewhere: no pick, a lie only.
    await open(plain, link);
    check(`${L}: played elsewhere: no answers, a lie card`, (await raw(plain.page, '#d-note')) === s.playedElsewhere && (await plain.page.locator('#d-answers .answer:visible').count()) === 0
        && (await plain.page.locator('.card.round-lie').count()) === 1);
    await plain.page.locator('.card.round-lie #d-name').fill('Avi');
    await plain.page.locator('.card.round-lie #d-lie').fill(m.elsewhere);
    await plain.page.locator('.card.round-lie .send a.btn').click();
    const elseMsg = await waMessage(plain.page.locator('.card.round-lie .send a.btn'));
    check(`${L}: their message has no pick in it`, elseMsg === [fill(s.tellAdded, { n: 2 }), fill(s.tellTurn, { link })].join(' '), elseMsg);
    await plain.page.locator('.board').waitFor({ timeout: 8000 });
    check(`${L}: then they see the board`, (await boardRows(plain.page)).some((r) => r.includes(m.elsewhere)));
    await shot(plain.page, `${L}-r7-played-elsewhere`);

    // 9. A late opener, after midnight: yesterday's round still plays, on yesterday's question.
    const gLate = lang === 'en' ? 'lateround1' : 'lateround2';
    const started = await startByHand(lang, 1, gLate, GROUP('e').replace('group', 'later'), w.name, m.late, 'daily-home');
    check(`${L}: a round started yesterday`, started.ok === true, started);
    const late = await visitor(browser, base, `${L} late`, GROUP('f'));
    others.push(late);
    await open(late, `${P}?n=1&g=${gLate}`);
    check(`${L}: the late opener gets yesterday's question, numbered`, (await raw(late.page, '#d-kicker')) === fill(s.kicker, { dot: fill(s.kickerDot, { no: 1 }) })
        && (await raw(late.page, '#d-q')) === w.yesterday.questionText.replace('$blank$', '____'), await raw(late.page, '#d-q'));
    await late.page.locator('#d-answers .answer').filter({ hasText: new RegExp(`^${w.yesterday.realAnswer}$`) }).first().click();
    await late.page.locator('#d-reveal h2.head').waitFor({ timeout: 10000 });
    check(`${L}: and plays it`, (await raw(late.page, '#d-reveal h2.head')) === s.headTruth);
    await waitFor(`${L}: the pick counts for yesterday's question`, () => db('GET', `qHistory/daily/${lang}/${YESTERDAY}/picks`), (p) => p && (p[0] || p['0']) >= 1);
    await shot(late.page, `${L}-r8-late-opener`);

    // 10. A round that is over, one that is erased (seeded at the start), a full one, a missing one.
    const full = { at: Date.now(), by: GROUP('h'), picks: {} };
    for (let i = 0; i < 30; i++) full.picks[String(i).padStart(16, 'p')] = { k: 's', at: Date.now() };
    await db('PUT', `${day}/rounds/fullround0`, full);
    const misc = await visitor(browser, base, `${L} misc`, GROUP('i'));
    others.push(misc);
    await open(misc, `${P}?n=-1&g=overround0`);
    check(`${L}: an over round shows its final board, read-only`, (await raw(misc.page, '#d-note')) === s.over + fill(s.overWon, { name: w.name, x: 1, y: 2 })
        && (await misc.page.locator('.board').count()) === 1 && (await misc.page.locator('.card.round-lie').count()) === 0
        && (await raw(misc.page, 'a.play-today')) === s.playToday, await raw(misc.page, '#d-note'));
    await shot(misc.page, `${L}-r9-over`);
    await open(misc, `${P}?n=-7&g=goneround0`);
    check(`${L}: past nine days: "over" and today's question, nothing of the round`, (await raw(misc.page, '#d-note')) === s.over && (await answers(misc.page)).includes(q.realAnswer)
        && !(await misc.page.locator('main').innerText()).includes(m.late));
    await waitFor(`${L}: rounds past keeping are erased`, () => db('GET', `qHistory/daily/${lang}/${old(12)}/rounds`), (r) => r === null);
    check(`${L}: rounds still kept are not`, (await db('GET', `qHistory/daily/${lang}/${old(3)}/rounds/overround0`)) !== null);
    await open(misc, `${P}?n=2&g=fullround0`);
    check(`${L}: a full round takes nobody new`, (await raw(misc.page, '#d-note')) === s.roundFull && (await answers(misc.page)).length === 4);
    await open(misc, `${P}?n=2&g=nosuchrnd0`);
    check(`${L}: a missing round falls back to today's question`, (await raw(misc.page, '#d-note')) === s.roundMissing && (await answers(misc.page)).length === 4);
    await shot(misc.page, `${L}-r10-missing`);

    // 11. A play-test: its round is a test round, its link keeps the tag, and nothing is counted.
    const picksBefore = await db('GET', `${day}/picks`);
    const rowsBefore = shareRows().length;
    const tester = await visitor(browser, base, `${L} tester`, PUZZLE_HALF('1'));
    others.push(tester);
    await open(tester, `${P}?via=test&round=on`);
    await h.pickAnswer(tester, q.realAnswer);
    await tester.page.locator('.card.round-start #d-name').fill('Tester');
    await tester.page.locator('.card.round-start #d-lie').fill(m.other);
    await tester.page.locator('.card.round-start .send a.btn').click();
    const testMsg = await waMessage(tester.page.locator('.card.round-start .send a.btn'));
    const gt = idOf(testMsg);
    check(`${L}: a play-test's round link keeps its tag`, testMsg.endsWith(`${P}?n=2&g=${gt}&via=test`), testMsg);
    await waitFor(`${L}: the play-test's round is a test round`, () => roundOf(lang, TODAY, gt), (r) => r && r.test === true);
    const friend = await visitor(browser, base, `${L} test friend`, GROUP('j'));
    others.push(friend);
    await open(friend, `${P}?n=2&g=${gt}&via=test`);
    await friend.page.locator('#d-answers .answer').filter({ hasText: m.other }).first().click();
    await friend.page.locator('#d-reveal h2.head').waitFor({ timeout: 10000 });
    await friend.page.locator('.card.round-lie #d-name').fill('Friend');
    await friend.page.locator('.card.round-lie .send a.btn').click();
    await h.sleep(1500);
    check(`${L}: a test round changes no tally`, JSON.stringify(await db('GET', `${day}/picks`)) === JSON.stringify(picksBefore), await db('GET', `${day}/picks`));
    check(`${L}: and writes no row`, rowsOf(gt).length === 0 && shareRows().length === rowsBefore, shareRows().slice(rowsBefore));

    for (const v of others) await v.context.close();
}

async function main() {
    if (!fileIn(DIST, '/daily.html')) throw new Error(`No daily page in ${DIST} (run npm run build in game/ first)`);
    if (!fs.existsSync(path.join(ROOT, 'functions', 'dist', 'index.js'))) throw new Error('Build functions/ first: npm run build there');
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const emulators = await h.startEmulators();
    let browser;
    let server;
    try {
        await h.seed();
        server = await serve(DIST);
        const base = `http://${HOST}:${server.address().port}`;
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`] });
        await run(browser, base, 'en');
        await run(browser, base, 'he');
        const summary = { build: DIST, day: TODAY, checks: checks.length, problems };
        console.log('\nRESULT ' + JSON.stringify(summary, null, 2));
        console.log(problems.length ? 'FAIL' : 'PASS');
        process.exitCode = problems.length ? 1 : 0;
    } finally {
        if (browser) await browser.close();
        if (server) server.close();
        h.stopEmulators(emulators);
    }
}

main().catch((e) => {
    console.error('FAIL', e.stack || e);
    process.exit(1);
});
