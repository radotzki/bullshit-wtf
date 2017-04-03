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
exports.time = functions.https.onRequest(function (req, res) {
    cors(req, res, function () {
        res.send({ now: Date.now() });
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
                    gamePin = leftPad((gameCounter).toString(26).replace(/\d/g, function (d) { return 'qrstuvwxyz'[d]; }).toUpperCase());
                    return [4 /*yield*/, gameCounterRef.set(gameCounter)];
                case 2:
                    _a.sent();
                    questions = questions_1.randomQuestions(lang, count);
                    game = {
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
                    return [4 /*yield*/, gamesRef.child(gamePin).set(game)];
                case 3:
                    _a.sent();
                    res.send({ pin: gamePin });
                    return [2 /*return*/];
            }
        });
    }); });
});
exports.tick = functions.database.ref('games/{pin}/gameTick').onWrite(function (event) { return __awaiter(_this, void 0, void 0, function () {
    var pin, game, _a, playerAnswers, fakeAnswers, realAnswer, answers;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0:
                pin = event.params.pin;
                return [4 /*yield*/, getOnce(gamesRef.child(pin))];
            case 1:
                game = _b.sent();
                if (game.gameTick === game.state.id) {
                    console.log('Game tick = game state');
                    return [2 /*return*/];
                }
                _a = game.state.id;
                switch (_a) {
                    case gameState.GameStaging: return [3 /*break*/, 2];
                    case gameState.RoundIntro: return [3 /*break*/, 4];
                    case gameState.ShowQuestion: return [3 /*break*/, 6];
                    case gameState.ShowAnswers: return [3 /*break*/, 8];
                    case gameState.RevealTheTruth: return [3 /*break*/, 10];
                    case gameState.ScoreBoard: return [3 /*break*/, 12];
                }
                return [3 /*break*/, 14];
            case 2: return [4 /*yield*/, updateGame(pin, { state: updateState(gameState.RoundIntro) })];
            case 3:
                _b.sent();
                return [3 /*break*/, 14];
            case 4: return [4 /*yield*/, updateGame(pin, {
                    state: updateState(gameState.ShowQuestion),
                    currentQ: populateQuestion(game),
                })];
            case 5:
                _b.sent();
                return [3 /*break*/, 14];
            case 6:
                playerAnswers = game.answers;
                console.log('playerAnswers', playerAnswers);
                fakeAnswers = populateFakeAnswers(pin, game);
                console.log('fakeAnswers', fakeAnswers);
                realAnswer = getRealAnswer(game);
                console.log('realAnswer', realAnswer);
                answers = Object.assign({}, playerAnswers, fakeAnswers, realAnswer);
                console.log('answers', answers);
                return [4 /*yield*/, updateGame(pin, {
                        state: updateState(gameState.ShowAnswers),
                        answers: answers,
                    })];
            case 7:
                _b.sent();
                return [3 /*break*/, 14];
            case 8: return [4 /*yield*/, updateGame(pin, { state: updateState(gameState.RevealTheTruth) })];
            case 9:
                _b.sent();
                return [3 /*break*/, 14];
            case 10: return [4 /*yield*/, updateGame(pin, { state: updateState(gameState.ScoreBoard) })];
            case 11:
                _b.sent();
                return [3 /*break*/, 14];
            case 12: return [4 /*yield*/, updateGame(pin, { state: updateState(gameState.ScoreBoard) })];
            case 13:
                _b.sent();
                return [3 /*break*/, 14];
            case 14: return [2 /*return*/];
        }
    });
}); });
// TODO: entered the truth
// TOOD: decoys
function updateState(stateId) {
    return { id: stateId, timestamp: Date.now() };
}
function populateQuestion(game) {
    return questions_1.getQuestion(game.qids[game.questionIndex]).questionText;
}
function nextQuestion(pin, game) {
    if (game.questionIndex === game.totalQ) {
        return updateGame(pin, { state: updateState(gameState.ScoreBoardFinal) });
    }
    else {
        updateGame(pin, {
            state: updateState(gameState.ShowQuestion),
            questionIndex: game.questionIndex + 1,
        });
    }
}
function updateGame(pin, update) {
    gamesRef.child(pin).update(update);
}
function leftPad(gameCounter) {
    while (gameCounter.length < 4) {
        gameCounter = "Q" + gameCounter;
    }
    return gameCounter;
}
function populateFakeAnswers(pin, game) {
    var allFakeAnswers = questions_1.getQuestion(game.qids[game.questionIndex]).fakeAnswers;
    var playerAnswers = Object.keys(game.answers).map(function (k) { return game.answers[k].text; });
    var uniqueAnswersCount = Array.from(new Set(playerAnswers)).length;
    var playersCount = Object.keys(game.players).length;
    var fakeAnswers = allFakeAnswers.slice(0, playersCount - uniqueAnswersCount);
    var res = {};
    fakeAnswers.forEach(function (text) {
        var key = gamesRef.child(pin).child('answers').push().key;
        res[key] = { text: text, houseLie: true, realAnswer: false };
    });
    return res;
}
function getRealAnswer(game) {
    var text = questions_1.getQuestion(game.qids[game.questionIndex]).realAnswer;
    var realAnswer = {
        truth: { text: text, houseLie: false, realAnswer: true }
    };
    return realAnswer;
}
exports.answer = functions.https.onRequest(function (req, res) {
    cors(req, res, function () { return __awaiter(_this, void 0, void 0, function () {
        var pin, pid, answer, game, qid, question, playerAnswer;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    pin = req.body.pin;
                    pid = req.body.pid;
                    answer = req.body.answer.toLowerCase();
                    return [4 /*yield*/, getOnce(gamesRef.child(pin))];
                case 1:
                    game = _a.sent();
                    qid = game.qids[game.questionIndex];
                    question = questions_1.getQuestion(qid);
                    if (!(question.realAnswer.toLowerCase() === answer)) return [3 /*break*/, 2];
                    return [2 /*return*/, res.status(400).send({ message: 'You entered the correct answer.', code: 'CORRECT_ANSWER' })];
                case 2:
                    playerAnswer = {
                        text: answer,
                        houseLie: false,
                        realAnswer: false,
                    };
                    return [4 /*yield*/, gamesRef.child(pin).child('answers').child(pid).set(playerAnswer)];
                case 3:
                    _a.sent();
                    res.status(200).send({});
                    _a.label = 4;
                case 4: return [2 /*return*/];
            }
        });
    }); });
});
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
