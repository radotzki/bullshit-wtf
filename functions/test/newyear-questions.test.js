// The New Year's Eve pack (functions/data/newyear-questions.json): English questions for a grown-up
// New Year's Eve party, loaded into /questions by the release (.github/scripts/load-pack-questions.js).
// Checks the questions' shape, that none repeats a question of another file, and that the pack is
// offered by default in English games only, from 30 December to 2 January (by the date in Israel),
// after the Christmas pack's days. From the English New Year's Eve walk: on 31 December the New
// Year's Eve page opened a Christmas game, whose first question was NORAD's Santa tracker.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const pack = require('../data/newyear-questions.json');
const { isRetired } = require('../dist/controllers/retired-questions');
const { isSameAnswer, normalizeAnswer } = require('../dist/controllers/same-answer');
const { isBlockedHouseLie } = require('../dist/controllers/house-lie-cleanup');
const { questionPacks, isPack, packFits, packIcon, seasonalPack, packInSeasonFor } = require('../dist/game-model');

const ids = Object.keys(pack);
const lower = s => s.trim().toLowerCase();
const data = path.join(__dirname, '..', 'data');

test('every New Year\'s Eve question is a playable English question of the pack', () => {
    for (const id of ids) {
        const q = pack[id];
        assert.match(id, /^newyear-26-en-\d\d$/, id);
        assert.deepStrictEqual(Object.keys(q).sort(), ['citation', 'fakeAnswers', 'lang', 'pack', 'questionText', 'realAnswer'], id);
        assert.strictEqual(q.pack, 'newyear', id);
        assert.strictEqual(q.lang, 'en', id);
        assert.strictEqual(q.questionText.split('$blank$').length, 2, `${id}: one blank`);
        assert.strictEqual(q.questionText, q.questionText.trim(), id);
        assert.doesNotMatch(q.questionText, /[א-ת]/, id);
        assert.strictEqual(q.realAnswer, lower(q.realAnswer), `${id}: answers are shown lower-case`);
        // A player types at most 40 characters; a truth longer than any lie would give itself away.
        assert.ok(q.realAnswer.length <= 40, id);
        assert.strictEqual(q.fakeAnswers.length, 3, id);
        q.fakeAnswers.forEach(f => {
            assert.strictEqual(f, lower(f), `${id}: ${f}`);
            assert.ok(f.length <= 40, `${id}: ${f}`);
            assert.ok(!isSameAnswer(f, q.realAnswer), `${id}: ${f}`);
            assert.ok(!isBlockedHouseLie(f), `${id}: ${f}`);
        });
        assert.strictEqual(new Set(q.fakeAnswers.concat(q.realAnswer).map(normalizeAnswer)).size, 4, `${id}: four different answers`);
        // The source that states the truth.
        assert.match(q.citation, /^https:\/\/\S+$/, id);
        assert.ok(!isRetired(id), id);
    }
});

test('20 to 30 questions, ids without gaps, none twice, none a repeat of another question file', () => {
    // A game takes 3 pack questions nobody in the room has seen: 28 are nine games on the night.
    assert.ok(ids.length >= 20 && ids.length <= 30, String(ids.length));
    ids.map(id => +id.split('-')[3]).sort((a, b) => a - b).forEach((n, i) => assert.strictEqual(n, i + 1));
    const texts = ids.map(id => normalizeAnswer(pack[id].questionText));
    assert.strictEqual(new Set(texts).size, texts.length);
    // Every other question file of the repository, including the Christmas pack's New Year questions.
    const others = fs.readdirSync(data).filter(f => f.endsWith('.json') && f !== 'newyear-questions.json')
        .map(f => JSON.parse(fs.readFileSync(path.join(data, f), 'utf8')));
    const values = others.flatMap(set => Array.isArray(set) ? set : Object.values(set)).filter(q => q && typeof q.questionText === 'string');
    const known = new Set(values.map(q => normalizeAnswer(q.questionText)));
    const knownIds = new Set(others.flatMap(set => Array.isArray(set) ? [] : Object.keys(set)));
    for (const id of ids) {
        assert.ok(!knownIds.has(id), id);
        assert.ok(!known.has(normalizeAnswer(pack[id].questionText)), id);
    }
});

test('the pack is English only, with its own icon and labels', () => {
    const p = questionPacks.newyear;
    assert.ok(isPack('newyear'));
    assert.strictEqual(p.perGame, 3);
    assert.deepStrictEqual(p.locales, ['en']);
    assert.strictEqual(packIcon('newyear'), '🎆');
    assert.strictEqual(p.label.en, 'New Year\'s Eve questions');
    // Israelis call the night "סילבסטר"; the label says the questions are in English.
    assert.strictEqual(p.label.he, 'שאלות סילבסטר (באנגלית)');
    assert.strictEqual(packFits('newyear', 'en'), true);
    assert.strictEqual(packFits('newyear', 'he'), false);
    assert.strictEqual(packInSeasonFor('newyear', 'en'), true);
    assert.strictEqual(packInSeasonFor('newyear', 'he'), false);
});

test('English games get it by default from 30 December to 2 January, after the Christmas pack', () => {
    const at = iso => Date.parse(iso);
    // 29 December in New York is still Christmas; the evening of 30 December is the New Year's.
    assert.strictEqual(seasonalPack(at('2026-12-29T12:00:00-05:00'), 'en'), 'christmas');
    assert.strictEqual(seasonalPack(at('2026-12-30T20:00:00-05:00'), 'en'), 'newyear');
    // New Year's Eve in London, New York, Los Angeles until midnight, and Sydney.
    assert.strictEqual(seasonalPack(at('2026-12-31T22:00:00+00:00'), 'en'), 'newyear');
    assert.strictEqual(seasonalPack(at('2026-12-31T22:30:00-05:00'), 'en'), 'newyear');
    assert.strictEqual(seasonalPack(at('2026-12-31T23:30:00-08:00'), 'en'), 'newyear');
    assert.strictEqual(seasonalPack(at('2026-12-31T23:30:00+11:00'), 'en'), 'newyear');
    // A Hebrew game on New Year's Eve has no pack; not after 2 January in Israel.
    assert.strictEqual(seasonalPack(at('2026-12-31T22:00:00+02:00'), 'he'), undefined);
    assert.strictEqual(seasonalPack(at('2027-01-03T00:30:00+02:00'), 'en'), undefined);
    // One pack a day: no two seasons that English games get by default overlap.
    const english = Object.keys(questionPacks).filter(id => packInSeasonFor(id, 'en'));
    for (const a of english) {
        for (const b of english) {
            if (a === b) continue;
            const s = questionPacks[a].season, t = questionPacks[b].season;
            assert.ok(s.to < t.from || t.to < s.from, `${a} and ${b} overlap`);
        }
    }
});
