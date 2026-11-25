/**
 * Hanukkah night on the final screen: on the eight candle evenings, the final scores say which night
 * it is ("Hanukkah, night 3 of 8"), and every player's phone gets one button, SAME TABLE TOMORROW,
 * that saves tomorrow evening in the player's calendar with this table's own link. Families meet
 * eight nights running; this asks them to play the same table again on the next one.
 *
 * It builds on what is live: the link is the finished game's join page, where "The night after"
 * (night-after.ts) shows PLAY AGAIN, SAME TABLE (functions' same-table.ts, "Same table tomorrow"),
 * and the calendar entry is the one REMIND ME saves (host-ask.ts), so on these evenings a guest's
 * REMIND ME steps aside: one calendar button, not two (remindStepsAside).
 *
 * Counting: the link carries ?via=hanukkah-night-<N>, N the night it is for (2 to 8). A join page
 * opened with it always shows the recap, and the lobby its PLAY AGAIN, SAME TABLE opens carries the
 * tag as its campaign (opened_games.campaign LIKE 'hanukkah-night-%'). Tables that play two or more
 * Hanukkah nights, tag or none, are counted by functions/bigquery/2026-12-hanukkah-nights.sql.
 *
 * Kept free of Angular so it can be tested in Node.
 */
import { CalendarEvent } from '../../pages/crew/next-night';
import { HANUKKAH_CANDLES, eveningOf } from '../host-ask/host-ask';

/** Eight candles, eight evenings: the first is HANUKKAH_CANDLES.first, the eighth HANUKKAH_CANDLES.last. */
export const NIGHTS = 8;

const SITE = 'https://bullshit.wtf';

/** The prefix of the link's tag and of the lobby's campaign: `hanukkah-night-<N>`. */
export const NIGHT_TAG = 'hanukkah-night-';

/** The tag of the link for night `n`, or null when `n` is not a night that can be played tomorrow. */
export function nightTag(n: number): string | null {
    return Number.isInteger(n) && n >= 2 && n <= NIGHTS ? NIGHT_TAG + n : null;
}

/** The night a `?via=` value is the tag of (2 to 8), or null when it is no such tag. */
export function tagNight(via: any): number | null {
    const m = typeof via === 'string' ? /^hanukkah-night-([2-8])$/.exec(via.trim().toLowerCase()) : null;
    return m ? Number(m[1]) : null;
}

/** The shares rows of the button (content_type, methods in the functions' SHARE_METHODS). */
export const NIGHT_CONTENT = 'hanukkah-night';

const two = (n: number) => (n < 10 ? '0' : '') + n;
const dayOf = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

/** Local midnight of a `YYYY-MM-DD` day. */
function dayStart(day: string): Date {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/**
 * Which Hanukkah night `now` belongs to, 1 to 8, by the player's own clock: the evening runs on past
 * midnight until host-ask's EVENING_TURNS_AT (05:00), as REMIND ME's does. The day before the first
 * candle, and any day after the eighth, is no night (null).
 *
 * Only for a game that is Hanukkah's: a Hebrew game (in Hanukkah every Hebrew game has the pack) or a
 * game of the Hanukkah pack. An English game of the Christmas pack says nothing of Hanukkah.
 */
export function hanukkahNight(now: Date, locale: string, pack?: string | null): number | null {
    if (locale !== 'he' && pack !== 'hanukkah') {
        return null;
    }
    const e = eveningOf(now);
    const day = dayStart(dayOf(e));
    const first = dayStart(HANUKKAH_CANDLES.first);
    // Whole days, rounded: a clock change between the two days must not move the night.
    const n = Math.round((day.getTime() - first.getTime()) / (24 * 3600 * 1000)) + 1;
    return n >= 1 && n <= NIGHTS ? n : null;
}

/** The latest and earliest start the entry gets: an evening, whatever time tonight's game ended. */
const EARLIEST = { h: 18, m: 0 };
const LATEST = { h: 21, m: 30 };

/**
 * When tomorrow's game is: tomorrow evening (the evening after tonight's, so a game that ends after
 * midnight does not skip a night), at about the time tonight's started: now less half an hour, down to
 * the half hour, kept between 18:00 and 21:30. A game that ends after midnight saves 21:00.
 */
export function tomorrowNight(now: Date): Date {
    const e = eveningOf(now);
    let h: number, m: number;
    if (dayOf(e) !== dayOf(now)) {
        h = 21;
        m = 0;
    } else {
        const start = new Date(now.getTime() - 30 * 60 * 1000);
        h = start.getHours();
        m = start.getMinutes() >= 30 ? 30 : 0;
        if (start.getDate() !== now.getDate() || h * 60 + m < EARLIEST.h * 60 + EARLIEST.m) {
            h = EARLIEST.h;
            m = EARLIEST.m;
        } else if (h * 60 + m > LATEST.h * 60 + LATEST.m) {
            h = LATEST.h;
            m = LATEST.m;
        }
    }
    return new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1, h, m, 0, 0);
}

/** The table's link: the finished game's join page, in its language, tagged with the night it is for. */
export function tableUrl(pin: string, locale: string, night: number): string {
    const tag = nightTag(night);
    const path = `${locale === 'he' ? '/he' : ''}/join-game/${String(pin || '').toUpperCase()}`;
    return `${SITE}${path}${tag ? `?via=${tag}` : ''}`;
}

/** Words of the line and the button, in the game's language. Hebrew avoids gendered verbs. */
export const hanukkahNightStrings = {
    en: {
        line: (n: number) => `Hanukkah, night ${n} of ${NIGHTS}`,
        button: (n: number) => `SAME TABLE TOMORROW: NIGHT ${n}`,
        hint: 'Saves tomorrow evening in your calendar, with this table\'s link.',
        saved: 'One more step. If a calendar file downloaded, open it to save tomorrow\'s game.',
        google: 'Or add it to Google Calendar',
        eventTitle: (n: number) => `Hanukkah night ${n}: Bullshit, same table`,
        eventText: (n: number) => `Night ${n} of Hanukkah. Open the link and press PLAY AGAIN, SAME TABLE: `
            + 'everyone joins the same table on their own phone.',
        /** The join page's recap, opened by the link. */
        recapLine: (n: number) => `Hanukkah, night ${n} of ${NIGHTS}: same table?`,
        /**
         * The link opened in a browser that didn't play that game (a forwarded link, or a calendar that
         * opens another browser): wait for the table, and join it once someone from it opens tonight's game.
         */
        waitTitle: 'Same table, tonight.',
        waitText: (n: number) => `No game is open for night ${n} yet. When someone from the table opens it, `
            + 'a button to join shows up here. Keep this page open.',
        playingTitle: 'The table is already playing.',
        playingText: 'You can join now, in the middle of the game. You start at 0 points.',
        joinNow: 'JOIN NOW',
        ownTable: 'Or start a table of your own',
    },
    he: {
        line: (n: number) => `חנוכה, נר ${n} מתוך ${NIGHTS}`,
        button: (n: number) => `אותו שולחן מחר: נר ${n}`,
        hint: 'שומרים ביומן את מחר בערב, עם הקישור לשולחן הזה.',
        saved: 'עוד צעד אחד. אם ירד קובץ יומן, פתחו אותו כדי לשמור את המשחק של מחר.',
        google: 'או הוסיפו ליומן Google',
        eventTitle: (n: number) => `נר ${n} של חנוכה: בולשיט, אותו שולחן`,
        eventText: (n: number) => `נר ${n} של חנוכה. פותחים את הקישור ולוחצים "לשחק שוב, אותו שולחן": `
            + 'כולם מצטרפים לאותו שולחן מהטלפון.',
        recapLine: (n: number) => `חנוכה, נר ${n} מתוך ${NIGHTS}: אותו שולחן?`,
        waitTitle: 'אותו שולחן, הערב.',
        waitText: (n: number) => `עוד אין משחק פתוח לנר ${n}. כשמישהו מהשולחן יפתח אותו, `
            + 'יופיע כאן כפתור להצטרפות. אפשר להשאיר את הדף פתוח.',
        playingTitle: 'השולחן כבר משחק.',
        playingText: 'אפשר להצטרף עכשיו, באמצע המשחק. מתחילים מאפס נקודות.',
        joinNow: 'להצטרף עכשיו',
        ownTable: 'או לפתוח שולחן משלכם',
    },
};

export type HanukkahNightStrings = typeof hanukkahNightStrings.en;

export function nightStrings(locale: string): HanukkahNightStrings {
    return locale === 'he' ? hanukkahNightStrings.he : hanukkahNightStrings.en;
}

/** The calendar entry SAME TABLE TOMORROW saves: tomorrow's night, with the table's tagged link. */
export function tableEvent(start: Date, pin: string, locale: string, night: number): CalendarEvent {
    const t = nightStrings(locale);
    return {
        title: t.eventTitle(night),
        text: t.eventText(night),
        url: tableUrl(pin, locale, night),
        uid: `table-${String(pin || '').toUpperCase()}-${night}`,
    };
}

/** What the final screen shows: the night's line, and whether this phone gets the button. */
export interface NightView {
    night: number;
    /** Tomorrow's night, when there is one (not after the eighth). */
    next: number | null;
    button: boolean;
}

/**
 * The final screen on a Hanukkah night: the line for everyone (the big screen too), the button for a
 * phone that played this game (only a player's PLAY AGAIN, SAME TABLE opens the table) when tomorrow is
 * another night. Not after a taste played alone: there is no table yet.
 */
export function nightView(now: Date, locale: string, pack: string | null, input: {
    presenter: boolean; player: boolean; soloTaste: boolean; players: number;
}): NightView | null {
    const night = hanukkahNight(now, locale, pack);
    if (!night || input.soloTaste) {
        return null;
    }
    const next = night < NIGHTS ? night + 1 : null;
    return { night, next, button: !!next && !input.presenter && input.player && input.players > 1 };
}

/**
 * The guest's REMIND ME (host-ask) steps aside where the final screen has SAME TABLE TOMORROW: one
 * calendar button on the screen, not two. Elsewhere (the join page of a game that is over, the eve of
 * the first candle, the eighth night) it stays as it was.
 */
export function remindStepsAside(now: Date, locale: string, pack: string | null, place: string): boolean {
    const night = hanukkahNight(now, locale, pack);
    return place === 'after-game' && !!night && night < NIGHTS;
}
