// Shape check for the Hanukkah pack's questions (functions/data/hanukkah-questions.json), loaded
// into /questions by hand (DEPLOYING.md, "Hanukkah pack and campaign tags").
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const pack = require('../data/hanukkah-questions.json');
const { isRetired } = require('../dist/controllers/retired-questions');

const ids = Object.keys(pack);
const lower = s => s.trim().toLowerCase();

test('every Hanukkah question is a playable question of the pack', () => {
    for (const id of ids) {
        const q = pack[id];
        assert.match(id, /^hanukkah-26-(en|he)-\d\d$/, id);
        assert.strictEqual(q.pack, 'hanukkah', id);
        assert.strictEqual(q.lang, id.split('-')[2], id);
        assert.strictEqual(q.questionText.split('$blank$').length, 2, `${id}: one blank`);
        assert.strictEqual(q.realAnswer, lower(q.realAnswer), `${id}: answers are shown lower-case`);
        // A player types at most 40 characters; a truth longer than any lie would give itself away.
        assert.ok(q.realAnswer.length <= 40, id);
        assert.strictEqual(q.fakeAnswers.length, 3, id);
        q.fakeAnswers.forEach(f => {
            assert.strictEqual(f, lower(f), `${id}: ${f}`);
            assert.ok(f.length <= 40, `${id}: ${f}`);
        });
        assert.strictEqual(new Set(q.fakeAnswers.concat(q.realAnswer)).size, 4, `${id}: four different answers`);
        assert.match(q.citation, /^https:\/\//, id);
        assert.ok(!q.opener, `${id}: a pack question is no opener`);
        assert.ok(!isRetired(id), id);
    }
});

test('each language has enough for five games without a repeat', () => {
    // A game takes up to 3 pack questions nobody in the room has seen.
    for (const lang of ['en', 'he']) {
        const n = ids.filter(id => pack[id].lang === lang).length;
        assert.ok(n >= 15, `${lang}: ${n}`);
    }
    const texts = ids.map(id => pack[id].questionText);
    assert.strictEqual(new Set(texts).size, texts.length);
});

test('the questions the Hanukkah pages promise are in the pack', () => {
    const pages = fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'seo', 'pages.js'), 'utf8');
    const en = ids.filter(id => pack[id].lang === 'en').map(id => pack[id].questionText).join('\n');
    const he = ids.filter(id => pack[id].lang === 'he').map(id => pack[id].questionText).join('\n');
    // "the astronaut who spun a dreidel in space, the year Hanukkah met Thanksgiving"
    assert.ok(pages.includes('the astronaut who spun a dreidel in space, the year Hanukkah met Thanksgiving'));
    assert.match(en, /astronaut .* spun a dreidel/);
    assert.match(en, /Hanukkah fell on Thanksgiving/);
    // "האסטרונאוט שסובב סביבון בחלל, מי הפך את הסופגנייה למאכל החג"
    assert.ok(pages.includes('האסטרונאוט שסובב סביבון בחלל, מי הפך את הסופגנייה למאכל החג'));
    assert.match(he, /האסטרונאוט .* סובב סביבון בחלל/);
    assert.match(he, /הסופגנייה להיות מאכל החנוכה/);
});
