import { get, gamesRef } from '../firebase';
import { GameScheme, GameState } from '../game-model';
import { advance } from './tick';

export async function onAnswerSelection(pin: string) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));
    const answerSelectionCount = Object.keys(game.answerSelections || {}).length;
    const playersCount = Object.keys(game.players).length;

    // Everyone has picked: end the answers phase now instead of waiting for the deadline.
    return answerSelectionCount === playersCount && game.state.id === GameState.ShowAnswers ?
        advance(pin, game.state) :
        Promise.resolve();
}