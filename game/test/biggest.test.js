// Tests for the final's "biggest bullshitter" (src/app/pages/score-board-final/biggest.ts).
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5, lib: ['es2016', 'dom'] },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const { biggestBullshitters } = load(path.join(__dirname, '..', 'src', 'app', 'pages', 'score-board-final', 'biggest.ts'));
const p = (pid, total) => total === undefined ? { pid } : { pid, best: { text: 'a lie', total } };

test('one player fooled the most: the title is theirs alone', () => {
    assert.deepStrictEqual(biggestBullshitters([p('a', 3), p('b', 1), p('c')]), ['a']);
});

test('a tie for most fooled: every tied player gets the title', () => {
    assert.deepStrictEqual(biggestBullshitters([p('a', 2), p('b', 2), p('c', 1)]), ['a', 'b']);
    assert.deepStrictEqual(biggestBullshitters([p('a', 1), p('b', 1), p('c', 1)]), ['a', 'b', 'c']);
});

test('a tie at one fooled player still counts', () => {
    assert.deepStrictEqual(biggestBullshitters([p('a', 1), p('b'), p('c', 1)]), ['a', 'c']);
});

test('nobody fooled anyone: no title', () => {
    assert.deepStrictEqual(biggestBullshitters([p('a'), p('b'), p('c')]), []);
    assert.deepStrictEqual(biggestBullshitters([p('a', 0), p('b', 0)]), []);
    assert.deepStrictEqual(biggestBullshitters([]), []);
});

test('a highlight with no total (a laugh, no one fooled) is not a title', () => {
    assert.deepStrictEqual(biggestBullshitters([{ pid: 'a', best: {} }, p('b', 1)]), ['b']);
});
