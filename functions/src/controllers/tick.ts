import { getQuestion, randomQuestions, markQuestionSeen } from './questions';
import { GameScheme, Answer, Answers, GameState, GameStateInfo, RevealAnswer, GamePlayer, addHighlights, highlightsStart } from '../game-model';
import { get, gamesRef, qHistoryRef } from '../firebase';
import { tickAllowed, stateKey, withDeadline } from './phase';
import { pickHouseLies } from './answer-options';
import { houseLiePoints } from './house-lie';
import { cleanHouseLies } from './house-lie-cleanup';
import { pickIdeas, questionResult } from './lie-helper';
import { onQuestionResult } from './analytics';
import { isSamePick } from './same-pick';

const pointsForCorrectAnswer = [1000, 1500, 2000];
const pointsForBullshitting = [500, 750, 1000];

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
export async function advance(pin: string, from: GameStateInfo) {
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
    const update = await nextUpdate(pin, game);

    if (!update) {
        return;
    }

    if (update.state) {
        update.state = withDeadline(update.state, Object.assign({}, game, update));
    }

    return updateGame(pin, update);
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
            const { answers, answerSelections } = calcAnswersScore(game);
            const revealAnswers = generateRevealAnswers(game);

            return {
                state: updateState(GameState.RevealTheTruth),
                answers,
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
                players: calcPlayersScore(game),
            };

        case GameState.ScoreBoard:
            return handleScoreBoardState(game, pin);
    }
}

function updateState(stateId: number): GameStateInfo {
    return { id: stateId, timestamp: Date.now() };
}

function updateGame(pin: string, update: Partial<GameScheme>) {
    // Return the write so the function waits for it before finishing.
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

function calcAnswersScore(game: GameScheme) {
    const answers = Object.keys(game.answers || {}).map(k => Object.assign({}, { pid: k }, game.answers[k]));
    const answerSelections = Object.keys(game.answerSelections || {}).map(k => Object.assign({}, { pid: k }, game.answerSelections[k]));

    answerSelections.forEach(answerSelection => {
        const relatedAnswers = answers.filter(answer => isSamePick(answer.text, answerSelection.text));

        if (relatedAnswers.length === 1 && relatedAnswers[0].realAnswer) {
            game.answerSelections[answerSelection.pid].score = pointsForCorrectAnswer[game.roundIndex];
        } else if (relatedAnswers.length === 1 && relatedAnswers[0].houseLie) {
            // Set below, once every player's points for their own lie are known.
            game.answerSelections[answerSelection.pid].score = 0;
        } else {
            game.answerSelections[answerSelection.pid].score = 0;
            relatedAnswers.forEach(answer => {
                if (!game.answers[answer.pid].score) {
                    game.answers[answer.pid].score = 0;
                }

                game.answers[answer.pid].score += pointsForBullshitting[game.roundIndex]
            });
        }
    });

    // A house lie only takes back points the player has: it never pushes a score below zero.
    answerSelections.forEach(answerSelection => {
        const relatedAnswers = answers.filter(answer => isSamePick(answer.text, answerSelection.text));

        if (relatedAnswers.length === 1 && relatedAnswers[0].houseLie) {
            const player = (game.players || {})[answerSelection.pid];
            const ownLie = (game.answers || {})[answerSelection.pid];
            game.answerSelections[answerSelection.pid].score = houseLiePoints(
                game.roundIndex,
                player ? player.score : 0,
                ownLie && !ownLie.realAnswer && !ownLie.houseLie ? ownLie.score || 0 : 0,
            );
        }
    });

    return { answers: game.answers || {}, answerSelections: game.answerSelections || {} };
}

function generateRevealAnswers(game: GameScheme) {
    const playersArray = Object.keys(game.players || {}).map(k => Object.assign({}, { pid: k }, game.players[k]));
    const answersArray = Object.keys(game.answers || {}).map(k => Object.assign({}, { pid: k }, game.answers[k]));
    const answerSelectionsArray = Object.keys(game.answerSelections || {}).map(k => Object.assign({}, { pid: k }, game.answerSelections[k]));
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

function calcPlayersScore(game: GameScheme) {
    const answers = Object.keys(game.answers || {}).map(k => Object.assign({}, { pid: k }, game.answers[k]));
    const answerSelections = Object.keys(game.answerSelections || {}).map(k => Object.assign({}, { pid: k }, game.answerSelections[k]));

    answers.forEach(answer => {
        if (!answer.realAnswer && !answer.houseLie) {
            game.players[answer.pid].score += answer.score || 0;
        }
    })

    answerSelections.forEach(answerSelection => {
        game.players[answerSelection.pid].score += answerSelection.score || 0;
    })

    return game.players;
}

async function handleScoreBoardState(game: GameScheme, pin: string) {
    const gameOver = game.questionIndex === game.totalQ - 1;
    const lastRound = game.questionIndex === game.totalQ - 2;
    const secondRound = game.questionIndex === Math.floor(game.totalQ / 2) - 1;
    let res;

    // question_results measures the round-1 helper. It is awaited (a function may stop once it returns),
    // alongside the history write; a BigQuery failure is logged and never fails the game.
    await Promise.all([
        saveQuestionHistory(game, pin),
        onQuestionResult(questionResult(pin, game)).catch(e => console.error('onQuestionResult failed', pin, e && e.message)),
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
