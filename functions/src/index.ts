import { GameScheme, Answer, Answers } from './game-model';
const functions = require('firebase-functions');
const cors = require('cors')({ origin: true });
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);
import { getQuestion, randomQuestions } from './questions';

const gameState = {
    GameStaging: 0,
    RoundIntro: 1,
    ShowQuestion: 2,
    ShowAnswers: 3,
    RevealTheTruth: 4,
    ScoreBoard: 5,
    ScoreBoardFinal: 6,
};

const times = {
    RoundIntro: 3000,
    ShowQuestion: 45000,
    ShowAnswer: 30000,
};

const gamesRef = admin.database().ref('games');

exports.alive = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        res.send('alive');
    });
});

exports.time = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        res.send({ now: Date.now() });
    });
});

exports.newGame = functions.https.onRequest((req, res) => {
    // TODO: handle errors in promise
    cors(req, res, async () => {
        // TODO: transaction
        const lang = req.body.lang;
        const count = req.body.count;
        const gameCounterRef = admin.database().ref('gameCounter');
        const gameCounter = await getOnce<number>(gameCounterRef) + 1;
        const gamePin = leftPad((gameCounter).toString(26).replace(/\d/g, d => 'qrstuvwxyz'[d]).toUpperCase());

        await gameCounterRef.set(gameCounter);

        const questions = randomQuestions(lang, count);
        const game: GameScheme = {
            state: {
                id: gameState.GameStaging,
                timestamp: Date.now(),
            },
            locale: lang,
            timestamp: Date.now(),
            roundIndex: 0,
            questionIndex: 0,
            totalQ: count,
            qids: questions,
            gameTick: 0,
            presenter: false,
        };

        await gamesRef.child(gamePin).set(game);

        res.send({ pin: gamePin });
    });
});

exports.tick = functions.database.ref('games/{pin}/gameTick').onWrite(async event => {
    const pin = event.params.pin;
    const game = await getOnce<GameScheme>(gamesRef.child(pin));

    if (game.gameTick === game.state.id) {
        console.log('Game tick = game state');
        return;
    }

    switch (game.state.id) {
        case gameState.GameStaging:
            await updateGame(pin, { state: updateState(gameState.RoundIntro) });
            break;

        case gameState.RoundIntro:
            await updateGame(pin, {
                state: updateState(gameState.ShowQuestion),
                currentQ: populateQuestion(game),
            });
            break;

        case gameState.ShowQuestion:
            const playerAnswers = game.answers;
            console.log('playerAnswers', playerAnswers);
            const fakeAnswers = populateFakeAnswers(pin, game);
            console.log('fakeAnswers', fakeAnswers);
            const realAnswer = getRealAnswer(game);
            console.log('realAnswer', realAnswer);
            const answers = Object.assign({}, playerAnswers, fakeAnswers, realAnswer);
            console.log('answers', answers);
            await updateGame(pin, {
                state: updateState(gameState.ShowAnswers),
                answers: answers,
            });
            break;

        case gameState.ShowAnswers:
            await updateGame(pin, { state: updateState(gameState.RevealTheTruth) });
            break;

        case gameState.RevealTheTruth:
            await updateGame(pin, { state: updateState(gameState.ScoreBoard) });
            break;

        case gameState.ScoreBoard:
            await updateGame(pin, { state: updateState(gameState.ScoreBoard) });
            break;
    }
});

// TODO: entered the truth
// TOOD: decoys

function updateState(stateId: number) {
    return { id: stateId, timestamp: Date.now() };
}

function populateQuestion(game: GameScheme) {
    return getQuestion(game.qids[game.questionIndex]).questionText;
}

function nextQuestion(pin: string, game: GameScheme) {
    if (game.questionIndex === game.totalQ) {
        return updateGame(pin, { state: updateState(gameState.ScoreBoardFinal) });
    } else {
        updateGame(pin, {
            state: updateState(gameState.ShowQuestion),
            questionIndex: game.questionIndex + 1,
        });
    }
}

function updateGame(pin: string, update: Partial<GameScheme>) {
    gamesRef.child(pin).update(update);
}

function leftPad(gameCounter: string) {
    while (gameCounter.length < 4) {
        gameCounter = `Q${gameCounter}`;
    }

    return gameCounter;
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

exports.answer = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        const pin = req.body.pin;
        const pid = req.body.pid;
        const answer = req.body.answer.toLowerCase();

        const game = await getOnce<GameScheme>(gamesRef.child(pin));
        const qid = game.qids[game.questionIndex];
        const question = getQuestion(qid);

        if (question.realAnswer.toLowerCase() === answer) {
            return res.status(400).send({ message: 'You entered the correct answer.', code: 'CORRECT_ANSWER' });
        } else {
            const playerAnswer = {
                text: answer,
                houseLie: false,
                realAnswer: false,
            };
            await gamesRef.child(pin).child('answers').child(pid).set(playerAnswer);
            res.status(200).send({});
        }
    });
});


function getOnce<T>(ref): Promise<T> {
    return ref.once('value').then(s => s.val());
}




// exports.tickRoundIntro = functions.database.ref('games/{pin}/state').onWrite(event => {
//     const state = event.data.val();
//     if (state === gameState.RoundIntro) {
//         return new Promise(res => setTimeout(() => res(event.data.ref.set(gameState.ShowQuestion)), times.RoundIntro));
//     }
// });

// exports.initGameTimestamp = functions.database.ref('games/{pin}/state').onWrite(event => {
//     const state = event.data.val();
//     const pin = event.params.pin;

//     if (state === gameState.ShowQuestion) {
//         return admin.database().ref(`game-timestamp/${pin}`).set({ start: Date.now(), end: Date.now() + times.ShowQuestion });
//     }
// });

// exports.tickShowQuestion = functions.database.ref('games/{pin}/state').onWrite(event => {
//     const state = event.data.val();
//     const pin = event.params.pin;
//     console.log('tickShowQuestion', pin);

//     if (state === gameState.ShowQuestion) {
//         getOnce(`games/${pin}/currentQ`).then(currentQ => {
//             setTimeout(() => {
//                 getOnce(`games/${pin}`).then(game => {
//                     if (game.currentQ === currentQ && game.state === gameState.ShowQuestion) {
//                         return event.data.ref.set(gameState.ShowAnswers);
//                     }
//                 })
//             }, times.ShowQuestion);
//         })
//     }
// });