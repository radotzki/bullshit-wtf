/**
 * How long one ask for the server's time may take before it counts as failed. A Cloud Functions cold
 * start answers within a few seconds, so 8 s keeps a slow but working answer; past that the countdown
 * is better off on the phone's own clock, and the lobby asks again a minute later.
 */
export const CLOCK_TIMEOUT_MS = 8000;

/**
 * How far this phone's clock is from the server's, asked once and then kept.
 *
 * Only a successful answer is kept. A failed call (a phone on a flaky network) used to stay cached
 * as a rejected promise, so every later call failed too and the question countdown never started
 * again on that phone until a reload (Sentry BULLSHIT-WS). Now a failure is reported, this call falls
 * back to the phone's own clock (an offset of 0), and the next call asks the server again.
 *
 * `ifFailed` is what a caller gets when this call failed. The countdown wants 0 (the phone's own
 * clock is better than no countdown). The lobby passes null: it judges whether the host has gone by
 * the offset, and 0 there would be a guess taken as a measurement, so a phone whose clock runs
 * minutes fast would see the host as gone too early.
 *
 * A call that never settles (no answer and no error) counts as failed after `timeoutMs`. Before,
 * it stayed the kept answer for good: the countdown never started on that phone, and the lobby
 * never asked again nor judged the host gone. An answer that arrives after the timeout is dropped,
 * so it can never replace a newer one; the next call asks again.
 */
export function clockSync(
    fetchOffset: () => Promise<number>,
    onError?: (err: any) => void,
    timeoutMs: number = CLOCK_TIMEOUT_MS,
): (ifFailed?: number | null) => Promise<number | null> {
    // Resolves to null when the call failed; each caller then gets its own `ifFailed`.
    let offset: Promise<number | null> = null;

    return (ifFailed: number | null = 0) => {
        if (!offset) {
            const attempt: Promise<number | null> = withTimeout(Promise.resolve().then(fetchOffset), timeoutMs)
                .catch(err => {
                    if (offset === attempt) {
                        offset = null;
                    }
                    if (onError) {
                        onError(err);
                    }
                    return null;
                });
            offset = attempt;
        }

        return offset.then(value => value === null ? ifFailed : value);
    };
}

/** `promise`, or a rejection once `ms` have passed without it settling. The timer never outlives the call. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Clock sync timed out after ' + ms + ' ms')), ms);
        promise.then(value => {
            clearTimeout(timer);
            resolve(value);
        }, err => {
            clearTimeout(timer);
            reject(err);
        });
    });
}
