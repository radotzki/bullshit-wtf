// Shape check for the daily puzzle's own questions (functions/data/daily-questions.json).
// They are never loaded into the game's bank, and none may repeat a fact of a game question file.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const daily = require('../data/daily-questions.json');

const FIRST_DAY = '2026-11-27';
const DAYS = 35;
const HANUKKAH_FIRST = '2026-12-04'; // first candle; eight days to 11 December
const norm = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const dayAt = n => new Date(Date.parse(FIRST_DAY + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);

test('every daily question is well formed', () => {
    const ids = Object.keys(daily);
    assert.strictEqual(ids.length, DAYS * 2);
    for (const id of ids) {
        const q = daily[id];
        const m = /^daily-26-(en|he)-(\d{3})$/.exec(id);
        assert.ok(m, id);
        assert.strictEqual(q.lang, m[1], id);
        assert.strictEqual(q.day, dayAt(Number(m[2]) - 1), id);
        assert.strictEqual(q.questionText.split('$blank$').length, 2, id);
        assert.ok(q.realAnswer && q.realAnswer === q.realAnswer.trim(), id);
        assert.ok(Array.isArray(q.fakeAnswers) && q.fakeAnswers.length >= 3 && q.fakeAnswers.length <= 5, id);
        const answers = [q.realAnswer, ...q.fakeAnswers].map(norm);
        assert.strictEqual(new Set(answers).size, answers.length, id + ': answers repeat');
        assert.ok(answers.every(a => a && a.length <= 40), id);
        assert.ok(/^https:\/\/\S+$/.test(q.citation), id);
        const candle = (Date.parse(q.day) - Date.parse(HANUKKAH_FIRST)) / 864e5 + 1;
        if (candle >= 1 && candle <= 8) {
            assert.strictEqual(q.pack, 'hanukkah', id);
            assert.strictEqual(q.candle, candle, id);
            assert.deepStrictEqual(Object.keys(q).sort(),
                ['candle', 'citation', 'day', 'fakeAnswers', 'lang', 'pack', 'questionText', 'realAnswer'], id);
        } else {
            assert.deepStrictEqual(Object.keys(q).sort(),
                ['citation', 'day', 'fakeAnswers', 'lang', 'questionText', 'realAnswer'], id);
        }
    }
});

test('each language has one question for every day, 27 November to 31 December', () => {
    for (const lang of ['en', 'he']) {
        const days = Object.values(daily).filter(q => q.lang === lang).map(q => q.day).sort();
        assert.deepStrictEqual(days, Array.from({ length: DAYS }, (_, n) => dayAt(n)), lang);
        const texts = Object.values(daily).filter(q => q.lang === lang).map(q => norm(q.questionText));
        assert.strictEqual(new Set(texts).size, DAYS, lang);
    }
});

test('no daily question repeats a question of the game', () => {
    const dir = path.join(__dirname, '..', 'data');
    const seen = new Set();
    for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.json') || file === 'daily-questions.json') continue;
        for (const q of Object.values(JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')))) {
            if (q && q.questionText) seen.add(norm(q.questionText));
        }
    }
    for (const [id, q] of Object.entries(daily)) assert.ok(!seen.has(norm(q.questionText)), id);
});
