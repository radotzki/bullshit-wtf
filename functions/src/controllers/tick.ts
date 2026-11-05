import { getQuestion, randomQuestions, markQuestionSeen } from './questions';
import { GameScheme, Answer, Answers, GameState, GameStateInfo, RevealAnswer, GamePlayer } from '../game-model';
import { get, gamesRef, qHistoryRef } from '../firebase';
import { tickAllowed, stateKey, withDeadline } from './phase';
import { pickHouseLies } from './answer-options';

const pointsForCorrectAnswer = [1000, 1500, 2000];
const pointsForBullshitting = [500, 750, 1000];
const pointsForHouseLie = [-500, -750, -1000];

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
 * Questions are re-picked when the game starts, because only now do we know
 * who is in the room. Questions anyone here has already seen are avoided.
 * On any failure we keep the questions picked when the game was created.
 */
async function pickQuestionsForRoom(game: GameScheme) {
    try {
        const qids = await randomQuestions(game.locale, game.totalQ, playerUids(game));
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
    const fakeAnswers = pickHouseLies(question.fakeAnswers, playerAnswers, question.realAnswer, playersCount);
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
        const relatedAnswers = answers.filter(answer => answer.text === answerSelection.text);

        if (relatedAnswers.length === 1 && relatedAnswers[0].realAnswer) {
            game.answerSelections[answerSelection.pid].score = pointsForCorrectAnswer[game.roundIndex];
        } else if (relatedAnswers.length === 1 && relatedAnswers[0].houseLie) {
            game.answerSelections[answerSelection.pid].score = pointsForHouseLie[game.roundIndex];
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

    return { answers: game.answers || {}, answerSelections: game.answerSelections || {} };
}

function generateRevealAnswers(game: GameScheme) {
    const playersArray = Object.keys(game.players || {}).map(k => Object.assign({}, { pid: k }, game.players[k]));
    const answersArray = Object.keys(game.answers || {}).map(k => Object.assign({}, { pid: k }, game.answers[k]));
    const answerSelectionsArray = Object.keys(game.answerSelections || {}).map(k => Object.assign({}, { pid: k }, game.answerSelections[k]));
    const revealAnswers: RevealAnswer[] = [];

    answersArray.forEach(answer => {
        const answerSelection = answerSelectionsArray.filter(a => a.text === answer.text);
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

        if ((answer.realAnswer || answer.houseLie) && answerSelection[0]) {
            points = answerSelection[0].score;
        } else {
            points = answer.score || 0;
        }

        revealAnswers.push({ creators, selectors, points, text, realAnswer, houseLie });
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

    await saveQuestionHistory(game, pin);

    if (secondRound || lastRound) {
        res = {
            state: updateState(GameState.RoundIntro),
            roundIndex: game.roundIndex + 1,
            questionIndex: game.questionIndex + 1,
        };
    } else if (gameOver) {
        res = {
            state: updateState(GameState.ScoreBoardFinal),
            currentQ: {},
            answers: {},
            answerSelections: {},
            revealAnswers: null,
        };
    } else {
        res = {
            state: updateState(GameState.ShowQuestion),
            questionIndex: game.questionIndex + 1,
            currentQ: await populateQuestion(game, game.questionIndex + 1),
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
