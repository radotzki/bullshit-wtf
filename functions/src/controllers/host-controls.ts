/**
 * The host's two controls, for a table with strangers in it (a stream with its chat, a class, a big
 * group): HIDE A LIE before the answers are on the screens, and REMOVE A PLAYER.
 *
 * Only the browser that holds the game's host key (see hostKey in game-model) may use them: the host's
 * phone, or the big screen when the host made their computer the big screen (hasHost 'screen'), and the
 * big screen's paired remote, the host's phone (see "on a second device" below).
 *
 * Hide a lie. While the lies are written, the host's phone may open the lies sent so far (texts only, no
 * names) and hide any of them. A hidden lie is left out of the question: when the writing ends, it is not
 * among the answers (populateQuestionAnswers fills its place with a house lie, as for a seat that sent
 * nothing), so nobody can pick it and it scores nothing. The table is told nothing; only its writer's
 * phone says, on the answers screen, that the host hid their lie.
 *   Fairness: the host who opened the lies has read every player's lie before the answers are shown, so
 *   that host's pick on this question does not count (it scores nothing and loses nothing; their own lie
 *   still scores as usual). The phone says so before it opens the lies.
 *   While the host has the lies open, the writing does not end early when the last lie arrives: the host
 *   gets the rest of the 25 seconds to look, or presses SHOW THE ANSWERS. The deadline ends it as before.
 *
 * Remove a player. The host may remove any seat but their own, at any moment before the final scoreboard.
 * The seat leaves the table (players, and its lie and pick of the question being played), and the browser
 * and seat are kept in games/<pin>/removed, so that browser can't join the same game again (join.ts
 * refuses it as REMOVED). Its lie, when the answers are already on the screens, stays there as a house lie:
 * the screens keep the list they show, and the reveal names no writer for it.
 *
 * Paths: `checking`, `hidden` and `removed` live under games/<pin>, which only the server reads and writes
 * (no rule names them), so no phone learns who was hidden or removed. No database rule changes.
 *
 * The decisions here are pure (no Firebase) so they can be unit tested; hostControl at the bottom does
 * the reads and writes.
 */
import { GameScheme, GameState, Answers, AnswerSelections } from '../game-model';

/** The host's look at the lies of one question: which question, and the host's seat (null: the big screen). */
export interface HostCheck {
    q: number;
    pid: string | null;
}

/** A browser and seat the host removed. Server only. */
export interface RemovedSeat {
    uid?: string | null;
    nickname?: string;
    at: number;
}

/** The host-only parts of a game, kept beside GameScheme so the shared model stays as it is. */
export interface HostParts {
    checking?: HostCheck | null;
    // pid -> the question index the host hid that seat's lie in.
    hidden?: { [pid: string]: number } | null;
    removed?: { [pid: string]: RemovedSeat } | null;
    // The big screen's pairing of a second device, and the paired remote (see below). Server only.
    pairing?: Pairing | null;
    remote?: RemoteSeat | null;
}

export type HostGame = GameScheme & HostParts;

export interface LieForHost {
    // The writer's seat, used only to name the lie in a hide call; the host's phone never shows it.
    id: string;
    text: string;
    hidden: boolean;
}

/** Does this key open the host's controls of this game? */
export function isHostKey(game: Partial<GameScheme> | null | undefined, hostKey: any): boolean {
    return !!game && typeof game.hostKey === 'string' && !!game.hostKey && typeof hostKey === 'string' && hostKey === game.hostKey;
}

/** The host's seat: the player row marked host, or null (a big-screen host has no seat). */
export function hostSeat(game: Partial<GameScheme> | null | undefined): string | null {
    const players = (game && game.players) || {};
    return Object.keys(players).find(pid => !!players[pid] && players[pid].host === true) || null;
}

function q(game: Partial<GameScheme>): number {
    return typeof game.questionIndex === 'number' ? game.questionIndex : 0;
}

/** The lies the host may look at now: players' lies of the question being written, but the host's own. */
export function liesForHost(game: HostGame): LieForHost[] {
    if (!game || !game.state || game.state.id !== GameState.ShowQuestion) {
        return [];
    }
    const answers = game.answers || {};
    const mine = hostSeat(game);
    const hidden = game.hidden || {};
    return Object.keys(answers)
        .filter(pid => pid !== mine && !!answers[pid] && !answers[pid].houseLie && !answers[pid].realAnswer
            && typeof answers[pid].text === 'string' && !!answers[pid].text)
        .map(pid => ({ id: pid, text: answers[pid].text, hidden: hidden[pid] === q(game) }))
        .sort((a, b) => a.text > b.text ? 1 : a.text < b.text ? -1 : 0);
}

/** Is the host looking at this question's lies? Then the writing waits for them (see everyoneSent). */
export function hostChecking(game: Partial<HostGame> | null | undefined): boolean {
    const c = game && game.checking;
    return !!c && !!game.state && game.state.id === GameState.ShowQuestion && c.q === q(game);
}

/** The players' lies of this question without those the host hid. Not the house lies or the truth. */
export function withoutHidden(answers: Answers | null | undefined, game: Partial<HostGame>): Answers {
    const hidden = (game && game.hidden) || {};
    const out: Answers = {};
    Object.keys(answers || {}).forEach(pid => {
        if (hidden[pid] !== q(game)) {
            out[pid] = answers[pid];
        }
    });
    return out;
}

/** The picks to score: the pick of a host who read this question's lies first does not count. */
export function picksToScore(selections: AnswerSelections | null | undefined, game: Partial<HostGame>): AnswerSelections | null | undefined {
    const c = game && game.checking;
    if (!selections || !c || !c.pid || c.q !== q(game) || !Object.prototype.hasOwnProperty.call(selections, c.pid)) {
        return selections;
    }
    const out = Object.assign({}, selections);
    delete out[c.pid];
    return out;
}

/** Why a browser may not join: it was removed by the host, by its sign-in or its seat. */
export function removedJoin(game: Partial<HostGame> | null | undefined, uid: any, pid: any): { message: string; code: string } | null {
    const removed = (game && game.removed) || {};
    const byUid = typeof uid === 'string' && !!uid && Object.keys(removed).some(k => removed[k] && removed[k].uid === uid);
    const byPid = typeof pid === 'string' && !!pid && Object.prototype.hasOwnProperty.call(removed, pid);
    return byUid || byPid ? { message: 'The host removed you from this game.', code: 'REMOVED' } : null;
}

/**
 * The multi-path update (paths under games/<pin>) that removes seat `pid`, or an error.
 * `newKey` makes a key for a lie that stays on the screens as a house lie. `lobbyFull` is
 * HOST_AWAY_MIN_PLAYERS (start.ts), passed in so this file loads no database.
 */
export function removeUpdate(game: HostGame, pid: string, now: number, newKey: () => string, lobbyFull = 5)
    : { update?: { [path: string]: any }; error?: { message: string; code: string } } {
    const player = game && game.players && game.players[pid];
    if (!player) {
        return { error: { message: 'No such player.', code: 'NOT_A_PLAYER' } };
    }
    if (player.host === true) {
        return { error: { message: 'The host cannot remove their own seat.', code: 'OWN_SEAT' } };
    }
    if (!game.state || game.state.id === GameState.ScoreBoardFinal) {
        return { error: { message: 'The game is over.', code: 'GAME_OVER' } };
    }

    const update: { [path: string]: any } = {
        [`players/${pid}`]: null,
        [`removed/${pid}`]: { uid: player.uid || null, nickname: player.nickname || '', at: now },
        [`answerSelections/${pid}`]: null,
        [`revealDone/${pid}`]: null,
        [`ideas/${pid}`]: null,
        [`played/${pid}`]: null,
        [`seen/${pid}`]: null,
    };

    const lie = game.answers && game.answers[pid];
    if (lie && !lie.houseLie && !lie.realAnswer) {
        update[`answers/${pid}`] = null;
        // The answers are on the screens: the lie stays there, shown as the house's. It is marked, so
        // that a pick of it, made when a real player wrote it, scores 0 and not a house lie's take-back.
        if (game.state.id === GameState.ShowAnswers) {
            update[`answers/${newKey()}`] = { text: lie.text, houseLie: true, realAnswer: false, removedSeat: true };
        }
    }

    // The lobby's host-away clock counts from the moment it had five players (see start.ts).
    if (game.state.id === GameState.GameStaging && typeof game.fullSince === 'number') {
        const left = Object.keys(game.players).filter(k => k !== pid && !!game.players[k]).length;
        if (left < lobbyFull) {
            update.fullSince = null;
        }
    }

    return { update };
}

// ---- The host's controls on a second device (a big-screen host's phone) ----
//
// A host who made their computer the big screen has no seat and no phone in the game, and the big screen
// is what a stream or a class sees, so the lies can't be opened there. The big screen may pair ONE other
// browser, the host's phone, as its remote: that browser may then use the same controls as the host (the
// lies, hide, show, remove), and nothing else (it can't start the game, pair another remote, or join as the
// host). It takes no seat: it is not a player, sends no join, and is in no count of players.
//
// Pairing, made so that a viewer who reads the big screen off a stream can't take the controls:
//   1. The host presses "Host controls on your phone" on the big screen (pairOpen, host key only). The
//      server opens a pairing for PAIR_MS (3 minutes) with a one-time code, shown as a QR and a link.
//      Nothing secret is in that link: the code only lets a phone ASK to pair, up to PAIR_MAX_CLAIMS phones.
//      The cap is high on purpose: on a stream or a class projector, dozens of viewers may scan before the
//      host does, and more phones asking gives none of them the controls (only the typed number pairs).
//      It only bounds the pairing's size. A phone past it is told the link is full (PAIR_FULL), not expired.
//   2. The phone that opens the link asks (claim, no key). The server gives that phone alone a random
//      remote key (kept on the phone, never shown) and a 4-digit number, which the phone shows.
//   3. The host types the number from their own phone into the big screen (pair, host key only). Only the
//      claim with that number becomes the remote; the pairing closes, every other claim is dropped. A viewer
//      who opened the link has a different number on their own phone, which the host never sees. Wrong
//      numbers close the pairing after PAIR_MAX_TRIES.
//   4. The phone asks if it is paired (remoteStatus, with its key) and then calls hostControl with it.
// The big screen may unpair at any time (unpair), and a new pairing replaces the old remote.
// The number typed on the big screen may be read off the stream, but it is worth nothing once used:
// the remote key never leaves the server and the phone.
//
// `pairing` and `remote` live under games/<pin>, which only the server reads and writes. No rule changes.

export const PAIR_MS = 3 * 60 * 1000;
export const PAIR_MAX_CLAIMS = 50;
export const PAIR_MAX_TRIES = 5;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const KEY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** A phone that opened the pairing link: its remote key (if paired) and the number it shows. Server only. */
export interface PairClaim {
    key: string;
    digits: string;
    at: number;
}

/** An open pairing, from the big screen's press. Server only. */
export interface Pairing {
    code: string;
    exp: number;
    tries: number;
    claims?: { [id: string]: PairClaim } | null;
}

/** The paired remote: the key its phone brings. Server only. */
export interface RemoteSeat {
    key: string;
    at: number;
}

/** Random bytes: crypto in the functions, a fixed list in the tests. */
export type RandomBytes = (n: number) => ArrayLike<number>;

function randomFrom(chars: string, n: number, bytes: RandomBytes): string {
    const b = bytes(n);
    let out = '';
    for (let i = 0; i < n; i++) {
        out += chars[b[i] % chars.length];
    }
    return out;
}

const NO_OFFER = { message: 'This code has expired. Press the button on the big screen again.', code: 'NO_OFFER' };
const PAIR_FULL = { message: 'Too many phones opened this link. Press "New code" on the big screen.', code: 'PAIR_FULL' };

/** Can this game pair a remote? A big-screen host's game (no seat is the host's), not over. */
export function canPair(game: Partial<HostGame> | null | undefined): boolean {
    return !!game && !!game.state && game.state.id !== GameState.ScoreBoardFinal && hostSeat(game) === null;
}

/** The big screen's press: a new pairing, open for PAIR_MS. Any earlier pairing (not the remote) goes. */
export function openPairing(now: number, bytes: RandomBytes): Pairing {
    return { code: randomFrom(CODE_CHARS, 8, bytes), exp: now + PAIR_MS, tries: 0, claims: null };
}

function openNow(pairing: Pairing | null | undefined, now: number): boolean {
    return !!pairing && typeof pairing.exp === 'number' && pairing.exp > now && (pairing.tries || 0) < PAIR_MAX_TRIES;
}

/**
 * A phone opened the link with `code`: its claim (a remote key and a number no other claim shows), and the
 * pairing with it, NO_OFFER (wrong, used or expired code) or PAIR_FULL (PAIR_MAX_CLAIMS phones already asked).
 */
export function claimPairing(pairing: Pairing | null | undefined, code: any, now: number, bytes: RandomBytes)
    : { pairing?: Pairing; id?: string; claim?: PairClaim; error?: { message: string; code: string } } {
    if (!openNow(pairing, now) || typeof code !== 'string' || code.toUpperCase() !== pairing.code) {
        return { error: NO_OFFER };
    }
    const claims = Object.assign({}, pairing.claims || {});
    if (Object.keys(claims).length >= PAIR_MAX_CLAIMS) {
        return { error: PAIR_FULL };
    }
    const taken = new Set(Object.keys(claims).map(k => claims[k].digits));
    let digits = '';
    for (let i = 0; i < 50 && (!digits || taken.has(digits)); i++) {
        digits = randomFrom('0123456789', 4, bytes);
    }
    if (taken.has(digits)) {
        return { error: NO_OFFER };
    }
    const id = randomFrom(KEY_CHARS, 10, bytes);
    const claim: PairClaim = { key: randomFrom(KEY_CHARS, 24, bytes), digits, at: now };
    claims[id] = claim;
    return { pairing: Object.assign({}, pairing, { claims }), id, claim };
}

/**
 * The host typed `digits` on the big screen. The claim that shows them becomes the remote, and the pairing
 * closes. A wrong number counts a try (the returned pairing); PAIR_MAX_TRIES of them close the pairing.
 */
export function confirmPairing(pairing: Pairing | null | undefined, digits: any, now: number)
    : { pairing: Pairing | null; remote?: RemoteSeat; error?: { message: string; code: string } } {
    if (!openNow(pairing, now)) {
        return { pairing: null, error: NO_OFFER };
    }
    const claims = pairing.claims || {};
    const typed = typeof digits === 'string' ? digits.replace(/\D/g, '') : '';
    const id = typed.length === 4 ? Object.keys(claims).find(k => claims[k] && claims[k].digits === typed) : undefined;
    if (!id) {
        const tries = (pairing.tries || 0) + 1;
        return {
            pairing: tries >= PAIR_MAX_TRIES ? null : Object.assign({}, pairing, { tries }),
            error: { message: 'That is not the number on a phone that asked.', code: 'WRONG_NUMBER' },
        };
    }
    return { pairing: null, remote: { key: claims[id].key, at: now } };
}

/** Does this key belong to the game's paired remote? */
export function isRemoteKey(game: Partial<HostGame> | null | undefined, key: any): boolean {
    const remote = game && game.remote;
    return !!remote && typeof remote.key === 'string' && remote.key.length >= 16 && typeof key === 'string' && key === remote.key;
}

/** What the phone that asked learns: paired, still waiting for the number on the big screen, or neither. */
export function remoteStatus(game: Partial<HostGame> | null | undefined, key: any, now: number): { paired: boolean; waiting: boolean } {
    if (isRemoteKey(game, key)) {
        return { paired: true, waiting: false };
    }
    const pairing = game && game.pairing;
    const claims = (pairing && pairing.claims) || {};
    const waiting = openNow(pairing, now) && typeof key === 'string'
        && Object.keys(claims).some(k => claims[k] && claims[k].key === key);
    return { paired: false, waiting };
}

/** What the big screen shows while pairing: open or not, until when, how many phones asked, and if no more may. */
export function pairingView(game: Partial<HostGame> | null | undefined, now: number) {
    const pairing = game && game.pairing;
    const open = openNow(pairing, now);
    return {
        open,
        code: open ? pairing.code : null,
        exp: open ? pairing.exp : null,
        asked: open ? Object.keys(pairing.claims || {}).length : 0,
        full: open && Object.keys(pairing.claims || {}).length >= PAIR_MAX_CLAIMS,
        paired: !!(game && game.remote && game.remote.key),
    };
}

/** What a host's call asks for. */
export interface HostAct {
    act: 'lies' | 'hide' | 'show' | 'remove' | 'pairOpen' | 'pairState' | 'pair' | 'unpair' | 'claim' | 'remoteStatus';
    // hide: the lie (its id from 'lies'), and whether to hide it (false: show it again).
    id?: string;
    hide?: boolean;
    // remove: the seat.
    pid?: string;
    // claim: the code from the big screen's link. pair: the number the host typed.
    code?: string;
    digits?: string;
    // The paired remote's key (lies, hide, show, remove), or a phone's claim key (remoteStatus).
    remoteKey?: string;
    // The remote's own seat in this game, if the same browser also plays: its pick won't score once it
    // has read the lies, as for a phone host.
    seat?: string;
}

/**
 * One call of the host's controls (the hostControl function). Resolves to:
 *   lies:   { lies: LieForHost[], q } (and the host is now checking this question's lies)
 *   hide:   { lies, q }, the list after the change
 *   show:   { shown: true } once the answers are on their way
 *   remove: { removed: true }
 *   pairOpen, pairState: pairingView (big screen); pair: { paired: true }; unpair: { paired: false }
 *   claim:  { remoteKey, digits } (any phone with the code); remoteStatus: { paired, waiting }
 * Rejects with NOT_HOST for any browser without the game's host key (or, for lies, hide, show and remove,
 * the paired remote's key), and with TOO_LATE when the lies are already on the screens.
 */
export async function hostControl(pinIn: any, hostKey: any, body: HostAct, now = Date.now()): Promise<any> {
    // Loaded here, not at the top: they open the database, and the rules above stay testable alone.
    const { gamesRef } = require('../firebase');
    const { readGame } = require('./old-games');
    const { advance } = require('./tick');

    const pin = String(pinIn || '').toUpperCase();
    if (!/^[A-Z0-9]{1,12}$/.test(pin)) {
        return Promise.reject({ message: 'Wrong game PIN', code: 'GAME_NOT_EXIST' });
    }
    const game: HostGame = await readGame(pin);
    if (!game) {
        return Promise.reject({ message: 'Wrong game PIN', code: 'GAME_NOT_EXIST' });
    }
    const act = body && body.act;
    const ref = gamesRef.child(pin);

    // A phone with the big screen's link: no key yet. See "on a second device" above.
    if (act === 'claim' || act === 'remoteStatus') {
        return remoteCall(ref, game, act, body, now);
    }
    const host = isHostKey(game, hostKey);
    const remote = !host && (act === 'lies' || act === 'hide' || act === 'show' || act === 'remove')
        && isRemoteKey(game, body && body.remoteKey);
    if (!host && !remote) {
        return Promise.reject({ message: 'Only the host can do this.', code: 'NOT_HOST' });
    }
    if (act === 'pairOpen' || act === 'pairState' || act === 'pair' || act === 'unpair') {
        return pairCall(pin, ref, game, act, body, now);
    }

    if (act === 'remove') {
        const pid = typeof body.pid === 'string' ? body.pid : '';
        const { HOST_AWAY_MIN_PLAYERS } = require('./start');
        const { update, error } = removeUpdate(game, pid, now, () => ref.child('answers').push().key, HOST_AWAY_MIN_PLAYERS);
        if (error) {
            return Promise.reject(error);
        }
        await ref.update(update);
        console.log(`[PIN: ${pin}] the host removed a player (state ${game.state.id})${remote ? ' from their phone' : ''}`);
        // The table may now be waiting for nobody: end the writing as the last lie would have.
        const after: HostGame = Object.assign({}, game, { players: Object.assign({}, game.players, { [pid]: undefined }) });
        delete after.players[pid];
        ['answers', 'answerSelections', 'revealDone'].forEach(part => {
            if (after[part]) {
                after[part] = Object.assign({}, after[part]);
                delete after[part][pid];
            }
        });
        await endIfAllSent(pin, after, advance);
        return { removed: true };
    }

    if (act !== 'lies' && act !== 'hide' && act !== 'show') {
        return Promise.reject({ message: 'Unknown act.', code: 'BAD_ACT' });
    }
    if (!game.state || game.state.id !== GameState.ShowQuestion) {
        return Promise.reject({ message: 'The answers are already on the screens.', code: 'TOO_LATE' });
    }
    const qi = q(game);

    if (act === 'show') {
        await advance(pin, game.state);
        return { shown: true };
    }

    const seat = remote && typeof body.seat === 'string' && game.players && game.players[body.seat] ? body.seat : null;
    const check: HostCheck = { q: qi, pid: hostSeat(game) || seat };
    const update: { [path: string]: any } = { checking: check };
    game.checking = check;
    if (act === 'hide') {
        const id = typeof body.id === 'string' ? body.id : '';
        if (!liesForHost(game).some(l => l.id === id)) {
            return Promise.reject({ message: 'No such lie.', code: 'NO_LIE' });
        }
        update[`hidden/${id}`] = body.hide === false ? null : qi;
        game.hidden = Object.assign({}, game.hidden, { [id]: body.hide === false ? undefined : qi });
        console.log(`[PIN: ${pin}] the host ${body.hide === false ? 'showed' : 'hid'} a lie`);
    }
    await ref.update(update);
    return { lies: liesForHost(game), q: qi };
}

/**
 * After a removal: the lies or the picks end when every seat left has sent, as they would have with the
 * last lie or pick (answer.ts, on-answer-selection.ts). The reveal ends on its NEXT taps or its clock.
 */
async function endIfAllSent(pin: string, game: HostGame, advance: (pin: string, state: any) => Promise<any>) {
    const id = game.state && game.state.id;
    if (id !== GameState.ShowQuestion && id !== GameState.ShowAnswers) {
        return;
    }
    const { everyoneSent, leftOutGuardWait } = require('./seats');
    const { writingSent } = require('./about');
    const { playerPicks } = require('./scoring');
    const sent = id === GameState.ShowQuestion ? writingSent(game) : playerPicks(game);
    if (everyoneSent(game, sent) && leftOutGuardWait(game, Date.now()) === 0) {
        await advance(pin, game.state);
    }
}

function cryptoBytes(n: number): ArrayLike<number> {
    return require('crypto').randomBytes(n);
}

/** The big screen's side of pairing (host key only). */
async function pairCall(pin: string, ref: any, game: HostGame, act: string, body: HostAct, now: number): Promise<any> {
    if (act === 'unpair') {
        await ref.update({ remote: null, pairing: null });
        console.log(`[PIN: ${pin}] the big screen unpaired the host's phone`);
        return { paired: false };
    }
    if (act === 'pairState') {
        return pairingView(game, now);
    }
    if (!canPair(game)) {
        return Promise.reject({ message: 'Only a big screen with no host seat pairs a phone.', code: 'NO_PAIRING' });
    }
    if (act === 'pairOpen') {
        await ref.child('pairing').set(openPairing(now, cryptoBytes));
        const view = pairingView(await readPairing(ref, game), now);
        console.log(`[PIN: ${pin}] the big screen opened a pairing`);
        return view;
    }
    // pair: a transaction, so a try is counted once and a claim made at the same moment is seen.
    let result: { pairing: Pairing | null; remote?: RemoteSeat; error?: { message: string; code: string } } = null;
    await ref.child('pairing').transaction((current: Pairing | null) => {
        result = confirmPairing(current, body.digits, now);
        return result.pairing;
    });
    if (!result || result.error) {
        return Promise.reject(result ? result.error : NO_OFFER);
    }
    await ref.child('remote').set(result.remote);
    console.log(`[PIN: ${pin}] the big screen paired the host's phone`);
    return { paired: true };
}

async function readPairing(ref: any, game: HostGame): Promise<HostGame> {
    const snap = await ref.child('pairing').once('value');
    return Object.assign({}, game, { pairing: snap.val() });
}

/** The phone's side: ask to pair with the link's code, then ask whether the big screen confirmed it. */
async function remoteCall(ref: any, game: HostGame, act: string, body: HostAct, now: number): Promise<any> {
    if (act === 'remoteStatus') {
        return remoteStatus(game, body.remoteKey, now);
    }
    if (!canPair(game)) {
        return Promise.reject(NO_OFFER);
    }
    let result: { id?: string; claim?: PairClaim; error?: { message: string; code: string } } = null;
    await ref.child('pairing').transaction((current: Pairing | null) => {
        const r = claimPairing(current, body.code, now, cryptoBytes);
        result = r;
        // A wrong or expired code changes nothing. It writes back what it read, never aborts, so a first
        // run on a stale local copy (null) is checked against the server and run again.
        return r.error ? current : r.pairing;
    });
    if (!result || result.error || !result.claim) {
        return Promise.reject(result && result.error ? result.error : NO_OFFER);
    }
    return { remoteKey: result.claim.key, digits: result.claim.digits };
}
