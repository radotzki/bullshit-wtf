import { playerPicks } from './scoring';
import { get, gamesRef } from '../firebase';
import { everyoneSent, leftOutGuardWait } from './seats';
import { GameScheme, GameState } from '../game-model';
import { advance } from './tick';
import { stamp } from './answer-times';
import { pickMarks } from './sent';
import { writeMarks } from './mark-sent';

/**
 * A write to games/{pin}/answerSelections. `pickers` are the players whose pick is new in this
 * write, and `at` the time of the write (see answer-times.ts); both are only used to measure the wait.
 */
export async function onAnswerSelection(pin: string, pickers: string[] = [], at: number = Date.now()) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));

    // The seats whose pick is in are marked as done for the waiting screens (see sent.ts): that
    // they picked, not what. Alongside the step below, so the phase ends no later for it.
    const marked = game ? writeMarks(pin, pickMarks(game)) : Promise.resolve();

    // When each pick arrived. Only real players, only while picks are open; never fails the game.
    if (game && game.state && pickers.length && game.state.id === GameState.ShowAnswers) {
        const times: { [pid: string]: any } = {};
        pickers.filter(pid => game.players[pid]).forEach(pid => times[pid] = stamp(game.questionIndex, at));
        try {
            await gamesRef.child(pin).child('answerTimes').child('picks').update(times);
        } catch (e) {
            console.error('pick times not saved', pin, e && e.message);
        }
    }

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
