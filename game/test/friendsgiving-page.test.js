// The Friendsgiving page (seo/pages-en-thanksgiving.js): a search page for "Friendsgiving games", English
// only, whose Start button opens an English game with the Thanksgiving pack, tagged ?via=friendsgiving.
// Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const pages = require('../seo/pages');

const root = path.join(__dirname, '..', '..');
const pack = Object.values(JSON.parse(fs.readFileSync(path.join(root, 'functions', 'data', 'thanksgiving-questions.json'), 'utf8')));
// The shared model, as the other tests load it: on its own, without the name lists it does not need here.
const model = (() => {
    const out = ts.transpileModule(fs.readFileSync(path.join(root, 'game-model.ts'), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5, lib: ['es2016', 'dom'] },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, () => ({}));
    return mod.exports;
})();
const page = pages.find(p => p.path === '/friendsgiving-games');
const thanksgiving = pages.find(p => p.path === '/thanksgiving-party-game');
const words = body => body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(w => /[0-9a-z]/i.test(w)).length;

test('the page is there: English only, its own tag, title and share picture, and a Start button near the top', () => {
    assert.ok(page);
    assert.strictEqual(page.site.lang, 'en');
    assert.ok(!page.twin, 'English only');
    assert.strictEqual(page.tag, 'friendsgiving');
    assert.strictEqual(model.cleanCampaign(page.tag), page.tag);
    assert.match(page.title, /Friendsgiving games/);
    assert.match(page.h1, /Friendsgiving/);
    assert.ok(page.title.length <= 60, `${page.title.length} characters`);
    assert.ok(page.description.length <= 155, `${page.description.length} characters`);
    assert.ok(words(page.body) >= 400, `${words(page.body)} words`);
    // The Start button comes right after one short opening paragraph, so it is on a phone's first screen.
    const opening = page.body.slice(0, page.body.indexOf('<!--start-->'));
    assert.ok(opening.length > 0 && words(opening) <= 70, `${words(opening)} words before Start`);
    const file = fs.readFileSync(path.join(root, 'game', 'src', 'assets', page.image.replace('/assets/', '')));
    assert.deepStrictEqual([file.readUInt32BE(16), file.readUInt32BE(20)], [1200, 630]);
    assert.strictEqual(pages.filter(p => p.image === page.image).length, 1, 'its own picture');
    assert.strictEqual(pages.filter(p => p.title === page.title).length, 1, 'its own title');
});

test('its Start button opens an English game with the Thanksgiving pack, on any day', () => {
    assert.strictEqual(page.start.href, '/create-game?lang=en&pack=thanksgiving');
    assert.ok(model.packFits('thanksgiving', 'en'));
    assert.match(page.body, new RegExp('Tap "' + page.start.label + '"'));
});

test('the example and the facts the page names are questions of the pack', () => {
    const m = /<p class="q">([^<]+)<\/p>/.exec(page.body);
    assert.ok(m, 'has an example question');
    const q = pack.find(x => x.questionText.replace('$blank$', '____') === m[1]);
    assert.ok(q, `"${m[1]}" is in functions/data/thanksgiving-questions.json`);
    assert.ok(page.body.toLowerCase().indexOf('the truth: ' + q.realAnswer) >= 0, 'the page gives the true answer');
    const texts = pack.map(x => x.questionText + ' = ' + x.realAnswer).join('\n');
    // "the year a president moved the holiday, the company kitchen that invented green bean casserole,
    // the sitcom that dropped live turkeys from the sky, the old name for the wishbone"
    assert.match(texts, /President Roosevelt moved Thanksgiving/);
    assert.match(texts, /Green bean casserole was invented/);
    assert.match(texts, /live turkeys are dropped from a \$blank\$ = helicopter/);
    assert.match(texts, /the wishbone had another name/);
    // "up to three Thanksgiving questions"
    assert.strictEqual(model.questionPacks.thanksgiving.perGame, 3);
});

test('it and the Thanksgiving page link to each other, and every link goes to a page that exists', () => {
    [page, thanksgiving].forEach(p =>
        (p.body.match(/href="\/[^"]*"/g) || []).forEach(h => assert.ok(pages.find(x => x.path === h.slice(6, -1)), p.path + ' ' + h)));
    assert.match(page.body, /href="\/thanksgiving-party-game"/);
    assert.match(thanksgiving.body, /href="\/friendsgiving-games"/);
});

test('it says only what the game does: 12 players, 5, 7 or 9 questions, the real button names', () => {
    const maxPlayers = +/export const MAX_PLAYERS = (\d+);/.exec(fs.readFileSync(path.join(root, 'game-model.ts'), 'utf8'))[1];
    assert.match(page.body, new RegExp('Up to ' + maxPlayers + ' phones'));
    assert.match(page.body, /5, 7 or 9 questions/);
    const home = fs.readFileSync(path.join(root, 'game', 'src', 'app', 'pages', 'landing', 'home-strings.ts'), 'utf8');
    assert.match(home, /present: 'Present Game'/);
    assert.match(page.body, /"Present Game"/);
});
