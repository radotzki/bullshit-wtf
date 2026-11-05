import { GameScheme, GameState } from '../game-model';
import { get, gamesRef } from '../firebase';
import { advance } from './tick';

/**
 * How long other phones wait for a marked host who never joins the lobby before anyone may start.
 * Must match HOST_GRACE_MS in game/src/app/pages/game-staging/lobby-host.ts.
 */
export const HOST_GRACE_MS = 90 * 1000;

export type StartVerdict = 'host' | 'open' | 'host-missing' | 'not-host';

/**
 * Who may start a game from the lobby. Only a game made with a host key (see hostKey in game-model)
 * is held to its host:
 * - the phone that brings the game's host key starts it, big screen or not. The big screen only
 *   shows the lobby: any phone can open the present page or write `presenter`, so it proves nothing;
 * - if no player row is marked as the host 90 s after the lobby opened, anyone may start it,
 *   so a host who closed the tab cannot leave the group stuck;
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
    const hostIn = Object.keys(players).some(k => players[k] && players[k].host);
    const openedAt = game.state && game.state.timestamp || 0;
    if (!hostIn && now - openedAt >= HOST_GRACE_MS) {
        return 'host-missing';
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
