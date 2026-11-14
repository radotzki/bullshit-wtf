/**
 * "Same time next week?" on the final screen: the button beside REMATCH, the sheet that sets next
 * week's date and puts it in the group's WhatsApp chat, and the banner the other phones get.
 *
 * Why: 126 of 132 groups that played a second game never sat down together again. Leaving with a
 * date took seven steps and a crew name (SAVE THIS CREW, then the crew page's NEXT GAME NIGHT), and
 * had one real press. This is the same thing in one button that says what a friend says at the door.
 *
 * A 50/50 test: the server says which half on the game's final state (state.nextWeek, see
 * functions/src/controllers/next-week.ts). The sheet makes the crew when it opens, under a name
 * nobody has to type, so the WhatsApp button is a plain link that is ready when it is pressed
 * (phones block a window that opens after a wait). The date goes on the crew (crew.night), which
 * every phone on the final screen reads.
 *
 * Kept free of Angular so it can be tested in Node.
 */
import { nightLabel } from '../../pages/crew/next-night';

const DEFAULT_HOUR = 21;
/** A night runs past midnight: until this hour it is still the evening before. */
const NIGHT_ENDS_HOUR = 5;
/** If nobody pressed REMATCH after this long, the two buttons swap places: the group is leaving. */
export const SWAP_AFTER_MS = 40 * 1000;

/** Words of the button, the sheet and the banner, in the game's language. Hebrew avoids gendered verbs. */
export const nextWeekStrings = {
    en: {
        revenge: 'REVENGE NEXT WEEK',
        defend: 'DEFEND MY TITLE NEXT WEEK',
        line: 'Same crew, same time. One tap sends it to the group.',
        bigScreen: 'Same time next week? It\'s on your phones.',
        title: 'SAME TIME NEXT WEEK?',
        change: 'CHANGE',
        crew: 'Crew',
        crewName: (host: string) => `${host}'s crew`,
        send: 'SEND TO THE GROUP ON WHATSAPP',
        calendar: 'ADD TO MY CALENDAR',
        other: 'Share another way',
        set: (when: string) => `Game night is set: ${when}`,
        next: (when: string) => `Next game night: ${when}`,
        call: (name: string) => `${name}'s call`,
        imIn: 'I\'M IN',
        youreIn: 'You\'re in.',
        done: 'DONE',
        failed: 'Could not set it up. Close this and try again.',
        calendarTitle: (crew: string) => `Bullshit game night: ${crew}`,
        text: (winner: boolean, when: string, leader: string) =>
            `${winner ? 'Come and take my title.' : 'I want a rematch.'} Bullshit, same time next week: `
            + `${when}.${leader} Who's in? Tap here:`,
    },
    he: {
        revenge: 'נקמה בשבוע הבא',
        defend: 'להגן על התואר בשבוע הבא',
        line: 'אותה חבורה, אותה שעה. לחיצה אחת ושולחים לקבוצה.',
        bigScreen: 'אותה שעה בשבוע הבא? זה אצלכם בטלפונים.',
        title: 'אותה שעה בשבוע הבא?',
        change: 'שינוי',
        crew: 'חבורה',
        crewName: (host: string) => `החבורה של ${host}`,
        send: 'שליחה לקבוצה בוואטסאפ',
        calendar: 'הוספה ליומן שלי',
        other: 'שיתוף בדרך אחרת',
        set: (when: string) => `ערב המשחק נקבע: ${when}`,
        next: (when: string) => `ערב המשחק הבא: ${when}`,
        call: (name: string) => `הצעה של ${name}`,
        imIn: 'אני בפנים',
        youreIn: 'נרשמת.',
        done: 'סיום',
        failed: 'משהו השתבש. סגרו ונסו שוב.',
        calendarTitle: (crew: string) => `ערב בולשיט: ${crew}`,
        text: (winner: boolean, when: string, leader: string) =>
            `${winner ? 'בואו לקחת לי את התואר.' : 'מגיע לי משחק חוזר.'} בולשיט, אותה שעה בשבוע הבא: `
            + `${when}.${leader} מי בפנים? לוחצים כאן:`,
    },
};

export type NextWeekStrings = typeof nextWeekStrings.en;

export function nextWeekWords(locale: string): NextWeekStrings {
    return locale === 'he' ? nextWeekStrings.he : nextWeekStrings.en;
}

/**
 * Tonight plus seven days, in the phone's own time. A night runs past midnight to 05:00, so a game
 * that ends at 00:30 on Saturday offers next Friday. The time is 21:00 when it is now 21:30 or later
 * (or before 05:00), otherwise now rounded down to the half hour.
 */
export function sameTimeNextWeek(now: Date): Date {
    const afterMidnight = now.getHours() < NIGHT_ENDS_HOUR;
    const late = afterMidnight || now.getHours() * 60 + now.getMinutes() >= DEFAULT_HOUR * 60 + 30;
    const hour = late ? DEFAULT_HOUR : now.getHours();
    const minute = late ? 0 : (now.getMinutes() >= 30 ? 30 : 0);
    // Built from the day's own fields, so a clock change in the week between does not move the hour.
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - (afterMidnight ? 1 : 0) + 7, hour, minute, 0, 0);
}

/** The end of tonight: the next 05:00 on this phone's clock. */
export function tonightEnds(now: Date): Date {
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), NIGHT_ENDS_HOUR, 0, 0, 0);
    if (end.getTime() <= now.getTime()) {
        end.setDate(end.getDate() + 1);
    }
    return end;
}

/**
 * Is this night still to come? A night that is tonight (or has passed) is the one being played, so the
 * screen offers the next one; a later night is set, and the screen shows it.
 */
export function nightAhead(time: any, now: Date): boolean {
    return typeof time === 'number' && isFinite(time) && time >= tonightEnds(now).getTime();
}

/** "Dana's crew" / "החבורה של דנה": the host's nickname, which the name filter has already cleaned. */
export function defaultCrewName(host: string, locale: string): string {
    return nextWeekWords(locale).crewName(String(host || '').trim());
}

/** " Dana leads 2 to 1." or "": a full stop only when the line has none. */
function leaderSentence(leader: string) {
    const l = (leader || '').trim();
    return l ? ` ${/[.!?]$/.test(l) ? l : l + '.'}` : '';
}

export interface NextWeekMessage {
    /** The sender won tonight's game (or is tied for first): "Come and take my title". */
    winner: boolean;
    when: Date;
    /** The crew's leader line with tonight's games counted, or '' when nobody has won yet. */
    leader: string;
    locale: string;
}

/** The text that goes into the group's chat; the crew link follows on its own line. */
export function nextWeekText(m: NextWeekMessage): string {
    return nextWeekWords(m.locale).text(!!m.winner, nightLabel(m.when, m.locale), leaderSentence(m.leader));
}

/** What a phone on the final screen shows in place of the save-crew offer. */
export type NextWeekView = 'button' | 'banner';

/** The banner once the crew has a night that is still to come; until then, the button. */
export function nextWeekView(nightTime: any, now: Date): NextWeekView {
    return nightAhead(nightTime, now) ? 'banner' : 'button';
}

/** The same key as crewMemberKey in game-model.ts. */
export function memberKey(nickname: string): string {
    const key = String(nickname || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.#$[\]/]/g, '_');
    return key || '_';
}

/** Has this player said "I'm in" for the night (or proposed it)? */
export function isIn(night: { by?: string; in?: { [key: string]: any } } | null | undefined, nickname: string): boolean {
    if (!night || !nickname) {
        return false;
    }
    const key = memberKey(nickname);
    return !!(night.in && night.in[key]) || (!!night.by && memberKey(night.by) === key);
}

// ---------------------------------------------------------------------------
// One "seen" row per phone per game (shares: next-week / seen-card or seen-control).

export const SEEN_KEY = 'BS_NEXT_WEEK_SEEN';
const SEEN_KEEP = 12;

/** The PINs this phone has already counted, as stored; anything unreadable is none. */
export function parseSeen(raw: string): string[] {
    try {
        const list = JSON.parse(raw || '[]');
        return Array.isArray(list) ? list.filter(p => typeof p === 'string') : [];
    } catch (e) {
        return [];
    }
}

/** The list with this game added, newest first; null when the game is already on it. */
export function addSeen(seen: string[], pin: string): string[] | null {
    pin = String(pin || '').toUpperCase();
    if (!pin || (seen || []).indexOf(pin) >= 0) {
        return null;
    }
    return [pin].concat(seen || []).slice(0, SEEN_KEEP);
}

/** Which row a phone logs: the new screen, today's screen in the other half, or nothing (not in the test). */
export function seenMethod(nextWeek: any): 'seen-card' | 'seen-control' | null {
    return nextWeek === true ? 'seen-card' : nextWeek === false ? 'seen-control' : null;
}

/** When the two buttons swap: nobody pressed REMATCH, and the screen has been up for SWAP_AFTER_MS. */
export function buttonsSwap(shownForMs: number, rematchPressed: boolean): boolean {
    return !rematchPressed && shownForMs >= SWAP_AFTER_MS;
}
