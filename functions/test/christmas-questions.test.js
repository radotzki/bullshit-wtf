// The Christmas and New Year pack (functions/data/christmas-questions.json): English questions for
// office parties, Christmas and New Year's Eve, loaded into /questions by the release (DEPLOYING.md,
// "Christmas and New Year pack"). Checks the questions' shape, and that the pack is offered by
// default in English games only, from 1 December to 2 January, while Hebrew games keep Hanukkah.
const test = require('node:test');
const assert = require('node:assert');
const pack = require('../data/christmas-questions.json');
const hanukkah = require('../data/hanukkah-questions.json');
const facts = require('../data/strange-facts-2026-11.json');
const openers = require('../data/opening-questions.json');
const thanksgiving = require('../data/thanksgiving-questions.json');
const { isRetired } = require('../dist/controllers/retired-questions');
const { isSameAnswer, normalizeAnswer } = require('../dist/controllers/same-answer');
const { isBlockedHouseLie } = require('../dist/controllers/house-lie-cleanup');
const { questionPacks, isPack, packFits, packIcon, seasonalPack, packInSeasonFor } = require('../dist/game-model');

const ids = Object.keys(pack);
const lower = s => s.trim().toLowerCase();

test('every Christmas and New Year question is a playable English question of the pack', () => {
    for (const id of ids) {
        const q = pack[id];
        assert.match(id, /^christmas-26-en-\d\d$/, id);
        assert.deepStrictEqual(Object.keys(q).sort(), ['citation', 'fakeAnswers', 'lang', 'pack', 'questionText', 'realAnswer'], id);
        assert.strictEqual(q.pack, 'christmas', id);
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
            // A house lie that is the truth typed differently would put the truth on screen twice.
            assert.ok(!isSameAnswer(f, q.realAnswer), `${id}: ${f}`);
            assert.ok(!isBlockedHouseLie(f), `${id}: ${f}`);
        });
        assert.strictEqual(new Set(q.fakeAnswers.concat(q.realAnswer).map(normalizeAnswer)).size, 4, `${id}: four different answers`);
        // The source that states the truth.
        assert.match(q.citation, /^https:\/\/\S+$/, id);
        assert.ok(!isRetired(id), id);
    }
});

test('about 30 questions, ids without gaps, none twice, none a repeat of a question kept in the repository', () => {
    // A game takes 3 pack questions nobody in the room has seen: 30 are ten games without a repeat.
    assert.ok(ids.length >= 30 && ids.length <= 99, String(ids.length));
    ids.map(id => +id.split('-')[3]).sort((a, b) => a - b).forEach((n, i) => assert.strictEqual(n, i + 1));
    const texts = ids.map(id => normalizeAnswer(pack[id].questionText));
    assert.strictEqual(new Set(texts).size, texts.length);
    const others = [hanukkah, facts, openers, thanksgiving];
    const known = new Set(others.flatMap(set => Object.values(set)).map(q => normalizeAnswer(q.questionText)));
    const knownIds = new Set(others.flatMap(set => Object.keys(set)));
    for (const id of ids) {
        assert.ok(!knownIds.has(id), id);
        assert.ok(!known.has(normalizeAnswer(pack[id].questionText)), id);
    }
});

test('the pack is English only, with its own icon and labels', () => {
    const p = questionPacks.christmas;
    assert.ok(isPack('christmas'));
    assert.strictEqual(p.perGame, 3);
    assert.deepStrictEqual(p.locales, ['en']);
    assert.strictEqual(packIcon('christmas'), '🎄');
    assert.strictEqual(p.label.en, 'Christmas and New Year questions');
    // "ראש השנה" would read as Rosh Hashanah; the Hebrew label says the questions are in English.
    assert.strictEqual(p.label.he, 'שאלות חג המולד והשנה החדשה (באנגלית)');
    assert.strictEqual(packFits('christmas', 'en'), true);
    assert.strictEqual(packFits('christmas', 'he'), false);
    assert.strictEqual(packInSeasonFor('christmas', 'en'), true);
    assert.strictEqual(packInSeasonFor('christmas', 'he'), false);
    assert.strictEqual(packInSeasonFor('hanukkah', 'he'), true);
    assert.strictEqual(packInSeasonFor('hanukkah', 'en'), false);
    assert.strictEqual(packInSeasonFor('none', 'en'), false);
});

test('English games get it by default from 1 December to 2 January; Hebrew games keep Hanukkah', () => {
    const at = iso => Date.parse(iso);
    // The first evening of December, in London and in Israel.
    assert.strictEqual(seasonalPack(at('2026-12-01T19:00:00+00:00'), 'en'), 'christmas');
    assert.strictEqual(seasonalPack(at('2026-12-01T19:00:00+02:00'), 'he'), 'hanukkah');
    // An office party on Thursday 10 December, in New York: Christmas in English, Hanukkah in Hebrew.
    assert.strictEqual(seasonalPack(at('2026-12-10T19:00:00-05:00'), 'en'), 'christmas');
    assert.strictEqual(seasonalPack(at('2026-12-10T19:00:00-05:00'), 'he'), 'hanukkah');
    // After Hanukkah, a Hebrew game has no pack; an English one still has Christmas.
    assert.strictEqual(seasonalPack(at('2026-12-20T19:00:00+02:00'), 'he'), undefined);
    assert.strictEqual(seasonalPack(at('2026-12-24T20:00:00-06:00'), 'en'), 'christmas');
    // New Year's Eve until midnight on the West Coast, and in Sydney.
    assert.strictEqual(seasonalPack(at('2026-12-31T23:30:00-08:00'), 'en'), 'christmas');
    assert.strictEqual(seasonalPack(at('2026-12-31T23:30:00+11:00'), 'en'), 'christmas');
    // Not before: the Thanksgiving weekend's last night. Not after: 3 January in Israel.
    assert.strictEqual(seasonalPack(at('2026-11-30T21:00:00+02:00'), 'en'), 'thanksgiving');
    assert.strictEqual(seasonalPack(at('2027-01-03T00:30:00+02:00'), 'en'), undefined);
});
