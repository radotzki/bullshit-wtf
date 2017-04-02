export interface Game {
    // players: number;
    players: any;
    currentQ: number;
    totalQ: number;
    pin: string;
    state: GameState;

    currentQuestion: any;
}

export enum GameState {
    GameStaging = 0,
    RoundIntro = 1,
    ShowQuestion = 2,
    ShowAnswers = 3,
    RevealTheTruth = 4,
    ScoreBoard = 5,
    ScoreBoardFinal = 6,
}

export interface Player {
    name: string;
    picture: string;
    score?: number;
}

export class Question {
    rtl: boolean;

    constructor(
        public citation: string,
        public text: string,
        public locale: string,
    ) {
        this.rtl = locale === 'he-IL';
    }

}

export class Answer {
    id: string;
    text: string;
    creators: string[];
    selectors: string[];
    houseLie: boolean;
    realAnswer: boolean;

    constructor(id, answer) {
        this.id = id;
        this.text = answer.text;
        this.creators = Object.keys(answer.creators || {});
        this.selectors = Object.keys(answer.selectors || {});
        this.houseLie = !!answer.houseLie;
        this.realAnswer = !!answer.realAnswer;
    }
}

