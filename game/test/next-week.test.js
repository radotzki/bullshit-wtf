// Tests for "Same time next week?" on the final screen (src/app/components/next-week/next-week.ts).
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

const w = load(path.join(app, 'components', 'next-week', 'next-week.ts'));
const n = load(path.join(app, 'pages', 'crew', 'next-night.ts'));
const stamp = d => `${n.dateValue(d)} ${n.timeValue(d)} ${d.getDay()}`;
const FRIDAY = 5;

test('the default date is tonight plus seven days, at the time the group plays', () => {
    // Friday 13 November 2026, 20:10: next Friday at 20:00 (now, rounded down to the half hour).
    assert.strictEqual(stamp(w.sameTimeNextWeek(new Date(2026, 10, 13, 20, 10))), `2026-11-20 20:00 ${FRIDAY}`);
    assert.strictEqual(stamp(w.sameTimeNextWeek(new Date(2026, 10, 13, 20, 45))), `2026-11-20 20:30 ${FRIDAY}`);
    // 22:40: the game ran late, the night is offered at 21:00.
    assert.strictEqual(stamp(w.sameTimeNextWeek(new Date(2026, 10, 13, 22, 40))), `2026-11-20 21:00 ${FRIDAY}`);
    assert.strictEqual(stamp(w.sameTimeNextWeek(new Date(2026, 10, 13, 21, 30))), `2026-11-20 21:00 ${FRIDAY}`);
    assert.strictEqual(stamp(w.sameTimeNextWeek(new Date(2026, 10, 13, 21, 29))), `2026-11-20 21:00 ${FRIDAY}`);
    // 00:30 on Saturday is still Friday night: next Friday, not next Saturday.
    assert.strictEqual(stamp(w.sameTimeNextWeek(new Date(2026, 10, 14, 0, 30))), `2026-11-20 21:00 ${FRIDAY}`);
    assert.strictEqual(stamp(w.sameTimeNextWeek(new Date(2026, 10, 14, 4, 59))), `2026-11-20 21:00 ${FRIDAY}`);
    // 05:00 is a new day. An afternoon game is offered at its own hour.
    assert.strictEqual(stamp(w.sameTimeNextWeek(new Date(2026, 10, 14, 5, 0))), '2026-11-21 05:00 6');
    assert.strictEqual(stamp(w.sameTimeNextWeek(new Date(2026, 10, 14, 15, 5))), '2026-11-21 15:00 6');
});

test('the default date crosses a month, a year and a clock change at the same hour', () => {
    assert.strictEqual(stamp(w.sameTimeNextWeek(new Date(2026, 10, 27, 20, 10))), `2026-12-04 20:00 ${FRIDAY}`);
    assert.strictEqual(stamp(w.sameTimeNextWeek(new Date(2026, 11, 31, 0, 30))), '2027-01-06 21:00 3');
    // Israel's clocks go forward on Friday 26 March 2027: 20:00 stays 20:00.
    assert.strictEqual(stamp(w.sameTimeNextWeek(new Date(2027, 2, 19, 20, 10))), `2027-03-26 20:00 ${FRIDAY}`);
});

test('the WhatsApp message: a loser wants a rematch, the winner defends the title', () => {
    const when = new Date(2026, 10, 20, 21, 0);
    assert.strictEqual(w.nextWeekText({ winner: false, when, leader: 'Dana leads 2 to 1', locale: 'en' }),
        'I want a rematch. Bullshit, same time next week: Friday 20 November, 21:00. Dana leads 2 to 1. Who\'s in? Tap here:');
    assert.strictEqual(w.nextWeekText({ winner: true, when, leader: 'Dana leads 2 to 1', locale: 'en' }),
        'Come and take my title. Bullshit, same time next week: Friday 20 November, 21:00. Dana leads 2 to 1. Who\'s in? Tap here:');
    assert.strictEqual(w.nextWeekText({ winner: false, when, leader: 'דנה מוביל/ה 2–1', locale: 'he' }),
        'מגיע לי משחק חוזר. בולשיט, אותה שעה בשבוע הבא: יום שישי, 20 בנובמבר, 21:00. דנה מוביל/ה 2–1. מי בפנים? לוחצים כאן:');
    assert.strictEqual(w.nextWeekText({ winner: true, when, leader: 'דנה מוביל/ה 2–1', locale: 'he' }),
        'בואו לקחת לי את התואר. בולשיט, אותה שעה בשבוע הבא: יום שישי, 20 בנובמבר, 21:00. דנה מוביל/ה 2–1. מי בפנים? לוחצים כאן:');
});

test('the message has no leader line while nobody has won, and no doubled full stop', () => {
    const when = new Date(2026, 10, 20, 21, 0);
    assert.strictEqual(w.nextWeekText({ winner: false, when, leader: '', locale: 'en' }),
        'I want a rematch. Bullshit, same time next week: Friday 20 November, 21:00. Who\'s in? Tap here:');
    assert.strictEqual(w.nextWeekText({ winner: false, when, leader: 'Dana and Avi are tied 1 to 1.', locale: 'en' }),
        'I want a rematch. Bullshit, same time next week: Friday 20 November, 21:00. Dana and Avi are tied 1 to 1. Who\'s in? Tap here:');
    assert.strictEqual(w.nextWeekText({ winner: true, when, leader: '', locale: 'he' }),
        'בואו לקחת לי את התואר. בולשיט, אותה שעה בשבוע הבא: יום שישי, 20 בנובמבר, 21:00. מי בפנים? לוחצים כאן:');
});

test('the words of the button, the sheet and the banner, in both languages', () => {
    const en = w.nextWeekWords('en');
    const he = w.nextWeekWords('he');
    assert.strictEqual(w.nextWeekWords('fr'), en);
    assert.strictEqual(en.revenge, 'REVENGE NEXT WEEK');
    assert.strictEqual(en.defend, 'DEFEND MY TITLE NEXT WEEK');
    assert.strictEqual(en.title, 'SAME TIME NEXT WEEK?');
    assert.strictEqual(en.send, 'SEND TO THE GROUP ON WHATSAPP');
    assert.strictEqual(en.next('Friday 20 November, 21:00'), 'Next game night: Friday 20 November, 21:00');
    assert.strictEqual(en.set('Friday 20 November, 21:00'), 'Game night is set: Friday 20 November, 21:00');
    assert.strictEqual(en.call('Omer'), 'Omer\'s call');
    assert.strictEqual(he.revenge, 'נקמה בשבוע הבא');
    assert.strictEqual(he.defend, 'להגן על התואר בשבוע הבא');
    assert.strictEqual(he.call('עומר'), 'הצעה של עומר');
    assert.strictEqual(he.imIn, 'אני בפנים');
    // Every English word has its Hebrew, in Hebrew letters.
    Object.keys(en).forEach(k => {
        const text = typeof he[k] === 'function' ? he[k]('א', 'ב', '') : he[k];
        assert.match(String(text), /[֐-׿]/, k);
    });
    assert.strictEqual(w.defaultCrewName('Dana', 'en'), 'Dana\'s crew');
    assert.strictEqual(w.defaultCrewName(' דנה ', 'he'), 'החבורה של דנה');
    // A nickname has at most 9 letters, so the name fits a crew name's 24.
    assert.ok(w.defaultCrewName('123456789', 'en').length <= 24);
    assert.ok(w.defaultCrewName('123456789', 'he').length <= 24);
});

test('a night that is still to come shows as a banner; tonight\'s own night does not', () => {
    const now = new Date(2026, 10, 20, 20, 30); // next Friday, the group is playing again
    assert.strictEqual(stamp(w.tonightEnds(now)), '2026-11-21 05:00 6');
    assert.strictEqual(stamp(w.tonightEnds(new Date(2026, 10, 21, 1, 0))), '2026-11-21 05:00 6');
    // The night they are at (21:00 tonight, or past midnight): the button offers the next one.
    assert.strictEqual(w.nextWeekView(new Date(2026, 10, 20, 21, 0).getTime(), now), 'button');
    assert.strictEqual(w.nextWeekView(new Date(2026, 10, 20, 21, 0).getTime(), new Date(2026, 10, 21, 0, 30)), 'button');
    assert.strictEqual(w.nextWeekView(new Date(2026, 10, 13, 21, 0).getTime(), now), 'button');
    // Next week's night, set a moment ago: the banner.
    assert.strictEqual(w.nextWeekView(new Date(2026, 10, 27, 21, 0).getTime(), now), 'banner');
    assert.strictEqual(w.nextWeekView(new Date(2026, 10, 21, 20, 0).getTime(), now), 'banner');
    for (const nothing of [undefined, null, 'soon', NaN]) {
        assert.strictEqual(w.nextWeekView(nothing, now), 'button');
    }
});

test('who is in: the names on the night\'s list, and whoever proposed it', () => {
    const night = { time: 1, by: 'Omer', in: { 'omer': 'Omer', 'noa b': 'Noa B' } };
    assert.strictEqual(w.isIn(night, 'omer '), true);
    assert.strictEqual(w.isIn(night, 'NOA  B'), true);
    assert.strictEqual(w.isIn(night, 'Dana'), false);
    assert.strictEqual(w.isIn({ time: 1, by: 'Dana' }, 'dana'), true);
    // Older data keeps true for a name.
    assert.strictEqual(w.isIn({ time: 1, by: '', in: { dana: true } }, 'Dana'), true);
    assert.strictEqual(w.isIn(null, 'Dana'), false);
    assert.strictEqual(w.isIn(night, ''), false);
    assert.strictEqual(w.memberKey('a.b#c$d[e]f/g'), 'a_b_c_d_e_f_g');
});

test('a phone counts itself once per game, in the half the server put the game in', () => {
    assert.strictEqual(w.seenMethod(true), 'seen-card');
    assert.strictEqual(w.seenMethod(false), 'seen-control');
    for (const out of [undefined, null, 'true', 1]) {
        assert.strictEqual(w.seenMethod(out), null);
    }
    assert.deepStrictEqual(w.parseSeen('not json'), []);
    assert.deepStrictEqual(w.parseSeen('{"a":1}'), []);
    let seen = w.addSeen(w.parseSeen(null), 'jvqp');
    assert.deepStrictEqual(seen, ['JVQP']);
    assert.strictEqual(w.addSeen(seen, 'JVQP'), null, 'the same game again (a reload) is not counted');
    for (let i = 0; i < 20; i++) seen = w.addSeen(seen, 'P' + i) || seen;
    assert.strictEqual(seen.length, 12);
    assert.strictEqual(seen[0], 'P19');
});

test('the buttons swap after 40 seconds only when nobody pressed REMATCH', () => {
    assert.strictEqual(w.buttonsSwap(39000, false), false);
    assert.strictEqual(w.buttonsSwap(40000, false), true);
    assert.strictEqual(w.buttonsSwap(90000, true), false);
});

test('the final screen: the new button replaces the save-crew offer, and its sheet keeps the player here', () => {
    const dir = path.join(app, 'pages', 'score-board-final');
    const html = fs.readFileSync(path.join(dir, 'score-board-final.component.html'), 'utf8');
    const code = fs.readFileSync(path.join(dir, 'score-board-final.component.ts'), 'utf8');
    assert.match(html, /<app-next-week \*ngIf="nextWeekOn"/);
    assert.match(html, /class="button is-info is-fullwidth save-crew"/);
    assert.match(html, /\*ngIf="!crewId && !naming && displayPlayers\.length > 1 && !nextWeekOn"/);
    assert.match(code, /return !!this\.sheetOpen \|\| !!this\.nextWeekSheet \|\|/);
    assert.match(code, /this\.hadCrew === false && !this\.presenter && !this\.soloTaste && !this\.nextWeekOn/);
});

test('a date other than the one offered is a game night, not "same time next week"', () => {
    const offered = new Date(2026, 10, 20, 21, 0);
    const sunday = new Date(2026, 10, 15, 19, 45);
    assert.strictEqual(w.nextWeekText({ winner: false, when: sunday, leader: 'Dana leads 2 to 0', locale: 'en', offered }),
        'I want a rematch. Bullshit game night: Sunday 15 November, 19:45. Dana leads 2 to 0. Who\'s in? Tap here:');
    assert.strictEqual(w.nextWeekText({ winner: true, when: sunday, leader: '', locale: 'he', offered }),
        'בואו לקחת לי את התואר. ערב בולשיט: יום ראשון, 15 בנובמבר, 19:45. מי בפנים? לוחצים כאן:');
    // The date offered keeps its words; so does a message with no offered date.
    assert.strictEqual(w.nextWeekText({ winner: false, when: new Date(offered), leader: '', locale: 'he', offered }),
        'מגיע לי משחק חוזר. בולשיט, אותה שעה בשבוע הבא: יום שישי, 20 בנובמבר, 21:00. מי בפנים? לוחצים כאן:');
    // Only the time changed: still another night.
    assert.match(w.nextWeekText({ winner: false, when: new Date(2026, 10, 20, 20, 30), leader: '', locale: 'en', offered }),
        /^I want a rematch\. Bullshit game night: Friday 20 November, 20:30\./);
});

test('the leader line in the message: "בראש" in Hebrew, the crew page\'s line in English and for a tie', () => {
    const rows = [{ nickname: 'יוסי', wins: 2 }, { nickname: 'דנה', wins: 0 }];
    assert.strictEqual(w.messageLeader(rows, 'יוסי מוביל/ה 2–0', 'he'), 'יוסי בראש, 2–0');
    assert.strictEqual(w.messageLeader([{ nickname: 'יוסי', wins: 2 }], 'יוסי מוביל/ה עם 2', 'he'), 'יוסי בראש עם 2');
    assert.strictEqual(w.messageLeader([{ nickname: 'מיכל', wins: 1 }, { nickname: 'דנה', wins: 1 }], 'תיקו 1–1 בין מיכל ל־דנה', 'he'),
        'תיקו 1–1 בין מיכל ל־דנה');
    assert.strictEqual(w.messageLeader([{ nickname: 'Dana', wins: 2 }, { nickname: 'Avi', wins: 1 }], 'Dana leads 2 to 1', 'en'),
        'Dana leads 2 to 1');
    assert.strictEqual(w.messageLeader([{ nickname: 'Dana', wins: 0 }], 'No winner yet. Who takes the first one?', 'en'), '');
    assert.strictEqual(w.messageLeader([], 'x', 'he'), '');
    // In the message itself: no slash.
    const text = w.nextWeekText({ winner: false, when: new Date(2026, 10, 20, 21), leader: w.messageLeader(rows, '', 'he'), locale: 'he' });
    assert.strictEqual(text, 'מגיע לי משחק חוזר. בולשיט, אותה שעה בשבוע הבא: יום שישי, 20 בנובמבר, 21:00. יוסי בראש, 2–0. מי בפנים? לוחצים כאן:');
    assert.ok(!/\//.test(text));
});

test('the big screen asks until a phone sets the date, then shows the date', () => {
    const now = new Date(2026, 10, 13, 22, 30);
    const night = new Date(2026, 10, 20, 21, 0).getTime();
    assert.strictEqual(w.bigScreenLine(undefined, now, 'en'), 'Same time next week? It\'s on your phones.');
    assert.strictEqual(w.bigScreenLine(night, now, 'en'), 'Next game night: Friday 20 November, 21:00');
    assert.strictEqual(w.bigScreenLine(night, now, 'he'), 'ערב המשחק הבא: יום שישי, 20 בנובמבר, 21:00');
    // Tonight's own night is the one being played: the ask stays.
    assert.strictEqual(w.bigScreenLine(new Date(2026, 10, 13, 21, 0).getTime(), now, 'he'), 'אותה שעה בשבוע הבא? זה אצלכם בטלפונים.');
});

test('a date another phone set while this sheet was open takes the sheet over; this phone\'s own does not', () => {
    const now = new Date(2026, 10, 13, 22, 30);
    const a = new Date(2026, 10, 22, 21, 0).getTime();
    const b = new Date(2026, 10, 20, 21, 0).getTime();
    // The sheet opened with no night: A's night arrives, the sheet shows it.
    assert.strictEqual(w.nightTaken(a, null, null, now), true);
    // This phone sent B, and the crew has B: its own.
    assert.strictEqual(w.nightTaken(b, null, b, now), false);
    // This phone sent B, but the server kept A (sent first): the sheet shows A.
    assert.strictEqual(w.nightTaken(a, null, b, now), true);
    // The sender changing their night: the night it opened on is not "taken".
    assert.strictEqual(w.nightTaken(a, a, null, now), false);
    // No night, or one that is tonight or past: nothing to show.
    assert.strictEqual(w.nightTaken(undefined, null, null, now), false);
    assert.strictEqual(w.nightTaken(new Date(2026, 10, 13, 21).getTime(), null, null, now), false);
});

test('the sheet sends the night it opened on, shows a taken night with I\'M IN, and the sender\'s banner can change it', () => {
    const dir = path.join(app, 'components', 'next-week');
    const html = fs.readFileSync(path.join(dir, 'next-week.component.html'), 'utf8');
    const code = fs.readFileSync(path.join(dir, 'next-week.component.ts'), 'utf8');
    assert.match(code, /time: sentNight, by: this\.myNickname \|\| '', prev: this\.seenNight, tz: new Date\(\)\.getTimezoneOffset\(\),/);
    assert.match(code, /!this\.nameError && !this\.taken;/);
    assert.match(html, /<div \*ngIf="taken" class="sheet-taken">/);
    assert.match(html, /<ng-container \*ngIf="!taken">/);
    assert.match(html, /<button \*ngIf="mineNight" class="button is-small is-text banner-change" type="button" \(click\)="changeNight\(\)">/);
    // The message knows which date the sheet offered first.
    assert.match(code, /offered: this\.offered/);
});

test('a date that lost says which night stands, in English and Hebrew, with the night for the group', () => {
    const now = new Date(2026, 10, 13, 22, 30);
    const a = new Date(2026, 10, 21, 16, 30).getTime();
    const b = new Date(2026, 10, 20, 21, 0).getTime();
    // This phone sent B, the server kept A: lost, while A is still ahead.
    assert.strictEqual(w.nightLost(a, b, now), true);
    // Nothing lost, or the crew moved to this phone's date after all, or A is tonight's: nothing to say.
    assert.strictEqual(w.nightLost(a, null, now), false);
    assert.strictEqual(w.nightLost(b, b, now), false);
    assert.strictEqual(w.nightLost(new Date(2026, 10, 13, 23, 0).getTime(), b, now), false);
    assert.strictEqual(w.nightLost(undefined, b, now), false);

    const whenEn = n.nightLabel(new Date(a), 'en');
    const whenHe = n.nightLabel(new Date(a), 'he');
    assert.strictEqual(w.nextWeekStrings.en.lost('Ana', whenEn), 'Ana set Saturday 21 November, 16:30 first. Tell the group?');
    assert.strictEqual(w.nextWeekStrings.en.lost('', whenEn), 'Another phone set Saturday 21 November, 16:30 first. Tell the group?');
    assert.strictEqual(w.nextWeekStrings.he.lost('מיכל', whenHe), `קודם נקבע ${whenHe} (הצעה של מיכל). לעדכן את הקבוצה?`);
    assert.strictEqual(w.nextWeekStrings.he.lost('', whenHe), `קודם נקבע ${whenHe}. לעדכן את הקבוצה?`);
    assert.strictEqual(w.nextWeekStrings.en.tellText(whenEn),
        'Change of plan: Bullshit game night is Saturday 21 November, 16:30. Who\'s in? Tap here:');
    assert.match(w.nextWeekStrings.he.tellText(whenHe), /^שינוי בתוכנית: ערב בולשיט נקבע ליום שבת, 21 בנובמבר, 16:30\. מי בפנים\? לוחצים כאן:$/);
    // No gendered slash in the Hebrew.
    assert.doesNotMatch(w.nextWeekStrings.he.lost('מיכל', whenHe) + w.nextWeekStrings.he.tell + w.nextWeekStrings.he.tellText(whenHe), /\//);

    const dir = path.join(app, 'components', 'next-week');
    const html = fs.readFileSync(path.join(dir, 'next-week.component.html'), 'utf8');
    const code = fs.readFileSync(path.join(dir, 'next-week.component.ts'), 'utf8');
    // The line shows on the taken sheet and on the banner; only the server's `kept` makes a date lost.
    assert.match(html, /<div \*ngIf="lost" class="sheet-lost">/);
    assert.match(html, /<div \*ngIf="lost" class="banner-lost">/);
    assert.match(code, /if \(answer\.kept\) \{\s*this\.lostNight = sentNight;/);
    // The press is counted, and the server knows the method.
    assert.match(code, /this\.count\('tell'\)/);
    const analytics = fs.readFileSync(path.join(__dirname, '..', '..', 'functions', 'src', 'controllers', 'analytics.ts'), 'utf8');
    assert.match(analytics, /'next-week': \[[^\]]*'tell'\]/);
});

test('"You\'re in" and CHANGE go by the server\'s answer, not by the date this phone sent', () => {
    const code = fs.readFileSync(path.join(app, 'components', 'next-week', 'next-week.component.ts'), 'utf8');
    const imIn = code.slice(code.indexOf('get imIn()'), code.indexOf('get mineNight()'));
    const mine = code.slice(code.indexOf('get mineNight()'), code.indexOf('get lost()'));
    assert.doesNotMatch(imIn, /sentNight/);
    assert.doesNotMatch(mine, /sentNight/);
    assert.match(imIn, /this\.setByMe === time/);
    assert.match(mine, /this\.setByMe === night\.time/);
    // The answer sets it, and only for the latest send.
    assert.match(code, /if \(this\.sentNight !== sentNight \|\| !answer \|\| !answer\.night\) \{\s*return;/);
    assert.match(code, /this\.setByMe = answer\.night\.time;/);
});

test('the phone and the server tell "still ahead" by one rule', () => {
    const m = load(path.join(app, 'game-model.ts'));
    // The phone's rule is the shared one, on its own clock.
    const now = new Date(2026, 10, 20, 20, 30);
    assert.strictEqual(w.tonightEnds(now).getTime(), m.tonightEndsAt(now.getTime(), now.getTimezoneOffset()));
    // Israel in winter is -120: tonight ends at 05:00 Israel, 03:00Z, the server's sum for the same phone.
    const at = Date.UTC(2026, 10, 20, 18, 30);
    assert.strictEqual(m.tonightEndsAt(at, -120), Date.UTC(2026, 10, 21, 3, 0));
    // 01:00 Israel (23:00Z) is still the same night; 05:00 Israel starts the next one.
    assert.strictEqual(m.tonightEndsAt(Date.UTC(2026, 10, 20, 23, 0), -120), Date.UTC(2026, 10, 21, 3, 0));
    assert.strictEqual(m.tonightEndsAt(Date.UTC(2026, 10, 21, 3, 0), -120), Date.UTC(2026, 10, 22, 3, 0));
    // New York (300): 05:00 there is 10:00Z.
    assert.strictEqual(m.tonightEndsAt(Date.UTC(2026, 10, 21, 2, 0), 300), Date.UTC(2026, 10, 21, 10, 0));
    // A night later tonight is not ahead; tomorrow's is.
    assert.strictEqual(m.nightStillAhead(Date.UTC(2026, 10, 20, 20, 0), at, -120), false);
    assert.strictEqual(m.nightStillAhead(Date.UTC(2026, 10, 21, 18, 0), at, -120), true);
    assert.strictEqual(m.nightStillAhead('x', at, -120), false);
    // Only a real clock offset is one.
    assert.strictEqual(m.cleanTzOffset(-120), -120);
    assert.strictEqual(m.cleanTzOffset(0), 0);
    [undefined, null, '-120', 1.5, NaN, 900, -900].forEach(v => assert.strictEqual(m.cleanTzOffset(v), null, String(v)));
});
