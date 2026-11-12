/**
 * How far this phone's clock is from the server's, asked once and then kept.
 *
 * Only a successful answer is kept. A failed call (a phone on a flaky network) used to stay cached
 * as a rejected promise, so every later call failed too and the question countdown never started
 * again on that phone until a reload (Sentry BULLSHIT-WS). Now a failure is reported, this call falls
 * back to the phone's own clock (an offset of 0), and the next call asks the server again.
 */
export function clockSync(fetchOffset: () => Promise<number>, onError?: (err: any) => void): () => Promise<number> {
    let offset: Promise<number> = null;

    return () => {
        if (!offset) {
            const attempt: Promise<number> = Promise.resolve()
                .then(fetchOffset)
                .catch(err => {
                    if (offset === attempt) {
                        offset = null;
                    }
                    if (onError) {
                        onError(err);
                    }
                    return 0;
                });
            offset = attempt;
        }

        return offset;
    };
}
