import { getQuestion } from './questions';
import { Answer, GameScheme, GameState } from '../game-model';
import { get, gamesRef } from '../firebase';
import { advance } from './tick';
import { isIdea } from './lie-helper';

export async function answer(pin: string, pid: string, playerAnswer: string) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));
    const qid = game.qids[game.questionIndex];
    const question = await getQuestion(qid);

    if (question.realAnswer.toLowerCase() === playerAnswer.toLowerCase()) {
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

        const totalAnswers = Object.keys(game.answers || {}).length + 1;
        const totalPlayers = Object.keys(game.players).length;

        // Everyone has answered: end the question phase now instead of waiting for the deadline.
        return totalAnswers === totalPlayers && game.state.id === GameState.ShowQuestion ?
            advance(pin, game.state) :
            Promise.resolve();
    }
}
