import { gamesRef } from '../firebase';

/**
 * Writes the marks of who has sent (see sent.ts) under games/{pin}/players.
 * Never fails its caller: the game goes on without them.
 */
export function writeMarks(pin: string, update: { [path: string]: string }): Promise<void> {
    if (!Object.keys(update).length) {
        return Promise.resolve();
    }
    return gamesRef.child(pin).child('players').update(update)
        .catch(e => console.error(`[PIN: ${pin}] Failed to mark who has sent`, e && e.message));
}
