import { GamePlayer } from '../../game-model';

/**
 * Who may press START in the lobby, and what everyone else is told.
 *
 * Only one browser should start the game, so friends who are still joining
 * are not locked out by one impatient tap:
 * - The browser that created (or replayed) the game starts it, big screen or not:
 *   the big screen only shows the lobby (the server refuses it too, see startVerdict
 *   in functions/src/controllers/start.ts). The
 *   server stores that browser's anonymous uid as `creator`; each player row
 *   carries its uid, so everyone can see who the host is.
 * - The phone that created the game also sends a one-game host key, and the server
 *   marks the join with that key `host: true` (and the game `hasHost`). Replay marks
 *   the player who pressed it. That row wins over `creator`, so a host whose sign-in
 *   failed (no uid) is still the host. The host knows itself by its player id.
 * - If the host is unknown (an old game, or the database rules that make `creator`
 *   and `hasHost` readable are not deployed yet), everyone may start, as before;
 *   with a big screen, the big screen starts such a game.
 * - A big screen opened in the browser that created the game holds its host key,
 *   so it starts the game like the host's phone would.
 * - A phone that holds the host key starts it too: when two phones press Replay at once, both get the
 *   new game's key, so the one that pressed second is not left without START.
 * - If the host has not joined the lobby after HOST_GRACE_MS, everyone may start,
 *   so a host who closed the tab cannot leave the group stuck.
 * - The host's lobby page reports in every HOST_PING_MS; the server keeps the time (`hostSeen`).
 *   If a joined host has not reported in for HOST_GONE_MS (a dead phone, a closed browser), everyone
 *   may start, and the lobby says the host seems to be gone. The server checks the same.
 */
export const HOST_GRACE_MS = 90 * 1000;
/** Must match HOST_GONE_MS in functions/src/controllers/start.ts. */
export const HOST_GONE_MS = 5 * 60 * 1000;
/** How often the host's lobby page reports in. */
export const HOST_PING_MS = 20 * 1000;
/** While this phone's clock offset is unknown (the server could not be asked), how often the lobby asks again. */
export const CLOCK_RETRY_MS = 60 * 1000;

/**
 * How long ago, in server time, the host last reported in, or null when that can't be told.
 * `clockAhead` is how far this phone's clock is ahead of the server's; null means it is unknown
 * (the clock sync failed), and then the host is never judged gone: a phone whose clock runs
 * minutes fast would otherwise see a host who is still there as gone.
 */
export function hostAwayMs(now: number, clockAhead: number | null, hostSeen: number | null): number | null {
    if (typeof clockAhead !== 'number' || typeof hostSeen !== 'number') {
        return null;
    }
    return now - clockAhead - hostSeen;
}

/** Ask the server for the clock offset now: it is unknown, no ask is in flight, and the last ask is CLOCK_RETRY_MS old. */
export function shouldAskClock(clockAhead: number | null, asking: boolean, lastAskedAt: number | null, now: number): boolean {
    if (clockAhead !== null || asking) {
        return false;
    }
    return lastAskedAt === null || now - lastAskedAt >= CLOCK_RETRY_MS;
}

/** A lobby player, with its player id when known. */
export interface LobbyPlayer extends GamePlayer {
    pid?: string;
}

export interface LobbyHostInput {
    hasPresenter: boolean;
    isPresenter: boolean;
    /** This browser holds the game's host key (it created or replayed the game). */
    holdsHostKey?: boolean;
    creator: string | null;
    /** The server marks this game's host by host key (a player row with `host: true`, once it joins). */
    hasHost?: boolean;
    myUid: string | null;
    /** This phone's player id in this game. */
    myPid?: string | null;
    players: LobbyPlayer[];
    waitedMs: number;
    /** How long ago (server time) the host's lobby page last reported in, or null if unknown. */
    hostAwayMs?: number | null;
}

export type LobbyWait = 'none' | 'host' | 'host-to-join' | 'big-screen';

export interface LobbyHostView {
    canStart: boolean;
    wait: LobbyWait;
    hostName: string | null;
    /**
     * This phone is the known host, with no big screen, and is the only player in the lobby.
     * The lobby then puts the invite first and holds START back behind a small link: a game alone
     * has nobody to fool. The link starts the taste, five pick-only questions (see TASTE_QUESTIONS).
     */
    alone: boolean;
    /** The host joined but has not been seen for HOST_GONE_MS, so anyone may start: their name. */
    hostGone?: string | null;
    /** This page is the known host's own phone or computer (never the big screen): see lone-host.ts. */
    isHost?: boolean;
}

export function lobbyHost(input: LobbyHostInput): LobbyHostView {
    const players = (input.players || []).filter(p => !!p);
    const marked = players.filter(p => p.host)[0];
    const none: LobbyHostView = { canStart: true, wait: 'none', hostName: null, alone: false };

    if (!input.creator && !input.hasHost && !marked) {
        // No known host: the big screen starts, or anyone without one.
        if (input.hasPresenter && !input.isPresenter) {
            return { canStart: false, wait: 'big-screen', hostName: null, alone: false };
        }
        return none;
    }

    // A game with a host: only the host starts it, big screen or not.
    if (input.isPresenter && input.holdsHostKey) {
        return none;
    }
    // A phone with the host key may start: it created the game, or pressed Replay (when two phones press
    // Replay at once, both get the key, and the lobby names the first as the host).
    if (!input.isPresenter && input.holdsHostKey) {
        return { canStart: true, wait: 'none', hostName: null, alone: !input.hasPresenter && players.length === 1, isHost: true };
    }

    // A marked host row wins; the creator's uid is for games made before host keys.
    const isMe = !input.isPresenter && (marked
        ? !!input.myPid && marked.pid === input.myPid
        : !!input.creator && !!input.myUid && input.myUid === input.creator);
    if (isMe) {
        return { canStart: true, wait: 'none', hostName: null, alone: !input.hasPresenter && players.length === 1, isHost: true };
    }

    const host = marked || (input.creator ? players.filter(p => p.uid === input.creator)[0] : null);
    // Only a marked host reports in, so only a marked host can be gone.
    if (marked && typeof input.hostAwayMs === 'number' && input.hostAwayMs >= HOST_GONE_MS) {
        return { canStart: true, wait: 'none', hostName: null, alone: false, hostGone: marked.nickname };
    }
    if (host) {
        return { canStart: false, wait: 'host', hostName: host.nickname, alone: false };
    }

    if (input.waitedMs >= HOST_GRACE_MS) {
        return none;
    }

    return { canStart: false, wait: 'host-to-join', hostName: null, alone: false };
}

/**
 * The friend to greet by name in the host's lobby line ("Ben is in!"), or null.
 * Only for a host who was alone in the lobby, and only while that first friend is the only other
 * player: once a third player joins, the lobby goes back to the usual line.
 */
export function firstFriend(view: LobbyHostView, players: LobbyPlayer[], myUid: string | null, wasAlone: boolean,
    myPid: string | null = null): string | null {
    const list = (players || []).filter(p => !!p);
    if (!wasAlone || view.alone || !view.canStart || list.length !== 2) {
        return null;
    }
    // Without a uid (sign-in failed), this phone knows its own row by player id.
    const mine = (p: LobbyPlayer) => (!!myPid && p.pid === myPid) || (!!myUid && p.uid === myUid);
    const friend = list.filter(p => !mine(p))[0];
    return friend && friend.nickname ? friend.nickname : null;
}

const strings = {
    en: {
        host: (name: string) => `Waiting for ${name} to start the game`,
        hostToJoin: () => 'Waiting for the host to join',
        bigScreen: () => 'The game starts from the big screen',
        startHint: () => 'Press START when everyone is in',
        hostGone: (name: string) => `${name} seems to be gone. Anyone can press START`,
        friendIn: (name: string) => `${name} is in! Press START when everyone is in`,
        alone: () => 'Bullshit needs friends: you score by fooling them',
        aloneSub: () => 'Send them the link. It takes them 10 seconds to join.',
        // Starts the taste: the number is TASTE_QUESTIONS in game-model.
        startAlone: () => 'Try 5 quick questions alone',
        count: (n: number) => n === 1 ? '1 player in' : `${n} players in`,
    },
    he: {
        host: (name: string) => `מחכים ל־${name} להתחיל את המשחק`,
        hostToJoin: () => 'מחכים שמי שפתח את המשחק יצטרף',
        bigScreen: () => 'המשחק מתחיל מהמסך הגדול',
        // "מתחילים" is the START button's word in a Hebrew game: gameStrings('he').start.
        startHint: () => 'לחצו על "מתחילים" כשכולם בפנים',
        hostGone: (name: string) => `נראה ש־${name} יצא. כל אחד יכול ללחוץ על "מתחילים"`,
        friendIn: (name: string) => `${name} בפנים! לחצו על "מתחילים" כשכולם בפנים`,
        alone: () => 'בולשיט צריך חברים: מקבלים נקודות על כל מי שעובדים עליו',
        aloneSub: () => 'שלחו להם את הקישור. לוקח להם 10 שניות להצטרף.',
        startAlone: () => 'לנסות לבד 5 שאלות מהירות',
        count: (n: number) => n === 1 ? 'שחקן אחד במשחק' : `${n} שחקנים במשחק`,
    },
};

export interface LobbyText {
    message: string;
    /** A second line under the message, or null. */
    sub: string | null;
    count: string;
    rtl: boolean;
    /** Invite-first lobby: the invite is inline, START waits behind the link that starts the taste. */
    alone: boolean;
    /** The words of the small link that starts the taste ("Try 5 quick questions alone"). */
    startAlone: string;
}

export function lobbyText(view: LobbyHostView, playerCount: number, locale: string, friendName: string = null): LobbyText {
    const he = locale === 'he';
    const t = he ? strings.he : strings.en;
    let message: string;
    let sub: string = null;

    if (view.alone) {
        message = t.alone();
        sub = t.aloneSub();
    } else if (view.canStart && view.hostGone) {
        message = t.hostGone(view.hostGone);
    } else if (view.canStart && friendName) {
        message = t.friendIn(friendName);
    } else if (view.canStart) {
        message = t.startHint();
    } else if (view.wait === 'host') {
        message = t.host(view.hostName);
    } else if (view.wait === 'big-screen') {
        message = t.bigScreen();
    } else {
        message = t.hostToJoin();
    }

    return { message, sub, count: t.count(playerCount), rtl: he, alone: !!view.alone, startAlone: t.startAlone() };
}

/** The lobby line for a seasonal pack game, or null. */
export function packBanner(pack: string, locale: string): string {
    if (pack !== 'hanukkah') {
        return null;
    }
    return locale === 'he'
        ? 'מהדורת חנוכה: יש במשחק הזה שאלות חנוכה חדשות'
        : 'Hanukkah edition: new Hanukkah questions in this game';
}
