// Tests for the Hanukkah night link and the join page of a holiday game (from the Hanukkah night walk):
// - the link SAME TABLE TOMORROW saves, opened in a browser that didn't play, waits for the table and
//   joins it (src/app/pages/join-game), instead of "You missed it. Start your own game";
// - the nickname page of a Hanukkah game says it is one, and the WhatsApp invite text of one says so too.
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const app = path.join(__dirname, '..', 'src', 'app');

function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5, lib: ['es2016', 'dom'] },
    }).outputText;
    const mod = { exports: {} };
    const req = name => name.startsWith('.') ? load(path.join(path.dirname(file), name + '.ts')) : require(name);
    new Function('module', 'exports', 'require', out)(mod, mod.exports, req);
    return mod.exports;
}

const page = path.join(app, 'pages', 'join-game');
const k = load(path.join(app, 'components', 'hanukkah-night', 'hanukkah-night.ts'));
const { joinStrings } = load(path.join(page, 'join-strings.ts'));
const html = fs.readFileSync(path.join(page, 'join-game.component.html'), 'utf8');
const component = fs.readFileSync(path.join(page, 'join-game.component.ts'), 'utf8');

test('the link in a browser that didn\'t play: wait for the table, in both languages', () => {
    const he = k.nightStrings('he');
    assert.strictEqual(he.waitTitle, 'אותו שולחן, הערב.');
    assert.ok(he.waitText(2).startsWith('עוד אין משחק פתוח לנר 2.'));
    assert.ok(he.waitText(2).indexOf('פספסתם') < 0);
    assert.strictEqual(he.joinNow, 'להצטרף עכשיו');
    const en = k.nightStrings('en');
    assert.ok(en.waitText(3).startsWith('No game is open for night 3 yet.'));
    for (const t of [he, en]) {
        for (const key of ['waitTitle', 'playingTitle', 'playingText', 'joinNow', 'ownTable']) {
            assert.ok(typeof t[key] === 'string' && t[key].length > 0, key);
        }
    }
});

test('a browser that didn\'t play is never told it missed a Hanukkah table', () => {
    // The ask: "other" turns into the wait, or JOIN NOW while the table's game is under way.
    assert.ok(/if \(ask === 'other' && this\.hanukkahNight\) \{\s*return this\.tableNow \? 'hanukkah-playing' : 'hanukkah-wait';/.test(component));
    assert.ok(html.indexOf(`*ngIf="ask === 'hanukkah-wait'"`) > 0);
    assert.ok(html.indexOf(`*ngIf="ask === 'hanukkah-playing'"`) > 0);
    // Both come right under the night's line, above the scores, like "They're playing again".
    assert.ok(html.indexOf('recap-hanukkah-wait') < html.indexOf('class="recap-scores"'));
    assert.ok(html.indexOf('recap-hanukkah-playing') < html.indexOf('class="recap-scores"'));
    // It watches the finished game's fork, only for a browser that didn't play, and stops when it leaves.
    assert.ok(/if \(tagged && !recap\.player\) \{\s*this\.watchTable\(pin\);/.test(component));
    assert.ok(/this\.apiService\.getForkGame\(pin\)\.subscribe/.test(component));
    assert.ok(/ngOnDestroy\(\) \{\s*this\.stopTableWatch\(\);/.test(component));
    assert.ok(/private goToLobby\(rematch: string\) \{\s*this\.stopTableWatch\(\);/.test(component));
    // An open lobby comes back as the rematch: JOIN THEM, as for any game.
    assert.ok(/err\.code === 'GAME_OVER' && err\.rematch\) \{\s*this\.tableNow = null;\s*return this\.showGameOver\(err\);/.test(component));
    assert.ok(/this\.countRecap\('join-playing'\)/.test(component));
});

test('the nickname page of a holiday game says which game it is', () => {
    const he = joinStrings('he');
    const en = joinStrings('en');
    assert.strictEqual(he.packGame('hanukkah'), '🕎 משחק חנוכה');
    assert.strictEqual(en.packGame('hanukkah'), '🕎 A Hanukkah game');
    assert.strictEqual(en.packGame('christmas'), '🎄 A Christmas game');
    for (const t of [he, en]) {
        for (const none of [null, undefined, '', 'kids', 'constructor', 'toString', 7]) {
            assert.strictEqual(t.packGame(none), '', String(none));
        }
        assert.ok(t.packHow.length > 10);
    }
    assert.ok(/\*ngIf="nicknameState && !gameOver && packGame" class="pack-game"/.test(html));
    // Read on every way to the nickname box: the link, a typed PIN, and a move to another lobby.
    assert.strictEqual((component.match(/this\.loadPack\(\);/g) || []).length, 3);
});

test('a Hanukkah game\'s WhatsApp invite says Hanukkah; other games keep their text', () => {
    const share = fs.readFileSync(path.join(app, 'services', 'share.service.ts'), 'utf8');
    const strings = share.slice(share.indexOf('const strings = {'), share.indexOf('function ordinal'));
    const js = ts.transpileModule(strings.replace('const strings =', 'return'), {
        compilerOptions: { target: ts.ScriptTarget.ES5 },
    }).outputText;
    const s = new Function(js)();
    assert.strictEqual(s.he.inviteText('ABCD', 'hanukkah'),
        'בואו לשחק איתי בולשיט, משחק חנוכה! לחצו על הקישור כדי להצטרף, או הקלידו את הקוד ABCD ב-bullshit.wtf');
    assert.strictEqual(s.he.inviteText('ABCD'),
        'בואו לשחק איתי בולשיט! לחצו על הקישור כדי להצטרף, או הקלידו את הקוד ABCD ב-bullshit.wtf');
    assert.strictEqual(s.he.inviteText('ABCD', 'christmas'), s.he.inviteText('ABCD'));
    assert.ok(s.en.inviteText('ABCD', 'hanukkah').startsWith('Come play a Hanukkah game of Bullshit with me!'));
    const invite = fs.readFileSync(path.join(app, 'components', 'invite', 'invite.component.ts'), 'utf8');
    assert.strictEqual((invite.match(/this\.t\.inviteText\(this\.pinUpper, this\.pack\)/g) || []).length, 2);
    assert.ok(invite.indexOf('this.apiService.getGamePack(this.pin)') > 0);
});
