import { questionFor, randomQuestions, markQuestionSeen, seenRecordsFor } from './questions';
import { GameScheme, Answers, GameState, GameStateInfo, addHighlights, addLaughs, highlightsStart, aboutOf, sentMark, isOwnId, ownOf } from '../game-model';
import { get, gamesRef, qHistoryRef, questionsRef } from '../firebase';
import { readGame, isMoved } from './old-games';
import { tickAllowed, stateKey, withDeadline, endsAtOnce } from './phase';
import { pickHouseLies } from './answer-options';
import { cleanHouseLies } from './house-lie-cleanup';
import { pickIdeas, questionResult } from './lie-helper';
import { onQuestionResult } from './analytics';
import { playedUpdate, lastSentSeats } from './seats';
import { gameTaste, newTaste, nextTaste, startsAsTaste, tasteHouseLies, withTaste } from './taste';
import { TASTE_QUESTIONS } from '../game-model';
import * as scoring from './scoring';
import {
    ABOUT_SEEN_PREFIX, aboutAnswers, aboutColumns, aboutQuestionText, carryAbout, clearAboutPlaces, nameFor, planAbout, plannedSlot,
    playsAboutUs, slotKey, truthOf, withAbout, withAboutMissed,
} from './about';
import { withNextWeek } from './next-week';
import { drawPair, pairDecoys } from './pair';
import { carryOwn, hostSeat, ownIds, placeOwnQuestions, qidList, withOwn } from './own-questions';

// How long a run waits before its second try at leaving a phase of no length.
const leaveRetryDelay = 1000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/** A client wrote games/{pin}/tick: move on if that tick is valid for the current phase. */
export async function tick(pin) {
    pin = pin.toUpperCase();
    const game = await readGame(pin);

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
    let game = await readGame(pin);

    if (isMoved(game)) {
        // An old game whose private parts were moved (see old-games.ts) plays no more.
        console.log(`[PIN: ${pin}] Old game, not moved on`);
        return;
    }

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
    game = await readGame(pin);

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

    // An About question's `about` stays on its states up to the next question (see about.ts).
    if (update && update.state) {
        update.state = carryAbout(game.state, update.state, update);
        // So does an own question's `own` (see own-questions.ts).
        update.state = carryOwn(game.state, update.state, update);
    }

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

            const qids = await pickQuestionsForRoom(game);
            const aboutPlan = await aboutPlanFor(game, taste);
            return Object.assign({
                state: updateState(GameState.RoundIntro),
                qids: await withOwnQuestions(game, await packClearOfAbout(game, qids, aboutPlan.aboutQs)),
            }, aboutPlan, await pairFor(pin, game));

        case GameState.RoundIntro:
            if (taste) {
                return tasteQuestion(pin, game, game.questionIndex);
            }

            return questionStep(game, game.questionIndex);

        case GameState.ShowQuestion:
            if (aboutOf(game.state)) {
                return aboutAnswersStep(pin, game);
            }

            const answersState = updateState(GameState.ShowAnswers);
            const ownHostSeat = ownOf(game.state) ? ownOf(game.state).pid : '';
            return {
                state: answersState,
                // An own question: its host knows the truth and does not pick, so their seat is done (own-questions.ts).
                ...(ownHostSeat && game.players && game.players[ownHostSeat] ? { [`players/${ownHostSeat}/sent`]: sentMark(answersState) } : {}),
                answers: await populateQuestionAnswers(pin, game),
                // Picks open empty: a pick that landed while the lies were written was made in an
                // earlier question, by a phone that was offline then (see pickIsFor).
                answerSelections: {},
                // A pair game's decoy choices are in the answers now (see pair.ts).
                decoys: null,
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
    const question = await questionFor(game, qidx);

    try {
        await markQuestionSeen(qid, playerUids(game));
    } catch (e) {
        console.error(`Failed to save seen question ${qid}`, e);
    }

    return question.questionText;
}

/**
 * The round-1 lie helper: ready-made lies for each player, for the question at `qidx`.
 * Only in round 1 of a coach game, and on every question of a pair game, where the same lies are the
 * player's decoy offers (see pair.ts); null everywhere else, which also clears the last question's.
 */
async function ideasFor(game: GameScheme, qidx: number) {
    if (game.pair !== true && (!game.coach || (game.roundIndex || 0) !== 0)) {
        return null;
    }

    // An own question has no ready-made lies: its two wrong answers are the host's house lies.
    if (isOwnId(game.qids[qidx])) {
        return null;
    }

    try {
        const question = await questionFor(game, qidx);
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
    const question = await questionFor(game, game.questionIndex);
    // An own question offers no decoys (they come from the bank's lies): its wrong answers are on the table.
    const decoys = game.pair === true && !isOwnId(game.qids[game.questionIndex]) ? pairDecoys(game, question.realAnswer, () => gamesRef.child(pin).child('answers').push().key) : null;
    if (decoys) {
        return decoys;
    }

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
 * At START, a game with two players gets its half of the "Pick a decoy" test (see pair.ts). A Replay
 * keeps its parent's half while it still has two players. Nothing to write for any other game.
 */
async function pairFor(pin: string, game: GameScheme): Promise<Partial<GameScheme>> {
    const count = Object.keys(game.players || {}).filter(k => !!game.players[k]).length;
    if (count !== 2) {
        return {};
    }
    let parentPair: boolean | null = null;
    if (game.parent) {
        parentPair = await get<boolean>(gamesRef.child(String(game.parent).toUpperCase()).child('pair'))
            .catch(e => { console.error(`[PIN: ${pin}] parent's pair not read`, e && e.message); return null; });
    }
    const pair = drawPair(count, pin, parentPair);
    return pair === undefined ? {} : { pair };
}

/**
 * A taste's question: nothing is written, so the game goes straight to the answers, the truth among
 * the house lies. Nobody reads the old picks here: the picks node is emptied with the same write.
 */
async function tasteQuestion(pin: string, game: GameScheme, qidx: number): Promise<Partial<GameScheme>> {
    const question = await questionFor(game, qidx);
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
    const question = await questionFor(game, game.questionIndex);
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

/**
 * The scoreboard of question 1 of a game nobody plays: no seat sent a lie or a pick (`played`, kept when
 * the picks closed, see seats.ts). Not a taste (one player, five pick-only questions of its own), and
 * not a game of one question, which ends here anyway. A game that was running at this release has no
 * playedFrom and plays on as before.
 */
export function nobodyPlayed(game: GameScheme): boolean {
    if (!game || (game.questionIndex || 0) !== 0 || game.playedFrom !== 0 || (game.totalQ || 0) <= 1 || gameTaste(game)) {
        return false;
    }
    const played = game.played || {};
    return !Object.keys(played).some(pid => played[pid] === true);
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
        onQuestionResult(Object.assign(questionResult(pin, Object.assign({}, game, { answerSelections: scoring.playerPicks(game) })),
            aboutColumns(game))).catch(e => console.error('onQuestionResult failed', pin, e && e.message)),
    ]);

    if (nobodyPlayed(game)) {
        // Nobody sent a lie or a pick in question 1: the phones were put down (or never picked up).
        // The game ends here, with Replay, and is not counted as played (analytics.ts onStateChange).
        console.log(`[PIN: ${pin}] Nobody played question 1: the game ends`);
        res = {
            state: withNextWeek(updateState(GameState.ScoreBoardFinal), pin, game),
            idle: true,
            lastSent: lastSentSeats(game),
            currentQ: {},
            answers: {},
            answerSelections: {},
            revealAnswers: null,
            ideas: null,
            aboutTruth: null,
        };
    } else if (secondRound || lastRound) {
        res = {
            state: updateState(GameState.RoundIntro),
            roundIndex: game.roundIndex + 1,
            questionIndex: game.questionIndex + 1,
            ideas: null,
        };
    } else if (gameOver) {
        res = {
            // In the "Same time next week?" test, the final state says which half (next-week.ts).
            state: withNextWeek(updateState(GameState.ScoreBoardFinal), pin, game),
            // Who is still at the table, for a Replay (fork.ts seatsForReplay).
            lastSent: lastSentSeats(game),
            currentQ: {},
            answers: {},
            answerSelections: {},
            revealAnswers: null,
            ideas: null,
            aboutTruth: null,
        };
    } else if (gameTaste(game)) {
        res = Object.assign({ questionIndex: game.questionIndex + 1 }, await tasteQuestion(pin, game, game.questionIndex + 1));
    } else {
        res = Object.assign({ questionIndex: game.questionIndex + 1 }, await questionStep(game, game.questionIndex + 1));
    }

    // An About question's truth is not kept past its question (see about.ts).
    if (game.aboutTruth) {
        res.aboutTruth = null;
    }

    // The question is over and its laughs are in: each writer keeps their most laughed-at lie, for the
    // final screen (see addLaughs). Written only when some lie got a laugh.
    const laughed = addLaughs(game.highlights, game.revealAnswers, typeof game.currentQ === 'string' ? game.currentQ : undefined,
        game.questionIndex);
    if (laughed !== game.highlights) {
        res.highlights = laughed;
    }

    return res;
}

function saveQuestionHistory(game: GameScheme, pin: string) {
    // An About question's answers are about a player of the game, and one is their own: not kept.
    const about = aboutOf(game.state);
    if (about) {
        return qHistoryRef.push({ pin, about: about.prompt, timestamp: Date.now() });
    }
    // An own question is the table's alone: not kept either.
    if (ownOf(game.state)) {
        return qHistoryRef.push({ pin, own: true, timestamp: Date.now() });
    }
    return qHistoryRef.push({
        pin,
        q: game.currentQ,
        a: game.revealAnswers,
        timestamp: Date.now(),
    });
}

/**
 * The writing step of question `qidx`: an About question when one is planned there and enough players
 * are playing (see about.ts), else the bank question, as before. Starts with no lies and no truth.
 */
async function questionStep(game: GameScheme, qidx: number): Promise<Partial<GameScheme>> {
    const slot = plannedSlot(game, qidx);
    if (slot) {
        const pid = nameFor(game);
        if (pid) {
            try {
                await markQuestionSeen(ABOUT_SEEN_PREFIX + slot.prompt, playerUids(game));
            } catch (e) {
                console.error(`Failed to save seen About question ${slot.prompt}`, e);
            }
            const key = slotKey(qidx);
            return {
                state: withAbout(updateState(GameState.ShowQuestion), { pid, prompt: slot.prompt }),
                currentQ: aboutQuestionText(slot.prompt, game.locale, game.players[pid].nickname),
                ideas: null,
                answers: {},
                answerSelections: {},
                revealAnswers: null,
                aboutTruth: null,
                [`aboutQs/${key}/pid`]: pid,
                [`aboutQs/${key}/result`]: 'asked',
            } as Partial<GameScheme>;
        }
        return Object.assign(await bankQuestionStep(game, qidx), { [`aboutQs/${slotKey(qidx)}/result`]: 'skipped' });
    }
    return bankQuestionStep(game, qidx);
}

async function bankQuestionStep(game: GameScheme, qidx: number): Promise<Partial<GameScheme>> {
    const state = updateState(GameState.ShowQuestion);
    return {
        // The host's own question says so on every screen, from its writing to its scoreboard (own-questions.ts).
        state: isOwnId(game.qids[qidx]) ? withOwn(state, hostSeat(game)) : state,
        currentQ: await populateQuestion(game, qidx),
        ideas: await ideasFor(game, qidx),
        answers: {},
        answerSelections: {},
        revealAnswers: null,
        aboutTruth: null,
        // A pair game's decoy choices start empty with every question (see pair.ts).
        decoys: null,
    };
}

/**
 * The writing of an About question is over. With the named player's truth: the answers, with the truth
 * among them, and that player marked as done on the waiting row (they do not pick). Without it: the bank
 * question planned for this place, with its own full time to write (the lies about the player are dropped),
 * its state naming the player who sent nothing (withAboutMissed), so every screen says why it changed.
 */
async function aboutAnswersStep(pin: string, game: GameScheme): Promise<Partial<GameScheme>> {
    const about = aboutOf(game.state);
    const truth = truthOf(game);
    const key = slotKey(game.questionIndex);

    if (!truth) {
        console.log(`[PIN: ${pin}] About question ${about.prompt} got no truth in time: the bank question instead`);
        const step = await bankQuestionStep(game, game.questionIndex);
        return Object.assign(step, {
            state: withAboutMissed(step.state as GameStateInfo, about.pid),
            [`aboutQs/${key}/result`]: 'fallback',
        });
    }

    const state = updateState(GameState.ShowAnswers);
    const answers = aboutAnswers(game, truth, about.prompt, () => gamesRef.child(pin).child('answers').push().key);
    return {
        state,
        answers,
        answerSelections: {},
        [`aboutQs/${key}/result`]: 'played',
        [`players/${truth.pid}/sent`]: sentMark(state),
    } as Partial<GameScheme>;
}

/**
 * At START, in a pack game that plays About questions: the questions reordered so that every pack question
 * is played (see clearAboutPlaces). On any failure the order is kept, as before.
 */
async function packClearOfAbout(game: GameScheme, qids: any, aboutQs: GameScheme['aboutQs']): Promise<any> {
    if (!game.pack || !aboutQs || !qids || typeof qids !== 'object') {
        return qids;
    }
    try {
        const list: string[] = Array.isArray(qids) ? qids : Object.keys(qids).sort((a, b) => +a - +b).map(k => qids[k]);
        const places = Object.keys(aboutQs).map(k => Number(k.slice(1))).filter(n => Number.isInteger(n));
        const questions = await Promise.all(list.map(qid => qid ? get<any>(questionsRef.child(qid)) : Promise.resolve(null)));
        const pack = new Set(list.filter((qid, i) => !!questions[i] && questions[i].pack === game.pack));
        if (!places.some(place => pack.has(list[place]))) {
            return qids;
        }
        return clearAboutPlaces(list, places, qid => pack.has(qid));
    } catch (e) {
        console.error('Failed to keep the pack questions clear of the About questions', e);
        return qids;
    }
}

/**
 * At START: the host's own questions on their places (see own-questions.ts), a pack game's pack questions
 * moved off those places first. A game without own questions keeps its ids as they are. On any failure
 * reading the pack, the own questions are still placed.
 */
async function withOwnQuestions(game: GameScheme, qids: any): Promise<any> {
    const own = ownIds(game);
    if (!own.length) {
        return qids;
    }
    const list = qidList(qids);
    let pack = new Set<string>();
    if (game.pack) {
        try {
            const questions = await Promise.all(list.map(qid => qid && !isOwnId(qid) ? get<any>(questionsRef.child(qid)) : Promise.resolve(null)));
            pack = new Set(list.filter((qid, i) => !!questions[i] && questions[i].pack === game.pack));
        } catch (e) {
            console.error('Failed to read the pack questions before placing the own questions', e);
        }
    }
    return placeOwnQuestions(list, own, game.totalQ, qid => pack.has(qid));
}

/** At START: the About questions of a game that plays them (see about.ts), or nothing to write. */
async function aboutPlanFor(game: GameScheme, taste: boolean): Promise<Partial<GameScheme>> {
    if (!playsAboutUs(game, taste)) {
        return {};
    }
    try {
        const plan = planAbout(game.totalQ, await seenRecordsFor(playerUids(game)));
        return Object.keys(plan).length ? { aboutQs: plan } : {};
    } catch (e) {
        // The game goes on with bank questions only.
        console.error('Failed to plan the About questions', e);
        return {};
    }
}
