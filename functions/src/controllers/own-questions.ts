/**
 * Own questions: the host's own, written on the create page (see OwnQuestion in game-model for the play).
 *
 * Made: newGame keeps what cleanOwnQuestions takes at games/{pin}/ownQs, where no phone can read it. A game
 * with own questions is not drawn into the About questions' test (two kinds of personal question would
 * fight for the same places, and the test's halves stay clean).
 *
 * Placed: at START, after the room's bank questions are picked, at ownPlaces (from question 2 on, spread,
 * the last question kept for the bank). A pack question on such a place first swaps with a bank question
 * (clearAboutPlaces), so a pack game still plays its pack questions. Their ids in qids are own-0, own-1, ...
 * A taste (a host alone) plays bank questions only: the host knows these answers.
 *
 * Played: as a bank question, read from ownQs in place of the bank (questions.ts questionFor). Its state
 * carries `own` with the host's seat from the writing to the scoreboard. The host writes a lie like
 * everyone (they know the truth, so a lie is all they can score with) and does not pick: their pick is
 * no pick, the picks do not wait for them, and their seat is marked done when the answers open. The
 * "too close to the truth" refusal holds as on any question. The two wrong answers are the house lies.
 * No round-1 ideas and no pair decoys: those come from the bank's fake answers. Nobody's seen-questions
 * record is written, and qHistory keeps only the PIN.
 *
 * Counted: question_results.qid is own-<n> for an own question; opened_games and closed_games carry
 * own_questions, how many the game placed (0 for a game without, so a pack of games is one WHERE).
 *
 * This file is pure (no Firebase) so it can be unit tested.
 */
import { GameScheme, GameState, GameStateInfo, OwnQuestion, OWN_ID_PREFIX, isOwnId, ownOf, ownPlaces } from '../game-model';
import { clearAboutPlaces } from './about';

/** The game's own question for this id, or null (a bank id, or an own id this game does not hold). */
export function ownQuestion(game: Partial<GameScheme> | null | undefined, qid: any): (OwnQuestion & { id: string }) | null {
    if (!isOwnId(qid) || !game || !game.ownQs || typeof game.ownQs !== 'object') {
        return null;
    }
    const q = game.ownQs[String(qid).slice(OWN_ID_PREFIX.length)];
    if (!q || typeof q.questionText !== 'string' || typeof q.realAnswer !== 'string') {
        return null;
    }
    return { id: String(qid), questionText: q.questionText, realAnswer: q.realAnswer, fakeAnswers: Array.isArray(q.fakeAnswers) ? q.fakeAnswers.slice() : [] };
}

/** The own questions' ids this game holds, in order (own-0, own-1, ...). */
export function ownIds(game: Partial<GameScheme> | null | undefined): string[] {
    const qs = game && game.ownQs && typeof game.ownQs === 'object' ? game.ownQs : {};
    return Object.keys(qs).filter(k => /^\d+$/.test(k) && !!ownQuestion(game, OWN_ID_PREFIX + k))
        .sort((a, b) => +a - +b).map(k => OWN_ID_PREFIX + k);
}

/** A game's qids as a list, whether the database gave an array or an object. */
export function qidList(qids: any): string[] {
    if (Array.isArray(qids)) {
        return qids.slice();
    }
    if (!qids || typeof qids !== 'object') {
        return [];
    }
    return Object.keys(qids).sort((a, b) => +a - +b).map(k => qids[k]);
}

/**
 * The game's questions with its own questions on their places (ownPlaces). A pack question on such a
 * place first swaps with the nearest bank question (clearAboutPlaces). Places past the list are skipped.
 */
export function placeOwnQuestions(qids: any, own: string[], totalQ: number, isPackQuestion: (qid: string) => boolean = () => false): string[] {
    let list = qidList(qids);
    const places = ownPlaces((own || []).length, Math.min(totalQ || list.length, list.length)).filter(p => p < list.length);
    if (!places.length) {
        return list;
    }
    list = clearAboutPlaces(list, places, isPackQuestion);
    places.forEach((place, i) => list[place] = own[i]);
    return list;
}

/** The host's seat: the player the server marked as host, or '' (a big-screen host, an older game). */
export function hostSeat(game: Partial<GameScheme> | null | undefined): string {
    const players = (game && game.players) || {};
    const pids = Object.keys(players).filter(pid => !!players[pid] && players[pid].host === true);
    return pids.length === 1 ? pids[0] : '';
}

/** The state of an own question: its `own`, for every phone to read. */
export function withOwn(state: GameStateInfo, pid: string): GameStateInfo {
    return Object.assign({}, state, { own: { pid: pid || '' } });
}

/** The state the game moves to keeps `own` while it stays on the same question (as carryAbout does). */
export function carryOwn(from: GameStateInfo, to: GameStateInfo, update: Partial<GameScheme>): GameStateInfo {
    const own = ownOf(from);
    const stays = [GameState.ShowAnswers, GameState.RevealTheTruth, GameState.ScoreBoard].indexOf(to.id) >= 0 &&
        (update.questionIndex === undefined || update.questionIndex === null);
    return own && stays && !ownOf(to) ? withOwn(to, own.pid) : to;
}

/** The host of an own question while its answers are picked (they know the truth, so they do not pick), or null. */
export function ownNotPicking(game: Partial<GameScheme> | null | undefined): string | null {
    const own = game ? ownOf(game.state) : null;
    return own && own.pid && game.state.id === GameState.ShowAnswers ? own.pid : null;
}

/** The host of the own question being played, whose pick is no pick (in any phase), or null. */
export function ownHost(game: Partial<GameScheme> | null | undefined): string | null {
    const own = game ? ownOf(game.state) : null;
    return own && own.pid ? own.pid : null;
}
