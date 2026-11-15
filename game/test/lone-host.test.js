// Tests for the lone-host help, a 50/50 test in the host's lobby (src/app/pages/game-staging/lone-host.ts).
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load(...parts) {
    const file = path.join(__dirname, '..', 'src', 'app', ...parts);
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const { sha256Ascii, loneHostHalf, hostDevice, loneHostHelp, loneHostStrings, bestLine,
    HELP_MAX_PLAYERS, BEST_WITH } = load('pages', 'game-staging', 'lone-host.ts');
const { lobbyHost } = load('pages', 'game-staging', 'lobby-host.ts');

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const hex = (bytes) => bytes.map(b => b.toString(16).padStart(2, '0')).join('');
const real = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

test('the page\'s own SHA-256 agrees with Node\'s, at every length around a block', () => {
    assert.strictEqual(hex(sha256Ascii('')), real(''));
    assert.strictEqual(hex(sha256Ascii('abc')), real('abc'));
    for (let n = 1; n <= 130; n++) {
        const text = 'lone-host:'.repeat(13).slice(0, n);
        assert.strictEqual(hex(sha256Ascii(text)), real(text), `length ${n}`);
    }
});

test('a lobby\'s half is the rule BigQuery can repeat: one bit of SHA-256("lone-host:" + PIN in capitals)', () => {
    for (const pin of ['ABCD', 'XKQZ', 'HELLO', 'A', 'ZZZZZZZZZZZZ', 'BSWTF']) {
        const bit = crypto.createHash('sha256').update('lone-host:' + pin, 'utf8').digest()[0] % 2 === 1;
        assert.strictEqual(loneHostHalf(pin), bit, pin);
        assert.strictEqual(loneHostHalf(pin.toLowerCase()), bit, 'a PIN typed in lower case is the same lobby');
    }
});

test('BigQuery gives the same halves', () => {
    // As BigQuery itself answered for the rule in lone-host.ts (read 2026-11-14).
    const known = { ABCD: true, XKQZ: true, HELLO: false, BSWTF: false, QQQQ: true, LMNOP: true };
    for (const pin of Object.keys(known)) {
        assert.strictEqual(loneHostHalf(pin), known[pin], pin);
    }
});

test('the halves are even, and say nothing about the staged reveal\'s half', () => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let fresh = 0;
    let both = 0;
    let staged = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
        const pin = [0, 1, 2, 3].map(k => letters[Math.floor(i / Math.pow(26, k)) % 26]).join('');
        const mine = loneHostHalf(pin);
        const theirs = crypto.createHash('sha256').update('big-reveal:' + pin, 'utf8').digest()[0] % 2 === 1;
        fresh += mine ? 1 : 0;
        staged += theirs ? 1 : 0;
        both += mine && theirs ? 1 : 0;
    }
    assert.ok(Math.abs(fresh / n - 0.5) < 0.03, `new half ${fresh} of ${n}`);
    assert.ok(Math.abs(both / staged - 0.5) < 0.04, `new half inside the staged half: ${both} of ${staged}`);
});

test('phones and tablets are phones; a computer needs a wide window', () => {
    assert.strictEqual(hostDevice(IPHONE, 390), 'phone');
    assert.strictEqual(hostDevice(ANDROID, 412), 'phone');
    assert.strictEqual(hostDevice(IPAD, 1024), 'phone');
    assert.strictEqual(hostDevice(MAC, 1440), 'computer');
    assert.strictEqual(hostDevice(WINDOWS, 1280), 'computer');
    assert.strictEqual(hostDevice(WINDOWS, 700), 'computer');
    assert.strictEqual(hostDevice(WINDOWS, 699), 'phone');
    assert.strictEqual(hostDevice('', undefined), 'phone');
    assert.strictEqual(hostDevice(null, 1280), 'computer');
});

function help(over) {
    return loneHostHelp(Object.assign({
        pin: 'ABCD', isHost: true, isPresenter: false, hasPresenter: false, playerCount: 1,
        userAgent: MAC, width: 1280, override: 'new',
    }, over));
}

test('the new half shows the help alone and with one guest, and never from the third player on', () => {
    assert.strictEqual(HELP_MAX_PLAYERS, 2);
    assert.deepStrictEqual([0, 1, 2, 3, 4, 8, 12].map(n => help({ playerCount: n }).show),
        [false, true, true, false, false, false, false]);
    assert.strictEqual(help({ playerCount: 4 }).inTest, true, 'the lobby stays in the test: its sends are still counted');
});

test('the other half never shows it, and is counted at the same moment', () => {
    assert.deepStrictEqual([1, 2, 3, 4].map(n => help({ override: 'classic', playerCount: n }).show), [false, false, false, false]);
    assert.deepStrictEqual([1, 2, 3, 4].map(n => help({ override: 'classic', playerCount: n }).due), [true, true, false, false]);
    assert.deepStrictEqual([1, 2, 3, 4].map(n => help({ playerCount: n }).due), [true, true, false, false]);
});

test('only the host\'s own page is in the test: no guest, no big screen, no lobby that has one', () => {
    for (const over of [{ isHost: false }, { isPresenter: true }, { hasPresenter: true }, { pin: '' }]) {
        const h = help(over);
        assert.deepStrictEqual([h.inTest, h.due, h.show], [false, false, false], JSON.stringify(over));
    }
});

test('what is counted names the half and the device', () => {
    assert.strictEqual(help({}).seen, 'seen-new-computer');
    assert.strictEqual(help({ userAgent: IPHONE, width: 390 }).seen, 'seen-new-phone');
    assert.strictEqual(help({ override: 'classic' }).seen, 'seen-classic-computer');
    assert.strictEqual(help({ override: 'classic', userAgent: ANDROID, width: 412 }).seen, 'seen-classic-phone');
});

test('without the tester\'s switch the half follows the PIN; any other stored value is ignored', () => {
    for (const pin of ['ABCD', 'XKQZ', 'HELLO', 'BSWTF', 'QQQQ', 'LMNOP']) {
        const want = loneHostHalf(pin) ? 'new' : 'classic';
        assert.strictEqual(help({ pin, override: null }).half, want);
        assert.strictEqual(help({ pin, override: 'yes' }).half, want);
        assert.strictEqual(help({ pin, override: undefined }).half, want);
    }
});

test('the lobby marks the host\'s own page, and only that', () => {
    const alice = { nickname: 'Alice', score: 0, uid: 'uid-alice', pid: 'p1', host: true };
    const ben = { nickname: 'Ben', score: 0, uid: 'uid-ben', pid: 'p2' };
    const base = { hasPresenter: false, isPresenter: false, creator: 'uid-alice', hasHost: true, players: [alice, ben], waitedMs: 0 };
    assert.strictEqual(lobbyHost(Object.assign({}, base, { myPid: 'p1', myUid: 'uid-alice' })).isHost, true);
    assert.strictEqual(lobbyHost(Object.assign({}, base, { holdsHostKey: true, myPid: 'p1' })).isHost, true);
    assert.ok(!lobbyHost(Object.assign({}, base, { myPid: 'p2', myUid: 'uid-ben' })).isHost);
    assert.ok(!lobbyHost(Object.assign({}, base, { isPresenter: true, holdsHostKey: true })).isHost, 'the big screen');
    // A game with no known host: anyone may start, and nobody is "the host".
    assert.ok(!lobbyHost({ hasPresenter: false, isPresenter: false, creator: null, myUid: 'uid-ben', players: [ben], waitedMs: 0 }).isHost);
    // A guest who may start because the host is gone is still a guest.
    const gone = lobbyHost(Object.assign({}, base, { myPid: 'p2', myUid: 'uid-ben', hostAwayMs: 6 * 60 * 1000 }));
    assert.strictEqual(gone.canStart, true);
    assert.ok(!gone.isHost);
});

test('the words: both languages, every line, and the number the line names', () => {
    const en = loneHostStrings('en');
    const he = loneHostStrings('he');
    assert.deepStrictEqual(Object.keys(he), Object.keys(en));
    for (const key of Object.keys(en)) {
        assert.ok(en[key] && !/[֐-׿]/.test(en[key]), `en.${key}`);
        assert.ok(/[֐-׿]/.test(he[key]), `he.${key} is Hebrew`);
    }
    assert.strictEqual(loneHostStrings('fr'), en);
    assert.strictEqual(bestLine(1, 'en'), en.best);
    assert.strictEqual(bestLine(2, 'en'), en.bestWithOne);
    assert.strictEqual(bestLine(1, 'he'), he.best);
    assert.strictEqual(bestLine(2, 'he'), he.bestWithOne);
    for (const line of [en.best, en.bestWithOne, he.best, he.bestWithOne]) {
        assert.ok(line.includes(String(BEST_WITH)), line);
    }
});
