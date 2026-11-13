// Tests for when a phone's seat belongs to another sign-in (src/app/services/seat-owner.ts).
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

const services = path.join(__dirname, '..', 'src', 'app', 'services');
const { seatTaken } = load(path.join(services, 'seat-owner.ts'));

test('a seat given back by name to another browser is taken from this one', () => {
    // Two Danas on one model of phone: the second got the first one's seat while the first was offline.
    assert.strictEqual(seatTaken('uid-second-dana', 'uid-first-dana'), true);
});

test('the normal cases never count as taken', () => {
    // The same browser, reconnecting or rejoining; Replay and a crew rematch keep the seat's uid.
    assert.strictEqual(seatTaken('uid-a', 'uid-a'), false);
    // A seat that joined before sign-in finished has no uid.
    assert.strictEqual(seatTaken(undefined, 'uid-a'), false);
    assert.strictEqual(seatTaken(null, 'uid-a'), false);
    assert.strictEqual(seatTaken('', 'uid-a'), false);
    // The seat is gone from this game (a player id of another game): its uid reads as null.
    assert.strictEqual(seatTaken(null, 'uid-a'), false);
    // This page is not signed in (yet).
    assert.strictEqual(seatTaken('uid-a', undefined), false);
    assert.strictEqual(seatTaken('uid-a', null), false);
    // Anything but text is no uid.
    assert.strictEqual(seatTaken(0, 'uid-a'), false);
    assert.strictEqual(seatTaken({ uid: 'x' }, 'uid-a'), false);
});

test('the page follows the uid of its seat, and stops marking it once taken', () => {
    const api = fs.readFileSync(path.join(services, 'api.service.ts'), 'utf8');
    assert.ok(api.indexOf("child('players').child(pid).child('uid')") >= 0);
    assert.ok(/if \(stopped \|\| taken \|\| !connected \|\| !signedIn\)/.test(api));
    assert.ok(api.indexOf("owner.off('value', onOwner)") >= 0);
    // Never on the big screen: followSeat does nothing there.
    assert.ok(/!pid \|\| this\.sessionService\.presenter\) \{\s*return \(\) => \{ \};/.test(api));
});
