// The English Hanukkah trivia page (seo/pages-en-hanukkah-trivia.js): its search words, its Start button
// and tag, links to the Hanukkah page and how to play, 12 questions each with an answer, and none that a
// Hanukkah game would then ask (the page must not spoil the game's own pack). Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const pages = require('../seo/pages');
const trivia = require('../seo/pages-en-hanukkah-trivia');

const root = path.join(__dirname, '..', '..');
const page = pages.find(p => p.path === '/hanukkah-trivia');
const pack = Object.values(JSON.parse(fs.readFileSync(path.join(root, 'functions', 'data', 'hanukkah-questions.json'), 'utf8')));
const joinSource = fs.readFileSync(path.join(root, 'game', 'src', 'app', 'services', 'join-source.ts'), 'utf8');
const known = JSON.parse(/const known = (\[[^\]]+\])/.exec(joinSource)[1].replace(/'/g, '"'));

test('the page is in the list once, in English', () => {
    assert.ok(page, 'the page is listed');
    assert.strictEqual(pages.filter(p => p.path === page.path).length, 1);
    assert.strictEqual(page.site.lang, 'en');
});

test('title, description and heading carry the search words', () => {
    assert.ok(page.title.startsWith('Hanukkah trivia questions and answers'), page.title);
    assert.ok(page.title.length <= 60, `${page.title.length} characters`);
    assert.match(page.description, /^Hanukkah trivia questions and answers for adults and families/);
    assert.ok(page.description.length <= 160, `${page.description.length} characters`);
    assert.match(page.h1, /^Hanukkah trivia/);
    assert.match(page.h1, /questions and answers/);
});

test('the Start button opens an English Hanukkah game, tagged hanukkah-trivia', () => {
    assert.strictEqual(page.start.href, '/create-game?lang=en&pack=hanukkah');
    assert.strictEqual(page.tag, 'hanukkah-trivia');
    assert.match(page.tag, /^[a-z0-9][a-z0-9-]{0,39}$/);
    assert.ok(known.indexOf(page.tag) < 0, 'not one of the game\'s own join sources');
    assert.strictEqual(pages.filter(p => p.tag === page.tag).length, 1, 'no other page uses the tag');
    assert.ok(page.body.indexOf('<!--start-->') > 0 && page.body.indexOf('<!--start-->') < page.body.indexOf('<ol class="quiz">'),
        'a Start button sits above the questions');
});

test('12 questions, each read aloud with its answer behind "Answer"', () => {
    assert.strictEqual(trivia.questions.length, 12);
    assert.strictEqual((page.body.match(/<details><summary>Answer<\/summary>/g) || []).length, 12);
    trivia.questions.forEach(x => {
        assert.ok(x.q && x.a && x.answer, x.q);
        assert.ok(page.body.includes(x.q), x.q);
        assert.strictEqual(words(x.a)[0], words(x.answer)[0], `the answer text opens with "${x.answer}"`);
    });
});

// A text as a plain list of lowercase words: punctuation and possessive 's out.
const words = s => s.toLowerCase().replace(/[’']s\b/g, '').replace(/[^a-z0-9$ -]+/g, ' ').replace(/-/g, ' ')
    .split(/\s+/).filter(Boolean);
// A pack answer is spoiled when a trivia question or answer holds its words in a row (a plural "s" counts too).
// One-word answers of 3 letters or fewer ("44", "pe") are left out.
const holds = (text, answer) => {
    const a = words(answer);
    const t = words(text);
    if (a.length === 1 && a[0].length <= 3) {
        return false;
    }
    const same = (w, x) => w === x || w === x + 's';
    for (let i = 0; i + a.length <= t.length; i++) {
        if (a.every((w, k) => same(t[i + k], w))) {
            return true;
        }
    }
    return false;
};
// Pack answers that are everyday words, which a Hanukkah page can't avoid ("eight"): each is allowed only
// while the trivia item names nothing of the pack question it answers (the word after the arrow).
//  - "eight": the pack asks how many candles Shammai's school lit on the first night.
//  - "nothing": the pack asks what the dreidel's nun stood for.
//  - "lights": the pack asks what Josephus called Hanukkah.
//  - "here": the pack asks what the Israeli dreidel's pe stands for.
const everyday = { eight: 'shammai', nothing: 'nun', lights: 'josephus', here: 'pe' };
// Names in a pack question (a capital word inside a sentence) say what it is about. A trivia item that
// writes one, capital and all, is about the same thing, so it must be allowed here by hand, with the reason.
const common = new Set(['Hanukkah', 'Jewish', 'Jews', 'Hebrew', 'Israel', 'Israeli', 'Temple', 'Jerusalem', 'Bible',
    'Americans', 'American', 'Europe', 'European', 'English', 'Greek', 'Christian', 'Christmas', 'Yiddish', 'Shabbat',
    'Torah', 'Hanukkah\'s', 'Chanukah']);
const allowedNames = {
    // Antiochus is the king of every Hanukkah story; quiz 6 asks which laws he banned, and no pack question asks that.
    Antiochus: [6],
};

test('no question or answer gives away an English question of the game\'s Hanukkah pack', () => {
    const en = pack.filter(q => q.lang === 'en');
    assert.ok(en.length > 50, 'the pack was read');
    trivia.questions.forEach((x, i) => {
        const text = x.q + ' ' + x.a;
        const plain = ' ' + words(text).join(' ') + ' ';
        const has = w => plain.includes(' ' + w + ' ');
        const named = new Set(text.match(/[A-Z][a-z']+/g) || []);
        en.forEach(q => {
            const real = words(q.realAnswer).join(' ');
            assert.notStrictEqual(words(x.answer).join(' '), real, `trivia ${i + 1} has the same answer as "${q.questionText}"`);
            const key = everyday[real];
            if (key) {
                assert.ok(!has(key), `trivia ${i + 1} names "${key}", from "${q.questionText}"`);
            } else {
                assert.ok(!holds(text, q.realAnswer), `trivia ${i + 1} names "${q.realAnswer}", the answer to "${q.questionText}"`);
            }
            // Four words in a row of the pack's question, read with its answer, give its fact away.
            const w = words(q.questionText.replace('$blank$', ' ' + q.realAnswer + ' '));
            for (let k = 0; k + 4 <= w.length; k++) {
                const run = w.slice(k, k + 4).join(' ');
                assert.ok(!plain.includes(' ' + run + ' '), `trivia ${i + 1} repeats "${run}" from "${q.questionText}"`);
            }
            // A name the pack question is about.
            const names = (q.questionText.match(/(?<=\S\s)[A-Z][a-z']+/g) || []).filter(n => !common.has(n));
            names.forEach(n => {
                if (!(allowedNames[n] || []).includes(i + 1)) {
                    assert.ok(!named.has(n), `trivia ${i + 1} names "${n}", from "${q.questionText}"`);
                }
            });
        });
    });
});

test('the checks above catch a near-match', () => {
    // A spoiler the checks must find: the pack's helper-candle question, asked another way.
    const spoiler = 'What is the helper candle called? The shamash, from the word for servant.';
    const q = pack.find(x => x.lang === 'en' && x.realAnswer === 'servant');
    assert.ok(q, 'the pack still has the helper-candle question');
    assert.ok(holds(spoiler, q.realAnswer));
    assert.ok(holds('Two war elephants', 'war elephant'), 'a plural counts');
    assert.ok(!holds('the elephant of war', 'war elephant'));
});

test('it links the Hanukkah page and how to play, and says the game\'s true limits', () => {
    assert.ok(page.body.includes('href="/hanukkah-party-game"'));
    assert.ok(page.body.includes('href="/how-to-play"'));
    const maxPlayers = +/export const MAX_PLAYERS = (\d+);/.exec(fs.readFileSync(path.join(root, 'game-model.ts'), 'utf8'))[1];
    assert.ok(page.body.includes(`Up to ${maxPlayers} players`));
    assert.match(page.body, /5, 7 or 9 questions/);
});

test('its share picture is in the assets', () => {
    assert.ok(fs.existsSync(path.join(root, 'game', 'src', page.image)), page.image);
});
