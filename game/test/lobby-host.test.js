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

const { lobbyHost, lobbyText, firstFriend, HOST_GRACE_MS, HOST_GONE_MS, HOST_PING_MS } = load();

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

test('with a big screen, the host still starts a hosted game; the big screen waits for them', () => {
    const big = view({ hasPresenter: true, isPresenter: true });
    assert.strictEqual(big.canStart, false);
    assert.strictEqual(big.wait, 'host');
    assert.strictEqual(big.hostName, 'Alice');
    assert.strictEqual(lobbyText(big, 3, 'en').message, 'Waiting for Alice to start the game');
    const host = view({ hasPresenter: true, myUid: 'uid-alice' });
    assert.strictEqual(host.canStart, true);
    const guest = view({ hasPresenter: true, myUid: 'uid-ben' });
    assert.strictEqual(guest.canStart, false);
    assert.strictEqual(guest.wait, 'host');
});

test('a guest who opens the present page does not get START in a hosted game', () => {
    const marked = [Object.assign({ pid: 'p1', host: true }, alice), Object.assign({ pid: 'p2' }, ben)];
    // The guest's browser on the present page: no host key, not the host.
    const fake = view({ creator: null, hasHost: true, hasPresenter: true, isPresenter: true, players: marked });
    assert.strictEqual(fake.canStart, false);
    assert.strictEqual(fake.wait, 'host');
    // Before the host joins: wait for them, then the 90 s rule, as on phones.
    const early = view({ creator: null, hasHost: true, hasPresenter: true, isPresenter: true, players: [ben], waitedMs: 1000 });
    assert.strictEqual(early.canStart, false);
    assert.strictEqual(early.wait, 'host-to-join');
    const late = view({ creator: null, hasHost: true, hasPresenter: true, isPresenter: true, players: [ben], waitedMs: HOST_GRACE_MS });
    assert.strictEqual(late.canStart, true);
});

test('a big screen opened in the browser that made the game holds its key and starts it', () => {
    const big = view({ creator: null, hasHost: true, hasPresenter: true, isPresenter: true, holdsHostKey: true, players: [ben] });
    assert.strictEqual(big.canStart, true);
    assert.strictEqual(big.alone, false);
});

test('with a big screen and no known host, the big screen starts, as before', () => {
    assert.strictEqual(view({ creator: null, hasPresenter: true, isPresenter: true }).canStart, true);
    const phone = view({ creator: null, hasPresenter: true, myUid: 'uid-alice' });
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

// ---- Host marked by host key: the creating phone's sign-in failed, so it has no uid ----

const keyHost = { nickname: 'Alice', score: 0, uid: 0, host: true, pid: 'p-alice' };
const benNoUid = { nickname: 'Ben', score: 0, uid: 0, pid: 'p-ben' };
const chenRow = { nickname: 'Chen', score: 0, uid: 'uid-chen', pid: 'p-chen' };

function keyView(over) {
    return lobbyHost(Object.assign({
        hasPresenter: false, isPresenter: false, creator: null, hasHost: true,
        myUid: null, myPid: null, players: [keyHost], waitedMs: 0,
    }, over));
}

test('sign-in failed: the host alone still gets the invite-first lobby', () => {
    const v = keyView({ myPid: 'p-alice' });
    assert.strictEqual(v.canStart, true);
    assert.strictEqual(v.alone, true);
    assert.strictEqual(lobbyText(v, 1, 'en').message, 'Bullshit needs friends: you score by fooling them');
});

test('sign-in failed: friends, with or without a uid, wait for the host by name', () => {
    const players = [keyHost, benNoUid, chenRow];
    const ben = keyView({ myPid: 'p-ben', players });
    const chen = keyView({ myPid: 'p-chen', myUid: 'uid-chen', players });
    const host = keyView({ myPid: 'p-alice', players });
    assert.deepStrictEqual([host.canStart, ben.canStart, chen.canStart], [true, false, false]);
    assert.strictEqual(ben.wait, 'host');
    assert.strictEqual(ben.hostName, 'Alice');
    assert.strictEqual(lobbyText(chen, 3, 'en').message, 'Waiting for Alice to start the game');
});

test('a host key game whose host has not joined yet: wait, then anyone after the grace period', () => {
    const early = keyView({ myPid: 'p-ben', players: [benNoUid] });
    assert.strictEqual(early.canStart, false);
    assert.strictEqual(early.wait, 'host-to-join');
    assert.strictEqual(keyView({ myPid: 'p-ben', players: [benNoUid], waitedMs: HOST_GRACE_MS }).canStart, true);
});

test('the marked host row wins over the creator uid (Replay pressed by a phone without a uid)', () => {
    const replayer = { nickname: 'Ben', score: 0, uid: 0, host: true, pid: 'p-ben' };
    const alice2 = { nickname: 'Alice', score: 0, uid: 'uid-alice', pid: 'p-alice' };
    const players = [alice2, replayer];
    const asAlice = keyView({ creator: 'uid-alice', myUid: 'uid-alice', myPid: 'p-alice', players });
    const asBen = keyView({ creator: 'uid-alice', myPid: 'p-ben', players });
    assert.strictEqual(asAlice.canStart, false);
    assert.strictEqual(asAlice.hostName, 'Ben');
    assert.strictEqual(asBen.canStart, true);
});

test('a host with a uid and a host key: the same answer as before', () => {
    const hostRow = { nickname: 'Alice', score: 0, uid: 'uid-alice', host: true, pid: 'p-alice' };
    const v = keyView({ creator: 'uid-alice', myUid: 'uid-alice', myPid: 'p-alice', players: [hostRow] });
    assert.strictEqual(v.alone, true);
    // An old phone that never learned its player id still finds itself by uid... only without a marked row.
    const old = lobbyHost({ hasPresenter: false, isPresenter: false, creator: 'uid-alice', myUid: 'uid-alice',
        players: [{ nickname: 'Alice', score: 0, uid: 'uid-alice' }], waitedMs: 0 });
    assert.strictEqual(old.alone, true);
});

test('sign-in failed: the first friend is greeted by name, not the host itself', () => {
    const players = [keyHost, benNoUid];
    const v = keyView({ myPid: 'p-alice', players });
    assert.strictEqual(v.alone, false);
    assert.strictEqual(firstFriend(v, players, null, true, 'p-alice'), 'Ben');
    assert.strictEqual(lobbyText(v, 2, 'en', 'Ben').message, 'Ben is in! Press START when everyone is in');
});

test('a game with neither creator nor host key is still open to all', () => {
    const v = keyView({ hasHost: false, players: [benNoUid], myPid: 'p-ben' });
    assert.strictEqual(v.canStart, true);
    assert.strictEqual(v.alone, false);
});

// ---- A joined host whose phone died ----
const marked = [Object.assign({ pid: 'pa', host: true }, alice), Object.assign({ pid: 'pb' }, ben), Object.assign({ pid: 'pc' }, chen)];

test('a guest waits for a joined host who reported in recently', () => {
    const v = view({ creator: null, hasHost: true, players: marked, myPid: 'pb', hostAwayMs: HOST_GONE_MS - 1 });
    assert.strictEqual(v.canStart, false);
    assert.strictEqual(v.wait, 'host');
    assert.strictEqual(v.hostGone, undefined);
});

test('once the joined host has been gone HOST_GONE_MS (5 minutes), anyone may start, and the lobby says why', () => {
    const v = view({ creator: null, hasHost: true, players: marked, myPid: 'pb', hostAwayMs: HOST_GONE_MS });
    assert.strictEqual(v.canStart, true);
    assert.strictEqual(v.hostGone, 'Alice');
    assert.strictEqual(lobbyText(v, 3, 'en').message, 'Alice seems to be gone. Anyone can press START');
    const he = lobbyText(v, 3, 'he');
    assert.ok(he.message.indexOf('Alice') >= 0 && he.message.indexOf('START') >= 0);
    assert.strictEqual(he.rtl, true);
    // The big screen too.
    const big = view({ creator: null, hasHost: true, hasPresenter: true, isPresenter: true, players: marked, hostAwayMs: HOST_GONE_MS * 3 });
    assert.strictEqual(big.canStart, true);
});

test('no host clock (older games, or rules not deployed yet): guests keep waiting for the host', () => {
    for (const hostAwayMs of [null, undefined]) {
        const v = view({ creator: null, hasHost: true, players: marked, myPid: 'pb', hostAwayMs, waitedMs: HOST_GRACE_MS * 10 });
        assert.strictEqual(v.canStart, false);
        assert.strictEqual(v.wait, 'host');
    }
});

test('the host itself is never told it is gone', () => {
    const v = view({ creator: null, hasHost: true, players: marked, myPid: 'pa', hostAwayMs: HOST_GONE_MS * 3 });
    assert.strictEqual(v.canStart, true);
    assert.ok(!v.hostGone);
});

test('the host reports in several times within the gone time', () => {
    assert.ok(HOST_GONE_MS / HOST_PING_MS >= 4);
});

test('the host-gone wait is 5 minutes, so a host inviting friends in WhatsApp keeps their game', () => {
    assert.strictEqual(HOST_GONE_MS, 5 * 60 * 1000);
});
