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

/**
 * The game with its moved parts back where they were, for the server's readers. What `kept` holds wins:
 * a moved game plays no more, so a part written at its old place since can only be a stranger's
 * (answerSelections is the one part phones may write), and it never takes the place of the real one.
 * A part `kept` doesn't hold is read from its old place, as before.
 */
export function withKept<T extends GameScheme>(game: T | null): T | null {
    if (!isMoved(game)) {
        return game;
    }
    const out: any = Object.assign({}, game);
    KEPT_PARTS.forEach(part => {
        if (game.kept[part] !== undefined && game.kept[part] !== null) {
            out[part] = game.kept[part];
        }
    });
    return out;
}

/** A whole game, read from both places. Null when there is no such game. */
export function readGame(pin: string): Promise<GameScheme | null> {
    return get<GameScheme>(gamesRef.child(pin)).then(game => withKept(game));
}

/**
 * One part of a game, from its own place, or from `kept` once the game is old. Its own place is read
 * first, so a live game pays no second read. Only the server writes the parts its readers ask for here
 * (players, revealAnswers, creator), so nothing a stranger writes on a moved game is read back this way.
 */
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
    return (await moveOne(pin, now)).moved;
}

// ---- the sweep ----

/** How many games one sweep looks at, at most. The first runs work through every game ever played. */
export const SWEEP_BATCH = 200;
/** Games read at once. */
const SWEEP_CHUNK = 25;
/**
 * The whole project sweeps at most this often, however many copies are running (gameSweep.at, kept
 * in the lease), and each running copy doesn't even ask more often than this.
 */
export const SWEEP_EVERY_MS = 60 * 1000;
/** One copy sweeps at a time: it holds the sweep this long (it gives it back when it is done). */
const LEASE_MS = 3 * 60 * 1000;
/** A PIN this close to the counter with no game may still be being made: the sweep waits for it. */
const FRESH_PINS = 20;
/**
 * A game made less than this long ago can't be old (see isOld: a finished game ended after it was
 * made, and a game never finished waits a day), and nor can any made after it. The walk stops there.
 */
export const YOUNG_MS = AFTER_END_MS;
/**
 * The walk passes over an older game that isn't old yet (a game that ended less than 6 hours ago, a
 * lobby less than a day old, a lobby still open in a host's tab) and notes it under gameSweep/wait, with
 * the time it may first be old, for a later sweep to look at again. At most this many: with the list
 * full, the walk stops at such a game instead, so nothing is ever passed over unnoted.
 */
export const WAIT_MAX = 100;

let lastSweep = 0;

/** Forget when this copy last swept (tests). */
export function forgetSweep() {
    lastSweep = 0;
}

/** PIN to the time its game may first be old. */
export type SweepWait = { [pin: string]: number };

export interface SweepResult {
    /** The counter of the first game the next sweep looks at. */
    next: number;
    moved: number;
    looked: number;
    /** Older games passed over, noted to be looked at again. */
    waiting?: number;
    /** busy: another copy is sweeping. soon: a sweep started somewhere less than SWEEP_EVERY_MS ago. */
    skipped?: 'busy' | 'soon';
}

/** The game was made less than YOUNG_MS ago, so neither it nor any game after it can be old. */
export function isYoung(game: GameStamp | null, now: number): boolean {
    if (!game) {
        return false;
    }
    const made = Number(game.timestamp) || Number(game.state && game.state.timestamp) || 0;
    return made > 0 && now - made < YOUNG_MS;
}

/** When a game that isn't old yet may first be old (see isOld). Never sooner than the next sweep. */
export function dueAt(game: GameStamp, now: number): number {
    const state = game.state || {};
    const ended = Number(state.timestamp) || 0;
    const made = Number(game.timestamp) || 0;
    let due: number;
    if (state.id === GameState.ScoreBoardFinal) {
        due = (ended || made) + AFTER_END_MS;
    } else {
        const last = Math.max(ended, made, Number(game.hostSeen) || 0);
        due = Math.max((made || ended) + AFTER_MADE_MS, last + STALE_MS);
    }
    return Math.max(due, now + SWEEP_EVERY_MS);
}

/**
 * Looks first at the older games an earlier sweep passed over whose time has come, then walks on
 * through the games in the order they were made, from where the last sweep stopped, and moves each
 * old one's private parts (see moveGame). An older game that isn't old yet is passed over and noted
 * (see WAIT_MAX); the walk stops at the first young game (see YOUNG_MS), since those after it are
 * younger, or after SWEEP_BATCH games in all; the next sweep goes on from there. A PIN with no game is
 * passed over. Runs at most once a SWEEP_EVERY_MS for the whole project, and in one copy at a time.
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
        const lease = await takeLease(now);
        if (lease.skipped) {
            return { next: -1, moved: 0, looked: 0, skipped: lease.skipped };
        }
        let result: SweepResult & { wait: SweepWait };
        try {
            result = await walk(lease.next, lease.wait, now, batch);
        } catch (e) {
            await saveSweep(lease.until, null).catch(() => null);
            throw e;
        }
        // Kept only while this copy still holds the sweep: a copy frozen past its lease and woken
        // later never takes the cursor back to where it started.
        await saveSweep(lease.until, { next: result.next, wait: result.wait, at: now });
        if (result.moved) {
            console.log('oldGames ' + JSON.stringify({ moved: result.moved, looked: result.looked, waiting: result.waiting, next: generateGameName(result.next) }));
        }
        delete result.wait;
        return result;
    } catch (e) {
        console.error('oldGames: the sweep failed', e && e.message ? e.message : e);
        return null;
    }
}

interface Lease {
    next: number;
    wait: SweepWait;
    /** The lease's end, which also tells this copy's lease from another's. */
    until: number;
    skipped?: 'busy' | 'soon';
}

/** What a stored wait list holds that is a PIN and a time. */
function cleanWait(raw: any): SweepWait {
    const wait: SweepWait = {};
    if (raw && typeof raw === 'object') {
        Object.keys(raw).forEach(pin => {
            const due = Number(raw[pin]);
            if (/^[A-Z0-9]{1,12}$/.test(pin) && due > 0) {
                wait[pin] = due;
            }
        });
    }
    return wait;
}

/**
 * Claims the sweep for LEASE_MS, unless another copy holds it or a sweep started anywhere less than
 * SWEEP_EVERY_MS ago. A start time far ahead of this copy's clock doesn't hold the sweep back for long.
 */
function takeLease(now: number): Promise<Lease> {
    return new Promise((resolve, reject) => {
        let lease: Lease = { next: 0, wait: {}, until: 0, skipped: 'busy' };
        gameSweepRef.transaction(
            (current: any) => {
                current = current || {};
                if (Number(current.lease) > now) {
                    lease = { next: 0, wait: {}, until: 0, skipped: 'busy' };
                    return; // abort: another copy is sweeping
                }
                const at = Number(current.at) || 0;
                if (now - at < SWEEP_EVERY_MS && at - now < LEASE_MS) {
                    lease = { next: 0, wait: {}, until: 0, skipped: 'soon' };
                    return; // abort: the project swept less than a minute ago
                }
                // The first game ever made is counter 1 (incGameCounter adds one first).
                lease = { next: Number(current.next) >= 1 ? Number(current.next) : 1, wait: cleanWait(current.wait), until: now + LEASE_MS };
                return Object.assign({}, current, { lease: lease.until, at: now });
            },
            (error, committed) => error ? reject(error) : resolve(committed ? lease : Object.assign({}, lease, { skipped: lease.skipped || 'busy' })),
        );
    });
}

/** Gives the sweep back, with where it got to (or, after a fault, as it was), if this lease still holds it. */
function saveSweep(until: number, done: { next: number; wait: SweepWait; at: number } | null): Promise<void> {
    return new Promise((resolve, reject) => {
        gameSweepRef.transaction(
            (current: any) => {
                if (current === null) {
                    // The database's first guess, before it has read the sweep: an abort here would end the
                    // transaction unsent. Returning it as it is lets the database read it and ask again.
                    return null;
                }
                if (Number(current.lease) !== until) {
                    return; // abort: this copy's lease ran out, and another may hold the sweep
                }
                const out = Object.assign({}, current, { lease: 0 });
                if (done) {
                    out.next = done.next;
                    out.at = done.at;
                    if (Object.keys(done.wait).length) {
                        out.wait = done.wait;
                    } else {
                        delete out.wait;
                    }
                }
                return out;
            },
            (error) => error ? reject(error) : resolve(),
        );
    });
}

/** What moving one game came to: moved, or not old yet (with when it may be), or nothing to move. */
async function moveOne(pin: string, now: number): Promise<{ moved: boolean; due?: number }> {
    const game = await get<GameScheme>(gamesRef.child(pin));
    if (!game) {
        return { moved: false };
    }
    if (!isOld(game, now)) {
        return { moved: false, due: dueAt(game, now) };
    }
    const update = moveUpdate(game, now);
    if (!Object.keys(update).length) {
        return { moved: false };
    }
    await gamesRef.child(pin).update(update);
    return { moved: true };
}

/** Moves the old ones of these games; one found not old after all is noted in `wait`. Resolves to how many moved. */
async function moveAll(pins: string[], now: number, wait: SweepWait): Promise<number> {
    const results = await Promise.all(pins.map(pin => moveOne(pin, now)));
    let moved = 0;
    results.forEach((r, i) => {
        if (r.moved) {
            moved++;
        } else if (r.due) {
            wait[pins[i]] = r.due;
        }
    });
    return moved;
}

async function walk(start: number, wait: SweepWait, now: number, batch: number): Promise<SweepResult & { wait: SweepWait }> {
    const keep: SweepWait = {};
    let moved = 0;
    let looked = 0;

    // First the games passed over before whose time has come, soonest first; the rest wait on.
    const due = Object.keys(wait).filter(pin => wait[pin] <= now).sort((a, b) => wait[a] - wait[b]);
    Object.keys(wait).forEach(pin => {
        if (wait[pin] > now) {
            keep[pin] = wait[pin];
        }
    });
    due.slice(batch).forEach(pin => keep[pin] = wait[pin]);
    const look = due.slice(0, batch);
    for (let i = 0; i < look.length; i += SWEEP_CHUNK) {
        const pins = look.slice(i, i + SWEEP_CHUNK);
        const stamps = await Promise.all(pins.map(readStamp));
        const old: string[] = [];
        pins.forEach((pin, j) => {
            const stamp = stamps[j];
            if (!stamp) {
                return; // no game there any more: nothing to wait for
            }
            if (isOld(stamp, now)) {
                old.push(pin);
            } else {
                keep[pin] = dueAt(stamp, now);
            }
        });
        moved += await moveAll(old, now, keep);
        looked += pins.length;
    }

    // Then on from the cursor.
    const counter = Number(await get<number>(gameCounterRef)) || 0;
    let next = start;
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
            if (isOld(stamp, now)) {
                old.push(pins[done]);
                continue;
            }
            if (isYoung(stamp, now) || Object.keys(keep).length >= WAIT_MAX) {
                break;
            }
            // Older but not old yet: passed over, and looked at again once it may be.
            keep[pins[done]] = dueAt(stamp, now);
        }
        moved += await moveAll(old, now, keep);
        // Up to the first game the walk stopped at, which the next sweep looks at again.
        next += done;
        looked += done;
        if (done < pins.length) {
            break;
        }
    }
    return { next, moved, looked, waiting: Object.keys(keep).length, wait: keep };
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
