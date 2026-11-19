import { GameScheme, cleanCampaign, isTestCampaign, packFits } from '../game-model';

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

/** The answer to a join (or a PIN check) at a full table: GAME_IS_FULL, as before, with the second table. */
export function fullTableError(game: GameScheme) {
    return { message: 'Sorry, game is full', code: 'GAME_IS_FULL', secondTable: secondTable(game) };
}
