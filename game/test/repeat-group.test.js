// Tests for "a group's second game" on the final screen (src/app/pages/score-board-final/repeat-group.ts).
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

const app = path.join(__dirname, '..', 'src', 'app');
const r = load(path.join(app, 'pages', 'score-board-final', 'repeat-group.ts'));
const DAY = 24 * 3600 * 1000;
const now = Date.UTC(2026, 10, 13, 20, 0);

test('a first game is no repeat; the rematch after it is', () => {
    let games = r.parseGames(null);
    assert.strictEqual(r.isRepeatGroup(games, 'AAAA', ['Dana', 'Yossi', 'Noa'], now), false);
    games = r.addGame(games, 'AAAA', ['Dana', 'Yossi', 'Noa'], now);
    // The rematch: same names, the case and spaces as the players typed them.
    assert.strictEqual(r.isRepeatGroup(games, 'BBBB', ['dana ', 'YOSSI', 'Noa'], now + 20 * 60000), true);
});

test('the same group a week later, with a new friend, is a repeat', () => {
    const games = r.addGame([], 'AAAA', ['Dana', 'Yossi', 'Noa', 'Avi'], now - 7 * DAY);
    assert.strictEqual(r.isRepeatGroup(games, 'CCCC', ['Dana', 'Yossi', 'Noa', 'Avi', 'Lior'], now), true);
});

test('the game on screen does not count as its own earlier game (a reload)', () => {
    const games = r.addGame([], 'AAAA', ['Dana', 'Yossi'], now);
    assert.strictEqual(r.isRepeatGroup(games, 'AAAA', ['Dana', 'Yossi'], now + 60000), false);
});

test('one shared name, a different group, an old game or a solo game is no repeat', () => {
    const games = r.addGame([], 'AAAA', ['Dana', 'Yossi', 'Noa', 'Avi'], now - DAY);
    // Only Dana again: a phone that plays with different groups.
    assert.strictEqual(r.isRepeatGroup(games, 'BBBB', ['Dana', 'Moshe', 'Rina'], now), false);
    // Two of six is under half.
    assert.strictEqual(r.isRepeatGroup(games, 'BBBB', ['Dana', 'Yossi', 'A', 'B', 'C', 'D'], now), false);
    // Three of six is half.
    assert.strictEqual(r.isRepeatGroup(games, 'BBBB', ['Dana', 'Yossi', 'Noa', 'B', 'C', 'D'], now), true);
    const old = r.addGame([], 'AAAA', ['Dana', 'Yossi'], now - 61 * DAY);
    assert.strictEqual(r.isRepeatGroup(old, 'BBBB', ['Dana', 'Yossi'], now), false);
    assert.strictEqual(r.isRepeatGroup(games, 'BBBB', ['Dana'], now), false);
});

test('the list keeps each game once, newest first, and at most twelve', () => {
    let games = [];
    for (let i = 0; i < 15; i++) {
        games = r.addGame(games, 'P' + i, ['a', 'b'], now + i);
    }
    games = r.addGame(games, 'P14', ['a', 'b'], now + 99);
    assert.strictEqual(games.length, 12);
    assert.strictEqual(games[0].pin, 'P14');
    assert.strictEqual(games.filter(g => g.pin === 'P14').length, 1);
    const back = r.parseGames(JSON.stringify(games));
    assert.deepStrictEqual(back, games);
});

test('a broken stored list reads as empty', () => {
    assert.deepStrictEqual(r.parseGames('{oops'), []);
    assert.deepStrictEqual(r.parseGames('{"a":1}'), []);
    assert.deepStrictEqual(r.parseGames('[{"pin":"A"},null,{"pin":"B","time":1,"names":["x"]}]'), [{ pin: 'B', time: 1, names: ['x'] }]);
});
