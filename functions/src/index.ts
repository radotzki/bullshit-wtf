const functions = require('firebase-functions');
const cors = require('cors')({ origin: true });
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);
import { getQuestion, randomQuestions } from './questions';
import { GameScheme } from '../../game-model';

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

exports.newGame = functions.https.onRequest((req, res) => {
    // TODO: handle errors in promise
    cors(req, res, async () => {
        // TODO: transaction
        const lang = req.body.lang;
        const count = req.body.count;
        const gameCounterRef = admin.database().ref('gameCounter');
        const gameCounter = await getOnce<number>(gameCounterRef) + 1;
        const gamePin = leftPad(gameCounter.toString(36).toUpperCase());

        await gameCounterRef.set(gameCounter);

        const questions = randomQuestions(lang, count);
        const game: GameScheme = {
            state: {
                id: gameState.GameStaging,
                timestamp: Date.now(),
            },
            timestamp: Date.now(),
            totalQ: count,
            qids: questions,
            gameTick: 0,
            presenter: false,
        };

        await gamesRef.child(gamePin).set(game);

        res.send({ pin: gamePin });
    });
});

function leftPad(gameCounter: string) {
    while (gameCounter.length < 4) {
        gameCounter = `0${gameCounter}`;
    }

    return gameCounter;
}

// exports.answer = functions.https.onRequest((req, res) => {
//     cors(req, res, () => {
//         const pin = req.body.pin;
//         const answer = req.body.answer.toLowerCase();
//         const nickname = req.body.nickname.toLowerCase();
//         let currentQ;
//         let players;

//         return getOnce(`games/${pin}`)
//             .then(resp => {
//                 currentQ = resp.currentQ;
//                 players = resp.players;
//                 return getOnce(`game-question-answers/${pin}/${currentQ}`);
//             })
//             .then(answers => {
//                 const answersArr = Object.keys(answers).map(id => Object.assign({}, { id }, answers[id]));
//                 const realAnswer = answersArr.find(a => a.realAnswer).text.toLowerCase();
//                 const fakeAnswer = answersArr.find(a => a.text === answer);
//                 const playerAnswersCount = answersArr.reduce((sum, a) => sum + Object.keys(a.creators || {}).length, 0);
//                 const promises = [] as any;

//                 if (answer === realAnswer) {
//                     return res.status(400).send({ message: 'You entered the correct answer.', code: 'CORRECT_ANSWER' });
//                 } else if (fakeAnswer) {
//                     if (fakeAnswer.houseLie) {
//                         promises
//                             .push(admin.database()
//                                 .ref(`game-question-answers/${pin}/${currentQ}/${fakeAnswer.id}/houseLie`)
//                                 .set(false));
//                     }

//                     promises
//                         .push(admin.database()
//                             .ref(`game-question-answers/${pin}/${currentQ}/${fakeAnswer.id}/creators/${nickname}`)
//                             .set(true));
//                 } else {
//                     promises
//                         .push(admin.database()
//                             .ref(`game-question-answers/${pin}/${currentQ}`)
//                             .push({ text: answer, creators: { [nickname]: true } }));
//                 }

//                 if (playerAnswersCount + 1 === players) {
//                     promises.push(admin.database().ref(`games/${pin}/state`).set(gameState.ShowAnswers));
//                 }

//                 return Promise.all(promises);
//             })
//             .then(() => res.status(200).send({}))
//             .catch(err => {
//                 console.error(err);
//                 res.status(500).send({});
//             });
//     });
// });


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