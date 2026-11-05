import { GameStateInfo } from '../game-model';
import { advance } from './tick';
import { maxPhaseDuration } from './phase';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Server-side phase timer. Runs whenever games/{pin}/state changes: if the new phase has a deadline,
 * wait for it and move the game on. Phones no longer need to be awake for the game to keep going;
 * their own timers stay as a fallback in case this run fails.
 */
export async function onPhaseStart(pin: string, state: GameStateInfo, now = Date.now()) {
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

    return advance(pin, state);
}
