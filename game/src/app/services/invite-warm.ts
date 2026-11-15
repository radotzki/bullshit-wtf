/**
 * Warming a game's invite link before the host shares it.
 *
 * A join link (/join-game/<PIN>?via=link) is answered by the joinPreview function, which names the
 * host in the link's preview ("Dana invited you to play Bullshit"). That function is usually asleep
 * when a host shares, and WhatsApp builds the card on the sender's phone while they are about to press
 * send: a cold start can make the card late, or the generic one. So the host's phone fetches its own
 * invite link once, in the background, as the lobby opens (and any phone does when it opens the invite
 * sheet). That wakes the function and puts the named page in Hosting's CDN, which keys on the exact
 * address, ?via=link included.
 *
 * What it promises:
 * - It counts as nothing: a fetch runs no script, so there is no visit beacon (analytics.visits), no
 *   join and no arrival tag; the function itself only reads the game and never writes.
 * - It never fails anything: no-cors, no cookies, errors and slowness ignored, nothing read back.
 * - At most once per address every WARM_AGAIN_MS in a page load (the CDN keeps a named page 10 minutes).
 */
export const WARM_AGAIN_MS = 5 * 60 * 1000;

const warmed: { [url: string]: number } = {};

export type WarmFetch = (url: string, init: any) => Promise<any>;

/** Fetch `url` once in the background; true when a fetch was started. */
export function warmInviteLink(url: string, fetcher: WarmFetch | null | undefined, now: number = Date.now()): boolean {
    if (!url || typeof fetcher !== 'function') {
        return false;
    }
    const last = warmed[url];
    if (typeof last === 'number' && now - last < WARM_AGAIN_MS) {
        return false;
    }
    warmed[url] = now;
    try {
        const p = fetcher(url, { mode: 'no-cors', credentials: 'omit', keepalive: true, redirect: 'follow' });
        if (p && typeof p.catch === 'function') {
            p.catch(() => null);
        }
    } catch (e) { }
    return true;
}

/** Forget what was warmed (tests). */
export function forgetWarmed() {
    Object.keys(warmed).forEach(k => delete warmed[k]);
}
