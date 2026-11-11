import { GameScheme, GameStateInfo } from '../game-model';
import { get, gamesRef } from '../firebase';
import { advance } from './tick';
import { maxPhaseDuration, stateKey } from './phase';
import { LEFT_OUT_GUARD_MS, endsAfterGuard, guardedPhase } from './seats';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// A timer can fire a moment early, and a lie sent just inside the guard must be stored before we look.
const guardMargin = 250;

/**
 * Server-side phase timer. Runs whenever games/{pin}/state changes: if the new phase has a deadline,
 * wait for it and move the game on. Phones no longer need to be awake for the game to keep going;
 * their own timers stay as a fallback in case this run fails.
 *
 * On the way it looks once at the game, 10 seconds into the phase: if a seat nobody plays is left out
 * and everyone else has already answered or picked, the phase ends then (see seats.ts).
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

    const guardWait = state.timestamp + LEFT_OUT_GUARD_MS + guardMargin - now;

    if (guardedPhase(state.id) && guardWait < wait) {
        if (guardWait > 0) {
            await sleep(guardWait);
        }

        const game = await get<GameScheme>(gamesRef.child(pin.toUpperCase()));

        if (!game || !game.state || stateKey(game.state) !== stateKey(state)) {
            // The phase is over already: everyone answered.
            return;
        }

        if (endsAfterGuard(game, Date.now())) {
            console.log(`[PIN: ${pin}] Everyone who plays is in; not waiting for a seat nobody plays`);
            return advance(pin, state);
        }
    }

    const rest = state.deadline - Date.now();

    if (rest > 0) {
        await sleep(rest);
    }

    return advance(pin, state);
}
