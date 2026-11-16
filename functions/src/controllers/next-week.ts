/**
 * "Same time next week?", a 50/50 test on the final screen.
 *
 * 126 of 132 groups that played a second game never sat down together again, and the hooks for it
 * (SAVE THIS CREW, NEXT GAME NIGHT) took seven steps and a crew name. In the new half, the final
 * screen of a group's second or later game of a sitting offers one button beside REMATCH that sets
 * next week's date and puts it in the group's WhatsApp chat. The other half keeps today's screen.
 *
 * Which games: a Replay (it carries `root`, the PIN of its sitting's first game) or a crew's game,
 * with two players or more. Not a taste, and not the Replay of a taste, which is the group's first game.
 *
 * Which half: it follows the sitting, not the game, so a group does not flip between its second and
 * third game. The half is one bit of a hash of the sitting's root PIN (a crew game that is no Replay
 * is its own root), the way the staged reveal's half follows a game's PIN (big-reveal.ts).
 *
 * Phones learn it from the final state, which they already read and only the server writes:
 * state.nextWeek is true or false for a game in the test, and absent for every other game. A game
 * that was replayed before this was released carries no root and is not in the test.
 *
 * This file is pure (no Firebase) so it can be unit tested.
 */
import { createHash } from 'crypto';
import { GameScheme, GameStateInfo, tasteOf } from '../game-model';

/** The PIN of the first game of this game's sitting: its root, or the game itself. */
export function sittingRoot(pin: string, game: Partial<GameScheme> | null | undefined): string {
    const root = game && typeof game.root === 'string' && game.root ? game.root : pin;
    return String(root).toUpperCase();
}

/**
 * Which half a sitting falls in: true for the new final screen. The lowest bit of the first byte of
 * SHA-256('next-week:' + root PIN, in capitals). In BigQuery, with the root PIN in column root:
 *   MOD(TO_CODE_POINTS(SHA256(CONCAT('next-week:', UPPER(root))))[OFFSET(0)], 2) = 1
 * The root is the top of the parent_pin chain in opened_games, stopping below a taste (a game with
 * players = 1): a taste's Replay is the first game of its sitting.
 */
export function nextWeekHalf(root: string): boolean {
    const digest = createHash('sha256').update('next-week:' + String(root).toUpperCase(), 'utf8').digest();
    return digest[0] % 2 === 1;
}

/** The game's nextWeek as it ends: true or false for a game in the test, undefined for one that is not. */
export function drawNextWeek(pin: string, game: Partial<GameScheme> | null | undefined): boolean | undefined {
    if (!game || tasteOf(game.state) || Object.keys(game.players || {}).length < 2) {
        return undefined;
    }
    if (!game.root && !game.crew) {
        return undefined;
    }
    return nextWeekHalf(sittingRoot(pin, game));
}

/** The final state as the server writes it: with nextWeek, for a game in the test. */
export function withNextWeek(state: GameStateInfo, pin: string, game: Partial<GameScheme>): GameStateInfo {
    const half = drawNextWeek(pin, game);
    return half === undefined ? state : Object.assign({}, state, { nextWeek: half });
}
