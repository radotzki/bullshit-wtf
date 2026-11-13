// The kit for people who lead a room (seo/pages-kit.js): a classroom page and a team page, each in
// English and Hebrew, twins of each other. Each carries its own tag on its Start button, names only
// buttons its reader will find on the site, and says only what the game does. Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const pages = require('../seo/pages');

const root = path.join(__dirname, '..', '..');
const joinSource = fs.readFileSync(path.join(root, 'game', 'src', 'app', 'services', 'join-source.ts'), 'utf8');
const known = JSON.parse(/const known = (\[[^\]]+\])/.exec(joinSource)[1].replace(/'/g, '"'));

function load(file) {
    const out = ts.transpileModule(fs.readFileSync(path.join(root, 'game', 'src', 'app', file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const homeStrings = load('pages/landing/home-strings.ts').homeStrings;
const createStrings = load('pages/create-game/create-strings.ts').createStrings;
const gameStrings = load('pages/game-strings.ts').gameStrings;
const finalStrings = load('pages/score-board-final/final-strings.ts').finalStrings;
// The lobby's "try alone" link, read from its source: lobby-host.ts imports other files.
const alone = lang => {
    const all = read('game/src/app/pages/game-staging/lobby-host.ts').match(/startAlone: \(\) => '([^']+)'/g)
        .map(m => /'([^']+)'/.exec(m)[1]);
    return all.find(s => lang === 'he' ? /[א-ת]/.test(s) : !/[א-ת]/.test(s));
};

// Phones join and start; a computer shows the short names of the home menu ("Present", "מסך").
function buttons(lang, p) {
    const home = homeStrings(lang);
    return [p.start.label, createStrings(lang).create, home.join, home.presentShort, gameStrings(lang).start,
        finalStrings[lang].rematch, alone(lang)].map(s => s.toLowerCase());
}

const kit = pages.filter(p => p.tag && p.tag.indexOf('kit-') === 0);
const words = body => body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(w => /[א-ת0-9a-z]/i.test(w)).length;

test('four kit pages, one per audience and language, each with its own tag', () => {
    assert.deepStrictEqual(kit.map(p => p.path + ' ' + p.tag).sort(), [
        '/classroom-game kit-en-teachers',
        '/he/classroom kit-he-teachers',
        '/he/team-building kit-he-teams',
        '/team-building-game kit-en-teams',
    ]);
});

kit.forEach(p => {
    const lang = p.site.lang;
    test(`${p.path}: the tag is one the game keeps, and Start opens the Create page in the page's language`, () => {
        assert.match(p.tag, /^[a-z0-9][a-z0-9-]{0,39}$/);
        assert.ok(known.indexOf(p.tag) < 0);
        assert.ok(p.tag.indexOf(`kit-${lang}-`) === 0, 'kit-<lang>-<audience>');
        assert.strictEqual(p.start.href, `/create-game?lang=${lang}`);
    });

    test(`${p.path}: has a twin in the other language, and is long enough to answer a search`, () => {
        const twin = pages.find(x => x.path === p.twin);
        assert.ok(twin && twin.twin === p.path && twin.site.lang !== lang);
        assert.ok(twin.tag.split('-')[2] === p.tag.split('-')[2], 'the twin is for the same audience');
        assert.ok(words(p.body) >= 500, `${words(p.body)} words`);
        assert.ok(p.body.indexOf('<!--start-->') > 0);
    });

    test(`${p.path}: it says what the game is in one line, how to put it on a big screen, how to split a room, and what fits 15 minutes`, () => {
        const h2 = (p.body.match(/<h2>[^<]+<\/h2>/g) || []).join(' ');
        if (lang === 'he') {
            assert.match(p.body, /המשחק בשורה אחת/);
            assert.match(h2, /מקרן|מסך הגדול/);
            assert.match(h2, /רבע שעה/);
        } else {
            assert.match(p.body, /The game in one line/);
            assert.match(h2, /projector|big screen/);
            assert.match(h2, /15 minutes/);
        }
        assert.match(p.body, /\b8\b/);
    });

    test(`${p.path}: every button it names is one the site shows there`, () => {
        const known = buttons(lang, p);
        const named = [];
        const re = lang === 'he'
            ? /(?:לוחצים על|לוחצים|בוחרים) "([^"]+)"/g
            : /(?:tap|taps|click|clicks|press) "([^"]+)"/gi;
        p.body.replace(re, (all, name) => named.push(name));
        assert.ok(named.length >= 4, `names ${named.length} buttons`);
        named.forEach(name => assert.ok(known.indexOf(name.toLowerCase()) >= 0, `"${name}" is a button of the site`));
        if (lang === 'he') {
            assert.ok(p.body.indexOf(homeStrings('he').present) < 0, 'the phone\'s name for the big-screen button');
        }
    });

    test(`${p.path}: the address it gives opens the menu in its language`, () => {
        const addresses = p.body.match(/<bdi dir="ltr">[^<]+<\/bdi>/g) || [];
        assert.ok(addresses.length >= 2);
        const want = lang === 'he' ? 'bullshit.wtf/he' : 'bullshit.wtf';
        addresses.forEach(a => assert.strictEqual(a, `<bdi dir="ltr">${want}</bdi>`));
    });

    test(`${p.path}: the numbers it gives are the game's`, () => {
        const phase = read('functions/src/controllers/phase.ts');
        assert.match(phase, /ShowQuestion\]: 25000/);
        assert.match(phase, /ShowAnswers\]: 20000/);
        assert.match(p.body, /25/);
        assert.match(p.body, /20/);
        assert.match(read('functions/src/controllers/join.ts'), /length === 8\)/);
        assert.match(read('name-flag.ts'), /NICKNAME_MAX = 9;/);
        assert.match(p.body, /\b9\b/);
        // No promise the game cannot keep.
        assert.doesNotMatch(p.body, /source|citation|wikipedia|מקור|ויקיפדיה/i);
    });

    test(`${p.path}: every link inside the page leads to a page`, () => {
        const paths = pages.map(x => x.path);
        (p.body.match(/href="\/[^"]+"/g) || []).forEach(h => assert.ok(paths.indexOf(h.slice(6, -1)) >= 0, h));
    });

    test(`${p.path}: the footer of every page in its language links to it`, () => {
        assert.ok(p.site.nav.some(n => n.href === p.path));
    });
});
