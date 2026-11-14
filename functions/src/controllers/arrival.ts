import { GameArrival, cleanArrival } from '../game-model';
import { get, gamesRef } from '../firebase';

/**
 * Where a host's visit started, kept with the game they create and written to BigQuery with it
 * (see GameArrival in game-model, and DEPLOYING.md, "Where a host came from").
 *
 * The creating phone sends `arrival` with newGame: the first page of its visit, the referring
 * site's host name, whether the browser had played or hosted before, and the minutes since the
 * visit began. Nothing else is kept: no full address, no query string, no PIN, no id.
 */

/** Keeps the cleaned arrival at games/$pin/arrival (no phone can read it). Never fails the new game. */
export async function recordArrival(pin: string, raw: any): Promise<GameArrival | undefined> {
    try {
        const arrival = cleanArrival(raw);
        if (!arrival || typeof pin !== 'string' || !/^[A-Za-z]{1,12}$/.test(pin)) {
            return undefined;
        }
        await gamesRef.child(pin.toUpperCase()).child('arrival').set(arrival);
        return arrival;
    } catch (e) {
        console.error('recordArrival failed', pin, e && e.message);
        return undefined;
    }
}

/** The arrival as BigQuery columns: the same five on opened_games, closed_games and the host's users row. */
export function arrivalColumns(arrival: GameArrival | undefined | null) {
    // Already cleaned when it was kept (recordArrival): only the types are checked again here.
    const a: GameArrival = arrival && typeof arrival === 'object' ? arrival : {};
    return {
        first_page: typeof a.page === 'string' ? a.page : null,
        referrer: typeof a.ref === 'string' ? a.ref : null,
        played_before: typeof a.played === 'boolean' ? a.played : null,
        hosted_before: typeof a.hosted === 'boolean' ? a.hosted : null,
        visit_minutes: typeof a.minutes === 'number' ? a.minutes : null,
    };
}

/**
 * The columns for the users row of the host's own join (via = 'host'), so a lobby that never
 * starts, which has no other row, still says where its host came from. A failed read leaves them out.
 */
export async function hostArrivalColumns(pin: string, via: string | null) {
    if (via !== 'host' || typeof pin !== 'string' || !/^[A-Za-z]{1,12}$/.test(pin)) {
        return {};
    }
    try {
        const arrival = await get<GameArrival>(gamesRef.child(pin.toUpperCase()).child('arrival'));
        return arrival ? arrivalColumns(arrival) : {};
    } catch (e) {
        console.error('hostArrivalColumns failed', pin, e && e.message);
        return {};
    }
}
