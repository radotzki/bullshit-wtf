// The weekly-group and home-together pages (seo/pages-groups-home.js): each carries its own tag on the
// Start button, has a real question of the game as its example, names only buttons the site shows,
// says 12 players, links only to pages that exist, and the home row and every page's menu link them.
// Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const pages = require('../seo/pages');

const root = path.join(__dirname, '..', '..');
const questions = Object.values(JSON.parse(fs.readFileSync(path.join(root, 'functions', 'data', 'opening-questions.json'), 'utf8')));
const joinSource = fs.readFileSync(path.join(root, 'game', 'src', 'app', 'services', 'join-source.ts'), 'utf8');
const known = JSON.parse(/const known = (\[[^\]]+\])/.exec(joinSource)[1].replace(/'/g, '"'));
function load(file) {
    const out = ts.transpileModule(fs.readFileSync(path.join(root, 'game', 'src', 'app', file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}
const { searchLinks } = load('pages/landing/search-links.ts');
const homeStrings = load('pages/landing/home-strings.ts').homeStrings;
const createStrings = load('pages/create-game/create-strings.ts').createStrings;
const gameStrings = load('pages/game-strings.ts').gameStrings;
const finalStrings = load('pages/score-board-final/final-strings.ts').finalStrings;

const page = p => pages.find(x => x.path === p);
const text = body => body.replace(/<[^>]+>/g, ' ');
const words = body => text(body).split(/\s+/).filter(w => /[א-ת0-9a-z]/i.test(w)).length;
const startOf = p => (p.start || p.site.start);

const added = {
    '/he/youth-group': 'seo-he-youth',
    '/he/gibush': 'seo-he-gibush',
    '/he/home-together': 'seo-he-home',
    '/he/days-at-home': 'seo-he-days-home',
    '/he/video-call': 'seo-he-video',
    '/he/school-break': 'seo-he-break',
    '/family-game-night': 'seo-en-family-night',
    '/video-call-party-game': 'seo-en-video',
    '/snow-day-games': 'seo-en-snow',
};

test('the nine pages are there, each with the tag the marketing drafts measure', () => {
    Object.keys(added).forEach(p => {
        assert.ok(page(p), p);
        assert.strictEqual(page(p).tag, added[p], p);
        assert.strictEqual(page(p).site.lang, p.indexOf('/he/') === 0 ? 'he' : 'en', p);
    });
    assert.strictEqual(page('/he/video-call').twin, '/video-call-party-game');
    assert.strictEqual(page('/he/home-together').twin, '/family-game-night');
});

Object.keys(added).forEach(p => {
    const pg = page(p);
    const lang = pg.site.lang;

    test(`${p}: the tag is one the game keeps, and Start opens Create in the page's language`, () => {
        assert.match(pg.tag, /^[a-z0-9][a-z0-9-]{0,39}$/);
        assert.ok(known.indexOf(pg.tag) < 0);
        // English pages turn the seasonal pack off: early December would switch Hanukkah on for everyone.
        assert.strictEqual(startOf(pg).href, lang === 'he' ? '/create-game?lang=he' : '/create-game?lang=en&pack=none');
    });

    test(`${p}: long enough to answer a search, with a Start button near the top`, () => {
        assert.ok(words(pg.body) >= 300, `${words(pg.body)} words`);
        assert.ok(pg.body.indexOf('<!--start-->') > 0);
        assert.ok(pg.title.length <= 90 && pg.description.length <= 200, 'title and description fit a search result');
    });

    test(`${p}: the example is a real question of the game, with its true answer`, () => {
        const m = /<p class="q">([^<]+)<\/p>/.exec(pg.body);
        assert.ok(m, 'has an example question');
        const q = questions.find(x => x.lang === lang && x.questionText.replace('$blank$', '____') === m[1]);
        assert.ok(q, `"${m[1]}" is in functions/data/opening-questions.json`);
        assert.ok(pg.body.toLowerCase().indexOf(q.realAnswer.toLowerCase()) >= 0, 'the page gives the true answer');
    });

    test(`${p}: says the game takes up to 12 players, and never 8`, () => {
        assert.ok(/12/.test(text(pg.body)) || /12/.test(pg.description));
        assert.ok(!/(עד|up to) 8\b/i.test(text(pg.body) + pg.description + pg.title));
    });

    test(`${p}: every button it names is one the site shows there`, () => {
        const home = homeStrings(lang), create = createStrings(lang), game = gameStrings(lang), final = finalStrings[lang];
        const norm = s => s.toLowerCase();
        const buttons = [startOf(pg).label, create.create, home.join, game.start, final.rematch, home.presentShort].map(norm);
        const named = [];
        const re = lang === 'he'
            ? /(?:לוחצים על|לוחצים|לוחץ על|ללחוץ על|בוחרים|בוחר|כפתור) "([^"]+)"/g
            : /(?:[Tt]ap|[Cc]lick|[Pp]ress) "([^"]+)"/g;
        pg.body.replace(re, (all, name) => named.push(name));
        // "Rematch" is named without a verb in English ("Rematch" at the end starts another).
        pg.body.replace(/"(Rematch|משחק חוזר)"/g, (all, name) => named.push(name));
        assert.ok(named.length >= 2, `names ${named.length} buttons`);
        named.forEach(name => assert.ok(buttons.indexOf(norm(name)) >= 0, `"${name}" is a button of the site`));
        if (lang === 'he') {
            assert.ok(pg.body.indexOf(home.present) < 0, `"${home.present}" is the phone's name for the big-screen button`);
            (pg.body.match(/<bdi dir="ltr">[^<]+<\/bdi>/g) || []).forEach(a => assert.strictEqual(a, '<bdi dir="ltr">bullshit.wtf/he</bdi>'));
        }
    });

    test(`${p}: links only to pages that exist, and to at least two of its siblings`, () => {
        const links = (pg.body.match(/href="\/[^"]*"/g) || []).map(h => h.slice(6, -1));
        links.forEach(h => assert.ok(page(h), h));
        assert.ok(links.filter(h => h !== '/how-to-play' && h !== '/he/how-to-play').length >= 2, links.join(' '));
    });

    test(`${p}: every page of its language lists it in the menu at the bottom`, () => {
        assert.ok(pg.site.nav.some(n => n.href === p));
    });
});

test('days at home stays calm: the safe room once, in the questions, and no war words in its title', () => {
    const pg = page('/he/days-at-home');
    assert.strictEqual(pg.body.split('ממ"ד').length - 1, 1);
    assert.ok(pg.body.indexOf('ממ"ד') > pg.body.indexOf('<h2>שאלות קצרות</h2>'));
    ['מלחמה', 'אזעקה', 'טיל', 'ממ"ד', 'חירום'].forEach(w => {
        assert.ok((pg.title + pg.h1 + pg.description).indexOf(w) < 0, w);
    });
});

test('the youth page lays out a 40-minute plan, and the classroom page links to it', () => {
    assert.match(page('/he/youth-group').body, /<table>[\s\S]*38–40[\s\S]*<\/table>/);
    assert.ok(page('/he/classroom').body.indexOf('href="/he/youth-group"') >= 0);
});

test('the home row links the new pages: three in Hebrew, family game night in English, snow days in winter', () => {
    const at = (y, m, d) => new Date(y, m - 1, d, 12);
    const hrefs = (lang, d) => searchLinks(lang, null, d).map(l => l.href);
    ['/he/youth-group', '/he/home-together', '/he/school-break'].forEach(h => assert.ok(hrefs('he', at(2026, 11, 15)).indexOf(h) >= 0, h));
    assert.ok(hrefs('en', at(2026, 11, 15)).indexOf('/family-game-night') >= 0);
    assert.ok(hrefs('en', at(2026, 12, 10)).indexOf('/snow-day-games') >= 0);
    assert.ok(hrefs('en', at(2026, 11, 15)).indexOf('/snow-day-games') < 0);
});
