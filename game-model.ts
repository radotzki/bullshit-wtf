export enum GameState {
    GameStaging = 0,
    RoundIntro = 1,
    ShowQuestion = 2,
    ShowAnswers = 3,
    RevealTheTruth = 4,
    ScoreBoard = 5,
    ScoreBoardFinal = 6,
}

export interface GameStateInfo {
    id: number;
    timestamp: number;
    // Server time at which this phase ends. Set by the server for every timed phase.
    deadline?: number;
}

export interface GameScheme {
    state: GameStateInfo;
    timestamp: number;
    roundIndex: number;
    questionIndex: number;
    locale: string;
    currentQ?: string;
    answers?: Answers;
    answerSelections?: AnswerSelections;
    revealAnswers?: RevealAnswer[];
    totalQ: number;
    players?: GamePlayers;
    qids: { [id: number]: string };
    // Legacy clients write the state they want to move to (a GameState, or 999).
    // Current clients write "<state id>:<state timestamp>" of the state they want to leave.
    tick: number | string;
    presenter: boolean;
    fork?: string;
}

export interface GamePlayers {
    [id: string]: GamePlayer;
}

export interface GamePlayer {
    nickname: string;
    score: number;
    uid: string;
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

export interface AnswerSelections {
    [pid: string]: AnswerSelection;
}

export interface AnswerSelection {
    text: string;
    score?: number;
}

export interface RevealAnswer {
    text: string;
    selectors: string[];
    creators: string[];
    realAnswer: boolean;
    houseLie: boolean;
    points: number;
}

export interface Question {
    id: string;
    realAnswer: string;
    fakeAnswers: string[];
    questionText: string;
    citation: string;
}
