import { get, gamesRef } from '../firebase';
import { everyoneSent, leftOutGuardWait } from './seats';
import { GameScheme, GameState } from '../game-model';
import { advance } from './tick';

export async function onAnswerSelection(pin: string) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));

    // Everyone has picked: end the answers phase now instead of waiting for the deadline.
    // A seat that has sent nothing in this game is not waited for (see seats.ts); while one is
    // left out the phase timer ends the phase, once its first seconds are over.
    return everyoneSent(game, game.answerSelections) && game.state.id === GameState.ShowAnswers
        && leftOutGuardWait(game, Date.now()) === 0 ?
        advance(pin, game.state) :
        Promise.resolve();
}