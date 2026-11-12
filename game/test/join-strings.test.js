// Tests for the words of the PIN and nickname pages (src/app/pages/join-game/join-strings.ts).
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
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const page = path.join(__dirname, '..', 'src', 'app', 'pages', 'join-game');
const { joinStrings, joinLocale } = load(path.join(page, 'join-strings.ts'));

/** Every word of a language, with the functions called on sample values. */
function words(t) {
    const out = {};
    for (const key of Object.keys(t)) {
        const v = t[key];
        out[key] = typeof v !== 'function' ? v
            : key === 'error' ? [v('GAME_NOT_EXIST', 'Wrong game PIN'), v('GAME_IS_FULL', 'Sorry, game is full'), v('INTERNAL', 'boom')]
                : v('@@');
    }
    return out;
}

test('English visitors keep the English pages word for word', () => {
    const en = joinStrings('en');
    assert.strictEqual(joinStrings(undefined), en);
    assert.strictEqual(joinStrings('fr'), en);
    assert.deepStrictEqual(words(en), {
        lang: 'en',
        dir: 'ltr',
        title: 'Bullshit',
        pinHeading: 'Enter a game PIN',
        nicknameHeading: 'Enter a nickname',
        crewHeading: '@@ rematch: who are you?',
        pinPlaceholder: 'Game PIN',
        nicknamePlaceholder: 'Nickname',
        next: 'NEXT',
        join: 'JOIN',
        gameOverTitle: 'Game over',
        gameOverText: 'Game @@ has finished. Check the PIN and try again.',
        rematchText: 'Its players started a new game: @@.',
        justEnded: 'If they play again, ask for the new PIN.',
        joinRematch: 'JOIN @@',
        tryAnother: 'TRY ANOTHER PIN',
        // The server's own message, untouched.
        error: ['Wrong game PIN', 'Sorry, game is full', 'boom'],
    });
});

test('Hebrew visitors get every word in Hebrew, right to left', () => {
    const he = joinStrings('he');
    assert.strictEqual(he.lang, 'he');
    assert.strictEqual(he.dir, 'rtl');
    const all = words(he);
    for (const key of Object.keys(all)) {
        if (key === 'lang' || key === 'dir') continue;
        for (const value of [].concat(all[key])) {
            assert.ok(/[֐-׿]/.test(value), `${key} is not Hebrew: ${value}`);
            assert.ok(!/[A-Za-z]/.test(value), `${key} has Latin letters: ${value}`);
        }
    }
    // The PIN and the crew's name are shown where they belong.
    for (const key of ['crewHeading', 'gameOverText', 'rematchText', 'joinRematch']) {
        assert.ok(all[key].indexOf('@@') >= 0, key);
    }
    assert.deepStrictEqual(Object.keys(he).sort(), Object.keys(joinStrings('en')).sort());
    // A wrong PIN and a full game say which; anything else never shows the server's English.
    assert.strictEqual(new Set(all.error).size, 3);
});

test('the pages decide who is Hebrew the way the Create page does', () => {
    // No lang on the address: the browser's saved or own language, as on the Create page.
    assert.strictEqual(joinLocale('/join-game/ABCD', undefined, 'he'), 'he');
    assert.strictEqual(joinLocale('/join-game', undefined, 'en'), 'en');
    assert.strictEqual(joinLocale('/join-game', undefined, undefined), 'en');
    // lang on the address wins, either way: what the Create page sends along.
    assert.strictEqual(joinLocale('/join-game/ABCD?lang=he', 'he', 'en'), 'he');
    assert.strictEqual(joinLocale('/join-game/ABCD?lang=en', 'en', 'he'), 'en');
    assert.strictEqual(joinLocale('/join-game/ABCD', 'xx', 'en'), 'en');
    // A Hebrew invite link is Hebrew whatever the browser says.
    assert.strictEqual(joinLocale('/he/join-game/ABCD?via=link', undefined, 'en'), 'he');
    assert.strictEqual(joinLocale('/he/join-game', undefined, 'en'), 'he');
    assert.strictEqual(joinLocale('/hello', undefined, 'en'), 'en');
});

test('the Create page hands its language to the nickname page when the browser would say otherwise', () => {
    const create = fs.readFileSync(path.join(page, '..', 'create-game', 'create-game.component.ts'), 'utf8');
    assert.ok(/this\.t\.lang !== preferredLocale\(\) \? \{ lang: this\.t\.lang \} : \{\}/.test(create));
    assert.ok(create.indexOf("this.router.navigate(['/join-game', resp.pin], { queryParams: lang })") >= 0);
});

test('the pages have no fixed English words left: every word comes from the strings', () => {
    const html = fs.readFileSync(path.join(page, 'join-game.component.html'), 'utf8');
    const text = html
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\{\{[\s\S]*?\}\}/g, '')
        .replace(/<[^>]*>/g, '');
    assert.ok(!/[A-Za-z]/.test(text), `fixed words in the template: ${text.replace(/\s+/g, ' ').trim()}`);
    assert.ok(!/placeholder="/.test(html), 'a fixed placeholder is left');
    const component = fs.readFileSync(path.join(page, 'join-game.component.ts'), 'utf8');
    assert.ok(component.indexOf('this.errorMsg = err.message') < 0);
});
