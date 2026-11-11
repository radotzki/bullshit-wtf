import { GameStateInfo } from '../game-model';
import { advance } from './tick';
import { maxPhaseDuration } from './phase';

// How long the timer waits before its second try when moving the game on failed.
const retryDelay = 2000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Server-side phase timer. Runs whenever games/{pin}/state changes: if the new phase has a deadline,
 * wait for it and move the game on. Phones no longer need to be awake for the game to keep going;
 * their own timers stay as a fallback in case this run fails.
 */
export async function onPhaseStart(pin: string, state: GameStateInfo, now = Date.now(), retryAfter = retryDelay) {
    if (!state || !state.deadline) {
        return;
    }

    const wait = state.deadline - now;

    if (wait > maxPhaseDuration) {
        console.log(`[PIN: ${pin}] Deadline too far away (${wait}ms), not waiting`);
        return;
    }

    if (wait > 0) {
        await sleep(wait);
    }

    try {
        return await advance(pin, state);
    } catch (e) {
        // advance() gave the phase back. One more try, in case what failed was passing (a database read).
        console.error(`[PIN: ${pin}] Phase timer failed, trying once more`, e);
        await sleep(retryAfter);
        return advance(pin, state);
    }
}
