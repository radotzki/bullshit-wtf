// Tests for a lobby's own address opened by a browser with no seat (src/app/services/lobby-door.ts).
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const app = path.join(__dirname, '..', 'src', 'app');

function load(file, requireFn) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, requireFn || require);
    return mod.exports;
}

const gameGone = load(path.join(app, 'pages', 'score-board-final', 'game-gone.ts'));
const door = load(path.join(app, 'services', 'lobby-door.ts'), m => {
    if (m === '../pages/score-board-final/game-gone') {
        return gameGone;
    }
    return require(m);
});

const base = { pin: 'ABCD', hasPlayer: false, presenter: false, host: false, firstPage: true };

test('a browser with no player is looked up at the door', () => {
    assert.strictEqual(door.lobbyCheck(base), 'door');
    // Also inside the app (no in-app move reaches the lobby without a player, but it would go home today).
    assert.strictEqual(door.lobbyCheck({ ...base, firstPage: false }), 'door');
});

test('the host, the big screen and in-app moves with a player go on at once, as before', () => {
    assert.strictEqual(door.lobbyCheck({ ...base, host: true }), 'pass');
    assert.strictEqual(door.lobbyCheck({ ...base, presenter: true }), 'pass');
    assert.strictEqual(door.lobbyCheck({ ...base, host: true, hasPlayer: true }), 'pass');
    // After JOIN, Replay, a crew rematch, the big screen's own move: not the tab's first page.
    assert.strictEqual(door.lobbyCheck({ ...base, hasPlayer: true, firstPage: false }), 'pass');
});

test('a browser with a saved player opening the lobby first has its seat looked up', () => {
    assert.strictEqual(door.lobbyCheck({ ...base, hasPlayer: true }), 'seat');
});

test('a PIN that is not 4 letters is never looked up', () => {
    assert.strictEqual(door.lobbyCheck({ ...base, pin: 'ABC' }), 'pass');
    assert.strictEqual(door.lobbyCheck({ ...base, pin: 'ABCDE' }), 'pass');
    assert.strictEqual(door.lobbyCheck({ ...base, pin: '1234' }), 'pass');
    assert.strictEqual(door.lobbyCheck({ ...base, pin: undefined }), 'pass');
    assert.strictEqual(door.lobbyCheck({ ...base, pin: 'abcd' }), 'door');
});

test('only a plain player id is looked up', () => {
    assert.strictEqual(door.seatKey('-NxAbc_12'), '-NxAbc_12');
    assert.strictEqual(door.seatKey('a/b'), null);
    assert.strictEqual(door.seatKey('a.b'), null);
    assert.strictEqual(door.seatKey(''), null);
    assert.strictEqual(door.seatKey(undefined), null);
    assert.strictEqual(door.seatKey(12), null);
});

const lobby = { id: 0, timestamp: 1 };

test('an open lobby sends a browser with no seat to its join form, PIN filled in, tagged', () => {
    assert.deepStrictEqual(door.lobbyDoorRoute('abcd', { state: lobby, locale: 'en' }),
        { commands: ['/join-game', 'ABCD'], queryParams: { via: 'lobby-address' } });
    assert.deepStrictEqual(door.lobbyDoorRoute('ABCD', { state: lobby }),
        { commands: ['/join-game', 'ABCD'], queryParams: { via: 'lobby-address' } });
    // An old player who has no seat in this game.
    assert.deepStrictEqual(door.lobbyDoorRoute('ABCD', { state: lobby, locale: 'en', seated: false }),
        { commands: ['/join-game', 'ABCD'], queryParams: { via: 'lobby-address' } });
});

test('a Hebrew game sends to the Hebrew join form, as its invite link does', () => {
    assert.deepStrictEqual(door.lobbyDoorRoute('ABCD', { state: lobby, locale: 'he' }),
        { commands: ['/he/join-game', 'ABCD'], queryParams: { via: 'lobby-address' } });
});

test('a seated player, a failed read, an unknown PIN and a started game go on as before', () => {
    assert.strictEqual(door.lobbyDoorRoute('ABCD', { state: lobby, locale: 'en', seated: true }), null);
    assert.strictEqual(door.lobbyDoorRoute('ABCD', undefined), null);
    assert.strictEqual(door.lobbyDoorRoute('ABCD', { state: null }), null);
    assert.strictEqual(door.lobbyDoorRoute('ABCD', { state: 'x' }), null);
    for (const id of [1, 2, 3, 4, 5, 6]) {
        assert.strictEqual(door.lobbyDoorRoute('ABCD', { state: { id, timestamp: 1 }, locale: 'en' }), null);
    }
});

test('the join source is known to the page and to the server', () => {
    const js = load(path.join(app, 'services', 'join-source.ts'));
    assert.strictEqual(js.readVia('?via=lobby-address'), 'lobby-address');
    // Not a post's campaign tag.
    assert.strictEqual(js.readCampaign('?via=lobby-address'), null);
    const functions = fs.readFileSync(path.join(__dirname, '..', '..', 'functions', 'src', 'controllers', 'analytics.ts'), 'utf8');
    assert.ok(/export const JOIN_SOURCES = \[[^\]]*'lobby-address'[^\]]*\]/.test(functions));
    assert.strictEqual(door.LOBBY_ADDRESS_VIA, 'lobby-address');
});

test('the lobby route uses the door in place of the player check; the other game pages keep theirs', () => {
    const routing = fs.readFileSync(path.join(app, 'app-routing', 'app-routing.module.ts'), 'utf8');
    assert.match(routing, /path: 'game-staging\/:pin', component: GameStagingComponent, canActivate: \[lobbyDoor, GameService\]/);
    assert.match(routing, /path: 'round-intro\/:pin', component: RoundIntroComponent, canActivate: \[SessionService, GameService\]/);
});

test('the guard keeps today\'s player check for everyone it does not send to the join form', () => {
    const guard = fs.readFileSync(path.join(app, 'services', 'lobby-door.guard.ts'), 'utf8');
    assert.match(guard, /const asBefore = \(\) => session\.canActivate\(\);/);
    assert.match(guard, /if \(check === 'pass'\) \{\s*return asBefore\(\);/);
    assert.match(guard, /if \(!door\) \{\s*return asBefore\(\);/);
    assert.match(guard, /Promise\.race\(\[read, late\]\)/);
});

// The guard itself, with Angular's inject and the services stood in.
function guardWith({ user = null, presenter = false, host = false, navigated = false, read, readDelay = 0 }) {
    const calls = { navigate: [], reads: [], urlTree: [] };
    class ApiService { }
    class SessionService { }
    class Router { }
    const session = {
        user, presenter,
        canActivate() {
            if (this.user || this.presenter) {
                return true;
            }
            calls.navigate.push('/');
            return false;
        },
    };
    const api = {
        holdsHostKey: () => host,
        lobbyDoorRead: (pin, pid) => {
            calls.reads.push([pin, pid]);
            const r = typeof read === 'function' ? read(pin, pid) : Promise.resolve(read);
            return readDelay ? new Promise(res => setTimeout(() => res(r), readDelay)) : r;
        },
    };
    const router = {
        navigated,
        createUrlTree: (commands, extras) => {
            calls.urlTree.push({ commands, extras });
            return { tree: commands.join('/'), query: extras.queryParams };
        },
    };
    const deps = new Map([[ApiService, api], [SessionService, session], [Router, router]]);
    const mod = load(path.join(app, 'services', 'lobby-door.guard.ts'), m => {
        if (m === '@angular/core') { return { inject: t => deps.get(t) }; }
        if (m === '@angular/router') { return { Router }; }
        if (m === './api.service') { return { ApiService }; }
        if (m === './session.service') { return { SessionService }; }
        if (m === './lobby-door') { return door; }
        return require(m);
    });
    return { run: pin => mod.lobbyDoor({ params: { pin } }), calls };
}

test('guard: a first-time phone on an open lobby\'s address lands on its join form', async () => {
    const g = guardWith({ read: { state: lobby, locale: 'en' } });
    const out = await g.run('wxyz');
    assert.deepStrictEqual(out, { tree: '/join-game/WXYZ', query: { via: 'lobby-address' } });
    assert.deepStrictEqual(g.calls.reads, [['wxyz', null]]);
    assert.deepStrictEqual(g.calls.navigate, []);
});

test('guard: a first-time phone on a Hebrew lobby lands on the Hebrew join form', async () => {
    const g = guardWith({ read: { state: lobby, locale: 'he' } });
    assert.deepStrictEqual(await g.run('WXYZ'), { tree: '/he/join-game/WXYZ', query: { via: 'lobby-address' } });
});

test('guard: an unknown PIN, a started game, a failed or slow read: home, as today', async () => {
    for (const read of [{ state: null, locale: null }, { state: { id: 1 }, locale: 'en' }, () => Promise.reject(new Error('x'))]) {
        const g = guardWith({ read });
        assert.strictEqual(await g.run('WXYZ'), false);
        assert.deepStrictEqual(g.calls.navigate, ['/']);
        assert.deepStrictEqual(g.calls.urlTree, []);
    }
    const slow = guardWith({ read: { state: lobby, locale: 'en' }, readDelay: door.LOBBY_DOOR_WAIT_MS + 300 });
    assert.strictEqual(await slow.run('WXYZ'), false);
    assert.deepStrictEqual(slow.calls.navigate, ['/']);
});

test('guard: the host, the big screen and in-app moves pass at once without a read', () => {
    const me = { nickname: 'dana', pid: 'p1', uid: 'u1' };
    for (const opts of [{ user: me, host: true }, { presenter: true }, { user: me, navigated: true }]) {
        const g = guardWith({ ...opts, read: { state: lobby } });
        assert.strictEqual(g.run('WXYZ'), true);
        assert.deepStrictEqual(g.calls.reads, []);
        assert.deepStrictEqual(g.calls.navigate, []);
    }
});

test('guard: a seated player reloading the lobby stays in it; an old player with no seat goes to the join form', async () => {
    const me = { nickname: 'dana', pid: 'p1', uid: 'u1' };
    const seated = guardWith({ user: me, read: { state: lobby, locale: 'en', seated: true } });
    assert.strictEqual(await seated.run('WXYZ'), true);
    assert.deepStrictEqual(seated.calls.reads, [['WXYZ', 'p1']]);

    const old = guardWith({ user: me, read: { state: lobby, locale: 'en', seated: false } });
    assert.deepStrictEqual(await old.run('WXYZ'), { tree: '/join-game/WXYZ', query: { via: 'lobby-address' } });

    // A seat that could not be read, or an odd saved id: the lobby opens as before.
    const unread = guardWith({ user: me, read: { state: lobby, locale: 'en' } });
    assert.strictEqual(await unread.run('WXYZ'), true);
    const odd = guardWith({ user: { nickname: 'x', pid: 'a/b' }, read: { state: lobby } });
    assert.strictEqual(odd.run('WXYZ'), true);
    assert.deepStrictEqual(odd.calls.reads, []);
    // An old player on a game that has started: the lobby opens and follows the game, as today.
    const started = guardWith({ user: me, read: { state: { id: 2 }, locale: 'en', seated: false } });
    assert.strictEqual(await started.run('WXYZ'), true);
});
