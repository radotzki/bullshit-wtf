import { GameScheme, GameState } from '../game-model';
import { get, gamesRef } from '../firebase';
import { advance } from './tick';

/**
 * How long other phones wait for a marked host who never joins the lobby before anyone may start.
 * Must match HOST_GRACE_MS in game/src/app/pages/game-staging/lobby-host.ts.
 */
export const HOST_GRACE_MS = 90 * 1000;

/**
 * How long a joined host may be away from the lobby before anyone may start. The host's lobby page
 * reports every HOST_PING_MS (hostHere), so this is several missed reports in a row.
 * Must match HOST_GONE_MS in game/src/app/pages/game-staging/lobby-host.ts.
 */
export const HOST_GONE_MS = 5 * 60 * 1000;

export type StartVerdict = 'host' | 'open' | 'host-missing' | 'host-gone' | 'not-host';

/**
 * Who may start a game from the lobby. Only a game made with a host key (see hostKey in game-model)
 * is held to its host:
 * - the phone that brings the game's host key starts it, big screen or not. The big screen only
 *   shows the lobby: any phone can open the present page or write `presenter`, so it proves nothing;
 * - if no player row is marked as the host 90 s after the lobby opened, anyone may start it,
 *   so a host who closed the tab cannot leave the group stuck;
 * - if the host joined but their lobby page has not reported in (hostSeen) for 5 minutes, anyone may
 *   start it, so a host whose phone died cannot leave the group stuck either. Only the server writes
 *   hostSeen, and only for the phone that brings the host key: a guest cannot make the host look gone.
 *   Only games from clients that report (serverStart) have it; without it the host must start;
 * - when the host made their computer the big screen (hasHost 'screen', see hostToBigScreen), no player
 *   row is the host and none is waited for: the big screen brings the host key and starts the game.
 *   It reports in like a host's phone, so only a big screen gone 5 minutes lets anyone start;
 * - games with no host key (made before host keys, or by an old client) keep the old rule: anyone
 *   may start them, and the lobby leaves that to the big screen if there is one.
 */
export function startVerdict(game: GameScheme, hostKey: string | undefined, now: number): StartVerdict {
    if (!game.hostKey) {
        return 'open';
    }
    if (hostKey && hostKey === game.hostKey) {
        return 'host';
    }
    const players = game.players || {};
    const hostIn = game.hasHost === 'screen' || Object.keys(players).some(k => players[k] && players[k].host);
    const openedAt = game.state && game.state.timestamp || 0;
    if (!hostIn && now - openedAt >= HOST_GRACE_MS) {
        return 'host-missing';
    }
    if (hostIn && game.serverStart && typeof game.hostSeen === 'number' && now - game.hostSeen >= HOST_GONE_MS) {
        return 'host-gone';
    }
    return 'not-host';
}

/** START in the lobby: move the game into its first round, if this phone may start it. */
export async function startGame(pin: string, hostKey: string | undefined, now = Date.now()): Promise<{ started: boolean }> {
    pin = typeof pin === 'string' ? pin.toUpperCase() : '';
    const game = pin ? await get<GameScheme>(gamesRef.child(pin)) : null;

    if (!game || !game.state) {
        return Promise.reject({ message: 'Wrong game PIN', code: 'GAME_NOT_EXIST' });
    }

    if (game.state.id !== GameState.GameStaging) {
        // Already started (a double tap, or the host and the big screen at once): nothing to do.
        return { started: false };
    }

    const verdict = startVerdict(game, hostKey, now);
    if (verdict === 'not-host') {
        console.log(`[PIN: ${pin}] START refused: not the host`);
        return Promise.reject({ message: 'Only the host can start this game', code: 'NOT_HOST' });
    }

    console.log(`[PIN: ${pin}] START by ${verdict}`);
    await advance(pin, game.state);
    return { started: true };
}

/**
 * The host's lobby page reports that it is still there. Only the phone (or big screen) that brings
 * the game's host key counts; the time is the server's. Nothing to do once the game has started,
 * or for games from older clients (no serverStart), which keep the host-only rule.
 */
export async function hostHere(pin: string, hostKey: string | undefined, now = Date.now()): Promise<{ seen: boolean }> {
    pin = typeof pin === 'string' ? pin.toUpperCase() : '';
    const game = pin ? await get<GameScheme>(gamesRef.child(pin)) : null;

    if (!game || !game.state) {
        return Promise.reject({ message: 'Wrong game PIN', code: 'GAME_NOT_EXIST' });
    }
    if (!game.hostKey || !hostKey || hostKey !== game.hostKey) {
        return Promise.reject({ message: 'Only the host can report in', code: 'NOT_HOST' });
    }
    if (game.state.id !== GameState.GameStaging || !game.serverStart) {
        return { seen: false };
    }

    await gamesRef.child(pin).child('hostSeen').set(now);
    return { seen: true };
}

/**
 * The host's computer becomes the big screen. A host who makes a game on a computer is seated there as
 * a player, so that screen cannot be the one the room looks at: it would show the host's own lies.
 * This frees the host's seat and marks the game as hosted from its big screen (hasHost 'screen'), in
 * one write. The host then joins from a phone like everyone else, and presses START on the big screen.
 *
 * Only the browser that brings the game's host key may do this, and only in the lobby. The only seats
 * removed are the ones marked as the host, which only that key can mark (see join.ts): no phone can
 * free another player's seat with it. The host key stays where it is, in the browser that is now the
 * big screen, and no phone is handed it: giving up the seat gives nobody else the host's powers.
 * Asking twice changes nothing.
 */
export async function hostToBigScreen(pin: string, hostKey: string | undefined, now = Date.now())
    : Promise<{ screen: boolean }> {
    pin = typeof pin === 'string' ? pin.toUpperCase() : '';
    const game = pin ? await get<GameScheme>(gamesRef.child(pin)) : null;

    if (!game || !game.state) {
        return Promise.reject({ message: 'Wrong game PIN', code: 'GAME_NOT_EXIST' });
    }
    if (!game.hostKey || !hostKey || hostKey !== game.hostKey) {
        return Promise.reject({ message: 'Only the host can make this the big screen', code: 'NOT_HOST' });
    }
    if (game.state.id !== GameState.GameStaging) {
        return Promise.reject({ message: 'The game has already started', code: 'GAME_STARTED' });
    }

    const update: { [path: string]: any } = { hasHost: 'screen', presenter: true };
    const players = game.players || {};
    Object.keys(players).filter(k => players[k] && players[k].host).forEach(k => update[`players/${k}`] = null);
    if (game.serverStart) {
        // The big screen's lobby page reports in from now on (see hostHere).
        update.hostSeen = now;
    }
    await gamesRef.child(pin).update(update);
    console.log(`[PIN: ${pin}] the host's computer is the big screen now`);
    return { screen: true };
}
