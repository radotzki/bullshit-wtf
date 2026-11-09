// Shape check for the Hebrew question fixes loaded into /questions (2026-11).
const test = require('node:test');
const assert = require('node:assert');
const fixes = require('../data/hebrew-question-fixes-2026-11.json');
const { isRetired } = require('../dist/controllers/retired-questions');

test('every Hebrew fix is a playable question', () => {
    const ids = Object.keys(fixes);
    assert.strictEqual(ids.length, 24); // 19 rewrites + 5 new
    for (const id of ids) {
        const q = fixes[id];
        assert.strictEqual(q.lang, 'he', id);
        assert.ok(q.questionText.includes('$blank$'), id);
        assert.strictEqual(q.realAnswer, q.realAnswer.trim(), id);
        assert.ok(q.fakeAnswers.length >= 3, id);
        assert.ok(!q.fakeAnswers.includes(q.realAnswer), id);
        assert.ok(!isRetired(id), id);
    }
});

test('the five retired Hebrew questions are retired', () => {
    ['3ffff3b9-3d1c-46ff-b8fb-e1543528cdfa', 'cadcd592-202a-49f1-a81b-c4c1373c1069',
        'cc7dbbb3-e7b4-4244-8d86-5149949f1dca', '908603d2-6492-441b-98a7-0de5c728c6fb',
        'a3a8fc0a-94f0-406a-8794-30cbd00e3677'].forEach(id => assert.ok(isRetired(id), id));
});
