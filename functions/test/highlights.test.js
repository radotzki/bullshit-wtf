// The final screen's highlights: each player's best lie. Run with: npm test
const test = require('node:test');
const assert = require('node:assert');
const { addHighlights, finalPlaces, highlightsStart } = require('../dist/game-model');

const q1 = [
    { text: 'nickelback', selectors: ['a', 'c'], creators: ['b'], realAnswer: false, houseLie: false, points: 1000 },
    { text: 'kfc', selectors: ['b'], creators: ['a'], realAnswer: false, houseLie: false, points: 500 },
    { text: 'babies', selectors: [], creators: ['c'], realAnswer: false, houseLie: false, points: 0 },
    { text: 'a goat', selectors: ['c'], creators: [''], realAnswer: false, houseLie: true, points: -250 },
    { text: 'tom', selectors: ['a'], creators: [''], realAnswer: true, houseLie: false, points: 1000 },
];

test('only lies somebody picked count, and the truth and house lies never do', () => {
    const h = addHighlights(null, q1, 'What did he eat?');
    assert.deepStrictEqual(h, {
        b: { text: 'nickelback', fooled: 2, points: 1000, q: 'What did he eat?', total: 2 },
        a: { text: 'kfc', fooled: 1, points: 500, q: 'What did he eat?', total: 1 },
    });
});

test('a later lie replaces the best one only when it fooled more, or as many for more points', () => {
    const h1 = addHighlights(null, q1, 'Q1');
    const q2 = [
        { text: 'a tuba', selectors: ['a'], creators: ['b'], realAnswer: false, houseLie: false, points: 750 },
        { text: 'oslo', selectors: ['b', 'c'], creators: ['a'], realAnswer: false, houseLie: false, points: 1500 },
        { text: 'lima', selectors: ['a', 'b'], creators: ['c'], realAnswer: false, houseLie: false, points: 1500 },
    ];
    const h2 = addHighlights(h1, q2, 'Q2');
    assert.deepStrictEqual(h2.b, { text: 'nickelback', fooled: 2, points: 1000, q: 'Q1', total: 3 });
    assert.deepStrictEqual(h2.a, { text: 'oslo', fooled: 2, points: 1500, q: 'Q2', total: 3 });
    assert.deepStrictEqual(h2.c, { text: 'lima', fooled: 2, points: 1500, q: 'Q2', total: 2 });
    // The input is not changed.
    assert.strictEqual(h1.a.text, 'kfc');
    const h3 = addHighlights(h2, [{ text: 'x', selectors: ['a', 'c'], creators: ['b'], points: 2000 }], 'Q3');
    assert.deepStrictEqual(h3.b, { text: 'x', fooled: 2, points: 2000, q: 'Q3', total: 5 });
});

test('players who wrote the same lie both get it', () => {
    const h = addHighlights({}, [{ text: 'cheese', selectors: ['c'], creators: ['a', 'b'], points: 500 }]);
    assert.deepStrictEqual(h.a, { text: 'cheese', fooled: 1, points: 500, total: 1 });
    assert.deepStrictEqual(h.b, { text: 'cheese', fooled: 1, points: 500, total: 1 });
});

test('a round where nobody was fooled keeps the highlights as they were', () => {
    const h1 = addHighlights(null, q1, 'Q1');
    assert.deepStrictEqual(addHighlights(h1, [q1[2], q1[4]], 'Q2'), h1);
    assert.deepStrictEqual(addHighlights(undefined, undefined), {});
});

test('final places share a place on a tie', () => {
    assert.deepStrictEqual(finalPlaces([6250, 5750, 3500]), [1, 2, 3]);
    assert.deepStrictEqual(finalPlaces([5000, 5000, 3500]), [1, 1, 3]);
    assert.deepStrictEqual(finalPlaces([0, 0]), [1, 1]);
});

test('highlights count from the first reveal a new server handles, and that never moves', () => {
    assert.strictEqual(highlightsStart(undefined, 0), 0);      // a whole game
    assert.strictEqual(highlightsStart(undefined, undefined), 0);
    assert.strictEqual(highlightsStart(undefined, 3), 3);      // a game that was running at the deploy
    assert.strictEqual(highlightsStart(3, 4), 3);
    assert.strictEqual(highlightsStart(0, 4), 0);
    assert.strictEqual(highlightsStart(null, 2), 2);
});
