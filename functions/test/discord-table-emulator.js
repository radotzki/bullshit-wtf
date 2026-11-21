// One game per Discord call, on the Realtime Database emulator, with the real database rules and the
// real firebase-admin (the server's access is the rules' bl-service-worker): eight phones at once get
// one game, a phone on the final scoreboard stays with the group, a rematch moves the call, and phones can neither read nor write discord/.
// Start the emulator first, then run it:
//   firebase emulators:start --only database --project demo-bullshit
//   npm run build && node test/discord-table-emulator.js
const assert = require('node:assert');
const path = require('path');
const { rest, owner, server, phone, signedIn, loadRules } = require('./emulator');

async function main() {
    await loadRules();
    await rest('DELETE', '', undefined, owner);
    const questions = {};
    for (let i = 0; i < 30; i++) {
        questions['q' + i] = { lang: 'en', questionText: 'x', realAnswer: 'y', fakeAnswers: [], citation: '' };
    }
    await rest('PUT', 'questions', questions, owner);
    await rest('PUT', 'gameCounter', 500, owner);

    const dist = path.join(__dirname, '..', 'dist', 'controllers');
    const { discordTable } = require(path.join(dist, 'discord-table'));
    const { join } = require(path.join(dist, 'join'));
    const { fork } = require(path.join(dist, 'fork'));
    const log = console.log;
    console.log = () => {};

    const id = 'i-1311111111111111111-gc-912952092627435520-912954213460467732';
    const results = await Promise.all([1, 2, 3, 4, 5, 6, 7, 8].map(i => discordTable(id, 'en', { uid: 'u' + i })));
    const pins = [...new Set(results.map(r => r.pin))];
    assert.strictEqual(pins.length, 1, `one game for the call, got ${pins.join(', ')}`);
    assert.strictEqual(results.filter(r => r.created).length, 1, 'made once');
    const games = (await rest('GET', 'games', undefined, owner)).json || {};
    assert.deepStrictEqual(Object.keys(games), pins, 'no second game written');
    assert.strictEqual(games[pins[0]].campaign, 'discord-activity');

    // The rules: the server reads and writes discord/, a phone does neither.
    assert.strictEqual((await rest('GET', `discord/${id}`, undefined, server)).json.pin, pins[0]);
    assert.strictEqual((await rest('GET', `discord/${id}`, undefined, phone)).status, 401);
    assert.strictEqual((await rest('GET', `discord/${id}`, undefined, signedIn('u1'))).status, 401);
    assert.strictEqual((await rest('PUT', `discord/${id}`, { pin: 'AAAA', time: 1 }, signedIn('u1'))).status, 401);
    assert.strictEqual((await rest('GET', 'discord', undefined, signedIn('u1'))).status, 401);

    // A phone opening on the final scoreboard, before REMATCH, stays with the group (no new game).
    const pid = (await join(pins[0], 'p1', 'u1')).pid;
    await rest('PUT', `games/${pins[0]}/state`, { id: 6, timestamp: Date.now() }, owner);
    const late = await discordTable(id, 'en', { uid: 'u9' });
    assert.deepStrictEqual(late, { pin: pins[0], created: false, ended: true });
    assert.strictEqual(Object.keys((await rest('GET', 'games', undefined, owner)).json).length, 1, 'no game made on the scoreboard');

    // REMATCH: the call follows the finished game's fork.
    const rematch = await fork(pins[0], 'u1', pid);
    const after = await Promise.all([1, 2, 3].map(() => discordTable(id, 'en')));
    after.forEach(r => assert.deepStrictEqual(r, { pin: rematch.pin, created: false }));
    assert.strictEqual((await rest('GET', `discord/${id}/pin`, undefined, owner)).json, rematch.pin);

    // The rematch ended over 30 minutes ago with no rematch of its own: six phones at once get one new game.
    await rest('PUT', `games/${rematch.pin}/state`, { id: 6, timestamp: Date.now() - 31 * 60 * 1000 }, owner);
    const fresh = await Promise.all([1, 2, 3, 4, 5, 6].map(i => discordTable(id, 'en', { uid: 'u' + i })));
    const next = [...new Set(fresh.map(r => r.pin))];
    assert.strictEqual(next.length, 1, `one new game, got ${next.join(', ')}`);
    assert.ok(next[0] !== pins[0] && next[0] !== rematch.pin);
    assert.strictEqual(fresh.filter(r => r.created).length, 1);
    assert.strictEqual(Object.keys((await rest('GET', 'games', undefined, owner)).json).length, 3, 'three games in all');

    console.log = log;
    console.log(`discord-table on the emulator: one game ${pins[0]} for 8 phones, rematch ${rematch.pin} followed, ` +
        `then one new game ${next[0]} for 6 phones, rules hold`);
    process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
