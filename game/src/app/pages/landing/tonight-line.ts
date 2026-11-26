/**
 * "Not now? Send it to your group for tonight": a small line under Start on both homes, for a
 * visitor who has never played. Most search visitors leave the home's first screen without
 * pressing anything, many of them in the daytime, with nobody around to play with. The line hands
 * them a WhatsApp message with the home's link, so the group can play in the evening.
 *
 * The link carries its own tag (?via=home-tonight-he / home-tonight-en), so the visits and the games
 * it brings are counted apart. The press is counted in BigQuery `shares` like the other WhatsApp
 * buttons; the server only takes the content types it knows (SHARE_METHODS in the functions), so
 * until it has one of its own the row is content_type 'invite', method 'whatsapp', with
 * crew_id 'hometonight' marking it: a lobby invite never has a crew_id.
 *
 * Kept free of Angular so it can be tested in Node (test/tonight-line.test.js).
 */

const SITE = 'https://bullshit.wtf';

/** The tag the shared link carries, by the home's language. */
export const TONIGHT_TAGS = { he: 'home-tonight-he', en: 'home-tonight-en' };

/** How a press is counted (ApiService.logShare): an existing content type and method, marked by crew. */
export const TONIGHT_SHARE = { content: 'invite', method: 'whatsapp', crew: 'hometonight' };

export interface TonightStrings {
    /** The line under Start. */
    line: string;
    /** The WhatsApp message, before the link. */
    message: string;
}

const words: { en: TonightStrings; he: TonightStrings } = {
    en: {
        line: 'Not now? Send it to your group for tonight',
        message: 'Bullshit: a party game on our phones. We make up answers and try to fool each other. '
            + 'Free, no app. Play tonight?',
    },
    he: {
        line: 'לא עכשיו? שלחו לקבוצה ותשחקו בערב',
        message: 'בולשיט: משחק חברה בטלפונים. ממציאים תשובות ומנסים לעבוד אחד על השני. '
            + 'חינם, בלי אפליקציה. משחקים הערב?',
    },
};

export function tonightStrings(lang: string): TonightStrings {
    return lang === 'he' ? words.he : words.en;
}

/** The home's address in the visitor's language, tagged: the Hebrew home for Hebrew. */
export function tonightLink(lang: string): string {
    return lang === 'he' ? `${SITE}/he?via=${TONIGHT_TAGS.he}` : `${SITE}/?via=${TONIGHT_TAGS.en}`;
}

/** The line's href: a wa.me text link, the message and then the link on its own line. */
export function tonightHref(lang: string): string {
    const text = `${tonightStrings(lang).message}\n${tonightLink(lang)}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Only for a browser that has never played (front-door.ts readVisitor: no seat, host key or crew kept). */
export function showTonight(visitor: { played: boolean } | null | undefined): boolean {
    return !visitor || !visitor.played;
}

/**
 * Reads a key the game keeps in this browser: localStorage, else the tab's storage, else nothing.
 * The same reading as the phone home's, for the computer home, which kept no visitor until now.
 */
export function readStored(key: string): string | null {
    try {
        const value = window.localStorage.getItem(key);
        if (value !== null) {
            return value;
        }
    } catch (e) { }
    try {
        return window.sessionStorage.getItem(key);
    } catch (e) {
        return null;
    }
}
