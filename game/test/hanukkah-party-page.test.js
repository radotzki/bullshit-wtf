// The Hebrew Hanukkah party page (seo/pages-he-hanukkah-party.js): its party search words (and not the
// quiz words of the adults' quiz page), its Start button into a Hebrew Hanukkah game and its own tag, the
// game's true limits, and no line that gives away a Hebrew question of the game's Hanukkah pack.
// Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const pages = require('../seo/pages');

const root = path.join(__dirname, '..', '..');
const page = pages.find(p => p.path === '/he/hanukkah-party');
const read = (...f) => fs.readFileSync(path.join(root, ...f), 'utf8');
const values = f => Object.values(JSON.parse(read('functions', 'data', f)));
const pack = values('hanukkah-questions.json').filter(q => q.lang === 'he');
const joinSource = read('game', 'src', 'app', 'services', 'join-source.ts');
const known = JSON.parse(/const known = (\[[^\]]+\])/.exec(joinSource)[1].replace(/'/g, '"'));

test('the page is listed once, in Hebrew, right to left', () => {
    assert.ok(page, 'the page is listed');
    assert.strictEqual(pages.filter(p => p.path === page.path).length, 1);
    assert.strictEqual(page.site.lang, 'he');
    assert.strictEqual(page.site.dir, 'rtl');
});

test('title, description and heading carry the party words, not the quiz words', () => {
    assert.ok(page.title.startsWith('מסיבת חנוכה'), page.title);
    assert.match(page.title, /למבוגרים/);
    assert.match(page.title, /לנוער/);
    assert.ok(page.title.length <= 60, `${page.title.length} characters`);
    assert.match(page.description, /מסיבת חנוכה/);
    assert.match(page.description, /משחקים לחנוכה למבוגרים/);
    assert.ok(page.description.length <= 160, `${page.description.length} characters`);
    assert.match(page.h1, /מסיבת חנוכה/);
    // "חידון" is the adults' quiz page's word: the two pages shouldn't compete for it.
    [page.title, page.description, page.h1].forEach(s => assert.doesNotMatch(s, /חידון/, s));
});

test('the Start button opens a Hebrew Hanukkah game, tagged hanukkah-party-he', () => {
    assert.strictEqual(page.start.href, '/create-game?lang=he&pack=hanukkah');
    assert.strictEqual(page.tag, 'hanukkah-party-he');
    assert.match(page.tag, /^[a-z0-9][a-z0-9-]{0,39}$/);
    assert.ok(known.indexOf(page.tag) < 0, 'not one of the game\'s own join sources');
    assert.strictEqual(pages.filter(p => p.tag === page.tag).length, 1, 'no other page uses the tag');
    assert.ok(page.body.indexOf('<!--start-->') > 0, 'a Start button near the top');
    assert.ok(page.body.includes(`"${page.start.label}"`), 'the how-to names the button by its label');
});

test('it says the game\'s true limits and links its sister pages', () => {
    const maxPlayers = +/export const MAX_PLAYERS = (\d+);/.exec(read('game-model.ts'))[1];
    assert.ok(page.body.includes(`עד ${maxPlayers} שחקנים`));
    assert.ok(page.description.includes(`עד ${maxPlayers} שחקנים`));
    assert.match(page.body, /5, 7 או 9 שאלות/);
    assert.match(read('game-model.ts'), /hanukkah: \{\s*perGame: 3,/, 'the page says three Hanukkah questions a game');
    assert.match(page.body, /שלוש שאלות על חנוכה/);
    ['/he/hanukkah', '/he/how-to-play', '/he/team-building'].forEach(href => {
        assert.ok(page.body.includes(`href="${href}"`), href);
        assert.ok(pages.some(p => p.path === href), `${href} is a page`);
    });
});

test('its example is a real general question of the game, with its true answer', () => {
    const general = values('opening-questions.json').filter(q => q.lang === 'he' && !q.pack);
    const shown = /<p class="q">([^<]+)<\/p>/.exec(page.body)[1].replace('____', '$blank$');
    const q = general.find(x => x.questionText === shown);
    assert.ok(q, 'the example is in the game');
    assert.ok(page.body.includes(`האמת: ב${q.realAnswer}.`), q.realAnswer);
});

// The page's words as one plain list: tags and punctuation out.
const norm = s => s.replace(/<[^>]+>/g, ' ').replace(/['"׳״:,.()!?|]/g, ' ').replace(/\s+/g, ' ').trim();
const words = s => norm(s).split(' ').filter(Boolean);
// A pack answer is given away when the page holds it as a word, or after one Hebrew prefix letter
// ("ב", "ה", "ו", "כ", "ל", "מ", "ש"). Answers of 3 letters or fewer ("שם", "אש", "גיל") are everyday
// words and are left out, unless they have two words or more.
const holds = (text, answer) => {
    const a = words(answer);
    if (a.length === 1 && a[0].length <= 3) {
        return false;
    }
    for (let i = 0; i + a.length <= text.length; i++) {
        const first = text[i] === a[0] || (text[i].length === a[0].length + 1 && 'בהוכלמש'.includes(text[i][0]) && text[i].slice(1) === a[0]);
        if (first && a.slice(1).every((w, k) => text[i + 1 + k] === w)) {
            return true;
        }
    }
    return false;
};

test('no line of the page gives away a Hebrew question of the game\'s Hanukkah pack', () => {
    assert.ok(pack.length > 50, 'the pack was read');
    const text = words([page.title, page.description, page.h1, page.body].join(' '));
    const plain = ' ' + text.join(' ') + ' ';
    pack.forEach(q => {
        assert.ok(!holds(text, q.realAnswer), `the page names "${q.realAnswer}", the answer to "${q.questionText}"`);
        // Four words in a row of the pack's question, read with its answer, give its fact away.
        const w = words(q.questionText.replace('$blank$', ' ' + q.realAnswer + ' '));
        for (let k = 0; k + 4 <= w.length; k++) {
            const run = w.slice(k, k + 4).join(' ');
            assert.ok(!plain.includes(' ' + run + ' '), `the page repeats "${run}" from "${q.questionText}"`);
        }
    });
});
