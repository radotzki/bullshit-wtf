import { GameScheme, GameState } from '../game-model';
import { get, gamesRef, gameCounterRef, gameSweepRef } from '../firebase';
import { generateGameName } from './new-game';
import { STALE_MS } from './game-over';

/**
 * Closing old games to strangers, with no database rules change.
 *
 * Phones may read a game's players, highlights, answers and picks by its PIN, and PINs are handed out
 * in order, so anybody could walk every finished game. The rules give `games/<PIN>` itself to the
 * server alone, and open only the children they name. So a child they don't name, `kept`, is the
 * server's alone: once a game is old, its private parts are moved there, in one write. Nothing is
 * erased: the same values sit under `kept`, and readGame puts them back for every server reader
 * (Replay, crew save, the join link preview, the PIN check, analytics).
 *
 * When: 6 hours after the final scoreboard, or, for a game never finished, 24 hours after it was made
 * and once nothing has moved it for STALE_MS (so a slow lobby is never moved under its players).
 * Who moves them: sweepOldGames, run from calls that already come in (a game's phase changes and the
 * daily puzzle), the way the daily function erases old chat rounds. No timer of its own.
 */

/** The parts a stranger could read, and that name or quote players. */
export const KEPT_PARTS = ['players', 'highlights', 'answers', 'revealAnswers', 'answerSelections', 'currentQ', 'creator'];
/** The child of games/<PIN> they move to. It has no database rule, so only the server reads it. */
export const KEPT = 'kept';

export const AFTER_END_MS = 6 * 60 * 60 * 1000;
export const AFTER_MADE_MS = 24 * 60 * 60 * 1000;

/** A game whose private parts have been moved. */
export function isMoved(game: GameScheme | null | undefined): boolean {
    return !!(game && game.kept && typeof game.kept === 'object');
}

/** The game with its moved parts back where they were, for the server's readers. A part written since wins. */
export function withKept<T extends GameScheme>(game: T | null): T | null {
    if (!isMoved(game)) {
        return game;
    }
    const out: any = Object.assign({}, game);
    KEPT_PARTS.forEach(part => {
        if ((out[part] === undefined || out[part] === null) && game.kept[part] !== undefined && game.kept[part] !== null) {
            out[part] = game.kept[part];
        }
    });
    return out;
}

/** A whole game, read from both places. Null when there is no such game. */
export function readGame(pin: string): Promise<GameScheme | null> {
    return get<GameScheme>(gamesRef.child(pin)).then(game => withKept(game));
}

/** One part of a game, from its own place, or from `kept` once the game is old. */
export async function readPart<T>(pin: string, part: string): Promise<T | null> {
    const here = await get<T>(gamesRef.child(pin).child(part));
    if ((here !== null && here !== undefined) || KEPT_PARTS.indexOf(part) < 0) {
        return here;
    }
    const kept = await get<T>(gamesRef.child(pin).child(KEPT).child(part));
    return kept === undefined ? null : kept;
}

/** What the sweep reads first: enough to tell whether a game is old, without its questions and answers. */
export interface GameStamp {
    state?: { id?: number; timestamp?: number };
    timestamp?: number;
    hostSeen?: number;
}

/** The game is old enough for its private parts to move. */
export function isOld(game: GameStamp | null, now: number): boolean {
    if (!game) {
        return false;
    }
    const state = game.state || {};
    const ended = Number(state.timestamp) || 0;
    const made = Number(game.timestamp) || 0;
    if (!ended && !made) {
        // Only the oldest games carry no time at all: games are made with both at once.
        return true;
    }
    if (state.id === GameState.ScoreBoardFinal) {
        return now - (ended || made) >= AFTER_END_MS;
    }
    const last = Math.max(ended, made, Number(game.hostSeen) || 0);
    return now - (made || ended) >= AFTER_MADE_MS && now - last >= STALE_MS;
}

/**
 * The one write that moves a game's private parts under `kept`: each part is set there and cleared
 * here at once, so it is never in neither place nor half moved. A part `kept` already holds stays as
 * it is (a later write by a phone stays where it is too, and readGame prefers it).
 * Empty when there is nothing to move.
 */
export function moveUpdate(game: GameScheme, now: number): { [path: string]: any } {
    const update: { [path: string]: any } = {};
    if (!game) {
        return update;
    }
    const kept = game.kept || {};
    KEPT_PARTS.forEach(part => {
        const value = (game as any)[part];
        if (value === undefined || value === null || (kept[part] !== undefined && kept[part] !== null)) {
            return;
        }
        update[`${KEPT}/${part}`] = value;
        update[part] = null;
    });
    if (Object.keys(update).length && !kept.at) {
        update[`${KEPT}/at`] = now;
    }
    return update;
}

/** Moves one game's private parts, if it is old. Resolves to whether anything moved. */
export async function moveGame(pin: string, now: number): Promise<boolean> {
    const game = await get<GameScheme>(gamesRef.child(pin));
    if (!game || !isOld(game, now)) {
        return false;
    }
    const update = moveUpdate(game, now);
    if (!Object.keys(update).length) {
        return false;
    }
    await gamesRef.child(pin).update(update);
    return true;
}

// ---- the sweep ----

/** How many games one sweep looks at, at most. The first runs work through every game ever played. */
export const SWEEP_BATCH = 200;
/** Games read at once. */
const SWEEP_CHUNK = 25;
/** A running copy sweeps at most this often. */
export const SWEEP_EVERY_MS = 60 * 1000;
/** One copy sweeps at a time: it holds the sweep this long (it gives it back when it is done). */
const LEASE_MS = 3 * 60 * 1000;
/** A PIN this close to the counter with no game may still be being made: the sweep waits for it. */
const FRESH_PINS = 20;

let lastSweep = 0;

/** Forget when this copy last swept (tests). */
export function forgetSweep() {
    lastSweep = 0;
}

export interface SweepResult {
    /** The counter of the first game the next sweep looks at. */
    next: number;
    moved: number;
    looked: number;
    skipped?: 'busy';
}

/**
 * Walks the games in the order they were made, from where the last sweep stopped, and moves each old
 * one's private parts (see moveGame). It stops at the first game that is not old yet, since those after
 * it are younger, or after SWEEP_BATCH games; the next sweep goes on from there. A PIN with no game is
 * passed over. Runs at most once a SWEEP_EVERY_MS per running copy, and in one copy at a time.
 * Never rejects.
 */
export async function sweepOldGames(now = Date.now(), batch = SWEEP_BATCH): Promise<SweepResult | null> {
    if (now - lastSweep < SWEEP_EVERY_MS) {
        return null;
    }
    lastSweep = now;
    if (!gameSweepRef || !gameCounterRef) {
        return null;
    }
    try {
        const start = await takeLease(now);
        if (start === null) {
            return { next: -1, moved: 0, looked: 0, skipped: 'busy' };
        }
        let result: SweepResult;
        try {
            result = await walk(start, now, batch);
        } catch (e) {
            await gameSweepRef.child('lease').set(0).catch(() => null);
            throw e;
        }
        await gameSweepRef.update({ next: result.next, lease: 0, at: now });
        if (result.moved) {
            console.log('oldGames ' + JSON.stringify({ moved: result.moved, looked: result.looked, next: generateGameName(result.next) }));
        }
        return result;
    } catch (e) {
        console.error('oldGames: the sweep failed', e && e.message ? e.message : e);
        return null;
    }
}

/** Claims the sweep for LEASE_MS: resolves to the counter it starts at, or null when another copy holds it. */
function takeLease(now: number): Promise<number | null> {
    return new Promise((resolve, reject) => {
        let start: number | null = null;
        gameSweepRef.transaction(
            (current: any) => {
                current = current || {};
                if (Number(current.lease) > now) {
                    start = null;
                    return; // abort: another copy is sweeping
                }
                // The first game ever made is counter 1 (incGameCounter adds one first).
                start = Number(current.next) >= 1 ? Number(current.next) : 1;
                return Object.assign({}, current, { lease: now + LEASE_MS });
            },
            (error, committed) => error ? reject(error) : resolve(committed ? start : null),
        );
    });
}

async function walk(start: number, now: number, batch: number): Promise<SweepResult> {
    const counter = Number(await get<number>(gameCounterRef)) || 0;
    let next = start;
    let moved = 0;
    let looked = 0;
    while (looked < batch && next <= counter) {
        const size = Math.min(SWEEP_CHUNK, batch - looked, counter - next + 1);
        const pins: string[] = [];
        for (let i = 0; i < size; i++) {
            pins.push(generateGameName(next + i));
        }
        const stamps = await Promise.all(pins.map(readStamp));
        let done = 0;
        const old: string[] = [];
        for (; done < pins.length; done++) {
            const stamp = stamps[done];
            if (!stamp) {
                // No game at this PIN. Passed over, unless it may still be being made.
                if (counter - (next + done) < FRESH_PINS) {
                    break;
                }
                continue;
            }
            if (!isOld(stamp, now)) {
                break;
            }
            old.push(pins[done]);
        }
        moved += (await Promise.all(old.map(pin => moveGame(pin, now)))).filter(Boolean).length;
        // Up to the first game that is not old yet, which the next sweep looks at again.
        next += done;
        looked += done;
        if (done < pins.length) {
            break;
        }
    }
    return { next, moved, looked };
}

async function readStamp(pin: string): Promise<GameStamp | null> {
    const game = gamesRef.child(pin);
    const [state, timestamp, hostSeen] = await Promise.all([
        get<any>(game.child('state')), get<number>(game.child('timestamp')), get<number>(game.child('hostSeen')),
    ]);
    if (!state && !timestamp) {
        return null;
    }
    return { state: state || undefined, timestamp: timestamp || undefined, hostSeen: hostSeen || undefined };
}
