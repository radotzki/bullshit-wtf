import { GameScheme } from '../game-model';
import { get, gamesRef } from '../firebase';

export async function join(pin: string, nickname: string, uid: string) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));

    if (Object.keys(game.players || {}).length === 8) {
        return Promise.reject({ message: 'Sorry, game is full', code: 'GAME_IS_FULL' });
    }

    const pid = gamesRef.child(pin).child('players').push().key;
    await gamesRef.child(pin).child('players').child(pid).set({ nickname, uid, score: 0 });
    return pid;
}
