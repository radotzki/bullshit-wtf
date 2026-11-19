// The Shabbat dinner page (/shabbat-dinner-game): the English twin of /he/friday-dinner, with its own tag,
// its own share picture, a real question of the game as its example, the buttons named as the game names
// them, no seasonal pack on its Start button, and links from the home page and the other English pages.
// Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const pages = require('../seo/pages');

const root = path.join(__dirname, '..', '..');
const app = path.join(root, 'game', 'src', 'app');
const questions = Object.values(JSON.parse(fs.readFileSync(path.join(root, 'functions', 'data', 'opening-questions.json'), 'utf8')));
const page = pages.find(x => x.path === '/shabbat-dinner-game');
const words = body => body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(w => /[a-z0-9]/i.test(w)).length;

test('the page is there, in English, twin of the Hebrew Friday-dinner page, with its own tag', () => {
    assert.ok(page);
    assert.strictEqual(page.site.lang, 'en');
    assert.strictEqual(page.twin, '/he/friday-dinner');
    const he = pages.find(x => x.path === '/he/friday-dinner');
    assert.strictEqual(he.twin, '/shabbat-dinner-game');
    assert.strictEqual(he.tag, 'seo-he-friday', 'the Hebrew page keeps its own tag');
    assert.strictEqual(page.tag, 'seo-en-shabbat-dinner');
    assert.strictEqual(pages.filter(p => p.tag === page.tag).length, 1, 'no other page uses the tag');
});

test('the Start button opens an English game with no seasonal pack', () => {
    assert.strictEqual(page.start.href, '/create-game?lang=en&pack=none');
});

test('long enough to answer a search, with a Start button near the top, and a title that fits', () => {
    assert.ok(words(page.body) >= 400, `${words(page.body)} words`);
    const at = page.body.indexOf('<!--start-->');
    assert.ok(at > 0 && at < 800, 'the Start button follows the first paragraph');
    assert.ok(page.title.length <= 60, `${page.title.length} characters`);
    assert.ok(page.description.length <= 170, `${page.description.length} characters`);
});

test('the example is a real question of the game, with its true answer', () => {
    const m = /<p class="q">([^<]+)<\/p>/.exec(page.body);
    assert.ok(m);
    const q = questions.find(x => x.lang === 'en' && x.questionText.replace('$blank$', '____') === m[1]);
    assert.ok(q, `"${m[1]}" is in functions/data/opening-questions.json`);
    assert.ok(page.body.toLowerCase().indexOf(q.realAnswer.toLowerCase()) >= 0);
});

test('the buttons it names are the ones the game shows', () => {
    const home = fs.readFileSync(path.join(app, 'pages', 'landing', 'home-strings.ts'), 'utf8');
    const create = fs.readFileSync(path.join(app, 'pages', 'create-game', 'create-strings.ts'), 'utf8');
    const game = fs.readFileSync(path.join(app, 'pages', 'game-strings.ts'), 'utf8');
    const final = fs.readFileSync(path.join(app, 'pages', 'score-board-final', 'final-strings.ts'), 'utf8');
    assert.match(home, /present: 'Present Game'/);
    assert.match(home, /join: 'Join Game'/);
    assert.match(create, /create: 'CREATE'/);
    assert.match(create, /kids: '🧒 Kids are playing'/);
    assert.match(game, /start: 'START'/);
    assert.match(final, /rematch: 'REMATCH'/);
    const named = [];
    page.body.replace(/(?:tap|taps|click|press|presses|Tick) "([^"]+)"/g, (all, name) => named.push(name));
    const buttons = [page.start.label, 'Present Game', 'Join Game', 'Create', 'Kids are playing', 'Start'];
    assert.ok(named.length >= 4, `names ${named.length} buttons`);
    named.forEach(name => assert.ok(buttons.indexOf(name) >= 0, `"${name}" is a button of the game`));
    assert.match(page.body, /"Rematch"/);
});

test('says the phones are for the game only, and does not argue with a table that keeps Shabbat without them', () => {
    assert.match(page.body, /for the game only/i);
    assert.match(page.body, /keeps Shabbat without phones/);
});

test('links only to pages that exist, and is linked from the home page and the English pages', () => {
    (page.body.match(/href="\/[^"]*"/g) || []).forEach(h => assert.ok(pages.find(p => p.path === h.slice(6, -1)), h));
    const index = fs.readFileSync(path.join(root, 'game', 'src', 'index.html'), 'utf8');
    assert.strictEqual(index.split('href="/shabbat-dinner-game"').length - 1, 1);
    assert.ok(page.site.nav.some(l => l.href === '/shabbat-dinner-game'));
});

test('has its own 1200x630 share picture', () => {
    const file = fs.readFileSync(path.join(root, 'game', 'src', 'assets', page.image.replace('/assets/', '')));
    assert.deepStrictEqual([file.readUInt32BE(16), file.readUInt32BE(20)], [1200, 630]);
});
