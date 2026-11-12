// Tests for the list on the answers screen (src/app/services/answers-list.ts).
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load() {
    const file = path.join(__dirname, '..', 'src', 'app', 'services', 'answers-list.ts');
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const { answersList } = load();
const answers = {
    p1: { text: 'emus' },
    p2: { text: 'a flock of geese' },
    house1: { text: 'rabbits' },
    truth: { text: 'emus' },
};

test('a game with no answers gives an empty list instead of throwing (BULLSHIT-WR, BULLSHIT-WW)', () => {
    assert.deepStrictEqual(answersList(null, '-P61Ie823FGX-mAjYllw'), []);
    assert.deepStrictEqual(answersList(undefined, 'p1'), []);
    assert.deepStrictEqual(answersList(null), []);
});

test('the big screen lists every answer once, sorted', () => {
    assert.deepStrictEqual(answersList(answers), ['a flock of geese', 'emus', 'rabbits']);
});

test('a player does not see their own lie', () => {
    assert.deepStrictEqual(answersList(answers, 'p2'), ['emus', 'rabbits']);
});

test('a player who wrote nothing, or is unknown, sees every answer', () => {
    assert.deepStrictEqual(answersList(answers, 'p9'), ['a flock of geese', 'emus', 'rabbits']);
    assert.deepStrictEqual(answersList(answers, undefined), ['a flock of geese', 'emus', 'rabbits']);
});

test('a broken row is skipped', () => {
    assert.deepStrictEqual(answersList({ p1: null, p2: { text: 'geese' } }, 'p1'), ['geese']);
});
