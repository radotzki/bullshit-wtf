// Tests for "The night after", the recap a finished game's link shows for a week
// (src/app/pages/join-game/night-after.ts and the join page that shows it).
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const page = path.join(__dirname, '..', 'src', 'app', 'pages', 'join-game');
const na = load(path.join(page, 'night-after.ts'));
const html = fs.readFileSync(path.join(page, 'join-game.component.html'), 'utf8');
const component = fs.readFileSync(path.join(page, 'join-game.component.ts'), 'utf8');
const api = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'services', 'api.service.ts'), 'utf8');

const recap = {
    half: 'new', player: false, endedAt: Date.now() - 3600 * 1000, locale: 'en', host: 'Noa', played: 3, questions: 7, fooledTotal: 9,
    rows: [{ name: 'Yossi', score: 3100, place: 1, fooled: 2 }, { name: 'Dana', score: 2500, place: 2, fooled: 5, biggest: true },
        { name: 'Avi', score: 900, place: 3, fooled: 0 }],
    lie: { text: 'laughing', fooled: 3, by: 'Dana' },
};

test('readRecap takes the server\'s recap off a GAME_OVER error, and nothing else', () => {
    assert.strictEqual(na.readRecap({ code: 'GAME_OVER' }), null);
    assert.strictEqual(na.readRecap({ nightAfter: { rows: [] , endedAt: 1 } }), null);
    assert.strictEqual(na.readRecap({ nightAfter: { rows: recap.rows } }), null);
    assert.strictEqual(na.readRecap(null), null);
    assert.strictEqual(na.readRecap({ nightAfter: recap }), recap);
});

test('the half: the game\'s own, unless the tester\'s switch says new or control', () => {
    assert.strictEqual(na.shownHalf(recap, null), 'new');
    assert.strictEqual(na.shownHalf({ ...recap, half: 'control' }, null), 'control');
    assert.strictEqual(na.shownHalf({ ...recap, half: 'control' }, 'new'), 'new');
    assert.strictEqual(na.shownHalf(recap, 'control'), 'control');
    assert.strictEqual(na.shownHalf(recap, 'nonsense'), 'new');
    assert.strictEqual(na.NIGHT_AFTER_KEY, 'BS_NIGHT_AFTER');
});

test('the seen rows name the half and whether this browser played', () => {
    assert.strictEqual(na.seenMethod('new', true), 'seen-player');
    assert.strictEqual(na.seenMethod('new', false), 'seen-other');
    assert.strictEqual(na.seenMethod('control', true), 'seen-control-player');
    assert.strictEqual(na.seenMethod('control', false), 'seen-control-other');
    assert.deepStrictEqual(na.NIGHT_AFTER_TAGS, { other: 'night-after', player: 'night-after-player' });
    // Each method is one the server counts (functions/src/controllers/analytics.ts).
    const analytics = fs.readFileSync(path.join(__dirname, '..', '..', 'functions', 'src', 'controllers', 'analytics.ts'), 'utf8');
    const line = /'night-after': \[([^\]]*)\]/.exec(analytics)[1];
    for (const m of ['seen-player', 'seen-other', 'seen-control-player', 'seen-control-other', 'create', 'create-player', 'crew']) {
        assert.ok(line.indexOf(`'${m}'`) >= 0, m);
    }
});

test('when the game was: a night runs to 05:00, an evening starts at 17:00, then yesterday, then the weekday', () => {
    const at = (d, h, m = 0) => new Date(2026, 10, d, h, m).getTime();   // November 2026, the browser's own zone
    assert.deepStrictEqual(na.whenWas(at(14, 22), at(14, 23)).kind, 'tonight');
    assert.deepStrictEqual(na.whenWas(at(14, 23, 30), at(15, 1)).kind, 'tonight');
    assert.deepStrictEqual(na.whenWas(at(14, 13), at(14, 15)).kind, 'today');
    assert.deepStrictEqual(na.whenWas(at(14, 22), at(15, 9)).kind, 'last-night');
    assert.deepStrictEqual(na.whenWas(at(14, 1), at(14, 9)).kind, 'last-night');   // 01:00 Saturday belongs to Friday night
    assert.deepStrictEqual(na.whenWas(at(14, 1), at(15, 9)), { kind: 'day', day: 5 });
    assert.deepStrictEqual(na.whenWas(at(14, 12), at(15, 9)).kind, 'yesterday');
    const w = na.whenWas(at(10, 21), at(14, 9));
    assert.deepStrictEqual(w, { kind: 'day', day: 2 });   // 10 Nov 2026 is a Tuesday
    assert.strictEqual(na.nightAfterStrings.en.heading(w, 'Noa'), 'ON TUESDAY AT NOA\'S');
    assert.strictEqual(na.nightAfterStrings.he.heading(w, 'נועה'), 'ביום שלישי אצל נועה');
    assert.strictEqual(na.nightAfterStrings.en.heading({ kind: 'last-night', day: 6 }, 'Noa'), 'LAST NIGHT AT NOA\'S');
    assert.strictEqual(na.nightAfterStrings.en.heading({ kind: 'tonight', day: 6 }, ''), 'TONIGHT\'S GAME');
    assert.strictEqual(na.nightAfterStrings.he.heading({ kind: 'last-night', day: 6 }, ''), 'המשחק של אתמול בערב');
});

test('every word exists in both languages, and the Hebrew has no English left in it', () => {
    const en = na.nightAfterStrings.en, he = na.nightAfterStrings.he;
    assert.deepStrictEqual(Object.keys(he).sort(), Object.keys(en).sort());
    const say = (t, k) => typeof t[k] === 'function' ? t[k].length === 3 ? t[k](3, 7, 9) : t[k].length === 2 ? t[k]({ kind: 'tonight', day: 0 }, 'X') : t[k](2) : t[k];
    for (const k of Object.keys(he)) {
        const w = say(he, k);
        assert.ok(typeof w === 'string' && w.length > 0, k);
        assert.ok(!/[A-Za-z]{2,}/.test(w.replace(/X/g, '')), `${k}: ${w}`);
        assert.ok(typeof say(en, k) === 'string' && say(en, k).length > 0, k);
    }
    assert.strictEqual(na.namesOf(recap.rows, r => r.place <= 2, en.and), 'Yossi & Dana');
    assert.strictEqual(na.namesOf(recap.rows, () => true, he.and), 'Yossi, Dana ואבי'.replace('אבי', 'Avi'));
    assert.strictEqual(na.namesOf(recap.rows, r => !!r.biggest, en.and), 'Dana');
    assert.strictEqual(na.namesOf(recap.rows, () => false, en.and), '');
});

test('the page: the recap only in the new half, today\'s page otherwise, and the rematch first', () => {
    assert.match(html, /\*ngIf="gameOver && recapShown && recap"/);
    assert.match(html, /\*ngIf="gameOver && !\(recapShown && recap\)"/);
    // Today's page keeps its late-joiner ask, untouched, in the other half.
    assert.match(html, /<app-host-ask \[locale\]="t.lang" place="game-over"><\/app-host-ask>/);
    // Players and the rest get their own button (same-table: a player opens the table again); the crew
    // link only for a crew's game.
    assert.match(html, /\*ngIf="ask === 'other'"[\s\S]*n.create[\s\S]*\*ngIf="ask === 'player'"[\s\S]*n.playAgain/);
    assert.match(html, /\*ngIf="recap.crew"/);
    // Nothing of the questions: no question text, no truth on the page.
    assert.ok(!/questionText|currentQ|truth|realAnswer|\.q\b/i.test(html.slice(html.indexOf('night-after'), html.indexOf('controls game-over'))));
    // Beside an open rematch the server sends a recap in the new half only; a later answer without one keeps the page's.
    assert.match(component, /const recap = readRecap\(err\) \|\| \(this\.recap && this\.recapPin === pin/);
    // A test game's link sends no rows.
    assert.match(component, /this\.recap\.test\) \{\s*return;/);
    // The link's check sends the browser's sign-in and last seat, so a player is known.
    assert.match(component, /validateGameName\(pin, true\)/);
    assert.match(api, /this\.post\(`validateGameName`, \{ pin, uid, pid \}\)/);
    assert.match(api, /error\.nightAfter = body\.nightAfter/);
});

// ---- Same table tomorrow (functions' same-table.ts) ----

test('same table: the ask by whether this browser played and whether the table\'s lobby is open', () => {
    assert.strictEqual(na.recapAsk(true, undefined), 'player');
    assert.strictEqual(na.recapAsk(false, undefined), 'other');
    assert.strictEqual(na.recapAsk(true, 'JWAB'), 'again-player');
    assert.strictEqual(na.recapAsk(false, 'JWAB'), 'again-other');
    for (const lang of ['en', 'he']) {
        const t = na.nightAfterStrings[lang];
        for (const k of ['playAgain', 'againTitle', 'againText', 'joinThem', 'againError']) {
            assert.ok(typeof t[k] === 'string' && t[k].length > 0, `${lang}.${k}`);
        }
    }
    assert.strictEqual(na.nightAfterStrings.en.playAgain, 'PLAY AGAIN, SAME TABLE');
    assert.strictEqual(na.nightAfterStrings.en.joinThem, 'JOIN THEM');
});

test('same table: the page puts "They\'re playing again" above the recap, and the buttons call the table', () => {
    const playing = html.indexOf('recap-playing');
    assert.ok(playing > 0 && playing < html.indexOf('recap-heading'), 'the open lobby comes first');
    assert.match(html, /ask === 'again-other'"[^>]*>[\s\S]*?\(click\)="joinThem\(\)"/);
    assert.match(html, /ask === 'again-player'"[\s\S]*?\(click\)="playAgain\(\)"/);
    assert.match(component, /this\.apiService\.sameTable\(pin\)/);
    assert.match(component, /'same-table-open' : 'same-table'/);
    assert.match(component, /countRecap\('join-them'\)/);
    assert.match(api, /`fork`, \{ pin, uid, pid, hostKey, stagedReveal: true, aboutUs: true, sameTable: true \}/);
});
