/**
 * The game inside Discord, as an Activity: every request goes through Discord's proxy.
 *
 * Discord serves an Activity from https://<app id>.discordsays.com, in a frame, under a content policy
 * that lets the page reach that one host (and a few Discord addresses) and nothing else. The app's own
 * files come through the proxy's "/" mapping (to bullshit.wtf). Every other host the game talks to
 * (the live database, sign-in, the functions, Sentry) needs a URL mapping in the Discord developer app,
 * and the page has to send its requests to the mapped path on its own host instead of to the real host.
 *
 * patchForDiscordProxy() does that rewrite, the way the Embedded App SDK's patchUrlMappings does
 * (@discord/embedded-app-sdk 2.5.0, src/utils/url.ts and patchUrlMappings.ts): it wraps fetch,
 * WebSocket and XMLHttpRequest.open, and sends https://bullshit-wtf-prod.firebaseio.com/x to
 * https://<app id>.discordsays.com/fb/bullshit-wtf-prod/x. It is a small copy and not the SDK itself
 * because it runs in the polyfills, on every page load of the site: the SDK's package marks no part of
 * itself free of side effects, so importing it there would ship all of it to every visitor. The test
 * (test/discord-proxy.test.js) checks that this rewrite gives the same address as the SDK's for every
 * mapping below.
 *
 * Off Discord nothing here runs: boot.ts only calls patchForDiscordProxy() when the page's own host is
 * a discordsays.com host, which bullshit.wtf never is.
 *
 * Kept free of imports and of Angular, so the test can load it in Node.
 */

/** One URL mapping, as typed into the Discord developer app (Activities > URL Mappings). */
export interface UrlMapping {
    /** The path on the Activity's own host, e.g. "/fb/{sub}". */
    prefix: string;
    /** The real host the proxy forwards to, with no protocol, e.g. "{sub}.firebaseio.com". */
    target: string;
}

/**
 * The game's URL mappings, in the order the developer app must list them: Discord takes the first
 * prefix that fits, so "/" is last. Paths without "/.proxy/": Discord's proxy has taken both forms since
 * July 2025, and SDK 2.x's patchUrlMappings writes them this way.
 *   /fb/{sub}    the live game database's WebSocket, on its own host or the shard host it moves to
 *   /gapi/{sub}  anonymous sign-in (identitytoolkit, securetoken)
 *   /cf          every game action (newGame, onJoinGame, ...)
 *   /sentry      error reports
 *   /            the game's own files and pages
 */
export const URL_MAPPINGS: UrlMapping[] = [
    { prefix: '/fb/{sub}', target: '{sub}.firebaseio.com' },
    { prefix: '/gapi/{sub}', target: '{sub}.googleapis.com' },
    { prefix: '/cf', target: 'us-central1-bullshit-wtf-prod.cloudfunctions.net' },
    { prefix: '/sentry', target: 'sentry.io' },
    { prefix: '/', target: 'bullshit.wtf' },
];

/** The host Discord serves every Activity from: <app id>.discordsays.com. */
const DISCORD_HOST = /^[a-z0-9-]+\.discordsays\.com$/i;

/** True when the page is the game inside Discord (its own host is the Activity's proxy host). */
export function inDiscord(hostname: string): boolean {
    return DISCORD_HOST.test(hostname || '');
}

const TOKEN = /\{([a-z]+)\}/g;

/** The target's host as a pattern over a URL's host: {name} takes one label of letters, digits, _ and -. */
function hostPattern(target: string): RegExp {
    const host = target.split('/')[0];
    const parts = host.split(TOKEN);
    let source = '';
    parts.forEach((part, i) => {
        // split() with a capture group puts the token names at the odd places.
        source += i % 2 ? `(?<${part}>[\\w-]+)` : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
    return new RegExp(`^${source}$`, 'i');
}

/**
 * The address a request to `url` goes to inside Discord, or `url` itself when no mapping takes it.
 * `proxyHost` is the page's own host (location.host). Same result as the SDK's attemptRemap for the
 * game's mappings; unlike it, a mapping is matched on the URL's host only, never on text in its path.
 */
export function remap(url: string, proxyHost: string, base: string, mappings: UrlMapping[] = URL_MAPPINGS): string {
    let u: URL;
    try {
        u = new URL(url, base);
    } catch (e) {
        return url;
    }
    if (u.host === proxyHost) {
        return url;
    }
    for (const mapping of mappings) {
        const match = hostPattern(mapping.target).exec(u.host);
        if (!match) {
            continue;
        }
        const groups = match.groups || {};
        const prefix = mapping.prefix.replace(TOKEN, (_, name) => groups[name]);
        const rest = u.pathname.replace(/^\//, '');
        let pathname = prefix.endsWith('/') ? prefix + rest : `${prefix}/${rest}`;
        if (u.pathname.endsWith('/') && !pathname.endsWith('/')) {
            pathname += '/';
        }
        const out = new URL(u.toString());
        out.host = proxyHost;
        out.pathname = pathname;
        return out.toString();
    }
    return url;
}

/**
 * Send every fetch, WebSocket and XMLHttpRequest of the page through Discord's proxy. Must run before
 * any library keeps its own copy of these: Firebase's database code takes window.WebSocket the moment
 * its module loads (@firebase/database, `WebSocketImpl = WebSocket`), so boot.ts runs it from the
 * polyfills, before the app's main bundle. Returns false when there is no window to patch.
 */
export function patchForDiscordProxy(win: any, mappings: UrlMapping[] = URL_MAPPINGS): boolean {
    if (!win || !win.location) {
        return false;
    }
    const to = (url: any) => remap(String(url), win.location.host, win.location.href, mappings);

    if (typeof win.fetch === 'function') {
        const realFetch = win.fetch;
        win.fetch = function (input: any, init?: any) {
            if (win.Request && input instanceof win.Request) {
                const mapped = to(input.url);
                // A Request's address can't change: make a new one from it, body and all.
                return realFetch.call(win, mapped === input.url ? input : new win.Request(mapped, input), init);
            }
            return realFetch.call(win, to(input instanceof win.URL ? input.toString() : input), init);
        };
    }

    if (typeof win.WebSocket === 'function') {
        const RealWebSocket = win.WebSocket;
        const ProxiedWebSocket = function (url: any, protocols?: any) {
            const mapped = to(url);
            return protocols === undefined ? new RealWebSocket(mapped) : new RealWebSocket(mapped, protocols);
        } as any;
        ProxiedWebSocket.prototype = RealWebSocket.prototype;
        ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(k => { ProxiedWebSocket[k] = RealWebSocket[k]; });
        win.WebSocket = ProxiedWebSocket;
    }

    if (win.XMLHttpRequest && win.XMLHttpRequest.prototype) {
        const realOpen = win.XMLHttpRequest.prototype.open;
        win.XMLHttpRequest.prototype.open = function (method: string, url: any, ...rest: any[]) {
            return realOpen.call(this, method, to(url), ...rest);
        };
    }
    return true;
}
