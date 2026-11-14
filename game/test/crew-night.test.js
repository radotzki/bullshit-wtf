// Tests for WHO'S IN? on the crew page (src/app/pages/crew/crew-night.ts) and its words.
// Run: npm test (from game/). Needs Node 20+.
process.env.TZ = 'Asia/Jerusalem';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load(...parts) {
    const file = path.join(__dirname, '..', 'src', 'app', ...parts);
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5, lib: ['es2016', 'dom'] },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const n = load('pages', 'crew', 'crew-night.ts');
const { crewStrings } = load('pages', 'crew', 'crew-strings.ts');
const { homeStrings } = load('pages', 'landing', 'home-strings.ts');

const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min).getTime();
// Friday 20 November 2026, 21:00.
const night = at(2026, 11, 20, 21);
const HOUR = 3600 * 1000;

test('the page has three states by the clock: before, on the night, and passed', () => {
    assert.strictEqual(n.nightState(undefined, night), 'none');
    assert.strictEqual(n.nightState(null, night), 'none');
    assert.strictEqual(n.nightState(night, at(2026, 11, 14, 10)), 'before');
    assert.strictEqual(n.nightState(night, at(2026, 11, 20, 18, 59)), 'before');
    // from two hours before the time...
    assert.strictEqual(n.nightState(night, at(2026, 11, 20, 19, 0)), 'tonight');
    assert.strictEqual(n.nightState(night, at(2026, 11, 20, 23, 30)), 'tonight');
    // ...until 05:00 the next morning
    assert.strictEqual(n.nightState(night, at(2026, 11, 21, 4, 59)), 'tonight');
    assert.strictEqual(n.nightState(night, at(2026, 11, 21, 5, 0)), 'passed');
    assert.strictEqual(n.nightState(night, at(2026, 11, 24, 12)), 'passed');
});

test('a night the crew played is over, not "passed", and the offer of a new one ends after a week', () => {
    const after = at(2026, 11, 21, 9);
    assert.strictEqual(n.nightState(night, after, night + HOUR), 'over');
    // a game up to 12 hours before the time counts as the night (they started early)
    assert.strictEqual(n.nightState(night, after, night - 11 * HOUR), 'over');
    assert.strictEqual(n.nightState(night, after, night - 13 * HOUR), 'passed');
    // last week's game is not this night
    assert.strictEqual(n.nightState(night, after, at(2026, 11, 13, 22)), 'passed');
    assert.strictEqual(n.nightState(night, at(2026, 11, 28, 4, 59)), 'passed');
    assert.strictEqual(n.nightState(night, at(2026, 11, 28, 5, 0)), 'over');
    // while it is on, a game already played does not take the button away
    assert.strictEqual(n.nightState(night, at(2026, 11, 20, 22), night + 30 * 60 * 1000), 'tonight');
});

test('a night set for after midnight still ends at 05:00, and never in under three hours', () => {
    assert.strictEqual(n.nightEnd(night), at(2026, 11, 21, 5));
    const late = at(2026, 11, 21, 0, 30);
    assert.strictEqual(n.nightEnd(late), at(2026, 11, 21, 5));
    assert.strictEqual(n.nightState(late, at(2026, 11, 20, 22, 30)), 'tonight');
    const dawn = at(2026, 11, 21, 4, 30);
    assert.strictEqual(n.nightEnd(dawn), at(2026, 11, 21, 7, 30));
    const morning = at(2026, 11, 21, 10);
    assert.strictEqual(n.nightEnd(morning), at(2026, 11, 22, 5));
});

test('the countdown: in 6 days, tomorrow, tonight', () => {
    assert.strictEqual(n.countdown(night, at(2026, 11, 14, 23, 50), 'en'), 'in 6 days');
    assert.strictEqual(n.countdown(night, at(2026, 11, 18, 0, 5), 'en'), 'in 2 days');
    assert.strictEqual(n.countdown(night, at(2026, 11, 19, 23, 59), 'en'), 'tomorrow');
    assert.strictEqual(n.countdown(night, at(2026, 11, 20, 0, 1), 'en'), 'tonight');
    assert.strictEqual(n.countdown(night, at(2026, 11, 14, 12), 'he'), 'בעוד 6 ימים');
    assert.strictEqual(n.countdown(night, at(2026, 11, 18, 12), 'he'), 'בעוד יומיים');
    assert.strictEqual(n.countdown(night, at(2026, 11, 19, 12), 'he'), 'מחר');
    assert.strictEqual(n.countdown(night, at(2026, 11, 20, 12), 'he'), 'הערב');
    // across the clock change (Israel leaves summer time on 25 October 2026) a day is still a day
    assert.strictEqual(n.daysUntil(at(2026, 10, 30, 21), at(2026, 10, 23, 21)), 7);
});

test('who holds the title: one leader, else the crew\'s leader line', () => {
    const line = 'Dana and Avi are tied 2 to 2';
    assert.strictEqual(n.titleLine([{ nickname: 'Dana', wins: 2 }, { nickname: 'Avi', wins: 1 }], 'Dana leads 2 to 1', 'en'), 'Dana holds the title');
    assert.strictEqual(n.titleLine([{ nickname: 'דנה', wins: 2 }, { nickname: 'אבי', wins: 1 }], 'x', 'he'), 'התואר אצל דנה');
    assert.strictEqual(n.titleLine([{ nickname: 'Dana', wins: 1 }], 'Dana leads with 1', 'en'), 'Dana holds the title');
    assert.strictEqual(n.titleLine([{ nickname: 'Dana', wins: 2 }, { nickname: 'Avi', wins: 2 }], line, 'en'), line);
    assert.strictEqual(n.titleLine([{ nickname: 'Noa', wins: 0 }], 'No winner yet. Who takes the first one?', 'en'), 'No winner yet. Who takes the first one?');
    // a crew with no games yet (a guest's table, before its first night)
    assert.strictEqual(n.titleLine([], 'No winner yet. Who takes the first one?', 'en'), 'No winner yet. Who takes the first one?');
    assert.strictEqual(n.titleLine(undefined, undefined, 'en'), '');
});

test('a phone is in when its nickname is on the list, whatever the case or spacing', () => {
    assert.strictEqual(n.isIn(['Omer', 'Noa'], 'noa'), true);
    assert.strictEqual(n.isIn(['Omer', 'Dana  B'], ' dana b '), true);
    assert.strictEqual(n.isIn(['Omer'], 'Noa'), false);
    assert.strictEqual(n.isIn(['Omer'], undefined), false);
    assert.strictEqual(n.isIn(undefined, 'Omer'), false);
});

test('the home page shows a crew whose night is today, and only then', () => {
    assert.strictEqual(n.tonightTime(night, at(2026, 11, 20, 9)), '21:00');
    assert.strictEqual(n.tonightTime(night, at(2026, 11, 20, 23)), '21:00');
    assert.strictEqual(n.tonightTime(night, at(2026, 11, 21, 2)), '21:00');
    assert.strictEqual(n.tonightTime(night, at(2026, 11, 19, 23)), null);
    assert.strictEqual(n.tonightTime(night, at(2026, 11, 21, 6)), null);
    assert.strictEqual(n.tonightTime(undefined, night), null);
    assert.strictEqual(n.tonightTime(at(2026, 11, 20, 8, 5), at(2026, 11, 20, 7)), '08:05');
    assert.strictEqual(homeStrings('en').tonight('21:00', "Dana's crew"), "TONIGHT 21:00: Dana's crew");
    assert.strictEqual(homeStrings('he').tonight('21:00', 'החבורה של דנה'), 'הערב ב־21:00: החבורה של דנה');
});

test('the words of the night block, in English', () => {
    const t = crewStrings('en');
    assert.strictEqual(t.gameNight, 'GAME NIGHT');
    assert.strictEqual(t.whosIn, "WHO'S IN?");
    assert.strictEqual(t.imIn, "I'M IN");
    assert.strictEqual(t.namePrompt, 'Your name in the game');
    assert.strictEqual(t.youreIn('Friday'), "You're in. See you Friday.");
    assert.strictEqual(t.youreIn(''), "You're in. See you tonight.");
    assert.strictEqual(t.cantMakeIt, "Can't make it");
    assert.strictEqual(t.addToCalendar, 'ADD TO MY CALENDAR');
    assert.strictEqual(t.nudge, 'ASK WHO ELSE IS IN');
    assert.strictEqual(t.nudgeText(3, 'Friday 20 November, 21:00', ['Omer', 'Noa', 'Dana']),
        "3 of us are in for Bullshit on Friday 20 November, 21:00: Omer, Noa, Dana. Who's missing?");
    assert.match(t.whatIsIt, /^Bullshit is a party game on your phones: .* Free, nothing to install\.$/);
    assert.strictEqual(t.itsGameNight, "IT'S GAME NIGHT");
    assert.strictEqual(t.openLobby, 'OPEN THE LOBBY');
    assert.strictEqual(t.inCount(['Omer', 'Noa', 'Dana']), '3 in: Omer, Noa, Dana');
    assert.strictEqual(t.nightPassed, 'That night has passed. Pick a new one?');
    assert.strictEqual(t.pickNight, 'PICK A NIGHT');
});

test('the words of the night block, in Hebrew', () => {
    const t = crewStrings('he');
    assert.strictEqual(t.gameNight, 'ערב המשחק');
    assert.strictEqual(t.whosIn, 'מי בפנים?');
    assert.strictEqual(t.imIn, 'אני בפנים');
    assert.strictEqual(t.namePrompt, 'השם שלך במשחק');
    assert.strictEqual(t.youreIn('יום שישי'), 'נרשמת. נתראה ביום שישי.');
    assert.strictEqual(t.youreIn(''), 'נרשמת. נתראה הערב.');
    assert.strictEqual(t.cantMakeIt, 'לא יוצא לי');
    assert.strictEqual(t.addToCalendar, 'הוספה ליומן שלי');
    assert.strictEqual(t.nudge, 'לשאול מי עוד בא');
    assert.strictEqual(t.nudgeText(3, 'יום שישי, 20 בנובמבר, 21:00', ['עומר', 'נועה', 'דנה']),
        '3 כבר בפנים לבולשיט ביום שישי, 20 בנובמבר, 21:00: עומר, נועה, דנה. מי חסר?');
    assert.match(t.whatIsIt, /^בולשיט הוא משחק חברתי בטלפונים: .* בחינם, בלי להתקין כלום\.$/);
    assert.strictEqual(t.itsGameNight, 'ערב המשחק התחיל');
    assert.strictEqual(t.openLobby, 'פותחים משחק');
    assert.strictEqual(t.inCount(['עומר', 'נועה', 'דנה']), '3 בפנים: עומר, נועה, דנה');
    assert.strictEqual(t.nightPassed, 'הערב הזה עבר. קובעים חדש?');
    assert.strictEqual(t.pickNight, 'קביעת ערב');
});
