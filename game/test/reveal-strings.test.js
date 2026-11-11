// Tests for the words of the staged reveal (src/app/pages/reveal-the-truth/reveal-strings.ts).
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load() {
    const file = path.join(__dirname, '..', 'src', 'app', 'pages', 'reveal-the-truth', 'reveal-strings.ts');
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const { revealStrings, revealStringsFor, resultLines, stingFor, signedPoints } = load();
// Points are wrapped in invisible marks that keep "+500" left to right in Hebrew; drop them to compare.
const plain = s => s.replace(/[⁦⁩]/g, '');

function row(extra) {
    return Object.assign({
        realAnswer: false, houseLie: false, points: 0, pickerIds: [], creatorIds: [], pickerNames: [], creatorNames: [],
    }, extra);
}

const rows = [
    row({ points: 1000, creatorIds: ['alice'], creatorNames: ['Alice'], pickerIds: ['ben', 'chen'], pickerNames: ['Ben', 'Chen'] }),
    row({ creatorIds: ['ben'], creatorNames: ['Ben'] }),
    row({ houseLie: true, points: -500, pointsBy: { dana: -500, eli: 0 }, pickerIds: ['dana', 'eli'], pickerNames: ['Dana', 'Eli'] }),
    row({ realAnswer: true, points: 1000, pickerIds: ['alice'], pickerNames: ['Alice'] }),
];

test('English and Hebrew have the same words', () => {
    assert.deepStrictEqual(Object.keys(revealStrings.he).sort(), Object.keys(revealStrings.en).sort());
    Object.keys(revealStrings.en).forEach(k => assert.strictEqual(typeof revealStrings.he[k], typeof revealStrings.en[k], k));
    assert.strictEqual(revealStringsFor('he'), revealStrings.he);
    assert.strictEqual(revealStringsFor('en'), revealStrings.en);
    assert.strictEqual(revealStringsFor(undefined), revealStrings.en);
});

test('the result lines in English are the ones the reveal has always shown', () => {
    const en = revealStrings.en;
    assert.deepStrictEqual(resultLines('alice', rows, en).map(plain), ['You found the truth! +1000', 'You fooled Ben and Chen! +1000']);
    assert.deepStrictEqual(resultLines('ben', rows, en).map(plain), ['You fell for Alice\'s bullshit.', 'Nobody fell for your answer.']);
    assert.deepStrictEqual(resultLines('dana', rows, en).map(plain), ['You fell for our bullshit. -500']);
    assert.deepStrictEqual(resultLines('eli', rows, en).map(plain), ['You fell for our bullshit. No points to lose yet!']);
    assert.deepStrictEqual(resultLines('fay', rows, en).map(plain), ['You didn\'t pick an answer.']);
});

test('the result lines in Hebrew', () => {
    const he = revealStrings.he;
    assert.deepStrictEqual(resultLines('alice', rows, he).map(plain), ['מצאת את האמת! +1000', 'עבדת על Ben ו-Chen! +1000']);
    assert.deepStrictEqual(resultLines('ben', rows, he).map(plain), ['נפלת בבולשיט של Alice.', 'אף אחד לא נפל בתשובה שלך.']);
    assert.deepStrictEqual(resultLines('dana', rows, he).map(plain), ['נפלת בבולשיט שלנו. -500']);
    assert.deepStrictEqual(resultLines('fay', rows, he).map(plain), ['לא בחרת תשובה.']);
});

test('the flash names everyone the lie fooled', () => {
    assert.strictEqual(revealStrings.en.youFooled(['Chen']), 'You fooled Chen!');
    assert.strictEqual(revealStrings.en.youFooled(['Ben', 'Chen', 'Dana']), 'You fooled Ben, Chen and Dana!');
    assert.strictEqual(revealStrings.he.youFooled(['דנה']), 'עבדת על דנה!');
    assert.strictEqual(revealStrings.he.youFooled(['דנה', 'יואב']), 'עבדת על דנה ו-יואב!');
});

test('points keep their sign on the left inside a Hebrew line', () => {
    assert.strictEqual(signedPoints(500), '⁦+500⁩');
    assert.strictEqual(signedPoints(-500), '⁦-500⁩');
    assert.strictEqual(plain(signedPoints(0)), '0');
});

test('waiting for friends, in both languages', () => {
    assert.strictEqual(revealStrings.en.waiting(1), 'Waiting for 1 friend');
    assert.strictEqual(revealStrings.en.waiting(3), 'Waiting for 3 friends');
    assert.strictEqual(revealStrings.he.waiting(1), 'מחכים לעוד חבר אחד');
    assert.strictEqual(revealStrings.he.waiting(3), 'מחכים לעוד 3 חברים');
});

test('every phone in the room plays the same sting for a row', () => {
    assert.strictEqual(stingFor({ realAnswer: true, houseLie: false }, 3), 'the-truth');
    assert.strictEqual(stingFor({ realAnswer: false, houseLie: true }, 0), 'house-lie-0');
    assert.strictEqual(stingFor({ realAnswer: false, houseLie: true }, 1), 'house-lie-1');
    assert.strictEqual(stingFor({ realAnswer: false, houseLie: false }, 2), 'player-lie-0');
    assert.strictEqual(stingFor({ realAnswer: false, houseLie: false }, 5), 'player-lie-1');
    // Each name is a sound file the game ships.
    ['the-truth', 'house-lie-0', 'house-lie-1', 'player-lie-0', 'player-lie-1', 'time-warning'].forEach(name =>
        assert.ok(fs.existsSync(path.join(__dirname, '..', 'src', 'assets', 'sounds', name + '.mp3')), name));
});
