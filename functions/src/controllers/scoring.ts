/**
 * Scoring of one question: who picked what, what each pick and each lie is worth, the reveal rows,
 * and the players' new totals.
 *
 * Picks are the one part of a game that phones write themselves (games/{pin}/answerSelections), so
 * nothing here trusts that node: only a pick that is a player's counts, and only its text is read.
 * Points are worked out once, when picking closes, and kept in the reveal rows, which only the
 * server writes. The totals are then added up from those rows and from the lies, never from the
 * picks node again.
 *
 * This file is pure (no Firebase) so it can be unit tested.
 */
import { GameScheme, GameState, Answers, AnswerSelections, GamePlayers, RevealAnswer, pickIsFor, aboutOf } from '../game-model';
import { houseLiePoints } from './house-lie';
import { isSamePick } from './same-pick';

export const pointsForCorrectAnswer = [1000, 1500, 2000];
export const pointsForBullshitting = [500, 750, 1000];

function own(obj: any, key: string): boolean {
    return !!obj && typeof obj === 'object' && Object.prototype.hasOwnProperty.call(obj, key);
}

/** Is `pid` one of this game's players? */
export function isPlayer(game: Partial<GameScheme>, pid: string): boolean {
    const players = game && game.players;
    return own(players, pid) && !!players[pid] && typeof players[pid] === 'object';
}

/** The lie this player wrote for the current question, if any. */
function ownLie(game: Partial<GameScheme>, pid: string) {
    const answer = own(game.answers, pid) ? game.answers[pid] : undefined;
    return answer && !answer.realAnswer && !answer.houseLie ? answer : undefined;
}

/**
 * The picks that count, as `{ text }` and nothing else: one per player, made by a player of this
 * game, with a text, and not the player's own lie (the game never offers a player their own lie).
 * While picks are open, a pick that names another step (made in an earlier question by a phone that
 * was offline, see pickIsFor) does not count either.
 * Everything else under answerSelections is ignored.
 */
export function playerPicks(game: Partial<GameScheme>): AnswerSelections {
    const picks: AnswerSelections = {};
    const selections = game && game.answerSelections;

    if (!selections || typeof selections !== 'object') {
        return picks;
    }

    // An About question: the player it is about knows the truth, so their pick (from an older site,
    // which offers them the answers) is no pick.
    const about = aboutOf(game.state);

    Object.keys(selections).forEach(pid => {
        const pick = selections[pid];

        if (about && pid === about.pid) {
            return;
        }

        if (!isPlayer(game, pid) || !pick || typeof pick !== 'object' || typeof pick.text !== 'string' || !pick.text) {
            return;
        }

        if (game.state && game.state.id === GameState.ShowAnswers && !pickIsFor(pick, game.state)) {
            return;
        }

        const lie = ownLie(game, pid);

        if (lie && isSamePick(lie.text, pick.text)) {
            return;
        }

        picks[pid] = { text: pick.text };
    });

    return picks;
}

/** Has every player of the game picked? */
export function everyonePicked(game: Partial<GameScheme>): boolean {
    const pids = Object.keys((game && game.players) || {});
    const picks = playerPicks(game);
    return pids.length > 0 && pids.every(pid => own(picks, pid));
}

/**
 * Picking has closed: the points of every lie and every pick, and the reveal rows.
 * Returns new objects; `game` is left as it was. `answerSelections` holds only the picks that count.
 */
export function scoreQuestion(game: GameScheme): { answers: Answers; answerSelections: AnswerSelections; revealAnswers: RevealAnswer[] } {
    const answers: Answers = {};
    Object.keys(game.answers || {}).forEach(k => answers[k] = Object.assign({}, game.answers[k]));
    const answerSelections = playerPicks(game);

    const answersArray = Object.keys(answers).map(k => Object.assign({}, { pid: k }, answers[k]));
    const picksArray = Object.keys(answerSelections).map(k => ({ pid: k, text: answerSelections[k].text }));

    picksArray.forEach(pick => {
        const relatedAnswers = answersArray.filter(answer => isSamePick(answer.text, pick.text));

        if (relatedAnswers.length === 1 && relatedAnswers[0].realAnswer) {
            answerSelections[pick.pid].score = pointsForCorrectAnswer[game.roundIndex];
        } else if (relatedAnswers.length === 1 && relatedAnswers[0].houseLie) {
            // Set below, once every player's points for their own lie are known.
            answerSelections[pick.pid].score = 0;
        } else {
            answerSelections[pick.pid].score = 0;
            relatedAnswers.forEach(answer => {
                answers[answer.pid].score = (answers[answer.pid].score || 0) + pointsForBullshitting[game.roundIndex];
            });
        }
    });

    // A house lie only takes back points the player has: it never pushes a score below zero.
    picksArray.forEach(pick => {
        const relatedAnswers = answersArray.filter(answer => isSamePick(answer.text, pick.text));

        if (relatedAnswers.length === 1 && relatedAnswers[0].houseLie) {
            const lie = ownLie({ answers }, pick.pid);
            answerSelections[pick.pid].score = houseLiePoints(
                game.roundIndex,
                game.players[pick.pid].score || 0,
                lie ? lie.score || 0 : 0,
            );
        }
    });

    const revealAnswers = revealRows(answers, answerSelections);

    // An About question: the player it is about scores for each friend who found their truth, as much
    // as a lie scores for each friend it fools.
    const about = aboutOf(game.state);
    if (about && isPlayer(game, about.pid)) {
        revealAnswers.filter(row => row.realAnswer).forEach(row => {
            row.about = about.pid;
            row.aboutPoints = row.selectors.length * pointsForBullshitting[game.roundIndex];
        });
    }

    return { answers, answerSelections, revealAnswers };
}

function revealRows(answers: Answers, answerSelections: AnswerSelections): RevealAnswer[] {
    const answersArray = Object.keys(answers).map(k => Object.assign({}, { pid: k }, answers[k]));
    const answerSelectionsArray = Object.keys(answerSelections).map(k => Object.assign({}, { pid: k }, answerSelections[k]));
    const revealAnswers: RevealAnswer[] = [];

    answersArray.forEach(answer => {
        const answerSelection = answerSelectionsArray.filter(a => isSamePick(answer.text, a.text));
        const selectors = answerSelection.map(a => a.pid);
        const text = answer.text;
        const realAnswer = answer.realAnswer;
        const houseLie = answer.houseLie;
        const creators = answersArray
            .filter(a => a.text === answer.text)
            .map(a => a.houseLie || a.realAnswer ? '' : a.pid);
        let points = 0;

        if (revealAnswers.find(w => w.text === answer.text)) {
            return;
        }

        let pointsBy: { [pid: string]: number };

        if (houseLie && answerSelection[0]) {
            // The row shows the most any picker lost; a picker with no points to lose lost nothing.
            pointsBy = {};
            answerSelection.forEach(a => pointsBy[a.pid] = a.score || 0);
            points = Math.min(0, ...answerSelection.map(a => a.score || 0));
        } else if (realAnswer && answerSelection[0]) {
            points = answerSelection[0].score;
        } else {
            points = answer.score || 0;
        }

        revealAnswers.push(Object.assign(
            { creators, selectors, points, text, realAnswer, houseLie },
            pointsBy ? { pointsBy } : {},
        ));
    });

    return revealAnswers.sort((a, b) => a.text > b.text ? 1 : -1).sort(a => a.realAnswer ? 1 : -1);
}

function num(value: any): number {
    return typeof value === 'number' && isFinite(value) ? value : 0;
}

/** What a player's pick of this reveal row was worth. */
function pickPoints(row: RevealAnswer, pid: string): number {
    if (row.houseLie) {
        return own(row.pointsBy, pid) ? num(row.pointsBy[pid]) : 0;
    }

    return row.realAnswer ? num(row.points) : 0;
}

/**
 * The reveal is over: every player's total, with this question's points added.
 * A player's points for their lie come from `answers`, and for their pick from the reveal rows;
 * both are written only by the server. Lies and picks that are no player's add nothing.
 * Returns a new object; `game` is left as it was.
 */
export function addQuestionScores(game: GameScheme): GamePlayers {
    const players: GamePlayers = {};
    Object.keys(game.players || {}).forEach(pid => players[pid] = Object.assign({}, game.players[pid]));

    Object.keys(game.answers || {}).forEach(pid => {
        const lie = ownLie(game, pid);

        if (lie && isPlayer(game, pid)) {
            players[pid].score = num(players[pid].score) + num(lie.score);
        }
    });

    const counted: { [pid: string]: boolean } = {};

    (Array.isArray(game.revealAnswers) ? game.revealAnswers : []).forEach(row => {
        ((row && Array.isArray(row.selectors)) ? row.selectors : []).forEach(pid => {
            // One pick per player.
            if (typeof pid !== 'string' || !isPlayer(game, pid) || counted[pid]) {
                return;
            }

            counted[pid] = true;
            players[pid].score = num(players[pid].score) + pickPoints(row, pid);
        });

        // An About question's truth: the points of the player it is about.
        if (row && row.realAnswer && typeof row.about === 'string' && isPlayer(game, row.about)) {
            players[row.about].score = num(players[row.about].score) + num(row.aboutPoints);
        }
    });

    return players;
}
