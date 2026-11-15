import { MAX_PLAYERS, GameScheme } from '../game-model';
import { get, gamesRef } from '../firebase';
import { gameOverError } from './game-over';
import { nightAfter } from './night-after';

/**
 * Whether a phone may join the game by this PIN. A finished game answers GAME_OVER; within a week of its
 * end it carries the night's recap too (`nightAfter`, see night-after.ts), for the browser that asks:
 * `uid` and `pid` (its sign-in and its last seat) say whether that browser played. Older pages send neither.
 */
export async function validateGameName(pin: string, uid?: any, pid?: any) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));

    if (!game) {
        return Promise.reject({ message: 'Wrong game PIN', code: 'GAME_NOT_EXIST' });
    }

    const over = await gameOverError(game, Date.now());
    if (over) {
        // An open rematch lobby comes first, as before: no recap beside it.
        const recap = over.rematch ? null : nightAfter(pin, game, Date.now(), uid, pid);
        return Promise.reject(recap ? { ...over, nightAfter: recap } : over);
    }

    if (Object.keys(game.players || {}).length >= MAX_PLAYERS) {
        return Promise.reject({ message: 'Sorry, game is full', code: 'GAME_IS_FULL' });
    }

    return Promise.resolve({});
}
