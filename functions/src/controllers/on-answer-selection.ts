import { get, gamesRef } from '../firebase';
import { GameScheme, GameState } from '../game-model';

export async function onAnswerSelection(pin: string) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));
    const answerSelectionCount = Object.keys(game.answerSelections || {}).length;
    const playersCount = Object.keys(game.players).length;

    return answerSelectionCount === playersCount ?
        gamesRef.child(pin).child('tick').set(GameState.RevealTheTruth) :
        Promise.resolve();
}