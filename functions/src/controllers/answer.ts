import { getQuestion } from './questions';
import { GameScheme, GameState } from '../game-model';
import { get, gamesRef } from '../firebase';

export async function answer(pin: string, pid: string, playerAnswer: string) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));
    const qid = game.qids[game.questionIndex];
    const question = await getQuestion(qid);

    if (question.realAnswer.toLowerCase() === playerAnswer.toLowerCase()) {
        return Promise.reject({ message: 'You entered the correct answer.', code: 'CORRECT_ANSWER' });
    } else {
        await gamesRef.child(pin).child('answers').child(pid).set({
            text: playerAnswer.toLowerCase(),
            houseLie: false,
            realAnswer: false,
        });

        const totalAnswers = Object.keys(game.answers || {}).length + 1;
        const totalPlayers = Object.keys(game.players).length;

        return totalAnswers === totalPlayers ?
            gamesRef.child(pin).child('tick').set(GameState.ShowAnswers) :
            Promise.resolve();
    }
}
