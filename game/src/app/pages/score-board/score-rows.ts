import { GamePlayer, seatPicture } from './../../game-model';

/**
 * The rows of the scoreboard between questions, highest score first, each with its seat's picture.
 *
 * The players can read as nothing: six hours after a game ends the server moves them where phones
 * can't read them (see score-board-final/game-gone.ts), so a tab left open or reloaded on an old
 * game reads null. That is an empty board, not a crash (Sentry BULLSHIT-XB: Object.keys(null)).
 * The game's state then takes the phone on to the final screen, which goes to the join page.
 * Kept free of Angular so it can be tested in Node.
 */
export function scoreRows(players: { [pid: string]: GamePlayer } | null | undefined): (GamePlayer & { picture: string })[] {
    if (!players || typeof players !== 'object') {
        return [];
    }
    return Object.keys(players)
        .map(k => players[k])
        .filter(p => !!p && typeof p === 'object')
        .map((p, i) => Object.assign(p, { picture: seatPicture(i) }))
        .sort((a, b) => a.score < b.score ? 1 : -1);
}
