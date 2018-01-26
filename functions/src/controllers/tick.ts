import { getQuestion } from './questions';
import { GameScheme, Answer, Answers, GameState, RevealAnswer, GamePlayer } from '../game-model';
import { get, gamesRef, qHistoryRef } from '../firebase';

const pointsForCorrectAnswer = [1000, 1500, 2000];
const pointsForBullshitting = [500, 750, 1000];
const pointsForHouseLie = [-500, -750, -1000];

export async function tick(pin) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));

    if (game.tick === game.state.id) {
        console.log(`[PIN: ${pin}] Game state equal to tick`);
        return Promise.resolve();
    }

    console.log(`[PIN: ${pin}] Current game state: ${game.state.id}`);

    switch (game.state.id) {
        case GameState.GameStaging:
            return updateGame(pin, { state: updateState(GameState.RoundIntro) });

        case GameState.RoundIntro:
            return updateGame(pin, {
                state: updateState(GameState.ShowQuestion),
                currentQ: await populateQuestion(game, game.questionIndex),
                answers: {},
                answerSelections: {},
                revealAnswers: null,
            });

        case GameState.ShowQuestion:
            return updateGame(pin, {
                state: updateState(GameState.ShowAnswers),
                answers: await populateQuestionAnswers(pin, game),
            });

        case GameState.ShowAnswers:
            const { answers, answerSelections } = calcAnswersScore(game);
            const revealAnswers = generateRevealAnswers(game);

            return updateGame(pin, {
                state: updateState(GameState.RevealTheTruth),
                answers,
                answerSelections,
                revealAnswers,
            });

        case GameState.RevealTheTruth:
            return updateGame(pin, {
                state: updateState(GameState.ScoreBoard),
                players: calcPlayersScore(game),
            });

        case GameState.ScoreBoard:
            return updateGame(pin, await handleScoreBoardState(game, pin));
    }
}

function updateState(stateId: number) {
    return { id: stateId, timestamp: Date.now() };
}

function updateGame(pin: string, update: Partial<GameScheme>) {
    gamesRef.child(pin).update(update);
}

function populateQuestion(game: GameScheme, qidx: number) {
    return getQuestion(game.qids[qidx]).then(q => q.questionText);
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
    const allFakeAnswers = question.fakeAnswers;
    const playerAnswers = Object.keys(game.answers || {}).map(k => game.answers[k].text);
    const uniqueAnswersCount = Array.from(new Set(playerAnswers)).length;
    const playersCount = Object.keys(game.players).length;
    const fakeAnswers = allFakeAnswers.slice(0, playersCount - uniqueAnswersCount);
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
