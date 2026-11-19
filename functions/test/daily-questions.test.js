// Shape check for the daily puzzle's own questions (functions/data/daily-questions.json).
// They are never loaded into the game's bank, and none may repeat a fact of a game question file.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const daily = require('../data/daily-questions.json');

// The first 35 ids of each language (001 to 035) run from 27 November to 31 December. The 13 written
// after them (036 to 048) are for the days before: 14 to 26 November, from the puzzle's first weekend.
// The 2027 ids (daily-27-..-001 to 059) are 1 January to 28 February, one a day, so neither month repeats a
// day whose answer is already on a past day's page.
const FIRST_DAY = '2026-11-14';
const DAYS_2026 = 48;
const DAYS_2027 = 59;
const DAYS = DAYS_2026 + DAYS_2027;
const FIRST_ID_DAY = '2026-11-27'; // the day of id 001
const FIRST_IDS = 35;
const HANUKKAH_FIRST = '2026-12-04'; // first candle; eight days to 11 December
const norm = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const dayFrom = (first, n) => new Date(Date.parse(first + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const dayAt = n => dayFrom(FIRST_DAY, n);
const dayOfId = no => no <= FIRST_IDS ? dayFrom(FIRST_ID_DAY, no - 1) : dayFrom(FIRST_DAY, no - FIRST_IDS - 1);
const dayOf = (year, no) => year === '26' ? dayOfId(no) : dayFrom('2027-01-01', no - 1);

test('every daily question is well formed', () => {
    const ids = Object.keys(daily);
    assert.strictEqual(ids.length, DAYS * 2);
    for (const id of ids) {
        const q = daily[id];
        const m = /^daily-(26|27)-(en|he)-(\d{3})$/.exec(id);
        assert.ok(m, id);
        assert.ok(Number(m[3]) >= 1 && Number(m[3]) <= (m[1] === '26' ? DAYS_2026 : DAYS_2027), id);
        assert.strictEqual(q.lang, m[2], id);
        assert.strictEqual(q.day, dayOf(m[1], Number(m[3])), id);
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

test('each language has one question for every day, 14 November to 28 February', () => {
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

test('a fact both languages share is on the same day in both (2027)', () => {
    // One language's past page must not give away the other language's question of a later day.
    const jan = Object.values(daily).filter(q => q.day >= '2027-01-01');
    const byCitation = {};
    for (const q of jan) (byCitation[q.citation] = byCitation[q.citation] || []).push(q);
    for (const [citation, qs] of Object.entries(byCitation)) {
        assert.ok(qs.length <= 2, citation);
        if (qs.length === 2) {
            assert.notStrictEqual(qs[0].lang, qs[1].lang, citation);
            assert.strictEqual(qs[0].day, qs[1].day, citation);
        }
    }
});

test('no 2027 question repeats a fact of an earlier daily question', () => {
    const before = Object.values(daily).filter(q => q.day < '2027-01-01');
    const seen = new Set(before.map(q => q.citation));
    const texts = new Set(before.map(q => norm(q.questionText)));
    for (const [id, q] of Object.entries(daily)) {
        if (q.day < '2027-01-01') continue;
        assert.ok(!seen.has(q.citation), id + ': same source as an earlier day');
        assert.ok(!texts.has(norm(q.questionText)), id);
    }
});
