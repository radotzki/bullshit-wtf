// The party night pack on the site: the six party-night pages' Start buttons ask for it
// (?pack=party, with each page's own ?via= tag), the Create page offers it ticked in both languages,
// in any month, and never by season, and the lobby names it. The questions and whole games are
// checked in functions/test/party-questions.test.js. Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const pages = require('../seo/pages');

const root = path.join(__dirname, '..', '..');
const app = path.join(root, 'game', 'src', 'app');
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5, lib: ['es2016', 'dom'] },
}).outputText;
function load(file) {
    const mod = { exports: {} };
    const req = name => name.startsWith('.') ? load(path.join(path.dirname(file), name + '.ts')) : require(name);
    new Function('module', 'exports', 'require', compile(file))(mod, mod.exports, req);
    return mod.exports;
}
const { packBanner } = load(path.join(app, 'pages', 'game-staging', 'lobby-host.ts'));
const model = (() => {
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', compile(path.join(root, 'game-model.ts')))(mod, mod.exports, () => ({}));
    return mod.exports;
})();
const party = JSON.parse(fs.readFileSync(path.join(root, 'functions', 'data', 'party-questions.json'), 'utf8'));
// The Create page's rule, as create-game.component.ts applies it.
const offered = (asked, locale, now) => model.packFits(asked, locale) ? asked : model.seasonalPack(now, locale) || null;

const PARTY_PAGES = {
    '/he/bachelorette': ['he', 'party-bachelorette-he'],
    '/he/adult-birthday': ['he', 'party-birthday-he'],
    '/he/friends-weekend': ['he', 'party-weekend-he'],
    '/bachelorette-party-game': ['en', 'party-bachelorette-en'],
    '/adult-birthday-party-game': ['en', 'party-birthday-en'],
    '/weekend-away-games': ['en', 'party-weekend-en'],
};

test('the six party-night pages start a game with the party pack, in their language, with their tag', () => {
    for (const [p, [lang, tag]] of Object.entries(PARTY_PAGES)) {
        const page = pages.find(x => x.path === p);
        assert.ok(page, p);
        assert.strictEqual(page.tag, tag, p);
        assert.strictEqual(page.start.href, `/create-game?lang=${lang}&pack=party`, p);
    }
    // No other page asks for it.
    const others = pages.filter(x => !(x.path in PARTY_PAGES) && x.start && /pack=party/.test(x.start.href));
    assert.deepStrictEqual(others.map(x => x.path), []);
});

test('the built Start link keeps the pack and adds the page\'s tag', () => {
    const html = fs.readFileSync(path.join(root, 'game', 'seo', 'build-pages.js'), 'utf8');
    // build-pages.js appends &via=<tag> to a link that already has a query.
    assert.match(html, /start\.href \+ \(start\.href\.indexOf\('\?'\) < 0 \? '\?' : '&'\) \+ 'via=' \+ p\.tag/);
});

test('the Create page offers the party pack ticked, in both languages, in any month, and never by season', () => {
    const times = ['2026-11-20T19:00:00Z', '2026-12-05T19:00:00Z', '2026-12-24T19:00:00Z', '2027-06-01T19:00:00Z'].map(Date.parse);
    for (const now of times) {
        for (const locale of ['en', 'he']) {
            // Thanksgiving, Hanukkah and Christmas give way to the pack the page asked for.
            assert.strictEqual(offered('party', locale, now), 'party');
            assert.notStrictEqual(offered(null, locale, now), 'party');
        }
    }
    assert.strictEqual(model.questionPacks.party.label.en, 'Party night questions');
    assert.match(model.questionPacks.party.label.he, /[א-ת]/);
    assert.strictEqual(model.packIcon('party'), '🎉');
    assert.strictEqual(model.chosenPack(false, true, 'party'), 'party');
    // Enough questions for ten games a language at the pack's share of a game.
    for (const lang of ['en', 'he']) {
        assert.ok(Object.values(party).filter(q => q.lang === lang).length >= 10 * model.questionPacks.party.perGame, lang);
    }
});

test('the lobby names a party game in its language', () => {
    assert.match(packBanner('party', 'en'), /^Party edition: .*weddings, birthdays, trips and nights out$/);
    assert.match(packBanner('party', 'he'), /^מהדורת מסיבה: /);
    // Other packs keep their lines.
    assert.match(packBanner('christmas', 'en'), /Christmas/);
    assert.strictEqual(packBanner('kids', 'en'), null);
});
