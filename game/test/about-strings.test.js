// Tests for the words of the "About us" questions (src/app/pages/about-strings.ts), how a phone reads
// an About question off the game's state (aboutOf in game-model.ts), and the reveal's points for the
// player it is about (revealScoreChanges).
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, () => ({ nameFlag: () => false }));
    return mod.exports;
}

const root = path.join(__dirname, '..', '..');
const pages = path.join(root, 'game', 'src', 'app', 'pages');
const { aboutStrings, aboutResultLine } = load(path.join(pages, 'about-strings.ts'));
const { aboutOf, revealScoreChanges } = load(path.join(root, 'game-model.ts'));
const { gameStrings } = load(path.join(pages, 'game-strings.ts'));

const en = aboutStrings('en');
const he = aboutStrings('he');
const hebrew = /[א-ת]/;

function lines(t) {
    return Object.keys(t).map(k => typeof t[k] === 'function' ? t[k].length === 2 ? t[k]('Dan and Ben', '+1000') : t[k]('Dan') : t[k]);
}

test('every game that is not Hebrew gets the English words', () => {
    assert.strictEqual(aboutStrings(undefined), en);
    assert.strictEqual(aboutStrings('fr'), en);
    assert.strictEqual(en.theirTruth('Ben'), 'Ben\'S TRUTH');
    assert.strictEqual(en.lieHint('Ben'), 'Write a lie that sounds like Ben.');
    assert.strictEqual(en.knowYou('Dan'), 'Dan knows you!');
    assert.strictEqual(en.knowYou('Dan and Ben'), 'Dan and Ben know you!');
});

test('Hebrew has a word for every English one, in Hebrew, and keeps the names', () => {
    assert.deepStrictEqual(Object.keys(he), Object.keys(en));
    lines(he).forEach(line => {
        assert.match(line, hebrew);
        assert.doesNotMatch(line.replace(/Dan|Ben|and/g, ''), /[A-Za-z]/, line);
    });
    assert.ok(he.theirTruth('בן').indexOf('בן') !== -1);
    assert.ok(he.foundYours('דנה ו־בן', '+1000').indexOf('דנה ו־בן') !== -1);
});

test('Hebrew never puts a gendered verb on the player: no slash forms, no verb that agrees with a name', () => {
    lines(he).forEach(line => assert.doesNotMatch(line, /\/ה|\/ת|כותב|כותבת|יודע|יודעת|מצא\b|מצאה/, line));
});

test('the named player\'s own line: who found the truth, or nobody', () => {
    const t = gameStrings('en');
    assert.strictEqual(aboutResultLine(en, ['Dan', 'Gal'], t.signed(1000), t.names), 'Dan and Gal found your truth! +1000');
    assert.strictEqual(aboutResultLine(en, [], t.signed(0), t.names), en.nobodyFoundYours);
    const h = gameStrings('he');
    assert.ok(aboutResultLine(he, ['דנה'], h.signed(500), h.names).indexOf('⁦+500⁩') !== -1);
});

test('a phone reads the About question off the state, and nothing from any other state', () => {
    assert.deepStrictEqual(aboutOf({ id: 2, timestamp: 1, about: { pid: 'p1', prompt: 'fire' } }), { pid: 'p1', prompt: 'fire' });
    [null, undefined, {}, { id: 2 }, { about: null }, { about: 'p1' }, { about: { pid: '' } }, { about: { prompt: 'x' } }]
        .forEach(s => assert.strictEqual(aboutOf(s), null, JSON.stringify(s)));
});

test('the reveal\'s score changes give the named player their points from the truth\'s row', () => {
    const rows = [
        { text: 'lie', selectors: ['c'], creators: ['a'], realAnswer: false, houseLie: false, points: 500 },
        { text: 'truth', selectors: ['a', 'd'], creators: [''], realAnswer: true, houseLie: false, points: 1000, about: 'b', aboutPoints: 1000 },
    ];
    assert.deepStrictEqual(revealScoreChanges(rows), { a: 1500, d: 1000, b: 1000 });
    delete rows[1].about;
    assert.strictEqual(revealScoreChanges(rows).b, undefined, 'a bank question gives nobody points for the truth');
});

test('the screens use the words: the writing, the answers and the reveal', () => {
    const read = f => fs.readFileSync(path.join(pages, f), 'utf8');
    const question = read('show-question/show-question.component.html');
    ['aboutWords.youTitle', 'aboutWords.youHint', 'aboutWords.sendTruth', 'aboutWords.truthIn', 'aboutWords.lieHint(aboutName)', 'aboutWords.bigScreen(aboutName)']
        .forEach(w => assert.ok(question.indexOf(w) !== -1, w));
    // The lie helper stays out of an About question.
    assert.ok(/helper\.button && !aboutName/.test(question));
    const answers = read('show-answers/show-answers.component.html');
    assert.ok(answers.indexOf('aboutWords.youWatch') !== -1);
    assert.ok(/!presenter && !aboutMe/.test(answers), 'the named player gets no buttons to pick');
    const reveal = read('reveal-the-truth/reveal-the-truth.component.html');
    assert.strictEqual(reveal.split('aboutWords.theirTruth(row.aboutName)').length - 1, 2, 'both reveals name whose truth it is');
});
