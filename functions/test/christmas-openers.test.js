// A December English game opens with a Christmas pack question (pickWithPack puts the pack first). On the
// remote office party walk-through the virtual party page's game opened with "La Befana, an old ___": a
// random pack question is the first thing a team of colleagues sees. Like Thanksgiving and Hanukkah, the
// Christmas pack names openers a mixed team half knows.
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { questionPacks } = require(path.join(__dirname, '..', 'dist', 'game-model'));
const { pickWithPack } = require(path.join(__dirname, '..', 'dist', 'controllers', 'question-picker'));
const file = require('../data/christmas-questions.json');

test('Christmas openers are English questions of the Christmas pack file', () => {
    const openers = questionPacks.christmas.openers;
    assert.ok(openers.length >= 8, 'enough openers for a month of office parties');
    assert.strictEqual(new Set(openers).size, openers.length);
    openers.forEach(id => {
        assert.ok(file[id], `${id} is in christmas-questions.json`);
        assert.strictEqual(file[id].lang, 'en');
        assert.strictEqual(file[id].pack, 'christmas');
    });
    // Not the questions a first walk-through opened with, nor the obscure ones.
    ['christmas-26-en-20', 'christmas-26-en-24', 'christmas-26-en-25', 'christmas-26-en-30']
        .forEach(id => assert.ok(openers.indexOf(id) < 0, id));
});

test('a Christmas game opens with an unseen opener; once a room has seen them all, any pack question', () => {
    const pack = Object.keys(file);
    const openers = questionPacks.christmas.openers;
    const bank = Array.from({ length: 40 }, (_, i) => `q${i}`);
    for (let i = 0; i < 20; i++) {
        const qids = pickWithPack(bank, pack, [], 7, 3, Math.random, openers);
        assert.ok(openers.indexOf(qids[0]) >= 0, `question 1 is an opener: ${qids[0]}`);
    }
    const seen = {};
    openers.forEach(id => { seen[id] = 1; });
    const qids = pickWithPack(bank, pack, [seen], 7, 3, Math.random, openers);
    assert.ok(pack.indexOf(qids[0]) >= 0 && openers.indexOf(qids[0]) < 0);
});

// The English Christmas night walk: a family in Ohio with an 8-year-old and the grandparents opened with
// London's tree from Oslo. A family's first question is one the kids and the grandparents half know.
test('a family Christmas game opens with one an American family half knows, never Oslo or the 108 bells', () => {
    const openers = questionPacks.christmas.openers;
    ['christmas-26-en-07', 'christmas-26-en-17'].forEach(id => assert.ok(openers.indexOf(id) < 0, id));
    ['christmas-26-en-08', 'christmas-26-en-11', 'christmas-26-en-26'].forEach(id => assert.ok(openers.indexOf(id) >= 0, id));
});
