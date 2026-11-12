import { isPlayer } from './scoring';
import { getQuestion } from './questions';
import { Answer, GameScheme, GameState } from '../game-model';
import { get, gamesRef } from '../firebase';
import { advance } from './tick';
import { isIdea } from './lie-helper';
import { isSameAnswer } from './same-answer';

export async function answer(pin: string, pid: string, playerAnswer: string) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));

    // A lie is taken from a player of this game, and only while the question is open.
    if (!game || !isPlayer(game, pid)) {
        return Promise.reject({ message: 'You are not in this game.', code: 'NOT_A_PLAYER' });
    }

    // Too late (the phone's clock, a slow network): the answers are on the table, so the lie is not
    // taken. The phone is already moving to the next screen; there is nothing for it to retry.
    if (!game.state || game.state.id !== GameState.ShowQuestion) {
        console.log(`[PIN: ${pin}] Lie not taken: the question is closed (state ${game.state && game.state.id})`);
        return;
    }

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

        const answered = Object.assign({}, game.answers, { [pid]: stored });
        const everyoneAnswered = Object.keys(game.players).every(k => Object.prototype.hasOwnProperty.call(answered, k));

        // Everyone has answered: end the question phase now instead of waiting for the deadline.
        return everyoneAnswered ?
            advance(pin, game.state) :
            Promise.resolve();
    }
}
