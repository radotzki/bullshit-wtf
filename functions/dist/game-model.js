"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var GameState;
(function (GameState) {
    GameState[GameState["GameStaging"] = 0] = "GameStaging";
    GameState[GameState["RoundIntro"] = 1] = "RoundIntro";
    GameState[GameState["ShowQuestion"] = 2] = "ShowQuestion";
    GameState[GameState["ShowAnswers"] = 3] = "ShowAnswers";
    GameState[GameState["RevealTheTruth"] = 4] = "RevealTheTruth";
    GameState[GameState["ScoreBoard"] = 5] = "ScoreBoard";
    GameState[GameState["ScoreBoardFinal"] = 6] = "ScoreBoardFinal";
})(GameState = exports.GameState || (exports.GameState = {}));
