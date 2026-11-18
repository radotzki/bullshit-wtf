/**
 * The host's two controls, for a table with strangers in it (a stream with its chat, a class, a big
 * group): HIDE A LIE before the answers are on the screens, and REMOVE A PLAYER.
 *
 * Only the browser that holds the game's host key (see hostKey in game-model) may use them: the host's
 * phone, or the big screen when the host made their computer the big screen (hasHost 'screen').
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

/** What a host's call asks for. */
export interface HostAct {
    act: 'lies' | 'hide' | 'show' | 'remove';
    // hide: the lie (its id from 'lies'), and whether to hide it (false: show it again).
    id?: string;
    hide?: boolean;
    // remove: the seat.
    pid?: string;
}

/**
 * One call of the host's controls (the hostControl function). Resolves to:
 *   lies:   { lies: LieForHost[], q } (and the host is now checking this question's lies)
 *   hide:   { lies, q }, the list after the change
 *   show:   { shown: true } once the answers are on their way
 *   remove: { removed: true }
 * Rejects with NOT_HOST for any browser without the game's host key, and with TOO_LATE when the lies
 * are already on the screens.
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
    if (!isHostKey(game, hostKey)) {
        return Promise.reject({ message: 'Only the host can do this.', code: 'NOT_HOST' });
    }
    const act = body && body.act;
    const ref = gamesRef.child(pin);

    if (act === 'remove') {
        const pid = typeof body.pid === 'string' ? body.pid : '';
        const { HOST_AWAY_MIN_PLAYERS } = require('./start');
        const { update, error } = removeUpdate(game, pid, now, () => ref.child('answers').push().key, HOST_AWAY_MIN_PLAYERS);
        if (error) {
            return Promise.reject(error);
        }
        await ref.update(update);
        console.log(`[PIN: ${pin}] the host removed a player (state ${game.state.id})`);
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

    const check: HostCheck = { q: qi, pid: hostSeat(game) };
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
