// Two tags on every report the site sends to Sentry, so a search can leave play-tests out and group
// errors by page without reading each event's address (reports/queries/hanukkah-night-sentry.md):
// - `test`: 'yes' when this tab is a play-test, by the rule the visit beacon and Create already use
//   (a `?via=test` or `?via=test-<name>` tag on this address, or kept for this tab in BS_CAMPAIGN),
//   else 'no'. The server's reports carry the same tag (functions/src/report.ts).
// - `page`: the app's route with the game's code taken out: '/join-game/:pin', '/he/c/:id',
//   '/portal/crazygames#/show-question/:pin'. No PIN, crew id or query string is ever in it.
// Kept free of Angular and of Raven so it can be tested in Node (test/sentry-tags.test.js).

/** The play-test rule: `test` or `test-<name>` (isTestTag in services/join-source.ts). */
function isTestTag(tag: string | null | undefined): boolean {
    return /^test(-|$)/.test(String(tag || '').toLowerCase().trim());
}

function viaOf(search: string | null | undefined): string {
    const m = /[?&]via=([^&#]*)/.exec(search || '');
    if (!m) {
        return '';
    }
    try {
        return decodeURIComponent(m[1]);
    } catch (e) {
        return m[1];
    }
}

/** 'yes' when this tab is a play-test, else 'no'. Never throws. */
export function testTag(win: any): 'yes' | 'no' {
    try {
        if (isTestTag(viaOf(win && win.location && win.location.search))) {
            return 'yes';
        }
        // A tag can also sit in the hash address of the portal (#/join-game/ABCD?via=test).
        const hash = String((win && win.location && win.location.hash) || '');
        const q = hash.indexOf('?');
        if (q >= 0 && isTestTag(viaOf(hash.slice(q)))) {
            return 'yes';
        }
    } catch (e) { }
    try {
        if (win && win.sessionStorage && isTestTag(win.sessionStorage.getItem('BS_CAMPAIGN'))) {
            return 'yes';
        }
    } catch (e) { }
    return 'no';
}

// The routes whose next part is a game's PIN or a crew's id (app-routing.module.ts).
const withCode: { [route: string]: string } = {
    'present-game': ':pin',
    'join-game': ':pin',
    'c': ':id',
    'challenge': ':pin',
    'game-staging': ':pin',
    'round-intro': ':pin',
    'show-question': ':pin',
    'show-answers': ':pin',
    'reveal-the-truth': ':pin',
    'score-board': ':pin',
    'score-board-final': ':pin',
    'step': ':pin',
};

/** A path with every code after a route that takes one swapped for its name. */
export function routeOf(path: string): string {
    const parts = String(path || '').split(/[?#]/)[0].split('/').filter(p => p !== '');
    const out: string[] = [];
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        out.push(/^[a-z0-9-]{1,40}$/.test(part) ? part : '_');
        if (withCode[part] && i + 1 < parts.length) {
            out.push(withCode[part]);
            i++;
        }
    }
    return ('/' + out.join('/')).slice(0, 100);
}

/** The page tag: the route, without the game's code. Never throws. */
export function pageTag(win: any): string {
    try {
        const loc = (win && win.location) || {};
        const page = routeOf(String(loc.pathname || '/'));
        const hash = String(loc.hash || '');
        // The portal routes by the hash (#/game-staging/ABCD): keep both parts.
        return hash.indexOf('#/') === 0 ? (page + '#' + routeOf(hash.slice(1))).slice(0, 200) : page;
    } catch (e) {
        return 'unknown';
    }
}

/** Both tags, added to an event Raven is about to send; the event's own tags win on a clash. */
export function addReportTags(data: any, win: any): any {
    try {
        if (data && typeof data === 'object') {
            data.tags = Object.assign({ test: testTag(win), page: pageTag(win) }, data.tags);
        }
    } catch (e) { }
    return data;
}
