// A full lobby whose host steps away (src/app/pages/game-staging/lobby-host.ts): what guests are told,
// when they get START, and the big START for the host who comes back. The server's side is in
// functions/test/full-lobby.test.js. Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}
const root = path.join(__dirname, '..', '..');
const lobby = load(path.join(__dirname, '..', 'src', 'app', 'pages', 'game-staging', 'lobby-host.ts'));
const { lobbyHost, lobbyText, HOST_AWAY_MS, HOST_AWAY_MIN_PLAYERS, HOST_GONE_MS, startPanelDue, startPanel, hiddenTitle } = lobby;

const host = { nickname: 'Aviv', score: 0, uid: 'uid-h', pid: 'ph', host: true };
const guests = n => Array.from({ length: n }, (_, i) => ({ nickname: 'G' + i, score: 0, uid: 'uid-' + i, pid: 'p' + i }));
const room = n => [host].concat(guests(n - 1));

function guestView(n, over) {
    return lobbyHost(Object.assign({
        hasPresenter: false, isPresenter: false, creator: 'uid-h', hasHost: true,
        myUid: 'uid-0', myPid: 'p0', players: room(n), waitedMs: 0, hostAwayMs: 1000,
        // Full long ago, unless a test says when the lobby reached 5 (fullSince).
        fullMs: n >= 5 ? HOST_AWAY_MS * 10 : null,
    }, over));
}

test('the constants match the server', () => {
    const start = fs.readFileSync(path.join(root, 'functions', 'src', 'controllers', 'start.ts'), 'utf8');
    assert.match(start, /export const HOST_AWAY_MS = 45 \* 1000;/);
    assert.match(start, /export const HOST_AWAY_MIN_PLAYERS = 5;/);
    assert.strictEqual(HOST_AWAY_MS, 45 * 1000);
    assert.strictEqual(HOST_AWAY_MIN_PLAYERS, 5);
});

test('the host steps away: guests are told at once to hang on, and START stays the host\'s', () => {
    const v = guestView(9, { hostStepped: true, hostSteppedMs: 2000 });
    assert.strictEqual(v.canStart, false);
    assert.strictEqual(v.hostAway, 'Aviv');
    assert.strictEqual(lobbyText(v, 9, 'en').message, 'Aviv stepped away for a moment. Hang on, the game starts when they\'re back');
    assert.strictEqual(lobbyText(v, 9, 'he').message, 'Aviv יצא לרגע. חכו רגע, המשחק מתחיל כשיחזור');
});

test('away 45 s in a lobby of 5 or more: everyone gets START, and the line says so', () => {
    assert.strictEqual(guestView(5, { hostStepped: true, hostSteppedMs: HOST_AWAY_MS - 1 }).canStart, false);
    const v = guestView(5, { hostStepped: true, hostSteppedMs: HOST_AWAY_MS });
    assert.strictEqual(v.canStart, true);
    assert.strictEqual(v.hostAwayOpen, 'Aviv');
    assert.strictEqual(lobbyText(v, 5, 'en').message, 'Aviv stepped away. Anyone can press START');
    assert.strictEqual(lobbyText(v, 5, 'he').message, 'Aviv יצא לרגע. כל אחד יכול ללחוץ על "מתחילים"');
});

test('the 45 s count from the later of the host hiding and the lobby reaching 5', () => {
    // The host went to WhatsApp to send the link long ago; the fifth friend just came in.
    const fifthJustIn = guestView(5, { hostStepped: true, hostSteppedMs: HOST_AWAY_MS * 4, fullMs: 1000 });
    assert.strictEqual(fifthJustIn.canStart, false, 'no START the moment the room fills');
    assert.strictEqual(fifthJustIn.hostAway, 'Aviv', 'the hang-on line');
    assert.strictEqual(guestView(5, { hostStepped: true, hostSteppedMs: HOST_AWAY_MS * 4, fullMs: HOST_AWAY_MS - 1 }).canStart, false);
    assert.strictEqual(guestView(5, { hostStepped: true, hostSteppedMs: HOST_AWAY_MS * 4, fullMs: HOST_AWAY_MS }).canStart, true,
        '45 s after the fifth');
    // Full long ago, the host just hid: from the hiding, as before.
    assert.strictEqual(guestView(9, { hostStepped: true, hostSteppedMs: 1000, fullMs: HOST_AWAY_MS * 9 }).canStart, false);
    assert.strictEqual(guestView(9, { hostStepped: true, hostSteppedMs: HOST_AWAY_MS, fullMs: HOST_AWAY_MS * 9 }).canStart, true);
    // Not known when the lobby filled (no fullSince, or no clock): START stays the host's.
    assert.strictEqual(guestView(9, { hostStepped: true, hostSteppedMs: HOST_AWAY_MS * 4, fullMs: null }).canStart, false);
});

test('a lobby of 2 to 4 gets the line, never START, while the host is away (short of 5 minutes)', () => {
    for (const n of [2, 3, 4]) {
        const v = guestView(n, { hostStepped: true, hostSteppedMs: HOST_AWAY_MS * 5 });
        assert.strictEqual(v.canStart, false, `${n} players`);
        assert.match(lobbyText(v, n, 'en').message, /Hang on/);
    }
    // The 5-minute rule for a dead phone is unchanged.
    assert.strictEqual(guestView(3, { hostAwayMs: HOST_GONE_MS }).canStart, true);
});

test('an unknown clock offset shows the line but never opens START', () => {
    const v = guestView(9, { hostStepped: true, hostSteppedMs: null });
    assert.strictEqual(v.canStart, false);
    assert.strictEqual(v.hostAway, 'Aviv');
});

test('the host on screen: the line is the usual wait', () => {
    const v = guestView(9, { hostStepped: false, hostSteppedMs: null });
    assert.strictEqual(lobbyText(v, 9, 'en').message, 'Waiting for Aviv to start the game');
});

test('the host\'s own hint in a lobby of 5 or more, both languages', () => {
    const mine = lobbyHost({ hasPresenter: false, isPresenter: false, holdsHostKey: true, creator: 'uid-h', hasHost: true,
        myUid: 'uid-h', myPid: 'ph', players: room(9), waitedMs: 0 });
    assert.strictEqual(lobbyText(mine, 9, 'en').message, '9 players in. Start when you\'re ready');
    assert.strictEqual(lobbyText(mine, 9, 'he').message, '9 שחקנים בפנים. מתחילים כשמוכנים');
    assert.strictEqual(lobbyText(mine, 4, 'en').message, 'Press START when everyone is in');
    // The hint says the count, so the small count line under it is gone; under 5 it stays.
    assert.strictEqual(lobbyText(mine, 9, 'en').count, null);
    assert.strictEqual(lobbyText(mine, 9, 'he').count, null);
    assert.strictEqual(lobbyText(mine, 5, 'en').count, null);
    assert.strictEqual(lobbyText(mine, 4, 'en').count, '4 players in');
    assert.strictEqual(lobbyText(mine, 4, 'he').count, '4 שחקנים במשחק');
    // A guest in a lobby of 9 has no hint with the count: the line stays.
    assert.strictEqual(lobbyText(guestView(9, {}), 9, 'en').count, '9 players in');
});

test('the big START for the host back on screen: 5 or more in, or 2 or more joined while away', () => {
    assert.strictEqual(startPanelDue(true, false, 9, 9), true, 'a full lobby');
    assert.strictEqual(startPanelDue(true, false, 4, 2), true, 'two joined while away');
    assert.strictEqual(startPanelDue(true, false, 4, 3), false);
    assert.strictEqual(startPanelDue(false, false, 9, 1), false, 'not on a guest\'s phone');
    assert.strictEqual(startPanelDue(true, true, 1, 1), false, 'not for the lone host');
    assert.deepStrictEqual(startPanel(9, 'en'), { line: '8 friends are waiting for you', button: 'START' });
    assert.deepStrictEqual(startPanel(9, 'he'), { line: '8 חברים מחכים לך', button: 'מתחילים' });
    // One friend left (the others went): singular, in both languages.
    assert.deepStrictEqual(startPanel(2, 'en'), { line: '1 friend is waiting for you', button: 'START' });
    assert.deepStrictEqual(startPanel(2, 'he'), { line: 'חבר אחד מחכה לך', button: 'מתחילים' });
    assert.strictEqual(startPanel(3, 'en').line, '2 friends are waiting for you');
    assert.strictEqual(startPanel(3, 'he').line, '2 חברים מחכים לך');
});

test('the tab title while the host is away', () => {
    assert.strictEqual(hiddenTitle(9, 'en'), '(8) Start the game – Bullshit');
    assert.strictEqual(hiddenTitle(9, 'he'), '(8) מתחילים – בולשיט');
});

test('the final screen of a game nobody played says why, in both languages', () => {
    const { finalStrings } = load(path.join(__dirname, '..', 'src', 'app', 'pages', 'score-board-final', 'final-strings.ts'));
    assert.strictEqual(finalStrings.en.idle, 'Nobody played the first question, so the game ended.');
    assert.strictEqual(finalStrings.he.idle, 'אף אחד לא שיחק בשאלה הראשונה, אז המשחק נגמר.');
});
