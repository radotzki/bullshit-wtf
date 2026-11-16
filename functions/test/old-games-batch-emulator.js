#!/usr/bin/env node
// Local run: how long one catch-up sweep of old games takes (CATCHUP_BATCH, 1,000 games), on the Firebase
// emulators with the repository's own rules, and whether a player's call waits longer while it runs.
// Not part of npm test: it needs Java. It doesn't need the built game.
//
// 1. 1,200 games that ended 29 hours ago (the same 3-player game the emulator check plays) and a live game
//    are written, with the sweep held, so the writes themselves don't start it.
// 2. A player's PIN check (validateGameName), ten times with nothing else running.
// 3. The sweep is let go and the live game's phase changes, which runs it from the gameState trigger.
//    The PIN check is asked again, over and over, while it runs.
// 4. The sweep's own log line gives how long its walk took; the cursor shows how far it got.
//   node functions/test/old-games-batch-emulator.js

'use strict';

const fs = require('fs');
const path = require('path');
const { startEmulators, stopEmulators, db, call, game, log, sleep, H, PROJECT, DB, ROOT } = require('./old-games-emulator');

const OLD = Number(process.env.OLD_GAMES) || 1200;
const pin = (c) => c.toString(26).replace(/\d/g, d => 'qrstuvwxyz'[d]).toUpperCase().padStart(4, 'Q');

async function timed(fn) {
    const t = Date.now();
    await fn();
    return Date.now() - t;
}
const runs = (text) => {
    const out = {};
    (text.match(/Beginning execution of "[\w-]+"/g) || []).forEach(m => { const f = m.split('-').pop().replace('"', ''); out[f] = (out[f] || 0) + 1; });
    return out;
};
const median = (a) => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

async function main() {
    let emulators;
    let ok = false;
    try {
        emulators = await startEmulators();
        const rules = await fetch(`http://${DB}/.settings/rules.json?ns=${PROJECT}`, {
            method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: fs.readFileSync(path.join(ROOT, 'database-rules.json'), 'utf8'),
        });
        if (!rules.ok) throw new Error(`could not load the database rules: ${rules.status}`);
        const now = Date.now();
        // Held: a lease far ahead, so the trigger runs that the seeding writes start find the sweep busy.
        await db('PUT', 'qHistory/gameSweep', { next: 1, lease: now + 60 * 60 * 1000, at: now });
        // Brought up to the 2.3 KB the Analyst measured for a played 3-player, 5-question game, with the
        // parts today's code writes during a game (advanceTaken, aboutQs).
        const fill = { advanceTaken: {}, aboutQs: {} };
        for (let i = 0; i < 20; i++) fill.advanceTaken[`r${i}`] = { at: now - 30 * H + i * 1000, by: 'p1', phase: i % 6 };
        for (let i = 0; i < 2; i++) fill.aboutQs[i] = { about: 'p2', text: `What did Yossi do last summer, number ${i}? ___`, truth: 'went to the beach' };
        const games = {};
        for (let c = 1; c <= OLD; c++) games[pin(c)] = game(6, now - 29 * H, now - 30 * H, fill);
        const live = pin(OLD + 1);
        games[live] = game(3, now - 5000, now - 10 * 60 * 1000, { serverStart: true });
        log(`writing ${OLD} old games, ${JSON.stringify(games[pin(1)]).length} bytes each`);
        // Written with triggers off: 1,200 games' worth of trigger runs is more than a test machine holds.
        const seeded = await fetch(`http://${DB}/games.json?ns=${PROJECT}&disableTriggers=true`, {
            method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: JSON.stringify(games),
        });
        if (!seeded.ok) throw new Error(`could not write the games: ${seeded.status} ${await seeded.text()}`);
        await db('PUT', 'gameCounter', OLD + 1);
        await sleep(5000);

        const idle = [];
        for (let i = 0; i < 10; i++) idle.push(await timed(() => call('validateGameName', { pin: live.toLowerCase() })));
        log(`PIN check, nothing else running: median ${median(idle)} ms, ${JSON.stringify(idle)}`);

        const logFile = emulators.logFile;
        const before = fs.readFileSync(logFile, 'utf8').length;
        await db('PUT', 'qHistory/gameSweep', { next: 1, lease: 0, at: 0 });
        await db('PUT', `games/${live}/state/timestamp`, Date.now());
        log('the live game\'s phase changed; the sweep may run');
        const during = [];
        const reads = [];
        const slow = [];
        const changed = Date.now();
        let line = null;
        const until = Date.now() + 180000;
        while (Date.now() < until && !line) {
            const at = Date.now() - changed;
            const ms = await timed(() => call('validateGameName', { pin: live.toLowerCase() }));
            during.push(ms);
            if (ms > 1000) slow.push({ at, ms });
            // A phone's own read of the live game, straight from the database, with no function between.
            reads.push(await timed(() => fetch(`http://${DB}/games/${live}/state.json?ns=${PROJECT}`).then(r => r.json())));
            const m = fs.readFileSync(logFile, 'utf8').slice(before).match(/oldGames (\{[^\n]*?\})/);
            if (m) line = JSON.parse(m[1]);
        }
        if (!line) throw new Error('the sweep never logged a walk');
        const sweep = await db('GET', 'qHistory/gameSweep');
        log(`sweep: ${JSON.stringify(line)}; cursor ${JSON.stringify({ next: sweep.next, lease: sweep.lease })}`);
        const p90 = during.slice().sort((x, y) => x - y)[Math.floor(during.length * 0.9)];
        log(`PIN check while it ran: median ${median(during)} ms, 90% under ${p90} ms, max ${Math.max(...during)} ms, ${during.length} calls`);
        log(`PIN checks over a second: ${JSON.stringify(slow)} (ms after the phase change)`);
        log(`a phone's read of the live game while it ran: median ${median(reads)} ms, max ${Math.max(...reads)} ms`);
        log(`trigger runs: ${JSON.stringify(runs(fs.readFileSync(logFile, 'utf8').slice(before)))}`);
        let movedCount = 0;
        const all = await fetch(`http://${DB}/games.json?ns=${PROJECT}&shallow=false`, { headers: { Authorization: 'Bearer owner' } }).then(r => r.json());
        Object.keys(all).forEach(p => { if (all[p].kept) movedCount++; });
        log(`games now under kept: ${movedCount}; live game moved: ${!!all[live].kept}`);
        ok = line.looked === 1000 && line.moved === 1000 && sweep.next === 1001 && sweep.lease === 0 && !all[live].kept && movedCount === 1000;
        console.log(JSON.stringify({ ok, batch: line.looked, moved: line.moved, walkMs: line.ms, pinCheckIdleMs: median(idle), pinCheckDuringMs: median(during), pinCheckDuringMaxMs: Math.max(...during) }, null, 2));
    } catch (e) {
        console.error(e && e.stack ? e.stack : e);
    } finally {
        await stopEmulators(emulators);
    }
    process.exit(ok ? 0 : 1);
}

main();
