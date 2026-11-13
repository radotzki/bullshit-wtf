import { isPlayer } from './scoring';
import { getQuestion } from './questions';
import { Answer, GameScheme, GameState } from '../game-model';
import { get, gamesRef } from '../firebase';
import { advance } from './tick';
import { everyoneSent, leftOutGuardWait } from './seats';
import { isIdea } from './lie-helper';
import { isSameAnswer } from './same-answer';
import { sentUpdate } from './sent';
import { writeMarks } from './mark-sent';

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

        // The game as it is with this lie in it.
        game.answers = Object.assign({}, game.answers, { [pid]: stored });

        // The seat is marked as done for the waiting screens (see sent.ts): that it sent, not what.
        // Alongside the step below, so the phase ends no later for it.
        const marked = writeMarks(pin, sentUpdate(game, [pid]));

        // Everyone has answered: end the question phase now instead of waiting for the deadline.
        // A seat that has sent nothing in this game is not waited for (see seats.ts); while one is
        // left out the phase timer ends the phase, once its first seconds are over.
        const ended = everyoneSent(game, game.answers) && leftOutGuardWait(game, Date.now()) === 0 ?
            advance(pin, game.state) :
            Promise.resolve();

        return Promise.all([ended, marked]).then(([result]) => result);
    }
}
