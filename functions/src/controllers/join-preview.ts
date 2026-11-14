// A join link's own link preview. The lobby's invite is a link, /join-game/<PIN> (/he/join-game/<PIN>
// for a Hebrew game), that the host sends in WhatsApp or another chat. firebase.json sends those two
// paths to the `joinPreview` function, which answers with the site's own page (the same index.html or
// he.html that Hosting serves for every other path) with the link-preview tags between the BS:META
// markers rewritten for this one game: "Dana invited you to play Bullshit", in the game's language,
// with the game's picture. Everyone gets the same page: a preview fetcher (WhatsApp, Telegram,
// Facebook, iMessage, Slack, X) reads the tags, a browser runs the app, which shows the join page for
// the PIN in the address as before. There is no user-agent sniffing, so the CDN can cache the answer.
//
// What it promises:
// - It reads only the game's language, phase and times, pack, creator and players (nicknames and
//   the host mark), and never writes.
// - A nickname is shown only when it is the host's, passes the nickname filter (name-flag.ts) and is
//   not one of the swap names a flagged player gets; it is cut to NICKNAME_MAX and escaped.
// - An unknown, finished or stale PIN, a game with no host yet, a slow database or anything that
//   goes wrong gets the generic preview (the page unchanged, or with a nameless invite). A person
//   always gets the app.
// - The page itself is fetched from the site (Hosting's CDN), so it always names the site's current
//   scripts. A copy is kept in memory and checked again with its ETag when it is older than SHELL_FRESH_MS.
import { GameScheme, GameState, isPack } from '../game-model';
import { nameFlag, NICKNAME_MAX, SWAP_NAMES } from '../name-flag';
import { isGameOver } from './game-over';
import { get, gamesRef } from '../firebase';

export type PreviewLocale = 'en' | 'he';

/** What a join link's path says: the PIN and which of the site's two pages it is served from. */
export interface JoinPath {
    pin: string;
    /** The page the path is served from: /he/... is the Hebrew page (he.html), anything else index.html. */
    shell: PreviewLocale;
}

/** The parts of a game that the preview reads. */
export type PreviewGame = Pick<GameScheme, 'locale' | 'state' | 'timestamp' | 'hostSeen' | 'pack' | 'creator' | 'players'>;

/** The preview of one game, or null for the generic one (the page as Hosting serves it). */
export interface Preview {
    locale: PreviewLocale;
    title: string;
    description: string;
    image: string;
    imageAlt: string;
    /** The host's nickname as shown, or '' for a nameless invite. */
    host: string;
}

export const SITE = 'https://bullshit.wtf';
/** The page is checked against the site again when the copy in memory is older than this. */
export const SHELL_FRESH_MS = 15 * 1000;
/** Fetching the page from the site is given up after this long, and then tried once more. */
export const SHELL_TIMEOUT_MS = 2500;
/** Reading the game is given up after this long: the link gets the generic preview. */
export const READ_TIMEOUT_MS = 1500;

/** The PIN and page of a join link's path, or null when the path is no join link with a PIN. */
export function parseJoinPath(path: any): JoinPath | null {
    const m = /^\/(he\/)?join-game\/([A-Za-z0-9]{2,12})\/?$/.exec(typeof path === 'string' ? path : '');
    return m ? { pin: m[2].toUpperCase(), shell: m[1] ? 'he' : 'en' } : null;
}

const SWAPS: { [lower: string]: boolean } = {};
[].concat((SWAP_NAMES && SWAP_NAMES.en) || [], (SWAP_NAMES && SWAP_NAMES.he) || [])
    .forEach((n: string) => SWAPS[String(n).trim().toLowerCase()] = true);

// Control characters, and the invisible ones that turn text around (bidi overrides and isolates),
// which a name could use to make a preview read as something else.
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;

/** A nickname as a preview may show it, or '' when it must not be shown. */
export function shownName(nickname: any): string {
    if (typeof nickname !== 'string') {
        return '';
    }
    const name = Array.from(nickname.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim()).slice(0, NICKNAME_MAX).join('').trim();
    if (!name || nameFlag(nickname) || nameFlag(name) || SWAPS[name.toLowerCase()]) {
        return '';
    }
    // At least one letter or digit: a name of dots or emoji alone reads badly in a title.
    return /[A-Za-z0-9\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff\u0590-\u05ff\u0600-\u06ff]/.test(name) ? name : '';
}

/**
 * The host's seat: the one the server marked as host (the newest, if a refresh left two), else the seat
 * of the browser that created the game. Undefined when neither is there yet.
 */
export function hostOf(game: PreviewGame): string | undefined {
    const players = game && game.players && typeof game.players === 'object' ? game.players : {};
    const seats = Object.keys(players).filter(k => players[k] && typeof players[k] === 'object').sort();
    const marked = seats.filter(k => players[k].host === true).pop();
    if (marked) {
        return players[marked].nickname;
    }
    const creator = game && game.creator;
    const own = creator ? seats.filter(k => players[k].uid === creator).pop() : undefined;
    return own ? players[own].nickname : undefined;
}

const TEXT = {
    en: {
        named: (host: string) => `${host} invited you to play Bullshit`,
        nameless: 'You\'re invited to a game of Bullshit',
        description: (pin: string) =>
            `Tap to join game ${pin}. The party game of lies: write a fake answer, fool your friends, find the truth. Everyone plays on their own phone. Free, no download.`,
        alt: 'Bullshit: fool your friends with fake answers to strange true facts',
    },
    // Hebrew with no gender: "מחכה" and "לך" are written the same for a man and a woman, and so is "הוזמנת".
    he: {
        named: (host: string) => `הזמנה לבולשיט: ${host} מחכה לך`,
        nameless: 'הוזמנת למשחק בולשיט',
        description: (pin: string) =>
            `הקישור מצרף אותך ישר למשחק ${pin}. משחק השקרים למסיבות: ממציאים תשובה מזויפת, עובדים על החברים ומגלים את האמת. כל אחד משחק מהטלפון, בחינם ובלי הורדה.`,
        alt: 'בולשיט: עבדו על החברים עם תשובות מזויפות לעובדות מוזרות ואמיתיות',
    },
};

/** The picture of a game: its pack's, else the language's own. All are 1200 x 630, in game/src/assets. */
export function imageOf(locale: PreviewLocale, pack: any, origin: string = SITE): string {
    if (isPack(pack) && pack === 'hanukkah') {
        return `${origin}/assets/og-hanukkah-${locale}.png`;
    }
    return `${origin}/assets/${locale === 'he' ? 'og-image-he.png' : 'og-image.png'}`;
}

/**
 * The preview of a game, or null for the generic one: no such game, a finished one (final scoreboard),
 * or one nobody has moved on for six hours (isGameOver, the same test the join page makes).
 */
export function previewOf(game: PreviewGame | null, pin: string, now: number, origin: string = SITE): Preview | null {
    if (!game || typeof game !== 'object' || !game.state || typeof game.state.id !== 'number') {
        return null;
    }
    if (game.state.id === GameState.ScoreBoardFinal || isGameOver(game as GameScheme, now)) {
        return null;
    }
    const locale: PreviewLocale = game.locale === 'he' ? 'he' : 'en';
    const t = TEXT[locale];
    const host = shownName(hostOf(game));
    return {
        locale,
        title: host ? t.named(host) : t.nameless,
        description: t.description(pin),
        image: imageOf(locale, game.pack, origin),
        imageAlt: t.alt,
        host,
    };
}

/** Text for an HTML attribute or element. */
export function escapeHtml(s: string): string {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const BLOCK = /<!-- BS:META:START -->[\s\S]*?<!-- BS:META:END -->/;

/** Sets the content of every <meta> in `block` whose `attr` is `name`; false when there is none. */
function setMeta(block: { html: string }, attr: string, name: string, value: string): boolean {
    const re = new RegExp(`(<meta\\s+${attr}="${name.replace(/[.:]/g, m => '\\' + m)}"\\s+content=")[^"]*(")`, 'g');
    let found = false;
    block.html = block.html.replace(re, (all, a, b) => {
        found = true;
        return a + escapeHtml(value) + b;
    });
    return found;
}

/**
 * The page with the preview's tags: the title, description, Open Graph, X and Schema.org tags between
 * the BS:META markers, the og:url of the link itself, and noindex (a page with a player's nickname is
 * no page for a search engine). Null when the page lacks the markers or a tag, so a changed index.html
 * falls back to the generic page and a test fails, instead of a preview with half its tags.
 */
export function personalize(shell: string, preview: Preview, url: string): string | null {
    const match = BLOCK.exec(shell || '');
    if (!match) {
        return null;
    }
    const block = { html: match[0] };
    const ogLocale = preview.locale === 'he' ? 'he_IL' : 'en_US';
    const otherLocale = preview.locale === 'he' ? 'en_US' : 'he_IL';
    const sets: [string, string, string][] = [
        ['name', 'description', preview.description],
        ['property', 'og:title', preview.title],
        ['property', 'og:description', preview.description],
        ['property', 'og:url', url],
        ['property', 'og:image', preview.image],
        ['property', 'og:image:alt', preview.imageAlt],
        ['property', 'og:locale', ogLocale],
        ['property', 'og:locale:alternate', otherLocale],
        ['name', 'twitter:title', preview.title],
        ['name', 'twitter:description', preview.description],
        ['name', 'twitter:image', preview.image],
        ['itemprop', 'description', preview.description],
        ['itemprop', 'image', preview.image],
    ];
    for (const [attr, name, value] of sets) {
        if (!setMeta(block, attr, name, value)) {
            return null;
        }
    }
    block.html = block.html.replace('<!-- BS:META:START -->', '<!-- BS:META:START -->\n  <meta name="robots" content="noindex">');
    const page = shell.slice(0, match.index) + block.html + shell.slice(match.index + match[0].length);
    if (!/<title>[^<]*<\/title>/.test(page)) {
        return null;
    }
    return page.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(preview.title)}</title>`);
}

/**
 * How long the CDN and browsers may keep the answer. A game's preview changes when its host renames or
 * the game ends, so a few minutes; an invite with no name yet (the host has not joined) only one, so
 * the name shows as soon as there is one. The page names the site's scripts, and Hosting empties its
 * CDN on every release.
 */
export function cacheControl(kind: 'named' | 'nameless' | 'generic' | 'fallback'): string {
    switch (kind) {
        case 'named': return 'public, max-age=300, s-maxage=600';
        case 'generic': return 'public, max-age=300, s-maxage=600';
        case 'nameless': return 'public, max-age=60, s-maxage=60';
        default: return 'no-store';
    }
}

/**
 * The site's address for this request: the host the visitor used when it is one of ours (Hosting
 * passes it on as x-forwarded-host), else the site. Never another host, so the function only ever
 * fetches its own site.
 */
export function originOf(headers: any, project: string, emulator: boolean): string {
    const raw = String((headers && (headers['x-forwarded-host'] || headers.host)) || '').split(',')[0].trim().toLowerCase();
    if (emulator && /^(127\.0\.0\.1|localhost)(:\d{1,5})?$/.test(raw)) {
        return `http://${raw}`;
    }
    const ours = /^(www\.)?bullshit\.wtf$/.test(raw)
        || (!!project && /^[a-z0-9-]+$/.test(project)
            && new RegExp(`^${project}(--[a-z0-9-]+)?\\.(web\\.app|firebaseapp\\.com)$`).test(raw));
    if (ours) {
        return `https://${raw}`;
    }
    return project && project !== 'bullshit-wtf-prod' && /^[a-z0-9-]+$/.test(project) ? `https://${project}.web.app` : SITE;
}

// ---- the page, from the site ----

interface ShellCopy {
    body: string;
    etag: string;
    checked: number;
}
const shells: { [url: string]: ShellCopy } = {};

export type Fetcher = (url: string, init: any) => Promise<{ status: number; headers: { get(name: string): string | null }; text(): Promise<string> }>;

async function fetchOnce(url: string, fetcher: Fetcher, copy: ShellCopy | undefined, now: number): Promise<ShellCopy> {
    const headers: { [k: string]: string } = { 'User-Agent': 'bullshit-join-preview' };
    if (copy && copy.etag) {
        headers['If-None-Match'] = copy.etag;
    }
    const res = await fetcher(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(SHELL_TIMEOUT_MS) });
    if (res.status === 304 && copy) {
        return { body: copy.body, etag: copy.etag, checked: now };
    }
    if (res.status !== 200) {
        throw new Error(`the site answered ${res.status} for its own page`);
    }
    const body = await res.text();
    if (!BLOCK.test(body) || !/<app-root/.test(body)) {
        throw new Error('the site\'s page has no BS:META block or no app-root');
    }
    return { body, etag: res.headers.get('etag') || '', checked: now };
}

/** The site's page at `url` (its address for / or /he), from memory when checked in the last SHELL_FRESH_MS. */
export async function shellAt(url: string, fetcher: Fetcher, now: number = Date.now()): Promise<string> {
    const copy = shells[url];
    if (copy && now - copy.checked < SHELL_FRESH_MS) {
        return copy.body;
    }
    let lastError: any;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            shells[url] = await fetchOnce(url, fetcher, copy, now);
            return shells[url].body;
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError;
}

/** Forget the pages in memory (tests). */
export function forgetShells() {
    Object.keys(shells).forEach(k => delete shells[k]);
}

// ---- the game ----

/** The parts of a game the preview reads: nothing of its questions, answers, picks or host key. */
export const PREVIEW_PARTS = ['locale', 'state', 'timestamp', 'hostSeen', 'pack', 'creator', 'players'];

/** The game's parts the preview needs, read one by one (a whole game holds its questions and answers), or null. */
export async function readPreviewGame(pin: string): Promise<PreviewGame | null> {
    const game = gamesRef.child(pin);
    const values = await Promise.all(PREVIEW_PARTS.map(part => get<any>(game.child(part))));
    if (values.every(v => v === null || v === undefined)) {
        return null;
    }
    const out: any = {};
    PREVIEW_PARTS.forEach((part, i) => {
        if (values[i] !== null && values[i] !== undefined) {
            out[part] = values[i];
        }
    });
    return out;
}

// ---- the request ----

export interface JoinPreviewDeps {
    /** The game's parts the preview needs, or null when there is no such game. */
    readGame: (pin: string) => Promise<PreviewGame | null>;
    fetcher: Fetcher;
    project: string;
    emulator: boolean;
    now?: () => number;
    /** An unexpected fault, for the log and Sentry. Never throws. */
    fault?: (e: any) => void;
}

export interface JoinPreviewAnswer {
    status: number;
    headers: { [name: string]: string };
    body: string;
    /** What was served, for the log line: named, nameless, generic or fallback. */
    kind: 'named' | 'nameless' | 'generic' | 'fallback';
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    let timer: any;
    return Promise.race([
        p,
        new Promise<T>((_, reject) => {
            timer = setTimeout(() => reject(Object.assign(new Error(`gave up after ${ms} ms`), { code: 'SLOW' })), ms);
        }),
    ]).finally(() => clearTimeout(timer));
}

/**
 * The last resort, when the site's page could not be fetched: the generic preview tags and a page that
 * tries the same address again in a moment (never cached), so a person still gets to the game.
 */
export function fallbackPage(path: string, shell: PreviewLocale): string {
    const he = shell === 'he';
    const title = he ? 'בולשיט - משחק השקרים למסיבות' : 'Bullshit - the party game of lies';
    const href = escapeHtml(path);
    return `<!doctype html>
<html lang="${he ? 'he' : 'en'}"${he ? ' dir="rtl"' : ''}>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <meta property="og:title" content="${title}">
  <meta property="og:image" content="${SITE}/assets/${he ? 'og-image-he.png' : 'og-image.png'}">
  <meta http-equiv="refresh" content="2">
</head>
<body style="font-family:sans-serif;text-align:center;padding-top:30vh">
  <a href="${href}">${he ? 'למשחק' : 'Go to the game'}</a>
</body>
</html>
`;
}

/** The answer to GET /join-game/<PIN> or /he/join-game/<PIN> (path and query as the visitor sent them). */
export async function joinPreviewPage(path: string, query: string, headers: any, deps: JoinPreviewDeps): Promise<JoinPreviewAnswer> {
    const now = deps.now ? deps.now() : Date.now();
    const fault = (e: any) => { try { if (deps.fault) { deps.fault(e); } } catch (x) { /* never */ } };
    const parsed = parseJoinPath(path);
    const shellKind: PreviewLocale = parsed ? parsed.shell : (/^\/he(\/|$)/.test(path || '') ? 'he' : 'en');
    const origin = originOf(headers, deps.project, deps.emulator);
    const html = { 'Content-Type': 'text/html; charset=utf-8' };

    let shell: string;
    try {
        shell = await shellAt(`${origin}${shellKind === 'he' ? '/he' : '/'}`, deps.fetcher, now);
    } catch (e) {
        fault(e);
        const safePath = /^\/[A-Za-z0-9\/_-]*$/.test(path || '') ? path : '/';
        return { status: 200, headers: Object.assign({ 'Cache-Control': cacheControl('fallback') }, html), body: fallbackPage(safePath + (query || ''), shellKind), kind: 'fallback' };
    }

    const generic = (): JoinPreviewAnswer =>
        ({ status: 200, headers: Object.assign({ 'Cache-Control': cacheControl('generic') }, html), body: shell, kind: 'generic' });
    if (!parsed) {
        return generic();
    }

    let game: PreviewGame | null;
    try {
        game = await withTimeout(deps.readGame(parsed.pin), READ_TIMEOUT_MS);
    } catch (e) {
        fault(e);
        // Not cached for long: the next tap may find the database quicker.
        const answer = generic();
        answer.headers['Cache-Control'] = cacheControl('nameless');
        return answer;
    }

    const preview = previewOf(game, parsed.pin, now, origin);
    if (!preview) {
        return generic();
    }
    const url = `${origin}${parsed.shell === 'he' ? '/he' : ''}/join-game/${parsed.pin}`;
    const page = personalize(shell, preview, url);
    if (!page) {
        fault(new Error('the site\'s page lacks a preview tag the join preview sets'));
        return generic();
    }
    const kind = preview.host ? 'named' : 'nameless';
    return { status: 200, headers: Object.assign({ 'Cache-Control': cacheControl(kind) }, html), body: page, kind };
}
