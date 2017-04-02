"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t;
    return { next: verb(0), "throw": verb(1), "return": verb(2) };
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = y[op[0] & 2 ? "return" : op[0] ? "throw" : "next"]) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [0, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var _this = this;
Object.defineProperty(exports, "__esModule", { value: true });
var functions = require('firebase-functions');
var cors = require('cors')({ origin: true });
var admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);
var questions_1 = require("./questions");
var gameState = {
    GameStaging: 0,
    RoundIntro: 1,
    ShowQuestion: 2,
    ShowAnswers: 3,
    RevealTheTruth: 4,
    ScoreBoard: 5,
    ScoreBoardFinal: 6,
};
var times = {
    RoundIntro: 3000,
    ShowQuestion: 45000,
    ShowAnswer: 30000,
};
var gamesRef = admin.database().ref('games');
exports.alive = functions.https.onRequest(function (req, res) {
    cors(req, res, function () {
        res.send('alive');
    });
});
exports.newGame = functions.https.onRequest(function (req, res) {
    // TODO: handle errors in promise
    cors(req, res, function () { return __awaiter(_this, void 0, void 0, function () {
        var lang, count, gameCounterRef, gameCounter, gamePin, questions, game;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    lang = req.body.lang;
                    count = req.body.count;
                    gameCounterRef = admin.database().ref('gameCounter');
                    return [4 /*yield*/, getOnce(gameCounterRef)];
                case 1:
                    gameCounter = (_a.sent()) + 1;
                    gamePin = leftPad(gameCounter.toString(36).toUpperCase());
                    return [4 /*yield*/, gameCounterRef.set(gameCounter)];
                case 2:
                    _a.sent();
                    questions = questions_1.randomQuestions(lang, count);
                    game = {
                        state: {
                            id: gameState.GameStaging,
                            timestamp: Date.now(),
                        },
                        timestamp: Date.now(),
                        totalQ: count,
                        qIds: questions,
                        gameTick: 0,
                        presenter: false,
                    };
                    return [4 /*yield*/, gamesRef.child(gamePin).set(game)];
                case 3:
                    _a.sent();
                    res.send({ pin: gamePin });
                    return [2 /*return*/];
            }
        });
    }); });
});
function leftPad(gameCounter) {
    while (gameCounter.length < 4) {
        gameCounter = "0" + gameCounter;
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
function getOnce(ref) {
    return ref.once('value').then(function (s) { return s.val(); });
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
