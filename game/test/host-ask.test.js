// Tests for the after-game ask and the rematch offer (src/app/components/host-ask/host-ask.ts),
// and for the calendar entry it saves (src/app/pages/crew/next-night.ts).
// Run: npm test (from game/). Needs Node 20+.
process.env.TZ = 'Asia/Jerusalem';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const app = path.join(__dirname, '..', 'src', 'app');

/** Loads a TypeScript file of the app, following its relative imports. */
function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5, lib: ['es2016', 'dom'] },
    }).outputText;
    const mod = { exports: {} };
    const req = name => name.startsWith('.') ? load(path.join(path.dirname(file), name + '.ts')) : require(name);
    new Function('module', 'exports', 'require', out)(mod, mod.exports, req);
    return mod.exports;
}

const h = load(path.join(app, 'components', 'host-ask', 'host-ask.ts'));
const n = load(path.join(app, 'pages', 'crew', 'next-night.ts'));

const alice = { pid: 'p1', uid: 'u1', host: true };
const ben = { pid: 'p2', uid: 'u2' };
const chen = { pid: 'p3', uid: 'u3' };
const players = [alice, ben, chen];

test('a guest sees the ask, the host does not', () => {
    assert.strictEqual(h.showHostAsk({ presenter: false, myPid: 'p2', myUid: 'u2', players }), true);
    assert.strictEqual(h.showHostAsk({ presenter: false, myPid: 'p3', myUid: 'u3', players }), true);
    assert.strictEqual(h.showHostAsk({ presenter: false, myPid: 'p1', myUid: 'u1', players }), false);
});

test('a guest whose sign-in failed (no uid) still sees it; a host without a uid still does not', () => {
    assert.strictEqual(h.showHostAsk({ presenter: false, myPid: 'p2', myUid: null, players }), true);
    assert.strictEqual(h.showHostAsk({ presenter: false, myPid: 'p1', myUid: null, players }), false);
});

test('the phone with the host key hosted, whatever the rows say', () => {
    // Two phones pressed Replay at once: both hold the key, one row is marked.
    assert.strictEqual(h.showHostAsk({ presenter: false, myPid: 'p2', myUid: 'u2', holdsHostKey: true, players }), false);
});

test('a game from before host marks: the creator hosted', () => {
    const old = [{ pid: 'p1', uid: 'u1' }, { pid: 'p2', uid: 'u2' }];
    assert.strictEqual(h.showHostAsk({ presenter: false, myPid: 'p1', myUid: 'u1', creator: 'u1', players: old }), false);
    assert.strictEqual(h.showHostAsk({ presenter: false, myPid: 'p2', myUid: 'u2', creator: 'u1', players: old }), true);
    // Nobody knows who hosted: the ask does no harm.
    assert.strictEqual(h.showHostAsk({ presenter: false, myPid: 'p2', myUid: 'u2', creator: null, players: old }), true);
});

test('no ask on a big screen, for a watcher, or after a solo game', () => {
    assert.strictEqual(h.showHostAsk({ presenter: true, myPid: 'p2', myUid: 'u2', players }), false);
    assert.strictEqual(h.showHostAsk({ presenter: false, myPid: null, myUid: 'u9', players }), false);
    assert.strictEqual(h.showHostAsk({ presenter: false, myPid: 'p9', myUid: 'u9', players }), false);
    assert.strictEqual(h.showHostAsk({ presenter: false, myPid: 'p2', myUid: 'u2', players: [ben] }), false);
    assert.strictEqual(h.showHostAsk({ presenter: false, myPid: 'p2', myUid: 'u2', players: null }), false);
});

test('the tags are campaign tags the server keeps, and all start with after-game', () => {
    const tags = [].concat(...Object.keys(h.ASK_TAGS).map(k => [h.ASK_TAGS[k].create, h.ASK_TAGS[k].remind]));
    assert.strictEqual(new Set(tags).size, 4);
    tags.forEach(tag => {
        // cleanCampaign in game-model.ts
        assert.ok(/^[a-z0-9][a-z0-9-]{0,39}$/.test(tag), tag);
        assert.ok(tag.startsWith('after-game'), tag);
    });
    assert.strictEqual(h.ASK_TAGS['after-game'].create, 'after-game');
});

test('the client reads the ask tags as campaigns, not as join sources', () => {
    global.window = {};
    const js = load(path.join(app, 'services', 'join-source.ts'));
    assert.strictEqual(js.readCampaign('?via=after-game&lang=he'), 'after-game');
    assert.strictEqual(js.readCampaign('?via=after-game-late-remind'), 'after-game-late-remind');
    assert.strictEqual(js.readVia('?via=after-game'), 'other');
});

test('presses are counted under the place they were made', () => {
    assert.strictEqual(h.askContentType('after-game'), 'after-game');
    assert.strictEqual(h.askContentType('game-over'), 'game-over');
});

test('the Create link is in the game\'s language and carries the tag', () => {
    assert.strictEqual(h.askCreateUrl('after-game-remind', 'he'), 'https://bullshit.wtf/create-game?via=after-game-remind&lang=he');
    assert.strictEqual(h.askCreateUrl('after-game-remind', 'en'), 'https://bullshit.wtf/create-game?via=after-game-remind&lang=en');
    assert.strictEqual(h.askCreateUrl('after-game', 'fr'), 'https://bullshit.wtf/create-game?via=after-game&lang=en');
});

test('the reminder is for the coming game night: Friday 21:00, in Hebrew and in English', () => {
    const wed = new Date(2026, 10, 11, 20, 0); // Wednesday 11 Nov 2026
    assert.strictEqual(n.dateValue(h.reminderNight(wed, 'he')), '2026-11-13');
    assert.strictEqual(n.dateValue(h.reminderNight(wed, 'en')), '2026-11-13');
    assert.strictEqual(n.timeValue(h.reminderNight(wed, 'he')), '21:00');
    // A game that ends on game night itself, late: the reminder is for next week, never the past.
    const late = new Date(2026, 10, 13, 22, 30);
    assert.strictEqual(n.dateValue(h.reminderNight(late, 'en')), '2026-11-20');
});

test('the calendar entry has the title, the Create link with its tag, and an alarm', () => {
    const start = h.reminderNight(new Date(2026, 10, 11, 20, 0), 'en');
    const event = h.reminderEvent(start, 'after-game', 'en');
    assert.strictEqual(event.url, 'https://bullshit.wtf/create-game?via=after-game-remind&lang=en');
    const ics = n.buildEventIcs(start, event, new Date(Date.UTC(2026, 10, 11, 18, 0)));
    const unfolded = ics.replace(/\r\n /g, '');
    assert.ok(unfolded.includes('SUMMARY:Host a game of Bullshit\r\n'));
    assert.ok(unfolded.includes('DTSTART:20261113T190000Z\r\n')); // 21:00 in Israel
    assert.ok(unfolded.includes('DTEND:20261113T203000Z\r\n'));
    assert.ok(unfolded.includes('URL:https://bullshit.wtf/create-game?via=after-game-remind&lang=en\r\n'));
    assert.ok(unfolded.includes('\\nhttps://bullshit.wtf/create-game?via=after-game-remind&lang=en\r\n'));
    assert.ok(unfolded.includes('BEGIN:VALARM'));
    assert.ok(unfolded.includes(`UID:host-${start.getTime()}@bullshit.wtf\r\n`));
    ics.split('\r\n').forEach(line => assert.ok(Buffer.byteLength(line, 'utf8') <= 75, line));
});

test('the Hebrew entry is in Hebrew, and the late joiner\'s entry has its own tag', () => {
    const start = h.reminderNight(new Date(2026, 10, 11, 20, 0), 'he');
    const event = h.reminderEvent(start, 'game-over', 'he');
    assert.strictEqual(event.title, 'לפתוח משחק בולשיט');
    assert.strictEqual(event.url, 'https://bullshit.wtf/create-game?via=after-game-late-remind&lang=he');
    const ics = n.buildEventIcs(start, event, new Date());
    ics.split('\r\n').forEach(line => assert.ok(Buffer.byteLength(line, 'utf8') <= 75, line));
    const google = n.googleEventUrl(start, event);
    assert.ok(google.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE&text='));
    assert.ok(decodeURIComponent(google).includes('via=after-game-late-remind'));
    assert.ok(google.includes('&dates=20261113T190000Z/20261113T203000Z'));
});

test('a crew\'s game night entry is unchanged by the shared builder', () => {
    const info = { crewName: 'Office Friday', leader: 'Alice leads 4 to 3', url: 'https://bullshit.wtf/c/g4d48z?via=crew', locale: 'en' };
    const start = new Date(2026, 10, 13, 21, 0);
    const ics = n.buildIcs(start, info, 'g4d48z', new Date(Date.UTC(2026, 10, 5, 16, 0))).replace(/\r\n /g, '');
    assert.ok(ics.includes('UID:g4d48z-20261113T190000Z@bullshit.wtf\r\n'));
    assert.ok(ics.includes('SUMMARY:Bullshit game night: Office Friday\r\n'));
    assert.ok(ics.includes('URL:https://bullshit.wtf/c/g4d48z?via=crew\r\n'));
    assert.ok(n.googleCalendarUrl(start, info).includes(encodeURIComponent('Bullshit game night: Office Friday')));
});

test('both languages have every string of the ask and of the rematch offer', () => {
    assert.deepStrictEqual(Object.keys(h.hostAskStrings.he).sort(), Object.keys(h.hostAskStrings.en).sort());
    assert.deepStrictEqual(Object.keys(h.rematchStrings.he).sort(), Object.keys(h.rematchStrings.en).sort());
    Object.keys(h.hostAskStrings.en).forEach(k => {
        assert.ok(h.hostAskStrings.en[k] && h.hostAskStrings.he[k], k);
        assert.ok(/[\u0590-\u05FF]/.test(h.hostAskStrings.he[k]), k);
    });
    assert.strictEqual(h.askStrings('he'), h.hostAskStrings.he);
    assert.strictEqual(h.askStrings('fr'), h.hostAskStrings.en);
    assert.strictEqual(h.rematchStrings.en.waiting('Alice'), 'Alice started a rematch');
    assert.strictEqual(h.rematchStrings.en.waiting(''), 'A rematch is waiting for you');
    assert.ok(h.rematchStrings.he.waiting('דנה').includes('דנה'));
});

test('after REMIND ME the card does not claim the entry is saved: it says to open the file, or use Google Calendar', () => {
    const en = h.hostAskStrings.en;
    const he = h.hostAskStrings.he;
    assert.strictEqual(en.saved, 'One more step. If a calendar file downloaded, open it to save game night.');
    assert.strictEqual(en.google, 'Or add it to Google Calendar');
    assert.strictEqual(he.saved, 'עוד צעד אחד. אם ירד קובץ יומן, פתחו אותו כדי לשמור את ערב המשחק.');
    assert.strictEqual(he.google, 'או הוסיפו ליומן Google');
    // Pressing the button only hands a file to the browser, and some browsers drop it. So no line
    // may say the night is already in a calendar, and the Google link is a second way, not a rescue.
    [en.saved, en.google].forEach(s => assert.ok(!/is in your calendar|saved to|added to|nothing happened/i.test(s), s));
    [he.saved, he.google].forEach(s => assert.ok(!/נשמר ביומן|נוסף ליומן|לא קרה כלום/.test(s), s));
    assert.ok(/open it/i.test(en.saved) && /^If |\. If /.test(en.saved));
    assert.ok(/פתחו אותו/.test(he.saved) && /אם ירד/.test(he.saved));
    assert.ok(/^Or /.test(en.google) && /^או /.test(he.google));
    // Short enough for two lines on a phone.
    [en.saved, he.saved].forEach(s => assert.ok(s.length <= 80, s));
});

// ---------------------------------------------------------------------------
// REMATCH pressed on another phone.

test('the phone that pressed REMATCH goes to the new lobby at once, and so does a big screen', () => {
    assert.strictEqual(h.rematchMove({ presenter: false, pressed: true, started: false, busy: false }), 'go');
    assert.strictEqual(h.rematchMove({ presenter: false, pressed: true, started: false, busy: true }), 'go');
    assert.strictEqual(h.rematchMove({ presenter: true, pressed: false, started: false, busy: false }), 'go');
});

test('every other phone stays on the final screen while the rematch is in its lobby', () => {
    assert.strictEqual(h.rematchMove({ presenter: false, pressed: false, started: false, busy: false }), 'offer');
    assert.strictEqual(h.rematchMove({ presenter: false, pressed: false, started: false, busy: true }), 'offer');
});

test('when the rematch starts, a phone still on the final screen follows, unless its player is sharing or saving', () => {
    assert.strictEqual(h.rematchMove({ presenter: false, pressed: false, started: true, busy: false }), 'go');
    assert.strictEqual(h.rematchMove({ presenter: false, pressed: false, started: true, busy: true }), 'offer');
});

// ---------------------------------------------------------------------------
// After a Hanukkah game (growth plan, "Hanukkah: 1 to 13 December").

const at = (d, h = 22) => new Date(`${d}T${h}:00:00`);

test('Hanukkah evenings: the eve of the first candle, candles with one tomorrow, the eighth', () => {
    assert.strictEqual(h.hanukkahEvening(at('2026-12-02'), 'hanukkah'), null);
    assert.strictEqual(h.hanukkahEvening(at('2026-12-03'), 'hanukkah'), 'first');
    assert.strictEqual(h.hanukkahEvening(at('2026-12-04'), 'hanukkah'), 'next');
    assert.strictEqual(h.hanukkahEvening(at('2026-12-10', 23), 'hanukkah'), 'next');
    assert.strictEqual(h.hanukkahEvening(at('2026-12-11'), 'hanukkah'), 'last');
    assert.strictEqual(h.hanukkahEvening(at('2026-12-12'), 'hanukkah'), null);
    // A game of no pack, in the middle of Hanukkah: the plain ask.
    assert.strictEqual(h.hanukkahEvening(at('2026-12-06'), null), null);
    assert.strictEqual(h.hanukkahEvening(at('2026-12-06'), undefined), null);
});

test('the Hanukkah ask reads as the growth plan asks, in both languages', () => {
    const en = h.askStrings('en', 'next');
    assert.strictEqual(en.title, 'Lighting with the other side of the family? Start a game there.');
    assert.strictEqual(en.remind, 'ANOTHER CANDLE TOMORROW: PLAY AGAIN');
    assert.strictEqual(en.create, 'START MY OWN GAME');
    const he = h.askStrings('he', 'next');
    assert.strictEqual(he.title, 'מדליקים גם אצל הצד השני של המשפחה? פתחו שם משחק.');
    assert.strictEqual(he.remind, 'עוד נר מחר: משחקים שוב');
    assert.strictEqual(h.askStrings('en', 'first').remind, 'FIRST CANDLE TOMORROW: PLAY AGAIN');
    assert.strictEqual(h.askStrings('he', 'first').remind, 'הנר הראשון מחר: משחקים שוב');
    // The eighth evening: no candle tomorrow, so REMIND ME is the plain one.
    assert.strictEqual(h.askStrings('en', 'last').remind, 'REMIND ME');
    assert.strictEqual(h.askStrings('en', 'last').title, en.title);
    // Outside Hanukkah nothing changes.
    assert.deepStrictEqual(h.askStrings('en', null), h.hostAskStrings.en);
    assert.deepStrictEqual(h.askStrings('he'), h.hostAskStrings.he);
});

test('a candle tomorrow: the reminder is tomorrow evening, and opens a Hanukkah game', () => {
    const now = at('2026-12-06', 22);
    const start = h.reminderNight(now, 'he', 'next');
    assert.strictEqual(start.getDate(), 7);
    assert.strictEqual(start.getHours(), 21);
    const ev = h.reminderEvent(start, 'after-game', 'he', 'hanukkah', 'next');
    assert.strictEqual(ev.url, 'https://bullshit.wtf/create-game?via=after-game-remind&lang=he&pack=hanukkah');
    assert.strictEqual(ev.title, 'חנוכה: לפתוח משחק בולשיט');
    // The eighth evening falls back to the coming Friday.
    const last = h.reminderNight(at('2026-12-11', 22), 'en', 'last');
    assert.strictEqual(last.getDay(), 5);
    assert.strictEqual(last.getDate(), 18);
    // A game of no pack: the link has no pack, as before.
    assert.strictEqual(h.reminderEvent(start, 'after-game', 'en').url, 'https://bullshit.wtf/create-game?via=after-game-remind&lang=en');
});

test('after midnight it is still the same candle evening, until five in the morning', () => {
    // 00:40 on 7 December is the night of 6 December for the family: another candle tomorrow,
    // saved for the evening of 7 December, not 8 December.
    const now = new Date(2026, 11, 7, 0, 40);
    assert.strictEqual(h.hanukkahEvening(now, 'hanukkah'), 'next');
    const start = h.reminderNight(now, 'en', 'next');
    assert.strictEqual(n.dateValue(start), '2026-12-07');
    assert.strictEqual(n.timeValue(start), '21:00');
    // 01:30 after the eve: still the eve, and the first candle is tonight's evening.
    const eve = new Date(2026, 11, 4, 1, 30);
    assert.strictEqual(h.hanukkahEvening(eve, 'hanukkah'), 'first');
    assert.strictEqual(n.dateValue(h.reminderNight(eve, 'he', 'first')), '2026-12-04');
    // 02:00 after the seventh candle: tomorrow (the 11th) is the eighth.
    const seventh = new Date(2026, 11, 11, 2, 0);
    assert.strictEqual(h.hanukkahEvening(seventh, 'hanukkah'), 'next');
    assert.strictEqual(n.dateValue(h.reminderNight(seventh, 'en', 'next')), '2026-12-11');
    // 03:00 after the eighth candle: still the eighth evening.
    assert.strictEqual(h.hanukkahEvening(new Date(2026, 11, 12, 3, 0), 'hanukkah'), 'last');
    // From five in the morning the day is the new one.
    assert.strictEqual(h.hanukkahEvening(new Date(2026, 11, 12, 5, 0), 'hanukkah'), null);
    assert.strictEqual(h.hanukkahEvening(new Date(2026, 11, 3, 4, 59), 'hanukkah'), null);
    assert.strictEqual(h.hanukkahEvening(new Date(2026, 11, 3, 5, 0), 'hanukkah'), 'first');
});

test('the eighth candle: the reminder is the coming Friday, a plain game, not a Hanukkah one', () => {
    for (const now of [at('2026-12-11', 22), new Date(2026, 11, 12, 0, 40)]) {
        const evening = h.hanukkahEvening(now, 'hanukkah');
        assert.strictEqual(evening, 'last');
        const start = h.reminderNight(now, 'he', evening);
        assert.strictEqual(n.dateValue(start), '2026-12-18');
        const ev = h.reminderEvent(start, 'after-game', 'he', 'hanukkah', evening);
        assert.strictEqual(ev.url, 'https://bullshit.wtf/create-game?via=after-game-remind&lang=he');
        assert.strictEqual(ev.title, h.hostAskStrings.he.eventTitle);
    }
    // Inside Hanukkah the reminder keeps the pack, up to the eighth candle itself.
    const ok = h.reminderEvent(new Date(2026, 11, 11, 21), 'after-game', 'en', 'hanukkah', 'next');
    assert.ok(ok.url.endsWith('&pack=hanukkah'));
});

test('the candle dates fall inside the pack season, first and eighth candles on Fridays', () => {
    const model = fs.readFileSync(path.join(__dirname, '..', '..', 'game-model.ts'), 'utf8');
    const m = /hanukkah:[\s\S]*?season: \{ from: '([\d-]+)', to: '([\d-]+)' \}/.exec(model);
    assert.ok(m);
    assert.ok(h.HANUKKAH_CANDLES.first >= m[1] && h.HANUKKAH_CANDLES.last <= m[2]);
    assert.strictEqual(new Date(h.HANUKKAH_CANDLES.first + 'T12:00:00').getDay(), 5);
    assert.strictEqual(new Date(h.HANUKKAH_CANDLES.last + 'T12:00:00').getDay(), 5);
});
