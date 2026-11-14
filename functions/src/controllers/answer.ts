import { isPlayer } from './scoring';
import { getQuestion } from './questions';
import { Answer, Answers, GameScheme, GameState } from '../game-model';
import { get, gamesRef } from '../firebase';
import { advance } from './tick';
import { everyoneSent, leftOutGuardWait } from './seats';
import { isIdea } from './lie-helper';
import { isSameAnswer } from './same-answer';
import { sentUpdate } from './sent';
import { writeMarks } from './mark-sent';
import { aboutOf } from '../game-model';
import { writingSent } from './about';

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

    // An About question (see about.ts): the player it is about writes the truth, kept where no phone
    // can read it; everyone else writes a lie as usual. No lie is refused as "too close to the truth":
    // the truth may not be in yet, and refusing one would tell its writer that they had guessed it.
    const about = aboutOf(game.state);
    if (about) {
        return aboutAnswer(pin, game, pid, playerAnswer, about.pid === pid);
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

        // The game as it is with this lie in it. The lies are read again after this one is written:
        // the game read above can miss lies that were sent at the same moment. When the last lies of
        // a question arrive together, every call has written its own lie before it reads, so the call
        // whose write lands last sees them all and ends the question; the others may end it too, and
        // advance() moves the game on once.
        const answers = await get<Answers>(gamesRef.child(pin).child('answers'));
        game.answers = Object.assign({}, game.answers, answers, { [pid]: stored });

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

/** A lie, or the named player's truth, on an About question. */
async function aboutAnswer(pin: string, game: GameScheme, pid: string, text: string, isTruth: boolean) {
    const clean = String(text || '').trim();
    if (!clean) {
        return;
    }

    if (isTruth) {
        game.aboutTruth = { pid, text: clean.toLowerCase() };
        await gamesRef.child(pin).child('aboutTruth').set(game.aboutTruth);
    } else {
        const stored: Answer = { text: clean.toLowerCase(), houseLie: false, realAnswer: false };
        await gamesRef.child(pin).child('answers').child(pid).set(stored);
        game.answers = Object.assign({}, game.answers, { [pid]: stored });
    }

    // The lies and the truth are read again after this send is written, as for a normal question:
    // the game read at the start can miss sends that came at the same moment (the named player's
    // truth and a lie, or two lies). Each call writes before it reads, so the call whose send lands
    // last sees them all and ends the question; the others may end it too, and advance() moves the
    // game on once.
    const [answers, truth] = await Promise.all([
        get<Answers>(gamesRef.child(pin).child('answers')),
        get<GameScheme['aboutTruth']>(gamesRef.child(pin).child('aboutTruth')),
    ]);
    game.answers = Object.assign({}, game.answers, answers, isTruth ? {} : { [pid]: game.answers[pid] });
    game.aboutTruth = isTruth ? game.aboutTruth : (truth || game.aboutTruth);

    const marked = writeMarks(pin, sentUpdate(game, [pid]));
    const ended = everyoneSent(game, writingSent(game)) && leftOutGuardWait(game, Date.now()) === 0 ?
        advance(pin, game.state) :
        Promise.resolve();

    return Promise.all([ended, marked]).then(([result]) => result);
}
