/**
 * Where a phone shows the question while players write and choose.
 *
 * With a big screen in the room (a TV or computer opened as the big screen, or the host's own computer
 * turned into it), the big screen shows the question large, so the answers screen on a phone keeps only
 * the buttons and a "what was the question?" button. With no big screen (a phone-only game, often a
 * family round a table), the phone is the only place the question is: it stands above the answers, at
 * a size a grandparent reads on a 320 px phone.
 */

/** A big screen is in the game: a presenter joined, or the host made their computer the big screen. */
export function bigScreenInGame(presenter: any, hasHost: any): boolean {
    return !!presenter || hasHost === 'screen';
}

export interface AnswersQuestionInput {
    /** This browser is the big screen. */
    isPresenter: boolean;
    /** A taste (a game started alone): no writing screen came first. */
    taste: boolean;
    /** Whether the game has a big screen; null while still unknown. */
    bigScreen: boolean | null;
}

export interface AnswersQuestionView {
    /** The question above the answers. */
    above: boolean;
    /** The "what was the question?" button under the answers. */
    askButton: boolean;
}

/** What a phone's answers screen shows of the question. */
export function answersQuestion(input: AnswersQuestionInput): AnswersQuestionView {
    if (input.isPresenter) {
        return { above: false, askButton: false };
    }
    if (input.taste || input.bigScreen === false) {
        return { above: true, askButton: false };
    }
    // A big screen, or not known yet: no button until it is known, so a phone-only game never flashes it.
    return { above: false, askButton: input.bigScreen === true };
}
