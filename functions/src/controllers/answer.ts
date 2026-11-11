import { getQuestion } from './questions';
import { Answer, GameScheme, GameState } from '../game-model';
import { get, gamesRef } from '../firebase';
import { advance } from './tick';
import { everyoneSent, leftOutGuardWait } from './seats';
import { isIdea } from './lie-helper';
import { isSameAnswer } from './same-answer';

export async function answer(pin: string, pid: string, playerAnswer: string) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));
    const qid = game.qids[game.questionIndex];
    const question = await getQuestion(qid);

    if (isSameAnswer(playerAnswer, question.realAnswer)) {
        return Promise.reject({ message: 'You entered the correct answer.', code: 'CORRECT_ANSWER' });
    } else {
        const stored: Answer = {
            text: playerAnswer.toLowerCase(),
            houseLie: false,
            realAnswer: false,
        };

        // Sent one of the round-1 helper's lies: counted for measuring, scored like any other lie.
        if (isIdea(game.ideas && game.ideas[pid], playerAnswer)) {
            stored.idea = true;
        }

        await gamesRef.child(pin).child('answers').child(pid).set(stored);

        // The game as it is with this lie in it.
        game.answers = Object.assign({}, game.answers, { [pid]: stored });

        // Everyone has answered: end the question phase now instead of waiting for the deadline.
        // A seat that has sent nothing in this game is not waited for (see seats.ts); while one is
        // left out the phase timer ends the phase, once its first seconds are over.
        return everyoneSent(game, game.answers) && game.state.id === GameState.ShowQuestion
            && leftOutGuardWait(game, Date.now()) === 0 ?
            advance(pin, game.state) :
            Promise.resolve();
    }
}
