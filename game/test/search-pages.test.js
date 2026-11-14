// The general search pages (how to play, party games on your phone, Hanukkah, Purim) carry a tag on
// their Start button, and the home menu links them (src/app/pages/landing/search-links.ts).
// Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const pages = require('../seo/pages');

function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}
const app = path.join(__dirname, '..', 'src', 'app');
const { searchLinks, seasonLink, hanukkahSeasons } = load(path.join(app, 'pages', 'landing', 'search-links.ts'));
const joinSource = fs.readFileSync(path.join(app, 'services', 'join-source.ts'), 'utf8');
const known = JSON.parse(/const known = (\[[^\]]+\])/.exec(joinSource)[1].replace(/'/g, '"'));
const paths = pages.map(p => p.path);

test('every search page has its own tag, in a shape the game keeps', () => {
    const tags = {
        '/how-to-play': 'seo-en-how',
        '/he/how-to-play': 'seo-he-how',
        '/party-games-on-your-phone': 'seo-en-phone',
        '/he/party-game-phone': 'seo-he-phone',
        '/hanukkah-party-game': 'seo-en-hanukkah',
        '/he/hanukkah': 'seo-he-hanukkah',
        '/purim-party-game': 'seo-en-purim',
        '/he/purim': 'seo-he-purim',
    };
    Object.keys(tags).forEach(p => {
        const page = pages.find(x => x.path === p);
        assert.ok(page, p);
        assert.strictEqual(page.tag, tags[p], p);
        assert.match(page.tag, /^[a-z0-9][a-z0-9-]{0,39}$/);
        assert.ok(known.indexOf(page.tag) < 0);
    });
    pages.forEach(p => assert.ok(p.tag, `${p.path} has no tag, so its games are invisible in the numbers`));
    const all = pages.map(p => p.tag);
    assert.strictEqual(new Set(all).size, all.length, 'no two pages share a tag');
});

test('the home menu links pages that exist, in the visitor\'s language', () => {
    const en = searchLinks('en', null);
    const he = searchLinks('he', null);
    assert.deepStrictEqual(searchLinks('fr', null), en);
    assert.ok(en.length >= 4 && he.length >= 4);
    en.concat(he).forEach(l => assert.ok(paths.indexOf(l.href) >= 0, `${l.href} is a page`));
    en.forEach(l => assert.strictEqual(pages.find(p => p.path === l.href).site.lang, 'en', l.href));
    he.forEach(l => {
        assert.strictEqual(pages.find(p => p.path === l.href).site.lang, 'he', l.href);
        assert.ok(/[֐-׿]/.test(l.label) && !/[A-Za-z]/.test(l.label), l.label);
    });
    assert.ok(en.some(l => l.href === '/hanukkah-party-game'));
    assert.ok(he.some(l => l.href === '/he/hanukkah'));
});

test('a post\'s tag rides on the links, so the page keeps it on its Start button', () => {
    searchLinks('he', 'fb-he-hanukkah').forEach(l => assert.match(l.href, /^\/he\/[a-z-]+\?via=fb-he-hanukkah$/));
    searchLinks('en', null).forEach(l => assert.ok(l.href.indexOf('?') < 0));
});

test('the Hanukkah line shows from 1 to 13 December 2026, and not around it', () => {
    const at = (y, m, d) => new Date(y, m - 1, d, 12);
    assert.strictEqual(seasonLink('en', at(2026, 11, 30), null), null);
    assert.strictEqual(seasonLink('en', at(2026, 12, 1), null).href, '/hanukkah-party-game');
    assert.strictEqual(seasonLink('he', at(2026, 12, 11), null).href, '/he/hanukkah');
    assert.strictEqual(seasonLink('he', at(2026, 12, 13), 'wa-x').href, '/he/hanukkah?via=wa-x');
    assert.strictEqual(seasonLink('he', at(2026, 12, 14), null), null);
    assert.strictEqual(seasonLink('en', at(2027, 12, 5), null), null, 'Hanukkah moves: next year\'s days must be added');
    hanukkahSeasons.forEach(s => assert.ok(/^\d{4}-\d\d-\d\d$/.test(s.from) && /^\d{4}-\d\d-\d\d$/.test(s.to) && s.from <= s.to));
    assert.ok(/[֐-׿]/.test(seasonLink('he', at(2026, 12, 5), null).label));
});
