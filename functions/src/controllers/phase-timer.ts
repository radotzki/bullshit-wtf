import { GameScheme, GameStateInfo } from '../game-model';
import { get, gamesRef } from '../firebase';
import { advance } from './tick';
import { maxPhaseDuration, stateKey } from './phase';
import { leftOutGuardMs, endsAfterGuard, guardedPhase } from './seats';

// How long the timer waits before its second try when moving the game on failed.
const retryDelay = 2000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// A timer can fire a moment early, and a lie sent just inside the guard must be stored before we look.
const guardMargin = 250;

/**
 * Server-side phase timer. Runs whenever games/{pin}/state changes: if the new phase has a deadline,
 * wait for it and move the game on. Phones no longer need to be awake for the game to keep going;
 * their own timers stay as a fallback in case this run fails.
 *
 * On the way it looks once at the game, when the phase's guard is over (20 seconds into the lies,
 * 10 into the picks): if a seat nobody plays is left out
 * and everyone else has already answered or picked, the phase ends then (see seats.ts).
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

    const guardWait = state.timestamp + leftOutGuardMs(state.id) + guardMargin - now;

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
            try {
                return await advance(pin, state);
            } catch (e) {
                // advance() gave the phase back: go on to the deadline below, like any other phase.
                console.error(`[PIN: ${pin}] Ending the phase after the guard failed`, e);
            }
        }
    }

    const rest = state.deadline - Date.now();

    if (rest > 0) {
        await sleep(rest);
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
