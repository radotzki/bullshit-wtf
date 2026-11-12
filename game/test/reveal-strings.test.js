// Tests for a player's result lines and the reveal's sounds (src/app/pages/reveal-the-truth/reveal-strings.ts),
// and for the staged reveal's own words (src/app/pages/game-strings.ts).
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

const { resultLines, stingFor } = load();

function loadGameStrings() {
    const file = path.join(__dirname, '..', 'src', 'app', 'pages', 'game-strings.ts');
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

// The words are the game's own (game-strings.ts), the same in both reveals.
const { gameStrings } = loadGameStrings();
const en = gameStrings('en');
const he = gameStrings('he');
// Points are wrapped in invisible marks that keep "+500" left to right in Hebrew; drop them to compare.
const plain = s => s.replace(/[\u2066\u2069]/g, '');

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

test('the staged reveal has its words in both languages', () => {
    ['truthIs', 'foundBy', 'soundOn', 'soundOff', 'youFooled'].forEach(k => {
        assert.ok(k in en && k in he, k);
        assert.strictEqual(typeof he[k], typeof en[k], k);
    });
    assert.strictEqual(en.truthIs, 'AND THE TRUTH IS\u2026');
    assert.strictEqual(he.truthIs, '\u05d5\u05d4\u05d0\u05de\u05ea \u05d4\u05d9\u05d0\u2026');
    assert.ok(/[\u05d0-\u05ea]/.test(he.foundBy) && /[\u05d0-\u05ea]/.test(he.soundOn) && /[\u05d0-\u05ea]/.test(he.soundOff));
});

test('the result lines in English are the ones the reveal has always shown', () => {
    assert.deepStrictEqual(resultLines('alice', rows, en).map(plain), ['You found the truth! +1000', 'You fooled Ben and Chen! +1000']);
    assert.deepStrictEqual(resultLines('ben', rows, en).map(plain), ['You fell for Alice\'s bullshit.', 'Nobody fell for your answer.']);
    assert.deepStrictEqual(resultLines('dana', rows, en).map(plain), ['You fell for our bullshit. -500']);
    assert.deepStrictEqual(resultLines('eli', rows, en).map(plain), ['You fell for our bullshit. No points to lose yet!']);
    assert.deepStrictEqual(resultLines('fay', rows, en).map(plain), ['You didn\'t pick an answer.']);
});

test('the result lines in Hebrew use the game\'s own Hebrew words', () => {
    assert.deepStrictEqual(resultLines('alice', rows, he),
        [he.foundTheTruth(he.signed(1000)), he.fooled(he.names(['Ben', 'Chen']), he.signed(1000))]);
    assert.deepStrictEqual(resultLines('ben', rows, he), [he.fellFor('Alice'), he.nobodyFellForYours]);
    assert.deepStrictEqual(resultLines('dana', rows, he), [he.fellForOurs(he.signed(-500))]);
    assert.deepStrictEqual(resultLines('eli', rows, he), [he.fellForOursNoPoints]);
    assert.deepStrictEqual(resultLines('fay', rows, he), [he.didNotPick]);
    resultLines('alice', rows, he).concat(resultLines('ben', rows, he)).forEach(line => assert.ok(/[\u05d0-\u05ea]/.test(line), line));
});

test('the flash names everyone the lie fooled', () => {
    assert.strictEqual(en.youFooled(en.names(['Chen'])), 'You fooled Chen!');
    assert.strictEqual(en.youFooled(en.names(['Ben', 'Chen', 'Dana'])), 'You fooled Ben, Chen and Dana!');
    assert.ok(he.youFooled(he.names(['\u05d3\u05e0\u05d4', '\u05d9\u05d5\u05d0\u05d1'])).indexOf('\u05d3\u05e0\u05d4') > 0);
});

test('points keep their sign on the left inside a Hebrew line', () => {
    assert.strictEqual(he.signed(500), '\u2066+500\u2069');
    assert.strictEqual(he.signed(-500), '\u2066-500\u2069');
    assert.ok(resultLines('alice', rows, he)[0].indexOf('\u2066+1000\u2069') > 0);
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
