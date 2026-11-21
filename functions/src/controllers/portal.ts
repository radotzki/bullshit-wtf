import { nameFlag, normalizeName } from '../name-flag';
import { NAME_LISTS } from '../name-lists';

/**
 * Games played in a portal version of the game (game/src/app/portal/portal.ts): the CrazyGames
 * version tags every game it creates `portal-crazygames`, and every game of a Discord call
 * (discord-table.ts) is tagged `discord-activity`.
 * - Replay and PLAY AGAIN keep the tag (fork.ts), so a portal group's later games still count as the
 *   portal's, and keep its rules.
 * - Players' lies go through the nickname word filter (name-flag.ts): CrazyGames asks for at least a
 *   profanity filter on what players write, and a Discord call's lies are seen in a server's channel
 *   too. A flagged lie is refused and the player writes another.
 *   Off the portal, lies are not filtered (yet).
 */
export const PORTAL_CAMPAIGNS = ['portal-crazygames', 'discord-activity'];

export function isPortalCampaign(tag: any): boolean {
    return typeof tag === 'string' && PORTAL_CAMPAIGNS.indexOf(tag) >= 0;
}

/**
 * Whether a game's lies go through the word filter: a portal game by its tag, or a game marked
 * filterLies (every game of a Discord call, discord-table.ts, so a play-test in a call, tagged test,
 * is filtered like the real thing).
 */
export function filtersLies(game: { campaign?: string; filterLies?: boolean } | null | undefined): boolean {
    return !!game && (isPortalCampaign(game.campaign) || game.filterLies === true);
}

// The nickname filter's allowed names, as it compares them: letters only ("Moby Dick" is "mobydick").
const squash = (s: string) => normalizeName(s).replace(/[^a-zא-ת]/g, '');
const ALLOWED: { [w: string]: boolean } = {};
((NAME_LISTS as any).allow || []).forEach((a: string) => ALLOWED[squash(a)] = true);

/**
 * A lie the filter refuses: one of its words is a slur or a sex word, as the nickname filter reads a
 * name (so its allowed words stay allowed: "Charles Dickens", "cocktail"), unless the word and the
 * one beside it make an allowed name ("Moby Dick"). Letters spelled out one or two at a time
 * ("c u n t") are read together.
 */
export function lieRefused(text: string): boolean {
    const words = String(text == null ? '' : text).split(/\s+/).filter(w => !!w);
    const allowedPair = (i: number) =>
        (i > 0 && ALLOWED[squash(words[i - 1] + words[i])]) || (i < words.length - 1 && ALLOWED[squash(words[i] + words[i + 1])]);
    if (words.some((w, i) => !!nameFlag(w) && !allowedPair(i))) {
        return true;
    }
    return words.length > 1 && words.every(w => Array.from(w).length <= 2) && !!nameFlag(words.join(''));
}

export const FLAGGED_LIE = { message: 'That lie can\'t be used. Try another one.', code: 'FLAGGED_LIE' };
