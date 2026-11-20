// START A SECOND TABLE on the join page (src/app/pages/join-game/second-table.ts): what a phone refused
// at a full table is offered, the game it makes, and the tag that game carries.
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
    const req = (name) => name.startsWith('.') ? load(path.join(path.dirname(file), name + '.ts')) : require(name);
    new Function('module', 'exports', 'require', out)(mod, mod.exports, req);
    return mod.exports;
}

const page = path.join(__dirname, '..', 'src', 'app', 'pages', 'join-game');
const { readSecondTable, secondTableCampaign, secondTableWords, SECOND_TABLE_TAG } = load(path.join(page, 'second-table.ts'));

test('only a full table brings the offer', () => {
    assert.strictEqual(readSecondTable({ code: 'GAME_NOT_EXIST' }, 'en'), null);
    assert.strictEqual(readSecondTable({ code: 'GAME_OVER' }, 'he'), null);
    assert.strictEqual(readSecondTable(null, 'en'), null);
    assert.ok(readSecondTable({ code: 'GAME_IS_FULL' }, 'en'));
});

test('the second table is the full table\'s language, length and pack, as the server sends them', () => {
    const err = { code: 'GAME_IS_FULL', secondTable: { locale: 'he', count: 9, pack: 'hanukkah', campaign: 'second-table' } };
    // The page may be English (a Hebrew game joined from an English page): the game's language wins.
    assert.deepStrictEqual(readSecondTable(err, 'en'), { locale: 'he', count: 9, pack: 'hanukkah', campaign: 'second-table' });
    const xmas = { code: 'GAME_IS_FULL', secondTable: { locale: 'en', count: 5, pack: 'christmas', campaign: 'second-table' } };
    assert.deepStrictEqual(readSecondTable(xmas, 'he'), { locale: 'en', count: 5, pack: 'christmas', campaign: 'second-table' });
});

test('an older server (GAME_IS_FULL alone) still gets an offer: the page\'s language, 7 questions, tagged', () => {
    assert.deepStrictEqual(readSecondTable({ code: 'GAME_IS_FULL', message: 'Sorry, game is full' }, 'he'),
        { locale: 'he', count: 7, campaign: SECOND_TABLE_TAG });
    assert.deepStrictEqual(readSecondTable({ code: 'GAME_IS_FULL' }, 'xx'), { locale: 'en', count: 7, campaign: 'second-table' });
    // Anything odd in the answer falls back rather than reaching Create.
    const odd = { code: 'GAME_IS_FULL', secondTable: { locale: 'fr', count: 12, pack: '<b>', campaign: 'Bad Tag!' } };
    assert.deepStrictEqual(readSecondTable(odd, 'en'), { locale: 'en', count: 7, campaign: 'second-table' });
});

test('the tag: second-table, unless this tab or the full table is a play-test', () => {
    const offer = { locale: 'en', count: 7, campaign: 'second-table' };
    assert.strictEqual(secondTableCampaign(offer, null), 'second-table');
    // A post's tag on this tab does not replace it: the new game is counted as a second table.
    assert.strictEqual(secondTableCampaign(offer, 'pitch-he-zofim'), 'second-table');
    assert.strictEqual(secondTableCampaign(offer, 'test'), 'test');
    assert.strictEqual(secondTableCampaign(offer, 'test-qa-full'), 'test-qa-full');
    // The server already kept a full test table's tag.
    assert.strictEqual(secondTableCampaign({ locale: 'he', count: 7, campaign: 'test' }, null), 'test');
});

test('the words, in both languages, all present', () => {
    for (const lang of ['en', 'he']) {
        const w = secondTableWords(lang);
        for (const k of ['title', 'text', 'start', 'again', 'error']) {
            assert.ok(typeof w[k] === 'string' && w[k].length > 3, `${lang}.${k}`);
        }
    }
    assert.match(secondTableWords('he').title, /[֐-׿]/);
    assert.strictEqual(secondTableWords('en').start, 'START A SECOND TABLE');
    assert.strictEqual(secondTableWords('fr'), secondTableWords('en'));
});

test('the join page shows the offer on a refused join, and a typed PIN at a full table goes on to the name', () => {
    const ts_ = fs.readFileSync(path.join(page, 'join-game.component.ts'), 'utf8');
    const html = fs.readFileSync(path.join(page, 'join-game.component.html'), 'utf8');
    assert.match(ts_, /const full = readSecondTable\(err, this\.t\.lang\)/);
    assert.match(ts_, /err\.code === 'GAME_IS_FULL'\) \{\s*this\.nicknameState = true;/);
    assert.match(html, /\*ngIf="fullTable && !gameOver"/);
    assert.match(html, /\*ngIf="!gameOver && !fullTable"/);
    assert.match(html, /\(click\)="startSecondTable\(\)"/);
});

// ---- One second table for several refused phones (18 November: two refused phones made two tables of one) ----

test('an open second table in the offer is read, with its host; anything odd in it is dropped', () => {
    const base = { locale: 'he', count: 7, campaign: 'second-table' };
    const err = { code: 'GAME_IS_FULL', secondTable: Object.assign({ join: { pin: 'qwxz', host: '  נועה  ' } }, base) };
    assert.deepStrictEqual(readSecondTable(err, 'he').join, { pin: 'QWXZ', host: 'נועה' });
    const noHost = { code: 'GAME_IS_FULL', secondTable: Object.assign({ join: { pin: 'QWXZ' } }, base) };
    assert.deepStrictEqual(readSecondTable(noHost, 'he').join, { pin: 'QWXZ' });
    for (const join of [null, 'QWXZ', { pin: '../x' }, { pin: '' }, { pin: 12 }, { host: 'a' }]) {
        const odd = { code: 'GAME_IS_FULL', secondTable: Object.assign({ join }, base) };
        assert.strictEqual(readSecondTable(odd, 'he').join, undefined, JSON.stringify(join));
    }
    // An older server sends no join: the offer is the one before.
    assert.strictEqual(readSecondTable({ code: 'GAME_IS_FULL', secondTable: base }, 'he').join, undefined);
});

test('the join offer\'s words name the host, in both languages, and work without one', () => {
    const en = secondTableWords('en');
    assert.strictEqual(en.join('Noa'), 'JOIN NOA\'S SECOND TABLE');
    assert.strictEqual(en.join(), 'JOIN THE SECOND TABLE');
    assert.match(en.joinText('Noa'), /^Noa started a second table/);
    assert.ok(en.joinText().length > 10);
    assert.strictEqual(en.another, 'START ANOTHER TABLE');
    const he = secondTableWords('he');
    assert.strictEqual(he.join('נועה'), 'להצטרף לשולחן השני של נועה');
    assert.match(he.joinText('נועה'), /נועה/);
    assert.match(he.join(), /[֐-׿]/);
    assert.match(he.another, /[֐-׿]/);
});

test('the join page offers the open second table first, joins it with one tap, and names the full table on START', () => {
    const ts_ = fs.readFileSync(path.join(page, 'join-game.component.ts'), 'utf8');
    const html = fs.readFileSync(path.join(page, 'join-game.component.html'), 'utf8');
    assert.match(html, /\*ngIf="fullTable\.join"[\s\S]*\(click\)="joinSecondTable\(\)"[\s\S]*\(click\)="startSecondTable\(\)"/);
    assert.match(ts_, /joinSecondTable\(\) \{[\s\S]*this\.goToLobby\(open\.pin\);\s*this\.join\(\);/);
    assert.match(ts_, /createSecondTable\([^;]*secondTableCampaign\(offer, arrivalCampaign\(\)\), this\.pin\)/);
    const api = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'services', 'api.service.ts'), 'utf8');
    assert.match(api, /createSecondTable\([^)]*fullPin: string\): Promise<\{ pin: string \}> \{\s*this\.secondOf = fullPin;\s*return this\.createGame\(/);
    assert.match(api, /arrival: newGameArrival\(\),[\s\S]*?\.\.\.this\.takeSecondOf\(\),[\s\S]*?\}\);\s*rememberHostKey/);
    // createGame's own arguments don't carry it (Challenge adds an argument of its own there).
    assert.doesNotMatch(api.match(/async createGame\([^)]*\)/)[0], /secondOf/);
});
