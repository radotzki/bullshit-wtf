/**
 * The footer's score during a reveal. The server adds a question's points to the players' totals only
 * when the reveal ends (functions: tick.ts, addQuestionScores), while the reveal's board already shows
 * the new totals; the footer read the old one, a question behind the board. The reveal page hands the
 * footer this phone's total before and after the question once its board shows the new one, and the
 * footer shows the new total until the server's own arrives.
 * Kept free of Angular so it can be tested in Node.
 */
import { BehaviorSubject } from 'rxjs';

export interface RevealedScore {
    pin: string;
    pid: string;
    /** The player's total without this question's points: what the server still holds during the reveal. */
    before: number;
    /** With them: what the board shows. */
    after: number;
}

/** The latest reveal's totals for this phone's player; the footer reads it (see footerScore). */
export const revealedScore = new BehaviorSubject<RevealedScore | null>(null);

/**
 * What the footer shows: the server's total, except during a reveal that already shows this player's
 * new total and the server still holds the one before it. Once the server's total moves, it wins.
 */
export function footerScore(
    live: number | null | undefined, shown: RevealedScore | null, pin: string, pid: string,
): number | null | undefined {
    if (!shown || !pin || !pid || shown.pid !== pid || String(shown.pin).toUpperCase() !== String(pin).toUpperCase()) {
        return live;
    }
    return (live || 0) === shown.before ? shown.after : live;
}

/** The server's total no longer is the one before the reveal: the hand-off for this player is spent. */
export function revealSettled(live: number | null | undefined, shown: RevealedScore | null, pin: string, pid: string): boolean {
    return !!shown && footerScore(live, shown, pin, pid) === live && shown.pid === pid
        && String(shown.pin).toUpperCase() === String(pin || '').toUpperCase() && (live || 0) !== shown.before;
}
