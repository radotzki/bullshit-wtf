// A game code typed on a Hebrew keyboard (src/app/services/game-code.ts): many guests who look the
// game up to join a friend's table have a Hebrew keyboard up, and game ABCD came out as "שנבג", which
// was stripped to nothing ("Type the game PIN") on the home's code box and "Wrong PIN" on the PIN page.
// Each Hebrew letter is now read as the English letter on the same key of the standard Israeli
// keyboard, in both boxes.
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const app = path.join(__dirname, '..', 'src', 'app');

/** Transpiles a TypeScript file and loads it; `stubs` stands in for the modules named there. */
function load(file, stubs = {}) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017, experimentalDecorators: true },
    }).outputText;
    const mod = { exports: {} };
    const req = (name) => {
        if (name in stubs) {
            return stubs[name];
        }
        return name.startsWith('.') ? load(path.join(path.dirname(file), name + '.ts'), stubs) : require(name);
    };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, req);
    return mod.exports;
}

const code = load(path.join(app, 'services', 'game-code.ts'));
const door = load(path.join(app, 'pages', 'landing', 'front-door.ts'));
const { CodeBox } = load(path.join(app, 'pages', 'landing', 'code-box.ts'));

// The standard Israeli keyboard (SI-1452), key by key: what each English letter key types in Hebrew.
const ISRAELI_KEYBOARD = {
    Q: '/', W: '\'', E: 'ק', R: 'ר', T: 'א', Y: 'ט', U: 'ו', I: 'ן', O: 'ם', P: 'פ',
    A: 'ש', S: 'ד', D: 'ג', F: 'כ', G: 'ע', H: 'י', J: 'ח', K: 'ל', L: 'ך',
    Z: 'ז', X: 'ס', C: 'ב', V: 'ה', B: 'נ', N: 'מ', M: 'צ',
};
const inHebrew = (pin) => pin.split('').map(ch => ISRAELI_KEYBOARD[ch]).join('');

// The server's PIN: a counter in base 26, digits written q-z, upper-cased, padded with Q to 4
// (functions/src/controllers/new-game.ts). Checked against the source below, so a change there shows.
function generateGameName(counter) {
    let pin = counter.toString(26).replace(/\d/g, d => 'qrstuvwxyz'[d]).toUpperCase();
    while (pin.length < 4) {
        pin = `Q${pin}`;
    }
    return pin;
}

test('a PIN is capital A to Z only, as the mapping assumes', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'functions', 'src', 'controllers', 'new-game.ts'), 'utf8');
    assert.ok(source.includes(`(gameCounter).toString(26).replace(/\\d/g, d => 'qrstuvwxyz'[d]).toUpperCase()`));
    assert.ok(source.includes('gameCounter = `Q${gameCounter}`'));
    const seen = new Set();
    for (let n = 0; n < 26 * 26 * 26 * 3; n += 7) {
        generateGameName(n).split('').forEach(ch => seen.add(ch));
    }
    assert.deepStrictEqual([...seen].sort().join(''), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
});

test('every letter key of the Israeli keyboard reads as its English letter, one letter each', () => {
    const letters = Object.keys(ISRAELI_KEYBOARD);
    assert.strictEqual(letters.length, 26);
    for (const letter of letters) {
        assert.strictEqual(code.cleanCode(`${ISRAELI_KEYBOARD[letter]}ש`), `${letter}A`, letter);
    }
    // The table holds the 24 Hebrew letters on letter keys, each to a different English letter.
    const values = Object.values(code.HEBREW_KEYS);
    assert.strictEqual(values.length, 24);
    assert.strictEqual(new Set(values).size, 24);
});

test('a PIN typed in Hebrew letters finds the game: every PIN of the server, from both boxes\' cleaning', () => {
    for (let n = 0; n < 26 * 26 * 26 * 2; n += 13) {
        const pin = generateGameName(n);
        assert.strictEqual(code.cleanCode(inHebrew(pin)), pin, pin);
        assert.strictEqual(door.cleanCode(inHebrew(pin)), pin, pin);
    }
    assert.strictEqual(code.cleanCode('שנבג'), 'ABCD');
    assert.strictEqual(code.cleanCode(' שנ בג '), 'ABCD');
    assert.strictEqual(code.cleanCode('/\'קר'), 'QWER');
    // The geresh some keyboards put on W.
    assert.strictEqual(code.cleanCode('׳שנב'), 'WABC');
});

test('English codes are read as before, and a slash or an apostrophe without Hebrew is still dropped', () => {
    assert.strictEqual(code.cleanCode('abcd'), 'ABCD');
    assert.strictEqual(code.cleanCode(' AbCd '), 'ABCD');
    assert.strictEqual(code.cleanCode('ab-cd'), 'ABCD');
    assert.strictEqual(code.cleanCode('ab/cd'), 'ABCD');
    assert.strictEqual(code.cleanCode('ab\'cd'), 'ABCD');
    assert.strictEqual(code.cleanCode('1234'), null);
    assert.strictEqual(code.cleanCode(''), null);
    assert.strictEqual(code.cleanCode(null), null);
    // Half switched: the keyboard changed in the middle of the code.
    assert.strictEqual(code.cleanCode('abגב'), 'ABDC');
    // Hebrew signs on keys that carry no English letter (ת on the comma key) are dropped.
    assert.strictEqual(code.cleanCode('תשנבג'), 'ABCD');
    assert.strictEqual(code.cleanCode('ש'.repeat(30)), 'A'.repeat(12));
});

test('the home\'s code box sends a code typed in Hebrew to its game\'s join page', async () => {
    const calls = { validate: [], navigate: [] };
    const box = new CodeBox({
        validate: (pin) => { calls.validate.push(pin); return Promise.resolve({}); },
        navigate: (p, q) => { calls.navigate.push({ path: p, query: q }); return Promise.resolve(true); },
        locale: () => 'he',
        errorText: () => 'wrong',
        emptyText: () => 'empty',
    });
    box.code = 'שנבג';
    await box.submit();
    assert.deepStrictEqual(calls.validate, ['ABCD']);
    assert.deepStrictEqual(calls.navigate, [{ path: ['/he/join-game', 'ABCD'], query: { via: 'home' } }]);
    assert.strictEqual(box.error, '');
});

/** The PIN page's component with a made-up server: Angular and the services are stand-ins. */
function joinPage(answer) {
    const noop = () => () => undefined;
    const stubs = {
        '@angular/core': { Component: noop, ChangeDetectionStrategy: {} },
        '@angular/router': {},
        './../../sentry/sentry.module': { reportError: () => undefined },
        './../../services/session.service': {},
        './../../services/api.service': {},
        '../../services/join-source': { hostedHere: () => false },
        '../../services/crew.service': {},
        '../../game-model': {},
    };
    const { JoinGameComponent } = load(path.join(app, 'pages', 'join-game', 'join-game.component.ts'), stubs);
    const { joinStrings } = load(path.join(app, 'pages', 'join-game', 'join-strings.ts'));
    const sent = [];
    const api = { validateGameName: (pin) => { sent.push(pin); return answer(pin); } };
    const page = new JoinGameComponent({}, api, {}, {}, {});
    page.t = joinStrings('he');
    return { page, sent };
}

test('the PIN page takes a code typed in Hebrew, shows it in English letters, and asks for the nickname', async () => {
    const { page, sent } = joinPage(() => Promise.resolve({}));
    page.pin = 'שנבג';
    page.validateGameName();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepStrictEqual(sent, ['ABCD']);
    assert.strictEqual(page.pin, 'ABCD');
    assert.strictEqual(page.nicknameState, true);
    assert.ok(!page.errorMsg);
});

test('the PIN page still says a wrong PIN is wrong, and sends what was typed when nothing is left of it', async () => {
    const wrong = () => Promise.reject({ code: 'GAME_NOT_EXIST' });
    const a = joinPage(wrong);
    a.page.pin = 'ab-cd';
    a.page.validateGameName();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepStrictEqual(a.sent, ['ABCD']);
    assert.ok(a.page.errorMsg);
    assert.ok(!a.page.nicknameState);

    const b = joinPage(wrong);
    b.page.pin = '1234';
    b.page.validateGameName();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepStrictEqual(b.sent, ['1234']);
    assert.ok(b.page.errorMsg);
});

test('the computer home shows the facts line in parts, so a wrapped line keeps no stray dot', () => {
    const he = 'חינם · בלי אפליקציה · 2 עד 12 שחקנים, כל אחד מהטלפון שלו';
    assert.deepStrictEqual(door.factParts(he), ['חינם', 'בלי אפליקציה', '2 עד 12 שחקנים, כל אחד מהטלפון שלו']);
    assert.deepStrictEqual(door.factParts('Free'), ['Free']);
    assert.deepStrictEqual(door.factParts(''), []);
    const html = fs.readFileSync(path.join(app, 'pages', 'landing', 'desktop-landing', 'desktop-landing.component.html'), 'utf8');
    assert.ok(html.includes('<span class="fact" *ngFor="let fact of facts">{{ fact }}</span>'));
    const scss = fs.readFileSync(path.join(app, 'pages', 'landing', 'desktop-landing', 'desktop-landing.component.scss'), 'utf8');
    assert.ok(/\.facts \{[^}]*overflow: hidden/.test(scss));
});
