// The client's join-source logic (game/src/app/services/join-source.ts), compiled on the
// fly with this package's TypeScript and run against a fake window and sessionStorage.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'src', 'app', 'services', 'join-source.ts'), 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;

function load(search, storageBlocked = false, pathname = '/', local = {}) {
    const store = {};
    const sessionStorage = {
        getItem: k => k in store ? store[k] : null,
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; },
    };
    const localStorage = {
        getItem: k => k in local ? local[k] : null,
        setItem: (k, v) => { local[k] = String(v); },
    };
    const window = { location: { search, pathname }, localStorage };
    Object.defineProperty(window, 'sessionStorage', { get() { if (storageBlocked) throw new Error('blocked'); return sessionStorage; } });
    const module = { exports: {} };
    new Function('exports', 'module', 'window', js)(module.exports, module, window);
    module.exports.rememberArrivalSource();
    return module.exports;
}

test('the tag on the join link wins', () => {
    assert.strictEqual(load('?via=qr').takeJoinSource('ABCD', 'qr', true), 'qr');
    assert.strictEqual(load('?x=1&via=LINK').takeJoinSource('ABCD', undefined, true), 'link');
});

test('no tag: a PIN in the address is a link, a typed PIN is pin', () => {
    assert.strictEqual(load('').takeJoinSource('ABCD', undefined, true), 'link');
    assert.strictEqual(load('').takeJoinSource(undefined, undefined, false), 'pin');
});

test('a tag on the home page (results card) carries to the next join, once', () => {
    const m = load('?via=results');
    assert.strictEqual(m.takeJoinSource('ABCD', undefined, false), 'results');
    assert.strictEqual(m.takeJoinSource('EFGH', undefined, false), 'pin');
});

test('the creating browser joins its own game as host, once, and only that game', () => {
    let m = load('');
    m.markHosted('abcd');
    assert.strictEqual(m.takeJoinSource('ABCD', undefined, true), 'host');
    assert.strictEqual(m.takeJoinSource('ABCD', undefined, true), 'link');
    m = load('');
    m.markHosted('ABCD');
    assert.strictEqual(m.takeJoinSource('WXYZ', undefined, true), 'link');
});

test('unknown tags become other; blocked storage still works', () => {
    assert.strictEqual(load('?via=spam').takeJoinSource('ABCD', undefined, true), 'other');
    assert.strictEqual(load('?via=qr', true).takeJoinSource('ABCD', 'qr', true), 'qr');
});

test('a post tag is kept as the campaign for a game this tab creates; join sources are not campaigns', () => {
    assert.strictEqual(load('?via=fb-he-hanukkah').arrivalCampaign(), 'fb-he-hanukkah');
    assert.strictEqual(load('?via=WA-HE').arrivalCampaign(), 'wa-he');
    assert.strictEqual(load('?via=qr').arrivalCampaign(), null);
    assert.strictEqual(load('?via=<script>').arrivalCampaign(), null);
    assert.strictEqual(load('').arrivalCampaign(), null);
});

test('arriving on a Hebrew address makes Hebrew the default for new games', () => {
    const local = {};
    load('', false, '/he/join-game', local);
    assert.strictEqual(load('', false, '/m', local).preferredLocale(), 'he');
    assert.strictEqual(load('?lang=en', false, '/create-game', local).preferredLocale(), 'en');
    assert.strictEqual(load('?lang=he', false, '/create-game', {}).preferredLocale(), 'he');
    assert.strictEqual(load('', false, '/hello', {}).preferredLocale(), 'en');
});
