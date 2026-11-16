/**
 * The home's line for a visitor on their own: "On your own? Try today's question", under Create on
 * both homes, opening the daily puzzle (/daily, a page outside the app). It shows from the puzzle's
 * first day, the earliest `day` in functions/data/daily-questions.json, which copy-shared.js writes
 * into daily-launch.ts (DAILY_FIRST_DAY) so there is one launch date, not two. The day is the date
 * in Israel, as on the puzzle page itself, so the line and "#1" arrive at the same midnight.
 * Kept free of Angular (and of imports) so it can be tested in Node (test/daily-line.test.js).
 */

/** The tag the line's link carries: the puzzle counts it as its own arrival (shares.content_type). */
export const DAILY_HOME_TAG = 'daily-home';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The date in Israel at `now`, YYYY-MM-DD; the visitor's own calendar if the browser can't tell. */
export function israelDay(now: Date): string {
    try {
        const p: { [type: string]: string } = {};
        new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' })
            .formatToParts(now).forEach(part => p[part.type] = part.value);
        const day = `${p.year}-${p.month}-${p.day}`;
        if (DAY.test(day)) {
            return day;
        }
    } catch (e) { }
    const pad = (n: number) => (n < 10 ? '0' : '') + n;
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Whether the puzzle is live at `now`: on or after its first day. No first day known: never. */
export function dailyLive(firstDay: string | null | undefined, now: Date): boolean {
    return typeof firstDay === 'string' && DAY.test(firstDay) && israelDay(now) >= firstDay;
}

/** The line's link, in the visitor's language, tagged. */
export function dailyHref(lang: string): string {
    return (lang === 'he' ? '/he/daily' : '/daily') + '?via=' + DAILY_HOME_TAG;
}
