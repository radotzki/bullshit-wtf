import { GamePlayer } from '../../game-model';

/**
 * Who may press START in the lobby, and what everyone else is told.
 *
 * Only one browser should start the game, so friends who are still joining
 * are not locked out by one impatient tap:
 * - With a big screen (presenter), only the big screen starts the game.
 * - Otherwise the browser that created (or replayed) the game starts it. The
 *   server stores that browser's anonymous uid as `creator`; each player row
 *   carries its uid, so everyone can see who the host is.
 * - If the host is unknown (an old game, sign-in failed, or the database rules
 *   that make `creator` readable are not deployed yet), everyone may start, as before.
 * - If the host has not joined the lobby after HOST_GRACE_MS, everyone may start,
 *   so a host who closed the tab cannot leave the group stuck.
 */
export const HOST_GRACE_MS = 90 * 1000;

export interface LobbyHostInput {
    hasPresenter: boolean;
    isPresenter: boolean;
    creator: string | null;
    myUid: string | null;
    players: GamePlayer[];
    waitedMs: number;
}

export type LobbyWait = 'none' | 'host' | 'host-to-join' | 'big-screen';

export interface LobbyHostView {
    canStart: boolean;
    wait: LobbyWait;
    hostName: string | null;
    /**
     * This phone is the known host, with no big screen, and is the only player in the lobby.
     * The lobby then puts the invite first and holds START back behind "Start alone anyway":
     * a solo game has nobody to fool, and lone hosts who start alone rarely come back.
     */
    alone: boolean;
}

export function lobbyHost(input: LobbyHostInput): LobbyHostView {
    if (input.hasPresenter) {
        return input.isPresenter
            ? { canStart: true, wait: 'none', hostName: null, alone: false }
            : { canStart: false, wait: 'big-screen', hostName: null, alone: false };
    }

    if (!input.creator) {
        return { canStart: true, wait: 'none', hostName: null, alone: false };
    }

    if (input.myUid && input.myUid === input.creator) {
        const players = (input.players || []).filter(p => !!p);
        return { canStart: true, wait: 'none', hostName: null, alone: players.length === 1 };
    }

    const host = (input.players || []).filter(p => p && p.uid === input.creator)[0];
    if (host) {
        return { canStart: false, wait: 'host', hostName: host.nickname, alone: false };
    }

    if (input.waitedMs >= HOST_GRACE_MS) {
        return { canStart: true, wait: 'none', hostName: null, alone: false };
    }

    return { canStart: false, wait: 'host-to-join', hostName: null, alone: false };
}

/**
 * The friend to greet by name in the host's lobby line ("Ben is in!"), or null.
 * Only for a host who was alone in the lobby, and only while that first friend is the only other
 * player: once a third player joins, the lobby goes back to the usual line.
 */
export function firstFriend(view: LobbyHostView, players: GamePlayer[], myUid: string | null, wasAlone: boolean): string | null {
    const list = (players || []).filter(p => !!p);
    if (!wasAlone || view.alone || !view.canStart || list.length !== 2) {
        return null;
    }
    const friend = list.filter(p => p.uid !== myUid)[0];
    return friend && friend.nickname ? friend.nickname : null;
}

const strings = {
    en: {
        host: (name: string) => `Waiting for ${name} to start the game`,
        hostToJoin: () => 'Waiting for the host to join',
        bigScreen: () => 'The game starts from the big screen',
        startHint: () => 'Press START when everyone is in',
        friendIn: (name: string) => `${name} is in! Press START when everyone is in`,
        alone: () => 'Bullshit needs friends: you score by fooling them',
        aloneSub: () => 'Send them the link. It takes them 10 seconds to join.',
        startAlone: () => 'Start alone anyway',
        count: (n: number) => n === 1 ? '1 player in' : `${n} players in`,
    },
    he: {
        host: (name: string) => `מחכים ל־${name} להתחיל את המשחק`,
        hostToJoin: () => 'מחכים שמי שפתח את המשחק יצטרף',
        bigScreen: () => 'המשחק מתחיל מהמסך הגדול',
        startHint: () => 'לחצו START כשכולם בפנים',
        friendIn: (name: string) => `${name} בפנים! לחצו START כשכולם בפנים`,
        alone: () => 'בולשיט צריך חברים: מקבלים נקודות על כל מי שעובדים עליו',
        aloneSub: () => 'שלחו להם את הקישור. לוקח להם 10 שניות להצטרף.',
        startAlone: () => 'להתחיל לבד בכל זאת',
        count: (n: number) => n === 1 ? 'שחקן אחד במשחק' : `${n} שחקנים במשחק`,
    },
};

export interface LobbyText {
    message: string;
    /** A second line under the message, or null. */
    sub: string | null;
    count: string;
    rtl: boolean;
    /** Invite-first lobby: the invite is inline, START waits behind the "start alone" link. */
    alone: boolean;
    /** The small "start alone anyway" link's words. */
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
