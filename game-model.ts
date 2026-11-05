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
    // Who started this game and how (for measuring hosts and groups that return).
    creator?: string;        // anonymous uid of the browser that created or replayed it
    origin?: GameOrigin;
    parent?: string;         // PIN of the finished game this one was replayed from
    // Players who tapped NEXT on the reveal. When every player has, the reveal ends early.
    revealDone?: { [pid: string]: boolean };
    // The saved crew this game counts for (set by a crew rematch, carried by Replay).
    crew?: string;
}

export type GameOrigin = 'create' | 'replay' | 'crew';

/**
 * The reveal screen shows, one row at a time, each answer somebody picked, then the truth last.
 * Each row first shows who picked it and, halfway through its step, who wrote it.
 * After the last row everyone sees their own result for `hold` ms (or until all players tap NEXT).
 * Answers nobody picked get no row: they are listed together at the end, at no extra time.
 * Used by both the server (phase deadline) and the client (what to show when).
 */
export const revealTiming = {
    phones: { step: 1600, hold: 3000 },
    // A big screen plays a sound per row and the room reads it together: give each row more time.
    presenter: { step: 4500, hold: 3000 },
};

export function revealRows(revealAnswers: RevealAnswer[] | undefined | null): number {
    return Math.max((revealAnswers || []).filter(a => (a.selectors && a.selectors.length) || a.realAnswer).length, 1);
}

/** How long the reveal lasts, and when the last row's writer has been shown (ms after it starts). */
export function revealSchedule(revealAnswers: RevealAnswer[] | undefined | null, presenter: boolean) {
    const timing = presenter ? revealTiming.presenter : revealTiming.phones;
    const allShown = revealRows(revealAnswers) * timing.step - timing.step / 2;
    return { step: timing.step, allShown, duration: allShown + timing.hold };
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
    // House lies only: what each picker actually lost (a house lie never takes a score below zero).
    pointsBy?: { [pid: string]: number };
}

export interface Question {
    id: string;
    realAnswer: string;
    fakeAnswers: string[];
    questionText: string;
    citation: string;
}

/**
 * A crew: a group that saved itself after a game, with standings across games.
 * Stored at crews/{id}, readable by anyone who has the id, written by functions only.
 * Members are nickname slots, keyed by crewMemberKey(nickname): no accounts.
 */
export interface Crew {
    id: string;
    name: string;
    locale: string;
    totalQ: number;
    createdAt: number;
    creator?: string;
    members: { [key: string]: CrewMember };
    // Every finished game that was offered to the crew, counted or not (keeps updates idempotent).
    games?: { [pin: string]: CrewGameRecord };
    gameCount: number;
    lastPlayed?: number;
    // The latest crew rematch lobby, so everyone who taps Rematch lands in the same game.
    rematch?: { pin: string; time: number };
}

export interface CrewMember {
    nickname: string;
    games: number;
    wins: number;
    points: number;
    best: number;
    // Browsers that played as this member: used to avoid repeat questions in a crew rematch.
    uids?: { [uid: string]: boolean };
}

export interface CrewGameRecord {
    time: number;
    players: number;
    counted: boolean;
    winners?: string[];
}

export interface CrewGamePlayer {
    nickname: string;
    score: number;
    uid?: string;
}

/** A Realtime Database key for a nickname: case and spacing do not matter. */
export function crewMemberKey(nickname: string): string {
    const key = String(nickname || '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.#$\[\]\/]/g, '_');
    return key || '_';
}

/**
 * Adds a finished game to the crew's standings, and returns the crew.
 * A game counts only when at least two played and at least half of the crew was in it,
 * so a solo game cannot farm wins. Players of a counted game who are new to the crew join it.
 * Adding the same game twice changes nothing.
 */
export function applyCrewGame(crew: Crew, pin: string, players: CrewGamePlayer[], time: number): Crew {
    crew.games = crew.games || {};
    crew.members = crew.members || {};
    crew.gameCount = crew.gameCount || 0;

    if (crew.games[pin]) {
        return crew;
    }

    const memberCount = Object.keys(crew.members).length;
    const matched = players.filter(p => !!crew.members[crewMemberKey(p.nickname)]).length;
    const counted = players.length >= 2 && matched >= Math.ceil(memberCount / 2);
    const record: CrewGameRecord = { time, players: players.length, counted };

    if (counted) {
        const top = Math.max.apply(null, players.map(p => p.score || 0));
        const winners = top > 0 ? players.filter(p => (p.score || 0) === top).map(p => crewMemberKey(p.nickname)) : [];
        record.winners = winners;

        players.forEach(p => {
            const key = crewMemberKey(p.nickname);
            const m: CrewMember = crew.members[key] || { nickname: String(p.nickname || '').trim(), games: 0, wins: 0, points: 0, best: 0 };
            m.nickname = String(p.nickname || '').trim() || m.nickname;
            m.games = (m.games || 0) + 1;
            m.points = (m.points || 0) + (p.score || 0);
            m.best = Math.max(m.best || 0, p.score || 0);
            m.wins = (m.wins || 0) + (winners.indexOf(key) >= 0 ? 1 : 0);
            if (p.uid) {
                m.uids = m.uids || {};
                m.uids[p.uid] = true;
            }
            crew.members[key] = m;
        });

        crew.gameCount += 1;
        crew.lastPlayed = time;
    }

    crew.games[pin] = record;
    return crew;
}

/** Members in standings order: most wins, then most points, then fewest games. */
export function crewStandings(crew: Crew): CrewMember[] {
    const members = crew && crew.members ? Object.keys(crew.members).map(k => crew.members[k]) : [];
    return members.sort((a, b) =>
        (b.wins || 0) - (a.wins || 0) || (b.points || 0) - (a.points || 0) || (a.games || 0) - (b.games || 0));
}

/** One line for the top of the crew page, like "Dana leads 4 to 3". */
export function crewLeaderLine(crew: Crew, locale: string): string {
    const he = locale === 'he';
    const s = crewStandings(crew);
    const games = crew ? crew.gameCount || 0 : 0;

    if (!games || !s.length || !(s[0].wins > 0)) {
        return he ? 'עוד אין מנצחים. מי לוקח את הראשון?' : 'No winner yet. Who takes the first one?';
    }

    const first = s[0];
    const second = s[1];

    if (second && second.wins === first.wins) {
        return he
            ? `תיקו ${first.wins}–${second.wins} בין ${first.nickname} ל־${second.nickname}`
            : `${first.nickname} and ${second.nickname} are tied ${first.wins} to ${second.wins}`;
    }

    if (!second) {
        return he ? `${first.nickname} מוביל/ה עם ${first.wins}` : `${first.nickname} leads with ${first.wins}`;
    }

    return he
        ? `${first.nickname} מוביל/ה ${first.wins}–${second.wins}`
        : `${first.nickname} leads ${first.wins} to ${second.wins}`;
}
