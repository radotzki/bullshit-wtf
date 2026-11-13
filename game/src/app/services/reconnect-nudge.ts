/**
 * Bring a phone back to the database within a few seconds of its network coming back.
 *
 * The database client (Firebase 13; 3.9 behaved the same) waits a random time after each failed connection attempt,
 * up to a delay that starts at 1 s and grows 1.3 times per failure, up to 5 minutes. After about
 * 40 s away that delay is 10 to 20 s, so a phone whose network is back can sit out a whole
 * question. The client skips the wait only when the browser fires "online" or the page becomes
 * visible, and many phones get their network back without either.
 *
 * So while the client says it is disconnected and the page is visible, this calls goOnline()
 * every few seconds. In that client goOnline() resets the delay to 1 s and, only when no attempt
 * is under way, starts one at once. An attempt still running on a slow network is left alone,
 * and nothing is interrupted: listeners and writes waiting to be sent stay as they are. It never
 * calls goOffline().
 *
 * A hidden page is left to the client, which waits longer there on purpose and connects at once
 * when the page is visible again.
 */

/** How often a disconnected, visible page asks the client to try again. */
export const NUDGE_EVERY_MS = 3000;

export interface NudgeDeps {
    /** Follow the client's connected flag (.info/connected). Returns a function that stops following. */
    onConnected(listener: (connected: boolean) => void): () => void;
    /** The database's goOnline(). */
    goOnline(): void;
    /** Whether the page is visible now. */
    isVisible(): boolean;
    setInterval(fn: () => void, ms: number): any;
    clearInterval(handle: any): void;
}

/** Start nudging. Returns a function that stops it. */
export function startReconnectNudge(deps: NudgeDeps, everyMs = NUDGE_EVERY_MS): () => void {
    let timer: any = null;

    const stopTimer = () => {
        if (timer !== null) {
            deps.clearInterval(timer);
            timer = null;
        }
    };

    const stopFollowing = deps.onConnected(connected => {
        if (connected) {
            stopTimer();
        } else if (timer === null) {
            timer = deps.setInterval(() => {
                if (deps.isVisible()) {
                    deps.goOnline();
                }
            }, everyMs);
        }
    });

    return () => {
        stopTimer();
        stopFollowing();
    };
}

/** The page's visibility, counting a browser without the Page Visibility API as visible. */
export function pageVisible(): boolean {
    return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}
