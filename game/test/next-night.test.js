// Tests for "pick the next game night" on the crew page (src/app/pages/crew/next-night.ts).
// Run: npm test (from game/). Needs Node 20+.
process.env.TZ = 'Asia/Jerusalem';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load() {
    const file = path.join(__dirname, '..', 'src', 'app', 'pages', 'crew', 'next-night.ts');
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5, lib: ['es2016', 'dom'] },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const n = load();
const info = { crewName: 'Office Friday', leader: 'Alice leads 4 to 3', url: 'https://bullshit.wtf/c/g4d48z?via=crew', locale: 'en' };
const he = { crewName: 'המשפחה', leader: 'דנה מוביל/ה 4–3', url: 'https://bullshit.wtf/he/c/abc123?via=crew', locale: 'he' };

test('default is the coming Friday at 21:00', () => {
    const thu = new Date(2026, 10, 5, 18, 0); // Thursday 5 Nov 2026
    const d = n.defaultNight(thu);
    assert.strictEqual(n.dateValue(d), '2026-11-06');
    assert.strictEqual(n.timeValue(d), '21:00');
});

test('late on Friday it moves to next week', () => {
    assert.strictEqual(n.dateValue(n.defaultNight(new Date(2026, 10, 6, 20, 0))), '2026-11-13');
    assert.strictEqual(n.dateValue(n.defaultNight(new Date(2026, 10, 6, 12, 0))), '2026-11-06');
    assert.strictEqual(n.dateValue(n.defaultNight(new Date(2026, 10, 7, 12, 0))), '2026-11-13');
});

test('Hebrew crews default to Friday at 21:00 too, like English crews', () => {
    const wed = new Date(2026, 10, 4, 12, 0); // Wednesday 4 Nov 2026
    assert.strictEqual(n.dateValue(n.defaultNight(wed, 'he')), '2026-11-06');
    assert.strictEqual(n.timeValue(n.defaultNight(wed, 'he')), '21:00');
    assert.strictEqual(n.defaultNight(wed, 'he').getDay(), 5);
    assert.strictEqual(n.dateValue(n.defaultNight(wed, 'en')), '2026-11-06');
    assert.strictEqual(n.dateValue(n.defaultNight(wed)), '2026-11-06');
    // Thursday evening points to the next day; late on Friday it moves to next Friday.
    assert.strictEqual(n.dateValue(n.defaultNight(new Date(2026, 10, 5, 20, 0), 'he')), '2026-11-06');
    assert.strictEqual(n.dateValue(n.defaultNight(new Date(2026, 10, 6, 12, 0), 'he')), '2026-11-06');
    assert.strictEqual(n.dateValue(n.defaultNight(new Date(2026, 10, 6, 20, 0), 'he')), '2026-11-13');
});

test('the weekly entry repeats on the night\'s weekday at local time, with the crew link, in English', () => {
    const d = n.parseNight('2026-11-13', '21:00');
    const ics = n.buildWeeklyCrewIcs(d, info, 'g4d48z', new Date(Date.UTC(2026, 10, 12, 18, 0)));
    const unfolded = ics.replace(/\r\n /g, '');
    assert.ok(unfolded.includes('RRULE:FREQ=WEEKLY;BYDAY=FR\r\n'));
    // Floating times: 21:00 wherever the phone is, in winter and in summer.
    assert.ok(unfolded.includes('DTSTART:20261113T210000\r\n'));
    assert.ok(unfolded.includes('DTEND:20261113T223000\r\n'));
    assert.ok(unfolded.includes('UID:g4d48z-weekly@bullshit.wtf\r\n'));
    assert.ok(unfolded.includes('URL:https://bullshit.wtf/c/g4d48z?via=crew\r\n'));
    assert.ok(unfolded.includes('DESCRIPTION:Bullshit night for Office Friday\\, every Friday at 21:00. Alice leads 4 to 3. Scores and rematch here:\\nhttps://bullshit.wtf/c/g4d48z?via=crew\r\n'));
    assert.ok(unfolded.includes('BEGIN:VALARM'));
    ics.split('\r\n').forEach(line => assert.ok(Buffer.byteLength(line, 'utf8') <= 75, line));
    assert.strictEqual(n.weeklyFileName('Office Friday'), 'bullshit-office-friday-weekly.ics');
    assert.strictEqual(n.weekdayName(d, 'en'), 'Friday');
});

test('the weekly entry in Hebrew, and on another weekday when the crew picks one', () => {
    const d = n.parseNight('2026-11-13', '21:00');
    assert.strictEqual(n.weeklyText(d, he), 'ערב בולשיט של המשפחה, כל יום שישי ב-21:00. דנה מוביל/ה 4–3. הטבלה והמשחק החוזר כאן:');
    const ics = n.buildWeeklyCrewIcs(d, he, 'abc123', new Date());
    const unfolded = ics.replace(/\r\n /g, '');
    assert.ok(unfolded.includes('SUMMARY:ערב בולשיט: המשפחה\r\n'));
    assert.ok(unfolded.includes('https://bullshit.wtf/he/c/abc123?via=crew'));
    ics.split('\r\n').forEach(line => assert.ok(Buffer.byteLength(line, 'utf8') <= 75, line));
    const sat = n.parseNight('2026-11-14', '20:30');
    assert.strictEqual(n.weeklyRule(sat), 'RRULE:FREQ=WEEKLY;BYDAY=SA');
    assert.ok(n.weeklyText(sat, info).includes('every Saturday at 20:30'));
});

test('the weekly Google Calendar link repeats every week in the phone\'s time zone', () => {
    const d = n.parseNight('2026-11-13', '21:00');
    const url = n.googleWeeklyUrl(d, info, 'Asia/Jerusalem');
    assert.ok(url.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE'));
    assert.ok(url.includes('&dates=20261113T210000/20261113T223000'));
    assert.ok(url.includes('&ctz=Asia%2FJerusalem'));
    assert.ok(url.includes('&recur=' + encodeURIComponent('RRULE:FREQ=WEEKLY;BYDAY=FR')));
    assert.ok(decodeURIComponent(url).includes('https://bullshit.wtf/c/g4d48z?via=crew'));
    assert.ok(!n.googleWeeklyUrl(d, info).includes('ctz='));
});

test('inputs round-trip and bad input is refused', () => {
    const d = n.parseNight('2026-11-13', '20:30');
    assert.strictEqual(d.getHours(), 20);
    assert.strictEqual(n.dateValue(d) + ' ' + n.timeValue(d), '2026-11-13 20:30');
    assert.strictEqual(n.parseNight('', '20:30'), undefined);
    assert.strictEqual(n.parseNight('2026-11-13', ''), undefined);
    assert.strictEqual(n.parseNight('13/11/2026', '20:30'), undefined);
});

test('WhatsApp text names the crew, the night and the leader', () => {
    const d = n.parseNight('2026-11-13', '21:00');
    assert.strictEqual(n.nightText(d, info),
        'Bullshit game night for Office Friday: Friday 13 November, 21:00. Alice leads 4 to 3. Scores and rematch here:');
    const t = n.nightText(d, he);
    assert.ok(t.startsWith('ערב בולשיט של המשפחה: '), t);
    assert.ok(t.includes('21:00') && t.includes('נובמבר') && t.includes('שישי'), t);
});

test('no full stop is added after a leader line that ends in a question mark', () => {
    const d = n.parseNight('2026-11-13', '21:00');
    const t = n.nightText(d, Object.assign({}, info, { leader: 'No winner yet. Who takes the first one?' }));
    assert.strictEqual(t, 'Bullshit game night for Office Friday: Friday 13 November, 21:00. No winner yet. Who takes the first one? Scores and rematch here:');
    const h = n.nightText(d, Object.assign({}, he, { leader: 'עוד אין מנצחים. מי לוקח את הראשון?' }));
    assert.ok(h.includes('מי לוקח את הראשון? הטבלה'), h);
    assert.ok(!h.includes('?.'), h);
    assert.strictEqual(n.nightText(d, Object.assign({}, info, { leader: '' })),
        'Bullshit game night for Office Friday: Friday 13 November, 21:00. Scores and rematch here:');
});

test('calendar file is a valid one-event VCALENDAR in UTC with the crew link', () => {
    const d = n.parseNight('2026-11-13', '21:00'); // 19:00 UTC in Israel winter time
    const ics = n.buildIcs(d, info, 'g4d48z', new Date(Date.UTC(2026, 10, 5, 17, 0, 0)));
    const lines = ics.split('\r\n');
    assert.strictEqual(lines[0], 'BEGIN:VCALENDAR');
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
    assert.ok(lines.includes('DTSTART:20261113T190000Z'));
    assert.ok(lines.includes('DTEND:20261113T203000Z'));
    assert.ok(lines.includes('DTSTAMP:20261105T170000Z'));
    assert.ok(lines.includes('UID:g4d48z-20261113T190000Z@bullshit.wtf'));
    assert.ok(lines.includes('SUMMARY:Bullshit game night: Office Friday'));
    assert.ok(lines.includes('URL:https://bullshit.wtf/c/g4d48z?via=crew'));
    assert.ok(lines.includes('TRIGGER:-PT1H'));
    const unfolded = ics.replace(/\r\n /g, '');
    assert.ok(unfolded.includes('DESCRIPTION:Bullshit game night for Office Friday: Friday 13 November\\, 21:00. Alice leads 4 to 3. Scores and rematch here:\\nhttps://bullshit.wtf/c/g4d48z?via=crew'));
    assert.strictEqual(ics.split('BEGIN:VEVENT').length, 2);
});

test('long and Hebrew lines are folded under 75 bytes without splitting a letter', () => {
    const d = n.parseNight('2026-11-13', '21:00');
    const ics = n.buildIcs(d, he, 'abc123', new Date());
    for (const line of ics.split('\r\n')) {
        assert.ok(Buffer.byteLength(line, 'utf8') <= 75, line);
        assert.ok(!line.includes('�'));
    }
    const unfolded = ics.replace(/\r\n /g, '');
    assert.ok(unfolded.includes('SUMMARY:ערב בולשיט: המשפחה'));
});

test('Google Calendar link carries the same times', () => {
    const d = n.parseNight('2026-11-13', '21:00');
    const url = n.googleCalendarUrl(d, info);
    assert.ok(url.includes('&dates=20261113T190000Z/20261113T203000Z'));
    assert.ok(url.includes(encodeURIComponent('https://bullshit.wtf/c/g4d48z?via=crew')));
});

test('file name is safe', () => {
    assert.strictEqual(n.icsFileName('Office Friday!'), 'bullshit-office-friday.ics');
    assert.strictEqual(n.icsFileName('המשפחה'), 'bullshit-game-night.ics');
});
