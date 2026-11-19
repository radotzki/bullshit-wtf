// CHALLENGE ANOTHER GROUP. A table that just finished has a score to brag about. A player presses
// CHALLENGE ANOTHER GROUP on the final screen and sends a link (/challenge/<PIN>?via=challenge-...) to
// another group. That group's host opens it, sees the score to beat, and makes a game that plays the very
// same questions in the same order. At that game's end both tables' scores show side by side.
//
// What it promises:
// - A link carries only the challenged game's PIN. Every name and score the other group sees is read by
//   the server from that game's own record (challengeCard), and copied into the new game when it is made
//   (game.challenge, which no phone can read). Nothing in a link can put a name, a score or a word on
//   anyone's screen; the page shows names as text.
// - A finished game shows nothing to strangers until one of its own players opens the challenge
//   (openChallenge, which only a browser that sat at that table may do). Then, for CHALLENGE_MS after the
//   game ended, its PIN shows its host's name as a preview shows it, its table's size and its challenge
//   number (challengeNumber: points a player, house-lie picks counted like a friend's lie);
//   the full scores only at the end of a game played against it. After that the link says it is over.
// - The new game gets the other game's question ids exactly, in order: the room's seen-questions record,
//   the opener rule and the About questions are all skipped for it (tick.ts keeps the ids at START), so a
//   group whose phones saw some of the questions before still plays the same ones.
// - Only a game that reached its final scores with 2 or more players, not a taste, not an idle game,
//   and with a full list of question ids, can be challenged.
// - A test game's challenge makes a test game (it keeps the test tag), so test play stays out of counts.
import { GameScheme, GameState, ChallengeCard, ChallengeRow, finalPlaces, isTestCampaign } from '../game-model';
import { gamesRef } from '../firebase';
import { readGame } from './old-games';
import { hostOf, shownName } from './join-preview';

/** How long after the challenged game's end its link may start a challenge, and how long after the end of a
 * game played against it the side-by-side scores are shown. */
export const CHALLENGE_MS = 7 * 24 * 60 * 60 * 1000;
/** At most this many rows of a table's final scores travel (the game seats 12). */
export const CHALLENGE_ROWS = 12;
/** The longest name a row carries. */
export const NAME_MAX = 24;

// Control characters, and the invisible ones that turn text around (bidi overrides and isolates).
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;
// A question id is a database key: none of . # $ [ ] / and nothing odd.
const QID = /^[A-Za-z0-9_-]{1,64}$/;

/** A nickname as a row of a challenge shows it: no invisible characters, one line, at most NAME_MAX. */
export function rowName(nickname: any): string {
    if (typeof nickname !== 'string') {
        return '?';
    }
    const name = Array.from(nickname.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim()).slice(0, NAME_MAX).join('').trim();
    return name || '?';
}

/** The server time the game reached its final scores, or 0 when it never did (or was a taste). */
export function endedAt(game: GameScheme | null): number {
    if (!game || !game.state || game.state.id !== GameState.ScoreBoardFinal || (game.state as any).taste) {
        return 0;
    }
    return Number(game.state.timestamp) || Number(game.timestamp) || 0;
}

/** The game's question ids in play order, or null when they are not a full, clean list. */
export function qidsOf(game: GameScheme | null): string[] | null {
    const raw: any = game && game.qids;
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const list: any[] = Array.isArray(raw) ? raw : Object.keys(raw).sort((a, b) => +a - +b).map(k => raw[k]);
    const total = Number(game.totalQ) || 0;
    if (total < 1 || list.length !== total || !list.every(q => typeof q === 'string' && QID.test(q))) {
        return null;
    }
    return list.slice();
}

/** Seats of the game that are players with a nickname (not the big screen). */
function seats(game: GameScheme): string[] {
    const players = game.players && typeof game.players === 'object' ? game.players : {};
    return Object.keys(players).filter(k => players[k] && typeof players[k] === 'object'
        && typeof players[k].nickname === 'string' && players[k].nickname.trim() !== '');
}

/**
 * The table's challenge number, what a challenge is judged by: the seats' scores plus the game's house-lie
 * credit, a player, rounded. Up to 4 players most wrong picks land on house lies, which pay nobody, so the
 * plain average a player leaves small tables far behind a big one; the credit counts each house-lie pick as
 * a friend's lie would have paid, and gives back what it cost (houseLieCredit in scoring.ts). Equally good
 * tables of 2 to 12 then land within about 10% of each other. Built from the game's own record alone; a game
 * that started before the credit was kept (no houseCredit) gets its plain average, as before.
 */
export function challengeNumber(game: GameScheme | null): number {
    const pids = game ? seats(game) : [];
    if (!pids.length) {
        return 0;
    }
    const total = pids.reduce((sum, p) => sum + Math.max(0, Number(game.players[p].score) || 0), 0);
    const credit = typeof game.houseCredit === 'number' && isFinite(game.houseCredit) ? Math.max(0, game.houseCredit) : 0;
    return Math.round((total + credit) / pids.length);
}

/**
 * The card of a finished game another group may play against, or null when it can't be challenged (see
 * the header). Built from the game's own record alone.
 */
export function challengeCard(pin: string, game: GameScheme | null, now: number): ChallengeCard | null {
    const ended = endedAt(game);
    if (!ended || now - ended > CHALLENGE_MS || now < ended - 60 * 1000 || game.idle) {
        return null;
    }
    if (!qidsOf(game)) {
        return null;
    }
    const pids = seats(game);
    if (pids.length < 2) {
        return null;
    }
    const score = (p: string) => Math.max(0, Math.round(Number(game.players[p].score) || 0));
    const order = pids.slice().sort((a, b) => score(b) - score(a) || (a < b ? -1 : 1));
    const places = finalPlaces(order.map(score));
    const rows: ChallengeRow[] = order.map((p, i) => ({ name: rowName(game.players[p].nickname), score: score(p), place: places[i] }));
    const card: ChallengeCard = {
        from: String(pin || '').toUpperCase(),
        host: shownName(hostOf(game)),
        locale: game.locale === 'he' ? 'he' : 'en',
        questions: Number(game.totalQ) || 0,
        played: pids.length,
        top: rows.length ? rows[0].score : 0,
        rows: rows.slice(0, CHALLENGE_ROWS),
        average: challengeNumber(game),
    };
    if (isTestCampaign(game.campaign)) {
        card.test = true;
    }
    return card;
}

/** The card of a game whose challenge is open, for its link; null otherwise. */
export function openCard(pin: string, game: GameScheme | null, now: number): ChallengeCard | null {
    return game && game.challengeOpen === true ? challengeCard(pin, game, now) : null;
}

/**
 * The other table, for the final screen of a game played against it: the card copied when this game was
 * made, while this game's end is less than CHALLENGE_MS ago. Null for every other game.
 */
export function versusCard(game: GameScheme | null, now: number): ChallengeCard | null {
    const card = game && game.challenge;
    const ended = endedAt(game);
    if (!card || typeof card !== 'object' || !ended || now - ended > CHALLENGE_MS) {
        return null;
    }
    // This game's own challenge number, from its record, beside the other table's. A card copied before
    // the number was kept has no `average`: the page then judges both tables by their plain averages.
    return typeof card.average === 'number' ? { ...card, ours: challengeNumber(game) } : card;
}

/** The browser asking sat at this game: its sign-in uid is a seat's, or its last seat is one of the game's. */
export function playedHere(game: GameScheme, uid: any, pid: any): boolean {
    const players = (game && game.players) || {};
    if (typeof uid === 'string' && uid && Object.keys(players).some(k => players[k] && players[k].uid === uid)) {
        return true;
    }
    return typeof pid === 'string' && !!pid && !!players[pid];
}

/**
 * CHALLENGE ANOTHER GROUP pressed: a player of this finished game opens its challenge. Asking twice
 * changes nothing. Answers with the card, which the share's message quotes.
 */
export async function openChallenge(pin: any, uid: any, pid: any, now = Date.now()): Promise<{ challenge: ChallengeCard }> {
    pin = typeof pin === 'string' ? pin.toUpperCase() : '';
    const game = /^[A-Z]{1,12}$/.test(pin) ? await readGame(pin) : null;
    if (!game) {
        return Promise.reject({ message: 'Wrong game PIN', code: 'GAME_NOT_EXIST' });
    }
    if (!playedHere(game, uid, pid)) {
        return Promise.reject({ message: 'Only a player of this game can challenge with it', code: 'NOT_A_PLAYER' });
    }
    const card = challengeCard(pin, game, now);
    if (!card) {
        return Promise.reject({ message: 'This game cannot be challenged', code: 'CHALLENGE_OVER' });
    }
    if (game.challengeOpen !== true) {
        await gamesRef.child(pin).child('challengeOpen').set(true);
        console.log(`[PIN: ${pin}] challenge opened`);
    }
    return { challenge: card };
}

/** What a game made from a challenge link copies from the challenged game. */
export interface ChallengeSeed {
    card: ChallengeCard;
    qids: string[];
    pack?: string;
    /** The challenged game's test tag, kept by the new game; undefined for a real game. */
    testCampaign?: string;
}

/** The challenged game, when its challenge is open and still on; null otherwise. */
export async function challengeSeed(pin: any, now = Date.now()): Promise<ChallengeSeed | null> {
    pin = typeof pin === 'string' ? pin.toUpperCase() : '';
    if (!/^[A-Z]{1,12}$/.test(pin)) {
        return null;
    }
    const game = await readGame(pin);
    const card = openCard(pin, game, now);
    const qids = card && qidsOf(game);
    if (!card || !qids) {
        return null;
    }
    const seed: ChallengeSeed = { card, qids };
    if (typeof game.pack === 'string' && game.pack) {
        seed.pack = game.pack;
    }
    if (card.test) {
        seed.testCampaign = game.campaign;
    }
    return seed;
}
