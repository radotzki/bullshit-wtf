// Tests for the final screen of an old game (src/app/pages/score-board-final/game-gone.ts).
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

const dir = path.join(__dirname, '..', 'src', 'app', 'pages', 'score-board-final');
const g = load(path.join(dir, 'game-gone.ts'));

test('a refused or empty read of the players means the game is gone', () => {
    assert.strictEqual(g.gameGone(null), true);
    assert.strictEqual(g.gameGone(undefined), true);
    assert.strictEqual(g.gameGone({}), true);
    assert.strictEqual(g.gameGone('x'), true);
});

test('a game with players is drawn as before', () => {
    assert.strictEqual(g.gameGone({ p1: { nickname: 'Dana', score: 300 } }), false);
});

test('the join page for the same PIN, in the game\'s language', () => {
    assert.deepStrictEqual(g.joinPageFor('jvqp', 'en'), ['/join-game', 'JVQP']);
    assert.deepStrictEqual(g.joinPageFor('JVQP', 'he'), ['/he/join-game', 'JVQP']);
    assert.deepStrictEqual(g.joinPageFor('JVQP', undefined), ['/join-game', 'JVQP']);
});

test('the final screen reads players with a fallback and goes to the join page when they are gone', () => {
    const src = fs.readFileSync(path.join(dir, 'score-board-final.component.ts'), 'utf8');
    assert.match(src, /getPlayers\(this\.pin\)\.catch\(\(\) => null\)/);
    assert.match(src, /if \(gameGone\(resp\)\) \{\s*\/\/[^\n]*\n\s*this\.leaveForJoinPage\(locale\);/);
    assert.match(src, /this\.router\.navigate\(joinPageFor\(this\.pin, locale\), \{ replaceUrl: true \}\)/);
});
