// The English Hanukkah activity for youth groups (seo/pages-en-hanukkah-activity.js, /hanukkah-youth-group-activity):
// its own tag on the Start button and the Hanukkah pack, the whole activity (goals, materials, opener, joining, two
// games, discussion, big groups, no-internet fallback, handouts), numbers that match the game (12 seats with the
// leader in one, a rematch as long as the first game, 9-letter team names), only buttons the site shows, the
// Create page's own words for the Hanukkah and kids switches, a print layout without the site's buttons, links from
// the classroom page and the English home, and a line in the sitemap.
// Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const ts = require('typescript');
const pages = require('../seo/pages');
const activity = require('../seo/pages-en-hanukkah-activity');

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
const home = load('pages/landing/home-strings.ts').homeStrings('en');
const create = load('pages/create-game/create-strings.ts').createStrings('en');
const game = load('pages/game-strings.ts').gameStrings('en');
const final = load('pages/score-board-final/final-strings.ts').finalStrings.en;
const lobbySource = fs.readFileSync(path.join(app, 'pages', 'game-staging', 'lobby-host.ts'), 'utf8');
const startAlone = /startAlone: \(\) => '([^']+)'/.exec(lobbySource)[1];
const model = fs.readFileSync(path.join(root, 'game-model.ts'), 'utf8');
const MAX = +/export const MAX_PLAYERS = (\d+);/.exec(model)[1];
const nameBox = +/name="nickname"[^>]*maxlength="(\d+)"/.exec(fs.readFileSync(path.join(app, 'pages', 'join-game', 'join-game.component.html'), 'utf8'))[1];
const joinSource = fs.readFileSync(path.join(app, 'services', 'join-source.ts'), 'utf8');
const known = JSON.parse(/const known = (\[[^\]]+\])/.exec(joinSource)[1].replace(/'/g, '"'));
const packBlock = id => new RegExp(`\\n    ${id}: \\{([\\s\\S]*?)\\n    \\},`).exec(model)[1];

const PATH = '/hanukkah-youth-group-activity';
const page = p => pages.find(x => x.path === p);
const pg = page(PATH);
const text = s => s.replace(/<style>[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const body = text(pg.body);

test('the page is there, in English only, with its own tag in a shape the game keeps', () => {
    assert.ok(pg);
    assert.strictEqual(pg.site.lang, 'en');
    assert.strictEqual(pg.twin, undefined);
    assert.strictEqual(pg.tag, 'hanukkah-activity-en');
    [pg.tag, activity.MAIL_TAG].forEach(t => {
        assert.match(t, /^[a-z0-9][a-z0-9-]{0,39}$/);
        assert.ok(known.indexOf(t) < 0, t + ' is not a join source');
        assert.ok(!/^test(-|$)/.test(t), t + ' is not a test tag');
    });
    assert.strictEqual(pages.filter(p => p.tag === pg.tag).length, 1);
});

test('Start opens an English game with the Hanukkah questions ticked, and the page says how the switches work', () => {
    assert.strictEqual(pg.start.href, '/create-game?lang=en&pack=hanukkah');
    const hanukkah = packBlock('hanukkah');
    // English games do not get the Hanukkah pack by themselves: the page must send leaders through its own button.
    assert.match(hanukkah, /seasonIn: \['he'\]/);
    assert.match(hanukkah, /perGame: 3,/);
    assert.match(hanukkah, /label: \{ en: 'Hanukkah questions'/);
    assert.ok(body.indexOf('three Hanukkah questions in every game, on any date') >= 0);
    assert.ok(body.indexOf(`under "${create.special}", "Hanukkah questions" is ticked`) >= 0);
    // In December an English game off the home page gets the Christmas pack.
    assert.match(packBlock('christmas'), /season: \{ from: '2026-12-01'/);
    assert.ok(body.indexOf('in December gets Christmas questions') >= 0);
    // "Kids are playing" takes the place of the seasonal pack, so the page says to leave it off.
    const kids = create.kids.replace(/^\S+\s/, '');
    assert.ok(body.indexOf(`Leave "${kids}" off`) >= 0, kids);
    assert.match(model, /if \(kids\) \{\s*return KIDS_PACK;/);
});

test('title and description say what leaders search for, and fit a search result', () => {
    ['Hanukkah', 'youth group', 'activity', 'Bullshit', 'game'].forEach(w => assert.ok(pg.title.indexOf(w) >= 0, w));
    ['Hanukkah activity', 'youth groups', '45-minute', 'grades 7 to 12', 'phones', 'printable'].forEach(w => assert.ok(pg.description.indexOf(w) >= 0, w));
    assert.ok(pg.title.length <= 60, `${pg.title.length} characters`);
    assert.ok(pg.description.length <= 200, `${pg.description.length} characters`);
});

test('the whole activity is on the page: goals, materials, opener, joining, two games, discussion, big groups, fallback, handouts', () => {
    ['Goals', 'What to bring', 'Before the meeting', 'Opener: true or made up?', 'Pairs and joining', 'Game 1', 'Quick pause',
        'Game 2: the rematch', 'Discussion: the two stories of Hanukkah', 'A big group?', 'If something goes wrong',
        'Handout A', 'Handout B'].forEach(h => {
        assert.match(pg.body, new RegExp('<h2[^>]*>' + h.replace(/[?]/g, m => '\\' + m)), h);
    });
    assert.ok(body.indexOf('No internet at all') >= 0);
    const lists = pg.body.split(/<h2[^>]*>Handout/).slice(1).map(s => (s.match(/<li>/g) || []).length);
    assert.deepStrictEqual(lists.map(n => n >= 5), [true, true]);
    const rows = [...pg.body.matchAll(/<td>(\d+)–(\d+)<\/td>/g)].map(m => [+m[1], +m[2]]);
    assert.strictEqual(rows[0][0], 0);
    assert.strictEqual(rows[rows.length - 1][1], 45);
    rows.slice(1).forEach((r, i) => assert.strictEqual(r[0], rows[i][1]));
});

test('the facts that need care are said: the swear word, and Shabbat on the first night', () => {
    assert.ok(body.indexOf('in English that is a swear word') >= 0);
    // Hanukkah 2026: first candle Friday evening 4 December; the eighth on Friday 11 December.
    assert.strictEqual(new Date(Date.UTC(2026, 11, 4)).getUTCDay(), 5);
    assert.ok(body.indexOf('evening of Friday 4 December') >= 0);
    assert.ok(body.indexOf('Friday afternoon 11 December') >= 0);
});

test('seats: 12 a game and the leader takes one, so 11 teams and 22 teens in pairs', () => {
    assert.strictEqual(MAX, 12);
    assert.ok(body.indexOf(`up to ${MAX} phones`) >= 0);
    assert.ok(body.indexOf(`up to ${MAX - 1} teams`) >= 0);
    assert.ok(body.indexOf(`12 to ${2 * (MAX - 1)} teens`) >= 0);
    assert.ok(body.indexOf(`${2 * (MAX - 1) + 1} to 30 teens`) >= 0, 'threes from 23');
    assert.doesNotMatch(body, /up to 24|24 teens|13 or more/);
});

test('the rematch plays as many questions as the first game: 5 and then 5', () => {
    assert.match(fs.readFileSync(path.join(root, 'functions', 'src', 'controllers', 'fork.ts'), 'utf8'), /totalQ: game\.totalQ/);
    assert.ok(body.indexOf('Game 1: 5 questions') >= 0);
    assert.ok(body.indexOf('Game 2: the rematch, 5 questions') >= 0);
    assert.ok(body.indexOf('the same number of questions') >= 0);
    assert.doesNotMatch(body, /7 questions|9 questions/);
});

test(`team names fit the nickname box (${nameBox} letters)`, () => {
    assert.ok(body.indexOf(`${nameBox} letters at most`) >= 0);
});

test('every button it names is one the site shows', () => {
    const buttons = [pg.start.label, create.create, home.join, game.start, final.rematch, home.presentShort, startAlone];
    const named = [];
    pg.body.replace(/(?:[Tt]ap|[Cc]lick|then) "([^"]+)"/g, (all, name) => named.push(name));
    assert.ok(named.length >= 6, named.join(', '));
    named.forEach(name => assert.ok(buttons.indexOf(name) >= 0, `"${name}" is a button of the site`));
    (pg.body.match(/<bdi dir="ltr">[^<]+<\/bdi>/g) || []).forEach(a => assert.match(a, /^<bdi dir="ltr">bullshit\.wtf(\/hanukkah-youth-group-activity)?<\/bdi>$/));
});

test('links go to pages that exist; the classroom page and the English home link here', () => {
    (pg.body.match(/href="\/[^"]*"/g) || []).map(h => h.slice(6, -1)).forEach(h => assert.ok(page(h), h));
    assert.ok(page('/classroom-game').body.indexOf(`href="${PATH}"`) >= 0);
    const en = fs.readFileSync(path.join(root, 'game', 'src', 'index.html'), 'utf8');
    assert.ok(/<main id="bs-about"[\s\S]*?<\/main>/.exec(en)[0].indexOf(`href="${PATH}"`) >= 0);
});

test('the email to co-leaders carries its own tag', () => {
    const m = /href="mailto:\?subject=[^"&]+&body=([^"]+)"/.exec(pg.body);
    assert.ok(m);
    assert.match(decodeURIComponent(m[1]), /https:\/\/bullshit\.wtf\/hanukkah-youth-group-activity\?via=mail-en-hanukkah-activity$/);
});

test('built: the page prints without the site\'s buttons, its Start button is tagged, and the sitemap lists it', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-hanukkah-activity-en-'));
    try {
        execFileSync(process.execPath, [path.join(root, 'game', 'seo', 'build-pages.js'), out], { stdio: 'pipe' });
        const html = fs.readFileSync(path.join(out, 'hanukkah-youth-group-activity.html'), 'utf8');
        assert.match(html, /<html lang="en" dir="ltr"/);
        const print = /@media print \{([\s\S]*?)\n\s*\}\n/.exec(html);
        assert.ok(print, 'has print rules');
        assert.match(print[1], /header, footer, nav\.more, \.cta, \.no-print \{ display: none !important; \}/);
        assert.match(html, /class="btn primary" href="\/create-game\?lang=en&amp;pack=hanukkah&amp;via=hanukkah-activity-en"/);
        assert.match(html, /onclick="window\.print\(\)"/);
        assert.match(html, /<meta property="og:image" content="https:\/\/bullshit\.wtf\/assets\/og-hanukkah-activity-en\.png">/);
        assert.ok(fs.existsSync(path.join(root, 'game', 'src', 'assets', 'og-hanukkah-activity-en.png')));
        const sitemap = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
        assert.ok(sitemap.indexOf('<loc>https://bullshit.wtf/hanukkah-youth-group-activity</loc>') >= 0);
    } finally {
        fs.rmSync(out, { recursive: true, force: true });
    }
});

test('the page module and the page list agree', () => {
    assert.strictEqual(activity.TAG, pg.tag);
    assert.deepStrictEqual(activity.pages(pg.site).map(p => p.path), [PATH]);
});
