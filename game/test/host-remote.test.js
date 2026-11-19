// Tests for the big-screen host's controls on their phone: the pairing link and number
// (src/app/pages/host-strings.ts) and the phone's key store (src/app/services/remote-key.ts).
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load(file, globals) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', 'window', out)(mod, mod.exports, () => ({}), globals && globals.window);
    return mod.exports;
}

const app = path.join(__dirname, '..', 'src', 'app');
const { hostStrings, remoteLink, spacedNumber } = load(path.join(app, 'pages', 'host-strings.ts'));

function fakeStorage() {
    const data = {};
    return { getItem: k => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, data };
}

test('the pairing link holds the PIN and the one-time code, and no key', () => {
    const link = remoteLink('https://bullshit.wtf', 'jvaa', 'AB2CD3EF');
    assert.strictEqual(link, 'https://bullshit.wtf/host/JVAA?c=AB2CD3EF');
    assert.ok(!/hostKey|remoteKey|key=/i.test(link));
});

test('the phone\'s number is spaced for reading across a room', () => {
    assert.strictEqual(spacedNumber('4821'), '48 21');
    assert.strictEqual(spacedNumber(''), '');
    assert.strictEqual(spacedNumber(null), '');
});

test('the pairing tells the host to type only the number on their own phone, in both languages', () => {
    assert.match(hostStrings('en').remoteSafety, /own phone/);
    assert.match(hostStrings('he').remoteSafety, /שלכם/);
    assert.match(hostStrings('en').remoteAsked('3'), /^3 phones/);
    assert.match(hostStrings('he').remoteAsked('3'), /^3 /);
    // The phone says it runs the game and is not a player.
    assert.match(hostStrings('en').phoneNotPlayer, /isn't a player/);
    assert.match(hostStrings('he').phoneNotPlayer, /לא משתתף/);
});

test('the phone keeps its remote key per game, and forgets it', () => {
    const storage = fakeStorage();
    const rk = load(path.join(app, 'services', 'remote-key.ts'), { window: { localStorage: storage } });
    assert.strictEqual(rk.remoteKeyFor('JVAA'), undefined);
    rk.rememberRemoteKey('jvaa', 'R'.repeat(24), '4821');
    assert.deepStrictEqual(rk.remoteKeyFor('JVAA'), { key: 'R'.repeat(24), digits: '4821' });
    assert.ok(storage.data.BS_REMOTE_KEYS.includes('R'.repeat(24)));
    // Not in the host keys' store: the remote is not the host.
    assert.ok(!('BS_HOST_KEYS' in storage.data));
    rk.forgetRemoteKey('JVAA');
    assert.strictEqual(rk.remoteKeyFor('JVAA'), undefined);
    for (let i = 0; i < 12; i++) {
        rk.rememberRemoteKey(`P${i}`, 'K'.repeat(24), '0000');
    }
    assert.strictEqual(Object.keys(JSON.parse(storage.data.BS_REMOTE_KEYS)).length, 10);
    assert.strictEqual(rk.remoteKeyFor('P0'), undefined);
    assert.ok(rk.remoteKeyFor('P11'));
});
