/**
 * What the row of players on the two waiting screens says, from the row the game model works out
 * (waitingRow in game-model.ts). Kept free of Angular and of imports so it can be tested in Node.
 */

export interface RowSeat {
    pid: string;
    nickname: string;
    index: number;
    done: boolean;
    away: boolean;
}

export interface Row {
    known: boolean;
    seats: RowSeat[];
    waiting: RowSeat[];
}

export interface RowWords {
    waitingForName: (name: string) => string;
    seatIn: (name: string) => string;
    seatNotYet: (name: string) => string;
}

export interface RowSeatView extends RowSeat {
    picture: string;
    /** 'done', 'waiting' or 'away': the mark on the picture. */
    mark: string;
    /** For a screen reader: "Dana is in", "Chen, not yet"; nothing for a seat nobody plays. */
    label: string;
}

/**
 * One picture per seat: MAX_PLAYERS in game-model.ts (12; test/waiting-row.test.js holds the two
 * equal). Kept here as a number so this file stays free of imports. A seat past it (two joins in
 * the same instant) reuses a picture rather than ask for a file that does not exist.
 */
export const PICTURES = 12;

export interface RowView {
    /** The line above the row: "Waiting for Chen" when one seat is left, else the screen's own line. */
    line: string;
    /** No row for a game on an older server (it marks nobody) and none for a player alone. */
    seats: RowSeatView[];
}

/**
 * `ownLine` is what the screen said before there was a row ("Your answer has been submitted"); it
 * stays whenever the row has nothing better to say, so on an older server the screen is as it was.
 *
 * `compact` is the big screen while answers are picked: the answers fill that screen, so the row
 * sits in the bar on top, where "Waiting for Chen" has room beside Chen's picture alone.
 * `me` is this phone's player; the big screen has none, and shows the row from the first tick.
 */
export function rowView(row: Row | null | undefined, ownLine: string, words: RowWords, compact = false, me?: string): RowView {
    // The server is seen to mark seats in this very phase: this phone's own seat is in (it has
    // sent, or this screen would not be waiting), or on the big screen somebody's is. Otherwise
    // there is no row: an older server, one rolled back in the middle of a game, a mark not written.
    const marking = !!row && row.seats.some(seat => seat.done && (!me || seat.pid === me));
    const shown = marking && row.known && row.seats.length >= 2;

    if (!shown) {
        return { line: ownLine || '', seats: [] };
    }

    const seats = row.seats.map(seat => {
        const mark = seat.done ? 'done' : seat.away ? 'away' : 'waiting';
        const label = mark === 'done' ? words.seatIn(seat.nickname) : mark === 'waiting' ? words.seatNotYet(seat.nickname) : '';
        return {
            pid: seat.pid, nickname: seat.nickname, index: seat.index, done: seat.done, away: seat.away,
            picture: `avatar${seat.index % PICTURES}.png`, mark, label,
        };
    });

    const last = row.waiting.length === 1 ? row.waiting[0] : null;

    return {
        line: last ? words.waitingForName(last.nickname) : ownLine || '',
        seats: compact && last ? seats.filter(seat => seat.pid === last.pid) : seats,
    };
}
