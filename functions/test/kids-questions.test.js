// The kid-friendly questions (functions/data/kids-questions.json): 20 English and 20 Hebrew
// strange-but-true facts that a child of 8 to 12 can follow, for the "Kids are playing" switch on
// the create page. Every question carries `pack: "kids"`, so it never turns up in a normal game.
// The switch, the pack in game-model.ts and the release's load (load-pack-questions.js, FILES) are
// checked in kids-switch.test.js; this file checks only the questions.
// Each question's source is its `citation`; docs/kids-questions-sources.md quotes what it says.
const test = require('node:test');
const assert = require('node:assert');
const pack = require('../data/kids-questions.json');
const hanukkah = require('../data/hanukkah-questions.json');
const facts = require('../data/strange-facts-2026-11.json');
const openers = require('../data/opening-questions.json');
const thanksgiving = require('../data/thanksgiving-questions.json');
const christmas = require('../data/christmas-questions.json');
const daily = require('../data/daily-questions.json');
const { isRetired } = require('../dist/controllers/retired-questions');
const { isSameAnswer, normalizeAnswer } = require('../dist/controllers/same-answer');
const { isBlockedHouseLie } = require('../dist/controllers/house-lie-cleanup');

const ids = Object.keys(pack);
const lower = s => s.trim().toLowerCase();

test('every kids question is a playable question of the pack, in its id\'s language', () => {
    for (const id of ids) {
        const q = pack[id];
        assert.match(id, /^kids-26-(en|he)-\d\d$/, id);
        assert.deepStrictEqual(Object.keys(q).sort(), ['citation', 'fakeAnswers', 'lang', 'pack', 'questionText', 'realAnswer'], id);
        assert.strictEqual(q.pack, 'kids', id);
        assert.strictEqual(q.lang, id.split('-')[2], id);
        assert.strictEqual(q.questionText.split('$blank$').length, 2, `${id}: one blank`);
        assert.strictEqual(q.questionText, q.questionText.trim(), id);
        if (q.lang === 'en') assert.doesNotMatch(q.questionText + q.realAnswer + q.fakeAnswers.join(''), /[א-ת]/, id);
        else assert.match(q.questionText, /[א-ת]/, id);
        assert.strictEqual(q.realAnswer, lower(q.realAnswer), `${id}: answers are shown lower-case`);
        // A player types at most 40 characters; a truth longer than any lie would give itself away.
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
        // The source that states the truth, one a reviewer can open.
        assert.match(q.citation, /^https:\/\/\S+$/, id);
        assert.ok(!q.opener, `${id}: a pack question is no opener`);
        assert.ok(!isRetired(id), id);
    }
});

test('20 in each language, ids without gaps, none twice, none a repeat of a question kept in the repository', () => {
    for (const lang of ['en', 'he']) {
        const nums = ids.filter(id => pack[id].lang === lang).map(id => +id.split('-')[3]).sort((a, b) => a - b);
        assert.strictEqual(nums.length, 20, lang);
        nums.forEach((n, i) => assert.strictEqual(n, i + 1, `${lang}-${n}`));
    }
    const texts = ids.map(id => normalizeAnswer(pack[id].questionText));
    assert.strictEqual(new Set(texts).size, texts.length);
    const others = [hanukkah, facts, openers, thanksgiving, christmas, daily];
    const known = new Set(others.flatMap(set => Object.values(set)).filter(q => q && q.questionText).map(q => normalizeAnswer(q.questionText)));
    const knownIds = new Set(others.flatMap(set => Object.keys(set)));
    for (const id of ids) {
        assert.ok(!knownIds.has(id), id);
        assert.ok(!known.has(normalizeAnswer(pack[id].questionText)), id);
    }
});
