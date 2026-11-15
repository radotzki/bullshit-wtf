// Shape check for the daily puzzle's own questions (functions/data/daily-questions.json).
// They are never loaded into the game's bank, and none may repeat a fact of a game question file.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const daily = require('../data/daily-questions.json');

// The first 35 ids of each language (001 to 035) run from 27 November to 31 December. The 13 written
// after them (036 to 048) are for the days before: 14 to 26 November, from the puzzle's first weekend.
const FIRST_DAY = '2026-11-14';
const DAYS = 48;
const FIRST_ID_DAY = '2026-11-27'; // the day of id 001
const FIRST_IDS = 35;
const HANUKKAH_FIRST = '2026-12-04'; // first candle; eight days to 11 December
const norm = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const dayFrom = (first, n) => new Date(Date.parse(first + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const dayAt = n => dayFrom(FIRST_DAY, n);
const dayOfId = no => no <= FIRST_IDS ? dayFrom(FIRST_ID_DAY, no - 1) : dayFrom(FIRST_DAY, no - FIRST_IDS - 1);

test('every daily question is well formed', () => {
    const ids = Object.keys(daily);
    assert.strictEqual(ids.length, DAYS * 2);
    for (const id of ids) {
        const q = daily[id];
        const m = /^daily-26-(en|he)-(\d{3})$/.exec(id);
        assert.ok(m, id);
        assert.strictEqual(q.lang, m[1], id);
        assert.strictEqual(q.day, dayOfId(Number(m[2])), id);
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

test('each language has one question for every day, 14 November to 31 December', () => {
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
