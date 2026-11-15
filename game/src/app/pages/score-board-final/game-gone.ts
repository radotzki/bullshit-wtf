/**
 * The final screen of a game whose players can no longer be read.
 *
 * Six hours after a game's final scoreboard, the server moves its players, lies and highlights to
 * where phones can't read them (functions/src/controllers/old-games.ts), so strangers can't walk old
 * games by their PINs. A phone that reloads an old final screen, or a big screen left open overnight,
 * then reads no players (or has its read refused), and the screen would stay half drawn. It goes to
 * the join page for the same PIN instead, which says "Game over" and offers the rematch if one is open.
 * Kept free of Angular so it can be tested in Node.
 */

/** The players read for the final screen: none (or a refused read, passed in as null) means the game is gone. */
export function gameGone(players: any): boolean {
    return !players || typeof players !== 'object' || !Object.keys(players).length;
}

/** The join page for this PIN, under the game's own language: the route's commands for router.navigate. */
export function joinPageFor(pin: string, locale: string): string[] {
    return [locale === 'he' ? '/he/join-game' : '/join-game', String(pin || '').toUpperCase()];
}
