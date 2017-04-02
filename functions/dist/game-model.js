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
})(GameState || (GameState = {}));
var json = {
    'gameCounter': 1024,
    'games': {
        'ABCD': {
            state: {
                id: 0,
                timestamp: Date,
            },
            timestamp: Date,
            currentQ: {
                text: '',
                locale: '',
                citation: '',
            },
            answers: {
                guid: {
                    text: '',
                    creators: {
                        pname1: true,
                    },
                    houseLie: false,
                    realAnswer: false,
                    selectors: {
                        pname2: true,
                    },
                }
            },
            totalQ: 5,
            players: {
                pname1: 1000,
                pname2: 2500,
                pname3: 800,
            },
            qIds: {
                qid1: true,
                qid2: true,
            },
            gameTick: 1,
            presenter: true,
        }
    },
};
