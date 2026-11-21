// The New Year's Eve page and its pack on the site: the page's Start button asks for the New Year's
// Eve pack, the Create page offers it by default in English from 30 December to 2 January (by the
// date in Israel), the lobby names it, and the home line leads to the page from 30 December to New
// Year's Day. From the English New Year's Eve walk (21 November 2026): on 31 December the page opened
// a Christmas game, its steps named a "Present" button the game doesn't have, and it said nothing of
// the video call, the late guests, the sleeping phones or the guests who leave at midnight.
// Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const pages = require('../seo/pages');

const root = path.join(__dirname, '..', '..');
const app = path.join(root, 'game', 'src', 'app');
const data = path.join(root, 'functions', 'data');
const pack = JSON.parse(fs.readFileSync(path.join(data, 'newyear-questions.json'), 'utf8'));
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5, lib: ['es2016', 'dom'] },
}).outputText;
function load(file) {
    const mod = { exports: {} };
    const req = name => name.startsWith('.') ? load(path.join(path.dirname(file), name + '.ts')) : require(name);
    new Function('module', 'exports', 'require', compile(file))(mod, mod.exports, req);
    return mod.exports;
}
const { seasonLink, newYearSeasons, christmasSeasons } = load(path.join(app, 'pages', 'landing', 'search-links.ts'));
const { packBanner } = load(path.join(app, 'pages', 'game-staging', 'lobby-host.ts'));
const model = (() => {
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', compile(path.join(root, 'game-model.ts')))(mod, mod.exports, () => ({}));
    return mod.exports;
})();
const page = pages.find(x => x.path === '/new-years-eve-party-game');
const offered = (asked, locale, now) => model.packFits(asked, locale) ? asked : model.seasonalPack(now, locale) || null;
const text = page.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('the page\'s Start opens an English game with the New Year\'s Eve pack, in season and out of it', () => {
    assert.strictEqual(page.start.href, '/create-game?lang=en&pack=newyear');
    assert.strictEqual(page.start.label, 'Start a New Year\'s game');
    assert.strictEqual(page.tag, 'seo-en-new-year');
    assert.ok(!page.twin, 'English only');
    assert.strictEqual(offered('newyear', 'en', Date.parse('2027-07-01T12:00:00Z')), 'newyear');
    assert.strictEqual(offered('newyear', 'he', Date.parse('2026-12-31T22:00:00+02:00')), null);
    assert.ok(Object.keys(pack).length >= 10 * model.questionPacks.newyear.perGame - 2);
    Object.values(pack).forEach(q => assert.strictEqual(q.pack, 'newyear'));
});

test('the Create page ticks New Year\'s Eve for English games from 30 December, Christmas before', () => {
    assert.strictEqual(offered(null, 'en', Date.parse('2026-12-24T19:00:00-05:00')), 'christmas');
    assert.strictEqual(offered(null, 'en', Date.parse('2026-12-31T21:00:00-05:00')), 'newyear');
    assert.strictEqual(offered(null, 'en', Date.parse('2026-12-31T19:00:00+00:00')), 'newyear');
    assert.strictEqual(offered(null, 'he', Date.parse('2026-12-31T21:00:00+02:00')), null);
    // The Christmas page's own button still gives Christmas on New Year's Eve.
    assert.strictEqual(offered('christmas', 'en', Date.parse('2026-12-31T21:00:00-05:00')), 'christmas');
});

test('the lobby names a New Year\'s Eve game; the home line leads to the page from 30 December to 1 January', () => {
    assert.match(packBanner('newyear', 'en'), /New Year's Eve/);
    assert.doesNotMatch(packBanner('newyear', 'en'), /Christmas/);
    const at = (y, m, d) => new Date(y, m - 1, d, 12);
    assert.strictEqual(seasonLink('en', at(2026, 12, 29), null).href, '/christmas-party-game');
    assert.strictEqual(seasonLink('en', at(2026, 12, 30), null).href, '/new-years-eve-party-game');
    assert.strictEqual(seasonLink('en', at(2026, 12, 31), 'fb-x').href, '/new-years-eve-party-game?via=fb-x');
    assert.strictEqual(seasonLink('en', at(2027, 1, 1), null).href, '/new-years-eve-party-game');
    assert.strictEqual(seasonLink('en', at(2027, 1, 2), null), null);
    assert.strictEqual(seasonLink('he', at(2026, 12, 31), null), null);
    newYearSeasons.forEach(s => assert.ok(s.from <= s.to));
    christmasSeasons.forEach(c => newYearSeasons.forEach(s => assert.ok(c.to < s.from)));
});

test('the page names the buttons the game has, and the night\'s real steps', () => {
    assert.doesNotMatch(page.body, /"Present"/);
    assert.match(page.body, /"Present Game"/);
    assert.match(page.body, /"Use as the big screen"/);
    assert.match(page.body, /"Join Game"/);
    assert.match(page.body, /REMATCH/);
    assert.match(page.body, /JOIN THE REMATCH/);
    // The video call, the latecomer, the sleeping phone, the guest who leaves at midnight.
    assert.match(text, /video call/);
    assert.match(text, /at 0 points/);
    assert.match(text, /goes to sleep/);
    assert.match(text, /leaves at midnight/);
    // A grown-up table: the kids switch off, short names, the name of the game.
    assert.match(text, /Leave "Kids are playing" off/);
    assert.match(text, /9 letters at most/);
    assert.match(text, /swear word/);
    assert.match(text, /in English only/);
    assert.doesNotMatch(text, /English or Hebrew/);
});

test('the page\'s example gives away no question of the game', () => {
    const example = page.body.match(/<p class="q">([^<]+)<\/p>/)[1].toLowerCase();
    const story = page.body.match(/<div class="example">[\s\S]*?<\/div>/)[0].toLowerCase();
    for (const f of fs.readdirSync(data).filter(f => f.endsWith('.json'))) {
        const set = JSON.parse(fs.readFileSync(path.join(data, f), 'utf8'));
        const qs = (Array.isArray(set) ? set : Object.values(set)).filter(q => q && typeof q.questionText === 'string');
        for (const q of qs) {
            assert.ok(!/ecuador/i.test(q.questionText), `${f}: ${q.questionText}`);
            const words = q.questionText.toLowerCase().replace(/\$blank\$/, '____');
            assert.notStrictEqual(words, example, f);
        }
    }
    // Nor does the page name a truth of its own pack.
    for (const q of Object.values(pack)) {
        assert.ok(!new RegExp(`\\b${q.realAnswer.replace(/[^a-z0-9 ]/g, '.')}\\b`).test(story), q.realAnswer);
        if (q.realAnswer.length >= 8) assert.ok(text.toLowerCase().indexOf(q.realAnswer) < 0, `the page says "${q.realAnswer}"`);
    }
});
