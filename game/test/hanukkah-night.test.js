// Tests for Hanukkah night on the final screen (src/app/components/hanukkah-night/hanukkah-night.ts):
// which night it is, by the player's own clock, the button's calendar entry and its tagged link, and
// REMIND ME stepping aside. The clock is set to Hanukkah 2026: the first candle on the evening of
// Friday 4 December, the eighth on Friday 11 December.
// Run: npm test (from game/). Needs Node 20+.
process.env.TZ = 'Asia/Jerusalem';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const app = path.join(__dirname, '..', 'src', 'app');

function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5, lib: ['es2016', 'dom'] },
    }).outputText;
    const mod = { exports: {} };
    const req = name => name.startsWith('.') ? load(path.join(path.dirname(file), name + '.ts')) : require(name);
    new Function('module', 'exports', 'require', out)(mod, mod.exports, req);
    return mod.exports;
}

const k = load(path.join(app, 'components', 'hanukkah-night', 'hanukkah-night.ts'));
const n = load(path.join(app, 'pages', 'crew', 'next-night.ts'));
const at = (d, h, m = 0) => { const [y, mo, day] = d.split('-').map(Number); return new Date(y, mo - 1, day, h, m); };
const phone = { presenter: false, player: true, soloTaste: false, players: 4 };

test('night 1 on the evening of 4 December, a middle night, and night 8 on 11 December', () => {
    assert.strictEqual(k.hanukkahNight(at('2026-12-04', 20), 'he', 'hanukkah'), 1);
    assert.strictEqual(k.hanukkahNight(at('2026-12-07', 21, 30), 'he', 'hanukkah'), 4);
    assert.strictEqual(k.hanukkahNight(at('2026-12-11', 22), 'he', 'hanukkah'), 8);
});

test('the evening runs on past midnight, until 05:00', () => {
    assert.strictEqual(k.hanukkahNight(at('2026-12-05', 0, 40), 'he', 'hanukkah'), 1);
    assert.strictEqual(k.hanukkahNight(at('2026-12-05', 4, 59), 'he', 'hanukkah'), 1);
    assert.strictEqual(k.hanukkahNight(at('2026-12-05', 5, 0), 'he', 'hanukkah'), 2);
    assert.strictEqual(k.hanukkahNight(at('2026-12-12', 1, 30), 'he', 'hanukkah'), 8, 'the eighth evening, after midnight');
});

test('no night before the first candle or after the eighth', () => {
    assert.strictEqual(k.hanukkahNight(at('2026-12-03', 21), 'he', 'hanukkah'), null, 'the eve of the first candle');
    assert.strictEqual(k.hanukkahNight(at('2026-12-04', 3), 'he', 'hanukkah'), null, 'the night before, after midnight');
    assert.strictEqual(k.hanukkahNight(at('2026-12-12', 5, 0), 'he', 'hanukkah'), null);
    assert.strictEqual(k.hanukkahNight(at('2026-12-12', 21), 'he', 'hanukkah'), null);
    assert.strictEqual(k.hanukkahNight(at('2026-11-18', 21), 'he', 'hanukkah'), null);
    assert.strictEqual(k.hanukkahNight(at('2027-12-07', 21), 'he', 'hanukkah'), null, 'another year');
});

test('a Hebrew game, or a game of the Hanukkah pack; not an English Christmas game', () => {
    const t = at('2026-12-06', 20);
    assert.strictEqual(k.hanukkahNight(t, 'he', null), 3);
    assert.strictEqual(k.hanukkahNight(t, 'en', 'hanukkah'), 3);
    assert.strictEqual(k.hanukkahNight(t, 'en', 'christmas'), null);
    assert.strictEqual(k.hanukkahNight(t, 'en', null), null);
});

test('by the player\'s own clock: a family in New York has its own night', () => {
    // 4 December 20:00 in New York is 5 December 03:00 in Jerusalem: still night 1 on both clocks.
    const save = process.env.TZ;
    try {
        process.env.TZ = 'America/New_York';
        const ny = new Date(2026, 11, 4, 20, 0);
        assert.strictEqual(k.hanukkahNight(ny, 'en', 'hanukkah'), 1);
        assert.strictEqual(k.hanukkahNight(new Date(2026, 11, 3, 22, 0), 'en', 'hanukkah'), null);
    } finally {
        process.env.TZ = save;
    }
});

test('the screen: the line everywhere, the button on a player\'s phone while there is a tomorrow', () => {
    const v = k.nightView(at('2026-12-06', 21), 'he', 'hanukkah', phone);
    assert.deepStrictEqual(v, { night: 3, next: 4, button: true });
    assert.deepStrictEqual(k.nightView(at('2026-12-06', 21), 'he', 'hanukkah', { ...phone, presenter: true }),
        { night: 3, next: 4, button: false }, 'the big screen: line only');
    assert.strictEqual(k.nightView(at('2026-12-06', 21), 'he', 'hanukkah', { ...phone, player: false }).button, false, 'a watcher');
    assert.strictEqual(k.nightView(at('2026-12-06', 21), 'he', 'hanukkah', { ...phone, players: 1 }).button, false, 'played alone');
    assert.strictEqual(k.nightView(at('2026-12-06', 21), 'he', 'hanukkah', { ...phone, soloTaste: true }), null);
    assert.deepStrictEqual(k.nightView(at('2026-12-11', 21), 'he', 'hanukkah', phone), { night: 8, next: null, button: false },
        'night 8: no tomorrow');
    assert.deepStrictEqual(k.nightView(at('2026-12-04', 19), 'en', 'hanukkah', phone), { night: 1, next: 2, button: true });
    assert.strictEqual(k.nightView(at('2026-12-15', 21), 'he', 'hanukkah', phone), null, 'after Hanukkah: nothing new');
    assert.strictEqual(k.nightView(at('2026-11-18', 21), 'he', null, phone), null, 'today: nothing new');
});

test('words, in English and Hebrew', () => {
    assert.strictEqual(k.nightStrings('en').line(3), 'Hanukkah, night 3 of 8');
    assert.strictEqual(k.nightStrings('he').line(3), 'חנוכה, נר 3 מתוך 8');
    assert.strictEqual(k.nightStrings('en').button(4), 'SAME TABLE TOMORROW: NIGHT 4');
    assert.strictEqual(k.nightStrings('he').button(4), 'אותו שולחן מחר: נר 4');
    for (const lang of ['en', 'he']) {
        const t = k.nightStrings(lang);
        for (const key of Object.keys(k.hanukkahNightStrings.en)) {
            assert.ok(t[key], `${lang} has ${key}`);
        }
    }
});

test('tomorrow evening, at about tonight\'s time, and never skipping a night after midnight', () => {
    const same = (a, b) => assert.strictEqual(a.toString(), b.toString());
    same(k.tomorrowNight(at('2026-12-06', 21, 40)), at('2026-12-07', 21, 0));
    same(k.tomorrowNight(at('2026-12-06', 20, 10)), at('2026-12-07', 19, 30));
    same(k.tomorrowNight(at('2026-12-06', 23, 50)), at('2026-12-07', 21, 30), 'no later than 21:30');
    same(k.tomorrowNight(at('2026-12-06', 15, 0)), at('2026-12-07', 18, 0), 'no earlier than 18:00');
    same(k.tomorrowNight(at('2026-12-07', 0, 40)), at('2026-12-07', 21, 0), 'after midnight: this evening, 21:00');
    same(k.tomorrowNight(at('2026-12-06', 0, 20)), at('2026-12-06', 21, 0));
});

test('the calendar entry: the table\'s own join page, tagged with the night it is for', () => {
    const start = at('2026-12-07', 21);
    const e = k.tableEvent(start, 'abcd', 'he', 4);
    assert.strictEqual(e.url, 'https://bullshit.wtf/he/join-game/ABCD?via=hanukkah-night-4');
    assert.strictEqual(e.title, 'נר 4 של חנוכה: בולשיט, אותו שולחן');
    assert.strictEqual(k.tableEvent(start, 'ABCD', 'en', 4).url, 'https://bullshit.wtf/join-game/ABCD?via=hanukkah-night-4');
    const ics = n.buildEventIcs(start, k.tableEvent(start, 'ABCD', 'en', 4), at('2026-12-06', 21));
    assert.ok(ics.includes('join-game/ABCD?via=hanukkah-night-4'), ics);
    assert.ok(/DTSTART[^\n]*20261207T190000Z|DTSTART[^\n]*20261207T210000/.test(ics), ics);
    assert.ok(n.googleEventUrl(start, e).includes(encodeURIComponent('he/join-game/ABCD')));
});

test('the tag reads back to its night, and nothing else reads as one', () => {
    for (let i = 2; i <= 8; i++) {
        assert.strictEqual(k.tagNight(k.nightTag(i)), i);
    }
    assert.strictEqual(k.nightTag(1), null);
    assert.strictEqual(k.nightTag(9), null);
    for (const v of ['hanukkah-night-1', 'hanukkah-night-9', 'hanukkah-night-', 'fb-he-hanukkah', '', null, undefined, ['hanukkah-night-3']]) {
        assert.strictEqual(k.tagNight(v), null, String(v));
    }
    assert.strictEqual(k.tagNight('Hanukkah-Night-5'), 5);
});

test('REMIND ME steps aside on nights 1 to 7 of the final screen only', () => {
    assert.strictEqual(k.remindStepsAside(at('2026-12-06', 21), 'he', 'hanukkah', 'after-game'), true);
    assert.strictEqual(k.remindStepsAside(at('2026-12-06', 21), 'he', 'hanukkah', 'game-over'), false, 'the join page keeps it');
    assert.strictEqual(k.remindStepsAside(at('2026-12-11', 21), 'he', 'hanukkah', 'after-game'), false, 'night 8 keeps it');
    assert.strictEqual(k.remindStepsAside(at('2026-12-03', 21), 'he', 'hanukkah', 'after-game'), false, 'the eve of the first candle');
    assert.strictEqual(k.remindStepsAside(at('2026-11-18', 21), 'en', null, 'after-game'), false);
});

test('the final screen places the line and the button beside Challenge another group\'s blocks', () => {
    const html = fs.readFileSync(path.join(app, 'pages', 'score-board-final', 'score-board-final.component.html'), 'utf8');
    assert.strictEqual((html.match(/<app-hanukkah-night /g) || []).length, 2);
    assert.ok(html.indexOf('part="line"') < html.indexOf('class="actions"'), 'the line under the winner, on the big screen too');
    const host = fs.readFileSync(path.join(app, 'components', 'host-ask', 'host-ask.component.html'), 'utf8');
    assert.ok(/\*ngIf="remindShown" class="button ask-remind"/.test(host), 'one calendar button');
});
