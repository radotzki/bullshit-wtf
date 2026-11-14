// The Thanksgiving pack (functions/data/thanksgiving-questions.json): English questions for the days
// around US Thanksgiving, Thursday 26 November 2026, loaded into /questions by the release
// (DEPLOYING.md, "Thanksgiving pack"). Checks the questions' shape, and that the pack is offered in
// English games only, in its season.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const pack = require('../data/thanksgiving-questions.json');
const hanukkah = require('../data/hanukkah-questions.json');
const facts = require('../data/strange-facts-2026-11.json');
const openers = require('../data/opening-questions.json');
const { isRetired } = require('../dist/controllers/retired-questions');
const { isSameAnswer, normalizeAnswer } = require('../dist/controllers/same-answer');
const { isBlockedHouseLie } = require('../dist/controllers/house-lie-cleanup');
const { questionPacks, isPack, packFits, packIcon, seasonalPack } = require('../dist/game-model');

const ids = Object.keys(pack);
const lower = s => s.trim().toLowerCase();

test('every Thanksgiving question is a playable English question of the pack', () => {
    for (const id of ids) {
        const q = pack[id];
        assert.match(id, /^thanksgiving-26-en-\d\d$/, id);
        assert.deepStrictEqual(Object.keys(q).sort(), ['citation', 'fakeAnswers', 'lang', 'pack', 'questionText', 'realAnswer'], id);
        assert.strictEqual(q.pack, 'thanksgiving', id);
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
    const known = new Set([hanukkah, facts, openers].flatMap(set => Object.values(set)).map(q => normalizeAnswer(q.questionText)));
    const knownIds = new Set([hanukkah, facts, openers].flatMap(set => Object.keys(set)));
    for (const id of ids) {
        assert.ok(!knownIds.has(id), id);
        assert.ok(!known.has(normalizeAnswer(pack[id].questionText)), id);
    }
});

test('the pack is offered in English games only, from the Friday before Thanksgiving to the Sunday after', () => {
    const p = questionPacks.thanksgiving;
    assert.ok(isPack('thanksgiving'));
    assert.strictEqual(p.perGame, 3);
    assert.deepStrictEqual(p.locales, ['en']);
    assert.strictEqual(packIcon('thanksgiving'), '🦃');
    assert.strictEqual(packFits('thanksgiving', 'en'), true);
    assert.strictEqual(packFits('thanksgiving', 'he'), false);
    assert.strictEqual(packFits('none', 'en'), false);
    assert.strictEqual(packFits(undefined, 'en'), false);

    const at = iso => Date.parse(iso);
    // Thanksgiving dinner: Thursday 26 November, 6 pm in New York and in Los Angeles.
    assert.strictEqual(seasonalPack(at('2026-11-26T18:00:00-05:00'), 'en'), 'thanksgiving');
    assert.strictEqual(seasonalPack(at('2026-11-26T18:00:00-08:00'), 'en'), 'thanksgiving');
    // The weekend before (Friendsgiving) and the Sunday night after, on the West Coast.
    assert.strictEqual(seasonalPack(at('2026-11-20T19:00:00-05:00'), 'en'), 'thanksgiving');
    assert.strictEqual(seasonalPack(at('2026-11-29T23:00:00-08:00'), 'en'), 'thanksgiving');
    // Not before, not after.
    assert.strictEqual(seasonalPack(at('2026-11-19T12:00:00-05:00'), 'en'), undefined);
    assert.strictEqual(seasonalPack(at('2026-12-01T00:30:00+02:00'), 'en'), 'hanukkah');
    // A Hebrew game never gets it, on the create page or in a crew rematch.
    assert.strictEqual(seasonalPack(at('2026-11-26T18:00:00-05:00'), 'he'), undefined);
});

test('the Hanukkah pack is unchanged: both languages, its own season, its own icon', () => {
    assert.strictEqual(packFits('hanukkah', 'en'), true);
    assert.strictEqual(packFits('hanukkah', 'he'), true);
    assert.strictEqual(packIcon('hanukkah'), '🕎');
    const dec5 = Date.parse('2026-12-05T12:00:00+02:00');
    assert.strictEqual(seasonalPack(dec5), 'hanukkah');
    assert.strictEqual(seasonalPack(dec5, 'he'), 'hanukkah');
    assert.strictEqual(seasonalPack(dec5, 'en'), 'hanukkah');
    // No two seasons overlap: one day, one pack.
    const seasons = Object.values(questionPacks).map(p => p.season).sort((a, b) => a.from < b.from ? -1 : 1);
    seasons.forEach((s, i) => {
        assert.ok(s.from <= s.to);
        assert.ok(i === 0 || seasons[i - 1].to < s.from);
    });
});

test('a new game and a crew rematch take a pack only in a language it has questions in', () => {
    const src = f => fs.readFileSync(path.join(__dirname, '..', 'src', 'controllers', f), 'utf8');
    assert.match(src('new-game.ts'), /const pack = packFits\(options\.pack, locale\) \? options\.pack : undefined;/);
    assert.match(src('crew.ts'), /pack: seasonalPack\(Date\.now\(\), crew\.locale \|\| 'en'\)/);
});
