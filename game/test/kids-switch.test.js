// "Kids are playing" on the Create page: the switch in both languages, off unless ?pack=kids, the
// line under it, the Special row leaving the form while it is on, and the pack the page sends.
// The server's side is functions/test/kids-switch.test.js. Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const root = path.join(__dirname, '..', '..');
const dir = path.join(root, 'game', 'src', 'app', 'pages', 'create-game');
const transpile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5, lib: ['es2016', 'dom'] },
}).outputText;
const loadPlain = (file, req = () => ({})) => {
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', transpile(file))(mod, mod.exports, req);
    return mod.exports;
};
const model = loadPlain(path.join(root, 'game-model.ts'));
const { createStrings } = loadPlain(path.join(dir, 'create-strings.ts'));
const html = fs.readFileSync(path.join(dir, 'create-game.component.html'), 'utf8');
const src = fs.readFileSync(path.join(dir, 'create-game.component.ts'), 'utf8');

test('the switch has its words in English and Hebrew, and says what comes after the 20', () => {
    const en = createStrings('en');
    const he = createStrings('he');
    assert.strictEqual(en.kids, '🧒 Kids are playing');
    assert.strictEqual(he.kids, '🧒 ילדים משחקים');
    assert.strictEqual(en.players, 'Players:');
    assert.match(he.players, /[א-ת]/);
    assert.match(en.kidsNote, /20/);
    assert.match(en.kidsNote, /usual questions/);
    assert.match(he.kidsNote, /20/);
    assert.match(he.kidsNote, /השאלות הרגילות/);
    // The line names no season and no pack: it stays true in every month.
    for (const note of [en.kidsNote, he.kidsNote]) {
        assert.doesNotMatch(note, /hanukkah|christmas|חנוכה/i);
    }
});

test('with a seasonal pack on offer, the kids line says the game has none of its questions', () => {
    assert.match(html, /<p class="kids-note kids-no-pack" \*ngIf="kids && pack && !kidsSeasonLine">\{\{ t\.kidsNoPack \}\} \{\{ packLabel \}\}\.<\/p>/);
    assert.strictEqual(`${createStrings('he').kidsNoPack} ${model.questionPacks.hanukkah.label.he}.`, 'במשחק ילדים אין שאלות חנוכה.');
    assert.strictEqual(`${createStrings('en').kidsNoPack} ${model.questionPacks.hanukkah.label.en}.`, 'A kids game has no Hanukkah questions.');
});

test('the form: a checkbox bound to kids, its line only while it is on, Special only while it is off', () => {
    assert.match(html, /<input type="checkbox" name="kids" \[\(ngModel\)\]="kids"> \{\{ t\.kids \}\}/);
    assert.match(html, /<p class="kids-note" \*ngIf="kids">\{\{ t\.kidsNote \}\}<\/p>/);
    assert.match(html, /<ng-container \*ngIf="pack && !kids">\s*<label>\{\{ t\.special \}\}<\/label>/);
    // Under the length, above Special.
    assert.ok(html.indexOf('name="length"') < html.indexOf('name="kids"'));
    assert.ok(html.indexOf('name="kids"') < html.indexOf('name="usePack"'));
});

test('off by default; ?pack=kids switches it on and is never the Special pack', () => {
    assert.match(src, /^    kids = false;$/m);
    // The CrazyGames version ignores ?pack=kids (test/privacy.test.js).
    assert.match(src, /this\.kids = !this\.portal && params\.pack === KIDS_PACK;/);
    assert.match(src, /this\.askedPack = typeof params\.pack === 'string' && params\.pack !== KIDS_PACK \? params\.pack : null;/);
    assert.match(src, /const pack = chosenPack\(this\.kids, this\.usePack, this\.pack\);/);
    // What the Special row offers, as the page works it out: never kids, by season or by link.
    const offered = (asked, locale, now) => model.packFits(asked, locale) ? asked : model.seasonalPack(now, locale) || null;
    const asked = p => typeof p === 'string' && p !== model.KIDS_PACK ? p : null;
    const dec5 = Date.parse('2026-12-05T18:00:00+02:00');
    const oct = Date.parse('2026-10-10T18:00:00+02:00');
    assert.strictEqual(offered(asked('kids'), 'he', dec5), 'hanukkah');
    assert.strictEqual(offered(asked('kids'), 'en', oct), null);
    for (const locale of ['en', 'he']) {
        for (let d = 0; d < 366; d++) {
            assert.notStrictEqual(offered(null, locale, oct + d * 86400000), 'kids');
        }
    }
});

test('the pack sent: kids when the switch is on, even in Hanukkah; else Special as before', () => {
    assert.strictEqual(model.chosenPack(true, true, 'hanukkah'), 'kids');
    assert.strictEqual(model.chosenPack(true, false, 'christmas'), 'kids');
    assert.strictEqual(model.chosenPack(true, true, null), 'kids');
    assert.strictEqual(model.chosenPack(false, true, 'hanukkah'), 'hanukkah');
    assert.strictEqual(model.chosenPack(false, false, 'hanukkah'), undefined);
    assert.strictEqual(model.chosenPack(false, true, null), undefined);
});

test('the lobby makes no promise for a kids game', () => {
    const { packBanner } = loadPlain(path.join(root, 'game', 'src', 'app', 'pages', 'game-staging', 'lobby-host.ts'), name => {
        if (name.startsWith('.')) {
            return loadPlain(path.join(root, 'game', 'src', 'app', 'pages', 'game-staging', name + '.ts'), () => ({}));
        }
        return require(name);
    });
    assert.strictEqual(packBanner('kids', 'en'), null);
    assert.strictEqual(packBanner('kids', 'he'), null);
});
