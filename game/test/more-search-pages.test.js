// The Jackbox-alternative pages (English and Hebrew twin) and the English holiday pages (Christmas,
// New Year's Eve, office holiday party): each has its own tag, its own share picture, a real question of
// the game as its example, an honest note on the trademark, and the home row shows the holiday pages
// in December only. Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const pages = require('../seo/pages');

const root = path.join(__dirname, '..', '..');
const assets = path.join(root, 'game', 'src', 'assets');
const questions = Object.values(JSON.parse(fs.readFileSync(path.join(root, 'functions', 'data', 'opening-questions.json'), 'utf8')));
function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}
const { searchLinks } = load(path.join(root, 'game', 'src', 'app', 'pages', 'landing', 'search-links.ts'));
const page = p => pages.find(x => x.path === p);
const words = body => body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(w => /[א-ת0-9a-z]/i.test(w)).length;

const added = {
    '/free-jackbox-alternative': 'seo-en-jackbox',
    '/he/game-like-jackbox': 'seo-he-jackbox',
    '/christmas-party-game': 'seo-en-christmas',
    '/new-years-eve-party-game': 'seo-en-new-year',
    '/office-holiday-party-game': 'seo-en-office-party',
};

test('the new pages are there, each with its own tag', () => {
    Object.keys(added).forEach(p => {
        assert.ok(page(p), p);
        assert.strictEqual(page(p).tag, added[p], p);
    });
    assert.strictEqual(page('/free-jackbox-alternative').twin, '/he/game-like-jackbox');
    assert.strictEqual(page('/he/game-like-jackbox').site.lang, 'he');
});

Object.keys(added).forEach(p => {
    test(`${p}: long enough to answer a search, with a Start button near the top`, () => {
        assert.ok(words(page(p).body) >= 400, `${words(page(p).body)} words`);
        assert.ok(page(p).body.indexOf('<!--start-->') > 0);
    });

    test(`${p}: the example is a real question of the game, with its true answer`, () => {
        const lang = page(p).site.lang;
        const m = /<p class="q">([^<]+)<\/p>/.exec(page(p).body);
        assert.ok(m, 'has an example question');
        const q = questions.find(x => x.lang === lang && x.questionText.replace('$blank$', '____') === m[1].replace(/&#39;/g, '\''));
        assert.ok(q, `"${m[1]}" is in functions/data/opening-questions.json`);
        assert.ok(page(p).body.toLowerCase().indexOf(q.realAnswer.toLowerCase()) >= 0, 'the page gives the true answer');
    });

    test(`${p}: links only to pages that exist`, () => {
        (page(p).body.match(/href="\/[^"]*"/g) || []).forEach(h => assert.ok(page(h.slice(6, -1)), h));
    });
});

test('the holiday pages start a game without the Hanukkah pack, which is on by default in early December', () => {
    ['/christmas-party-game', '/new-years-eve-party-game', '/office-holiday-party-game'].forEach(p => {
        assert.strictEqual(page(p).start.href, '/create-game?lang=en&pack=none', p);
        assert.ok(!page(p).twin, `${p} is English only`);
    });
});

test('the Jackbox pages compare honestly and say they are not connected', () => {
    ['/free-jackbox-alternative', '/he/game-like-jackbox'].forEach(p => {
        const b = page(p).body;
        assert.ok(/not made by, endorsed by or connected to Jackbox Games|אינו קשור ל-Jackbox Games/.test(b), p);
        assert.ok(b.indexOf('<img') < 0, `${p} shows no picture of another company's game`);
    });
});

test('every page in seo/ has its own share picture, 1200x630, and none uses the generic one', () => {
    const seen = {};
    pages.forEach(p => {
        assert.ok(p.image, `${p.path} has a picture`);
        assert.ok(['/assets/og-image.png', '/assets/og-image-he.png'].indexOf(p.image) < 0, `${p.path} has its own picture`);
        const file = fs.readFileSync(path.join(assets, p.image.replace('/assets/', '')));
        assert.deepStrictEqual([file.readUInt32BE(16), file.readUInt32BE(20)], [1200, 630], p.image);
        assert.ok(!seen[p.image], `${p.image} is used by ${seen[p.image]} too`);
        seen[p.image] = p.path;
    });
});

test('the English home row adds the holiday pages from 20 November to 1 January, and not in Hebrew', () => {
    const at = (y, m, d) => new Date(y, m - 1, d, 12);
    const hrefs = (lang, d) => searchLinks(lang, null, d).map(l => l.href);
    assert.ok(hrefs('en', at(2026, 12, 5)).indexOf('/christmas-party-game') >= 0);
    assert.ok(hrefs('en', at(2027, 1, 1)).indexOf('/new-years-eve-party-game') >= 0);
    assert.ok(hrefs('en', at(2026, 11, 19)).indexOf('/christmas-party-game') < 0);
    assert.ok(hrefs('en', at(2027, 1, 2)).indexOf('/christmas-party-game') < 0);
    assert.ok(hrefs('he', at(2026, 12, 5)).every(h => h.indexOf('/he/') === 0));
    searchLinks('en', 'fb-x', at(2026, 12, 5)).forEach(l => assert.match(l.href, /\?via=fb-x$/));
});
