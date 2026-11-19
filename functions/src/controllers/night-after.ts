// "The night after": the recap a finished game's own link shows for NIGHT_AFTER_MS after the game.
// The link of every link-invited table sits in its group chat, and people scroll back to it; it used to
// answer only "Game over". Now the join page shows the night instead: the winner, the biggest bullshitter,
// the lie of the night and the final scores, and, to someone who didn't play, "You missed it: start your
// own game" (Product's spreading-loop spec, change 2).
//
// It began as a 50/50 test by the game's PIN (the lowest bit of the first byte of
// SHA-256('night-after:' + PIN)); the other half kept "Game over" and sent seen-control-* rows. Since
// that test was retired (the release of the "recap for every game" pull request), every finished game
// shows it: in BigQuery, seen-control-* rows stop and seen-player / seen-other rows come for every game.
// Before the release, a game's half is
//   MOD(TO_CODE_POINTS(SHA256(CONCAT('night-after:', UPPER(id))))[OFFSET(0)], 2) = 1  (new half)
//
// What it promises:
// - It is built on each read from the game's own record (the one the final screen read). Nothing new
//   is stored, so there is nothing to erase: after NIGHT_AFTER_MS the link shows "Game over" again.
// - It shows only what the final screen showed the table: nicknames, scores, places, how many each
//   player's lies fooled, the biggest bullshitter, and one lie (the one that fooled the most). Never a
//   question, never a true answer, so nothing spoils those questions for someone who plays them later.
// - The lie of the night is passed through the nickname filter (name-flag.ts): a flagged lie is skipped
//   for the next one; with none left, no lie is shown. The host's name follows the link preview's rules.
// - Only a game that reached its final scoreboard with 2 or more players gets a recap; a taste, a game
//   that died in the lobby or mid-game, a stale one and a game in its first minutes after the end with an
//   open rematch lobby keep today's page (the rematch comes first, as before).
import { GameScheme, GameState, Highlights, finalPlaces, isTestCampaign } from '../game-model';
import { nameFlag } from '../name-flag';
import { hostOf, shownName } from './join-preview';

/** How long after the game its link shows the recap. */
export const NIGHT_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
/** At most this many rows of the final scores travel to the page (the game seats 12). */
export const RECAP_ROWS = 12;

/**
 * The recap's half, from the retired 50/50 test: always 'new' now, so every finished game shows it. It
 * stays in the answer so that a page loaded before the release (which still reads it) shows the recap too.
 */
export type NightAfterHalf = 'new';

export interface RecapRow {
    name: string;
    score: number;
    place: number;
    /** Players fooled by this player's lies over the whole game (the final screen's count). */
    fooled: number;
    biggest?: boolean;
}

export interface NightAfter {
    /** Always 'new' (the retired test's half), for pages loaded before the release. */
    half: NightAfterHalf;
    /** The browser asking sat in this game (its sign-in uid or its last seat is one of the game's). */
    player: boolean;
    /** Server time the game reached its final scoreboard. */
    endedAt: number;
    /** The game's language, for the words of a game started from the page. */
    locale: 'en' | 'he';
    /** The host's nickname, when a preview may show it; '' otherwise. */
    host: string;
    rows: RecapRow[];
    /** Players at the table (rows may be cut at RECAP_ROWS). */
    played: number;
    questions: number;
    /** Every time anyone fell for a player's lie, summed over the game. */
    fooledTotal: number;
    /** The lie that fooled the most players, its count and its writer's nickname; null when none may be shown. */
    lie: { text: string; fooled: number; by: string } | null;
    /** The table's saved crew, for "See who's in next time" (crew page), when it has one. */
    crew?: string;
    /** Same table: this browser played, and the table's lobby is mid-game without it (validateGameName). */
    tablePlaying?: boolean;
    /** A test game: the page shows the recap as usual but sends no rows (test games stay out of every count). */
    test?: boolean;
}

/** The server time the game reached its final scoreboard, or 0 when it never did. */
function endedAt(game: GameScheme): number {
    if (!game || !game.state || game.state.id !== GameState.ScoreBoardFinal) {
        return 0;
    }
    return Number(game.state.timestamp) || Number(game.timestamp) || 0;
}

/** Seats of the game that are players (not the big screen): an object each, with a nickname. */
function seats(game: GameScheme): string[] {
    const players = game && game.players && typeof game.players === 'object' ? game.players : {};
    return Object.keys(players).filter(k => players[k] && typeof players[k] === 'object'
        && typeof players[k].nickname === 'string' && players[k].nickname.trim() !== '');
}

/** The lie of the night: the players' best lies, most fooled first; the first one the filter passes. */
function lieOfTheNight(game: GameScheme, highlights: Highlights): NightAfter['lie'] {
    const players = game.players || {};
    const best = Object.keys(highlights || {})
        .filter(pid => players[pid] && highlights[pid] && typeof highlights[pid].text === 'string'
            && highlights[pid].text.trim() !== '' && (highlights[pid].fooled || 0) > 0)
        .sort((a, b) => (highlights[b].fooled || 0) - (highlights[a].fooled || 0)
            || (highlights[b].points || 0) - (highlights[a].points || 0) || (a < b ? -1 : 1));
    const pid = best.find(p => !nameFlag(highlights[p].text) && !nameFlag(highlights[p].text.replace(/\s+/g, '')));
    if (!pid) {
        return null;
    }
    return { text: highlights[pid].text.trim().slice(0, 80), fooled: highlights[pid].fooled, by: players[pid].nickname };
}

/**
 * The browser that asks sat in this game: its sign-in uid is a seat's, or its last seat (the player id
 * it keeps from its last join) is one of this game's. It only picks the page's button, so a lost
 * sign-in with the seat kept still counts as a player.
 */
function playedHere(game: GameScheme, uid: any, pid: any): boolean {
    const players = game.players || {};
    if (typeof uid === 'string' && uid && Object.keys(players).some(k => players[k] && players[k].uid === uid)) {
        return true;
    }
    return typeof pid === 'string' && !!pid && !!players[pid];
}

/**
 * The recap of a finished game for the browser that asks (uid and pid as the join page sends them),
 * or null when this game's link keeps today's page.
 */
export function nightAfter(pin: string, game: GameScheme, now: number, uid?: any, pid?: any): NightAfter | null {
    const ended = endedAt(game);
    if (!ended || now - ended > NIGHT_AFTER_MS || now < ended - 60 * 1000) {
        return null;
    }
    if (game.state && (game.state as any).taste) {
        return null;
    }
    const pids = seats(game);
    if (pids.length < 2) {
        return null;
    }
    const highlights: Highlights = game.highlights || {};
    const fooledBy = (p: string) => highlights[p] ? Number(highlights[p].total) || 0 : 0;
    const order = pids.slice().sort((a, b) => (Number(game.players[b].score) || 0) - (Number(game.players[a].score) || 0)
        || (a < b ? -1 : 1));
    const places = finalPlaces(order.map(p => Number(game.players[p].score) || 0));
    const most = Math.max(0, ...order.map(fooledBy));
    const rows: RecapRow[] = order.map((p, i) => {
        const row: RecapRow = { name: game.players[p].nickname, score: Number(game.players[p].score) || 0, place: places[i], fooled: fooledBy(p) };
        if (most > 0 && fooledBy(p) === most) {
            row.biggest = true;
        }
        return row;
    });
    const recap: NightAfter = {
        half: 'new',
        player: playedHere(game, uid, pid),
        endedAt: ended,
        locale: game.locale === 'he' ? 'he' : 'en',
        host: shownName(hostOf(game)),
        rows: rows.slice(0, RECAP_ROWS),
        played: pids.length,
        questions: Number(game.totalQ) || 0,
        fooledTotal: order.reduce((n, p) => n + fooledBy(p), 0),
        lie: lieOfTheNight(game, highlights),
    };
    if (typeof game.crew === 'string' && /^[a-z0-9]{1,32}$/i.test(game.crew)) {
        recap.crew = game.crew;
    }
    if (isTestCampaign(game.campaign)) {
        recap.test = true;
    }
    return recap;
}
