/**
 * Where this visit started, sent with a game this browser creates (BigQuery
 * `opened_games.first_page`, `referrer`, `played_before`, `hosted_before`, `visit_minutes`), so
 * the usage data can tell which routes bring new hosts: a search page, a post, an invite link.
 *
 * It is noted once, by the first page of the site this tab loads, and kept for the tab: the app
 * notes it at start-up (rememberArrival, called by AppComponent), and a plain page (how to play,
 * the search pages) notes it with the small script that seo/build-pages.js writes into it, under
 * the same key and in the same shape. Only the page's path and the referring site's host name are
 * kept: never a full address, a query string or an id. The server replaces a PIN or crew id in
 * the path before anything is stored (arrivalPage in game-model).
 *
 * Kept free of Angular so it can be tested in Node.
 */
import { readVisitor } from '../pages/landing/front-door';

const arrivalKey = 'BS_ARRIVAL';

/** What the tab keeps of its first page. */
export interface FirstPage {
    /** The path of the first page of the visit. */
    page: string;
    /** The host name of the site the visit came from; null when the browser sent none. */
    ref: string | null;
    /** When that page loaded (ms). */
    at: number;
}

/** What goes with newGame (see GameArrival in game-model). */
export interface NewGameArrival {
    page: string;
    ref: string | null;
    played: boolean;
    hosted: boolean;
    minutes: number;
}

// This page load's own note, for a browser whose tab storage is blocked.
let loaded: FirstPage | null = null;

const ADDRESS = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)([^?#]*)/i;

/** The host name of an address, in lower case, without sign-in, port, path or query: "www.google.com". */
export function hostOf(address: string): string | null {
    const m = ADDRESS.exec(address || '');
    if (!m) {
        return null;
    }
    const host = m[1].replace(/^[^@]*@/, '').replace(/:\d*$/, '').toLowerCase();
    return /^[a-z0-9.-]{1,60}$/.test(host) ? host : null;
}

/**
 * The first page of a visit, from the page that is loading and the address the browser says it
 * came from. A referrer on this same site means the visit began on a page that left no note (a
 * plain page built before the note existed, or with tab storage blocked): that page is the first
 * page, and the site before it is not known.
 */
export function firstPage(pathname: string, hostname: string, referrer: string, now: number): FirstPage {
    const ref = hostOf(referrer);
    if (ref && ref === String(hostname || '').toLowerCase()) {
        const m = ADDRESS.exec(referrer);
        return { page: ((m && m[2]) || '/').slice(0, 80), ref: null, at: now };
    }
    return { page: String(pathname || '/').slice(0, 80), ref, at: now };
}

/** A stored note, if it is one: anything else in the key reads as no note. */
export function parseFirstPage(stored: string | null): FirstPage | null {
    try {
        const v = JSON.parse(stored || 'null');
        if (!v || typeof v !== 'object' || typeof v.page !== 'string' || v.page.charAt(0) !== '/') {
            return null;
        }
        return {
            page: v.page.slice(0, 80),
            ref: typeof v.ref === 'string' && /^[a-z0-9.-]{1,60}$/.test(v.ref) ? v.ref : null,
            at: typeof v.at === 'number' && isFinite(v.at) ? v.at : 0,
        };
    } catch (e) {
        return null;
    }
}

/** Call once at start-up, before the router rewrites the address. An earlier note of this tab wins. */
export function rememberArrival() {
    let s: Storage | null = null;
    try {
        s = window.sessionStorage;
        const kept = parseFirstPage(s.getItem(arrivalKey));
        if (kept) {
            loaded = kept;
            return;
        }
    } catch (e) { }
    if (!loaded) {
        loaded = firstPage(window.location.pathname, window.location.hostname, document.referrer, Date.now());
    }
    try {
        if (s) {
            s.setItem(arrivalKey, JSON.stringify(loaded));
        }
    } catch (e) { }
}

/**
 * The arrival to send with a game created now. Read what the browser holds BEFORE the new game
 * leaves its own mark there (its host key): played and hosted are about earlier games only.
 */
export function newGameArrival(now: number = Date.now()): NewGameArrival | null {
    try {
        let first = loaded;
        try {
            first = parseFirstPage(window.sessionStorage.getItem(arrivalKey)) || loaded;
        } catch (e) { }
        if (!first) {
            return null;
        }
        const visitor = readVisitor(key => {
            try {
                return window.localStorage.getItem(key);
            } catch (e) {
                return null;
            }
        });
        const minutes = first.at > 0 && now >= first.at ? Math.floor((now - first.at) / 60000) : 0;
        return { page: first.page, ref: first.ref, played: visitor.played, hosted: visitor.hosted, minutes };
    } catch (e) {
        return null;
    }
}
