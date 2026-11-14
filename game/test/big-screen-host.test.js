// Tests for the button that makes a host's computer the big screen
// (src/app/pages/game-staging/big-screen-host.ts). Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load(name) {
    const file = path.join(__dirname, '..', 'src', 'app', 'pages', 'game-staging', name);
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const { offerBigScreen, bigScreenStrings } = load('big-screen-host.ts');

const host = { isHost: true, holdsHostKey: true, isPresenter: false, hasPresenter: false, device: 'computer' };
const offer = (over) => offerBigScreen(Object.assign({}, host, over));

test('offered to the host on a computer, in a game with no big screen', () => {
    assert.strictEqual(offer({}), true);
});

test('never on a phone, to a guest, without the host key, or once there is a big screen', () => {
    assert.strictEqual(offer({ device: 'phone' }), false);
    assert.strictEqual(offer({ isHost: false }), false);
    assert.strictEqual(offer({ holdsHostKey: false }), false);
    assert.strictEqual(offer({ hasPresenter: true }), false);
    assert.strictEqual(offer({ isPresenter: true }), false);
});

test('every line is there in English and in Hebrew', () => {
    const en = bigScreenStrings('en');
    const he = bigScreenStrings('he');
    assert.deepStrictEqual(Object.keys(he).sort(), Object.keys(en).sort());
    for (const key of Object.keys(en)) {
        assert.ok(en[key] && he[key], key);
        assert.match(he[key], /[֐-׿]/, key);
        assert.doesNotMatch(en[key], /[֐-׿]/, key);
    }
    // The words name the START button as the Hebrew game shows it.
    assert.match(he.how, /"מתחילים"/);
    assert.match(en.how, /START/);
    assert.strictEqual(bigScreenStrings('fr'), en);
});

test('the page offers the button only through offerBigScreen, and keeps the host key in this browser', () => {
    const dir = path.join(__dirname, '..', 'src', 'app', 'pages', 'game-staging');
    const html = fs.readFileSync(path.join(dir, 'game-staging.component.html'), 'utf8');
    const page = fs.readFileSync(path.join(dir, 'game-staging.component.ts'), 'utf8');
    assert.match(html, /\*ngIf="bigScreenOffer"[^>]*class="big-screen-offer"/);
    assert.match(page, /this\.bigScreenOffer = offerBigScreen\(/);
    assert.match(page, /hostToBigScreen\(this\.pin\)/);
});
