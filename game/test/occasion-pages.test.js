// The Hebrew occasion pages (seo/pages-he-occasions.js and the Hebrew Purim page): each carries its
// own tag on the Start button in a shape the game keeps, has a real question from the game and a
// picture that exists, and is long enough to answer a search. Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const pages = require('../seo/pages');

const root = path.join(__dirname, '..', '..');
const questions = Object.values(JSON.parse(fs.readFileSync(path.join(root, 'functions', 'data', 'opening-questions.json'), 'utf8')));
const joinSource = fs.readFileSync(path.join(root, 'game', 'src', 'app', 'services', 'join-source.ts'), 'utf8');
// The join sources the game keeps for itself: a tag with one of these names would not count as a campaign.
const known = JSON.parse(/const known = (\[[^\]]+\])/.exec(joinSource)[1].replace(/'/g, '"'));

// The search pages for an occasion (seo-he-...). The kit pages for teachers and teams have their own test.
const tagged = pages.filter(p => p.tag && p.tag.indexOf('seo-') === 0);

// The Hebrew site's own words, so that a page names only a button its reader will find.
const ts = require('typescript');
function load(file) {
    const out = ts.transpileModule(fs.readFileSync(path.join(root, 'game', 'src', 'app', file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}
const home = load('pages/landing/home-strings.ts').homeStrings('he');
const create = load('pages/create-game/create-strings.ts').createStrings('he');
const game = load('pages/game-strings.ts').gameStrings('he');
const final = load('pages/score-board-final/final-strings.ts').finalStrings.he;
const startOf = p => (p.start || p.site.start).label;
const words = body => body.replace(/<figure[\s\S]*?<\/figure>/g, ' ').replace(/<[^>]+>/g, ' ')
    .split(/\s+/).filter(w => /[א-ת0-9a-z]/i.test(w)).length;

test('the five occasion pages and the Purim page are there, each with its own tag', () => {
    assert.deepStrictEqual(tagged.map(p => p.path + ' ' + p.tag).sort(), [
        '/he/family-evening seo-he-family',
        '/he/friday-dinner seo-he-friday',
        '/he/friends-evening seo-he-friends',
        '/he/made-up-answers seo-he-made-up',
        '/he/purim seo-he-purim',
        '/he/seder seo-he-seder',
    ]);
});

tagged.forEach(p => {
    test(`${p.path}: the tag is one the game keeps`, () => {
        assert.match(p.tag, /^[a-z0-9][a-z0-9-]{0,39}$/);
        assert.ok(known.indexOf(p.tag) < 0);
        assert.strictEqual(p.start.href, '/create-game?lang=he', 'the Start button opens the Hebrew Create page');
    });

    test(`${p.path}: Hebrew, right to left, 400 words or more`, () => {
        assert.strictEqual(p.site.lang, 'he');
        assert.strictEqual(p.site.dir, 'rtl');
        assert.ok(words(p.body) >= 400, `${words(p.body)} words`);
    });

    test(`${p.path}: the example is a real Hebrew question of the game, with its true answer`, () => {
        const m = /<p class="q">([^<]+)<\/p>/.exec(p.body);
        assert.ok(m, 'has an example question');
        const q = questions.find(x => x.lang === 'he' && x.questionText.replace('$blank$', '____') === m[1]);
        assert.ok(q, `"${m[1]}" is in functions/data/opening-questions.json`);
        assert.ok(p.body.indexOf(q.realAnswer) >= 0, 'the page gives the true answer');
    });

    test(`${p.path}: the picture exists, and a Start button sits near the top`, () => {
        const img = /<img src="\/assets\/([^"]+)" width="(\d+)" height="(\d+)" alt="[^"]+"/.exec(p.body);
        assert.ok(img, 'has a picture with a size and a description');
        const file = fs.readFileSync(path.join(root, 'game', 'src', 'assets', img[1]));
        assert.deepStrictEqual([file.readUInt32BE(16), file.readUInt32BE(20)], [+img[2], +img[3]]);
        assert.ok(p.body.indexOf('<!--start-->') > 0);
    });

    test(`${p.path}: every button it names is the one the Hebrew site shows there`, () => {
        // Guests join on a phone, which shows the long name. The big screen is a television or a
        // computer, whose menu shows the short names: "מסך", never the phone's "הצגה על מסך".
        const buttons = [startOf(p), create.create, home.join, game.start, final.rematch, home.presentShort];
        const named = [];
        p.body.replace(/(?:לוחצים על|לוחצים|לוחץ על|ללחוץ על|בוחרים|בוחר|כפתור) "([^"]+)"/g, (all, name) => named.push(name));
        assert.ok(named.length >= 2, `names ${named.length} buttons`);
        named.forEach(name => assert.ok(buttons.indexOf(name) >= 0, `"${name}" is a button of the Hebrew site`));
        assert.ok(p.body.indexOf(home.present) < 0, `"${home.present}" is the phone's name for the big-screen button`);
    });

    test(`${p.path}: the address it gives is the Hebrew one, so the menu is in Hebrew on any browser`, () => {
        const addresses = p.body.match(/<bdi dir="ltr">[^<]+<\/bdi>/g) || [];
        assert.ok(addresses.length >= 1);
        addresses.forEach(a => assert.strictEqual(a, '<bdi dir="ltr">bullshit.wtf/he</bdi>'));
    });

    test(`${p.path}: every link inside the page leads somewhere`, () => {
        const paths = pages.map(x => x.path);
        (p.body.match(/href="\/he\/[^"]+"/g) || []).forEach(h => {
            assert.ok(paths.indexOf(h.slice(6, -1)) >= 0, h);
        });
    });
});

test('every Hebrew page links to all the occasion pages', () => {
    const he = pages.find(p => p.site.lang === 'he').site;
    const nav = he.nav.map(n => n.href);
    tagged.forEach(p => assert.ok(nav.indexOf(p.path) >= 0, p.path));
    nav.forEach(h => assert.ok(pages.some(p => p.path === h), `${h} is a page`));
});
