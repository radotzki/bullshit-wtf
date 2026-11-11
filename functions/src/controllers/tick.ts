import { getQuestion, randomQuestions, markQuestionSeen } from './questions';
import { GameScheme, Answers, GameState, GameStateInfo, addHighlights, highlightsStart } from '../game-model';
import { get, gamesRef, qHistoryRef } from '../firebase';
import { tickAllowed, stateKey, withDeadline, endsAtOnce } from './phase';
import { pickHouseLies } from './answer-options';
import { cleanHouseLies } from './house-lie-cleanup';
import { pickIdeas, questionResult } from './lie-helper';
import { onQuestionResult } from './analytics';
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
 */
export async function advance(pin: string, from: GameStateInfo, retryAfter = leaveRetryDelay) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));

    if (!game || !game.state || stateKey(game.state) !== stateKey(from)) {
        console.log(`[PIN: ${pin}] State already moved on from ${stateKey(from)}`);
        return;
    }

    if (!(await claim(pin, stateKey(from)))) {
        console.log(`[PIN: ${pin}] Another caller is advancing from ${stateKey(from)}`);
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
            current => current === key ? null : undefined,
            (error, committed) => error ? reject(error) : resolve(committed),
            false,
        );
    });
}

async function nextUpdate(pin: string, game: GameScheme): Promise<Partial<GameScheme> | undefined> {
    switch (game.state.id) {
        case GameState.GameStaging:
            return {
                state: updateState(GameState.RoundIntro),
                qids: await pickQuestionsForRoom(game),
            };

        case GameState.RoundIntro:
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
