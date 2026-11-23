// The controller's keyboard and the AirConsole words. Run: cd airconsole && npm test
'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { load } = require('./bundle');

let K;
let S;
test.before(async () => {
    K = await load('src/keyboard.js');
    S = await load('src/strings.js');
});

test('typing: up to 40 characters, no space first or twice, backspace takes one character', () => {
    let text = '';
    for (const ch of 'blue  moon') text = K.typed(text, ch);
    assert.strictEqual(text, 'blue moon');
    assert.strictEqual(K.typed('', ' '), '');
    assert.strictEqual(K.typed('ab', 'backspace'), 'a');
    assert.strictEqual(K.typed('', 'backspace'), '');
    assert.strictEqual(K.typed('x'.repeat(40), 'y'), 'x'.repeat(40));
    assert.strictEqual(K.MAX_LIE, 40); // the site's lie box takes 40 too (show-question maxlength)
    assert.strictEqual(K.typed('שלום', 'backspace'), 'שלו');
});

test('both layouts: four rows of ten, every Hebrew letter including the final forms', () => {
    ['en', 'he'].forEach(l => {
        assert.strictEqual(K.LAYOUTS[l].length, 4);
        K.LAYOUTS[l].forEach(row => assert.strictEqual(row.length, 10, `${l}: ${row.join('')}`));
    });
    const he = K.LAYOUTS.he.flat().join('');
    'אבגדהוזחטיכךלמםנןסעפףצץקרשת'.split('').forEach(letter => assert.ok(he.includes(letter), letter));
    const en = K.LAYOUTS.en.flat().join('');
    'abcdefghijklmnopqrstuvwxyz0123456789'.split('').forEach(letter => assert.ok(en.includes(letter), letter));
});

test('English and Hebrew have the same words, and every one reads as text', () => {
    const { en, he } = S.AIR_STRINGS;
    assert.deepStrictEqual(Object.keys(he).sort(), Object.keys(en).sort());
    [en, he].forEach(words => Object.keys(words).forEach(k => {
        const v = words[k];
        const out = typeof v === 'function' ? v(3, 12) : v;
        assert.strictEqual(typeof out, 'string', k);
        assert.ok(out.length > 0, k);
        assert.ok(!/undefined|NaN/.test(out), `${k}: ${out}`);
    }));
    assert.strictEqual(S.airStrings('he'), he);
    assert.strictEqual(S.airStrings('fr'), en);
});

test('the Hebrew words are Hebrew', () => {
    const { he } = S.AIR_STRINGS;
    ['tagline', 'youreIn', 'lookAtScreen', 'pickTruth', 'yourLie'].forEach(k => assert.match(he[k], /[֐-׿]/, k));
});
