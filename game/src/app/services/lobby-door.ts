/**
 * A lobby's own address (/game-staging/<PIN>) opened by a browser that has no seat in it.
 *
 * Friends are meant to arrive by the invite link (/join-game/<PIN>), but twice in one week a whole
 * group arrived on the lobby's own address instead (a copied address bar, or the browser's own share
 * menu, is the guess: the game's own copy and share buttons always give the invite link). The page
 * then sent them to the home page, and they found the join form a minute later. Now such a browser
 * goes straight to that lobby's join form with the PIN filled in, tagged `via=lobby-address`, so it
 * only types a nickname. A PIN that is unknown, or a game that has started, keeps today's way; a
 * finished game's join form says "Game over" itself (or shows the night after).
 *
 * Players who have a seat, the host, Replay and the big screen are never sent anywhere: the host and
 * the big screen pass at once, and so does every move inside the app (after JOIN, Replay, a crew
 * rematch). Only the first page this tab opens, when it is a lobby, has its seat looked up, and only
 * a browser whose saved player is not in that lobby is sent to the join form.
 * Kept free of Angular and Firebase so it can be tested in Node (lobby-door.guard.ts does the reads).
 */

import { joinPageFor } from '../pages/score-board-final/game-gone';

/** The join source of a join that came through a lobby's own address (functions analytics JOIN_SOURCES). */
export const LOBBY_ADDRESS_VIA = 'lobby-address';

/** How long the reads may take before the lobby's address is handled as before. */
export const LOBBY_DOOR_WAIT_MS = 2500;

/** The lobby step's state id (GameState.GameStaging in game-model). */
const LOBBY_STATE = 0;

/** What the address's browser is, for the lobby's address. */
export interface LobbyVisitor {
    /** The PIN on the address. */
    pin: string;
    /** This browser has a saved player (from this game or an earlier one). */
    hasPlayer: boolean;
    /** This tab is a big screen. */
    presenter: boolean;
    /** This browser created this game (its host key). */
    host: boolean;
    /** The lobby is the first page this tab opened (not a move inside the app). */
    firstPage: boolean;
}

/**
 * What to look up before the lobby opens:
 * - 'pass': nothing, the lobby opens as before (the big screen, the host, a move inside the app with a player);
 * - 'seat': the game, and whether this browser's saved player has a seat in it (a reload, or an old player
 *   opening a lobby's address);
 * - 'door': the game only (a browser with no player, which today goes to the home page).
 * A PIN that is not 4 letters is never looked up: the lobby's own guards turn it away as before.
 */
export function lobbyCheck(v: LobbyVisitor): 'pass' | 'seat' | 'door' {
    if (!/^[A-Za-z]{4}$/.test(String(v.pin || ''))) {
        return 'pass';
    }
    if (v.presenter || v.host) {
        return 'pass';
    }
    if (v.hasPlayer) {
        return v.firstPage ? 'seat' : 'pass';
    }
    return 'door';
}

/** A player id that can be looked up in the game's players (a database key, no path in it). */
export function seatKey(pid: any): string | null {
    return typeof pid === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(pid) ? pid : null;
}

/** What was read of the game. A read that failed or took too long is passed as undefined. */
export interface LobbyRead {
    /** The game's state (games/<PIN>/state): null for a PIN with no game. */
    state: any;
    /** The game's language. */
    locale?: string;
    /** This browser's saved player is in the game's players (asked only for a browser with a saved player). */
    seated?: boolean;
}

/** Where the lobby's address sends this browser: the join form's route, or null to go on as before. */
export interface LobbyDoorRoute {
    commands: string[];
    queryParams: { via: string };
}

/**
 * The join form of this lobby for a browser with no seat in it, or null to go on as before:
 * a seated browser, a read that failed, a PIN with no game, and a game past its lobby all go on as before.
 * (A seat that could not be read is the guard's to handle: it goes on as before without asking here.)
 */
export function lobbyDoorRoute(pin: string, read: LobbyRead | undefined): LobbyDoorRoute | null {
    if (!read || read.seated === true) {
        return null;
    }
    const state = read.state;
    if (!state || typeof state !== 'object' || state.id !== LOBBY_STATE) {
        return null;
    }
    return { commands: joinPageFor(pin, read.locale), queryParams: { via: LOBBY_ADDRESS_VIA } };
}
