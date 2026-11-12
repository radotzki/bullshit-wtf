import { getQuestion, randomQuestions, markQuestionSeen } from './questions';
import { GameScheme, Answers, GameState, GameStateInfo, addHighlights, highlightsStart } from '../game-model';
import { get, gamesRef, qHistoryRef } from '../firebase';
import { tickAllowed, stateKey, withDeadline, endsAtOnce } from './phase';
import { pickHouseLies } from './answer-options';
import { cleanHouseLies } from './house-lie-cleanup';
import { pickIdeas, questionResult } from './lie-helper';
import { onQuestionResult } from './analytics';
import { playedUpdate } from './seats';
import { gameTaste, newTaste, nextTaste, startsAsTaste, tasteHouseLies, withTaste } from './taste';
import { TASTE_QUESTIONS } from '../game-model';
import * as scoring from './scoring';

// How long a run waits before its second try at leaving a phase of no length.
const leaveRetryDelay = 1000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** A client wrote games/{pin}/tick: move on if that tick is valid for the current phase. */
export async function tick(pin) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));

    if (!tickAllowed(game, game && game.tick, Date.now())) {
        console.log(`[PIN: ${pin}] Ignoring tick ${game && game.tick} in state ${game && game.state && game.state.id}`);
        return;
    }

    return advance(pin, game.state);
}

/**
 * Move the game on from the phase `from`, exactly once.
 * Safe to call from the server timer, a client tick and the "everyone answered" checks at the same time:
 * whoever claims the lock for this phase first does the work, everyone else is a no-op.
 * A phase that was moved stays taken for the rest of the game (see takePhase), so a caller that is
 * late for it finds nothing to do.
 */
export async function advance(pin: string, from: GameStateInfo, retryAfter = leaveRetryDelay) {
    pin = pin.toUpperCase();
    let game = await get<GameScheme>(gamesRef.child(pin));

    if (!onPhase(game, from)) {
        console.log(`[PIN: ${pin}] State already moved on from ${stateKey(from)}`);
        return;
    }

    const phase = phaseKey(game);

    if (!(await takePhase(pin, phase))) {
        console.log(`[PIN: ${pin}] The move on from ${stateKey(from)} is taken`);
        return;
    }

    if (!(await claim(pin, stateKey(from)))) {
        console.log(`[PIN: ${pin}] Another caller is advancing from ${stateKey(from)}`);
        await freePhase(pin, phase).catch(err => console.error(`[PIN: ${pin}] Failed to free ${phase}`, err));
        return;
    }

    // The step works on the game as it is now that the phase is this run's, not as it was read before:
    // if the game has left the phase meanwhile, there is nothing to do, and the phase stays taken.
    game = await get<GameScheme>(gamesRef.child(pin));

    if (!onPhase(game, from)) {
        console.log(`[PIN: ${pin}] State moved on from ${stateKey(from)} before this run took it`);
        return;
    }

    console.log(`[PIN: ${pin}] Advancing from state ${game.state.id}`);

    let update: Partial<GameScheme> | undefined;

    try {
        update = await nextUpdate(pin, game);

        if (!update) {
            return;
        }

        if (update.state) {
            update.state = withDeadline(update.state, Object.assign({}, game, update));
        }

        await updateGame(pin, update);
    } catch (e) {
        // The phase was claimed but the game did not move. Give the phase back, so the next caller
        // (the timer's second try, a phone's own timer, the last answer) can move it on.
        console.error(`[PIN: ${pin}] Failed to advance from ${stateKey(from)}`, e);
        await release(pin, stateKey(from)).catch(err => console.error(`[PIN: ${pin}] Failed to release ${stateKey(from)}`, err));
        // The lock first, then the phase: the next caller takes them in the other order.
        await freePhase(pin, phase).catch(err => console.error(`[PIN: ${pin}] Failed to free ${phase}`, err));
        throw e;
    }

    // A phase of no length (the scoreboard of a staged-reveal game) is left in this same run, so the
    // next question does not wait for the phase timer's own function to start. That timer fires too,
    // and finds the phase already claimed.
    // Outside the try above: this game did move on from `from`, whatever happens to the next step.
    if (endsAtOnce(update.state)) {
        return leaveAtOnce(pin, update.state, retryAfter);
    }
}

/**
 * Leave a phase of no length. The phase timer that fires for it may already have found the phase
 * claimed by this run and gone, so if moving on fails here, this run tries once more itself. A second
 * failure is logged and not passed on (the caller's own step succeeded); a phone's timer then moves
 * the game on, as it would for any phase.
 */
async function leaveAtOnce(pin: string, state: GameStateInfo, retryAfter: number) {
    try {
        return await advance(pin, state, retryAfter);
    } catch (e) {
        console.error(`[PIN: ${pin}] Failed to leave ${stateKey(state)} at once, trying once more`, e);
    }

    await sleep(retryAfter);

    try {
        return await advance(pin, state, retryAfter);
    } catch (e) {
        console.error(`[PIN: ${pin}] Failed again to leave ${stateKey(state)}; left to the phones' timers`, e);
    }
}

function onPhase(game: GameScheme | null | undefined, phase: GameStateInfo): boolean {
    return !!game && !!game.state && stateKey(game.state) === stateKey(phase);
}

/** Names one occurrence of a phase for the whole game: the phase's key and the question it belongs to. */
function phaseKey(game: GameScheme): string {
    return `${stateKey(game.state)}:q${game.questionIndex || 0}`;
}

/**
 * games/{pin}/advanceTaken holds one entry for each phase whose move is taken or done. The lock below
 * remembers only the phase claimed last; an entry here is that phase's own and stays, so taking one
 * phase never undoes another's. Only the run that took a phase and could not move it frees it.
 */
function takePhase(pin: string, phase: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        gamesRef.child(pin).child('advanceTaken').child(phase).transaction(
            // The database client first runs this on what it holds locally, which is nothing (null) here.
            // If the server holds an entry, this runs again on that, and stops.
            current => current === null ? true : undefined,
            (error, committed) => error ? reject(error) : resolve(committed),
            false,
        );
    });
}

function freePhase(pin: string, phase: string): Promise<void> {
    return gamesRef.child(pin).child('advanceTaken').child(phase).set(null);
}

function claim(pin: string, key: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        gamesRef.child(pin).child('advanceLock').transaction(
            current => current === key ? undefined : key,
            (error, committed) => error ? reject(error) : resolve(committed),
            false,
        );
    });
}

function release(pin: string, key: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
        gamesRef.child(pin).child('advanceLock').transaction(
            // The database client first runs this on what it holds locally, which is nothing (null) here,
            // and only asks the server if a value comes back. Returning undefined for null would stop it
            // there, with the phase still taken on the server and the game stuck for good. So null also
            // answers null: the server then says what the lock really is, and this runs again on that.
            current => current === key || current === null ? null : undefined,
            (error, committed) => error ? reject(error) : resolve(committed),
            false,
        );
    });
}

/**
 * The game's next step. A taste (a game that left the lobby with one player and no big screen, see
 * taste.ts) carries its mark on every state from here on; no other game's step is touched.
 */
async function nextUpdate(pin: string, game: GameScheme): Promise<Partial<GameScheme> | undefined> {
    const taste = game.state.id === GameState.GameStaging
        ? (startsAsTaste(game) ? newTaste(game) : null)
        : gameTaste(game);
    const update = await stepUpdate(pin, game, !!taste);

    if (taste && update && update.state) {
        update.state = withTaste(update.state, nextTaste(taste, update));
    }

    return update;
}

async function stepUpdate(pin: string, game: GameScheme, taste: boolean): Promise<Partial<GameScheme> | undefined> {
    switch (game.state.id) {
        case GameState.GameStaging:
            if (taste) {
                // A host who starts alone: five questions, whatever length was chosen for the table.
                return {
                    state: updateState(GameState.RoundIntro),
                    totalQ: TASTE_QUESTIONS,
                    qids: await pickQuestionsForRoom(Object.assign({}, game, { totalQ: TASTE_QUESTIONS })),
                };
            }

            return {
                state: updateState(GameState.RoundIntro),
                qids: await pickQuestionsForRoom(game),
            };

        case GameState.RoundIntro:
            if (taste) {
                return tasteQuestion(pin, game, game.questionIndex);
            }

            return {
                state: updateState(GameState.ShowQuestion),
                currentQ: await populateQuestion(game, game.questionIndex),
                ideas: await ideasFor(game, game.questionIndex),
                answers: {},
                answerSelections: {},
                revealAnswers: null,
            };

        case GameState.ShowQuestion:
            return {
                state: updateState(GameState.ShowAnswers),
                answers: await populateQuestionAnswers(pin, game),
            };

        case GameState.ShowAnswers:
            const { answers, answerSelections, revealAnswers } = scoreAnswers(pin, game);

            return {
                state: updateState(GameState.RevealTheTruth),
                // Which seats have sent a lie or a pick so far: the others are not waited for (seats.ts).
                ...playedUpdate(game),
                answers,
                // Only the picks that count are kept: see scoring.ts.
                answerSelections,
                revealAnswers,
                revealDone: null,
                // Kept for the final screen: each player's lie that fooled the most players.
                highlights: addHighlights(game.highlights, revealAnswers, typeof game.currentQ === 'string' ? game.currentQ : undefined),
                highlightsFrom: highlightsStart(game.highlightsFrom, game.questionIndex),
            };

        case GameState.RevealTheTruth:
            return {
                state: updateState(GameState.ScoreBoard),
                players: playersScore(pin, game),
            };

        case GameState.ScoreBoard:
            return handleScoreBoardState(game, pin);
    }
}

function updateState(stateId: number): GameStateInfo {
    return { id: stateId, timestamp: Date.now() };
}

function updateGame(pin: string, update: Partial<GameScheme>) {
    // Returned so the caller waits for the write before finishing.
    return gamesRef.child(pin).update(update);
}

async function populateQuestion(game: GameScheme, qidx: number) {
    const qid = game.qids[qidx];
    const question = await getQuestion(qid);

    try {
        await markQuestionSeen(qid, playerUids(game));
    } catch (e) {
        console.error(`Failed to save seen question ${qid}`, e);
    }

    return question.questionText;
}

/**
 * The round-1 lie helper: ready-made lies for each player, for the question at `qidx`.
 * Only in round 1 of a coach game; null everywhere else, which also clears the last question's.
 */
async function ideasFor(game: GameScheme, qidx: number) {
    if (!game.coach || (game.roundIndex || 0) !== 0) {
        return null;
    }

    try {
        const question = await getQuestion(game.qids[qidx]);
        const ideas = pickIdeas(cleanHouseLies(question.id, question.fakeAnswers), question.realAnswer, Object.keys(game.players || {}));
        return Object.keys(ideas).length ? ideas : null;
    } catch (e) {
        // The game goes on without the helper.
        console.error('Failed to pick lie ideas', e);
        return null;
    }
}

/**
 * Questions are re-picked when the game starts, because only now do we know
 * who is in the room. Questions anyone here has already seen are avoided.
 * On any failure we keep the questions picked when the game was created.
 */
async function pickQuestionsForRoom(game: GameScheme) {
    try {
        const qids = await randomQuestions(game.locale, game.totalQ, playerUids(game), game.pack);
        return qids.length ? qids : game.qids;
    } catch (e) {
        console.error('Failed to pick questions for room, keeping original ones', e);
        return game.qids;
    }
}

function playerUids(game: GameScheme): string[] {
    return Object.keys(game.players || {}).map(k => game.players[k].uid);
}

async function populateQuestionAnswers(pin: string, game: GameScheme) {
    const playerAnswers = game.answers;
    const fakeAnswers = await populateFakeAnswers(pin, game);
    const realAnswer = await getRealAnswer(game);
    const answers = Object.assign({}, playerAnswers, fakeAnswers, realAnswer);
    return answers;
}

async function populateFakeAnswers(pin: string, game: GameScheme) {
    const question = await getQuestion(game.qids[game.questionIndex]);
    const playerAnswers = Object.keys(game.answers || {}).map(k => game.answers[k].text);
    const playersCount = Object.keys(game.players || {}).length;
    const fakeAnswers = pickHouseLies(cleanHouseLies(question.id, question.fakeAnswers), playerAnswers, question.realAnswer, playersCount);
    const res: Answers = {};

    fakeAnswers.forEach(text => {
        const key = gamesRef.child(pin).child('answers').push().key;
        res[key] = { text, houseLie: true, realAnswer: false };
    });

    return res;
}

/**
 * A taste's question: nothing is written, so the game goes straight to the answers, the truth among
 * the house lies. Nobody reads the old picks here: the picks node is emptied with the same write.
 */
async function tasteQuestion(pin: string, game: GameScheme, qidx: number): Promise<Partial<GameScheme>> {
    const question = await getQuestion(game.qids[qidx]);
    const answers: Answers = {
        truth: { text: question.realAnswer, houseLie: false, realAnswer: true },
    };

    tasteHouseLies(cleanHouseLies(question.id, question.fakeAnswers), question.realAnswer).forEach(text => {
        answers[gamesRef.child(pin).child('answers').push().key] = { text, houseLie: true, realAnswer: false };
    });

    return {
        state: updateState(GameState.ShowAnswers),
        currentQ: await populateQuestion(game, qidx),
        ideas: null,
        answers,
        answerSelections: {},
        revealAnswers: null,
    };
}

async function getRealAnswer(game: GameScheme) {
    const question = await getQuestion(game.qids[game.questionIndex]);
    const text = question.realAnswer;
    const realAnswer: Answers = {
        truth: { text, houseLie: false, realAnswer: true }
    };
    return realAnswer;
}

/**
 * Picking has closed: points and reveal rows. Whatever the picks node holds, the game goes on:
 * if the points cannot be worked out, the question is revealed as if nobody had picked.
 */
function scoreAnswers(pin: string, game: GameScheme) {
    try {
        return scoring.scoreQuestion(game);
    } catch (e) {
        console.error(`[PIN: ${pin}] Failed to score the picks, revealing without them`, e);
        return scoring.scoreQuestion(Object.assign({}, game, { answerSelections: null }));
    }
}

/** The reveal is over: the players with this question's points. If that fails, the scores stay as they were. */
function playersScore(pin: string, game: GameScheme) {
    try {
        return scoring.addQuestionScores(game);
    } catch (e) {
        console.error(`[PIN: ${pin}] Failed to add up the scores, keeping them as they were`, e);
        return game.players;
    }
}

async function handleScoreBoardState(game: GameScheme, pin: string) {
    const gameOver = game.questionIndex === game.totalQ - 1;
    const lastRound = game.questionIndex === game.totalQ - 2;
    const secondRound = game.questionIndex === Math.floor(game.totalQ / 2) - 1;
    let res;

    // question_results measures the round-1 helper; it counts only players' picks. It is awaited (a function may stop once it returns),
    // alongside the history write; a BigQuery failure is logged and never fails the game.
    await Promise.all([
        saveQuestionHistory(game, pin),
        onQuestionResult(questionResult(pin, Object.assign({}, game, { answerSelections: scoring.playerPicks(game) }))).catch(e => console.error('onQuestionResult failed', pin, e && e.message)),
    ]);

    if (secondRound || lastRound) {
        res = {
            state: updateState(GameState.RoundIntro),
            roundIndex: game.roundIndex + 1,
            questionIndex: game.questionIndex + 1,
            ideas: null,
        };
    } else if (gameOver) {
        res = {
            state: updateState(GameState.ScoreBoardFinal),
            currentQ: {},
            answers: {},
            answerSelections: {},
            revealAnswers: null,
            ideas: null,
        };
    } else if (gameTaste(game)) {
        res = Object.assign({ questionIndex: game.questionIndex + 1 }, await tasteQuestion(pin, game, game.questionIndex + 1));
    } else {
        res = {
            state: updateState(GameState.ShowQuestion),
            questionIndex: game.questionIndex + 1,
            currentQ: await populateQuestion(game, game.questionIndex + 1),
            ideas: await ideasFor(game, game.questionIndex + 1),
            answers: {},
            answerSelections: {},
            revealAnswers: null,
        };
    }

    return res;
}

function saveQuestionHistory(game: GameScheme, pin: string) {
    return qHistoryRef.push({
        pin,
        q: game.currentQ,
        a: game.revealAnswers,
        timestamp: Date.now(),
    });
}
