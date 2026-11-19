/**
 * The CrazyGames version of the game: the same app, opened at /portal/crazygames (or
 * /he/portal/crazygames) inside CrazyGames' frame. Everything that differs from the playable site is
 * decided here, kept free of Angular so it can be tested in Node (test/portal.test.js):
 * - the app routes by the address's hash (#/game-staging/ABCD), so the address the frame loads stays
 *   /portal/crazygames, the one path firebase.json lets CrazyGames frame;
 * - every game it creates carries the campaign tag `portal-crazygames` (a play-test tag wins);
 * - invites use CrazyGames' invite links, never a bullshit.wtf address;
 * - no link leaves for the playable site (CrazyGames' rules: no links to a playable web version).
 * Off the portal path nothing here changes anything.
 */

export const PORTAL_TAG = 'portal-crazygames';

/** The portal's addresses. The app is served there by firebase.json (index.html, he.html). */
const PORTAL_PATH = /^\/(he\/)?portal\/crazygames\/?$/;

export function isPortalPath(pathname: string | null | undefined): boolean {
    return PORTAL_PATH.test(String(pathname || ''));
}

let active: boolean | null = null;

/** Whether this page is the CrazyGames version. Decided once, from the address the page loaded at. */
export function inPortal(): boolean {
    if (active === null) {
        try {
            active = typeof window !== 'undefined' && isPortalPath(window.location.pathname);
        } catch (e) {
            active = false;
        }
    }
    return active;
}

/** For tests only. */
export function setPortalForTest(on: boolean | null) {
    active = on;
}

/** A play-test tag (`test`, `test-<name>`): the same rule as isTestTag in join-source.ts. */
function isTestTag(tag: string | null | undefined): boolean {
    return /^test(-|$)/.test(tag || '');
}

/**
 * The campaign tag the portal keeps for this tab: the portal's own, unless the tab is a play-test
 * (?via=test on the frame's address, or kept from earlier in the tab), which stays a test.
 */
export function portalCampaign(kept: string | null | undefined, search: string | null | undefined): string {
    const m = /[?&]via=([^&#]*)/.exec(search || '');
    let fromAddress = '';
    try {
        fromAddress = m ? decodeURIComponent(m[1]).toLowerCase().trim() : '';
    } catch (e) { }
    if (isTestTag(fromAddress)) {
        return fromAddress;
    }
    if (isTestTag(kept)) {
        return String(kept);
    }
    return PORTAL_TAG;
}

/** The game's language from CrazyGames' locale ('he-IL', 'iw'), or from a Hebrew portal address. */
export function portalLocale(sdkLocale: string | null | undefined, pathname: string | null | undefined): 'he' | 'en' {
    if (/^\/he\//.test(String(pathname || ''))) {
        return 'he';
    }
    const l = String(sdkLocale || '').toLowerCase();
    return l.indexOf('he') === 0 || l.indexOf('iw') === 0 ? 'he' : 'en';
}

/** The CrazyGames username as a nickname: as the join page takes it (9 characters at most). */
export function portalNickname(username: string | null | undefined, max = 9): string {
    const name = String(username || '').replace(/\s+/g, ' ').trim();
    return Array.from(name).slice(0, max).join('').trim();
}

/** A game PIN from an invite's parameters: capital letters A to Z, as the server makes them. */
export function invitePin(roomId: string | null | undefined): string | null {
    const pin = String(roomId || '').trim().toUpperCase();
    return /^[A-Z]{1,12}$/.test(pin) ? pin : null;
}

/** Hosts a portal link may open: CrazyGames itself, and WhatsApp for sending its invite link. */
const ALLOWED_HOSTS = /(^|\.)crazygames\.com$|^wa\.me$|^api\.whatsapp\.com$/;

/**
 * Whether a link must not open in the portal: any web address but CrazyGames' (and WhatsApp's, for
 * an invite), this site's own pages included (the search pages, the daily puzzle, a crew page:
 * all playable). In-app routes (#/...), blob: downloads and the like stay.
 */
export function blockedLink(href: string | null | undefined, base: string): boolean {
    const raw = String(href || '').trim();
    if (!raw || raw.charAt(0) === '#') {
        return false;
    }
    let url: URL;
    try {
        url = new URL(raw, base);
    } catch (e) {
        return false;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return false;
    }
    let here: URL = null;
    try {
        here = new URL(base);
    } catch (e) { }
    // The same page with another hash: an in-app route.
    if (here && url.origin === here.origin && url.pathname === here.pathname && url.search === here.search && url.hash) {
        return false;
    }
    return !ALLOWED_HOSTS.test(url.hostname);
}

/**
 * What CrazyGames is told for each screen: `play` while a question is on (gameplayStart), `stop`
 * everywhere else (gameplayStop: menus, the lobby, the final scoreboard).
 */
export function gameplayFor(route: string): 'play' | 'stop' {
    return /^\/(round-intro|show-question|show-answers|reveal-the-truth|score-board|step)\//.test(routePath(route)) ? 'play' : 'stop';
}

const ROOM_ROUTE = new RegExp('^/(join-game|game-staging|round-intro|show-question|show-answers|reveal-the-truth|score-board'
    + '|score-board-final|step)/([A-Za-z]+)$');

/**
 * The room CrazyGames is told about for each screen (updateRoom): the game's PIN, and whether a friend
 * can still join. Latecomers join a game under way at 0 points, so a game is joinable until its final
 * scoreboard. null: the player is in no game (leftRoom).
 */
export function roomFor(route: string): { pin: string; joinable: boolean } | null {
    const m = ROOM_ROUTE.exec(routePath(route));
    if (!m) {
        return null;
    }
    // A join page before the player is in: the room is the one they are joining.
    return { pin: m[2].toUpperCase(), joinable: m[1] !== 'score-board-final' };
}

function routePath(route: string): string {
    return String(route || '').split(/[?#]/)[0].replace(/\/+$/, '');
}

/** The invite texts in the portal: the link is CrazyGames', so no "at bullshit.wtf". */
export const PORTAL_SHARE_STRINGS = {
    en: {
        inviteText: (pin: string) => `Come play Bullshit with me! Tap the link to join (game ${pin}).`,
        resultsText: (place: number, total: number, score: number) =>
            place === 1
                ? `I won at Bullshit with ${score} points! Think you can fool me?`
                : `I came ${place} of ${total} at Bullshit with ${score} points. Can you beat that?`,
        groupResultsText: (winner: string, score: number) =>
            `${winner} won our game of Bullshit with ${score} points. Can you fool your friends?`,
    },
    he: {
        inviteText: (pin: string) => `בואו לשחק איתי בולשיט! לחצו על הקישור כדי להצטרף (משחק ${pin}).`,
        resultsText: (place: number, total: number, score: number) =>
            place === 1
                ? `ניצחתי בבולשיט עם ${score} נקודות! חושבים שתצליחו לעבוד עליי?`
                : `הגעתי למקום ${place} מתוך ${total} בבולשיט עם ${score} נקודות. תצליחו יותר?`,
        groupResultsText: (winner: string, score: number) =>
            `הניצחון במשחק הבולשיט שלנו הלך ל-${winner} עם ${score} נקודות. תצליחו לעבוד על החברים?`,
    },
};

/** The results picture's last line in the portal: no "bullshit.wtf". */
export const PORTAL_CARD_FOOTER = {
    en: 'PLAY BULLSHIT ON CRAZYGAMES',
    he: 'שחקו בולשיט ב-CRAZYGAMES',
};

/** A refused lie (the server's FLAGGED_LIE): the player writes another. */
export const FLAGGED_LIE_TEXT = {
    en: 'Keep it clean: that lie can\'t be used. Try another one!',
    he: 'בלי מילים גסות: אי אפשר להשתמש בשקר הזה. נסו שקר אחר!',
};

// ---------- invite links ----------
// CrazyGames makes the invite link (SDK game.inviteLink). It is asked for as soon as a PIN is known
// (the join page) and kept here, so the lobby's QR, WhatsApp, share and copy all read it at once.

type LinkMaker = (pin: string) => string | Promise<string> | null;

const links: { [pin: string]: string } = {};
const asked: { [pin: string]: boolean } = {};
let maker: LinkMaker | null = null;
let gameLink = '';
let onChange: () => void = () => { };

/** Set by the portal service once the SDK is ready. */
export function setInviteMaker(make: LinkMaker | null, changed?: () => void) {
    maker = make;
    if (changed) {
        onChange = changed;
    }
}

/** The CrazyGames invite link of a game, or '' while it is not known (asked for in the background). */
export function portalInviteUrl(pin: string): string {
    const key = String(pin || '').toUpperCase();
    if (!key) {
        return '';
    }
    if (links[key]) {
        return links[key];
    }
    if (maker && !asked[key]) {
        asked[key] = true;
        let made: any = null;
        try {
            made = maker(key);
        } catch (e) {
            asked[key] = false;
        }
        if (typeof made === 'string' && made) {
            links[key] = made;
        } else if (made && typeof made.then === 'function') {
            made.then((url: any) => {
                if (typeof url === 'string' && url) {
                    links[key] = url;
                    onChange();
                }
            }, () => { asked[key] = false; });
        }
    }
    return links[key] || '';
}

/** The game's own CrazyGames page (an invite link with no room), for the results card. */
export function setPortalGameLink(url: string) {
    gameLink = typeof url === 'string' ? url : '';
}

export function portalGameLink(): string {
    return gameLink;
}

/** For tests only. */
export function forgetInvites() {
    Object.keys(links).forEach(k => delete links[k]);
    Object.keys(asked).forEach(k => delete asked[k]);
    maker = null;
    gameLink = '';
    onChange = () => { };
}

// ---------- the CrazyGames username ----------
let username = '';

export function setPortalUsername(name: string | null | undefined) {
    username = portalNickname(name);
}

/** The nickname to prefill on the join page: the CrazyGames username, or ''. */
export function portalUsername(): string {
    return username;
}

// ---------- the game's language from CrazyGames ----------
// The SDK says the player's language a moment after the portal's home has drawn: the home follows it.
const localeListeners: Array<(locale: 'he' | 'en') => void> = [];

export function onPortalLocale(listener: (locale: 'he' | 'en') => void): () => void {
    localeListeners.push(listener);
    return () => {
        const i = localeListeners.indexOf(listener);
        if (i >= 0) {
            localeListeners.splice(i, 1);
        }
    };
}

export function announcePortalLocale(locale: 'he' | 'en') {
    localeListeners.slice().forEach(l => l(locale));
}
