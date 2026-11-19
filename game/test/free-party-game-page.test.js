// The free party game page (/free-party-game-tv-and-phones): its own tag, its own share picture, a real
// question of the game as its example, the big-screen buttons named as the game names them, a fair word
// on the paid packs with the trademark note, and links from the home page and the other English pages.
// Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const pages = require('../seo/pages');

const root = path.join(__dirname, '..', '..');
const questions = Object.values(JSON.parse(fs.readFileSync(path.join(root, 'functions', 'data', 'opening-questions.json'), 'utf8')));
const page = pages.find(x => x.path === '/free-party-game-tv-and-phones');
const words = body => body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(w => /[a-z0-9]/i.test(w)).length;

test('the page is there, English only, with its own tag on its Start button', () => {
    assert.ok(page);
    assert.strictEqual(page.site.lang, 'en');
    assert.ok(!page.twin, 'no Hebrew twin');
    assert.strictEqual(page.tag, 'seo-en-free-party-game');
    assert.strictEqual(page.start.href, '/create-game?lang=en');
    assert.strictEqual(pages.filter(p => p.tag === page.tag).length, 1, 'no other page uses the tag');
});

test('long enough to answer a search, with a Start button near the top, and a title that fits', () => {
    assert.ok(words(page.body) >= 400, `${words(page.body)} words`);
    assert.ok(page.body.indexOf('<!--start-->') > 0);
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

test('the big-screen steps name the buttons as the game shows them', () => {
    const host = fs.readFileSync(path.join(root, 'game', 'src', 'app', 'pages', 'game-staging', 'big-screen-host.ts'), 'utf8');
    const home = fs.readFileSync(path.join(root, 'game', 'src', 'app', 'pages', 'landing', 'home-strings.ts'), 'utf8');
    assert.match(host, /button: 'USE AS THE BIG SCREEN'/);
    assert.match(home, /present: 'Present Game'/);
    assert.match(home, /create: 'Create Game'/);
    assert.match(home, /join: 'Join Game'/);
    assert.match(page.body, /"Use as the big screen"/);
    assert.match(page.body, /"Present Game"/);
    assert.match(page.body, /"Create Game"/);
    assert.match(page.body, /"Join Game"/);
});

test('names the paid packs fairly: no picture, and says it is not connected', () => {
    assert.ok(page.body.indexOf('<img') < 0);
    assert.match(page.body, /not made by, endorsed by or connected to Jackbox Games/);
    assert.match(page.body, /href="\/free-jackbox-alternative"/);
});

test('links only to pages that exist, and is linked from the home page and the English pages', () => {
    (page.body.match(/href="\/[^"]*"/g) || []).forEach(h => assert.ok(pages.find(p => p.path === h.slice(6, -1)), h));
    const index = fs.readFileSync(path.join(root, 'game', 'src', 'index.html'), 'utf8');
    assert.strictEqual(index.split('href="/free-party-game-tv-and-phones"').length - 1, 1);
    assert.ok(page.site.nav.some(l => l.href === '/free-party-game-tv-and-phones'));
});

test('has its own 1200x630 share picture', () => {
    const file = fs.readFileSync(path.join(root, 'game', 'src', 'assets', page.image.replace('/assets/', '')));
    assert.deepStrictEqual([file.readUInt32BE(16), file.readUInt32BE(20)], [1200, 630]);
});
