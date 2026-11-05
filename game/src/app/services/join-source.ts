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
const known = ['pin', 'link', 'qr', 'results', 'host', 'replay'];

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
