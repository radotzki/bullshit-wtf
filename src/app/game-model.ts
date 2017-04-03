export enum GameState {
    GameStaging = 0,
    RoundIntro = 1,
    ShowQuestion = 2,
    ShowAnswers = 3,
    RevealTheTruth = 4,
    ScoreBoard = 5,
    ScoreBoardFinal = 6,
}

export interface GameScheme {
    state: {
        id: number,
        timestamp: number,
    };
    timestamp: number;
    roundIndex: number;
    questionIndex: number;
    locale: string;
    currentQ?: string;
    answers?: Answers;
    answerSelections?: {
        [pid: string]: {
            answerText: string;
            score?: number;
        }
    };
    totalQ: number;
    players?: GamePlayers;
    qids: { [id: number]: string };
    gameTick: number;
    presenter: boolean;
}

export interface GamePlayers {
    [id: string]: GamePlayer;
}

export interface GamePlayer {
    nickname: string;
    score: number;
}

export interface Answers {
    [pid: string]: Answer;
}

export interface Answer {
    text: string;
    houseLie: boolean;
    realAnswer: boolean;
    score?: number;
}
