#!/usr/bin/env node
// Local run: INVITE ANOTHER GROUP, the ask half of guests see when a game ends, on the built client
// (game/dist) in headless Chromium against the Firebase emulators, with the phones and the emulators
// of emulator-game.js. A test game (created from a ?via=test link) is played to its final screen by
// a host and three guests; then a guest invites another group, two friends who never played say
// "I'm in", and on the night the guest opens the lobby, hosts, and the table plays its first game.
//
// What it walks through, each step checked on the page and in the database:
//   1. The final screen. The host gets no ask. A guest in the new half gets INVITE ANOTHER GROUP and
//      not today's ask; a guest in the other half gets today's ask and not the new one. Each guest's
//      phone says which it showed (host-invite: seen-new, seen-classic).
//   2. The guest presses INVITE ANOTHER GROUP: the sheet, the coming Friday at 21:00, and a table of
//      one (the guest) made on the server with that night, marked as a test crew. SEND ON WHATSAPP is
//      a plain link by then, with the guest's best lie of the night when it fooled someone.
//   3. CHANGE moves the night; sending stores the new one. ADD TO MY CALENDAR saves a file with the
//      table's link; "Share another way" copies the message. The phone remembers the table.
//   4. Two friends who never played open the link: one line on what the game is, a name, I'M IN.
//   5. "See who's in" takes the guest to the table's page: three names.
//   6. The night comes (the run moves the stored time to an hour from now): the guest presses OPEN
//      THE LOBBY, lands in a lobby as its host, the friends land in the same one, and the guest starts
//      the game. It is the table's game, a test game. Played to the end, it counts for the table and
//      everyone who played is in its standings.
//   7. The other guests: "or start a game right now" and START MY OWN GAME both open Create, each
//      with its own tag.
//   8. Hanukkah: after a Hanukkah game on a candle evening (the phone's clock set to 6 December 2026)
//      a guest in the new half still gets today's ask, and sends no row; after any other game on that
//      evening the new ask shows.
//
// Nothing reaches production (see emulator-game.js); the count rows are caught in the browser and
// never sent on. From the repository root, with functions/ and game/ built:
//   node .github/smoke/emulator-invite-group.js [path to dist] [--locale en|he]
// SHOTS=<dir> saves a screenshot of each step. Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { serve, fileIn } = require('./smoke');
const { ROOT, DIST, LOCALE, HOST, DB, PROJECT, log, sleep, up, startEmulators, stopEmulators, db, seed, newPhone, visible, act } = require('./emulator-game');

const he = LOCALE === 'he';
const NAMES = he
    ? { host: 'דנה', guest: 'נועה', classic: 'אבי', now: 'גיל', f1: 'מאיה', f2: 'עומר' }
    : { host: 'Dana', guest: 'Noa', classic: 'Avi', now: 'Gil', f1: 'Maya', f2: 'Omer' };
const WORDS = he
    ? {
        title: 'יש עוד חבורה שתיפול בזה?', button: 'להזמין חבורה אחרת', now: 'או לפתוח משחק עכשיו', classic: 'לפתוח משחק משלי',
        sheet: 'ערב המשחק שלך', send: 'שליחה בוואטסאפ', calendar: 'הוספה ליומן שלי', other: 'שיתוף בדרך אחרת', set: 'ערב המשחק נקבע:',
        table: `השולחן של ${NAMES.guest}`, fooledOne: 'הערב עבדתי על מישהו בבולשיט עם השקר הזה:', fooled: (n) => `הערב עבדתי על ${n} אנשים בבולשיט עם השקר הזה:`,
        plain: 'מצאתי לנו משחק: בולשיט.', mine: 'משחק אצלי,', whoIn: 'מי בפנים? לוחצים כאן:', whatIsIt: 'בולשיט הוא משחק חברתי בטלפונים',
        gameNight: 'ערב המשחק', youreIn: 'נרשמת. נתראה', openLobby: 'פותחים משחק', hanukkah: 'חנוכה',
    }
    : {
        title: 'Know another group that would fall for this?', button: 'INVITE ANOTHER GROUP', now: 'or start a game right now', classic: 'START MY OWN GAME',
        sheet: 'YOUR GAME NIGHT', send: 'SEND ON WHATSAPP', calendar: 'ADD TO MY CALENDAR', other: 'Share another way', set: 'Game night is set:',
        table: `${NAMES.guest}'s table`, fooledOne: 'Tonight I fooled someone in Bullshit with this lie:', fooled: (n) => `Tonight I fooled ${n} people in Bullshit with this lie:`,
        plain: 'Found us a game: Bullshit.', mine: 'My game,', whoIn: "Who's in? Tap here:", whatIsIt: 'Bullshit is a party game on your phones',
        gameNight: 'GAME NIGHT', youreIn: "You're in. See you", openLobby: 'OPEN THE LOBBY', hanukkah: 'Hanukkah',
    };
const key = (name) => name.trim().toLowerCase();
const pad = (n) => (n < 10 ? '0' : '') + n;
const dateValue = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The coming Friday at 21:00 that is at least two hours away, as the page picks it (defaultNight). */
function comingFriday(now = new Date()) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 21, 0, 0, 0);
    d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7));
    if (d.getTime() - now.getTime() < 2 * 3600 * 1000) d.setDate(d.getDate() + 7);
    return d;
}

async function main() {
    if (!fileIn(DIST, '/index.html')) throw new Error(`No built game at ${DIST}`);
    if (!fs.existsSync(path.join(ROOT, 'functions', 'dist', 'index.js'))) throw new Error('Build functions/ first: npm run build there');
    const emulators = await startEmulators();
    const problems = [];
    const steps = [];
    const check = (ok, what) => {
        steps.push(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
        log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
        if (!ok) problems.push(what);
    };
    let browser;
    let server;
    try {
        if (!(await up(`http://${DB}/.json?ns=${PROJECT}`))) throw new Error('no database emulator on :9000');
        await seed();
        server = await serve(DIST);
        const base = `http://${HOST}:${server.address().port}`;
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`, '--autoplay-policy=no-user-gesture-required'] });
        const lang = he ? '/he' : '';

        const shares = [];
        const phones = [];
        /** A phone whose count rows are caught, and (for a guest) whose half of the test is set. */
        const phone = async (name, role, half, from = browser) => {
            const p = await newPhone(from, base, name, role);
            await p.context.route(/cloudfunctions\.net\/onShare/, (route) => {
                if (route.request().method() === 'POST') {
                    shares.push(Object.assign({ phone: p.name }, route.request().postDataJSON()));
                }
                return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }, body: '{"counted":true}' });
            });
            // WhatsApp and calendar links open a new tab, which goes nowhere here.
            p.context.on('page', (opened) => { if (opened !== p.page) opened.close().catch(() => { }); });
            if (half) {
                await p.context.addInitScript((h) => window.localStorage.setItem('BS_HOST_INVITE', h), half);
            }
            await p.context.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => { });
            phones.push(p);
            return p;
        };
        const host = await phone(NAMES.host, 'host');
        const guest = await phone(NAMES.guest, 'player', 'new');
        const classic = await phone(NAMES.classic, 'player', 'classic');
        const nowGuest = await phone(NAMES.now, 'player', 'new');
        const f1 = await phone(NAMES.f1, 'player');
        const f2 = await phone(NAMES.f2, 'player');

        const text = (p) => p.page.evaluate(() => document.body.innerText).catch(() => '');
        const until = async (what, fn, ms = 20000) => {
            const end = Date.now() + ms;
            let last;
            while (Date.now() < end) {
                last = await fn().catch(() => false);
                if (last) return last;
                await sleep(250);
            }
            check(false, `${what} (waited ${ms / 1000} s)`);
            return null;
        };
        const shot = async (p, name) => {
            if (process.env.SHOTS) await p.page.screenshot({ path: path.join(process.env.SHOTS, `${LOCALE}-${name}.png`), fullPage: true }).catch(() => { });
        };
        const rows = (p, type) => shares.filter((s) => s.phone === p.name && s.content_type === type).map((s) => s.method);

        /** Plays the game on these phones to the final screen. The host of the table picks `bait`'s lie, so it fools someone. */
        const play = async (pin, players, bait, picker) => {
            const game = { pin };
            const end = Date.now() + 8 * 60 * 1000;
            while (Date.now() < end && !players.every((p) => p.done)) {
                if (!game.everyoneIn) {
                    const seats = await db('GET', `games/${pin}/players`);
                    game.everyoneIn = seats && Object.keys(seats).length === players.length && players.every((p) => p.joined);
                }
                // One phone always picks the bait's lie, so that lie has fooled someone by the end.
                if (bait && /\/show-answers\//.test(picker.page.url())) {
                    const q = await db('GET', `games/${pin}/questionIndex`);
                    const mine = picker.page.locator('button.answer:not([disabled])', { hasText: new RegExp(`${bait.name} lie ${q}`, 'i') });
                    if (picker.picks[picker.picks.length - 1] !== q && await visible(mine)) {
                        await mine.first().click().catch(() => { });
                        picker.picks.push(q);
                    }
                }
                await Promise.all(players.filter((p) => !p.done).map((p) => act(p, game).catch(() => { })));
                await sleep(400);
            }
            players.forEach((p) => { if (!p.done) check(false, `${p.name} never reached the final screen of ${pin}`); });
        };

        // The host opens the site from a test link and creates the game in that tab: a test game.
        await host.page.goto(`${base}/create-game?via=test`);
        await host.page.locator('input[name="locale"]').nth(he ? 1 : 0).check();
        await host.page.locator('input[name="length"]').first().check();
        await host.page.locator('form button[type="submit"]').first().click();
        await host.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
        const pin = new URL(host.page.url()).pathname.split('/').pop().toUpperCase();
        check((await db('GET', `games/${pin}/campaign`)) === 'test', `the game ${pin} is a test game, in ${LOCALE}`);
        for (const p of [guest, classic, nowGuest]) await p.page.goto(`${base}${lang}/join-game/${pin}`);
        const first = [host, guest, classic, nowGuest];
        await play(pin, first, guest, host);

        // 1. The final screen: who gets which ask.
        await until('the new half shows INVITE ANOTHER GROUP', () => visible(guest.page.locator('.invite-ask')));
        await until('the other half shows today\'s ask', () => visible(classic.page.locator('.host-ask')));
        let t = await text(guest);
        check(t.includes(WORDS.title) && t.includes(WORDS.button) && t.includes(WORDS.now), `the new ask reads "${WORDS.title}", "${WORDS.button}", "${WORDS.now}"`);
        check(!(await visible(guest.page.locator('.host-ask'))), 'the new half does not also get today\'s ask');
        check(!(await visible(classic.page.locator('.invite-ask'))) && (await text(classic)).includes(WORDS.classic), `the other half keeps "${WORDS.classic}" and gets no new ask`);
        await sleep(1500);
        check(!(await visible(host.page.locator('.invite-ask'))) && !(await visible(host.page.locator('.host-ask'))), 'the host gets no ask');
        await until('each guest\'s phone says which ask it showed', async () => rows(guest, 'host-invite').includes('seen-new') && rows(classic, 'host-invite').includes('seen-classic') && rows(nowGuest, 'host-invite').includes('seen-new'));
        check(rows(guest, 'host-invite').filter((m) => m.startsWith('seen')).join() === 'seen-new' && rows(classic, 'host-invite').join() === 'seen-classic',
            `one row per guest: ${NAMES.guest} ${rows(guest, 'host-invite')}, ${NAMES.classic} ${rows(classic, 'host-invite')}`);
        check(rows(host, 'host-invite').length === 0, 'the host\'s phone sends no row');
        await shot(guest, '1-new-ask');
        await shot(classic, '1-classic-ask');

        // 2. INVITE ANOTHER GROUP: the sheet, and the table made on the server.
        const friday = comingFriday();
        await guest.page.locator('button.invite-open').click();
        await until('the sheet opens', () => visible(guest.page.locator('.invite-sheet')));
        const href = await until('SEND ON WHATSAPP is a link once the table is made', () => guest.page.locator('a.invite-whatsapp').getAttribute('href'));
        const said = decodeURIComponent(href || '').replace('https://wa.me/?text=', '');
        const tableId = (/\/c\/([a-z0-9]+)\?via=table/.exec(said) || [])[1];
        check(!!tableId && said.includes(`https://bullshit.wtf${lang}/c/${tableId}?via=table`), `the message carries the table's link, tagged table: ${said.split('\n').pop()}`);
        let crew = await db('GET', `crews/${tableId}`);
        check(!!crew && crew.name === WORDS.table && crew.locale === LOCALE, `the table is "${WORDS.table}", in ${LOCALE}: ${crew && crew.name}`);
        check(!!crew && Object.keys(crew.members || {}).join() === key(NAMES.guest) && !crew.gameCount && !crew.games, 'it has one member, the guest, and no game');
        check(!!crew && crew.campaign === 'table' && crew.test === 'test', 'it is marked table, and as a test crew (it came from a test game)');
        check(!!crew && crew.night && crew.night.time === friday.getTime() && crew.night.by === NAMES.guest && crew.night.in[key(NAMES.guest)] === NAMES.guest,
            `its night is the coming Friday at 21:00, with the guest in: ${crew && JSON.stringify(crew.night)}`);
        t = await text(guest);
        check(t.includes(WORDS.sheet) && t.includes(WORDS.send) && t.includes(WORDS.calendar) && t.includes(WORDS.other), `the sheet reads "${WORDS.sheet}", "${WORDS.send}", "${WORDS.calendar}", "${WORDS.other}"`);
        // The bait: the guest's best lie, as the game's highlights have it.
        const seats = await db('GET', `games/${pin}/players`);
        const guestPid = Object.keys(seats).find((k) => seats[k].nickname === NAMES.guest);
        const best = (await db('GET', `games/${pin}/highlights/${guestPid}`)) || {};
        check(best.fooled >= 1 && !!best.text, `the guest's best lie fooled ${best.fooled}: "${best.text}"`);
        const opening = best.fooled === 1 ? WORDS.fooledOne : WORDS.fooled(best.fooled);
        check(said.startsWith(`${opening} "${best.text}".`) && said.includes(WORDS.mine) && said.includes(WORDS.whoIn) && !said.includes(WORDS.plain),
            `the message opens with the lie and ends with the ask: ${said.split('\n')[0]}`);
        check(rows(guest, 'host-invite').includes('open'), 'the press is counted: open');
        await shot(guest, '2-sheet');

        // 3. CHANGE the night, send, save to the calendar, share another way.
        const saturday = new Date(friday.getTime() + 24 * 3600 * 1000);
        await guest.page.locator('button.change').click();
        await guest.page.locator('input[name="inviteDate"]').fill(dateValue(saturday));
        await guest.page.locator('input[name="inviteTime"]').fill('20:30');
        saturday.setHours(20, 30, 0, 0);
        await sleep(300);
        const moved = decodeURIComponent(await guest.page.locator('a.invite-whatsapp').getAttribute('href'));
        check(moved !== said && moved.includes('20:30') && moved.includes(`/c/${tableId}?via=table`), `the message follows the new night, same table: ${moved.split('\n')[0].slice(-70)}`);
        await guest.page.locator('a.invite-whatsapp').click();
        await until('sending stores the new night on the table', async () => (await db('GET', `crews/${tableId}/night/time`)) === saturday.getTime());
        const night = await db('GET', `crews/${tableId}/night`);
        check(night.by === NAMES.guest && Object.keys(night.in).join() === key(NAMES.guest), 'the guest is in for the new night');
        await until('the sheet says the night is set', async () => (await text(guest)).includes(WORDS.set));
        const download = guest.page.waitForEvent('download', { timeout: 15000 }).catch(() => null);
        await guest.page.locator('button.invite-calendar').click();
        const file = await download;
        const ics = file ? fs.readFileSync(await file.path(), 'utf8').replace(/\r\n /g, '') : '';
        check(ics.includes('BEGIN:VEVENT') && ics.includes(`/c/${tableId}?via=table`) && !ics.includes('RRULE'), 'ADD TO MY CALENDAR saves one entry with the table\'s link');
        await until('the Google Calendar link is offered', () => visible(guest.page.locator('.sheet-google a')));
        await guest.page.locator('button.share-other').click();
        await until('"Share another way" is counted', async () => rows(guest, 'host-invite').some((m) => m === 'copy' || m === 'native'));
        check(['open', 'whatsapp', 'calendar'].every((m) => rows(guest, 'host-invite').includes(m)), `the presses are counted: ${rows(guest, 'host-invite').join(', ')}`);
        check(shares.filter((s) => s.phone === guest.name && ['whatsapp', 'calendar'].includes(s.method)).every((s) => s.crew === tableId && s.locale === LOCALE), 'each row carries the table\'s id and the language');
        await shot(guest, '3-sent');
        await guest.page.locator('.invite-modal .modal-card-foot button').click();
        const remembered = JSON.parse(await guest.page.evaluate(() => window.localStorage.getItem('BS_CREWS') || '[]'));
        check(remembered.length === 1 && remembered[0].id === tableId && remembered[0].nickname === NAMES.guest, 'the phone remembers the table and the guest\'s name');
        t = await text(guest);
        check(t.includes(WORDS.set) && t.includes('20:30'), 'back on the final screen the ask says the night is set');
        await shot(guest, '3-ask-after');

        // 4. Two friends who never played open the link from the message.
        const link = `${base}${lang}/c/${tableId}?via=table`;
        for (const f of [f1, f2]) {
            await f.page.goto(link);
            await until(`${f.name} sees the name field`, () => visible(f.page.locator('input.in-name-input')));
            t = await text(f);
            check(t.includes(WORDS.whatIsIt) && t.includes(WORDS.gameNight) && t.includes(WORDS.table), `${f.name} sees what the game is, GAME NIGHT and "${WORDS.table}"`);
            if (f === f1) await shot(f, '4-friend-arrives');
            await f.page.locator('input.in-name-input').fill(f.name);
            await f.page.locator('button.im-in').click();
            await until(`${f.name} is in`, async () => ((await db('GET', `crews/${tableId}/night/in`)) || {})[key(f.name)] === f.name);
            await until(`${f.name}'s phone reads "You're in"`, async () => (await text(f)).includes(WORDS.youreIn));
        }
        crew = await db('GET', `crews/${tableId}`);
        check(Object.keys(crew.night.in).length === 3 && Object.keys(crew.members).length === 1, 'three are in; saying "I\'m in" seats nobody at the table yet');
        await shot(f2, '4-friend-in');

        // 5. "See who's in": the guest's own view of the table.
        await guest.page.locator('button.see-table').click();
        await guest.page.waitForURL(new RegExp(`/c/${tableId}`), { timeout: 15000 });
        await until('the guest sees who is in', async () => {
            const x = await text(guest);
            return [NAMES.guest, NAMES.f1, NAMES.f2].every((n) => x.includes(n)) && x.includes(WORDS.youreIn);
        });
        await shot(guest, '5-whos-in');

        // 6. The night comes: the stored time moves to an hour from now.
        await db('PUT', `crews/${tableId}/night/time`, Math.floor((Date.now() + 3600000) / 60000) * 60000);
        await until('every phone shows the lobby button', async () => (await Promise.all([guest, f1, f2].map((p) => visible(p.page.locator('button.open-lobby'))))).every(Boolean));
        check((await text(guest)).includes(WORDS.openLobby), `on the night the guest's button reads "${WORDS.openLobby}"`);
        await shot(guest, '6-on-the-night');
        await guest.page.locator('button.open-lobby').click();
        await guest.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
        const pin2 = new URL(guest.page.url()).pathname.split('/').pop().toUpperCase();
        const opened = await db('GET', `games/${pin2}`);
        check(!!opened && opened.crew === tableId && opened.origin === 'crew' && opened.locale === LOCALE, `the lobby ${pin2} is the table's game, in ${LOCALE}`);
        check(!!opened && opened.campaign === 'test', 'a table made from a test game opens a test game');
        for (const f of [f1, f2]) {
            await f.page.locator('button.open-lobby').click();
            await f.page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
            check(new URL(f.page.url()).pathname.split('/').pop().toUpperCase() === pin2, `${f.name} lands in the same lobby`);
        }
        const second = [guest, f1, f2];
        for (const p of second) {
            const input = p.page.locator('input[name="nickname"]');
            await until(`${p.name}'s name is filled in at the lobby`, async () => (await input.inputValue()) === p.name);
            Object.assign(p, { lies: [], picks: [], done: false, joined: false, joining: false });
        }
        // The guest opened the lobby: the guest hosts.
        guest.role = 'host';
        await play(pin2, second);
        const played = await db('GET', `games/${pin2}`);
        const hostSeat = Object.values(played.players || {}).find((p) => p.host);
        check(!!hostSeat && hostSeat.nickname === NAMES.guest, `the guest hosted the table's game: the host seat is ${hostSeat && hostSeat.nickname}`);
        check(played.state && played.state.id === 6, 'the table\'s first game was played to the end');
        crew = await until('the game counts for the table', async () => {
            const c = await db('GET', `crews/${tableId}`);
            return c && c.gameCount === 1 ? c : null;
        });
        check(!!crew && [NAMES.guest, NAMES.f1, NAMES.f2].every((n) => crew.members[key(n)] && crew.members[key(n)].games === 1) && Object.keys(crew.members).length === 3,
            `everyone who played is in the table's standings: ${crew && Object.keys(crew.members).join(', ')}`);
        check(!(await visible(guest.page.locator('.invite-ask'))) && !(await visible(guest.page.locator('.host-ask'))), 'as the host of that game, the guest gets no ask');
        await until('the friends, guests now, get an ask of their own', async () => (await visible(f1.page.locator('.invite-ask, .host-ask'))) && (await visible(f2.page.locator('.invite-ask, .host-ask'))));
        await shot(guest, '6-table-final');

        // 7. The two ways into Create.
        await nowGuest.page.locator('button.create-now').click();
        await nowGuest.page.waitForURL(/\/create-game/, { timeout: 15000 });
        let q = new URL(nowGuest.page.url()).searchParams;
        check(q.get('via') === 'after-game-invite' && q.get('lang') === LOCALE && rows(nowGuest, 'host-invite').includes('create-now'), `"${WORDS.now}" opens Create tagged after-game-invite, and is counted`);
        await classic.page.locator('button.ask-create').click();
        await classic.page.waitForURL(/\/create-game/, { timeout: 15000 });
        q = new URL(classic.page.url()).searchParams;
        check(q.get('via') === 'after-game' && rows(classic, 'after-game').includes('create'), 'today\'s ask works as before: Create tagged after-game, counted as after-game');

        // 8. Hanukkah. Two finished games seeded as the functions store them, each with a guest in the
        // new half whose clock reads Sunday 6 December 2026, 21:00 in Israel: the third candle.
        const candle = new Date('2026-12-06T21:00:00+02:00');
        const israel = { newContext: (o) => browser.newContext(Object.assign({}, o, { timezoneId: 'Asia/Jerusalem' })) };
        const seeded = async (gamePin, pack) => {
            const game = {
                state: { id: 6, timestamp: Date.now() }, locale: LOCALE, timestamp: Date.now() - 600000, roundIndex: 2, questionIndex: 4, totalQ: 5,
                qids: ['x'], tick: 0, presenter: false, origin: 'create', creator: 'seed-host', campaign: 'test', highlightsFrom: 0,
                players: { h1: { nickname: NAMES.host, score: 3000, uid: 'seed-host', host: true }, g1: { nickname: NAMES.guest, score: 1000, uid: `seed-${gamePin}` } },
            };
            if (pack) game.pack = pack;
            await db('PUT', `games/${gamePin}`, game);
            const p = await phone(`${NAMES.guest} (${pack || 'no pack'}, candle evening)`, 'player', 'new', israel);
            await p.context.clock.install({ time: candle });
            await p.context.addInitScript(([nickname, uid]) => {
                window.localStorage.setItem('BS_PLAYER', JSON.stringify({ nickname: nickname.toLowerCase(), pid: 'g1', uid }));
            }, [NAMES.guest, `seed-${gamePin}`]);
            await p.page.goto(`${base}/score-board-final/${gamePin}`);
            return p;
        };
        const candleGuest = await seeded('HNKA', 'hanukkah');
        await until('after a Hanukkah game on a candle evening the guest gets today\'s ask', () => visible(candleGuest.page.locator('.host-ask')));
        await sleep(2000);
        check(!(await visible(candleGuest.page.locator('.invite-ask'))), 'and not INVITE ANOTHER GROUP, though the phone is in the new half');
        check(rows(candleGuest, 'host-invite').length === 0, `that guest is out of the test: no row (${rows(candleGuest, 'host-invite')})`);
        check((await candleGuest.page.evaluate(() => new Date().toISOString())).startsWith('2026-12-06'), 'the phone\'s clock reads 6 December 2026');
        await shot(candleGuest, '8-hanukkah-candle-evening');
        const plainGuest = await seeded('HNKB', null);
        await until('after any other game on that evening the new ask shows', () => visible(plainGuest.page.locator('.invite-ask')));
        check(rows(plainGuest, 'host-invite').join() === 'seen-new', 'and it is counted: seen-new');

        // Every screen is in the game's language.
        const names = new RegExp(Object.values(NAMES).join('|'), 'g');
        for (const p of [guest, f1, f2, candleGuest]) {
            const body = (await text(p)).replace(names, '');
            if (he !== /[֐-׿]/.test(body)) problems.push(`${p.name}'s last screen is not in ${he ? 'Hebrew' : 'English'}`);
        }
        phones.forEach((p) => p.problems.forEach((x) => problems.push(`${p.name}: ${x}`)));

        console.log('\nRESULT ' + JSON.stringify({
            build: DIST, locale: LOCALE, game: pin, table: tableId, tableGame: pin2, message: said, steps,
            shares: shares.map((s) => `${s.phone}: ${s.content_type}/${s.method}`), problems,
        }, null, 2));
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
