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

test('the 50/50 test is retired: no half to draw, no tester\'s switch', () => {
    assert.strictEqual(na.shownHalf, undefined);
    assert.strictEqual(na.NIGHT_AFTER_KEY, undefined);
    assert.ok(!/BS_NIGHT_AFTER|shownHalf|recap\.half/.test(component), 'the page still reads a half');
});

test('the seen rows say whether this browser played', () => {
    assert.strictEqual(na.seenMethod(true), 'seen-player');
    assert.strictEqual(na.seenMethod(false), 'seen-other');
    // Beside an open rematch lobby: no seen- row (same-table-open / join-them count those).
    for (const player of [true, false]) {
        assert.strictEqual(na.seenMethod(player, 'JWAB'), null, String(player));
        assert.strictEqual(na.seenMethod(player, undefined), na.seenMethod(player));
    }
    assert.deepStrictEqual(na.NIGHT_AFTER_TAGS, { other: 'night-after', player: 'night-after-player' });
    // Each method is one the server counts (functions/src/controllers/analytics.ts); it still takes the
    // retired half's seen-control- rows, from pages loaded before the release.
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

test('the page: the recap whenever the server sends one, today\'s page otherwise, and the rematch first', () => {
    assert.match(html, /\*ngIf="gameOver && recapShown && recap"/);
    assert.match(html, /\*ngIf="gameOver && !\(recapShown && recap\)"/);
    // Today's page keeps its late-joiner ask, untouched, for a link with no recap (older than a week, say).
    assert.match(html, /<app-host-ask \[locale\]="t.lang" place="game-over"><\/app-host-ask>/);
    // Players and the rest get their own button (same-table: a player opens the table again); the crew
    // link only for a crew's game.
    assert.match(html, /\*ngIf="ask === 'other'"[\s\S]*n.create[\s\S]*\*ngIf="ask === 'player'"[\s\S]*n.playAgain/);
    assert.match(html, /\*ngIf="recap.crew"/);
    // Nothing of the questions: no question text, no truth on the page.
    assert.ok(!/questionText|currentQ|truth|realAnswer|\.q\b/i.test(html.slice(html.indexOf('night-after'), html.indexOf('controls game-over'))));
    // A later answer without a recap (a tap on JOIN) keeps the page's.
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
    // The third argument: the Hanukkah night's tag, when the page came by that link (components/hanukkah-night).
    assert.match(component, /this\.apiService\.sameTable\(pin, late && wait, nightTag\(this\.hanukkahNight\) \|\| undefined\)/);
    assert.match(component, /'same-table-open' : 'same-table'/);
    assert.match(component, /countRecap\('join-them'\)/);
    assert.match(api, /`fork`, \{ pin, uid, pid, hostKey, stagedReveal: true, aboutUs: true, sameTable: true, \.\.\.\(wait \? \{ wait: true \} : \{\}\),\s+\.\.\.\(campaign \? \{ campaign \} : \{\}\) \}/);
});

// The page's own methods (showGameOver, setRecap, countRecap), run on a stand-in for the page, so what a
// page load sends is checked, not only the helper.
function pageMethods() {
    const body = name => {
        const m = new RegExp(`\\n    (?:private )?${name}\\(([^)]*)\\) \\{\\n([\\s\\S]*?)\\n    \\}\\n`).exec(component);
        assert.ok(m, name);
        return ts.transpile(`(function (${m[1]}) {\n${m[2]}\n})`, { target: ts.ScriptTarget.ES2017, noImplicitUseStrict: true })
            .replace(/^"use strict";\s*/, '').trim().replace(/;$/, '');
    };
    const scope = { readRecap: na.readRecap, seenMethod: na.seenMethod, NIGHT_AFTER_CONTENT: na.NIGHT_AFTER_CONTENT };
    const make = src => new Function(...Object.keys(scope), `return ${src}`)(...Object.values(scope));
    return { showGameOver: make(body('showGameOver')), setRecap: make(body('setRecap')), countRecap: make(body('countRecap')) };
}

function loadPage(err) {
    const m = pageMethods();
    const sent = [];
    const page = {
        pin: 'abcd', t: { lang: 'en' },
        apiService: { logShare: (content, method) => sent.push(`${content}:${method}`) },
        setRecap: m.setRecap, countRecap: m.countRecap,
    };
    m.showGameOver.call(page, err);
    return { page, sent, again: e => m.showGameOver.call(page, e) };
}

test('every game: the recap shows whatever half the server once drew, and counts one seen- row', () => {
    const played = { ...recap, player: true };
    for (const half of ['new', 'control', undefined]) {
        const p = loadPage({ code: 'GAME_OVER', nightAfter: { ...recap, half } });
        assert.strictEqual(p.page.recapShown, true, String(half));
        assert.deepStrictEqual(p.sent, ['night-after:seen-other'], String(half));
    }
    assert.deepStrictEqual(loadPage({ code: 'GAME_OVER', nightAfter: played }).sent, ['night-after:seen-player']);
    // A test game's link shows the recap and sends nothing.
    const t = loadPage({ code: 'GAME_OVER', nightAfter: { ...recap, test: true } });
    assert.strictEqual(t.page.recapShown, true);
    assert.deepStrictEqual(t.sent, []);
    // No recap (older than a week): today's page, nothing sent.
    const none = loadPage({ code: 'GAME_OVER' });
    assert.strictEqual(none.page.recapShown, false);
    assert.deepStrictEqual(none.sent, []);
    // A second answer for the same PIN sends no second row.
    const again = loadPage({ code: 'GAME_OVER', nightAfter: recap });
    again.again({ code: 'GAME_OVER' });
    assert.strictEqual(again.page.recapShown, true);
    assert.deepStrictEqual(again.sent, ['night-after:seen-other']);
});

test('same table: a page load beside an open rematch shows the recap and sends no seen- row', () => {
    const played = { ...recap, player: true };
    for (const r of [recap, played]) {
        const p = loadPage({ code: 'GAME_OVER', rematch: 'JWAB', nightAfter: r });
        assert.strictEqual(p.page.recapShown, true);
        assert.strictEqual(p.page.gameOver.rematch, 'JWAB');
        assert.deepStrictEqual(p.sent, []);
        // A later answer on the same page load (a tap on JOIN) sends none either.
        p.again({ code: 'GAME_OVER', rematch: 'JWAB' });
        assert.deepStrictEqual(p.sent, []);
    }
});

// ---- A player who comes late: the table's next game started without them (review of #160, section 2) ----

test('late player: the ask, only for a player, only while the table plays and no lobby is open', () => {
    assert.strictEqual(na.recapAsk(true, undefined, true), 'late-player');
    assert.strictEqual(na.recapAsk(false, undefined, true), 'other', 'non-players see what they saw');
    assert.strictEqual(na.recapAsk(true, 'JWAB', true), 'again-player', 'an open lobby comes first');
    assert.strictEqual(na.recapAsk(false, 'JWAB', true), 'again-other');
    assert.strictEqual(na.recapAsk(true, undefined, false), 'player');
    assert.strictEqual(na.recapAsk(true, undefined), 'player');
    for (const lang of ['en', 'he']) {
        const t = na.nightAfterStrings[lang];
        for (const k of ['lateTitle', 'lateText', 'catchNext', 'lateStill', 'newTable']) {
            assert.ok(typeof t[k] === 'string' && t[k].length > 0, `${lang}.${k}`);
        }
        // The text names the button as the page shows it.
        assert.ok(t.lateText.indexOf(t.catchNext) >= 0, `${lang}: lateText names ${t.catchNext}`);
    }
    assert.strictEqual(na.nightAfterStrings.en.lateTitle, 'They started without you.');
});

test('late player: the page says so above the recap, and its two buttons', () => {
    const late = html.indexOf('recap-late');
    assert.ok(late > 0 && late < html.indexOf('recap-heading'), 'above the recap');
    assert.match(html, /ask === 'late-player'"[\s\S]*?n\.lateTitle[\s\S]*?\(click\)="playAgain\(true\)"[\s\S]*?n\.catchNext[\s\S]*?\(click\)="playAgain\(false\)"[\s\S]*?n\.newTable/);
    // Its rows, and TABLE_PLAYING is an answer, not an error.
    assert.match(component, /late \? \(wait \? 'catch-next' : 'new-table'\)/);
    assert.match(component, /err\.code === 'TABLE_PLAYING'/);
    assert.match(component, /playing \? this\.n\.lateStill : this\.n\.againError/);
    assert.match(component, /!!\(this\.recap && this\.recap\.tablePlaying\)/);
    // The server takes both rows.
    const analytics = fs.readFileSync(path.join(__dirname, '..', '..', 'functions', 'src', 'controllers', 'analytics.ts'), 'utf8');
    const methods = /'night-after': \[([\s\S]*?)\]/.exec(analytics)[1];
    for (const m of ['catch-next', 'new-table']) {
        assert.ok(methods.indexOf(`'${m}'`) >= 0, m);
    }
});

test('late player: the page load sends its seen- row as before, and no other row', () => {
    const late = { ...recap, player: true, tablePlaying: true };
    assert.deepStrictEqual(loadPage({ code: 'GAME_OVER', nightAfter: late }).sent, ['night-after:seen-player']);
    const p = loadPage({ code: 'GAME_OVER', nightAfter: late });
    assert.strictEqual(p.page.recapShown, true);
    p.again({ code: 'GAME_OVER' });
    assert.deepStrictEqual(p.sent, ['night-after:seen-player']);
});
