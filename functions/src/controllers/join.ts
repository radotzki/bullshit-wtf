import { GameScheme, GamePlayer } from '../game-model';
import { get, gamesRef } from '../firebase';
import { nameFlag, swapName, NICKNAME_MAX } from '../name-flag';
import { gameOverError } from './game-over';

export interface JoinResult {
    pid: string;
    /** The nickname the game shows: trimmed, cut to NICKNAME_MAX, or a swap name. */
    nickname: string;
    /** The typed name was a slur or a sex word and was swapped; only this phone is told. */
    swapped?: boolean;
}

/**
 * The nickname a player joins under. The whole typed name is checked first, then cut to
 * NICKNAME_MAX characters (cutting first could turn "nigger123456" into something that passes).
 * A flagged name becomes a sweet name from the game's language, picked by the player's uid.
 */
export function cleanNickname(typed: any, uid: string, pid: string, locale: string, players: GameScheme['players'])
    : { nickname: string; swapped: boolean } {
    const name = String(typed == null ? '' : typed).replace(/\s+/g, ' ').trim();
    if (nameFlag(name)) {
        // The same phone joining again (a refresh) keeps its name; anyone else's is taken.
        const taken = Object.keys(players || {})
            .filter(k => players[k] && !(uid && players[k].uid === uid))
            .map(k => players[k].nickname);
        return { nickname: swapName(uid || pid, locale, taken), swapped: true };
    }
    return { nickname: Array.from(name).slice(0, NICKNAME_MAX).join('').trim(), swapped: false };
}

/**
 * Add a player to a game. A join that carries the game's host key (the phone that created it)
 * is marked as the host, so the lobby knows the host even when that phone has no sign-in uid.
 */
export async function join(pin: string, typed: string, uid: string, hostKey?: string): Promise<JoinResult> {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));

    if (!game) {
        return Promise.reject({ message: 'Wrong game PIN', code: 'GAME_NOT_EXIST' });
    }

    // A finished game takes no new players (a typed PIN, or an old invite link).
    const over = await gameOverError(game, Date.now());
    if (over) {
        return Promise.reject(over);
    }

    if (Object.keys(game.players || {}).length === 8) {
        return Promise.reject({ message: 'Sorry, game is full', code: 'GAME_IS_FULL' });
    }

    const playersRef = gamesRef.child(pin).child('players');
    const pid = playersRef.push().key;
    const { nickname, swapped } = cleanNickname(typed, uid, pid, game.locale, game.players);
    const player: GamePlayer = { nickname, uid, score: 0 };
    const result: JoinResult = swapped ? { pid, nickname, swapped } : { pid, nickname };

    if (!game.hostKey || !hostKey || hostKey !== game.hostKey) {
        await playersRef.child(pid).set(player);
        return result;
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
    if (game.serverStart) {
        // The host is in the lobby now; their lobby page keeps reporting in (see hostHere).
        await gamesRef.child(pin).child('hostSeen').set(Date.now());
    }
    return result;
}
