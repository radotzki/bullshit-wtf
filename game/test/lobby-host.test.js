// Tests for who may press START in the lobby (src/app/pages/game-staging/lobby-host.ts).
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load() {
    const file = path.join(__dirname, '..', 'src', 'app', 'pages', 'game-staging', 'lobby-host.ts');
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const { lobbyHost, lobbyText, HOST_GRACE_MS } = load();

const alice = { nickname: 'Alice', score: 0, uid: 'uid-alice' };
const ben = { nickname: 'Ben', score: 0, uid: 'uid-ben' };
const chen = { nickname: 'Chen', score: 0, uid: 'uid-chen' };
const three = [alice, ben, chen];

function view(over) {
    return lobbyHost(Object.assign({
        hasPresenter: false, isPresenter: false, creator: 'uid-alice',
        myUid: null, players: three, waitedMs: 0,
    }, over));
}

test('three phones: only the creator gets START', () => {
    const phones = three.map(p => view({ myUid: p.uid }));
    assert.deepStrictEqual(phones.map(v => v.canStart), [true, false, false]);
    assert.strictEqual(phones[1].wait, 'host');
    assert.strictEqual(phones[1].hostName, 'Alice');
});

test('others see who they wait for and how many have joined', () => {
    const t = lobbyText(view({ myUid: 'uid-ben' }), 3, 'en');
    assert.strictEqual(t.message, 'Waiting for Alice to start the game');
    assert.strictEqual(t.count, '3 players in');
    assert.strictEqual(t.rtl, false);
    const host = lobbyText(view({ myUid: 'uid-alice' }), 3, 'en');
    assert.strictEqual(host.message, 'Press START when everyone is in');
    assert.strictEqual(lobbyText(view({ myUid: 'uid-alice' }), 1, 'en').count, '1 player in');
});

test('Hebrew games get Hebrew text, right to left', () => {
    const t = lobbyText(view({ myUid: 'uid-ben' }), 3, 'he');
    assert.ok(t.message.indexOf('Alice') >= 0);
    assert.strictEqual(t.count, '3 שחקנים במשחק');
    assert.strictEqual(t.rtl, true);
});

test('with a big screen, only the big screen starts', () => {
    assert.strictEqual(view({ hasPresenter: true, isPresenter: true }).canStart, true);
    const phone = view({ hasPresenter: true, myUid: 'uid-alice' });
    assert.strictEqual(phone.canStart, false);
    assert.strictEqual(phone.wait, 'big-screen');
});

test('unknown host (old game or rules not deployed): everyone may start, as before', () => {
    assert.strictEqual(view({ creator: null, myUid: 'uid-ben' }).canStart, true);
    assert.strictEqual(view({ creator: null, myUid: null }).canStart, true);
});

test('host not in the lobby yet: wait, then let anyone start after the grace period', () => {
    const early = view({ players: [ben, chen], myUid: 'uid-ben', waitedMs: 1000 });
    assert.strictEqual(early.canStart, false);
    assert.strictEqual(early.wait, 'host-to-join');
    assert.strictEqual(lobbyText(early, 2, 'en').message, 'Waiting for the host to join');
    const late = view({ players: [ben, chen], myUid: 'uid-ben', waitedMs: HOST_GRACE_MS });
    assert.strictEqual(late.canStart, true);
});

test('a player whose sign-in failed (no uid) still waits for the host', () => {
    assert.strictEqual(view({ myUid: null }).canStart, false);
});
