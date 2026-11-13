// Tests for INVITE ANOTHER GROUP, the ask half of guests see when a game ends
// (src/app/components/invite-group/invite-group.ts): the half from a browser id, the three
// messages in both languages, the table's link and calendar entry, and the Hanukkah evenings.
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
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, lib: ['es2017', 'dom'] },
    }).outputText;
    const mod = { exports: {} };
    const req = name => name.startsWith('.') ? load(path.join(path.dirname(file), name + '.ts')) : require(name);
    new Function('module', 'exports', 'require', out)(mod, mod.exports, req);
    return mod.exports;
}

const g = load(path.join(app, 'components', 'invite-group', 'invite-group.ts'));
const n = load(path.join(app, 'pages', 'crew', 'next-night.ts'));

// Friday 20 November 2026, 21:00 in Israel.
const friday = new Date(2026, 10, 20, 21, 0, 0, 0);

test('the half follows the browser id: the same id always gets the same half', () => {
    for (const uid of ['a', 'Zk3PqW9x7LmN2bVc8RtY5uHj1oE2', 'another-browser']) {
        const half = g.inviteHalf(uid);
        assert.ok(half === 'new' || half === 'classic');
        for (let i = 0; i < 5; i++) assert.strictEqual(g.inviteHalf(uid), half);
    }
});

test('the halves are even over many browsers', () => {
    let fresh = 0;
    const total = 4000;
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    // Ids shaped like Firebase's anonymous uids (28 letters and digits), from a fixed sequence.
    let seed = 12345;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
    for (let i = 0; i < total; i++) {
        let uid = '';
        for (let k = 0; k < 28; k++) uid += letters[next() % letters.length];
        if (g.inviteHalf(uid) === 'new') fresh++;
    }
    assert.ok(fresh > total * 0.46 && fresh < total * 0.54, `${fresh} of ${total} in the new half`);
    // Ids that differ in their last character only do not all land in one half.
    const tail = letters.split('').map(c => g.inviteHalf('SameStartSameStartSameStart' + c));
    assert.ok(tail.includes('new') && tail.includes('classic'));
});

test('a browser with no id is not in the test; a tester can pick a half', () => {
    assert.strictEqual(g.inviteHalf(undefined), null);
    assert.strictEqual(g.inviteHalf(null), null);
    assert.strictEqual(g.inviteHalf(''), null);
    assert.strictEqual(g.inviteHalf(0), null);
    assert.strictEqual(g.inviteHalf(undefined, 'new'), 'new');
    assert.strictEqual(g.inviteHalf('a', 'classic'), 'classic');
    assert.strictEqual(g.inviteHalf('a', 'new'), 'new');
    // Anything else in the switch is ignored.
    assert.strictEqual(g.inviteHalf('a', 'yes'), g.inviteHalf('a'));
});

test('the message, English: a lie that fooled 3, a lie that fooled 1, no lie', () => {
    assert.strictEqual(g.inviteMessage(friday, 'en', { text: 'a sneeze can break a rib', fooled: 3 }),
        'Tonight I fooled 3 people in Bullshit with this lie: "a sneeze can break a rib". Think you\'d do better? '
        + 'My game, Friday 20 November, 21:00. Who\'s in? Tap here:');
    assert.strictEqual(g.inviteMessage(friday, 'en', { text: 'a sneeze can break a rib', fooled: 1 }),
        'Tonight I fooled someone in Bullshit with this lie: "a sneeze can break a rib". Think you\'d do better? '
        + 'My game, Friday 20 November, 21:00. Who\'s in? Tap here:');
    const plain = 'Found us a game: Bullshit. Everyone makes up a lie and tries to spot the truth. '
        + 'My game, Friday 20 November, 21:00. Who\'s in? Tap here:';
    assert.strictEqual(g.inviteMessage(friday, 'en', null), plain);
    assert.strictEqual(g.inviteMessage(friday, 'en', undefined), plain);
    // A lie that fooled nobody, or a highlight with only a funny lie (an empty text), is no bait.
    assert.strictEqual(g.inviteMessage(friday, 'en', { text: 'nobody fell for this', fooled: 0 }), plain);
    assert.strictEqual(g.inviteMessage(friday, 'en', { text: '', fooled: 2 }), plain);
});

test('the message, Hebrew: a lie that fooled 3, a lie that fooled 1, no lie', () => {
    assert.strictEqual(g.inviteMessage(friday, 'he', { text: 'עיטוש יכול לשבור צלע', fooled: 3 }),
        'הערב עבדתי על 3 אנשים בבולשיט עם השקר הזה: "עיטוש יכול לשבור צלע". נראה אתכם. '
        + 'משחק אצלי, יום שישי, 20 בנובמבר, 21:00. מי בפנים? לוחצים כאן:');
    assert.strictEqual(g.inviteMessage(friday, 'he', { text: 'עיטוש יכול לשבור צלע', fooled: 1 }),
        'הערב עבדתי על מישהו בבולשיט עם השקר הזה: "עיטוש יכול לשבור צלע". נראה אתכם. '
        + 'משחק אצלי, יום שישי, 20 בנובמבר, 21:00. מי בפנים? לוחצים כאן:');
    assert.strictEqual(g.inviteMessage(friday, 'he', null),
        'מצאתי לנו משחק: בולשיט. כולם ממציאים שקר ומנסים לזהות את האמת. '
        + 'משחק אצלי, יום שישי, 20 בנובמבר, 21:00. מי בפנים? לוחצים כאן:');
});

test('a lie typed over several lines goes out as one line', () => {
    assert.ok(g.inviteMessage(friday, 'en', { text: ' a sneeze\n can   break a rib ', fooled: 2 })
        .includes('"a sneeze can break a rib"'));
});

test('the words of the ask and the sheet are the spec\'s, in both languages', () => {
    const en = g.inviteWords('en');
    assert.strictEqual(en.title, 'Know another group that would fall for this?');
    assert.strictEqual(en.text, 'Pick a night and send them the link. You host: it\'s free and takes 10 seconds.');
    assert.strictEqual(en.button, 'INVITE ANOTHER GROUP');
    assert.strictEqual(en.now, 'or start a game right now');
    assert.strictEqual(en.sheetTitle, 'YOUR GAME NIGHT');
    assert.strictEqual(en.whatsapp, 'SEND ON WHATSAPP');
    assert.strictEqual(en.calendar, 'ADD TO MY CALENDAR');
    assert.strictEqual(en.other, 'Share another way');
    const he = g.inviteWords('he');
    assert.strictEqual(he.title, 'יש עוד חבורה שתיפול בזה?');
    assert.strictEqual(he.text, 'קובעים ערב ושולחים להם קישור. המשחק אצלכם: בחינם, 10 שניות.');
    assert.strictEqual(he.button, 'להזמין חבורה אחרת');
    assert.strictEqual(he.now, 'או לפתוח משחק עכשיו');
    assert.strictEqual(he.sheetTitle, 'ערב המשחק שלך');
    assert.strictEqual(he.whatsapp, 'שליחה בוואטסאפ');
    // Every English word has a Hebrew one, and no Hebrew line is left in English.
    assert.deepStrictEqual(Object.keys(he).sort(), Object.keys(en).sort());
    Object.keys(he).filter(k => typeof he[k] === 'string').forEach(k => assert.ok(/[֐-׿]/.test(he[k]), k));
    assert.strictEqual(g.inviteWords('fr'), en);
});

test('the table\'s link is its crew page, in its language, tagged table', () => {
    assert.strictEqual(g.tableUrl('K7M2QX', 'en'), 'https://bullshit.wtf/c/k7m2qx?via=table');
    assert.strictEqual(g.tableUrl('k7m2qx', 'he'), 'https://bullshit.wtf/he/c/k7m2qx?via=table');
});

test('the calendar entry is the guest\'s own night, once, with the table\'s link', () => {
    const event = g.inviteEvent(friday, 'k7m2qx', "Noa's table", 'en');
    assert.strictEqual(event.title, "Bullshit game night: Noa's table");
    assert.strictEqual(event.url, 'https://bullshit.wtf/c/k7m2qx?via=table');
    assert.ok(event.text.includes('OPEN THE LOBBY'));
    const ics = n.buildEventIcs(friday, event, new Date(2026, 10, 13, 22, 0));
    assert.ok(ics.includes('DTSTART:20261120T190000Z'));
    assert.ok(!ics.includes('RRULE'));
    assert.ok(ics.replace(/\r\n /g, '').includes('URL:https://bullshit.wtf/c/k7m2qx?via=table'));
    const he = g.inviteEvent(friday, 'k7m2qx', 'השולחן של נועה', 'he');
    assert.strictEqual(he.title, 'ערב בולשיט: השולחן של נועה');
    assert.strictEqual(he.url, 'https://bullshit.wtf/he/c/k7m2qx?via=table');
    // A night the guest changed is another entry, not the same one twice.
    assert.notStrictEqual(g.inviteEvent(new Date(2026, 10, 21, 21, 0), 'k7m2qx', 't', 'en').uid, event.uid);
});

test('the default night is the coming Friday at 21:00, not a week from tonight', () => {
    // Friday 13 November at 22:40, after a game: the Friday after.
    assert.strictEqual(n.defaultNight(new Date(2026, 10, 13, 22, 40), 'en').getTime(), friday.getTime());
    // Tuesday 17 November: that same Friday, three days on.
    assert.strictEqual(n.defaultNight(new Date(2026, 10, 17, 20, 10), 'he').getTime(), friday.getTime());
    // Saturday 00:30, after Friday's game: next Friday.
    assert.strictEqual(n.defaultNight(new Date(2026, 10, 14, 0, 30), 'en').getTime(), friday.getTime());
});

test('Hanukkah wins on its evenings: after a Hanukkah game the guest keeps the Hanukkah ask', () => {
    const at = (d, h, m = 0) => new Date(2026, 11, d, h, m);
    // From the eve of the first candle (3 December) to the eighth candle (11 December).
    assert.strictEqual(g.candleEvening(at(3, 20), 'hanukkah'), true);
    assert.strictEqual(g.candleEvening(at(4, 21), 'hanukkah'), true);
    assert.strictEqual(g.candleEvening(at(8, 19, 30), 'hanukkah'), true);
    assert.strictEqual(g.candleEvening(at(11, 22), 'hanukkah'), true);
    // The evening runs past midnight to 05:00.
    assert.strictEqual(g.candleEvening(at(12, 0, 40), 'hanukkah'), true);
    assert.strictEqual(g.candleEvening(at(12, 4, 59), 'hanukkah'), true);
    assert.strictEqual(g.candleEvening(at(12, 5, 0), 'hanukkah'), false);
    assert.strictEqual(g.candleEvening(at(3, 4, 0), 'hanukkah'), false);
    // The pack's season is wider than the candles: before and after them the test runs as usual.
    assert.strictEqual(g.candleEvening(at(1, 21), 'hanukkah'), false);
    assert.strictEqual(g.candleEvening(at(2, 21), 'hanukkah'), false);
    assert.strictEqual(g.candleEvening(at(12, 21), 'hanukkah'), false);
    assert.strictEqual(g.candleEvening(at(13, 21), 'hanukkah'), false);
});

test('every other game is in the test, on candle evenings too', () => {
    const candle = new Date(2026, 11, 6, 21, 0);
    assert.strictEqual(g.candleEvening(candle, null), false);
    assert.strictEqual(g.candleEvening(candle, undefined), false);
    assert.strictEqual(g.candleEvening(candle, 'other'), false);
});

test('the ask\'s own tags: its rows, the table link, and the game "start right now" makes', () => {
    assert.strictEqual(g.INVITE_CONTENT, 'host-invite');
    assert.strictEqual(g.TABLE_VIA, 'table');
    // Starts with after-game, so the games today's ask brings are still counted together.
    assert.ok(g.INVITE_NOW_TAG.startsWith('after-game'));
    assert.ok(/^[a-z0-9][a-z0-9-]{0,39}$/.test(g.INVITE_NOW_TAG));
});
