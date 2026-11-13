import { get, gamesRef } from '../firebase';
import { GameScheme } from '../game-model';
import { advance } from './tick';
import { revealEndWait } from './seats';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// A tap can come in a moment before the server thinks the last row was shown (phone clocks differ a little).
// Wait that out rather than ignore it, but never longer than this.
const maxWait = 5000;

/**
 * A player tapped NEXT on the reveal: once every player has, end the reveal now instead of at its deadline.
 * A seat that has sent nothing in this game is not waited for (see seats.ts).
 */
export async function onRevealDone(pin: string) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));
    const wait = revealEndWait(game, Date.now());

    if (wait === undefined || wait > maxWait) {
        return;
    }

    if (wait > 0) {
        await sleep(wait);
    }

    // advance() checks the game is still in this very reveal and claims the lock, so this is safe
    // to race with the phase timer and with other taps.
    return advance(pin, game.state);
}
