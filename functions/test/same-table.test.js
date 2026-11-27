// "Same table tomorrow": PLAY AGAIN, SAME TABLE on a finished game's recap reopens one lobby for that
// game's link (controllers/same-table.ts). Runs the compiled functions against an in-memory database
// whose every read and write takes a few turns of the event loop, like the real one, so calls that run
// at once interleave:
//   npm run build && npm test
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');

// ---- in-memory Realtime Database, asynchronous ----
const db = {};
const clone = v => v === undefined || v === null ? null : JSON.parse(JSON.stringify(v));
function at(parts) {
    let node = db;
    for (const p of parts) {
        if (node == null || typeof node !== 'object') return null;
        node = node[p];
    }
    return node === undefined ? null : node;
}
function put(parts, value) {
    let node = db;
    parts.slice(0, -1).forEach(p => { node[p] = node[p] && typeof node[p] === 'object' ? node[p] : {}; node = node[p]; });
    const key = parts[parts.length - 1];
    const v = clone(value);
    if (v === null || (typeof v === 'object' && !Object.keys(v).length)) delete node[key]; else node[key] = v;
}
// A small fixed sequence of delays, so each run interleaves the same way.
let tickN = 0;
const lag = () => new Promise(r => setTimeout(r, [1, 3, 2, 5, 1, 4][tickN++ % 6]));
let pushId = 0;
function ref(parts) {
    return {
        child: (p) => ref(parts.concat(String(p).split('/'))),
        once: async () => { await lag(); const v = clone(at(parts)); return { val: () => v }; },
        set: async (v) => { await lag(); put(parts, v); },
        update: async (v) => { await lag(); Object.keys(v).forEach(k => put(parts.concat(k.split('/')), v[k])); },
        push: (v) => { const key = 'k' + (++pushId); if (v !== undefined) put(parts.concat(key), v); return { key }; },
        // Atomic, as in the real database; undefined aborts and leaves the value as it is.
        transaction: (fn, done) => {
            lag().then(() => {
                const v = fn(clone(at(parts)));
                if (v !== undefined) put(parts, v);
                const now = clone(at(parts));
                done(null, v !== undefined, { val: () => now });
            });
        },
        orderByChild: () => ({ equalTo: (lang) => ({ once: async () => {
            await lag();
            const v = Object.fromEntries(Object.entries(at(parts) || {}).filter(([, q]) => q.lang === lang));
            return { val: () => v };
        } }) }),
    };
}
const fakeFirebase = {
    gamesRef: ref(['games']),
    qHistoryRef: ref(['qHistory']),
    gameCounterRef: ref(['gameCounter']),
    questionsRef: ref(['questions']),
    seenQuestionsRef: ref(['seenQuestions']),
    crewsRef: ref(['crews']),
    get: (r) => r.once('value').then(s => s.val()),
};
class FakeBigQuery {
    dataset() { return { table: () => ({ insert: async () => {} }) }; }
}
const realLoad = Module._load;
Module._load = function (request) {
    if (request === '@google-cloud/bigquery') return { BigQuery: FakeBigQuery };
    if (/[\\/]firebase$/.test(request)) return fakeFirebase;
    return realLoad.apply(this, arguments);
};

const dist = path.join(__dirname, '..', 'dist', 'controllers');
const { newGame } = require(path.join(dist, 'new-game'));
const { fork } = require(path.join(dist, 'fork'));
const { join } = require(path.join(dist, 'join'));
const { sameTable, REPLAY_GRACE_MS } = require(path.join(dist, 'same-table'));
const { validateGameName } = require(path.join(dist, 'validate-game-name'));
/** The retired night-after test's half of a PIN (SHA-256('night-after:' + PIN), lowest bit of the first byte). */
const nightAfterHalf = (pin) => require('crypto').createHash('sha256').update('night-after:' + pin.toUpperCase()).digest()[0] % 2 === 1;
const crew = require(path.join(dist, 'crew'));
const oldGames = require(path.join(dist, 'old-games'));

const GameStaging = 0, RoundIntro = 1, ScoreBoardFinal = 6;
const H = 60 * 60 * 1000;
const log = console.log;
console.log = () => {};
test.after(() => { console.log = log; });

function seedQuestions() {
    db.gameCounter = db.gameCounter || 300;
    db.questions = db.questions || {};
    for (let i = 0; i < 40; i++) db.questions['q' + i] = { lang: 'en', questionText: 'x', realAnswer: 'y', fakeAnswers: [], citation: '' };
}

const KEYS = ['A', 'B', 'C', 'D', 'E'].map(c => c.repeat(24));

/** A game of four phones (u1..u4) that reached its final scoreboard `ago` ms ago; `saved`: a crew's game. */
async function finishedGame(ago, saved) {
    seedQuestions();
    const pin = await newGame('en', 5, 'u1');
    const pids = {};
    for (const n of [1, 2, 3, 4]) pids['u' + n] = (await join(pin, 'p' + n, 'u' + n)).pid;
    let id = null;
    if (saved) {
        db.games[pin].state = { id: ScoreBoardFinal, timestamp: Date.now() };
        id = (await crew.createCrew(pin, 'Friends ' + pin, 'u1')).id;
    }
    db.games[pin].state = { id: ScoreBoardFinal, timestamp: Date.now() - ago };
    db.games[pin].timestamp = Date.now() - ago - H;
    db.games[pin].totalQ = 5;
    return { pin, pids, crew: id };
}

/** Phone n of the finished game presses PLAY AGAIN, SAME TABLE. */
const again = (g, n) => sameTable(g.pin, 'u' + n, g.pids['u' + n], KEYS[n - 1]);
const staging = pin => !!(db.games[pin] && db.games[pin].state.id === GameStaging);

test('two players tap PLAY AGAIN, SAME TABLE at once the next evening: one lobby, both may start it', async () => {
    const g = await finishedGame(20 * H);
    const [a, b] = await Promise.all([again(g, 1), again(g, 3)]);
    assert.strictEqual(a.pin, b.pin, `one lobby, got ${a.pin} and ${b.pin}`);
    assert.ok(staging(a.pin));
    assert.strictEqual(a.host && b.host, true, 'both phones that pressed may start it');
    const lobby = db.games[a.pin];
    assert.strictEqual(lobby.parent, g.pin);
    assert.strictEqual(lobby.origin, 'table');
    assert.strictEqual(lobby.qids.length, 5, 'fresh questions, as many as last time');
    // The presser's seat alone; the second presser holds the lobby's key and takes a seat by the link.
    assert.deepStrictEqual(Object.keys(lobby.players), [a.hostKey ? g.pids.u3 : g.pids.u1]);
    assert.strictEqual(db.games[g.pin].fork, a.pin, 'the link sends the next tap there');
    assert.strictEqual(db.games[g.pin].forking, a.pin);
});

test('five taps at once, with no Replay before: still one lobby', async () => {
    const g = await finishedGame(26 * H);
    const pins = (await Promise.all([1, 2, 3, 4, 2].map(n => again(g, n)))).map(r => r.pin);
    assert.strictEqual(new Set(pins).size, 1, `one lobby, got ${pins.join(', ')}`);
    assert.ok(staging(pins[0]));
});

test('last night\'s Replay was played: the link opens a new lobby, and two taps at once share it', async () => {
    const g = await finishedGame(20 * H);
    const r = await fork(g.pin, 'u1', g.pids.u1, KEYS[0]);
    db.games[r.pin].state = { id: ScoreBoardFinal, timestamp: Date.now() - 19 * H };
    const [a, b] = await Promise.all([again(g, 2), again(g, 4)]);
    assert.strictEqual(a.pin, b.pin);
    assert.notStrictEqual(a.pin, r.pin, 'the played Replay traps nobody');
    assert.ok(staging(a.pin));
    assert.strictEqual(db.games[g.pin].fork, a.pin);
});

test('a lobby that started, or went stale, is replaced; an open one is reused', async () => {
    const g = await finishedGame(20 * H);
    const first = await again(g, 1);
    // Open: the next tap goes there, and a player gets its key.
    const second = await again(g, 2);
    assert.strictEqual(second.pin, first.pin);
    assert.strictEqual(second.hostKey, db.games[first.pin].hostKey);
    // Started: the next tap makes another.
    db.games[first.pin].state = { id: RoundIntro, timestamp: Date.now() };
    const third = await again(g, 3);
    assert.notStrictEqual(third.pin, first.pin);
    assert.ok(staging(third.pin));
    // Waiting for 7 hours with nobody: stale, replaced.
    const old = Date.now() - 7 * H;
    Object.assign(db.games[third.pin], { timestamp: old, state: { id: GameStaging, timestamp: old } });
    delete db.games[third.pin].hostSeen;
    const fourth = await again(g, 4);
    assert.notStrictEqual(fourth.pin, third.pin);
    assert.ok(staging(fourth.pin));
});

test('a full lobby is replaced too', async () => {
    const g = await finishedGame(20 * H);
    const first = await again(g, 1);
    for (let i = 0; i < 11; i++) db.games[first.pin].players['x' + i] = { nickname: 'x' + i, uid: 'x' + i, score: 0 };
    const next = await again(g, 2);
    assert.notStrictEqual(next.pin, first.pin);
});

test('only a player, within the recap\'s week, and only for a finished game', async () => {
    const g = await finishedGame(20 * H);
    await assert.rejects(sameTable(g.pin, 'stranger', undefined, KEYS[0]), e => e.code === 'NOT_A_PLAYER');
    const old = await finishedGame(8 * 24 * H);
    await assert.rejects(again(old, 1), e => e.code === 'NOT_A_PLAYER');
    await assert.rejects(sameTable('ZZZZ', 'u1'), e => e.code === 'GAME_NOT_EXIST');
    assert.strictEqual(db.games[g.pin].forking, undefined, 'nothing claimed');
    // A browser known by its sign-in alone (its last seat lost) is still a player.
    const r = await sameTable(g.pin, 'u2', undefined, KEYS[1]);
    assert.deepStrictEqual(Object.keys(db.games[r.pin].players), [g.pids.u2]);
});

test('the chat link: a chat member lands in the lobby; the recap beside it for every game', async () => {
    let g, h;
    do { g = await finishedGame(20 * H); } while (!nightAfterHalf(g.pin));
    do { h = await finishedGame(20 * H); } while (nightAfterHalf(h.pin));
    const a = await again(g, 1);
    const b = await again(h, 1);
    const seen = await validateGameName(g.pin, 'friend').catch(e => e);
    assert.strictEqual(seen.code, 'GAME_OVER');
    assert.strictEqual(seen.rematch, a.pin);
    assert.strictEqual(seen.nightAfter.half, 'new');
    assert.strictEqual(seen.nightAfter.player, false);
    // A game of the retired test's other half: the recap beside its rematch too.
    const control = await validateGameName(h.pin, 'friend').catch(e => e);
    assert.strictEqual(control.rematch, b.pin);
    assert.strictEqual(control.nightAfter.half, 'new');
    assert.strictEqual(control.nightAfter.player, false);
    // The friend joins the lobby with a seat of their own.
    const joined = await join(a.pin, 'friend', 'friend');
    assert.ok(db.games[a.pin].players[joined.pid]);
    // Once it started, the link no longer sends anyone there.
    db.games[a.pin].state = { id: RoundIntro, timestamp: Date.now() };
    const late = await validateGameName(g.pin, 'late').catch(e => e);
    assert.strictEqual(late.rematch, undefined);
    assert.ok(late.nightAfter, 'the recap, with START YOUR OWN GAME');
});

test('Replay from the final screen and the crew page land in the same table', async () => {
    const g = await finishedGame(20 * H, true);
    const a = await again(g, 1);
    const r = await fork(g.pin, 'u2', g.pids.u2, KEYS[1]);
    assert.strictEqual(r.pin, a.pin);
    const c = await crew.crewRematch(g.crew, 'u3', KEYS[2], true);
    assert.strictEqual(c.pin, a.pin);
});

test('a crew page lobby opened tonight is the table', async () => {
    const g = await finishedGame(20 * H, true);
    const c = await crew.crewRematch(g.crew, 'u3', KEYS[2], true);
    const [a, b] = await Promise.all([again(g, 1), again(g, 2)]);
    assert.strictEqual(a.pin, c.pin);
    assert.strictEqual(b.pin, c.pin);
    assert.strictEqual(db.games[g.pin].fork, c.pin);
});

test('a game the old-games sweep moved still reopens, with its players known', async () => {
    const g = await finishedGame(20 * H);
    assert.strictEqual(await oldGames.moveGame(g.pin, Date.now()), true);
    assert.strictEqual(db.games[g.pin].players, undefined);
    const [a, b] = await Promise.all([again(g, 1), again(g, 2)]);
    assert.strictEqual(a.pin, b.pin);
    assert.ok(staging(a.pin));
    assert.strictEqual(db.games[g.pin].players, undefined, 'nothing put back where strangers read');
});

// ---- A player who comes late (Product's review of #160, section 2) ----

test('a late player while the table plays: the recap says so, and CATCH THE NEXT ROUND opens nothing', async () => {
    const g = await finishedGame(20 * H);
    const first = await again(g, 1);
    db.games[first.pin].state = { id: RoundIntro, timestamp: Date.now() };
    // Player 4 opens the link: the recap carries tablePlaying; a stranger's doesn't, nor does it change.
    const seen = await validateGameName(g.pin, 'u4', g.pids.u4).catch(e => e);
    assert.strictEqual(seen.code, 'GAME_OVER');
    assert.strictEqual(seen.rematch, undefined);
    assert.strictEqual(seen.nightAfter.player, true);
    assert.strictEqual(seen.nightAfter.tablePlaying, true);
    const stranger = await validateGameName(g.pin, 'friend').catch(e => e);
    assert.strictEqual(stranger.nightAfter.player, false);
    assert.strictEqual(stranger.nightAfter.tablePlaying, undefined, 'non-players\' lines stay as they were');
    // CATCH THE NEXT ROUND: told the table plays; the link still points at their game.
    await assert.rejects(sameTable(g.pin, 'u4', g.pids.u4, KEYS[3], false, false, true), e => e.code === 'TABLE_PLAYING');
    assert.strictEqual(db.games[g.pin].fork, first.pin);
    assert.strictEqual(db.games[g.pin].forking, first.pin);
    // START A NEW TABLE NOW (no wait): a new lobby, as #160 does.
    const own = await again(g, 4);
    assert.notStrictEqual(own.pin, first.pin);
    assert.ok(staging(own.pin));
    assert.strictEqual(own.host, true);
});

test('a late player after the table\'s game: its Replay\'s lobby, as a guest; with none, the table opens again', async () => {
    const g = await finishedGame(20 * H);
    const first = await again(g, 1);
    db.games[first.pin].state = { id: RoundIntro, timestamp: Date.now() };
    // Their game ends, and one of them presses Replay on its final screen.
    db.games[first.pin].state = { id: ScoreBoardFinal, timestamp: Date.now() };
    const pid1 = Object.keys(db.games[first.pin].players)[0];
    const next = await fork(first.pin, 'u1', pid1, KEYS[0]);
    assert.ok(staging(next.pin));
    // The recap no longer says they play; both buttons land in that lobby, without its key.
    const seen = await validateGameName(g.pin, 'u4', g.pids.u4).catch(e => e);
    assert.strictEqual(seen.nightAfter.tablePlaying, undefined);
    const [a, b] = await Promise.all([
        sameTable(g.pin, 'u4', g.pids.u4, KEYS[3], false, false, true),
        again(g, 3),
    ]);
    assert.deepStrictEqual([a.pin, b.pin], [next.pin, next.pin]);
    assert.strictEqual(a.host, false, 'the next lobby\'s key stays with who opened it');
    assert.strictEqual(a.hostKey, undefined);
    assert.strictEqual(db.games[g.pin].fork, first.pin, 'nothing replaced');

    // Another table whose game ended with no Replay, longer ago than the grace: CATCH THE NEXT ROUND
    // opens the table again.
    const h = await finishedGame(20 * H);
    const lobby = await again(h, 1);
    db.games[lobby.pin].state = { id: ScoreBoardFinal, timestamp: Date.now() - REPLAY_GRACE_MS - 1000 };
    const reopened = await sameTable(h.pin, 'u2', h.pids.u2, KEYS[1], false, false, true);
    assert.notStrictEqual(reopened.pin, lobby.pin);
    assert.ok(staging(reopened.pin));
    assert.strictEqual(reopened.host, true);
    assert.strictEqual(db.games[h.pin].fork, reopened.pin);
});

test('wait changes nothing while the table\'s lobby is open, or when there is none', async () => {
    const g = await finishedGame(20 * H);
    const a = await sameTable(g.pin, 'u1', g.pids.u1, KEYS[0], false, false, true);
    assert.ok(staging(a.pin));
    const b = await sameTable(g.pin, 'u2', g.pids.u2, KEYS[1], false, false, true);
    assert.strictEqual(b.pin, a.pin);
    assert.strictEqual(b.hostKey, db.games[a.pin].hostKey);
});

test('a late player who taps between the table\'s final scores and its Replay: one table, not two', async () => {
    const g = await finishedGame(20 * H);
    const first = await again(g, 1);
    db.games[first.pin].state = { id: RoundIntro, timestamp: Date.now() };
    // Their game reaches its final scores; nobody has pressed Replay yet.
    db.games[first.pin].state = { id: ScoreBoardFinal, timestamp: Date.now() };
    // The page still says they play, and CATCH THE NEXT ROUND opens nothing: told to try again.
    const seen = await validateGameName(g.pin, 'u4', g.pids.u4).catch(e => e);
    assert.strictEqual(seen.nightAfter.tablePlaying, true);
    await assert.rejects(sameTable(g.pin, 'u4', g.pids.u4, KEYS[3], false, false, true), e => e.code === 'TABLE_PLAYING');
    assert.strictEqual(db.games[g.pin].forking, first.pin, 'the link still points at their game');
    assert.strictEqual(db.games[first.pin].forking, undefined, 'their Replay\'s claim untouched');

    // Replay pressed, its lobby claimed but not written yet: still TABLE_PLAYING, never a second lobby.
    db.games[first.pin].forking = 'ZZZZ';
    await assert.rejects(sameTable(g.pin, 'u4', g.pids.u4, KEYS[3], false, false, true), e => e.code === 'TABLE_PLAYING');
    delete db.games[first.pin].forking;

    // The group presses Replay: the late player's next tap joins that lobby, as a guest. One table.
    const pid1 = Object.keys(db.games[first.pin].players)[0];
    const next = await fork(first.pin, 'u1', pid1, KEYS[0]);
    assert.ok(staging(next.pin));
    const caught = await sameTable(g.pin, 'u4', g.pids.u4, KEYS[3], false, false, true);
    assert.strictEqual(caught.pin, next.pin);
    assert.strictEqual(caught.host, false);
    assert.strictEqual(db.games[g.pin].forking, first.pin, 'no lone lobby from the late player\'s taps');
    assert.strictEqual(db.games[g.pin].fork, first.pin);

    // With no Replay and the grace over, the press opens the table again, the late player hosting.
    const h = await finishedGame(20 * H);
    const lobby = await again(h, 1);
    db.games[lobby.pin].state = { id: ScoreBoardFinal, timestamp: Date.now() - REPLAY_GRACE_MS + 30 * 1000 };
    await assert.rejects(sameTable(h.pin, 'u2', h.pids.u2, KEYS[1], false, false, true), e => e.code === 'TABLE_PLAYING');
    db.games[lobby.pin].state = { id: ScoreBoardFinal, timestamp: Date.now() - REPLAY_GRACE_MS - 1000 };
    const reopened = await sameTable(h.pin, 'u2', h.pids.u2, KEYS[1], false, false, true);
    assert.notStrictEqual(reopened.pin, lobby.pin);
    assert.ok(staging(reopened.pin));
    assert.strictEqual(reopened.host, true);
    // A Replay claim that never got written doesn't hold the table past the grace either.
    const k = await finishedGame(20 * H);
    const lost = await again(k, 1);
    db.games[lost.pin].state = { id: ScoreBoardFinal, timestamp: Date.now() - REPLAY_GRACE_MS - 1000 };
    db.games[lost.pin].forking = 'YYYY';
    const after = await sameTable(k.pin, 'u2', k.pids.u2, KEYS[1], false, false, true);
    assert.ok(staging(after.pin));
    assert.strictEqual(after.host, true);
});

test('Hanukkah night: the link SAME TABLE TOMORROW saved tags the lobby it opens, and nothing else', async () => {
    const { tableCampaign } = require(path.join(dist, 'same-table'));
    assert.strictEqual(tableCampaign('hanukkah-night-4'), 'hanukkah-night-4');
    for (const bad of ['hanukkah-night-1', 'hanukkah-night-9', 'fb-he-hanukkah', 'test', 'HANUKKAH-NIGHT-3', 7, null, undefined]) {
        assert.strictEqual(tableCampaign(bad), undefined, String(bad));
    }
    const g = await finishedGame(20 * H);
    const r = await sameTable(g.pin, 'u2', g.pids.u2, KEYS[1], false, false, false, 'hanukkah-night-4');
    assert.strictEqual(db.games[r.pin].campaign, 'hanukkah-night-4');
    assert.strictEqual(db.games[r.pin].origin, 'table');
    // A second press while that lobby is open joins it, and changes no tag.
    const s = await sameTable(g.pin, 'u3', g.pids.u3, KEYS[2], false, false, false, 'hanukkah-night-5');
    assert.strictEqual(s.pin, r.pin);
    assert.strictEqual(db.games[r.pin].campaign, 'hanukkah-night-4');
    // Any other value, or a press with none, leaves the lobby untagged, as before.
    const h = await finishedGame(20 * H);
    const t = await sameTable(h.pin, 'u1', h.pids.u1, KEYS[0], false, false, false, 'fb-he-hanukkah');
    assert.strictEqual(db.games[t.pin].campaign, undefined);
});

test('Hanukkah night: a test game\'s table keeps its test tag', async () => {
    const g = await finishedGame(20 * H);
    db.games[g.pin].campaign = 'test-qa';
    const r = await sameTable(g.pin, 'u1', g.pids.u1, KEYS[0], false, false, false, 'hanukkah-night-3');
    assert.strictEqual(db.games[r.pin].campaign, 'test-qa');
});
