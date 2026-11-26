import { GameScheme, GameState } from '../game-model';
import { revealDoneWait } from './phase';
import { playerPicks } from './scoring';
import { notPicking, writingSent } from './about';

/**
 * While a seat is left out, no phase ends early in its first seconds: a player who missed all of
 * question 1 and is back gets at least this long to send something and count again. Writing a lie
 * takes longer than a tap, so the lies get 20 seconds; a pick and NEXT are one tap, and get 10.
 * This is the one place the lengths are set.
 */
export const LEFT_OUT_GUARD_MS: { [stateId: number]: number } = {
    [GameState.ShowQuestion]: 20 * 1000,
    [GameState.ShowAnswers]: 10 * 1000,
    [GameState.RevealTheTruth]: 10 * 1000,
};

/** The guard's length (ms) for a phase; 0 for a phase that has none. */
export function leftOutGuardMs(stateId: number): number {
    return LEFT_OUT_GUARD_MS[stateId] || 0;
}

const guardedPhases = [GameState.ShowQuestion, GameState.ShowAnswers];

/**
 * A seat whose page has been away this long is gone: the room stops waiting for it, and a Replay
 * leaves it out. Each seat's page keeps games/$pin/seen/$pid true while it is connected, and the
 * database writes the server's time there by itself when the connection drops (ApiService.followSeat).
 * A phone that sleeps for a moment, a reload or a lift ride is back well inside this; a phone that
 * slept longer counts again the moment it is back (its page sets the mark to true again).
 */
export const GONE_MS = 20 * 1000;

/**
 * Has this seat's page gone away, GONE_MS ago or more? Either its mark is the time it went away, or,
 * in a Replay, it never came: the Replay carried the seat over, but its phone never opened the new game
 * while other seats' phones did. A seat with no mark anywhere else (an older page, or a game from before
 * the marks) is never gone.
 */
export function seatGone(game: GameScheme, pid: string, now: number): boolean {
    const seen = (game && game.seen) || {};
    const mark = seen[pid];
    if (typeof mark === 'number') {
        return now - mark >= GONE_MS;
    }
    if (mark !== undefined && mark !== null) {
        return false;
    }
    // Never came to the Replay: only once the Replay has been open GONE_MS, and only where other seats
    // are marked here, so the marks are known to work in this game.
    const others = Object.keys(seen).some(k => k !== pid && !!(game.players || {})[k]);
    return game.origin === 'replay' && others && typeof game.timestamp === 'number' && now - game.timestamp >= GONE_MS;
}

/**
 * Whether seats can be left out on the question the game is on: only from the second question of a
 * game whose flags were kept from its first (playedFrom). A game that was already running when this
 * was released has no playedFrom, so every seat counts in it to its end, as before.
 */
function canLeaveOut(game: GameScheme): boolean {
    return !!game && typeof game.playedFrom === 'number' && (game.questionIndex || 0) > game.playedFrom;
}

/** Has this seat sent a lie or a pick in this game, the question being played included? */
function hasPlayed(game: GameScheme, pid: string): boolean {
    // writingSent: the lies, and the truth of the player an About question is about (see about.ts).
    return !!((game.played && game.played[pid]) || writingSent(game)[pid] ||
        playerPicks(game)[pid]);
}

/**
 * The seats the "everyone has answered / picked / tapped NEXT" checks wait for. On question 1 that is
 * every seat. From question 2 on it leaves out each seat that has sent no lie and no pick so far in
 * this game (nobody is playing it: a player who went home, or a second seat left by a double join).
 * Such a seat counts again from the moment it sends one. It stays on the scoreboard either way.
 */
export function seatsToWaitFor(game: GameScheme, now = Date.now()): string[] {
    // While an About question's answers are picked, the player it is about does not pick (see about.ts).
    const out = notPicking(game);
    return seatsPlaying(game, now).filter(pid => pid !== out);
}

/**
 * The seats the room waits for: every seat on question 1, then those that sent something (the empty
 * seats rule); on any question, less the seats whose page is gone (seatGone). A seat whose page left
 * was waited for to the end of every question before: on 21 Nov's New Year's Eve play-through a guest
 * who walked off at midnight in question 3 made each of the last questions run out its clock.
 */
function seatsPlaying(game: GameScheme, now = Date.now()): string[] {
    const pids = Object.keys(game && game.players || {});
    const playing = canLeaveOut(game) ? pids.filter(pid => hasPlayed(game, pid)) : pids;
    return playing.filter(pid => !seatGone(game, pid, now));
}

/**
 * Has every seat we wait for sent `sent` (the lies, the picks or the NEXT taps of this question)?
 * Never true with nobody to wait for: a game nobody plays runs on its clocks, as before.
 */
export function everyoneSent(game: GameScheme, sent: { [pid: string]: any } | null | undefined, now = Date.now()): boolean {
    const waited = seatsToWaitFor(game, now);
    return waited.length > 0 && waited.every(pid => !!(sent && sent[pid]));
}

/**
 * How long (ms) the current phase must still run before it may end early: the rest of its guard
 * (leftOutGuardMs) while a seat is left out, 0 when no seat is.
 */
export function leftOutGuardWait(game: GameScheme, now: number): number {
    const seats = Object.keys(game && game.players || {}).length;
    if (!game || !game.state || seatsPlaying(game, now).length === seats) {
        return 0;
    }
    return Math.max(0, game.state.timestamp + leftOutGuardMs(game.state.id) - now);
}

/**
 * The flags to store when a question's picks close: every seat that has sent a lie or a pick so far.
 * playedFrom is set with the first question's flags and only then, so a game that was running at the
 * release never gets one. Returns nothing to write for such a game.
 */
export function playedUpdate(game: GameScheme): { played?: { [pid: string]: boolean }; playedFrom?: number } {
    const first = (game.questionIndex || 0) === 0;
    if (!first && typeof game.playedFrom !== 'number') {
        return {};
    }
    const played: { [pid: string]: boolean } = {};
    Object.keys(game.players || {}).filter(pid => hasPlayed(game, pid)).forEach(pid => played[pid] = true);
    return first ? { played, playedFrom: 0 } : { played };
}

/**
 * The seats that sent something on the question being closed: a lie, a pick that counts, or a NEXT
 * on its reveal. Stored when the game ends (lastSent): those are the players still at the table,
 * and a Replay starts with their seats (fork.ts seatsForReplay).
 */
export function lastSentSeats(game: GameScheme): { [pid: string]: boolean } {
    const answers = (game && game.answers) || {};
    const picks = game ? playerPicks(game) : {};
    const done = (game && game.revealDone) || {};
    const out: { [pid: string]: boolean } = {};
    Object.keys((game && game.players) || {})
        .filter(pid => !!game.players[pid] && !!(answers[pid] || picks[pid] || done[pid] === true))
        .forEach(pid => out[pid] = true);
    return out;
}

/** The phases the phase timer looks at once more when the guard is over: the lies and the picks. */
export function guardedPhase(stateId: number): boolean {
    return guardedPhases.indexOf(stateId) >= 0;
}

/**
 * For the phase timer, at the guard's end: is a seat left out, and is everyone we wait for in?
 * Then the phase ends now. The answer and pick checks do not end a phase inside the guard, and
 * nothing else would run when it is over.
 */
export function endsAfterGuard(game: GameScheme, now: number): boolean {
    if (!game || !game.state || !guardedPhase(game.state.id) || leftOutGuardWait(game, now) > 0) {
        return false;
    }
    const leftOut = seatsPlaying(game, now).length < Object.keys(game.players || {}).length;
    // Only a player's pick counts (see scoring.ts). The writing counts an About question's truth too.
    const sent = game.state.id === GameState.ShowQuestion ? writingSent(game) : playerPicks(game);
    return leftOut && everyoneSent(game, sent, now);
}

/**
 * The reveal: whether the NEXT taps of the seats we wait for end it now, and how long to wait first
 * (0 = now; undefined = not yet). Like the lies and the picks, not in the reveal's first seconds
 * while a seat is left out.
 */
export function revealEndWait(game: GameScheme, now: number): number | undefined {
    const wait = revealDoneWait(game, now, seatsToWaitFor(game, now));
    return wait === undefined ? undefined : Math.max(wait, leftOutGuardWait(game, now));
}
