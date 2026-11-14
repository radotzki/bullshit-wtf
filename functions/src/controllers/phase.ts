import {
    GameScheme, GameState, GameStateInfo, MAX_PLAYERS, revealSchedule, revealTiming, stagedRevealTiming, scoreBoardDuration, LAUGH_HOLD_MS,
} from '../game-model';

// How long each timed phase lasts. Must match game/src/app/services/game.service.ts.
export const durations = {
    [GameState.RoundIntro]: 3000,
    [GameState.ShowQuestion]: 25000,
    [GameState.ShowAnswers]: 20000,
    [GameState.ScoreBoard]: 3000,
};

// A client tick may arrive a little before the server's deadline because of clock skew.
export const clockSkewTolerance = 1500;

// The longest a single phase can last (a big-screen reveal of MAX_PLAYERS + 1 rows: every player picked
// a different answer that is not the truth, then the truth; in today's reveal or the staged one), plus a
// margin; used to guard the server timer. With 12 seats that is about 70 seconds.
export const maxPhaseDuration = Math.max(
    (MAX_PLAYERS + 1) * revealTiming.presenter.step + revealTiming.presenter.hold,
    MAX_PLAYERS * stagedRevealTiming.presenter.step + stagedRevealTiming.presenter.truthIntro
        + stagedRevealTiming.presenter.writerAt + stagedRevealTiming.presenter.hold,
) + LAUGH_HOLD_MS + 5000;

/** The game plays the staged reveal (see bigReveal in game-model). Only `true` counts. */
export function isStaged(game: Partial<GameScheme> | null | undefined): boolean {
    return !!game && game.bigReveal === true;
}

/**
 * How long the phase `stateId` lasts, given the game as it will be in that phase.
 * Returns undefined for phases that only end by a player's action (lobby, final scores).
 */
export function phaseDuration(stateId: number, game: Partial<GameScheme>): number | undefined {
    if (stateId === GameState.RevealTheTruth) {
        return revealSchedule(game.revealAnswers, !!game.presenter, isStaged(game)).duration;
    }

    // The staged reveal shows the scores itself: its scoreboard phase lasts 0 ms. The phase still
    // happens (scores are added on the way in, the question is counted on the way out), so the state
    // machine and older clients, which pass through the scoreboard page, are untouched.
    if (stateId === GameState.ScoreBoard) {
        return scoreBoardDuration(isStaged(game));
    }

    return durations[stateId];
}

/**
 * The state as the server writes it: with its deadline, and with staged: true in a staged-reveal game.
 */
export function withDeadline(state: GameStateInfo, game: Partial<GameScheme>): GameStateInfo {
    const duration = phaseDuration(state.id, game);
    return withStaged(duration === undefined ? state : Object.assign({}, state, { deadline: state.timestamp + duration }), game);
}

/**
 * Phones learn that a game plays the staged reveal from its state, which every phone may read and only
 * the server may write: every state of such a game carries staged: true, from the lobby on. A game that
 * keeps today's reveal carries nothing, like a game outside the test.
 */
export function withStaged(state: GameStateInfo, game: Partial<GameScheme>): GameStateInfo {
    return isStaged(game) ? Object.assign({}, state, { staged: true }) : state;
}

/** A phase that is over as it starts (the scoreboard of a staged-reveal game). */
export function endsAtOnce(state: GameStateInfo | null | undefined): boolean {
    return !!state && typeof state.deadline === 'number' && state.deadline <= state.timestamp;
}

/** The key that names one occurrence of a phase. Used for tick writes and the advance lock. */
export function stateKey(state: GameStateInfo) {
    return `${state.id}:${state.timestamp}`;
}

/** The state a legacy tick value (the state the client wanted to move to) moves away from. */
export function legacyFromState(tick: number) {
    return tick === 999 ? GameState.ScoreBoard : tick - 1;
}

/**
 * Whether a tick written by a client should move the game on from its current state.
 * A tick only counts for the state it names, and for a timed phase only once its deadline has passed,
 * so a late or repeated tick from one phone can never skip a phase.
 */
export function tickAllowed(game: GameScheme, tick: number | string, now: number): boolean {
    if (!game || !game.state || tick === undefined || tick === null) {
        return false;
    }

    let namesCurrentState: boolean;

    if (typeof tick === 'string') {
        namesCurrentState = tick === stateKey(game.state);
    } else {
        namesCurrentState = tick !== game.state.id && legacyFromState(tick) === game.state.id;
    }

    if (!namesCurrentState || game.state.id === GameState.ScoreBoardFinal) {
        return false;
    }

    // A game made by a current client starts only through startGame, which checks for the host.
    // Any phone can write a tick, so a tick never starts such a game.
    if (game.state.id === GameState.GameStaging && game.serverStart) {
        return false;
    }

    if (game.state.deadline) {
        return now >= game.state.deadline - clockSkewTolerance;
    }

    // Games started before deadlines existed: fall back to the old behaviour.
    return true;
}

/**
 * Whether the players' NEXT taps end the reveal now: every player has tapped, and the last row has been shown
 * (give or take clock skew). Returns how long to wait first (0 = now), or undefined if not.
 * `seats` are the players to wait for, when not all of them (see revealEndWait in seats.ts).
 */
export function revealDoneWait(game: GameScheme, now: number, seats?: string[]): number | undefined {
    if (!game || !game.state || game.state.id !== GameState.RevealTheTruth) {
        return undefined;
    }

    const players = seats || Object.keys(game.players || {});
    const done = game.revealDone || {};

    if (!players.length || !players.every(pid => done[pid] === true)) {
        return undefined;
    }

    const allShownAt = game.state.timestamp + revealSchedule(game.revealAnswers, !!game.presenter, isStaged(game)).allShown;
    return Math.max(0, allShownAt - clockSkewTolerance - now);
}
