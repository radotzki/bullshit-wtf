/**
 * WHO'S IN? The crew page as the door to game night: what the page shows for the crew's stored
 * night (crews/<id>/night), by the phone's clock. Before the night: the date, who holds the title,
 * who said "I'm in". On the night: one button that opens the lobby. After a night nobody played:
 * an offer to pick a new one.
 *
 * It takes plain values (a time, a list of names), not a crew, so a page for a night whose crew has
 * no games yet can use it as it is. Kept free of Angular and of imports so it can be tested in Node.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** The lobby button shows from this long before the night's time. */
export const OPEN_BEFORE_MS = 2 * HOUR_MS;
/** A night runs past midnight, to this hour of the next morning. */
export const NIGHT_ENDS_HOUR = 5;
/** A night set for the small hours still gets this long. */
const NIGHT_MIN_MS = 3 * HOUR_MS;
/** A game this long before the night's time already counts as the night being played. */
const PLAYED_BEFORE_MS = 12 * HOUR_MS;
/** "That night has passed" is offered for this long, then the page is the plain crew page again. */
export const PASSED_OFFER_MS = 7 * DAY_MS;

export type NightState = 'none' | 'before' | 'tonight' | 'passed' | 'over';

/** When the night is over: the next 05:00 (local time) after it starts, and never under three hours. */
export function nightEnd(time: number): number {
    const d = new Date(time);
    const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), NIGHT_ENDS_HOUR, 0, 0, 0);
    if (end.getTime() <= time) {
        end.setDate(end.getDate() + 1);
    }
    return Math.max(end.getTime(), time + NIGHT_MIN_MS);
}

/**
 * What the page shows for a night at `time`, at `now`:
 *   none     no night is set
 *   before   the date and who is in
 *   tonight  from two hours before the time until 05:00 the next morning: the lobby button
 *   passed   the night is over and the crew did not play it: offer a new one (for a week)
 *   over     the night is over and was played, or is long gone: the plain crew page
 * `lastPlayed` is when the crew last finished a game that counted.
 */
export function nightState(time: number | undefined | null, now: number, lastPlayed?: number): NightState {
    if (!time || !isFinite(time)) {
        return 'none';
    }
    if (now < time - OPEN_BEFORE_MS) {
        return 'before';
    }
    const end = nightEnd(time);
    if (now < end) {
        return 'tonight';
    }
    const played = !!lastPlayed && lastPlayed >= time - PLAYED_BEFORE_MS;
    return played || now >= end + PASSED_OFFER_MS ? 'over' : 'passed';
}

/** Whole calendar days (local) from today to the night: 0 today, 1 tomorrow. */
export function daysUntil(time: number, now: number): number {
    const a = new Date(now);
    const b = new Date(time);
    const from = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const to = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((to - from) / DAY_MS);
}

/** "in 6 days" / "tomorrow" / "tonight", and the same in Hebrew. */
export function countdown(time: number, now: number, locale: string): string {
    const days = daysUntil(time, now);
    const he = locale === 'he';
    if (days <= 0) {
        return he ? 'הערב' : 'tonight';
    }
    if (days === 1) {
        return he ? 'מחר' : 'tomorrow';
    }
    if (he) {
        return days === 2 ? 'בעוד יומיים' : `בעוד ${days} ימים`;
    }
    return `in ${days} days`;
}

/** Is this name on the list? Case and spacing do not matter, as for a crew's members. */
export function isIn(names: string[], nickname: string | undefined): boolean {
    const mine = String(nickname || '').trim().toLowerCase().replace(/\s+/g, ' ');
    return !!mine && (names || []).some(n => String(n || '').trim().toLowerCase().replace(/\s+/g, ' ') === mine);
}

/** A standings row, as much of it as the title line needs. */
export interface TitleRow {
    nickname: string;
    wins: number;
}

/**
 * "Dana holds the title" when one member has the most wins. Tied at the top, or no winner yet:
 * the crew's leader line as it is ("Dana and Avi are tied 2 to 2", "No winner yet...").
 */
export function titleLine(standings: TitleRow[], leaderLine: string, locale: string): string {
    const first = standings && standings[0];
    const second = standings && standings[1];
    if (!first || !(first.wins > 0) || (second && second.wins === first.wins)) {
        return leaderLine || '';
    }
    return locale === 'he' ? `התואר אצל ${first.nickname}` : `${first.nickname} holds the title`;
}

/**
 * The home page's line for a crew whose night is today: the night's time ("21:00") when it is
 * today or on right now, else null.
 */
export function tonightTime(time: number | undefined | null, now: number, lastPlayed?: number): string | null {
    const state = nightState(time, now, lastPlayed);
    if (state !== 'tonight' && !(state === 'before' && daysUntil(time, now) === 0)) {
        return null;
    }
    const d = new Date(time);
    const pad = (n: number) => (n < 10 ? '0' : '') + n;
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
