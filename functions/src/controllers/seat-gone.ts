import { GameState } from '../game-model';
import { readGame, isMoved } from './old-games';
import { advance } from './tick';
import { everyoneSent, leftOutGuardWait, revealEndWait, GONE_MS } from './seats';
import { playerPicks } from './scoring';
import { writingSent } from './about';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// A timer can fire a moment early: look just after the seat counts as gone, not just before.
const margin = 500;

// The longest this function waits for a phase's guard or a reveal's last row before it ends the phase.
// The trigger has 120 seconds (index.ts); a longer wait is left to the phase's own clock.
export const SEAT_GONE_MAX_WAIT_MS = 60 * 1000;

/**
 * A seat's page went away: the database wrote the time into games/{pin}/seen/{pid} (see seatGone in
 * seats.ts). The room stops waiting for that seat once it has been gone GONE_MS. When everyone else has
 * already sent their lie, pick or NEXT by then, nothing else would end the phase before its clock (the
 * lie, pick and NEXT checks only run when someone sends), so this looks once, GONE_MS after the page
 * left, and ends the phase if everyone still waited for is in. A phone that is back by then has set its
 * mark to true again, and is waited for as before. `mark` is the value written; true (a page that is
 * here) does nothing.
 */
export async function onSeatGone(pin: string, pid: string, mark: any, now = Date.now()) {
    if (typeof mark !== 'number' || !pin || !pid) {
        return;
    }
    const wait = mark + GONE_MS + margin - now;
    // A mark far in the past (written again by an old page) or the future (clock trouble): look now.
    if (wait > 0 && wait <= GONE_MS + margin) {
        await sleep(wait);
    }
    return endIfEveryoneIn(pin.toUpperCase());
}

/**
 * Ends the phase the game is on now when every seat the room waits for (seats.ts seatsToWaitFor) has
 * sent: the lies, the picks or NEXT on the reveal. Inside a phase's guard (a seat is left out, see
 * leftOutGuardWait), or before a reveal's last row is shown, it waits that out once and looks again.
 * advance() checks that the game is still in this very phase, so this races safely with the phase timer
 * and with the other checks. Returns whether it moved the game on.
 */
export async function endIfEveryoneIn(pin: string, waited = false): Promise<boolean> {
    const game = await readGame(pin);
    if (!game || !game.state || isMoved(game)) {
        return false;
    }
    const now = Date.now();
    const id = game.state.id;
    let wait: number | undefined;
    if (id === GameState.ShowQuestion) {
        wait = everyoneSent(game, writingSent(game), now) ? leftOutGuardWait(game, now) : undefined;
    } else if (id === GameState.ShowAnswers) {
        // Only a player's pick counts (see scoring.ts).
        wait = everyoneSent(game, playerPicks(game), now) ? leftOutGuardWait(game, now) : undefined;
    } else if (id === GameState.RevealTheTruth) {
        wait = revealEndWait(game, now);
    }
    if (wait === undefined) {
        return false;
    }
    if (wait > 0) {
        if (waited || wait > SEAT_GONE_MAX_WAIT_MS) {
            return false;
        }
        await sleep(wait + margin);
        return endIfEveryoneIn(pin, true);
    }
    console.log(`[PIN: ${pin}] Everyone still here is in; not waiting for a seat that is gone`);
    await advance(pin, game.state);
    return true;
}
