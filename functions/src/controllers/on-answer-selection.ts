import { playerPicks } from './scoring';
import { get, gamesRef } from '../firebase';
import { everyoneSent, leftOutGuardWait } from './seats';
import { GameScheme, GameState } from '../game-model';
import { advance } from './tick';
import { pickMarks } from './sent';
import { writeMarks } from './mark-sent';

export async function onAnswerSelection(pin: string) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));

    // The seats whose pick is in are marked as done for the waiting screens (see sent.ts): that
    // they picked, not what. Alongside the step below, so the phase ends no later for it.
    const marked = game ? writeMarks(pin, pickMarks(game)) : Promise.resolve();

    // Everyone has picked: end the answers phase now instead of waiting for the deadline.
    // A seat that has sent nothing in this game is not waited for (see seats.ts); while one is
    // left out the phase timer ends the phase, once its first seconds are over.
    // Only a player's pick counts (see scoring.ts).
    const ended = everyoneSent(game, playerPicks(game)) && game.state.id === GameState.ShowAnswers
        && leftOutGuardWait(game, Date.now()) === 0 ?
        advance(pin, game.state) :
        Promise.resolve();

    return Promise.all([ended, marked]).then(([result]) => result);
}
