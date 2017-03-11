export interface Game {
    answerQuestionTime: number;
    categories: string[];
    createdAt?: Date;
    currentTime?: Date;
    name?: string;
    numberOfQuestions: number;
    players?: Player[];
    questions?: {[key: number]: Question};
    currentQuestion?: Question;
    selectAnswerTime: number;
    state?: GameState;
}

export enum GameState {
    Registration,
    RoundOneIntro,
    RoundOneProgress,
    RoundTwoIntro,
    RoundTwoProgress,
    RoundThreeIntro,
    RoundThreeProgress,
    GameOver,
}

export interface Player {
    id: string;
    name: string;
    picture: string;
    score?: number;
}

export interface Question {
    citation: string;
    fakeAnswers: Answer[];
    id: string;
    questionText: string;
    realAnswer: Answer;
    startedAt: number;
    state: QuestionState;
    lang: string;
    questionNumber?: number;
    rtl?: boolean;
}

export interface Answer {
    createdBy: string[];
    points: number;
    text: string;
    selectedBy: string[];
    selectedByUser: Player[];
    createdByUser: Player[];
}

export enum QuestionState {
    Pending,
    ShowQuestion,
    ShowAnswers,
    RevealTheTruth,
    ScoreBoard,
    End,
}
