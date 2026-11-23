// The Hebrew adults' Hanukkah quiz page (seo/pages-he-hanukkah-quiz.js): its search words, its Start button
// and tag, a link to the Hanukkah page, 12 questions each with an answer, and none that a Hanukkah game
// would then ask (the page must not spoil the game's own pack). Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const pages = require('../seo/pages');
const quiz = require('../seo/pages-he-hanukkah-quiz');

const root = path.join(__dirname, '..', '..');
const page = pages.find(p => p.path === '/he/hanukkah-quiz');
const pack = Object.values(JSON.parse(fs.readFileSync(path.join(root, 'functions', 'data', 'hanukkah-questions.json'), 'utf8')));
const joinSource = fs.readFileSync(path.join(root, 'game', 'src', 'app', 'services', 'join-source.ts'), 'utf8');
const known = JSON.parse(/const known = (\[[^\]]+\])/.exec(joinSource)[1].replace(/'/g, '"'));
const norm = s => s.replace(/['"׳״:,.]/g, '').replace(/\s+/g, ' ').trim();

test('the page is in the list once, in Hebrew, right to left', () => {
    assert.ok(page, 'the page is listed');
    assert.strictEqual(pages.filter(p => p.path === page.path).length, 1);
    assert.strictEqual(page.site.lang, 'he');
    assert.strictEqual(page.site.dir, 'rtl');
});

test('title, description and heading carry the search words', () => {
    assert.ok(page.title.startsWith('חידון חנוכה למבוגרים'), page.title);
    assert.ok(page.title.length <= 60, `${page.title.length} characters`);
    assert.match(page.description, /^חידון חנוכה למבוגרים/);
    assert.match(page.description, /מצחיק/);
    assert.match(page.description, /לכל המשפחה|למשפחה/);
    assert.ok(page.description.length <= 160, `${page.description.length} characters`);
    assert.match(page.h1, /חידון חנוכה למבוגרים/);
});

test('the Start button opens a Hebrew Hanukkah game, tagged hanukkah-quiz', () => {
    assert.strictEqual(page.start.href, '/create-game?lang=he&pack=hanukkah');
    assert.strictEqual(page.tag, 'hanukkah-quiz');
    assert.match(page.tag, /^[a-z0-9][a-z0-9-]{0,39}$/);
    assert.ok(known.indexOf(page.tag) < 0, 'not one of the game\'s own join sources');
    assert.strictEqual(pages.filter(p => p.tag === page.tag).length, 1, 'no other page uses the tag');
    assert.ok(page.body.indexOf('<!--start-->') > 0 && page.body.indexOf('<!--start-->') < page.body.indexOf('<ol class="quiz">'),
        'a Start button sits above the questions');
});

test('12 questions, each read aloud with its answer behind "התשובה"', () => {
    assert.strictEqual(quiz.questions.length, 12);
    assert.strictEqual((page.body.match(/<details><summary>התשובה<\/summary>/g) || []).length, 12);
    quiz.questions.forEach(x => {
        assert.ok(x.q && x.a && x.answer, x.q);
        assert.ok(page.body.includes(x.q), x.q);
        assert.ok(norm(x.a).includes(norm(x.answer).split(' ')[0]), `the answer text names "${x.answer}"`);
    });
});

// Words of a pack question as one plain list: punctuation out, the blank filled with its true answer.
const words = s => norm(s.replace(/[()!?]/g, ' ')).split(' ').filter(Boolean);
// A pack answer is spoiled when a quiz question or answer holds it as a word, or after one Hebrew prefix letter
// ("ב", "ה", "ו", "כ", "ל", "מ", "ש"), so "גרמני" isn't found inside "מגרמניה". Answers of 3 letters or fewer
// ("שם", "אש", "שני") are everyday words and are left out, unless they have two words or more.
const holds = (text, answer) => {
    const a = words(answer);
    const t = words(text);
    if (a.length === 1 && a[0].length <= 3) {
        return false;
    }
    for (let i = 0; i + a.length <= t.length; i++) {
        const first = t[i] === a[0] || (t[i].length === a[0].length + 1 && 'בהוכלמש'.includes(t[i][0]) && t[i].slice(1) === a[0]);
        if (first && a.slice(1).every((w, k) => t[i + 1 + k] === w)) {
            return true;
        }
    }
    return false;
};
// Pack answers that a quiz question names for another fact, each checked by hand.
//  - "רומא": quiz 11 is Rome entering Jerusalem in 63 BCE; the pack asks who Judah signed a treaty with.
const allowed = { 'רומא': 11 };

test('no question or answer gives away a Hebrew question of the game\'s Hanukkah pack', () => {
    const he = pack.filter(q => q.lang === 'he');
    assert.ok(he.length > 50, 'the pack was read');
    quiz.questions.forEach((x, i) => {
        const text = x.q + ' ' + x.a;
        const plain = ' ' + words(text).join(' ') + ' ';
        he.forEach(q => {
            assert.notStrictEqual(norm(x.answer), norm(q.realAnswer), `quiz ${i + 1} has the same answer as "${q.questionText}"`);
            if (allowed[norm(q.realAnswer)] !== i + 1) {
                assert.ok(!holds(text, q.realAnswer), `quiz ${i + 1} names "${q.realAnswer}", the answer to "${q.questionText}"`);
            }
            // Four words in a row of the pack's question, read with its answer, give its fact away.
            const w = words(q.questionText.replace('$blank$', ' ' + q.realAnswer + ' '));
            for (let k = 0; k + 4 <= w.length; k++) {
                const run = w.slice(k, k + 4).join(' ');
                assert.ok(!plain.includes(' ' + run + ' '), `quiz ${i + 1} repeats "${run}" from "${q.questionText}"`);
            }
        });
    });
});

test('it links the Hanukkah page and how to play, and says the game\'s true limits', () => {
    assert.ok(page.body.includes('href="/he/hanukkah"'));
    assert.ok(page.body.includes('href="/he/how-to-play"'));
    const maxPlayers = +/export const MAX_PLAYERS = (\d+);/.exec(fs.readFileSync(path.join(root, 'game-model.ts'), 'utf8'))[1];
    assert.ok(page.body.includes(`עד ${maxPlayers} שחקנים`));
    assert.match(page.body, /5, 7 או 9 שאלות/);
});
