import { KIDS_PACK } from '../game-model';
import { lieRefused } from './lie-filter';

export { lieRefused };

/**
 * Games played in a portal version of the game (game/src/app/portal/portal.ts): the CrazyGames
 * version tags every game it creates `portal-crazygames`.
 * - Replay and PLAY AGAIN keep the tag (fork.ts), so a portal group's later games still count as the
 *   portal's, and keep its rules.
 * - Players' lies go through the lie filter (lie-filter.ts): CrazyGames asks for at least a
 *   profanity filter on what players write. A flagged lie is refused and the player writes another.
 *   Off the portal, only kids' games filter lies (filtersLies).
 */
export const PORTAL_CAMPAIGNS = ['portal-crazygames'];

export function isPortalCampaign(tag: any): boolean {
    return typeof tag === 'string' && PORTAL_CAMPAIGNS.indexOf(tag) >= 0;
}

/**
 * Whether a game's lies go through the lie filter (lie-filter.ts): a portal game, and on the main site
 * a game made with "Kids are playing" (its kids pack; Replay keeps it). Every other game takes any lie:
 * cheeky lies between friends are the fun.
 */
export function filtersLies(game: { campaign?: string; pack?: string } | null | undefined): boolean {
    return !!game && (isPortalCampaign(game.campaign) || game.pack === KIDS_PACK);
}

export const FLAGGED_LIE = { message: 'That lie can\'t be used. Try another one.', code: 'FLAGGED_LIE' };
