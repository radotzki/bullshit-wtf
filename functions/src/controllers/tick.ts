import { getQuestion } from './questions';
import { GameScheme, Answer, Answers, GameState } from '../game-model';
import { get, gamesRef } from '../firebase';

const pointsForCorrectAnswer = [1000, 1500, 2000];
const pointsForBullshitting = [800, 1200, 2500];
const pointsForHouseLie = [-800, -1200, -2500];

export async function tick(pin) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));

    if (game.tick === game.state.id) {
        console.error('Game tick = game state');
        return Promise.resolve();
    }

    switch (game.state.id) {
        case GameState.GameStaging:
            return updateGame(pin, { state: updateState(GameState.RoundIntro) });

        case GameState.RoundIntro:
            return updateGame(pin, {
                state: updateState(GameState.ShowQuestion),
                currentQ: populateQuestion(game, game.questionIndex),
                answers: {},
                answerSelections: {},
            });

        case GameState.ShowQuestion:
            return updateGame(pin, {
                state: updateState(GameState.ShowAnswers),
                answers: populateQuestionAnswers(pin, game),
            });

        case GameState.ShowAnswers:
            const { answers, answerSelections } = calcAnswersScore(game);

            return updateGame(pin, {
                state: updateState(GameState.RevealTheTruth),
                answers,
                answerSelections,
            });

        case GameState.RevealTheTruth:
            return updateGame(pin, {
                state: updateState(GameState.ScoreBoard),
                players: calcPlayersScore(game),
            });

        case GameState.ScoreBoard:
            return updateGame(pin, await handleScoreBoardState(game));
    }
}

function updateState(stateId: number) {
    return { id: stateId, timestamp: Date.now() };
}

function updateGame(pin: string, update: Partial<GameScheme>) {
    gamesRef.child(pin).update(update);
}

function populateQuestion(game: GameScheme, qidx: number) {
    return getQuestion(game.qids[qidx]).questionText;
}

function populateQuestionAnswers(pin: string, game: GameScheme) {
    const playerAnswers = game.answers;
    const fakeAnswers = populateFakeAnswers(pin, game);
    const realAnswer = getRealAnswer(game);
    const answers = Object.assign({}, playerAnswers, fakeAnswers, realAnswer);
    return answers;
}

function populateFakeAnswers(pin: string, game: GameScheme) {
    const allFakeAnswers = getQuestion(game.qids[game.questionIndex]).fakeAnswers;
    const playerAnswers = Object.keys(game.answers).map(k => game.answers[k].text);
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

function getRealAnswer(game: GameScheme) {
    const text = getQuestion(game.qids[game.questionIndex]).realAnswer;
    const realAnswer: Answers = {
        truth: { text, houseLie: false, realAnswer: true }
    };
    return realAnswer;
}

function calcAnswersScore(game: GameScheme) {
    const answers = Object.keys(game.answers).map(k => Object.assign({}, { pid: k }, game.answers[k]));
    const answerSelections = Object.keys(game.answerSelections).map(k => Object.assign({}, { pid: k }, game.answerSelections[k]));

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

    return { answers: game.answers, answerSelections: game.answerSelections };
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

async function handleScoreBoardState(game: GameScheme) {
    const gameOver = game.questionIndex === game.totalQ - 1;
    console.log('gameOver', gameOver);
    const lastRound = game.questionIndex === game.totalQ - 2;
    console.log('lastRound', lastRound);
    const secondRound = game.questionIndex === Math.floor(game.totalQ / 2);
    console.log('secondRound', secondRound);
    let res;

    if (secondRound || lastRound) {
        res = {
            state: updateState(GameState.RoundIntro),
            roundIndex: game.roundIndex + 1,
            questionIndex: game.questionIndex + 1,
        };
    } else if (gameOver) {
        res = {
            state: updateState(GameState.ScoreBoardFinal),
        };
    } else {
        res = {
            state: updateState(GameState.ShowQuestion),
            questionIndex: game.questionIndex + 1,
            currentQ: populateQuestion(game, game.questionIndex + 1),
            answers: {},
            answerSelections: {},
        };
    }

    console.log('res', res);

    return res;
}
