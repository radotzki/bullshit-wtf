// Shape check for the strange-facts set (functions/data/strange-facts-2026-11.json): 60 English and
// 60 Hebrew questions for the normal bank, loaded into /questions by the release (DEPLOYING.md, "Strange
// facts: 120 more questions").
const test = require('node:test');
const assert = require('node:assert');
const set = require('../data/strange-facts-2026-11.json');
const openers = require('../data/opening-questions.json');
const hebrewFixes = require('../data/hebrew-question-fixes-2026-11.json');
const { isRetired } = require('../dist/controllers/retired-questions');
const { isSameAnswer, normalizeAnswer } = require('../dist/controllers/same-answer');
const { isBlockedHouseLie } = require('../dist/controllers/house-lie-cleanup');

const ids = Object.keys(set);
const lower = s => s.trim().toLowerCase();

test('every strange fact is a playable question of the normal bank', () => {
    for (const id of ids) {
        const q = set[id];
        assert.match(id, /^fact-26-(en|he)-\d\d$/, id);
        assert.deepStrictEqual(Object.keys(q).sort(), ['citation', 'fakeAnswers', 'lang', 'questionText', 'realAnswer'], id);
        // No pack and no opener flag: these go into the normal pick, for any question slot.
        assert.strictEqual(q.lang, id.split('-')[2], id);
        assert.strictEqual(q.questionText.split('$blank$').length, 2, `${id}: one blank`);
        assert.strictEqual(q.questionText, q.questionText.trim(), id);
        assert.strictEqual(q.realAnswer, lower(q.realAnswer), `${id}: answers are shown lower-case`);
        // A player types at most 40 characters.
        assert.ok(q.realAnswer.length <= 40, id);
        assert.strictEqual(q.fakeAnswers.length, 3, id);
        q.fakeAnswers.forEach(f => {
            assert.strictEqual(f, lower(f), `${id}: ${f}`);
            assert.ok(f.length <= 40, `${id}: ${f}`);
            // A house lie that is the truth typed differently would put the truth on screen twice.
            assert.ok(!isSameAnswer(f, q.realAnswer), `${id}: ${f}`);
            assert.ok(!isBlockedHouseLie(f), `${id}: ${f}`);
        });
        assert.strictEqual(new Set(q.fakeAnswers.concat(q.realAnswer).map(normalizeAnswer)).size, 4, `${id}: four different answers`);
        assert.match(q.citation, /^https:\/\/\S+$/, id);
        assert.ok(!isRetired(id), id);
    }
});

test('60 in each language, ids without gaps, no question twice', () => {
    for (const lang of ['en', 'he']) {
        const nums = ids.filter(id => set[id].lang === lang).map(id => +id.split('-')[3]).sort((a, b) => a - b);
        assert.strictEqual(nums.length, 60, lang);
        nums.forEach((n, i) => assert.strictEqual(n, i + 1, `${lang}-${n}`));
    }
    const texts = ids.map(id => normalizeAnswer(set[id].questionText));
    assert.strictEqual(new Set(texts).size, texts.length);
});

test('no strange fact repeats a question already kept in the repository', () => {
    const known = new Set(Object.values(openers).concat(Object.values(hebrewFixes))
        .map(q => normalizeAnswer(q.questionText)));
    const knownIds = new Set(Object.keys(openers).concat(Object.keys(hebrewFixes)));
    for (const id of ids) {
        assert.ok(!knownIds.has(id), id);
        assert.ok(!known.has(normalizeAnswer(set[id].questionText)), id);
    }
});
