// The Thanksgiving page (seo/pages-en-thanksgiving.js), its links from home, and the Thanksgiving
// pack on the Create page and in the lobby: English only, in its season. Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const pages = require('../seo/pages');

const root = path.join(__dirname, '..', '..');
const app = path.join(root, 'game', 'src', 'app');
const pack = Object.values(JSON.parse(fs.readFileSync(path.join(root, 'functions', 'data', 'thanksgiving-questions.json'), 'utf8')));
/** Loads a TypeScript file, following its relative imports. */
function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5, lib: ['es2016', 'dom'] },
    }).outputText;
    const mod = { exports: {} };
    const req = name => name.startsWith('.') ? load(path.join(path.dirname(file), name + '.ts')) : require(name);
    new Function('module', 'exports', 'require', out)(mod, mod.exports, req);
    return mod.exports;
}
const { searchLinks, seasonLink } = load(path.join(app, 'pages', 'landing', 'search-links.ts'));
const { packBanner } = load(path.join(app, 'pages', 'game-staging', 'lobby-host.ts'));
// The shared model, as the other tests load it: on its own, without the name lists it does not need here.
const model = (() => {
    const out = ts.transpileModule(fs.readFileSync(path.join(root, 'game-model.ts'), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5, lib: ['es2016', 'dom'] },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, () => ({}));
    return mod.exports;
})();
const page = pages.find(p => p.path === '/thanksgiving-party-game');
const words = body => body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(w => /[0-9a-z]/i.test(w)).length;
const at = (y, m, d) => new Date(y, m - 1, d, 12);

test('the page is there: English only, its own tag, title and share picture, and a Start button near the top', () => {
    assert.ok(page);
    assert.strictEqual(page.site.lang, 'en');
    assert.ok(!page.twin, 'English only');
    assert.strictEqual(page.tag, 'seo-en-thanksgiving');
    assert.strictEqual(model.cleanCampaign(page.tag), page.tag);
    assert.match(page.title, /Thanksgiving party game/);
    assert.match(page.title + ' ' + page.h1, /family/);
    assert.match(page.title + ' ' + page.h1, /TV/);
    assert.ok(page.title.length <= 70, `${page.title.length} characters`);
    assert.ok(page.description.length <= 200, `${page.description.length} characters`);
    assert.ok(words(page.body) >= 400, `${words(page.body)} words`);
    assert.ok(page.body.indexOf('<!--start-->') > 0);
    const file = fs.readFileSync(path.join(root, 'game', 'src', 'assets', page.image.replace('/assets/', '')));
    assert.deepStrictEqual([file.readUInt32BE(16), file.readUInt32BE(20)], [1200, 630]);
    assert.strictEqual(pages.filter(p => p.image === page.image).length, 1, 'its own picture');
});

test('its Start button opens an English game with the Thanksgiving pack', () => {
    assert.strictEqual(page.start.href, '/create-game?lang=en&pack=thanksgiving');
    assert.ok(model.packFits('thanksgiving', 'en'));
});

test('the example and the facts the page names are questions of the pack', () => {
    const m = /<p class="q">([^<]+)<\/p>/.exec(page.body);
    assert.ok(m, 'has an example question');
    const q = pack.find(x => x.questionText.replace('$blank$', '____') === m[1]);
    assert.ok(q, `"${m[1]}" is in functions/data/thanksgiving-questions.json`);
    assert.ok(page.body.toLowerCase().indexOf('the truth: ' + q.realAnswer) >= 0, 'the page gives the true answer');
    const texts = pack.map(x => x.questionText).join('\n');
    // "What a president said when he spared his turkey. What the first Macy's parade had instead of
    // balloons. What a football announcer handed the best player of the game."
    assert.match(texts, /President Kennedy spared his Thanksgiving turkey/);
    assert.match(texts, /first Macy's Thanksgiving parade, in 1924, had no balloons/);
    assert.match(texts, /announcer John Madden handed the best player/);
    // "the pack has enough for ten games without a repeat", three a game.
    assert.ok(pack.length >= 10 * model.questionPacks.thanksgiving.perGame);
});

test('the page links only to pages that exist, and the site\'s English pages link to it', () => {
    (page.body.match(/href="\/[^"]*"/g) || []).forEach(h => assert.ok(pages.find(p => p.path === h.slice(6, -1)), h));
    assert.ok(page.site.nav.some(n => n.href === '/thanksgiving-party-game'));
});

test('the English home row links to it in November, and never the Hebrew row', () => {
    const hrefs = (lang, d) => searchLinks(lang, null, d).map(l => l.href);
    assert.ok(hrefs('en', at(2026, 11, 14)).indexOf('/thanksgiving-party-game') >= 0);
    assert.ok(hrefs('en', at(2026, 11, 26)).indexOf('/thanksgiving-party-game') >= 0);
    assert.ok(hrefs('en', at(2026, 10, 31)).indexOf('/thanksgiving-party-game') < 0);
    assert.ok(hrefs('en', at(2026, 11, 30)).indexOf('/thanksgiving-party-game') < 0);
    assert.ok(hrefs('he', at(2026, 11, 26)).every(h => h.indexOf('/he/') === 0));
    assert.match(searchLinks('en', 'fb-x', at(2026, 11, 26)).find(l => /thanksgiving/.test(l.href)).href, /\?via=fb-x$/);
});

test('the line above the home buttons: Thanksgiving from 20 to 29 November in English, Hanukkah in its own season', () => {
    assert.strictEqual(seasonLink('en', at(2026, 11, 19), null), null);
    assert.strictEqual(seasonLink('en', at(2026, 11, 20), null).href, '/thanksgiving-party-game');
    assert.strictEqual(seasonLink('en', at(2026, 11, 26), 'test').href, '/thanksgiving-party-game?via=test');
    assert.strictEqual(seasonLink('en', at(2026, 11, 29), null).href, '/thanksgiving-party-game');
    assert.strictEqual(seasonLink('en', at(2026, 11, 30), null), null);
    assert.strictEqual(seasonLink('he', at(2026, 11, 26), null), null);
    assert.strictEqual(seasonLink('en', at(2026, 12, 5), null).href, '/hanukkah-party-game');
    assert.strictEqual(seasonLink('he', at(2026, 12, 5), null).href, '/he/hanukkah');
});

test('the lobby names a Thanksgiving game, and a Hanukkah game as before', () => {
    assert.match(packBanner('thanksgiving', 'en'), /Thanksgiving edition/);
    assert.match(packBanner('hanukkah', 'en'), /Hanukkah edition/);
    assert.match(packBanner('hanukkah', 'he'), /חנוכה/);
    assert.strictEqual(packBanner(null, 'en'), null);
    assert.strictEqual(packBanner('other', 'en'), null);
});

test('the Create page offers the pack for an English game only, and drops it when Hebrew is picked', () => {
    const src = fs.readFileSync(path.join(app, 'pages', 'create-game', 'create-game.component.ts'), 'utf8');
    assert.match(src, /packFits\(this\.askedPack, this\.locale\) \? this\.askedPack : seasonalPack\(Date\.now\(\), this\.locale\) \|\| null/);
    // The rule itself, as the page applies it.
    const offered = (asked, locale, now) => model.packFits(asked, locale) ? asked : model.seasonalPack(now, locale) || null;
    const thursday = Date.parse('2026-11-26T18:00:00-05:00');
    const october = Date.parse('2026-10-10T18:00:00-05:00');
    assert.strictEqual(offered(null, 'en', thursday), 'thanksgiving');
    assert.strictEqual(offered(null, 'he', thursday), null);
    assert.strictEqual(offered('thanksgiving', 'en', october), 'thanksgiving');
    assert.strictEqual(offered('thanksgiving', 'he', october), null);
    assert.strictEqual(offered('none', 'en', thursday), 'thanksgiving');
    assert.strictEqual(offered('hanukkah', 'he', october), 'hanukkah');
    assert.strictEqual(offered('hanukkah', 'en', thursday), 'hanukkah');
    assert.strictEqual(offered(null, 'en', october), null);
});
