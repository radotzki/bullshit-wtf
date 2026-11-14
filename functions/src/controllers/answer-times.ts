/**
 * When each lie and each pick arrived, to measure how long a table waits for its slowest player.
 *
 * The server keeps the times at games/{pin}/answerTimes (no phone can read or write it):
 *   lies/{pid}   stamped when the answer function stores the lie
 *   picks/{pid}  stamped by the answerSelections trigger, with the time of the write itself
 * Each stamp carries its question index, so nothing has to be cleared between questions: a stamp
 * left from an earlier question is simply not counted. question_results gets the two spans
 * (see lie-helper.ts questionResult). Only numbers leave the game: no player id, no text.
 *
 * The functions here are pure (no Firebase) so they can be unit tested.
 */
import { AnswerTime } from '../game-model';

export function stamp(questionIndex: number | undefined | null, at: number): AnswerTime {
    return { q: questionIndex || 0, at };
}

/** Players whose pick is new in this write of answerSelections (there after, not there before). */
export function newPickers(before: any, after: any): string[] {
    const had = before && typeof before === 'object' ? before : {};
    const has = after && typeof after === 'object' ? after : {};
    return Object.keys(has).filter(pid => has[pid] && !had[pid]);
}

/** The time of a database event (an RFC 3339 string), in ms; the time now when it cannot be read. */
export function eventTime(timestamp: any, now: number = Date.now()): number {
    const t = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN;
    return isFinite(t) ? t : now;
}

/**
 * Seconds from the first to the last of these players' stamps for question `q`, to a tenth.
 * null when there is nothing to measure: fewer than two players, or a player without a stamp for
 * this question (a game that was running when the stamps were deployed, or a failed stamp).
 */
export function spanSeconds(pids: string[], times: { [pid: string]: AnswerTime } | undefined | null, q: number): number | null {
    if (!pids || pids.length < 2) {
        return null;
    }
    const at: number[] = [];
    for (const pid of pids) {
        const t = times && times[pid];
        if (!t || t.q !== q || typeof t.at !== 'number' || !isFinite(t.at)) {
            return null;
        }
        at.push(t.at);
    }
    return Math.round((Math.max(...at) - Math.min(...at)) / 100) / 10;
}
