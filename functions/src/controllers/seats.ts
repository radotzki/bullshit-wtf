import { GameScheme, GameState } from '../game-model';
import { revealDoneWait } from './phase';
import { playerPicks } from './scoring';

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
 * Whether seats can be left out on the question the game is on: only from the second question of a
 * game whose flags were kept from its first (playedFrom). A game that was already running when this
 * was released has no playedFrom, so every seat counts in it to its end, as before.
 */
function canLeaveOut(game: GameScheme): boolean {
    return !!game && typeof game.playedFrom === 'number' && (game.questionIndex || 0) > game.playedFrom;
}

/** Has this seat sent a lie or a pick in this game, the question being played included? */
function hasPlayed(game: GameScheme, pid: string): boolean {
    return !!((game.played && game.played[pid]) || (game.answers && game.answers[pid]) ||
        playerPicks(game)[pid]);
}

/**
 * The seats the "everyone has answered / picked / tapped NEXT" checks wait for. On question 1 that is
 * every seat. From question 2 on it leaves out each seat that has sent no lie and no pick so far in
 * this game (nobody is playing it: a player who went home, or a second seat left by a double join).
 * Such a seat counts again from the moment it sends one. It stays on the scoreboard either way.
 */
export function seatsToWaitFor(game: GameScheme): string[] {
    const pids = Object.keys(game && game.players || {});
    return canLeaveOut(game) ? pids.filter(pid => hasPlayed(game, pid)) : pids;
}

/**
 * Has every seat we wait for sent `sent` (the lies, the picks or the NEXT taps of this question)?
 * Never true with nobody to wait for: a game nobody plays runs on its clocks, as before.
 */
export function everyoneSent(game: GameScheme, sent: { [pid: string]: any } | null | undefined): boolean {
    const waited = seatsToWaitFor(game);
    return waited.length > 0 && waited.every(pid => !!(sent && sent[pid]));
}

/**
 * How long (ms) the current phase must still run before it may end early: the rest of its guard
 * (leftOutGuardMs) while a seat is left out, 0 when no seat is.
 */
export function leftOutGuardWait(game: GameScheme, now: number): number {
    const seats = Object.keys(game && game.players || {}).length;
    if (!game || !game.state || seatsToWaitFor(game).length === seats) {
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
    const leftOut = seatsToWaitFor(game).length < Object.keys(game.players || {}).length;
    // Only a player's pick counts (see scoring.ts).
    const sent = game.state.id === GameState.ShowQuestion ? game.answers : playerPicks(game);
    return leftOut && everyoneSent(game, sent);
}

/**
 * The reveal: whether the NEXT taps of the seats we wait for end it now, and how long to wait first
 * (0 = now; undefined = not yet). Like the lies and the picks, not in the reveal's first seconds
 * while a seat is left out.
 */
export function revealEndWait(game: GameScheme, now: number): number | undefined {
    const wait = revealDoneWait(game, now, seatsToWaitFor(game));
    return wait === undefined ? undefined : Math.max(wait, leftOutGuardWait(game, now));
}
