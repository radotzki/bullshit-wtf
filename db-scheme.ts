enum GameState {
    GameStaging = 0,
    RoundIntro = 1,
    ShowQuestion = 2,
    ShowAnswers = 3,
    RevealTheTruth = 4,
    ScoreBoard = 5,
    ScoreBoardFinal = 6,
}

const json = {
    'games': {
        'ABCD': {
            state: 0,
            currentQ: 0,
            totalQ: 5,
            players: 7,
        }
    },
    'game-questions': {
        'ABCD': {
            0: {
                text: '',
                locale: '',
                citation: '',
            },
            1: {
                text: '',
                locale: '',
                citation: '',
            }
        }
    },
    'game-question-answers': {
        'ABCD': {
            0: {
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
            }
        }
    },
    'game-players': {
        'ABCD': {
            pname1: 1000,
            pname2: 2500,
            pname3: 800,
        }
    },
    'game-timestamp': {
        'ABCD': {
            start: Date.now(),
            end: Date.now() + 30000,
        }
    }
};

