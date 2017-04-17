import { GameScheme } from '../game-model';
import { get, gamesRef } from '../firebase';

export async function validateGameName(pin: string) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));

    if (!game) {
        return Promise.reject({ message: 'Wrong game PIN', code: 'GAME_NOT_EXIST' });
    }

    if (Object.keys(game.players || {}).length === 8) {
        return Promise.reject({ message: 'Sorry, game is full', code: 'GAME_IS_FULL' });
    }

    return Promise.resolve({});
}
