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

export interface GameScheme {
    state: {
        id: number,
        timestamp: number,
    };
    timestamp: number;
    currentQ?: {
        text: string,
        locale: string,
        citation: string,
    };
    answers?: {
        guid: {
            text: string,
            creators: any,
            houseLie: boolean,
            realAnswer: boolean,
            selectors: any,
        }
    };
    totalQ: number;
    players?: { [id: string]: { nickname: string, score: number } };
    qids: { [id: number]: string };
    gameTick: number;
    presenter: boolean;
}
