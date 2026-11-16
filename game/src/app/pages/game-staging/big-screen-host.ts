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

/**
 * The big screen keeps "scan the code to join" up until the host's own phone is in.
 *
 * The host gives up their seat with the press and joins again from a phone, as a new player. The page
 * can't tell that phone from any other new one, so at the press it notes who was in (the guests' ids)
 * and the name on the host's seat (pressedWith), in this tab's storage, so a reload of the big screen
 * keeps it. The line stays until a player who was not in at the press joins under the host's name
 * (spaces and case aside). Guests who join first, before or after the press, don't end it: with only
 * the guests' ids, a second guest who joined before the host took the line away, and the host had no
 * word on where to join (found in Product's review of #144, in English and Hebrew). A host who types another name on the phone keeps the
 * line up for the whole lobby, which is right for anyone still in the room.
 *
 * Without the host's name in the note (the address opened in another tab, or a note from before this
 * change) any new player ends the line, as before.
 */
export const PRESSED_WITH_KEY = 'BS_BIG_SCREEN_PRESSED_WITH_';

export interface BigScreenPlayer {
    pid?: string;
    host?: boolean;
    nickname?: string;
}

/** A name as the line compares it: one space between words, trimmed, any case. */
export function sameName(name: any): string {
    return String(name == null ? '' : name).replace(/\s+/g, ' ').trim().toLowerCase();
}

/** The note to keep at the press: the ids of the players in the lobby without the host's own seat, and that seat's name. */
export function pressedWith(players: BigScreenPlayer[]): string {
    const list = (players || []).filter(p => p && p.pid);
    const host = list.filter(p => p.host).map(p => sameName(p.nickname)).filter(n => !!n)[0] || null;
    return JSON.stringify({ with: list.filter(p => !p.host).map(p => p.pid), host });
}

/** Show "scan the code to join" on the big screen: the host has not joined from a phone yet. */
export function hostStillToJoin(note: string | null, players: BigScreenPlayer[]): boolean {
    let before: string[] = [];
    let hostName: string = null;
    try {
        const parsed = note ? JSON.parse(note) : [];
        // A note from before the host's name was kept is a plain list of ids.
        const ids = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.with) ? parsed.with : []);
        before = ids.filter(id => typeof id === 'string');
        hostName = parsed && !Array.isArray(parsed) && typeof parsed.host === 'string' && sameName(parsed.host) || null;
    } catch (e) {
        before = [];
    }
    const newcomers = (players || []).filter(p => p && p.pid && before.indexOf(p.pid) < 0);
    return hostName
        ? !newcomers.some(p => sameName(p.nickname) === hostName)
        : !newcomers.length;
}

const strings = {
    en: {
        ask: 'Everyone in one room?',
        how: 'Put the game on this screen. You join from your phone like everyone else, and press START here.',
        button: 'USE AS THE BIG SCREEN',
        // On the big screen, until the host joins from a phone under their name (hostStillToJoin).
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
