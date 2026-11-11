// One page view, from the visit beacon in game/src/index.html (the plain search pages carry the
// same script). cleanVisit turns the posted body into a small, bounded row; visitRecord turns that
// into the BigQuery row of `analytics.visits`. No IP, no user agent, no uid, no nickname, no PIN:
// nothing in a row names a person or a game.
export interface VisitRow {
    // view: the page opened. create, join: this page view created or joined a game.
    // end: the page was hidden or closed. stuck: the app had not drawn after 12 s.
    kind: 'view' | 'stuck' | 'end' | 'create' | 'join';
    // Random per page load, never stored on the phone: groups the rows of one page view.
    view: string;
    first: string;
    last: string;
    booted: boolean;
    ms: number;
    err: string;
    lang: string;
    ref: string;
    // The ?via= tag of the link that brought the visitor (a post's tag, qr, link, results, crew, test).
    tag: string;
    // The browser held nothing of the game when the page opened; null when it could not be read
    // (storage blocked) or the client is an old one.
    first_visit: boolean | null;
    created: boolean;
    joined: boolean;
    // A plain page (how to play, the search pages): no app to start.
    plain: boolean;
    // The browser said it is driven by a script (navigator.webdriver).
    webdriver: boolean;
    device: string;
    browser: string;
    // A crawler or a scripted browser, from the user agent or webdriver.
    bot: boolean;
}

const KINDS = ['view', 'stuck', 'end', 'create', 'join'];

function text(v: any, max: number): string {
    return typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').slice(0, max) : '';
}

// A path of the game: letters, digits and / - _ only, so no query strings or tokens are logged.
function path(v: any): string {
    const p = text(v, 80);
    return /^\/[A-Za-z0-9\/_-]*$/.test(p) ? p : '';
}

export function deviceOf(ua: string): string {
    if (/iPad/.test(ua)) { return 'ipad'; }
    if (/iPhone|iPod/.test(ua)) { return 'iphone'; }
    if (/Android/.test(ua)) { return /Mobile/.test(ua) ? 'android' : 'android-tablet'; }
    if (/Macintosh/.test(ua)) { return 'mac'; }
    if (/Windows/.test(ua)) { return 'windows'; }
    if (/CrOS/.test(ua)) { return 'chromebook'; }
    if (/Linux/.test(ua)) { return 'linux'; }
    return 'other';
}

export function browserOf(ua: string): string {
    const inApp = /FBAN|FBAV|FB_IAB/.test(ua) ? 'facebook' : /Instagram/.test(ua) ? 'instagram'
        : /WhatsApp/.test(ua) ? 'whatsapp' : /TikTok|musical_ly|BytedanceWebview/.test(ua) ? 'tiktok' : '';
    if (inApp) { return inApp; }
    let m = ua.match(/CriOS\/(\d+)/);
    if (m) { return 'chrome-ios ' + m[1]; }
    m = ua.match(/FxiOS\/(\d+)/);
    if (m) { return 'firefox-ios ' + m[1]; }
    m = ua.match(/SamsungBrowser\/(\d+)/);
    if (m) { return 'samsung ' + m[1]; }
    m = ua.match(/Edg\w*\/(\d+)/);
    if (m) { return 'edge ' + m[1]; }
    m = ua.match(/Firefox\/(\d+)/);
    if (m) { return 'firefox ' + m[1]; }
    m = ua.match(/Chrome\/(\d+)/);
    if (m) { return (/; wv\)/.test(ua) ? 'webview ' : 'chrome ') + m[1]; }
    m = ua.match(/Version\/(\d+(\.\d+)?).*Safari/);
    if (m) { return 'safari ' + m[1]; }
    if (/AppleWebKit/.test(ua) && /Mobile\//.test(ua)) { return 'ios-webview'; }
    return 'other';
}

/** Crawlers and scripted browsers that run the page's scripts. */
export function botOf(ua: string): boolean {
    return /bot\b|crawl|spider|slurp|HeadlessChrome|Lighthouse|PageSpeed|PhantomJS|facebookexternalhit|Google-InspectionTool/i.test(ua);
}

/** phone, tablet, desktop or other, from deviceOf's answer. */
export function deviceKindOf(device: string): string {
    if (device === 'iphone' || device === 'android') { return 'phone'; }
    if (device === 'ipad' || device === 'android-tablet') { return 'tablet'; }
    return device === 'other' ? 'other' : 'desktop';
}

// A tag as cleanCampaign in game-model allows: lowercase letters, digits and dashes, 40 at most.
function tagOf(v: any): string {
    const t = text(v, 60).toLowerCase().trim();
    return /^[a-z0-9][a-z0-9-]{0,39}$/.test(t) ? t : '';
}

// The most copies of the visit function that may run at once. The endpoint is public and has no rate limit, so without a cap a
// flood of posts is served by as many copies as it asks for, and each one costs run time, a log
// line and a BigQuery row. The site has a few hundred visits a day, each sending about five small
// rows: far below one a second, and one warm copy answers a row in well under a second. Three
// leaves room for a full lobby of 8 phones opening the join page at once and for a copy held by
// a slow BigQuery call. Over the cap a row waits a moment or is dropped (the beacon reads no
// answer and never retries on failure), which no player sees. Raise it if real traffic grows
// about a hundredfold.
export const VISIT_MAX_INSTANCES = 3;

/** A test tag: `test` or `test-<name>`, the mark a play-test link carries (?via=test). */
export function isTestTag(tag: string): boolean {
    return /^test(-|$)/.test(tag || '');
}

/**
 * A path with the Hebrew prefix taken off and every PIN and crew id replaced, so rows group by
 * page and hold no game or crew: /he/join-game/ABCD -> /join-game/:pin, /c/k3j9 -> /c/:id.
 * The plain pages keep their own address (/he/hanukkah stays, it is a page of its own).
 */
export function pageOf(p: string): string {
    if (!p) { return ''; }
    let m = /^(\/he)?\/(join-game|present-game|game-staging|round-intro|show-question|show-answers|reveal-the-truth|score-board|score-board-final)\/[^\/]+\/?$/.exec(p);
    if (m) { return '/' + m[2] + '/:pin'; }
    m = /^(\/he)?\/c\/[^\/]+\/?$/.exec(p);
    if (m) { return '/c/:id'; }
    m = /^\/he\/(join-game)\/?$/.exec(p);
    if (m) { return '/' + m[1]; }
    if (p === '/he' || p === '/he/') { return '/'; }
    return p.length > 1 ? p.replace(/\/$/, '') : p;
}

/** The site language of an address: he under /he, else en. */
export function localeOf(p: string): string {
    return /^\/he(\/|$)/.test(p || '') ? 'he' : 'en';
}

export function cleanVisit(body: any, userAgent: any): VisitRow | null {
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { return null; }
    }
    if (!body || typeof body !== 'object' || KINDS.indexOf(body.k) < 0) {
        return null;
    }
    const ua = text(userAgent, 400);
    const ms = Number(body.ms);
    return {
        kind: body.k,
        view: /^[a-z0-9]{1,12}$/.test(text(body.v, 12)) ? text(body.v, 12) : '',
        first: path(body.first),
        last: path(body.last),
        booted: body.booted === true,
        ms: isFinite(ms) && ms >= 0 ? Math.min(Math.round(ms), 864e5) : -1,
        err: text(body.err, 200),
        lang: /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/.test(text(body.lang, 10)) ? text(body.lang, 10) : '',
        ref: /^[A-Za-z0-9.-]{1,60}$/.test(text(body.ref, 60)) ? text(body.ref, 60).toLowerCase() : '',
        tag: tagOf(body.tag),
        first_visit: body.fv === true ? true : body.fv === false ? false : null,
        created: body.cr === true || body.k === 'create',
        joined: body.jn === true || body.k === 'join',
        plain: body.pl === true,
        webdriver: body.wd === true,
        device: deviceOf(ua),
        browser: browserOf(ua),
        bot: body.wd === true || botOf(ua),
    };
}

/** The row of BigQuery `analytics.visits` (functions/bigquery/2026-11-visits.sql). */
export interface VisitRecord {
    time: Date;
    kind: string;
    view: string | null;
    page: string | null;
    last_page: string | null;
    locale: string;
    lang: string | null;
    ref: string | null;
    tag: string | null;
    test: boolean;
    first_visit: boolean | null;
    created: boolean;
    joined: boolean;
    device: string;
    device_kind: string;
    browser: string;
    bot: boolean;
    booted: boolean | null;
    ms: number | null;
    err: string | null;
}

export function visitRecord(row: VisitRow, now: Date = new Date()): VisitRecord {
    return {
        time: now,
        kind: row.kind,
        view: row.view || null,
        page: pageOf(row.first) || null,
        last_page: pageOf(row.last) || null,
        locale: localeOf(row.first),
        lang: row.lang ? row.lang.toLowerCase() : null,
        ref: row.ref || null,
        tag: row.tag || null,
        test: isTestTag(row.tag),
        first_visit: row.first_visit,
        created: row.created,
        joined: row.joined,
        device: row.device,
        device_kind: deviceKindOf(row.device),
        browser: row.browser,
        bot: row.bot,
        // Not known yet as the page opens, and a plain page has no app to start.
        booted: row.kind === 'view' || row.plain ? null : row.booted,
        ms: row.ms >= 0 ? row.ms : null,
        err: row.err || null,
    };
}
