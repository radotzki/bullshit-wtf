/**
 * A host on a computer can make that computer the big screen.
 *
 * Why: a host who makes a game on a computer is seated there as a player, so the screen the room would
 * look at shows the host's own lies. In 6 to 13 November 2026 a computer host got a table 36% of the
 * time, a phone host 74%. People who know party games on a TV expect the computer to be the shared
 * screen and everyone to play on a phone.
 *
 * One button in the computer host's lobby. The server frees the host's seat and marks the game as
 * hosted from its big screen (functions: hostToBigScreen in start.ts); this browser keeps the host key,
 * becomes the big screen, and is where START is pressed. The host joins from a phone like everyone
 * else. No phone gets the host's powers.
 *
 * Kept free of Angular so it can be tested in Node.
 */
import { HostDevice } from './lone-host';

export interface BigScreenOfferInput {
    /** This page is the game's known host (see LobbyHostView.isHost). */
    isHost: boolean;
    /** This browser holds the game's host key: the server asks for it. */
    holdsHostKey: boolean;
    isPresenter: boolean;
    hasPresenter: boolean;
    device: HostDevice;
}

/** Offer the button: the host's own page, on a computer, with the host key, in a game with no big screen yet. */
export function offerBigScreen(input: BigScreenOfferInput): boolean {
    return !!input.isHost && !!input.holdsHostKey && !input.isPresenter && !input.hasPresenter
        && input.device === 'computer';
}

const strings = {
    en: {
        ask: 'Everyone in one room?',
        how: 'Put the game on this screen. You join from your phone like everyone else, and press START here.',
        button: 'USE AS THE BIG SCREEN',
        // On the big screen, until the first player is in.
        joinNow: 'This is the big screen now. Scan the code with your phone to join.',
    },
    he: {
        ask: 'כולם באותו חדר?',
        // "מתחילים" is the START button's word in a Hebrew game: gameStrings('he').start.
        how: 'שימו את המשחק על המסך הזה. אתם מצטרפים מהטלפון כמו כולם, ולוחצים כאן על "מתחילים".',
        button: 'להפוך למסך הגדול',
        // "הקוד" is the PIN in the header above, so the QR code is a ברקוד here, as in lone-host.ts.
        joinNow: 'זה עכשיו המסך הגדול. סרקו את הברקוד בטלפון כדי להצטרף.',
    },
};

export type BigScreenStrings = typeof strings.en;

export function bigScreenStrings(locale: string): BigScreenStrings {
    return locale === 'he' ? strings.he : strings.en;
}
