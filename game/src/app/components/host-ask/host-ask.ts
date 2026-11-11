/**
 * The ask a guest sees when a game ends: "start your own game", with a Create button and a
 * "Remind me" button that saves a calendar entry. Two of three new players first meet the game
 * as a guest and about 6% of them ever host, and until now nothing asked them.
 *
 * Also here: what a phone does when someone else presses REMATCH (see rematchMove).
 * Kept free of Angular so it can be tested in Node.
 */
import { CalendarEvent, defaultNight } from '../../pages/crew/next-night';

/** Where the ask is shown: the final screen, or the join page of a game that is over. */
export type AskPlace = 'after-game' | 'game-over';

/**
 * The campaign tag of a game created from the ask (opened_games.campaign). All four start with
 * "after-game", so `campaign LIKE 'after-game%'` counts every game this ask brought.
 */
export const ASK_TAGS = {
    'after-game': { create: 'after-game', remind: 'after-game-remind' },
    'game-over': { create: 'after-game-late', remind: 'after-game-late-remind' },
};

/** The content_type of the ask's presses in BigQuery `shares` (see SHARE_METHODS in the functions). */
export function askContentType(place: AskPlace) {
    return place === 'game-over' ? 'game-over' : 'after-game';
}

const SITE = 'https://bullshit.wtf';

/** Words of the ask, in the game's language. Hebrew avoids gendered verbs. */
export const hostAskStrings = {
    en: {
        title: 'Playing with other people this week?',
        text: 'Start your own game. It is free and takes 10 seconds.',
        lateTitle: 'Start your own game',
        lateText: 'No need to wait for them. It is free and takes 10 seconds.',
        create: 'START MY OWN GAME',
        remind: 'REMIND ME',
        saved: 'It is in your calendar. See you on game night!',
        google: 'Nothing happened? Add it to Google Calendar',
        eventTitle: 'Host a game of Bullshit',
        eventText: 'Game night: start a game of Bullshit here, send the link, and everyone joins on their own phone. '
            + 'Free, nothing to download.',
    },
    he: {
        title: 'נפגשים השבוע עם עוד אנשים?',
        text: 'פתחו משחק משלכם. זה בחינם ולוקח 10 שניות.',
        lateTitle: 'פתחו משחק משלכם',
        lateText: 'לא חייבים לחכות להם. זה בחינם ולוקח 10 שניות.',
        create: 'לפתוח משחק משלי',
        remind: 'להזכיר לי',
        saved: 'נשמר ביומן. נתראה בערב המשחק!',
        google: 'לא קרה כלום? אפשר להוסיף ליומן גוגל',
        eventTitle: 'לפתוח משחק בולשיט',
        eventText: 'ערב משחק: פותחים כאן משחק בולשיט, שולחים את הקישור, וכולם מצטרפים מהטלפון. בחינם, בלי להוריד כלום.',
    },
};

export type HostAskStrings = typeof hostAskStrings.en;

export function askStrings(locale: string): HostAskStrings {
    return locale === 'he' ? hostAskStrings.he : hostAskStrings.en;
}

/** A player row of the finished game, as the final screen reads it. */
export interface AskPlayer {
    pid?: string;
    uid?: string;
    /** The server's host mark (the phone that created the game, or pressed Replay). */
    host?: boolean;
}

export interface HostAskInput {
    /** A big screen: nobody presses anything on it. */
    presenter: boolean;
    /** This phone's player id in the finished game, if it played. */
    myPid?: string | null;
    myUid?: string | null;
    /** Uid of the browser that created (or replayed) the game, for games from before host marks. */
    creator?: string | null;
    /** This browser holds the game's host key. */
    holdsHostKey?: boolean;
    players: AskPlayer[];
}

/** Did this phone host the finished game? */
export function hostedGame(input: HostAskInput): boolean {
    if (input.holdsHostKey) {
        return true;
    }
    const players = (input.players || []).filter(p => !!p);
    const marked = players.filter(p => p.host)[0];
    if (marked) {
        return !!input.myPid && marked.pid === input.myPid;
    }
    return !!input.creator && !!input.myUid && input.creator === input.myUid;
}

/**
 * The final screen shows the ask to a player of this game who did not host it. Not on a big
 * screen, not to someone who only watches, and not after a solo game (that player is its host).
 */
export function showHostAsk(input: HostAskInput): boolean {
    const players = (input.players || []).filter(p => !!p);
    if (input.presenter || !input.myPid || players.length < 2) {
        return false;
    }
    if (!players.some(p => p.pid === input.myPid)) {
        return false;
    }
    return !hostedGame(input);
}

/** The Create page, in the game's language, with the tag that marks the new game. */
export function askCreateUrl(tag: string, locale: string) {
    return `${SITE}/create-game?via=${tag}&lang=${locale === 'he' ? 'he' : 'en'}`;
}

/** The night the reminder is for: the coming game night (see defaultNight), at 21:00. */
export function reminderNight(now: Date, locale: string): Date {
    return defaultNight(now, locale);
}

/** The calendar entry "Remind me" saves: a game night, with the link that opens Create. */
export function reminderEvent(start: Date, place: AskPlace, locale: string): CalendarEvent {
    const t = askStrings(locale);
    const tag = ASK_TAGS[place === 'game-over' ? 'game-over' : 'after-game'].remind;
    return {
        title: t.eventTitle,
        text: t.eventText,
        url: askCreateUrl(tag, locale),
        uid: `host-${start.getTime()}`,
    };
}

export const REMINDER_FILE = 'bullshit-game-night.ics';

// ---------------------------------------------------------------------------
// REMATCH pressed on another phone.

export interface RematchInput {
    /** A big screen follows at once: nobody shares or saves from it. */
    presenter: boolean;
    /** This phone pressed REMATCH itself. */
    pressed: boolean;
    /** The new game has left its lobby: the host pressed START. */
    started: boolean;
    /** This player has the share sheet or the crew form open. */
    busy: boolean;
}

/**
 * What a phone on the final screen does once a rematch exists.
 *
 * It used to follow at once, so the fastest finger in the room decided whether anyone else could
 * share the results, save the crew or read the screen. Now only the phone that pressed REMATCH
 * (and a big screen) goes straight to the new lobby. Every other phone stays, and its REMATCH
 * button becomes JOIN THE REMATCH ('offer'). Nobody is left behind: every player of the old game
 * already has a seat in the new one, and when the host starts it, a phone that is still here
 * follows ('go') unless its player is in the middle of sharing or saving; that one follows when
 * the sheet or form closes.
 */
export function rematchMove(input: RematchInput): 'go' | 'offer' {
    if (input.presenter || input.pressed) {
        return 'go';
    }
    return input.started && !input.busy ? 'go' : 'offer';
}

export const rematchStrings = {
    en: {
        join: 'JOIN THE REMATCH',
        waiting: (name: string) => name ? `${name} started a rematch` : 'A rematch is waiting for you',
        started: 'The rematch has started. Tap to jump in',
    },
    he: {
        join: 'להצטרף למשחק החוזר',
        waiting: (name: string) => name ? `המשחק החוזר של ${name} מחכה` : 'משחק חוזר מחכה',
        started: 'המשחק החוזר התחיל. לחיצה ונכנסים',
    },
};
