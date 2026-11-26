// "Kids are playing" in the Hanukkah season: a kids game gets up to two of the Hanukkah pack's
// kid-friendly questions (questionPacks.hanukkah.kidsToo), in Hebrew by default and in English when
// the game came from the Hanukkah page's offer (GameScheme kidsHoliday). Out of season, and in every
// game that isn't a kids game, nothing changes. From the Hanukkah night walk-through, break 3: a
// family with a 9-year-old ticked the kids switch and played Hanukkah night with no Hanukkah.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const dist = path.join(__dirname, '..', 'dist');
const model = require(path.join(dist, 'game-model'));
const { kidsSeasonQuestions, kidsHolidayFor } = require(path.join(dist, 'controllers', 'kids-season'));
const { pickWithPack, withSeasonKids } = require(path.join(dist, 'controllers', 'question-picker'));
const { lieRefused } = require(path.join(dist, 'controllers', 'lie-filter'));
const { isRetired } = require(path.join(dist, 'controllers', 'retired-questions'));
const { aboutSlots } = require(path.join(dist, 'controllers', 'about'));
const hanukkah = require('../data/hanukkah-questions.json');
const kids = require('../data/kids-questions.json');

const { questionPacks, KIDS_PACK, KIDS_SEASON_PER_GAME, kidsSeasonPack } = model;
const kidsToo = questionPacks.hanukkah.kidsToo;
// First candle, Friday 4 December 2026, 19:30 in Israel; the school break; the pack's last day.
const FIRST_CANDLE = Date.parse('2026-12-04T17:30:00Z');
const BREAK = Date.parse('2026-12-08T16:00:00Z');
const LAST_DAY = Date.parse('2026-12-13T12:00:00Z');
const NOVEMBER = Date.parse('2026-11-23T12:00:00Z');
const AFTER = Date.parse('2026-12-14T12:00:00Z');

const bank = lang => Object.keys(hanukkah).filter(id => hanukkah[id].lang === lang)
    .concat(Object.keys(kids).filter(id => kids[id].lang === lang));
const kidIds = lang => Object.keys(kids).filter(id => kids[id].lang === lang);
const seeded = seed => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

test('at least 10 kid-friendly Hanukkah questions in each language, all of the pack, none twice', () => {
    for (const lang of ['en', 'he']) {
        const mine = kidsToo.filter(id => id.split('-')[2] === lang);
        assert.ok(mine.length >= 10, `${lang}: ${mine.length}`);
        mine.forEach(id => {
            assert.ok(hanukkah[id], `${id} is in the Hanukkah questions file`);
            assert.strictEqual(hanukkah[id].lang, lang, id);
            assert.strictEqual(hanukkah[id].pack, 'hanukkah', id);
            assert.ok(!isRetired(id), id);
        });
    }
    assert.strictEqual(new Set(kidsToo).size, kidsToo.length);
});

test('every kid-friendly Hanukkah question passes the kids\' lie filter: question, truth and house lies', () => {
    for (const id of kidsToo) {
        const q = hanukkah[id];
        for (const text of [q.questionText.replace('$blank$', ' '), q.realAnswer].concat(q.fakeAnswers)) {
            assert.strictEqual(lieRefused(text), false, `${id}: ${text}`);
        }
        // Short answers a child can type and read.
        assert.ok(q.realAnswer.length <= 20, `${id}: ${q.realAnswer}`);
    }
});

test('none of the battles, kings, beheadings or late-night comedians made the kids\' list', () => {
    const english = /\b(head|elephants?|war|battles?|died|kill\w*|worms?|madman|beasts?|zeus|sandler|saturday night|lovitz|bush)\b/i;
    // Hebrew words whole, also after one prefix letter (ה, ו, ב, ל, מ, ש, כ).
    const hebrew = ['ראשו', 'פיל', 'מלחמה', 'קרב', 'נהרג', 'נרצח', 'תולעים', 'משוגע', 'זאוס'];
    for (const id of kidsToo) {
        const q = hanukkah[id];
        const all = [q.questionText, q.realAnswer].concat(q.fakeAnswers).join(' | ');
        assert.doesNotMatch(all, english, `${id}: ${all}`);
        const words = all.split(/[^א-ת]+/).filter(Boolean);
        const hit = words.find(w => hebrew.includes(w) || (/^[הובלמשכ]/.test(w) && hebrew.includes(w.slice(1))));
        assert.strictEqual(hit, undefined, `${id}: ${all}`);
    }
});

test('a Hebrew kids game in the Hanukkah season gets Hanukkah questions, from the first candle to the last day', () => {
    for (const now of [Date.parse('2026-12-01T08:00:00Z'), FIRST_CANDLE, BREAK, LAST_DAY]) {
        assert.strictEqual(kidsSeasonPack(now, 'he'), 'hanukkah', new Date(now).toISOString());
        const ids = kidsSeasonQuestions(KIDS_PACK, 'he', bank('he'), now);
        assert.deepStrictEqual(ids, kidsToo.filter(id => id.includes('-he-')));
    }
    // The game itself: two fresh Hanukkah questions among the kids' questions, never question 1.
    for (const count of [5, 7, 9]) {
        const picked = pickWithPack([], kidIds('he'), [], count, questionPacks.kids.perGame, seeded(count));
        const qids = withSeasonKids(picked, kidsSeasonQuestions(KIDS_PACK, 'he', bank('he'), BREAK), [],
            KIDS_SEASON_PER_GAME, seeded(7), aboutSlots(count));
        const added = qids.filter(id => id.startsWith('hanukkah-'));
        assert.strictEqual(qids.length, count);
        assert.strictEqual(added.length, 2, `${count}: ${qids}`);
        assert.ok(qids[0].startsWith('kids-'), 'the kids opener stays');
        added.forEach(id => assert.ok(kidsToo.includes(id), id));
        assert.ok(added.every(id => aboutSlots(count).indexOf(qids.indexOf(id)) < 0), 'not in an About slot');
        assert.strictEqual(new Set(qids).size, count);
    }
});

test('an English kids game gets them when it came from the Hanukkah page, not by default (Christmas)', () => {
    assert.strictEqual(kidsSeasonPack(BREAK, 'en'), undefined, 'English December games default to Christmas');
    assert.deepStrictEqual(kidsSeasonQuestions(KIDS_PACK, 'en', bank('en'), BREAK), []);
    assert.strictEqual(kidsSeasonPack(BREAK, 'en', 'hanukkah'), 'hanukkah');
    assert.deepStrictEqual(kidsSeasonQuestions(KIDS_PACK, 'en', bank('en'), BREAK, 'hanukkah'),
        kidsToo.filter(id => id.includes('-en-')));
    // Only questions of the game's own language, even if a bank held both.
    const mixed = kidsSeasonQuestions(KIDS_PACK, 'en', bank('en').concat(bank('he')), BREAK, 'hanukkah');
    assert.ok(mixed.length >= 10 && mixed.some(id => id.includes('-he-')) === true);
    assert.ok(kidsSeasonQuestions(KIDS_PACK, 'en', bank('en'), BREAK, 'hanukkah').every(id => id.includes('-en-')));
});

test('out of the season a kids game gets no Hanukkah questions, asked for or not', () => {
    for (const now of [NOVEMBER, AFTER, Date.parse('2027-03-01T12:00:00Z')]) {
        for (const lang of ['he', 'en']) {
            assert.deepStrictEqual(kidsSeasonQuestions(KIDS_PACK, lang, bank(lang), now, 'hanukkah'), [], `${lang} ${now}`);
            assert.notStrictEqual(kidsSeasonPack(now, lang, 'hanukkah'), 'hanukkah');
        }
    }
    // A made-up or foreign holiday changes nothing.
    assert.strictEqual(kidsSeasonPack(BREAK, 'en', 'purim'), undefined);
    assert.strictEqual(kidsSeasonPack(BREAK, 'he', 'christmas'), 'hanukkah');
    assert.strictEqual(kidsSeasonPack(BREAK, 'en', '__proto__'), undefined);
});

test('an adult game is unchanged: only a kids game gets the extra questions', () => {
    for (const pack of [undefined, 'hanukkah', 'christmas', 'thanksgiving', 'party']) {
        for (const lang of ['he', 'en']) {
            assert.deepStrictEqual(kidsSeasonQuestions(pack, lang, bank(lang), BREAK, 'hanukkah'), [], `${pack} ${lang}`);
        }
    }
    // The adult Hanukkah pack still plays three of all its questions, with the Hebrew opener first.
    assert.strictEqual(questionPacks.hanukkah.perGame, 3);
    assert.strictEqual(model.seasonalPack(BREAK, 'he'), 'hanukkah');
    assert.strictEqual(model.seasonalPack(BREAK, 'en'), 'christmas');
});

test('Thanksgiving kids games (#241) keep working beside Hanukkah', () => {
    const thursday = Date.parse('2026-11-26T23:30:00Z');
    assert.strictEqual(kidsSeasonPack(thursday, 'en'), 'thanksgiving');
    assert.strictEqual(kidsSeasonPack(thursday, 'en', 'hanukkah'), 'thanksgiving', 'Hanukkah is out of season then');
    assert.strictEqual(kidsSeasonPack(thursday, 'he'), undefined);
});

test('a new game keeps the holiday only for a kids game in that holiday\'s season', () => {
    assert.strictEqual(kidsHolidayFor(KIDS_PACK, 'en', 'hanukkah', BREAK), 'hanukkah');
    assert.strictEqual(kidsHolidayFor(KIDS_PACK, 'he', 'hanukkah', BREAK), 'hanukkah');
    assert.strictEqual(kidsHolidayFor('hanukkah', 'en', 'hanukkah', BREAK), undefined, 'an adult game keeps nothing new');
    assert.strictEqual(kidsHolidayFor(undefined, 'he', 'hanukkah', BREAK), undefined);
    assert.strictEqual(kidsHolidayFor(KIDS_PACK, 'en', 'hanukkah', NOVEMBER), undefined, 'out of season');
    for (const junk of [null, undefined, 42, {}, 'christmas', 'purim', '__proto__', 'constructor']) {
        assert.strictEqual(kidsHolidayFor(KIDS_PACK, 'en', junk, BREAK), undefined, String(junk));
    }
});
