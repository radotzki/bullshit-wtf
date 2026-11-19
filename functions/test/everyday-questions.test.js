// Shape check for the everyday questions (functions/data/everyday-questions-2026-11.json): 50 English
// and 50 Hebrew questions for the normal bank, loaded into /questions by the release (DEPLOYING.md,
// "Everyday questions: 100 more").
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const set = require('../data/everyday-questions-2026-11.json');
const { isRetired } = require('../dist/controllers/retired-questions');
const { isSameAnswer, normalizeAnswer } = require('../dist/controllers/same-answer');
const { isBlockedHouseLie } = require('../dist/controllers/house-lie-cleanup');

const ids = Object.keys(set);
const lower = s => s.trim().toLowerCase();

test('every everyday question is a playable question of the normal bank', () => {
    for (const id of ids) {
        const q = set[id];
        assert.match(id, /^everyday-26-(en|he)-\d\d$/, id);
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

test('50 in each language, ids without gaps, no question twice', () => {
    for (const lang of ['en', 'he']) {
        const nums = ids.filter(id => set[id].lang === lang).map(id => +id.split('-')[3]).sort((a, b) => a - b);
        assert.strictEqual(nums.length, 50, lang);
        nums.forEach((n, i) => assert.strictEqual(n, i + 1, `${lang}-${n}`));
    }
    const texts = ids.map(id => normalizeAnswer(set[id].questionText));
    assert.strictEqual(new Set(texts).size, texts.length);
});

test('no everyday question repeats a question or a truth already kept in the repository', () => {
    // Every other question file in functions/data: the openers, the Hebrew fixes, the strange facts,
    // the packs and the daily puzzle. Same text, or the same truth in the same language.
    const dir = path.join(__dirname, '..', 'data');
    const known = [];
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'everyday-questions-2026-11.json')) {
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        for (const [id, q] of Object.entries(data)) {
            if (q && typeof q.questionText === 'string') {
                known.push({ id, text: normalizeAnswer(q.questionText), truth: normalizeAnswer(String(q.realAnswer || '')), lang: q.lang });
            }
        }
    }
    assert.ok(known.length > 400, 'the other question files were read');
    // Different facts that happen to share a short truth, read and kept on purpose.
    const sameTruthOk = { 'everyday-26-en-01': ['fact-26-en-40'] }; // the first barcode scan / Singapore's gum ban
    for (const id of ids) {
        const q = set[id];
        const text = normalizeAnswer(q.questionText);
        const truth = normalizeAnswer(q.realAnswer);
        for (const k of known) {
            assert.notStrictEqual(k.id, id, id);
            assert.notStrictEqual(k.text, text, `${id} repeats ${k.id}`);
            // A short truth like a number may come up twice; a longer one in the same language is a repeat.
            if (truth.length > 6 && k.lang === q.lang && !(sameTruthOk[id] || []).includes(k.id)) {
                assert.notStrictEqual(k.truth, truth, `${id} has the truth of ${k.id}`);
            }
        }
    }
});
