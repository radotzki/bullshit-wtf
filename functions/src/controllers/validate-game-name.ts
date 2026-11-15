import { MAX_PLAYERS, GameScheme } from '../game-model';
import { get, gamesRef } from '../firebase';
import { gameOverError } from './game-over';

export async function validateGameName(pin: string) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));

    if (!game) {
        return Promise.reject({ message: 'Wrong game PIN', code: 'GAME_NOT_EXIST' });
    }

    const over = await gameOverError(game, Date.now());
    if (over) {
        return Promise.reject(over);
    }

    if (Object.keys(game.players || {}).length >= MAX_PLAYERS) {
        return Promise.reject({ message: 'Sorry, game is full', code: 'GAME_IS_FULL' });
    }

    return Promise.resolve({});
}
