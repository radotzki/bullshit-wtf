import { GameScheme, GameState, GameStateInfo, revealSchedule, revealTiming } from '../game-model';

// How long each timed phase lasts. Must match game/src/app/services/game.service.ts.
export const durations = {
    [GameState.RoundIntro]: 3000,
    [GameState.ShowQuestion]: 25000,
    [GameState.ShowAnswers]: 20000,
    [GameState.ScoreBoard]: 3000,
};

// A client tick may arrive a little before the server's deadline because of clock skew.
export const clockSkewTolerance = 1500;

// The longest a single phase can last (a big-screen reveal of 9 rows: 8 players' lies and the truth),
// plus a margin; used to guard the server timer.
export const maxPhaseDuration = 9 * revealTiming.presenter.step + revealTiming.presenter.hold + 5000;

/**
 * How long the phase `stateId` lasts, given the game as it will be in that phase.
 * Returns undefined for phases that only end by a player's action (lobby, final scores).
 */
export function phaseDuration(stateId: number, game: Partial<GameScheme>): number | undefined {
    if (stateId === GameState.RevealTheTruth) {
        return revealSchedule(game.revealAnswers, !!game.presenter).duration;
    }

    return durations[stateId];
}

export function withDeadline(state: GameStateInfo, game: Partial<GameScheme>): GameStateInfo {
    const duration = phaseDuration(state.id, game);
    return duration === undefined ? state : Object.assign({}, state, { deadline: state.timestamp + duration });
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

    if (game.state.deadline) {
        return now >= game.state.deadline - clockSkewTolerance;
    }

    // Games started before deadlines existed: fall back to the old behaviour.
    return true;
}

/**
 * Whether the players' NEXT taps end the reveal now: every player has tapped, and the last row has been shown
 * (give or take clock skew). Returns how long to wait first (0 = now), or undefined if not.
 */
export function revealDoneWait(game: GameScheme, now: number): number | undefined {
    if (!game || !game.state || game.state.id !== GameState.RevealTheTruth) {
        return undefined;
    }

    const players = Object.keys(game.players || {});
    const done = game.revealDone || {};

    if (!players.length || !players.every(pid => done[pid] === true)) {
        return undefined;
    }

    const allShownAt = game.state.timestamp + revealSchedule(game.revealAnswers, !!game.presenter).allShown;
    return Math.max(0, allShownAt - clockSkewTolerance - now);
}
