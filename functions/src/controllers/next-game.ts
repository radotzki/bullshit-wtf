import { Crew, GameState } from '../game-model';
import { get, gamesRef, crewsRef } from '../firebase';

/**
 * One next game for a finished game, whichever button a phone pressed.
 *
 * A finished game has two ways to the next one: REMATCH on the final screen (Replay, fork.ts) and,
 * once the group saved a crew, REMATCH on the crew page (crewRematch, crew.ts), which the final
 * screen links to. Each kept its own "one lobby" rule (the finished game's `forking`, the crew's
 * `rematch`) and neither knew the other's, so a phone that went by the crew page made a lobby of its
 * own while the rest followed Replay (15 Nov: JVAX made JVAA by Replay, and JVAY and JVAZ by the crew
 * page, one phone each; 13 Nov JVYL and JVYM, 11 Nov JVVG and JVVH, 10 Nov JVUL and JVUM). And two
 * presses on the crew page at once each made a lobby (JVAY and JVAZ, 10 seconds apart): the crew's
 * `rematch` was read, then written once the new game was made, with no claim in between.
 *
 * Now both take the same two claims, each a transaction: the finished game's `forking` and the
 * crew's `rematch`. Whoever holds a claim already, the others go to that game.
 */

/** How long a phone waits for a claimed next game to be written before it makes its own. */
export const NEXT_GAME_WAIT_MS = 10 * 1000;

/** A crew page REMATCH this soon after the crew's last game ended is that game's next game too. */
export const LINK_LAST_GAME_MS = 30 * 60 * 1000;

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/** The first next game of `pin` claims its pin; resolves to the pin that holds the claim. */
export function claimFork(pin: string, forkedGamePin: string): Promise<string> {
    return new Promise((resolve, reject) => {
        gamesRef.child(pin).child('forking').transaction(
            (current) => current || forkedGamePin,
            (error, committed, snapshot) => error ? reject(error) : resolve(snapshot.val()),
        );
    });
}

/**
 * Waits (up to NEXT_GAME_WAIT_MS) until the finished game points to its next game, and resolves to
 * it (null if it never does). The pin it points to may differ from the claim: a Replay that finds a
 * crew lobby waiting points the game there.
 */
export async function forkOf(pin: string): Promise<string | null> {
    const until = Date.now() + NEXT_GAME_WAIT_MS;
    while (true) {
        const current = await get<string>(gamesRef.child(pin).child('fork'));
        if (current) {
            return current;
        }
        if (Date.now() >= until) {
            return null;
        }
        await wait(250);
    }
}

/**
 * Whether `pin` is a lobby that can still be joined. A claimed game that is not written yet is
 * waited for, up to NEXT_GAME_WAIT_MS after `claimedAt`.
 */
export async function lobbyOpen(pin: string, claimedAt = 0): Promise<boolean> {
    while (true) {
        const state = await get<{ id: number }>(gamesRef.child(pin).child('state'));
        if (state) {
            return state.id === GameState.GameStaging;
        }
        if (Date.now() >= (claimedAt || 0) + NEXT_GAME_WAIT_MS) {
            return false;
        }
        await wait(250);
    }
}

/**
 * Claims the crew's next lobby for `pin`, unless another holds it: resolves to the pin that holds
 * the claim. The claim held now is kept when it is newer than `since` and the reuse window, and is
 * not `gone` (a lobby the caller found started or never written, which may be replaced).
 */
export function claimCrewLobby(crewId: string, pin: string, gone: string | null, since: number,
    reuseMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
        crewsRef.child(crewId).child('rematch').transaction(
            (current: Crew['rematch']) => {
                const now = Date.now();
                if (current && current.pin && current.pin !== gone
                    && (current.time || 0) >= Math.max(since, now - reuseMs)) {
                    return; // keep it
                }
                return { pin, time: now };
            },
            (error, committed, snapshot) => {
                if (error) {
                    return reject(error);
                }
                const v = snapshot.val();
                resolve(v && v.pin ? v.pin : pin);
            },
        );
    });
}

/**
 * The crew's lobby that this finished game's Replay should go to, if one was opened from the crew
 * page since the game ended: claims the crew's next lobby for `forkedGamePin` otherwise, so a crew
 * page press that comes later lands in the Replay. Resolves to the crew's lobby, or null when the
 * Replay makes its own game.
 */
export async function crewLobbyFor(crewId: string, endedAt: number, forkedGamePin: string,
    reuseMs: number): Promise<string | null> {
    const current = await get<Crew['rematch']>(crewsRef.child(crewId).child('rematch'));
    let gone: string = null;
    if (current && current.pin && (current.time || 0) >= endedAt) {
        if (!(await lobbyOpen(current.pin, current.time))) {
            gone = current.pin;
        }
    }
    const holder = await claimCrewLobby(crewId, forkedGamePin, gone, endedAt, reuseMs);
    if (holder === forkedGamePin) {
        return null;
    }
    // Another phone opened the crew's lobby a moment ago: the Replay goes there, once it is written.
    const claimed = await get<Crew['rematch']>(crewsRef.child(crewId).child('rematch'));
    return await lobbyOpen(holder, claimed && claimed.pin === holder ? claimed.time : Date.now()) ? holder : null;
}

/**
 * The crew's latest recorded game, however long ago it ended (null if it has none). Its record's
 * `time` is when it reached its final scoreboard; the record stays on the crew when the old-games
 * sweep moves the game's private parts.
 */
export function latestCrewGame(crew: Crew): string | null {
    const games = crew.games || {};
    let last: string = null;
    Object.keys(games).forEach(p => {
        if (games[p] && (!last || (games[p].time || 0) > (games[last].time || 0))) {
            last = p;
        }
    });
    return last;
}

/** The crew's latest game, when it ended within LINK_LAST_GAME_MS: a crew REMATCH is its next game. */
export function lastGameOf(crew: Crew, now = Date.now()): string | null {
    const last = latestCrewGame(crew);
    return last && now - (crew.games[last].time || 0) < LINK_LAST_GAME_MS ? last : null;
}
