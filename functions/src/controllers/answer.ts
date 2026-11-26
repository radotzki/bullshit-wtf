import { isPlayer } from './scoring';
import { getQuestion } from './questions';
import { Answer, Answers, GameScheme, GameState } from '../game-model';
import { get, gamesRef } from '../firebase';
import { readGame, isMoved } from './old-games';
import { advance } from './tick';
import { everyoneSent, leftOutGuardWait } from './seats';
import { isIdea } from './lie-helper';
import { isSameAnswer, isPartOfTruth } from './same-answer';
import { stamp } from './answer-times';
import { sentUpdate } from './sent';
import { writeMarks } from './mark-sent';
import { aboutOf } from '../game-model';
import { writingSent } from './about';
import { matchOffer } from './pair';
import { filtersLies, lieRefused, FLAGGED_LIE } from './portal';

/**
 * A player's lie for the current question. `decoy`: in a pair game (see pair.ts), the house lie the
 * player chose to fool their friend with, sent with the lie. It is kept only if it is one of the lies
 * offered to this player and not the lie they wrote; else the server picks one of their offers when
 * the answers go on the table.
 */
export async function answer(pin: string, pid: string, playerAnswer: string, decoy?: string) {
    pin = pin.toUpperCase();
    const game = await readGame(pin);

    // A lie is taken from a player of this game, and only while the question is open.
    if (!game || !isPlayer(game, pid)) {
        return Promise.reject({ message: 'You are not in this game.', code: 'NOT_A_PLAYER' });
    }

    // Too late (the phone's clock, a slow network): the answers are on the table, so the lie is not
    // taken. The phone is already moving to the next screen; there is nothing for it to retry.
    // An old game (see old-games.ts) whose question was left open takes no lie either.
    if (!game.state || game.state.id !== GameState.ShowQuestion || isMoved(game)) {
        console.log(`[PIN: ${pin}] Lie not taken: the question is closed (state ${game.state && game.state.id})`);
        return;
    }

    // An About question (see about.ts): the player it is about writes the truth, kept where no phone
    // can read it; everyone else writes a lie as usual. No lie is refused as "too close to the truth":
    // the truth may not be in yet, and refusing one would tell its writer that they had guessed it.
    // A portal game or a kids' game (see portal.ts): a lie with swearing, a slur or a sex word is refused; its writer tries another.
    if (filtersLies(game) && lieRefused(playerAnswer)) {
        return Promise.reject(FLAGGED_LIE);
    }

    const about = aboutOf(game.state);
    if (about) {
        return aboutAnswer(pin, game, pid, playerAnswer, about.pid === pid);
    }

    const qid = game.qids[game.questionIndex];
    const question = await getQuestion(qid);

    // The truth, typed a little differently, or only a part of it ("Germany" for "Nazi Germany"):
    // refused (see same-answer.ts). The same code for both, so a phone that is still on an older page
    // shows its message; `part` lets a newer one say "too close to the truth" and not "the correct answer".
    if (isSameAnswer(playerAnswer, question.realAnswer)) {
        return Promise.reject({ message: 'You entered the correct answer.', code: 'CORRECT_ANSWER' });
    } else if (isPartOfTruth(playerAnswer, question.realAnswer)) {
        return Promise.reject({ message: 'Too close to the correct answer.', code: 'CORRECT_ANSWER', part: true });
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
        // A pair game's decoy, where no phone can read it. A lie sent again replaces the choice.
        if (game.pair === true) {
            const offer = matchOffer(game.ideas && game.ideas[pid], decoy);
            const kept = offer && !isSameAnswer(offer, playerAnswer) ? offer : null;
            await gamesRef.child(pin).child('decoys').child(pid).set(kept)
                .catch(e => console.error('decoy not saved', pin, e && e.message));
        }
        // When the lie arrived, to measure the wait. Never fails the answer.
        await gamesRef.child(pin).child('answerTimes').child('lies').child(pid).set(stamp(game.questionIndex, Date.now()))
            .catch(e => console.error('lie time not saved', pin, e && e.message));

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
