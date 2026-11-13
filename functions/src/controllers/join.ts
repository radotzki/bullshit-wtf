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
 * The seat this phone already holds in the game, if any: the player id it sends back (its last join),
 * when that seat is in this game and was not taken by another browser, else the newest seat with the
 * phone's sign-in uid. A phone that joins again (Back to the join page, a reload, a second tap on
 * JOIN, a new name after a typo) gets its own seat back instead of a second one that nobody plays.
 * On 12 Nov one phone joined a Hebrew table five times under four names and left two silent seats of 8.
 */
export function seatOf(players: GameScheme['players'], uid: any, pid?: any): string | undefined {
    players = players || {};
    const myUid = typeof uid === 'string' && uid ? uid : undefined;
    if (typeof pid === 'string' && pid && players[pid]) {
        const seatUid = players[pid].uid;
        if (!seatUid || seatUid === myUid) {
            return pid;
        }
    }
    if (!myUid) {
        return undefined;
    }
    // Player ids are made in time order, so the last in sort order is the newest seat.
    return Object.keys(players).filter(k => players[k] && players[k].uid === myUid).sort().pop();
}

/** The longest browser string kept per seat: the same cut as the users table's (visit.ts). */
export const AGENT_MAX = 400;

/** A browser string as a seat keeps it: text, cut to AGENT_MAX; undefined when there is none. */
export function cleanAgent(agent: any): string | undefined {
    const text = typeof agent === 'string' ? agent.trim().slice(0, AGENT_MAX) : '';
    return text || undefined;
}

/** A nickname as seatByName compares it: spacing and case do not matter. */
function nameKey(name: any): string {
    return String(name == null ? '' : name).replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * The seat of a guest whose invite link opened in an empty browser again, by name. A chat app's own
 * browser (WhatsApp, Instagram, Facebook) often starts with no saved data, so a second tap on the same
 * link brings no uid and no player id that seatOf could match, and the guest got a second seat: their
 * score split, and the room waited on a ghost (game JVVP, 11 Nov). The seat comes back only when all hold:
 *   - the join brings no player id at all (a browser that has played before is someone's own browser);
 *   - exactly one seat has the typed name (spacing and case aside);
 *   - that seat joined with this very browser string;
 *   - that seat's page has gone away: the database marked it disconnected (`seen` is a time, not true).
 * Two people who share a name stay apart: a namesake whose page is still connected is never a match,
 * two quiet seats with the name are too many to choose from, and a seat with no browser string or no
 * `seen` (one that joined from an older page) is never given away.
 */
export function seatByName(game: GameScheme, typed: any, agent: any, pid?: any): string | undefined {
    const players = game && game.players || {};
    const name = nameKey(Array.from(nameKey(typed)).slice(0, NICKNAME_MAX).join('').trim());
    const ua = cleanAgent(agent);
    if ((typeof pid === 'string' && pid) || !name || !ua) {
        return undefined;
    }
    const named = Object.keys(players).filter(k => players[k] && nameKey(players[k].nickname) === name);
    if (named.length !== 1) {
        return undefined;
    }
    const k = named[0];
    const agents = game.agents || {};
    const seen = game.seen || {};
    return agents[k] === ua && typeof seen[k] === 'number' ? k : undefined;
}

/**
 * Add a player to a game. A join that carries the game's host key (the phone that created it)
 * is marked as the host, so the lobby knows the host even when that phone has no sign-in uid.
 * A phone that already has a seat here gets that seat back under the name it typed now (see seatOf),
 * with its score: one phone is one seat.
 */
export async function join(pin: string, typed: string, uid: string, hostKey?: string, myPid?: string, agent?: string)
    : Promise<JoinResult> {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));

    if (!game) {
        return Promise.reject({ message: 'Wrong game PIN', code: 'GAME_NOT_EXIST' });
    }

    // A phone that already has a seat here gets it back, even at a full table (not in a finished game).
    const mine = seatOf(game.players, uid, myPid);
    if (mine && !(await gameOverError(game, Date.now()))) {
        return rejoin(pin, game, mine, typed, uid, hostKey, agent);
    }

    // A guest back from an empty browser (a chat app's), same name, same browser, old page gone.
    const named = !mine && seatByName(game, typed, agent, myPid);
    if (named && !(await gameOverError(game, Date.now()))) {
        return rejoin(pin, game, named, typed, uid, hostKey, agent, true);
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
    const ua = cleanAgent(agent);
    if (ua) {
        await gamesRef.child(pin).child('agents').child(pid).set(ua);
    }

    if (!game.hostKey || !hostKey || hostKey !== game.hostKey) {
        await playersRef.child(pid).set(player);
        return result;
    }

    // The host joined again (a refresh, a second tab): only the newest row is the host.
    player.host = true;
    const update: { [path: string]: any } = { [pid]: player };
    clearOtherHosts(game, pid, update);
    await playersRef.update(update);
    await hostIsHere(pin, game);
    return result;
}

/** Marks every other seat as no longer the host, in `update` (paths under players). */
function clearOtherHosts(game: GameScheme, pid: string, update: { [path: string]: any }) {
    Object.keys(game.players || {}).forEach(k => {
        if (k !== pid && game.players[k] && game.players[k].host) {
            update[`${k}/host`] = null;
        }
    });
}

async function hostIsHere(pin: string, game: GameScheme) {
    if (game.serverStart) {
        // The host is in the lobby now; their lobby page keeps reporting in (see hostHere).
        await gamesRef.child(pin).child('hostSeen').set(Date.now());
    }
}

/**
 * The phone's own seat, back under the name it typed now; its score and marks stay. A seat given back
 * by name (byName) moves to the new browser: it takes that browser's uid, so the next join from it
 * (a reload) finds the seat by its player id (seatOf) as any phone's does.
 */
async function rejoin(pin: string, game: GameScheme, pid: string, typed: string, uid: string, hostKey?: string,
    agent?: string, byName?: boolean): Promise<JoinResult> {
    const { nickname, swapped } = cleanNickname(typed, uid, pid, game.locale, game.players);
    const update: { [path: string]: any } = { [`${pid}/nickname`]: nickname };
    const myUid = typeof uid === 'string' && uid ? uid : undefined;
    if (myUid && (byName || !game.players[pid].uid)) {
        update[`${pid}/uid`] = myUid;
    }
    const host = !!(game.hostKey && hostKey && hostKey === game.hostKey);
    if (host) {
        update[`${pid}/host`] = true;
        clearOtherHosts(game, pid, update);
    }
    const ua = cleanAgent(agent);
    if (ua && (!game.agents || game.agents[pid] !== ua)) {
        await gamesRef.child(pin).child('agents').child(pid).set(ua);
    }
    await gamesRef.child(pin).child('players').update(update);
    if (host) {
        await hostIsHere(pin, game);
    }
    console.log(byName
        ? `[PIN: ${pin}] a guest back from an empty browser got their seat back by name`
        : `[PIN: ${pin}] a phone joined again and got its seat back`);
    return swapped ? { pid, nickname, swapped } : { pid, nickname };
}
