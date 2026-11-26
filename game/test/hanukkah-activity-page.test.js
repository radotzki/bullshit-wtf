// The counselors' Hanukkah activity (seo/pages-he-hanukkah-activity.js, /he/hanukkah-activity): its own tag on
// the Start button and the Hanukkah pack, the whole activity (goal, materials, opener, joining, big groups,
// closing talk, no-internet fallback), numbers that match the game (12 seats with the counselor in one, a
// rematch as long as the first game, 9-letter team names), only buttons the site shows, a print layout without
// the site's buttons, a link from the youth page and the Hebrew home, and a line in the sitemap.
// Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ts = require('typescript');
const pages = require('../seo/pages');
const activity = require('../seo/pages-he-hanukkah-activity');

const root = path.join(__dirname, '..', '..');
const app = path.join(root, 'game', 'src', 'app');
function load(file) {
    const out = ts.transpileModule(fs.readFileSync(path.join(app, file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}
const home = load('pages/landing/home-strings.ts').homeStrings('he');
const create = load('pages/create-game/create-strings.ts').createStrings('he');
const game = load('pages/game-strings.ts').gameStrings('he');
const final = load('pages/score-board-final/final-strings.ts').finalStrings.he;
const model = fs.readFileSync(path.join(root, 'game-model.ts'), 'utf8');
const MAX = +/export const MAX_PLAYERS = (\d+);/.exec(model)[1];
const nameBox = +/name="nickname"[^>]*maxlength="(\d+)"/.exec(fs.readFileSync(path.join(app, 'pages', 'join-game', 'join-game.component.html'), 'utf8'))[1];
const joinSource = fs.readFileSync(path.join(app, 'services', 'join-source.ts'), 'utf8');
const known = JSON.parse(/const known = (\[[^\]]+\])/.exec(joinSource)[1].replace(/'/g, '"'));

const PATH = '/he/hanukkah-activity';
const page = p => pages.find(x => x.path === p);
const pg = page(PATH);
const text = s => s.replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const body = text(pg.body);

test('the page is there, in Hebrew only, with its own tag in a shape the game keeps', () => {
    assert.ok(pg);
    assert.strictEqual(pg.site.lang, 'he');
    assert.strictEqual(pg.twin, undefined);
    assert.strictEqual(pg.tag, 'hanukkah-activity');
    assert.match(pg.tag, /^[a-z0-9][a-z0-9-]{0,39}$/);
    assert.ok(known.indexOf(pg.tag) < 0);
    assert.strictEqual(pages.filter(p => p.tag === pg.tag).length, 1);
});

test('Start opens a Hebrew game with the Hanukkah questions on any day, and they are in season for Hanukkah week', () => {
    assert.strictEqual(pg.start.href, '/create-game?lang=he&pack=hanukkah');
    const hanukkah = /hanukkah: \{[\s\S]*?season: \{ from: '([\d-]+)', to: '([\d-]+)' \}/.exec(model);
    assert.ok(hanukkah, 'game-model.ts has the Hanukkah pack');
    // The Hanukkah-week meetings: 4 to 11 December 2026.
    assert.ok(hanukkah[1] <= '2026-12-01' && hanukkah[2] >= '2026-12-11', hanukkah[1] + ' to ' + hanukkah[2]);
    assert.ok(body.indexOf('בין 1 ל-13 בדצמבר') >= 0 && hanukkah[1] === '2026-12-01' && hanukkah[2] === '2026-12-13');
    assert.ok(body.indexOf(`"${create.special}"`) >= 0, `names the "${create.special}" box of the Create page`);
});

test('title and description say what counselors search for, and fit a search result', () => {
    ['פעולה', 'חנוכה', 'בולשיט', 'משחק'].forEach(w => assert.ok(pg.title.indexOf(w) >= 0, w));
    ['פעולת חנוכה', 'ז\'-י"ב', '45 דקות'].forEach(w => assert.ok(pg.description.indexOf(w) >= 0, w));
    assert.ok(pg.title.length <= 60, `${pg.title.length} characters`);
    assert.ok(pg.description.length <= 200, `${pg.description.length} characters`);
});

test('the whole activity is on the page: goals, materials, opener, joining, two games, closing talk, big groups, fallback, annexes', () => {
    ['מטרות הפעולה', 'מה להביא', 'לפני הפעולה', 'פתיחה: אמת או המצאה?', 'חלוקה והתחברות', 'מתודה א\'', 'עצירה קצרה',
        'מתודה ב\'', 'סיכום: שני סיפורים של חנוכה', 'קבוצה גדולה?', 'אם משהו נופל', 'נספח א\'', 'נספח ב\''].forEach(h => {
        assert.match(pg.body, new RegExp('<h2[^>]*>' + h.replace(/[?']/g, m => '\\' + m)), h);
    });
    assert.ok(body.indexOf('אין אינטרנט בכלל') >= 0);
    // Five facts for the opener and five paper questions.
    const lists = pg.body.split(/<h2[^>]*>נספח/).slice(1).map(s => (s.match(/<li>/g) || []).length);
    assert.deepStrictEqual(lists.map(n => n >= 5), [true, true]);
    // The plan adds up to 45 minutes, without gaps.
    const rows = [...pg.body.matchAll(/<td>(\d+)–(\d+)<\/td>/g)].map(m => [+m[1], +m[2]]);
    assert.strictEqual(rows[0][0], 0);
    assert.strictEqual(rows[rows.length - 1][1], 45);
    rows.slice(1).forEach((r, i) => assert.strictEqual(r[0], rows[i][1]));
});

test('seats: 12 a game and the counselor takes one, so 11 teams and 22 children in pairs', () => {
    assert.strictEqual(MAX, 12);
    assert.ok(body.indexOf(`עד ${MAX} טלפונים`) >= 0);
    assert.ok(body.indexOf(`עד ${MAX - 1} צוותים`) >= 0);
    assert.ok(body.indexOf(`12 עד ${2 * (MAX - 1)} חניכים`) >= 0);
    assert.ok(body.indexOf(`${2 * (MAX - 1) + 1} עד 30 חניכים`) >= 0, 'threes from 23');
    assert.doesNotMatch(body, /עד 24|24 חניכים|13 ומעלה/);
});

test('the rematch plays as many questions as the first game: 5 and then 5', () => {
    assert.ok(body.indexOf('משחק ראשון, 5 שאלות') >= 0);
    assert.ok(body.indexOf('משחק חוזר, 5 שאלות') >= 0);
    assert.ok(body.indexOf('אותו מספר שאלות') >= 0);
    assert.doesNotMatch(body, /7 שאלות|9 שאלות/);
});

test(`team names fit the nickname box (${nameBox} letters)`, () => {
    assert.ok(body.indexOf(`עד ${nameBox} אותיות`) >= 0);
});

test('every button it names is one the site shows', () => {
    const buttons = [pg.start.label, create.create, home.join, game.start, final.rematch, home.presentShort];
    const named = [];
    pg.body.replace(/(?:לוחצים על|לוחץ על|לוחצים|ללחוץ על) "([^"]+)"/g, (all, name) => named.push(name));
    assert.ok(named.length >= 5, named.join(', '));
    named.forEach(name => assert.ok(buttons.indexOf(name) >= 0, `"${name}" is a button of the site`));
    assert.ok(pg.body.indexOf(home.present) < 0, `"${home.present}" is the phone's name for the big-screen button`);
    (pg.body.match(/<bdi dir="ltr">[^<]+<\/bdi>/g) || []).forEach(a => assert.match(a, /^<bdi dir="ltr">bullshit\.wtf\/he(\/hanukkah-activity)?<\/bdi>$/));
});

test('links go to pages that exist; the youth page and the Hebrew home link here', () => {
    (pg.body.match(/href="\/[^"]*"/g) || []).map(h => h.slice(6, -1)).forEach(h => assert.ok(page(h), h));
    assert.ok(page('/he/youth-group').body.indexOf(`href="${PATH}"`) >= 0);
    const he = fs.readFileSync(path.join(root, 'game', 'scripts', 'build-he.js'), 'utf8');
    assert.ok(he.indexOf(`href="${PATH}"`) >= 0);
});

test('the WhatsApp share for counselors carries its own tag', () => {
    const m = /href="https:\/\/wa\.me\/\?text=([^"]+)"/.exec(pg.body);
    assert.ok(m);
    assert.match(decodeURIComponent(m[1]), /https:\/\/bullshit\.wtf\/he\/hanukkah-activity\?via=wa-he-hanukkah-activity$/);
    assert.ok(known.indexOf('wa-he-hanukkah-activity') < 0);
});

test('built: the page prints without the site\'s buttons, its Start button is tagged, and the sitemap lists it', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-hanukkah-activity-'));
    try {
        execFileSync(process.execPath, [path.join(root, 'game', 'seo', 'build-pages.js'), out], { stdio: 'pipe' });
        const html = fs.readFileSync(path.join(out, 'he', 'hanukkah-activity.html'), 'utf8');
        assert.match(html, /<html lang="he" dir="rtl"/);
        const print = /@media print \{([\s\S]*?)\n\s*\}\n/.exec(html);
        assert.ok(print, 'has print rules');
        assert.match(print[1], /header, footer, nav\.more, \.cta, \.no-print \{ display: none !important; \}/);
        assert.match(html, /class="btn primary" href="\/create-game\?lang=he&amp;pack=hanukkah&amp;via=hanukkah-activity"/);
        assert.match(html, /onclick="window\.print\(\)"/);
        assert.match(html, /<meta property="og:image" content="https:\/\/bullshit\.wtf\/assets\/og-hanukkah-activity-he\.png">/);
        const sitemap = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
        assert.ok(sitemap.indexOf('<loc>https://bullshit.wtf/he/hanukkah-activity</loc>') >= 0);
    } finally {
        fs.rmSync(out, { recursive: true, force: true });
    }
});

test('the page module and the page list agree', () => {
    assert.strictEqual(activity.TAG, pg.tag);
    assert.deepStrictEqual(activity.pages(pg.site).map(p => p.path), [PATH]);
});

// Spoils. Counselor tables play the game's Hanukkah pack right after this activity, so nothing the counselor reads
// aloud (opener, paper questions, the rest of the page) may give away a Hebrew question of the pack, kids' ones
// included (they are pack questions too). The same rules as test/hanukkah-quiz-page.test.js.
const pack = Object.values(JSON.parse(fs.readFileSync(path.join(root, 'functions', 'data', 'hanukkah-questions.json'), 'utf8')))
    .filter(q => q.lang === 'he');
const norm = s => s.replace(/['"׳״:,.]/g, '').replace(/\s+/g, ' ').trim();
// Words of a text as one plain list: punctuation out.
const words = s => norm(s.replace(/[()!?;–—_]/g, ' ')).split(' ').filter(Boolean);
// A pack answer is spoiled when the text holds it as a word, or after one Hebrew prefix letter, so "גרמני" isn't
// found inside "מגרמניה". Answers of 3 letters or fewer ("שם", "אש", "שני") are everyday words and are left out,
// unless they have two words or more; the four-word check below still catches their facts.
const holds = (t, answer) => {
    const a = words(answer);
    if (a.length === 1 && a[0].length <= 3) {
        return false;
    }
    for (let i = 0; i + a.length <= t.length; i++) {
        const first = t[i] === a[0] || (t[i].length === a[0].length + 1 && 'בהוכלמש'.includes(t[i][0]) && t[i].slice(1) === a[0]);
        if (first && a.slice(1).every((w, k) => t[i + 1 + k] === w)) {
            return true;
        }
    }
    return false;
};
// The closing talk comes after both games (minutes 33 to 45), and its two stories are the activity's point, so it
// may name these pack answers; checked by hand. Nowhere else on the page may.
//  - "תלמוד": the oil story is told in the Talmud (pack: where is the oil miracle first told?).
//  - "מודיעין": the revolt began in Modiin (pack: where was the Hanukkah torch run lit?).
//  - "שמונה": the oil lasted eight days, as every Hanukkah page says (an older pack asked how many candles Beit
//    Shammai light on the first night).
const closingMay = ['תלמוד', 'מודיעין', 'שמונה'];
const parts = (() => {
    const all = pg.body.replace(/<style>[\s\S]*?<\/style>/g, ' ');
    const at = all.indexOf('<h2>סיכום: שני סיפורים של חנוכה');
    const end = all.indexOf('<h2', at + 4);
    assert.ok(at > 0 && end > at, 'the closing talk is found');
    return {
        page: [pg.title, pg.description, pg.h1, activity.waText, all.slice(0, at), all.slice(end)].map(text).join(' '),
        closing: text(all.slice(at, end)),
    };
})();

test('the opener, the paper questions and the rest of the page give away no Hebrew Hanukkah question of the game', () => {
    assert.ok(pack.length > 50, 'the pack was read');
    const paper = pg.body.split(/<h2[^>]*>נספח ב'/)[1];
    const answers = [...paper.matchAll(/<li>[^<]*\(([^)]+)\)<\/li>/g)].map(m => m[1]);
    assert.ok(answers.length >= 5, 'the paper questions\' answers were read: ' + answers.join(', '));
    [['page', parts.page, []], ['closing talk', parts.closing, closingMay]].forEach(([where, t, may]) => {
        const w = words(t);
        const plain = ' ' + w.join(' ') + ' ';
        pack.forEach(q => {
            if (may.indexOf(norm(q.realAnswer)) < 0) {
                assert.ok(!holds(w, q.realAnswer), `the ${where} names "${q.realAnswer}", the answer to "${q.questionText}"`);
            }
            // Four words in a row of the pack's question, read with its answer, give its fact away.
            const qw = words(q.questionText.replace('$blank$', ' ' + q.realAnswer + ' '));
            for (let k = 0; k + 4 <= qw.length; k++) {
                const run = qw.slice(k, k + 4).join(' ');
                assert.ok(!plain.includes(' ' + run + ' '), `the ${where} repeats "${run}" from "${q.questionText}"`);
            }
        });
    });
    pack.forEach(q => answers.forEach(a => assert.notStrictEqual(norm(words(a).join(' ')), norm(words(q.realAnswer).join(' ')),
        `a paper question has the answer of "${q.questionText}"`)));
});
