/**
 * START A SECOND TABLE: what the join page offers a phone refused at a full table (12 seats taken)
 * instead of only "Sorry, game is full". One tap makes a new game like the full one (its language,
 * length and seasonal pack, which the server sends with GAME_IS_FULL; functions' second-table.ts),
 * joins it as the host under the name this phone typed, and lands on the lobby, where the invite is
 * the screen. The phone then sends it to the others who didn't get a seat.
 * On Monday 16 November a group of 15 met the limit: three phones were refused 20 times between them.
 * Kept free of Angular so it can be tested in Node.
 */
import { isTestTag } from '../../services/join-source';

/** The tag of a second table's game, so these tables can be counted (opened_games.campaign). */
export const SECOND_TABLE_TAG = 'second-table';

const LENGTHS = [5, 7, 9];

/** The game to make for a refused phone. */
export interface SecondTableOffer {
    locale: 'he' | 'en';
    count: number;
    pack?: string;
    campaign: string;
}

/**
 * The second table in a failed join's answer: null unless the table was full. An older server sends
 * GAME_IS_FULL alone: the second table is then in the page's own language, 7 questions, no pack.
 */
export function readSecondTable(err: any, pageLang: string): SecondTableOffer | null {
    if (!err || err.code !== 'GAME_IS_FULL') {
        return null;
    }
    const s = err.secondTable && typeof err.secondTable === 'object' ? err.secondTable : {};
    const lang = s.locale === 'he' || s.locale === 'en' ? s.locale : pageLang;
    const offer: SecondTableOffer = {
        locale: lang === 'he' ? 'he' : 'en',
        count: LENGTHS.indexOf(s.count) >= 0 ? s.count : 7,
        campaign: typeof s.campaign === 'string' && /^[a-z0-9][a-z0-9-]{0,39}$/.test(s.campaign) ? s.campaign : SECOND_TABLE_TAG,
    };
    if (typeof s.pack === 'string' && /^[a-z0-9-]{1,40}$/.test(s.pack)) {
        offer.pack = s.pack;
    }
    return offer;
}

/**
 * The tag the second table's game is made with: a play-test tab's own test tag (?via=test, test-<name>)
 * wins, so a test stays out of every count; else the offer's (second-table, or the full test table's tag).
 */
export function secondTableCampaign(offer: SecondTableOffer, tabCampaign: string | null): string {
    return isTestTag(tabCampaign) ? tabCampaign : offer.campaign;
}

export interface SecondTableStrings {
    title: string;
    text: string;
    start: string;
    again: string;
    error: string;
}

const en: SecondTableStrings = {
    title: 'This table is full',
    text: '12 players is the most one game holds. Start a second table, and send its link to the others who didn\'t get a seat.',
    start: 'START A SECOND TABLE',
    again: 'TRY THIS TABLE AGAIN',
    error: 'Couldn\'t start a table. Try again.',
};

const he: SecondTableStrings = {
    title: 'השולחן הזה מלא',
    text: 'במשחק אחד יש מקום ל-12 שחקנים לכל היותר. פתחו שולחן שני, ושלחו את הקישור למי שלא קיבל מקום.',
    start: 'פתיחת שולחן שני',
    again: 'לנסות שוב את השולחן הזה',
    error: 'לא הצלחנו לפתוח שולחן. נסו שוב.',
};

export function secondTableWords(lang: string): SecondTableStrings {
    return lang === 'he' ? he : en;
}
