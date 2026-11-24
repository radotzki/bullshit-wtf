// English games are played mostly in the US (Thanksgiving, Christmas, the party pages). A house lie in
// British or Israeli English gives itself away there: next to "chalk", a "colour" is the one answer
// nobody at the table wrote, and "my gps took me to eilat" is the computer's. Found on the Thanksgiving
// night walk-through: English house lies and About prompts use American words and spelling.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { aboutPrompts } = require('../dist/controllers/about-prompts');

// Each English question file there is (the party pack comes with its own pull request).
const FILES = ['everyday-questions-2026-11.json', 'strange-facts-2026-11.json', 'kids-questions.json',
    'thanksgiving-questions.json', 'christmas-questions.json', 'party-questions.json', 'opening-questions.json',
    'hanukkah-questions.json'].filter(file => fs.existsSync(path.join(__dirname, '..', 'data', file)));
// Words an American reads as foreign. Whole words only.
const BRITISH = /\b(colour\w*|favourite\w*|flavour\w*|neighbour\w*|mum|mums|grey|metre\w*|litres?|lift|torch|pyjamas|car park|tea towels?|ice cream van|yodelling|eilat|tel aviv|shekels?)\b/;

test('English house lies use American words', () => {
    for (const file of FILES) {
        const questions = require(path.join('..', 'data', file));
        for (const [id, q] of Object.entries(questions)) {
            if (q.lang !== 'en') continue;
            q.fakeAnswers.forEach(lie => assert.doesNotMatch(lie, BRITISH, `${file} ${id}: "${lie}"`));
        }
    }
});

test('English About prompts and their house lies use American words', () => {
    for (const p of aboutPrompts) {
        assert.doesNotMatch(p.en.text, BRITISH, `${p.id}: "${p.en.text}"`);
        p.en.house.forEach(lie => assert.doesNotMatch(lie, BRITISH, `${p.id}: "${lie}"`));
    }
});

test('Alice\'s Restaurant: the truth is the song\'s own word, so a fan who types it is not scored as a liar', () => {
    const q = require('../data/thanksgiving-questions.json')['thanksgiving-26-en-25'];
    assert.strictEqual(q.realAnswer, 'littering');
});
