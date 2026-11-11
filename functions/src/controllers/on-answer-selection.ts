import { get, gamesRef } from '../firebase';
import { GameScheme, GameState } from '../game-model';
import { advance } from './tick';
import { stamp } from './answer-times';

/**
 * A write to games/{pin}/answerSelections. `pickers` are the players whose pick is new in this
 * write, and `at` the time of the write (see answer-times.ts); both are only used to measure the wait.
 */
export async function onAnswerSelection(pin: string, pickers: string[] = [], at: number = Date.now()) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));
    const answerSelectionCount = Object.keys(game.answerSelections || {}).length;
    const playersCount = Object.keys(game.players).length;

    // When each pick arrived. Only real players, only while picks are open; never fails the game.
    if (pickers.length && game.state.id === GameState.ShowAnswers) {
        const times: { [pid: string]: any } = {};
        pickers.filter(pid => game.players[pid]).forEach(pid => times[pid] = stamp(game.questionIndex, at));
        try {
            await gamesRef.child(pin).child('answerTimes').child('picks').update(times);
        } catch (e) {
            console.error('pick times not saved', pin, e && e.message);
        }
    }

    // Everyone has picked: end the answers phase now instead of waiting for the deadline.
    return answerSelectionCount === playersCount && game.state.id === GameState.ShowAnswers ?
        advance(pin, game.state) :
        Promise.resolve();
}
