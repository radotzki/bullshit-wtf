import { GameScheme, GamePlayer } from '../game-model';
import { get, gamesRef } from '../firebase';

/**
 * Add a player to a game. A join that carries the game's host key (the phone that created it)
 * is marked as the host, so the lobby knows the host even when that phone has no sign-in uid.
 */
export async function join(pin: string, nickname: string, uid: string, hostKey?: string) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));

    if (Object.keys(game.players || {}).length === 8) {
        return Promise.reject({ message: 'Sorry, game is full', code: 'GAME_IS_FULL' });
    }

    const playersRef = gamesRef.child(pin).child('players');
    const pid = playersRef.push().key;
    const player: GamePlayer = { nickname, uid, score: 0 };

    if (!game.hostKey || !hostKey || hostKey !== game.hostKey) {
        await playersRef.child(pid).set(player);
        return pid;
    }

    // The host joined again (a refresh, a second tab): only the newest row is the host.
    player.host = true;
    const update: { [path: string]: any } = { [pid]: player };
    Object.keys(game.players || {}).forEach(k => {
        if (game.players[k] && game.players[k].host) {
            update[`${k}/host`] = null;
        }
    });
    await playersRef.update(update);
    return pid;
}
