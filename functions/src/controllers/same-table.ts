// "Same table tomorrow": a finished game's link reopens its table (Product's build plan, item 3).
// The link of a link-invited table sits in its group chat. On "The night after"'s recap (night-after.ts),
// a browser that played gets PLAY AGAIN, SAME TABLE there: one lobby for that game, with fresh questions,
// that the next person to tap the same link lands in (validateGameName sends them on to it as the game's
// rematch). Groups that come back mostly come back the next evening, with that link already in their chat.
//
// What it promises:
// - One lobby per game link, however many tap at once. It takes the claim Replay takes (the finished
//   game's `forking`, see next-game.ts), so a Replay, the crew page and this button all land in one lobby.
// - A lobby that has started, ended, filled up or gone stale traps nobody: the next tap replaces it, in a
//   transaction that replaces only that very lobby, so two taps at once still make one new one.
// - Nothing new is stored and no database rule changes: the lobby is a Replay (`fork`), and the finished
//   game's `forking` and `fork` point to it, as after any Replay. Each new lobby writes a `forks` row.
// - Only a player of the game may open it (the recap's `player`), within the recap's week, and only for a
//   game that has a recap. The lobby starts with that player's seat alone: the others come by the link.
// - A player who comes late (Product's review of #160): while the table's lobby is mid-game, the recap
//   says so (`tablePlaying`, see lateTable) and CATCH THE NEXT ROUND asks with `wait`, so it is told
//   TABLE_PLAYING instead of opening a lobby alone. Once that game is over and its Replay opened the next
//   lobby, any press of a player of this game joins that lobby (one hop), as a guest: the key stays theirs.
// - Hanukkah night (game/: components/hanukkah-night): a press from the link SAME TABLE TOMORROW saved
//   (?via=hanukkah-night-N) tags the lobby it opens with that campaign, so tables that come back on
//   another Hanukkah night can be counted (bigquery/2026-12-hanukkah-nights.sql). No other tag is taken
//   from the client here, and a test game's lobby keeps its test tag.
import { GameScheme, GameState, GamePlayers, MAX_PLAYERS, isTestCampaign } from '../game-model';
import { get, gamesRef } from '../firebase';
import { readGame } from './old-games';
import { incGameCounter, generateGameName } from './new-game';
import { randomQuestions } from './questions';
import { replayLength } from './taste';
import { crewLobbyFor, NEXT_GAME_WAIT_MS } from './next-game';
import { REMATCH_REUSE_MS } from './crew';
import { isGameOver } from './game-over';
import { nightAfter } from './night-after';
import { createFork, joinNext } from './fork';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/** The campaign a press may give the lobby it opens: `hanukkah-night-<2..8>`, else none. */
export function tableCampaign(tag: any): string | undefined {
    return typeof tag === 'string' && /^hanukkah-night-[2-8]$/.test(tag) ? tag : undefined;
}

/** How many times a tap that lost a race looks again before it gives up. */
const TRIES = 4;

export interface SameTableResult {
    pin: string;
    host: boolean;
    hostKey?: string;
}

/**
 * Whether `pin` is a lobby a group can still sit down in: waiting to start, not stale, not full.
 * A lobby claimed but not written yet is waited for, up to NEXT_GAME_WAIT_MS.
 */
export async function tableOpen(pin: string, now = Date.now): Promise<boolean> {
    const until = now() + NEXT_GAME_WAIT_MS;
    while (true) {
        const game = await readGame(pin);
        if (game && game.state) {
            return game.state.id === GameState.GameStaging && !isGameOver(game, now())
                && Object.keys(game.players || {}).length < MAX_PLAYERS;
        }
        if (now() >= until) {
            return false;
        }
        await wait(250);
    }
}

/** What became of the table's last lobby, for a player who comes late (see the header). */
export type LateTable = { playing: true } | { next: string } | null;

/**
 * How long after the table's final scores it still counts as playing, while nobody has pressed Replay
 * yet: the group is on the final screen, and its Replay is likely seconds away. A late player's CATCH
 * THE NEXT ROUND then waits for that Replay instead of opening a lobby alone, which the group's Replay
 * would never find (Product's review of #163, section 2). After it, with no Replay, the press opens the
 * table again.
 */
export const REPLAY_GRACE_MS = 2 * 60 * 1000;

/**
 * `held` is the table's last lobby (the finished game's `forking` or `fork`). `playing`: it started and
 * isn't over, or it reached its final scores less than REPLAY_GRACE_MS ago and its Replay hasn't opened
 * a lobby yet (none pressed, or one claimed and still being written). `next`: it is over, and its own
 * Replay opened a lobby that a group can still sit down in. Otherwise null. One hop only: the table's
 * own next game, never a chain.
 */
export async function lateTable(held: string, now = Date.now()): Promise<LateTable> {
    const table = held ? await readGame(held) : null;
    if (!table || !table.state) {
        return null;
    }
    const over = isGameOver(table, now);
    if (!over && table.state.id !== GameState.GameStaging) {
        return { playing: true };
    }
    if (!over) {
        return null;
    }
    const ended = table.state.id === GameState.ScoreBoardFinal ? Number(table.state.timestamp) || 0 : 0;
    const inGrace = ended > 0 && now - ended < REPLAY_GRACE_MS;
    // Replay takes `forking` first and writes `fork` after its lobby: either one names the next lobby.
    const pinOf = (v: unknown) => typeof v === 'string' && v && v !== held ? v : '';
    const nextPin = pinOf(table.forking) || pinOf(table.fork);
    if (!nextPin) {
        return inGrace ? { playing: true } : null;
    }
    const next = await readGame(nextPin);
    if (!next || !next.state) {
        // Claimed, and still being written: wait for it, but not for a Replay that never finished.
        return inGrace ? { playing: true } : null;
    }
    if (next.state.id === GameState.GameStaging && !isGameOver(next, now)
        && Object.keys(next.players || {}).length < MAX_PLAYERS) {
        return { next: nextPin };
    }
    return null;
}

/**
 * Takes the finished game's claim for `fresh`, when nobody holds it or it still holds `gone` (a lobby
 * this tap found closed). Resolves to the pin that holds the claim afterwards.
 */
export function reclaimFork(pin: string, gone: string | null, fresh: string): Promise<string> {
    return new Promise((resolve, reject) => {
        gamesRef.child(pin).child('forking').transaction(
            (current) => !current || current === gone ? fresh : undefined,
            (error, committed, snapshot) => error ? reject(error) : resolve(snapshot.val()),
        );
    });
}

/** The seat of the browser that pressed: its last seat, or the seat of its sign-in. */
function seatOfPresser(game: GameScheme, uid?: string, pid?: string): string | undefined {
    const players = game.players || {};
    if (pid && players[pid]) {
        return pid;
    }
    return Object.keys(players).find(k => !!uid && players[k] && players[k].uid === uid);
}

/**
 * PLAY AGAIN, SAME TABLE on a finished game's recap. `creator` and `hostPid` are the sign-in and last
 * seat of the browser that pressed, `hostKey` its new one-game secret (as for Replay). Resolves to the
 * game's open lobby, or a new one; the presser hosts a new one, and gets the key of one that was there.
 * The table's lobby is over and its Replay opened the next one: that one, as a guest. `wait` (CATCH THE
 * NEXT ROUND): while the table's lobby is mid-game, TABLE_PLAYING instead of a new lobby.
 */
export async function sameTable(pin: string, creator?: string, hostPid?: string, hostKey?: string,
    stagedReveal = false, aboutUs = false, wait = false, campaign?: string): Promise<SameTableResult> {
    pin = String(pin || '').toUpperCase();
    const game = await readGame(pin);
    if (!game) {
        return Promise.reject({ message: 'Wrong game PIN', code: 'GAME_NOT_EXIST' });
    }
    const recap = nightAfter(pin, game, Date.now(), creator, hostPid);
    const seat = seatOfPresser(game, creator, hostPid);
    if (!recap || !recap.player || !seat) {
        return Promise.reject({ message: 'Only a player of this game can open its table again', code: 'NOT_A_PLAYER' });
    }

    for (let i = 0; i < TRIES; i++) {
        // The game's lobby is open (or being written by a tap a moment ago): everyone goes there.
        const held = await get<string>(gamesRef.child(pin).child('forking'));
        if (held && await tableOpen(held)) {
            return await joinNext(game, held, seat, hostKey);
        }
        // A late player: the table is mid-game, or has moved on to its next lobby.
        const late = held ? await lateTable(held) : null;
        if (late && 'next' in late) {
            return { pin: late.next, host: false };
        }
        if (late && 'playing' in late && wait) {
            return Promise.reject({ message: 'The table is playing, try again when it ends', code: 'TABLE_PLAYING' });
        }
        const fresh = generateGameName(await incGameCounter());
        const claimed = await reclaimFork(pin, held || null, fresh);
        if (claimed === fresh) {
            return await openTable(pin, game, fresh, seat, creator, hostKey, stagedReveal, aboutUs, tableCampaign(campaign));
        }
        // Another tap took the claim between our read and our write: look again, and go to its lobby.
    }
    return Promise.reject({ message: 'Could not open the table, try again', code: 'TRY_AGAIN' });
}

/** This tap holds the claim: the crew's open lobby, if the crew page opened one, or a new game. */
async function openTable(pin: string, game: GameScheme, fresh: string, seat: string, creator: string,
    hostKey: string, stagedReveal: boolean, aboutUs: boolean, campaign?: string): Promise<SameTableResult> {
    if (game.crew) {
        const lobby = await crewLobbyFor(game.crew, Date.now() - REMATCH_REUSE_MS, fresh, REMATCH_REUSE_MS)
            .catch(e => { console.error('crewLobbyFor failed', pin, e && e.message); return null; });
        if (lobby) {
            await gamesRef.child(pin).child('forking').set(lobby);
            await gamesRef.child(pin).child('fork').set(lobby);
            return await joinNext(game, lobby, seat, hostKey);
        }
    }

    // Fresh questions for everyone who sat at the table, and the presser's seat alone: the others take
    // theirs by the link (one phone, one seat, see join.ts).
    const uids = Object.keys(game.players || {}).map(k => game.players[k] && game.players[k].uid).filter(u => !!u);
    const totalQ = replayLength(game);
    const questions = await randomQuestions(game.locale, totalQ, uids, game.pack, game.kidsHoliday);
    const players: GamePlayers = { [seat]: game.players[seat] };
    const table: GameScheme = Object.assign({}, game, { players, totalQ, lastSent: undefined, played: undefined });
    const lobby = createFork(pin, table, questions, creator || game.players[seat].uid, seat, hostKey,
        stagedReveal, fresh, aboutUs);
    lobby.origin = 'table';
    // A test game's lobby stays a test game (createFork); any other takes the Hanukkah night's tag.
    if (campaign && !isTestCampaign(lobby.campaign)) {
        lobby.campaign = campaign;
    }

    await gamesRef.child(fresh).set(lobby);
    await gamesRef.child(pin).child('fork').set(fresh);
    console.log(`[PIN: ${pin}] Same table: ${fresh}`);
    return { pin: fresh, host: true };
}
