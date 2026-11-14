import { MAX_PLAYERS, GameScheme, GameState } from '../game-model';
import { get, gamesRef } from '../firebase';

/** A game nobody has moved on for this long is dead, whatever phase it stopped in. */
export const STALE_MS = 6 * 60 * 60 * 1000;
/** A game that ended this recently: its players may still start a rematch. */
export const JUST_ENDED_MS = 30 * 60 * 1000;

/** The last time anything moved this game on (server times). 0 when the game has none. */
function lastMove(game: GameScheme): number {
    const state = game.state;
    return Math.max(Number(state && state.timestamp) || 0, Number(game.timestamp) || 0, Number(game.hostSeen) || 0);
}

/** The game reached its final scoreboard, or has sat still for STALE_MS. */
export function isGameOver(game: GameScheme, now: number): boolean {
    if (!game) {
        return false;
    }
    if (game.state && game.state.id === GameState.ScoreBoardFinal) {
        return true;
    }
    const last = lastMove(game);
    return last > 0 && now - last > STALE_MS;
}

export interface GameOverError {
    message: string;
    code: 'GAME_OVER';
    /** PIN of this game's rematch, while its lobby is still open. */
    rematch?: string;
    /** It ended in the last JUST_ENDED_MS, so its players may still press Replay. */
    justEnded?: boolean;
}

/**
 * Why a phone may not join this game because it is over, or null if it is not over.
 * A typo can hit an old game's PIN; this keeps new players out of dead games, and sends a late
 * friend on to the rematch when there is one waiting.
 */
export async function gameOverError(game: GameScheme, now: number): Promise<GameOverError | null> {
    if (!isGameOver(game, now)) {
        return null;
    }
    const error: GameOverError = { message: 'That game is over', code: 'GAME_OVER' };
    if (game.fork) {
        const rematch = await get<GameScheme>(gamesRef.child(game.fork));
        if (rematch && !isGameOver(rematch, now) && rematch.state && rematch.state.id === GameState.GameStaging
            && Object.keys(rematch.players || {}).length < MAX_PLAYERS) {
            error.rematch = game.fork;
        }
    }
    if (!error.rematch && game.state && game.state.id === GameState.ScoreBoardFinal
        && now - lastMove(game) <= JUST_ENDED_MS) {
        error.justEnded = true;
    }
    return error;
}
