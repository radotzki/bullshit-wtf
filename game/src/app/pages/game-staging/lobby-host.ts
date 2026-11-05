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
}

export function lobbyHost(input: LobbyHostInput): LobbyHostView {
    if (input.hasPresenter) {
        return input.isPresenter
            ? { canStart: true, wait: 'none', hostName: null }
            : { canStart: false, wait: 'big-screen', hostName: null };
    }

    if (!input.creator) {
        return { canStart: true, wait: 'none', hostName: null };
    }

    if (input.myUid && input.myUid === input.creator) {
        return { canStart: true, wait: 'none', hostName: null };
    }

    const host = (input.players || []).filter(p => p && p.uid === input.creator)[0];
    if (host) {
        return { canStart: false, wait: 'host', hostName: host.nickname };
    }

    if (input.waitedMs >= HOST_GRACE_MS) {
        return { canStart: true, wait: 'none', hostName: null };
    }

    return { canStart: false, wait: 'host-to-join', hostName: null };
}

const strings = {
    en: {
        host: (name: string) => `Waiting for ${name} to start the game`,
        hostToJoin: () => 'Waiting for the host to join',
        bigScreen: () => 'The game starts from the big screen',
        startHint: () => 'Press START when everyone is in',
        count: (n: number) => n === 1 ? '1 player in' : `${n} players in`,
    },
    he: {
        host: (name: string) => `מחכים ל־${name} להתחיל את המשחק`,
        hostToJoin: () => 'מחכים שמי שפתח את המשחק יצטרף',
        bigScreen: () => 'המשחק מתחיל מהמסך הגדול',
        startHint: () => 'לחצו START כשכולם בפנים',
        count: (n: number) => n === 1 ? 'שחקן אחד במשחק' : `${n} שחקנים במשחק`,
    },
};

export interface LobbyText {
    message: string;
    count: string;
    rtl: boolean;
}

export function lobbyText(view: LobbyHostView, playerCount: number, locale: string): LobbyText {
    const he = locale === 'he';
    const t = he ? strings.he : strings.en;
    let message: string;

    if (view.canStart) {
        message = t.startHint();
    } else if (view.wait === 'host') {
        message = t.host(view.hostName);
    } else if (view.wait === 'big-screen') {
        message = t.bigScreen();
    } else {
        message = t.hostToJoin();
    }

    return { message, count: t.count(playerCount), rtl: he };
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
