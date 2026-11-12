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
 */
export function clockSync(
    fetchOffset: () => Promise<number>,
    onError?: (err: any) => void,
): (ifFailed?: number | null) => Promise<number | null> {
    // Resolves to null when the call failed; each caller then gets its own `ifFailed`.
    let offset: Promise<number | null> = null;

    return (ifFailed: number | null = 0) => {
        if (!offset) {
            const attempt: Promise<number | null> = Promise.resolve()
                .then(fetchOffset)
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
