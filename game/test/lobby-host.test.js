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

const { lobbyHost, lobbyText, firstFriend, HOST_GRACE_MS } = load();

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

// Lone host: invite first, START held back behind "Start alone anyway".

test('a host alone in the lobby gets the invite-first lobby', () => {
    const v = view({ myUid: 'uid-alice', players: [alice] });
    assert.strictEqual(v.canStart, true);
    assert.strictEqual(v.alone, true);
    const t = lobbyText(v, 1, 'en');
    assert.strictEqual(t.alone, true);
    assert.strictEqual(t.message, 'Bullshit needs friends: you score by fooling them');
    assert.strictEqual(t.sub, 'Send them the link. It takes them 10 seconds to join.');
    assert.strictEqual(t.startAlone, 'Start alone anyway');
    assert.strictEqual(t.count, '1 player in');
});

test('a lone host in a Hebrew game reads it in Hebrew, right to left', () => {
    const t = lobbyText(view({ myUid: 'uid-alice', players: [alice] }), 1, 'he');
    assert.strictEqual(t.message, 'בולשיט צריך חברים: מקבלים נקודות על כל מי שעובדים עליו');
    assert.strictEqual(t.sub, 'שלחו להם את הקישור. לוקח להם 10 שניות להצטרף.');
    assert.strictEqual(t.startAlone, 'להתחיל לבד בכל זאת');
    assert.strictEqual(t.rtl, true);
});

test('only the known host on a phone gets it: not big screens, unknown hosts or full lobbies', () => {
    assert.strictEqual(view({ myUid: 'uid-alice', players: [alice, ben] }).alone, false);
    assert.strictEqual(view({ hasPresenter: true, isPresenter: true, players: [alice] }).alone, false);
    assert.strictEqual(view({ hasPresenter: true, myUid: 'uid-alice', players: [alice] }).alone, false);
    assert.strictEqual(view({ creator: null, myUid: 'uid-alice', players: [alice] }).alone, false);
    assert.strictEqual(view({ myUid: 'uid-ben', players: [alice] }).alone, false);
    assert.strictEqual(view({ myUid: 'uid-alice', players: [] }).alone, false);
    const t = lobbyText(view({ myUid: 'uid-alice', players: [alice, ben] }), 2, 'en');
    assert.strictEqual(t.alone, false);
    assert.strictEqual(t.sub, null);
});

test('the first friend in is greeted by name, then the usual line once a third joins', () => {
    const two = view({ myUid: 'uid-alice', players: [alice, ben] });
    const friend = firstFriend(two, [alice, ben], 'uid-alice', true);
    assert.strictEqual(friend, 'Ben');
    assert.strictEqual(lobbyText(two, 2, 'en', friend).message, 'Ben is in! Press START when everyone is in');
    assert.strictEqual(lobbyText(two, 2, 'he', friend).message, 'Ben בפנים! לחצו START כשכולם בפנים');
    assert.strictEqual(firstFriend(view({ myUid: 'uid-alice' }), three, 'uid-alice', true), null);
    assert.strictEqual(lobbyText(view({ myUid: 'uid-alice' }), 3, 'en', null).message, 'Press START when everyone is in');
});

test('no greeting for a host who was never alone, or for players who are not the host', () => {
    const two = view({ myUid: 'uid-alice', players: [alice, ben] });
    assert.strictEqual(firstFriend(two, [alice, ben], 'uid-alice', false), null);
    const benView = view({ myUid: 'uid-ben', players: [alice, ben] });
    assert.strictEqual(firstFriend(benView, [alice, ben], 'uid-ben', true), null);
});

test('if the friend leaves, the host is alone again and the invite comes back', () => {
    const again = view({ myUid: 'uid-alice', players: [alice] });
    assert.strictEqual(again.alone, true);
    assert.strictEqual(firstFriend(again, [alice], 'uid-alice', true), null);
    assert.strictEqual(lobbyText(again, 1, 'en', null).message, 'Bullshit needs friends: you score by fooling them');
});
