import { GameScheme, GameState, MAX_PLAYERS, cleanCampaign, isTestCampaign, packFits } from '../game-model';
import { get, gamesRef } from '../firebase';
import { readGame } from './old-games';
import { isGameOver } from './game-over';

/**
 * START A SECOND TABLE: what a phone refused at a full table (MAX_PLAYERS seats taken) is offered instead
 * of a dead end. On Monday 16 November a group of 15 met the 12-seat limit: three phones were refused
 * 20 times between them and one never played (game JVBM). The refusal now carries the table's own
 * settings, so one tap on the join page makes a second game like it, hosted by the refused phone, which
 * then sends its invite to the others who were left out.
 *
 * The new game is tagged `second-table` (campaign, as a post's ?via= tag is), so these tables can be
 * counted. A test table's second table keeps the test tag instead, so play-tests stay out of every count.
 */
export const SECOND_TABLE_CAMPAIGN = 'second-table';

/** The game lengths the Create page offers; any other length makes a second table of the default 7. */
const LENGTHS = [5, 7, 9];

export interface SecondTable {
    /** The full table's language: the second table plays in it. */
    locale: 'he' | 'en';
    /** Questions in the second game: the full table's length, when it is one Create offers. */
    count: number;
    /** The full table's seasonal pack (Hanukkah, Christmas...), when it has one that fits its language. */
    pack?: string;
    /** The tag of the second game: second-table, or the full table's own test tag. */
    campaign: string;
    /**
     * JOIN <host>'S SECOND TABLE: the second table a phone refused here already started, while it has a free
     * seat and hasn't ended (in its lobby or under way: a latecomer sits down at 0 points). The next refused
     * phones go there with one tap instead of each making a table of one (on 18 November two phones refused
     * together made two tables of one player each).
     */
    join?: SecondTableJoin;
}

export interface SecondTableJoin {
    /** The open second table's PIN. */
    pin: string;
    /** Its host's name, when the host has joined (a phone that started it joins at once). */
    host?: string;
}

/**
 * Where a full game keeps the second table started from its offer (games/<pin>/secondTable): its PIN and
 * when. Server only: the games/$pin rule lets only the server write or read a path with no rule of its own,
 * so no database rule changes.
 */
export const SECOND_TABLE_KEY = 'secondTable';

export interface KeptSecondTable {
    pin: string;
    at: number;
}

/** The second table to offer at this full game: same language, length and pack, tagged. */
export function secondTable(game: GameScheme): SecondTable {
    const locale = game && game.locale === 'he' ? 'he' : 'en';
    const total = game && Number(game.totalQ);
    const offer: SecondTable = {
        locale,
        count: LENGTHS.indexOf(total) >= 0 ? total : 7,
        campaign: game && isTestCampaign(game.campaign) ? cleanCampaign(game.campaign) : SECOND_TABLE_CAMPAIGN,
    };
    if (game && packFits(game.pack, locale)) {
        offer.pack = game.pack;
    }
    return offer;
}

/** The answer to a join at a full table: GAME_IS_FULL, as before, with the second table. */
export function fullTableError(game: GameScheme, join?: SecondTableJoin) {
    const offer = secondTable(game);
    if (join) {
        offer.join = join;
    }
    return { message: 'Sorry, game is full', code: 'GAME_IS_FULL', secondTable: offer };
}

/**
 * A game a refused phone can still sit down in: not over, with a free seat, in its lobby or already under
 * way (a latecomer sits down at 0 points, as at any table). On the remote office party walk-through the
 * manager came in at question 3, after the second table had started: he was offered START A SECOND TABLE
 * and played a table of one, while three colleagues played the second table beside it.
 */
export function isOpenTable(game: GameScheme, now: number): boolean {
    return !!game && !!game.state && game.state.id !== GameState.ScoreBoardFinal && !isGameOver(game, now)
        && Object.keys(game.players || {}).length < MAX_PLAYERS;
}

/** The name of the game's host seat, if one has joined. */
export function hostName(game: GameScheme): string | undefined {
    const players = game && game.players || {};
    const k = Object.keys(players).find(p => players[p] && players[p].host === true);
    const name = k && typeof players[k].nickname === 'string' ? players[k].nickname.trim() : '';
    return name || undefined;
}

/**
 * The second table started from this full game, while a refused phone can still join it; else undefined.
 * Never rejects: a failed read is logged, and the refused phone gets the offer without it.
 */
export async function openSecondTable(fullPin: string, now: number = Date.now()): Promise<SecondTableJoin | undefined> {
    try {
        const kept = await get<KeptSecondTable>(gamesRef.child(fullPin).child(SECOND_TABLE_KEY));
        if (!kept || typeof kept.pin !== 'string' || !kept.pin) {
            return undefined;
        }
        const game = await readGame(kept.pin);
        if (!isOpenTable(game, now)) {
            return undefined;
        }
        const host = hostName(game);
        return host ? { pin: kept.pin, host } : { pin: kept.pin };
    } catch (e) {
        console.error(`[PIN: ${fullPin}] open second table not read`, e && e.message);
        return undefined;
    }
}

/** A PIN as a phone may send it: letters and digits only (the server makes capital letters). */
function cleanPin(pin: any): string | undefined {
    return typeof pin === 'string' && /^[A-Za-z0-9]{3,12}$/.test(pin) ? pin.toUpperCase() : undefined;
}

/**
 * A game was just made from the offer at full table `fullPin` (newGame's `secondOf`): keep its PIN there,
 * so the next phones refused at that table are offered this one. Only for a table that really is full,
 * and never over a second table that is still open (the first one stays the one offered). Resolves to
 * whether it was kept. A failure is logged and never fails the new game.
 */
export async function keepSecondTable(secondOf: any, newPin: string, now: number = Date.now()): Promise<boolean> {
    const fullPin = cleanPin(secondOf);
    if (!fullPin || !newPin || fullPin === newPin) {
        return false;
    }
    try {
        const full = await readGame(fullPin);
        if (!full || Object.keys(full.players || {}).length < MAX_PLAYERS || isGameOver(full, now)) {
            return false;
        }
        if (await openSecondTable(fullPin, now)) {
            return false;
        }
        const kept: KeptSecondTable = { pin: newPin, at: now };
        await gamesRef.child(fullPin).child(SECOND_TABLE_KEY).set(kept);
        console.log(`[PIN: ${fullPin}] second table ${newPin} kept for the next refused phones`);
        return true;
    } catch (e) {
        console.error(`[PIN: ${fullPin}] second table not kept`, e && e.message);
        return false;
    }
}
