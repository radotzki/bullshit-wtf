import { nameFlag } from './name-flag';

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
    // The first Replay claims its new game's pin here, so a second Replay at the same moment joins it.
    forking?: string;
    // Who started this game and how (for measuring hosts and groups that return).
    creator?: string;        // anonymous uid of the browser that created or replayed it
    // A one-game secret from the phone that created it, so the lobby knows the host even when that
    // phone's sign-in failed (no uid). Never readable by clients; the matching join gets `host: true`.
    // The server starts such a game only for the phone that brings this key (or the big screen).
    hostKey?: string;
    // Made by a client that starts games through the startGame function: a tick (which any phone
    // can write) never starts it. Games from older clients lack it, so their START tick still works.
    serverStart?: boolean;
    // This game has a host marked by hostKey (readable): other phones wait for that host to join.
    hasHost?: boolean;
    // Server time the host's lobby page last reported in (serverStart games only, written only by the
    // server for the phone with the host key). Readable: when it is 90 s old, anyone may start.
    hostSeen?: number;
    origin?: GameOrigin;
    parent?: string;         // PIN of the finished game this one was replayed from
    // Players who tapped NEXT on the reveal. When every player has, the reveal ends early.
    revealDone?: { [pid: string]: boolean };
    // Seats that have sent a lie or a pick in this game, stored as each question's picks close.
    // From question 2 on, the "everyone answered" checks do not wait for the other seats.
    played?: { [pid: string]: boolean };
    // The question index `played` was first kept from: only ever 0. A game without it (one that was
    // already running when this was released) waits for every seat, as before.
    playedFrom?: number;
    // The saved crew this game counts for (set by a crew rematch, carried by Replay).
    crew?: string;
    // A seasonal question pack mixed into this game (see questionPacks). Carried by Replay.
    pack?: string;
    // The campaign tag (?via=...) the host arrived with, for measuring posts. Not carried by Replay,
    // except a test tag (see isTestCampaign), which every Replay and crew rematch of a test game keeps.
    campaign?: string;
    // The round-1 lie helper is on for this game (a 50/50 test, set when the game is made).
    coach?: boolean;
    // Round 1 of a coach game only: up to two ready-made lies per player for the current question.
    // Each player can read only their own (games/$pin/ideas/$pid).
    ideas?: { [pid: string]: string[] };
    // Each player's best lie so far (the one that fooled the most players), for the final screen.
    highlights?: Highlights;
    // The question index highlights were first kept from. 0 means the whole game counts, so a player
    // with no highlight really fooled nobody (games already running at a deploy start later).
    highlightsFrom?: number;
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
    // The game's host (the phone that created it, or pressed Replay), marked by the server.
    host?: boolean;
    // The phase in which this seat last sent a lie or a pick (see sentMark), written by the server.
    // It says that the seat has sent, never what: the waiting screens show who the room waits for.
    sent?: string;
}

/**
 * The mark a seat gets when its lie or its pick is in: the name of the phase it was sent in,
 * "<state id>:<state timestamp>". A seat is done with the phase the game is on when its mark names
 * that phase, so nothing has to be cleared between phases, and a mark that arrives late marks nothing.
 */
export function sentMark(state: GameStateInfo): string {
    return `${state.id}:${state.timestamp}`;
}

/** When the phase a mark names started (ms), or 0 for anything that is no mark. */
export function sentMarkTime(mark: any): number {
    const m = typeof mark === 'string' ? /^\d+:(\d+)$/.exec(mark) : null;
    return m ? Number(m[1]) : 0;
}

export interface WaitingSeat {
    pid: string;
    nickname: string;
    /** The seat's place among the players: its picture is avatar<index>.png, as on every screen. */
    index: number;
    /** Its lie (while lies are written) or its pick (while answers are picked) is in. */
    done: boolean;
    /** Nobody plays this seat, so the game does not wait for it (the empty seats rule, seats.ts). */
    away: boolean;
}

export interface WaitingRow {
    /** False until the server is seen to mark seats in this game: an older server never does. */
    known: boolean;
    seats: WaitingSeat[];
    /** The seats the room is waiting for: not done, and not away. */
    waiting: WaitingSeat[];
}

/**
 * Who is done and who the room waits for, from what every phone may read: the players with their
 * marks, the phase the game is on, the question's index and the time the game was made.
 *
 * It follows the server's own rule (seatsToWaitFor in the functions' seats.ts): on the first
 * question every seat is waited for; from the second on, a seat that has sent no lie and no pick
 * in this game is away until it sends one. A mark older than the game (carried over by a Replay
 * from an older server) does not count.
 */
export function waitingRow(players: GamePlayers | null | undefined, state: GameStateInfo | null | undefined,
    questionIndex: number | null | undefined, gameTimestamp: number | null | undefined): WaitingRow {
    const pids = Object.keys(players || {}).filter(pid => !!players[pid] && typeof players[pid] === 'object');
    const mark = state && typeof state.timestamp === 'number' ? sentMark(state) : '';
    const since = typeof gameTimestamp === 'number' ? gameTimestamp : 0;
    const later = (questionIndex || 0) > 0;

    const seats = pids.map((pid, index) => {
        const sent = players[pid].sent;
        const done = !!mark && sent === mark;
        const played = sentMarkTime(sent) > 0 && sentMarkTime(sent) >= since;
        return { pid, nickname: String(players[pid].nickname || ''), index, done, away: later && !done && !played, played };
    });

    return {
        known: seats.some(s => s.played),
        seats: seats.map(s => ({ pid: s.pid, nickname: s.nickname, index: s.index, done: s.done, away: s.away })),
        waiting: seats.filter(s => !s.done && !s.away)
            .map(s => ({ pid: s.pid, nickname: s.nickname, index: s.index, done: s.done, away: s.away })),
    };
}

export interface Answers {
    [pid: string]: Answer;
}

export interface Answer {
    text: string;
    houseLie: boolean;
    realAnswer: boolean;
    score?: number;
    // The player sent one of the lies the round-1 helper offered them.
    idea?: boolean;
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
    // Seasonal pack this question belongs to; such questions only appear in games of that pack.
    pack?: string;
    // An easy opening question: question 1 of a game is one of these that nobody in the room has seen.
    opener?: boolean;
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
    // The test tag of the test game this crew was saved from: its rematches are test games too.
    test?: string;
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

/**
 * Members in standings order: most wins, then most points, then fewest games. Members whose name
 * is a slur or a sex word (crews saved before the nickname filter) are left out, so the crew page
 * and the rematch name chips never show them.
 */
export function crewStandings(crew: Crew): CrewMember[] {
    const members = crew && crew.members ? Object.keys(crew.members).map(k => crew.members[k])
        .filter(m => m && !nameFlag(m.nickname)) : [];
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

/**
 * Seasonal question packs. A pack game mixes up to `perGame` of the pack's questions (ones nobody in
 * the room has seen) into the normal questions. Pack questions never appear in other games.
 * `season` (dates in Israel, inclusive) is when the create page offers the pack switched on by
 * default and crew rematches use it; outside it the pack is still playable by link (?pack=<id>).
 */
export interface QuestionPack {
    perGame: number;
    season: { from: string; to: string };
    label: { en: string; he: string };
}

export const questionPacks: { [id: string]: QuestionPack } = {
    hanukkah: {
        perGame: 3,
        season: { from: '2026-12-01', to: '2026-12-13' },
        label: { en: 'Hanukkah questions', he: 'שאלות חנוכה' },
    },
};

export function isPack(id: any): boolean {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(questionPacks, id);
}

/** The pack whose season includes `now` (by the date in Israel), if any. */
export function seasonalPack(now: number = Date.now()): string | undefined {
    // Israel is UTC+2 in winter; close enough for a day-level season.
    const day = new Date(now + 2 * 3600 * 1000).toISOString().slice(0, 10);
    return Object.keys(questionPacks).find(id => {
        const s = questionPacks[id].season;
        return day >= s.from && day <= s.to;
    });
}

/** A campaign tag as typed in a post link: lowercase letters, digits and dashes, or nothing. */
export function cleanCampaign(tag: any): string | undefined {
    if (typeof tag !== 'string') {
        return undefined;
    }
    const t = tag.toLowerCase().trim();
    return /^[a-z0-9][a-z0-9-]{0,39}$/.test(t) ? t : undefined;
}

/**
 * The mark of a test game: the campaign tag `test`, or any tag that starts with `test-`
 * (`?via=test`, `?via=test-qa-lobby`). These tags are reserved: a real post must not use them.
 * A test game's rows are left out of every usage number (see DEPLOYING.md, "Test games").
 */
export const TEST_CAMPAIGN = 'test';

export function isTestCampaign(tag: any): boolean {
    const t = cleanCampaign(tag);
    return !!t && (t === TEST_CAMPAIGN || t.indexOf(TEST_CAMPAIGN + '-') === 0);
}

/** A player's best lie of the game, and how many players their lies fooled in all. */
export interface Highlight {
    text: string;       // the lie that fooled the most players (ties: the one that scored more, then the earlier one)
    fooled: number;     // players that lie fooled
    points: number;     // points that lie scored
    q?: string;         // the question it answered
    total: number;      // players fooled by all of this player's lies, all game
}

export interface Highlights {
    [pid: string]: Highlight;
}

/**
 * Adds one question's reveal to the game's highlights. Only players' own lies count (not the truth,
 * not house lies), and only once somebody picked them. Players who wrote the same lie share it.
 * Returns a new object; `previous` is left as it was.
 */
export function addHighlights(previous: Highlights | null | undefined, revealAnswers: RevealAnswer[] | null | undefined,
    question?: string): Highlights {
    const next: Highlights = {};
    Object.keys(previous || {}).forEach(pid => next[pid] = Object.assign({}, previous[pid]));

    (revealAnswers || []).forEach(row => {
        const fooled = row ? (row.selectors || []).length : 0;
        if (!fooled || row.realAnswer || row.houseLie) {
            return;
        }
        (row.creators || []).filter(pid => !!pid).forEach(pid => {
            const had = next[pid];
            const total = (had ? had.total || 0 : 0) + fooled;
            const better = !had || !had.text || fooled > (had.fooled || 0) ||
                (fooled === (had.fooled || 0) && (row.points || 0) > (had.points || 0));
            const best: Highlight = better
                ? { text: row.text, fooled, points: row.points || 0, total }
                : { text: had.text, fooled: had.fooled, points: had.points, total };
            const q = better ? question : had.q;
            if (typeof q === 'string' && q) {
                best.q = q;
            }
            next[pid] = best;
        });
    });

    return next;
}

/** Where a game's highlights count from: kept once set, else the question being revealed now. */
export function highlightsStart(previous: number | null | undefined, questionIndex: number | null | undefined): number {
    return typeof previous === 'number' ? previous : questionIndex || 0;
}

/** The players' rank order on the final screen: by score, ties share a place (1, 1, 3). */
export function finalPlaces(scores: number[]): number[] {
    return scores.map(s => 1 + scores.filter(o => (o || 0) > (s || 0)).length);
}
