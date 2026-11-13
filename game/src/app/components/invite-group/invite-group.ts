/**
 * INVITE ANOTHER GROUP: the ask half of guests see when a game ends, in place of "start your own
 * game" (host-ask.ts). START MY OWN GAME opens a lobby now, when the friends the guest could host
 * are somewhere else. This ask has the guest pick a night and send a link to those friends; the link
 * is a crew page ("Noa's table"), so they say "I'm in" there and on the night the guest opens the
 * lobby and hosts (see pages/crew/crew-night.ts).
 *
 * A 50/50 test by browser. Kept free of Angular so it can be tested in Node.
 */
import { CalendarEvent, nightLabel } from '../../pages/crew/next-night';

const SITE = 'https://bullshit.wtf';

/** The content_type of the ask's rows in BigQuery `shares` (see SHARE_METHODS in the functions). */
export const INVITE_CONTENT = 'host-invite';

/**
 * The join source the table's link carries, and so the campaign of a game a friend creates in the
 * tab it opened. The games the table's own lobby opens are marked by the server (Crew.campaign).
 */
export const TABLE_VIA = 'table';

/**
 * The campaign tag of a game made from "or start a game right now". It starts with "after-game",
 * like every game today's ask brings, so `campaign LIKE 'after-game%'` still counts them all.
 */
export const INVITE_NOW_TAG = 'after-game-invite';

/** A tester's switch: localStorage BS_HOST_INVITE = 'new' or 'classic' puts this browser in that half. */
export const INVITE_HALF_KEY = 'BS_HOST_INVITE';

export type InviteHalf = 'new' | 'classic';

/**
 * Which half of the test a browser is in, from its anonymous id: one bit of a small hash of
 * 'host-invite:' + id, so a browser keeps its half from game to game and the halves are even. Null
 * for a browser with no id (sign-in failed): it keeps today's ask and is not in the test. Every
 * phone that shows an ask sends a `seen-new` or `seen-classic` row, so the split is measured.
 */
export function inviteHalf(uid: string | null | undefined, forced?: string | null): InviteHalf | null {
    if (forced === 'new' || forced === 'classic') {
        return forced;
    }
    if (!uid || typeof uid !== 'string') {
        return null;
    }
    const text = 'host-invite:' + uid;
    // h = h * 131 + code, kept under a prime just below 2^32 (every step stays an exact integer).
    let h = 7;
    for (let i = 0; i < text.length; i++) {
        h = (h * 131 + text.charCodeAt(i)) % 4294967291;
    }
    // Two more rounds, so ids that differ in one late character still part ways.
    h = (h * 1000003 + 12345) % 4294967291;
    h = (h * 1000003 + 12345) % 4294967291;
    return Math.floor(h / 65536) % 2 === 1 ? 'new' : 'classic';
}

// Hanukkah. The pack's own guest ask (pull requests 100 and 104: "Lighting with the other side of
// the family?", "another candle tomorrow") wins on its evenings: every guest of a Hanukkah game
// keeps today's ask then, and none of them is in this test.

/** The evenings that ask speaks of Hanukkah: from the eve of the first candle to the eighth. Hanukkah 5787. */
export const CANDLE_EVENINGS = { from: '2026-12-03', to: '2026-12-11' };
/** An evening runs past midnight to this hour: a game that ends at 00:40 is still that night's. */
const EVENING_TURNS_AT = 5;

/**
 * Is the Hanukkah ask on for this game, now? The same rule as hanukkahEvening in host-ask.ts once
 * the Hanukkah pack is merged (any value but null); when both are in, this can call that.
 */
export function candleEvening(now: Date, pack?: string | null): boolean {
    if (pack !== 'hanukkah') {
        return false;
    }
    const e = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() - EVENING_TURNS_AT, 12);
    const two = (n: number) => (n < 10 ? '0' : '') + n;
    const day = `${e.getFullYear()}-${two(e.getMonth() + 1)}-${two(e.getDate())}`;
    return day >= CANDLE_EVENINGS.from && day <= CANDLE_EVENINGS.to;
}

/** Words of the ask and its sheet, in the game's language. Hebrew avoids gendered verbs. */
export const inviteStrings = {
    en: {
        title: 'Know another group that would fall for this?',
        text: 'Pick a night and send them the link. You host: it\'s free and takes 10 seconds.',
        button: 'INVITE ANOTHER GROUP',
        now: 'or start a game right now',
        sheetTitle: 'YOUR GAME NIGHT',
        change: 'CHANGE',
        day: 'Day',
        time: 'Time',
        past: 'That time has passed. Pick a later one.',
        whatsapp: 'SEND ON WHATSAPP',
        calendar: 'ADD TO MY CALENDAR',
        google: 'or add it to Google Calendar',
        other: 'Share another way',
        copied: 'Copied! Paste it in their group chat.',
        set: 'Game night is set:',
        see: 'See who\'s in',
        failed: 'That did not go through.',
        retry: 'Try again',
        done: 'DONE',
        eventText: 'Your game night. Open this link and press OPEN THE LOBBY: your friends join from their phones.',
        eventTitle: (table: string) => `Bullshit game night: ${table}`,
    },
    he: {
        title: 'יש עוד חבורה שתיפול בזה?',
        text: 'קובעים ערב ושולחים להם קישור. המשחק אצלכם: בחינם, 10 שניות.',
        button: 'להזמין חבורה אחרת',
        now: 'או לפתוח משחק עכשיו',
        sheetTitle: 'ערב המשחק שלך',
        change: 'שינוי',
        day: 'יום',
        time: 'שעה',
        past: 'השעה הזאת כבר עברה. בחרו מועד מאוחר יותר.',
        whatsapp: 'שליחה בוואטסאפ',
        calendar: 'הוספה ליומן שלי',
        google: 'או הוסיפו ליומן Google',
        other: 'שיתוף בדרך אחרת',
        copied: 'הועתק. הדביקו בקבוצה שלהם.',
        set: 'ערב המשחק נקבע:',
        see: 'לראות מי בפנים',
        failed: 'זה לא עבר.',
        retry: 'נסו שוב',
        done: 'סיום',
        eventText: 'ערב המשחק שלך. פותחים את הקישור ולוחצים על "פותחים משחק": החברים מצטרפים מהטלפון.',
        eventTitle: (table: string) => `ערב בולשיט: ${table}`,
    },
};

export type InviteStrings = typeof inviteStrings.en;

export function inviteWords(locale: string): InviteStrings {
    return locale === 'he' ? inviteStrings.he : inviteStrings.en;
}

/** The guest's best lie of the night, as the final screen has it (player.best). */
export interface BestLie {
    text?: string;
    fooled?: number;
}

/**
 * The message the guest sends; the table's link follows on its own line. The guest's best lie of
 * the night is the bait when it fooled at least one player. The guest reads all of it in WhatsApp
 * before sending, the lie included.
 */
export function inviteMessage(night: Date, locale: string, best?: BestLie | null): string {
    const he = locale === 'he';
    const when = nightLabel(night, locale);
    const lie = best && best.fooled >= 1 ? String(best.text || '').replace(/\s+/g, ' ').trim() : '';
    const tail = he ? `משחק אצלי, ${when}. מי בפנים? לוחצים כאן:` : `My game, ${when}. Who's in? Tap here:`;
    if (!lie) {
        return he
            ? `מצאתי לנו משחק: בולשיט. כולם ממציאים שקר ומנסים לזהות את האמת. ${tail}`
            : `Found us a game: Bullshit. Everyone makes up a lie and tries to spot the truth. ${tail}`;
    }
    if (he) {
        const who = best.fooled === 1 ? 'מישהו' : `${best.fooled} אנשים`;
        return `הערב עבדתי על ${who} בבולשיט עם השקר הזה: "${lie}". נראה אתכם. ${tail}`;
    }
    const who = best.fooled === 1 ? 'someone' : `${best.fooled} people`;
    return `Tonight I fooled ${who} in Bullshit with this lie: "${lie}". Think you'd do better? ${tail}`;
}

/** The table's link: its crew page, in its language, tagged so what it brings can be counted. */
export function tableUrl(id: string, locale: string): string {
    return `${SITE}${locale === 'he' ? '/he' : ''}/c/${String(id || '').toLowerCase()}?via=${TABLE_VIA}`;
}

/** The entry ADD TO MY CALENDAR saves: the guest's own night, with the table's link. One entry, not weekly. */
export function inviteEvent(night: Date, tableId: string, tableName: string, locale: string): CalendarEvent {
    const t = inviteWords(locale);
    return {
        title: t.eventTitle(tableName),
        text: t.eventText,
        url: tableUrl(tableId, locale),
        uid: `table-${String(tableId || '').toLowerCase()}-${night.getTime()}`,
    };
}

export const INVITE_FILE = 'bullshit-game-night.ics';
