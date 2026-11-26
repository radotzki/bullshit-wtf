// Tests for the scoreboard between questions (src/app/pages/score-board/score-rows.ts).
// Sentry BULLSHIT-XB: a phone on the scoreboard of an old game read null players and threw
// "can't convert null to object" from Object.keys. Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..', '..');

function load(file, stubs) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    const mod = { exports: {} };
    const req = name => (stubs && stubs[name]) || require(name);
    new Function('module', 'exports', 'require', out)(mod, mod.exports, req);
    return mod.exports;
}

const model = load(path.join(root, 'game-model.ts'), { './name-flag': { nameFlag: () => false } });
const { scoreRows } = load(path.join(__dirname, '..', 'src', 'app', 'pages', 'score-board', 'score-rows.ts'),
    { './../../game-model': model });

test('players that read as nothing make an empty board, not a crash', () => {
    assert.deepStrictEqual(scoreRows(null), []);
    assert.deepStrictEqual(scoreRows(undefined), []);
    assert.deepStrictEqual(scoreRows({}), []);
});

test('a seat that reads as null is left out', () => {
    const rows = scoreRows({ a: { nickname: 'Dana', score: 100 }, b: null });
    assert.deepStrictEqual(rows.map(r => r.nickname), ['Dana']);
});

test('rows go highest score first, each with its seat picture', () => {
    const rows = scoreRows({
        a: { nickname: 'Dana', score: 100 },
        b: { nickname: 'Omer', score: 300 },
        c: { nickname: 'Noa', score: 200 },
    });
    assert.deepStrictEqual(rows.map(r => r.nickname), ['Omer', 'Noa', 'Dana']);
    assert.deepStrictEqual(rows.map(r => r.picture), [model.seatPicture(1), model.seatPicture(2), model.seatPicture(0)]);
});

test('the scoreboard page reads its rows through scoreRows', () => {
    const page = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'pages', 'score-board', 'score-board.component.ts'), 'utf8');
    assert.ok(page.includes('scoreRows(resp)'));
    assert.ok(!/Object\.keys\(resp\)/.test(page));
});
