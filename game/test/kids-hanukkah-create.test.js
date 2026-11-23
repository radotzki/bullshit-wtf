// The create page with "Kids are playing" in the Hanukkah season: in place of #206's "a kids game has
// no Hanukkah questions", the line under the switch says the kids game also gets two kid-friendly
// Hanukkah questions, and the page sends the holiday along (an English game from the Hanukkah page,
// ?pack=hanukkah, has it by that offer; Hebrew games have it by default). The server's side is
// functions/test/kids-hanukkah.test.js. Run: npm test (from game/).
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
const api = fs.readFileSync(path.join(root, 'game', 'src', 'app', 'services', 'api.service.ts'), 'utf8');
const pages = fs.readFileSync(path.join(root, 'game', 'seo', 'pages.js'), 'utf8');

const BREAK = Date.parse('2026-12-06T19:00:00+02:00');
const NOVEMBER = Date.parse('2026-11-23T19:00:00+02:00');
// The line as the page builds it (create-game.component.ts kidsSeasonLine).
const line = (locale, asked, now) => {
    const id = model.kidsSeasonPack(now, locale, asked || undefined);
    return id ? `${createStrings(locale).kidsSeason} ${model.packIcon(id)} ${model.questionPacks[id].label[locale === 'he' ? 'he' : 'en']}.` : '';
};

test('in the Hanukkah season the kids line names two kid-friendly Hanukkah questions, in Hebrew and English', () => {
    assert.strictEqual(line('he', null, BREAK), 'במשחק ילדים יש גם שתי 🕎 שאלות חנוכה.');
    assert.strictEqual(line('he', 'hanukkah', BREAK), 'במשחק ילדים יש גם שתי 🕎 שאלות חנוכה.');
    assert.strictEqual(line('en', 'hanukkah', BREAK), 'A kids game also gets two kid-friendly 🕎 Hanukkah questions.');
    // An English game not from the Hanukkah page is offered Christmas, which has no kids' questions:
    // no season line, so #206's honest "has no" line stays for it.
    assert.strictEqual(line('en', null, BREAK), '');
    assert.strictEqual(model.seasonalPack(BREAK, 'en'), 'christmas');
});

test('out of the season there is no Hanukkah kids line', () => {
    assert.strictEqual(line('he', 'hanukkah', NOVEMBER), '');
    assert.notStrictEqual(model.kidsSeasonPack(NOVEMBER, 'en', 'hanukkah'), 'hanukkah');
});

test('the "has no" line shows only where there is no season line; the season line takes its place', () => {
    assert.match(html, /\*ngIf="kids && pack && !kidsSeasonLine">\{\{ t\.kidsNoPack \}\}/);
    assert.match(html, /<p class="kids-note kids-season" \*ngIf="kids && kidsSeasonLine">\{\{ kidsSeasonLine \}\}<\/p>/);
    assert.match(src, /return kidsSeasonPack\(Date\.now\(\), this\.locale, this\.askedPack \|\| undefined\);/);
});

test('the page sends the kids game\'s holiday, and only for a kids game', () => {
    assert.match(src, /const kidsHoliday = this\.kids \? this\.kidsHoliday : undefined;/);
    assert.match(src, /this\.apiService\.createGame\(this\.locale, this\.length, pack, this\.campaign \|\| arrivalCampaign\(\), kidsHoliday\)/);
    assert.match(api, /kidsHoliday: kidsHoliday \|\| null/);
});

test('the Hanukkah pages no longer say a kids game has no Hanukkah questions', () => {
    assert.doesNotMatch(pages, /a kids game has no Hanukkah questions/);
    assert.doesNotMatch(pages, /במשחק ילדים אין שאלות חנוכה/);
    assert.match(pages, /from 1 December those include two easy Hanukkah questions/);
    assert.match(pages, /ומ־1 בדצמבר גם שתי שאלות חנוכה קלות/);
});
