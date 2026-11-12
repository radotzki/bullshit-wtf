/**
 * "A group's second game": is the game on this final screen the same group playing again?
 *
 * The server knows when a game is a rematch (games/<pin>/parent and origin), but the database rules
 * keep those fields from the client, and changing the rules is the owner's step. So each phone keeps
 * a short list of the games it saw end, with the players' names, and compares. That catches both a
 * REMATCH and the same friends opening a new game another night, on any phone that played the earlier
 * game. A phone that joined only this game, or lost its storage (iPhones clear it after a while),
 * does not know: someone else at the table usually does. Kept free of Angular so it can be tested in Node.
 */

export const GAMES_KEY = 'BS_FINISHED_GAMES';
/** Games further back than this are another season, not the same group. */
export const REPEAT_WINDOW_MS = 60 * 24 * 3600 * 1000;
const KEEP = 12;

export interface FinishedGame {
    pin: string;
    /** When this phone saw it end (ms). */
    time: number;
    /** Players' names, as crew members are keyed. */
    names: string[];
}

/** The same key as crewMemberKey in game-model.ts, so "Dana " and "dana" are one player. */
export function nameKey(nickname: string): string {
    const key = String(nickname || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.#$\[\]\/]/g, '_');
    return key || '_';
}

/** The list as stored; anything unreadable is an empty list. */
export function parseGames(raw: string): FinishedGame[] {
    try {
        const list = JSON.parse(raw || '[]');
        return Array.isArray(list)
            ? list.filter(g => g && typeof g.pin === 'string' && typeof g.time === 'number' && Array.isArray(g.names))
            : [];
    } catch (e) {
        return [];
    }
}

/**
 * Did an earlier game have the same group? At least half of this game's players, and two at the
 * least, played it too: the rule a crew uses to count a game as the crew's.
 */
export function isRepeatGroup(games: FinishedGame[], pin: string, nicknames: string[], now: number): boolean {
    const names = unique(nicknames.map(nameKey));
    if (names.length < 2) {
        return false;
    }
    const need = Math.max(2, Math.ceil(names.length / 2));
    return (games || []).some(g => g.pin !== pin && now - g.time <= REPEAT_WINDOW_MS && now >= g.time - 60000 &&
        names.filter(n => g.names.indexOf(n) >= 0).length >= need);
}

/** The list with this game added (once), newest first, at most KEEP long. */
export function addGame(games: FinishedGame[], pin: string, nicknames: string[], now: number): FinishedGame[] {
    const rest = (games || []).filter(g => g.pin !== pin);
    return [{ pin, time: now, names: unique(nicknames.map(nameKey)) }].concat(rest).slice(0, KEEP);
}

function unique(list: string[]) {
    return list.filter((x, i) => list.indexOf(x) === i);
}
