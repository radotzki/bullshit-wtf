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
var tick_1 = require("./controllers/tick");
var answer_1 = require("./controllers/answer");
var new_game_1 = require("./controllers/new-game");
var on_answer_selection_1 = require("./controllers/on-answer-selection");
var join_1 = require("./controllers/join");
exports.time = functions.https.onRequest(function (req, res) {
    cors(req, res, function () {
        res.send({ now: Date.now() });
    });
});
exports.newGame = functions.https.onRequest(function (req, res) {
    cors(req, res, function () { return __awaiter(_this, void 0, void 0, function () {
        var locale, count, pin;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    locale = req.body.locale;
                    count = req.body.count;
                    return [4 /*yield*/, new_game_1.newGame(locale, count)];
                case 1:
                    pin = _a.sent();
                    res.send({ pin: pin });
                    return [2 /*return*/];
            }
        });
    }); });
});
exports.answer = functions.https.onRequest(function (req, res) {
    cors(req, res, function () { return __awaiter(_this, void 0, void 0, function () {
        var pin, pid, playerAnswer, e_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    pin = req.body.pin;
                    pid = req.body.pid;
                    playerAnswer = req.body.answer;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, answer_1.answer(pin, pid, playerAnswer)];
                case 2:
                    _a.sent();
                    return [2 /*return*/, res.status(200).send({})];
                case 3:
                    e_1 = _a.sent();
                    return [2 /*return*/, res.status(400).send(e_1)];
                case 4: return [2 /*return*/];
            }
        });
    }); });
});
exports.join = functions.https.onRequest(function (req, res) {
    cors(req, res, function () { return __awaiter(_this, void 0, void 0, function () {
        var pin, nickname, pid, e_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    pin = req.body.pin;
                    nickname = req.body.nickname;
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, join_1.join(pin, nickname)];
                case 2:
                    pid = _a.sent();
                    return [2 /*return*/, res.status(200).send({ pid: pid })];
                case 3:
                    e_2 = _a.sent();
                    return [2 /*return*/, res.status(400).send(e_2)];
                case 4: return [2 /*return*/];
            }
        });
    }); });
});
exports.tick = functions.database.ref('games/{pin}/tick').onWrite(function (event) {
    var pin = event.params.pin;
    return tick_1.tick(pin);
});
exports.onAnswerSelection = functions.database.ref('games/{pin}/answerSelections').onWrite(function (event) {
    var pin = event.params.pin;
    return on_answer_selection_1.onAnswerSelection(pin);
});
