/**
 * Who has sent: the marks behind the row of players on the two waiting screens.
 *
 * When a seat's lie or pick is in, the server writes the phase's name on that seat
 * (games/{pin}/players/{pid}/sent, see sentMark in game-model). Phones already read the players,
 * so they learn who is done and who the room waits for, and nothing about what anyone sent.
 *
 * The marks are for showing only. Nothing in the game reads them: when a phase ends, who is waited
 * for and every point are worked out from the lies and the picks themselves, as before. So a mark
 * that fails to be written costs a tick on a screen and nothing else.
 *
 * This file is pure (no Firebase) so it can be unit tested; mark-sent.ts does the writing.
 */
import { GameScheme, GameState, sentMark, sentMarkTime } from '../game-model';
import { isPlayer, playerPicks } from './scoring';

/**
 * The marks to write for `pids`, as paths under games/{pin}/players: `{ "<pid>/sent": mark }`.
 * Only for a seat that is a player of this game, and only where the mark would change.
 *
 * `late` is for a pick that is looked at after its phase is over (the last pick of a question can
 * land as the reveal starts): it can no longer show as done, so only a seat with no mark from this
 * game gets one, to say that somebody plays it.
 */
export function sentUpdate(game: GameScheme, pids: string[], late = false): { [path: string]: string } {
    const update: { [path: string]: string } = {};

    if (!game || !game.state || typeof game.state.timestamp !== 'number') {
        return update;
    }

    const mark = sentMark(game.state);
    const since = typeof game.timestamp === 'number' ? game.timestamp : 0;

    (pids || []).forEach(pid => {
        if (!isPlayer(game, pid)) {
            return;
        }
        const had = game.players[pid].sent;
        const inGame = sentMarkTime(had) > 0 && sentMarkTime(had) >= since;
        if (late ? !inGame : had !== mark) {
            update[`${pid}/sent`] = mark;
        }
    });

    return update;
}

/** The marks for the picks that count (see playerPicks), in whatever phase the game is on. */
export function pickMarks(game: GameScheme): { [path: string]: string } {
    if (!game || !game.state || game.state.id === GameState.GameStaging) {
        return {};
    }
    return sentUpdate(game, Object.keys(playerPicks(game)), game.state.id !== GameState.ShowAnswers);
}
