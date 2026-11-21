// The Christmas and New Year pack on the site: the holiday pages' Start buttons, the Create page's
// default by the game's language, the lobby line and the home line. English games get the pack by
// default from 1 December to 29 December (by the date in Israel), then the New Year's Eve pack
// (new-year-page.test.js); Hebrew games keep Hanukkah.
// Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const pages = require('../seo/pages');

const root = path.join(__dirname, '..', '..');
const app = path.join(root, 'game', 'src', 'app');
const pack = JSON.parse(fs.readFileSync(path.join(root, 'functions', 'data', 'christmas-questions.json'), 'utf8'));
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5, lib: ['es2016', 'dom'] },
}).outputText;
/** Loads a TypeScript file, following its relative imports. */
function load(file) {
    const mod = { exports: {} };
    const req = name => name.startsWith('.') ? load(path.join(path.dirname(file), name + '.ts')) : require(name);
    new Function('module', 'exports', 'require', compile(file))(mod, mod.exports, req);
    return mod.exports;
}
const { seasonLink, christmasSeasons } = load(path.join(app, 'pages', 'landing', 'search-links.ts'));
const { packBanner } = load(path.join(app, 'pages', 'game-staging', 'lobby-host.ts'));
const model = (() => {
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', compile(path.join(root, 'game-model.ts')))(mod, mod.exports, () => ({}));
    return mod.exports;
})();
const page = p => pages.find(x => x.path === p);
// The Create page's rule, as create-game.component.ts applies it (thanksgiving-page.test.js checks the line).
const offered = (asked, locale, now) => model.packFits(asked, locale) ? asked : model.seasonalPack(now, locale) || null;

test('every question in the file is of the Christmas pack, and there are enough for ten games', () => {
    const qs = Object.values(pack);
    assert.ok(qs.length >= 10 * model.questionPacks.christmas.perGame);
    qs.forEach(q => assert.strictEqual(q.pack, 'christmas'));
});

test('the holiday pages open an English game with the pack ticked, in season and out of it', () => {
    ['/christmas-party-game', '/office-holiday-party-game'].forEach(p => {
        assert.strictEqual(page(p).start.href, '/create-game?lang=en&pack=christmas', p);
    });
    const july = Date.parse('2027-07-01T12:00:00Z');
    assert.strictEqual(offered('christmas', 'en', july), 'christmas');
    // A Hebrew game never gets it, even by link.
    assert.strictEqual(offered('christmas', 'he', Date.parse('2026-12-24T20:00:00+02:00')), null);
});

test('the Create page ticks Christmas for English games and Hanukkah for Hebrew games in December', () => {
    const dec3 = Date.parse('2026-12-03T19:00:00+00:00');
    assert.strictEqual(offered(null, 'en', dec3), 'christmas');
    assert.strictEqual(offered(null, 'he', dec3), 'hanukkah');
    // The Hanukkah page's own button still gives an English game Hanukkah, in one tap.
    assert.strictEqual(page('/hanukkah-party-game').start.href, '/create-game?lang=en&pack=hanukkah');
    assert.strictEqual(offered('hanukkah', 'en', dec3), 'hanukkah');
    // The ?pack=none of an older link: the box is unticked, and the pack on offer is Christmas.
    assert.strictEqual(offered('none', 'en', dec3), 'christmas');
    assert.strictEqual(offered(null, 'en', Date.parse('2026-12-28T20:00:00-08:00')), 'christmas');
    assert.strictEqual(offered(null, 'en', Date.parse('2026-12-31T23:30:00-08:00')), 'newyear');
    assert.strictEqual(offered(null, 'en', Date.parse('2027-01-03T12:00:00+02:00')), null);
});

test('the lobby names a Christmas game; the home line shows it in English from 1 to 29 December', () => {
    assert.match(packBanner('christmas', 'en'), /Christmas and New Year questions/);
    const at = (y, m, d) => new Date(y, m - 1, d, 12);
    assert.strictEqual(seasonLink('en', at(2026, 11, 29), null).href, '/thanksgiving-party-game');
    assert.strictEqual(seasonLink('en', at(2026, 11, 30), null), null);
    assert.strictEqual(seasonLink('en', at(2026, 12, 1), null).href, '/christmas-party-game');
    assert.strictEqual(seasonLink('en', at(2026, 12, 24), 'fb-x').href, '/christmas-party-game?via=fb-x');
    assert.strictEqual(seasonLink('en', at(2026, 12, 29), null).href, '/christmas-party-game');
    assert.strictEqual(seasonLink('en', at(2026, 12, 30), null).href, '/new-years-eve-party-game');
    assert.strictEqual(seasonLink('en', at(2027, 1, 1), null).href, '/new-years-eve-party-game');
    assert.strictEqual(seasonLink('en', at(2027, 1, 2), null), null);
    assert.strictEqual(seasonLink('he', at(2026, 12, 5), null).href, '/he/hanukkah');
    assert.strictEqual(seasonLink('he', at(2026, 12, 24), null), null);
    christmasSeasons.forEach(s => assert.ok(s.from <= s.to));
});
