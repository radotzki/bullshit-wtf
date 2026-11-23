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

test('no question is one of the game\'s Hebrew Hanukkah questions', () => {
    const he = pack.filter(q => q.lang === 'he');
    assert.ok(he.length > 50, 'the pack was read');
    quiz.questions.forEach(x => {
        he.forEach(q => {
            assert.notStrictEqual(norm(x.answer), norm(q.realAnswer), `"${x.q}" has the same answer as "${q.questionText}"`);
            const stem = norm(q.questionText.split('$blank$')[0]);
            assert.ok(stem.length < 12 || !norm(x.q).includes(stem), `"${x.q}" repeats "${q.questionText}"`);
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
