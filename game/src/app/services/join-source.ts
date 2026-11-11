/**
 * Where a player's join came from, for the BigQuery `users.via` column.
 *
 * Links carry `?via=qr`, `?via=link` or `?via=results`. The tag can arrive on
 * the join page itself or on the home page (the results card links there), and
 * the home page redirects without keeping the query string, so the tag is read
 * once from the address the app was opened with and kept for this tab.
 */
const arrivalKey = 'BS_VIA';
const hostedKey = 'BS_HOSTED_PIN';
const campaignKey = 'BS_CAMPAIGN';
const localeKey = 'BS_SITE_LOCALE';
const known = ['pin', 'link', 'qr', 'results', 'host', 'replay', 'crew'];

function storage(): Storage | null {
    try {
        return window.sessionStorage;
    } catch (e) {
        return null;
    }
}

function clean(via: string): string | null {
    if (!via) {
        return null;
    }
    via = String(via).toLowerCase();
    return known.indexOf(via) >= 0 ? via : 'other';
}

export function readVia(search: string): string | null {
    const match = /[?&]via=([^&#]*)/.exec(search || '');
    return match ? clean(decodeURIComponent(match[1])) : null;
}

/** Call once at start-up, before the router rewrites the address. */
export function rememberArrivalSource() {
    const via = readVia(window.location.search);
    const s = storage();
    if (via && s) {
        try {
            s.setItem(arrivalKey, via);
        } catch (e) { }
    }

    // The raw tag of a post link (?via=fb-he-hanukkah), sent with a game this tab creates.
    const tag = readCampaign(window.location.search);
    if (tag && s) {
        try {
            s.setItem(campaignKey, tag);
        } catch (e) { }
    }

    // Arriving on a Hebrew address (/he, /he/...) or with ?lang=he makes Hebrew the default for new games.
    const lang = /[?&]lang=(he|en)\b/.exec(window.location.search || '');
    const locale = lang ? lang[1] : (/^\/he(\/|$)/.test(window.location.pathname || '') ? 'he' : null);
    if (locale) {
        try {
            window.localStorage.setItem(localeKey, locale);
        } catch (e) { }
    }
}

/** A post's campaign tag, as cleanCampaign in game-model allows; known join sources are not campaigns. */
export function readCampaign(search: string): string | null {
    const match = /[?&]via=([^&#]*)/.exec(search || '');
    const tag = match ? decodeURIComponent(match[1]).toLowerCase().trim() : '';
    return /^[a-z0-9][a-z0-9-]{0,39}$/.test(tag) && known.indexOf(tag) < 0 ? tag : null;
}

/** The campaign tag this tab arrived with, if any. */
export function arrivalCampaign(): string | null {
    const s = storage();
    try {
        return s ? s.getItem(campaignKey) : null;
    } catch (e) {
        return null;
    }
}

/** The language this browser last arrived in ('he' from a Hebrew address), else from the browser. */
export function preferredLocale(): string {
    try {
        const saved = window.localStorage.getItem(localeKey);
        if (saved === 'he' || saved === 'en') {
            return saved;
        }
    } catch (e) { }
    try {
        const nav = (navigator.language || '').toLowerCase();
        return nav.indexOf('he') === 0 || nav.indexOf('iw') === 0 ? 'he' : 'en';
    } catch (e) {
        return 'en';
    }
}

/** The visitor picked a language on the home menu: keep it for the menu and for new games. */
export function setPreferredLocale(locale: string) {
    if (locale !== 'he' && locale !== 'en') {
        return;
    }
    try {
        window.localStorage.setItem(localeKey, locale);
    } catch (e) { }
}

/**
 * Tell the visit beacon (the inline script in index.html) that this page view created or joined a
 * game. It sends no PIN and no name: only that it happened, for the visits table.
 */
export function markVisit(what: 'create' | 'join') {
    try {
        const beacon = (window as any).bsVisit;
        if (typeof beacon === 'function') {
            beacon(what);
        }
    } catch (e) { }
}

/** The browser that created this game joins it as the host. */
export function markHosted(pin: string) {
    const s = storage();
    if (s) {
        try {
            s.setItem(hostedKey, pin.toUpperCase());
        } catch (e) { }
    }
}

/**
 * The join source for a join that is about to happen, used once.
 * routeVia: the `via` on the join page's address; pinInUrl: whether the
 * PIN came in the address (a link) rather than typed.
 */
export function takeJoinSource(pin: string, routeVia: string, pinInUrl: boolean): string {
    const s = storage();
    let arrival: string = null;
    let hosted: string = null;

    if (s) {
        try {
            arrival = s.getItem(arrivalKey);
            hosted = s.getItem(hostedKey);
            s.removeItem(arrivalKey);
            if (hosted && pin && hosted === pin.toUpperCase()) {
                s.removeItem(hostedKey);
            }
        } catch (e) { }
    }

    if (hosted && pin && hosted === pin.toUpperCase()) {
        return 'host';
    }

    return clean(routeVia) || clean(arrival) || (pinInUrl ? 'link' : 'pin');
}
