const functions = require('firebase-functions');
const cors = require('cors')({ origin: true });
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

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
}

exports.tickRoundIntro = functions.database.ref('games/{pin}/state').onWrite(event => {
    const state = event.data.val();
    if (state === gameState.RoundIntro) {
        return new Promise(res => setTimeout(() => res(event.data.ref.set(gameState.ShowQuestion)), times.RoundIntro));
    }
});

exports.initGameTimestamp = functions.database.ref('games/{pin}/state').onWrite(event => {
    const state = event.data.val();
    const pin = event.params.pin;

    if (state === gameState.ShowQuestion) {
        return admin.database().ref(`game-timestamp/${pin}`).set({ start: Date.now(), end: Date.now() + times.ShowQuestion });
    }
});

exports.tickShowQuestion = functions.database.ref('games/{pin}/state').onWrite(event => {
    const state = event.data.val();
    const pin = event.params.pin;
    console.log('tickShowQuestion', pin);

    if (state === gameState.ShowQuestion) {
        getOnce(`games/${pin}/currentQ`).then(currentQ => {
            setTimeout(() => {
                getOnce(`games/${pin}`).then(game => {
                    if (game.currentQ === currentQ && game.state === gameState.ShowQuestion) {
                        return event.data.ref.set(gameState.ShowAnswers);
                    }
                })
            }, times.ShowQuestion);
        })
    }
});

exports.answer = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        const pin = req.body.pin;
        const answer = req.body.answer.toLowerCase();
        const nickname = req.body.nickname.toLowerCase();
        let currentQ;
        let players;

        return getOnce(`games/${pin}`)
            .then(resp => {
                currentQ = resp.currentQ;
                players = resp.players;
                return getOnce(`game-question-answers/${pin}/${currentQ}`);
            })
            .then(answers => {
                const answersArr = Object.keys(answers).map(id => Object.assign({}, { id }, answers[id]));
                const realAnswer = answersArr.find(a => a.realAnswer).text.toLowerCase();
                const fakeAnswer = answersArr.find(a => a.text === answer);
                const playerAnswersCount = answersArr.reduce((sum, a) => sum + Object.keys(a.creators || {}).length, 0);
                const promises = [];

                if (answer === realAnswer) {
                    return res.status(400).send({ message: 'You entered the correct answer.', code: 'CORRECT_ANSWER' });
                } else if (fakeAnswer) {
                    if (fakeAnswer.houseLie) {
                        promises.push(admin.database().ref(`game-question-answers/${pin}/${currentQ}/${fakeAnswer.id}/houseLie`).set(false));
                    }

                    promises.push(admin.database().ref(`game-question-answers/${pin}/${currentQ}/${fakeAnswer.id}/creators/${nickname}`).set(true));
                } else {
                    promises.push(admin.database().ref(`game-question-answers/${pin}/${currentQ}`).push({ text: answer, creators: { [nickname]: true } }));
                }

                if (playerAnswersCount + 1 === players) {
                    promises.push(admin.database().ref(`games/${pin}/state`).set(gameState.ShowAnswers));
                }

                return Promise.all(promises);
            })
            .then(() => res.status(200).send({}))
            .catch(err => {
                console.error(err);
                res.status(500).send({});
            });
    });
});

function getOnce(path) {
    return admin.database().ref(path).once('value').then(s => s.val());
}