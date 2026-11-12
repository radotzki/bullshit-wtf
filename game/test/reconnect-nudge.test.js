// Tests for the reconnect nudge (src/app/services/reconnect-nudge.ts): while the database client is
// disconnected and the page is visible, the game asks it every few seconds to try again at once.
// The last two tests run the database client the game ships (Firebase 3.9, its browser build) on a
// fake socket, to check what goOnline() does in it: it starts a new attempt at once when the client
// is only waiting, and leaves an attempt that is still under way alone.
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
    new Function('module', 'exports', 'require', out)(mod, mod.exports, () => ({}));
    return mod.exports;
}

const { startReconnectNudge, NUDGE_EVERY_MS } = load(path.join(__dirname, '..', 'src', 'app', 'services', 'reconnect-nudge.ts'));

/** A fake client and clock: tick(ms) runs the intervals that fall due. */
function fakes() {
    const f = {
        now: 0, timers: [], nextId: 1, listener: null, unfollowed: false, visible: true, online: 0, offline: 0,
    };
    f.deps = {
        onConnected: l => { f.listener = l; return () => { f.unfollowed = true; f.listener = null; }; },
        goOnline: () => { f.online++; },
        goOffline: () => { f.offline++; },
        isVisible: () => f.visible,
        setInterval: (fn, ms) => { const t = { id: f.nextId++, fn, ms, at: f.now + ms }; f.timers.push(t); return t.id; },
        clearInterval: id => { f.timers = f.timers.filter(t => t.id !== id); },
    };
    f.tick = ms => {
        const end = f.now + ms;
        for (;;) {
            const due = f.timers.filter(t => t.at <= end).sort((a, b) => a.at - b.at)[0];
            if (!due) break;
            f.now = due.at;
            due.at += due.ms;
            due.fn();
        }
        f.now = end;
    };
    f.connected = c => f.listener(c);
    return f;
}

test('nudges about every 3 seconds while disconnected, and stops once connected', () => {
    const f = fakes();
    startReconnectNudge(f.deps);
    assert.strictEqual(NUDGE_EVERY_MS, 3000);
    f.connected(true);
    f.tick(30000);
    assert.strictEqual(f.online, 0, 'a connected client is never nudged');

    f.connected(false);
    f.tick(2999);
    assert.strictEqual(f.online, 0, 'the first nudge comes after 3 s, not at the moment of the cut');
    f.tick(1);
    assert.strictEqual(f.online, 1);
    f.tick(40000);
    assert.strictEqual(f.online, 14, 'one nudge every 3 s through a 43 s cut');

    f.connected(true);
    f.tick(30000);
    assert.strictEqual(f.online, 14, 'no nudge once connected');
    assert.strictEqual(f.timers.length, 0, 'no timer left running');
    assert.strictEqual(f.offline, 0, 'never goOffline(): that would kill an attempt under way');
});

test('a second "disconnected" does not start a second timer', () => {
    const f = fakes();
    startReconnectNudge(f.deps);
    f.connected(false);
    f.connected(false);
    f.tick(9000);
    assert.strictEqual(f.timers.length, 1);
    assert.strictEqual(f.online, 3);
});

test('a hidden page is left to the client, and nudged again once visible', () => {
    const f = fakes();
    startReconnectNudge(f.deps);
    f.connected(false);
    f.visible = false;
    f.tick(30000);
    assert.strictEqual(f.online, 0);
    f.visible = true;
    f.tick(3000);
    assert.strictEqual(f.online, 1);
});

test('stopping clears the timer and stops following the connection', () => {
    const f = fakes();
    const stop = startReconnectNudge(f.deps);
    f.connected(false);
    stop();
    assert.strictEqual(f.timers.length, 0);
    assert.strictEqual(f.unfollowed, true);
});

// The database client the game ships, on a fake socket. `mode` says what the next sockets do:
// 'fail' closes at once (no network), 'hang' neither opens nor closes (an attempt on a slow network).
test('in the shipped client, goOnline() starts an attempt at once when the client is only waiting', async (t) => {
    const sockets = [];
    let mode = 'fail';
    class FakeSocket {
        constructor(url) {
            this.url = url;
            this.closed = false;
            sockets.push(this);
            if (mode === 'fail') setTimeout(() => this.onclose && this.onclose(), 1);
        }
        send() { }
        close() { this.closed = true; }
    }
    const realSocket = global.WebSocket;
    const realRandom = Math.random;
    global.WebSocket = FakeSocket;
    const modules = path.join(__dirname, '..', 'node_modules', 'firebase');
    const firebase = require(path.join(modules, 'app.js'));
    require(path.join(modules, 'database.js'));
    const app = firebase.initializeApp({ databaseURL: 'https://demo-nudge.firebaseio.com' }, 'nudge-test');
    const db = app.database();
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    t.after(async () => {
        global.WebSocket = realSocket;
        Math.random = realRandom;
        await app.delete();
    });

    // Let a few attempts fail. Then make the client's next wait long (0.99 of its delay, at least
    // about 1 s), wait for one more failure, so the client is now only waiting, and stop failing.
    await sleep(1500);
    assert.ok(sockets.length >= 2, `the client tried ${sockets.length} times in 1.5 s`);
    Math.random = () => 0.99;
    const before = sockets.length;
    while (sockets.length === before) await sleep(5);
    mode = 'hang';
    await sleep(100);
    const waiting = sockets.length;

    db.goOnline();
    await sleep(50);
    assert.strictEqual(sockets.length - waiting, 1, 'goOnline() opened one new socket at once');
    const underWay = sockets[sockets.length - 1];

    // That attempt is now under way (the socket neither opened nor closed). goOnline() leaves it alone.
    db.goOnline();
    db.goOnline();
    await sleep(200);
    assert.strictEqual(sockets.length - waiting, 1, 'no second socket while one attempt is under way');
    assert.strictEqual(underWay.closed, false, 'the attempt under way was not closed');

    // For contrast, the other way: goOffline() then goOnline() closes the attempt under way.
    db.goOffline();
    db.goOnline();
    await sleep(50);
    assert.strictEqual(underWay.closed, true, 'goOffline() kills the attempt under way, which is why the nudge never calls it');
});
