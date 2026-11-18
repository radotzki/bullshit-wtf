// The home page for visitors from search (src/app/pages/landing): a code box at the top ("Got a code?
// [ ____ ] Join") that takes a guest with a friend's PIN straight to the nickname, tagged
// ?via=home, and one line of facts under the pitch. Every first visit from a search engine lands on
// the home, and a third of the Hebrew phones that pressed anything were guests typing a PIN.
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const app = path.join(__dirname, '..', 'src', 'app');
const landing = path.join(app, 'pages', 'landing');

/** Transpiles a TypeScript file and loads it; relative imports of other .ts files load the same way. */
function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    const mod = { exports: {} };
    const req = (name) => name.startsWith('.') ? load(path.join(path.dirname(file), name + '.ts')) : require(name);
    new Function('module', 'exports', 'require', out)(mod, mod.exports, req);
    return mod.exports;
}

const door = load(path.join(landing, 'front-door.ts'));
const { CodeBox } = load(path.join(landing, 'code-box.ts'));
const { homeStrings } = load(path.join(landing, 'home-strings.ts'));
const { joinStrings } = load(path.join(app, 'pages', 'join-game', 'join-strings.ts'));
const read = (...p) => fs.readFileSync(path.join(landing, ...p), 'utf8');

test('a typed code keeps its letters, in capitals: lower case, spaces and dashes still find the game', () => {
    assert.strictEqual(door.cleanCode('abcd'), 'ABCD');
    assert.strictEqual(door.cleanCode(' AbCd '), 'ABCD');
    assert.strictEqual(door.cleanCode('ab-cd'), 'ABCD');
    assert.strictEqual(door.cleanCode(''), null);
    assert.strictEqual(door.cleanCode('  '), null);
    assert.strictEqual(door.cleanCode(null), null);
    assert.strictEqual(door.cleanCode('1234'), null);
    assert.strictEqual(door.cleanCode('a'.repeat(30)), 'A'.repeat(12));
});

test('the box sends a guest to the PIN\'s own join page, tagged home, under /he for the Hebrew home', () => {
    assert.deepStrictEqual(door.codeJoinRoute('ABCD', 'en'), { path: ['/join-game', 'ABCD'], query: { via: 'home' } });
    assert.deepStrictEqual(door.codeJoinRoute('ABCD', 'he'), { path: ['/he/join-game', 'ABCD'], query: { via: 'home' } });
    assert.strictEqual(door.CODE_BOX_VIA, 'home');
});

test('a wrong PIN is said under the box; a full game, a game that is over, or any other failure, goes on', () => {
    assert.strictEqual(door.codeBoxOutcome('GAME_NOT_EXIST'), 'stay');
    // A full table's join page offers a second table (join-game/second-table.ts).
    assert.strictEqual(door.codeBoxOutcome('GAME_IS_FULL'), 'go');
    assert.strictEqual(door.codeBoxOutcome('GAME_OVER'), 'go');
    assert.strictEqual(door.codeBoxOutcome(undefined), 'go');
    assert.strictEqual(door.codeBoxOutcome(null), 'go');
});

/** A code box with a made-up server and router. */
function box(locale, answer) {
    const calls = { validate: [], navigate: [] };
    const b = new CodeBox({
        validate: pin => { calls.validate.push(pin); return answer(pin); },
        navigate: (p, q) => { calls.navigate.push({ path: p, query: q }); return Promise.resolve(true); },
        locale: () => locale,
        errorText: (code, message) => joinStrings(locale).error(code, message),
        emptyText: () => homeStrings(locale).codeEmpty,
    });
    return { b, calls };
}

test('Join with the host\'s PIN in lower case: one check, then the join page on the nickname', async () => {
    const { b, calls } = box('en', () => Promise.resolve({}));
    b.code = 'xyzw';
    await b.submit();
    assert.deepStrictEqual(calls.validate, ['XYZW']);
    assert.deepStrictEqual(calls.navigate, [{ path: ['/join-game', 'XYZW'], query: { via: 'home' } }]);
    assert.strictEqual(b.error, '');
    assert.strictEqual(b.busy, false);
});

test('an empty box asks for the PIN and calls nobody', async () => {
    for (const locale of ['en', 'he']) {
        const { b, calls } = box(locale, () => Promise.resolve({}));
        b.code = ' - ';
        await b.submit();
        assert.strictEqual(b.error, homeStrings(locale).codeEmpty);
        assert.deepStrictEqual(calls, { validate: [], navigate: [] });
    }
});

test('a wrong PIN stays home with the PIN page\'s own words, in each language', async () => {
    const wrong = () => Promise.reject({ code: 'GAME_NOT_EXIST', message: 'Wrong game PIN' });
    const en = box('en', wrong);
    en.b.code = 'qqqq';
    await en.b.submit();
    assert.strictEqual(en.b.error, 'Wrong game PIN');
    assert.deepStrictEqual(en.calls.navigate, []);
    assert.strictEqual(en.b.busy, false);

    const he = box('he', wrong);
    he.b.code = 'qqqq';
    await he.b.submit();
    assert.strictEqual(he.b.error, 'קוד המשחק שגוי');

});

test('a full game opens its join page, which takes the name and offers a second table if the join is refused', async () => {
    const full = box('he', () => Promise.reject({ code: 'GAME_IS_FULL', message: 'Sorry, game is full' }));
    full.b.code = 'abcd';
    await full.b.submit();
    assert.strictEqual(full.b.error, '');
    assert.deepStrictEqual(full.calls.navigate, [{ path: ['/he/join-game', 'ABCD'], query: { via: 'home' } }]);
});

test('a game that is over, or a check that failed, still opens the join page (which says so, or tries again)', async () => {
    const over = box('he', () => Promise.reject({ code: 'GAME_OVER', rematch: 'ABCE' }));
    over.b.code = 'abcd';
    await over.b.submit();
    assert.deepStrictEqual(over.calls.navigate, [{ path: ['/he/join-game', 'ABCD'], query: { via: 'home' } }]);
    const down = box('en', () => Promise.reject(new Error('network')));
    down.b.code = 'abcd';
    await down.b.submit();
    assert.strictEqual(down.calls.navigate.length, 1);
    assert.strictEqual(down.b.error, '');
});

test('a second press while the check is on its way does nothing', async () => {
    let release;
    const { b, calls } = box('en', () => new Promise(r => { release = r; }));
    b.code = 'abcd';
    const first = b.submit();
    assert.strictEqual(b.busy, true);
    await b.submit();
    assert.strictEqual(calls.validate.length, 1);
    release({});
    await first;
    assert.strictEqual(calls.navigate.length, 1);
    assert.strictEqual(b.busy, false);
});

test('the words of the box and the facts line, in English and in Hebrew', () => {
    const en = homeStrings('en');
    const he = homeStrings('he');
    const plain = s => s.replace(/ /g, ' ');
    assert.strictEqual(plain(en.facts), 'Free · no app · 2 to 12 players, each on their own phone');
    assert.strictEqual(plain(he.facts), 'חינם · בלי אפליקציה · 2 עד 12 שחקנים, כל אחד מהטלפון שלו');
    // "2 to 12 players" never breaks across lines.
    assert.ok(en.facts.includes('2 to 12 players'));
    assert.ok(he.facts.includes('2 עד 12 שחקנים'));
    assert.strictEqual(en.codeAsk, 'Got a code?');
    assert.strictEqual(he.codeAsk, 'יש לכם קוד?');
    for (const t of [en, he]) {
        for (const key of ['facts', 'codeAsk', 'codePlaceholder', 'codeJoin', 'codeEmpty']) {
            assert.ok(t[key] && t[key].length > 0, `${t.lang}.${key}`);
        }
    }
    // Short: the facts line fits one line of a 360 px phone in both languages (checked on screen too).
    assert.ok(plain(en.facts).length <= 60 && plain(he.facts).length <= 60);
});

test('both homes put the box above the pitch and the facts line right under it', () => {
    for (const file of [['mobile-landing', 'mobile-landing.component.html'], ['desktop-landing', 'desktop-landing.component.html']]) {
        const html = read(...file);
        const boxAt = html.indexOf('<form class="code-box"');
        const pitchAt = html.indexOf('<p class="pitch">{{ t.pitch }}</p>');
        const factsAt = html.indexOf('<p class="facts"');
        assert.ok(boxAt > 0 && boxAt < pitchAt && pitchAt < factsAt, file[1]);
        assert.ok(html.includes('(ngSubmit)="box.submit()"'), file[1]);
        assert.ok(html.includes('[(ngModel)]="box.code"'), file[1]);
        assert.ok(html.includes('[disabled]="box.busy"'), file[1]);
    }
    // On the phone the box comes before the menu, and Create still leads it for a visitor with no PIN.
    const phone = read('mobile-landing', 'mobile-landing.component.html');
    assert.ok(phone.indexOf('<form class="code-box"') < phone.indexOf('first === \'create\' ? create : join'));
});

test('a join from the box is counted as "home", and ?via=home is never taken for a post\'s tag', () => {
    const source = fs.readFileSync(path.join(app, 'services', 'join-source.ts'), 'utf8');
    assert.ok(/const known = \[[^\]]*'home'[^\]]*\]/.test(source));
    const functions = fs.readFileSync(path.join(__dirname, '..', '..', 'functions', 'src', 'controllers', 'analytics.ts'), 'utf8');
    assert.ok(/export const JOIN_SOURCES = \[[^\]]*'home'[^\]]*\]/.test(functions));
    try {
        const store = {};
        global.window = {
            location: { search: '', pathname: '/' },
            localStorage: { getItem: () => null, setItem: () => { } },
            sessionStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
        };
        const js = load(path.join(app, 'services', 'join-source.ts'));
        assert.strictEqual(js.readVia('?via=home'), 'home');
        assert.strictEqual(js.readCampaign('?via=home'), null);
        // The join page reads via=home from its own address: typed in the box, not a link.
        assert.strictEqual(js.takeJoinSource('ABCD', 'home', true), 'home');
        // The host's own phone stays "host" even if it came through the box.
        store.BS_HOSTED_PIN = 'ABCD';
        assert.strictEqual(js.takeJoinSource('abcd', 'home', true), 'host');
    } finally {
        delete global.window;
    }
});
