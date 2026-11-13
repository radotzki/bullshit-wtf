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
    // The game plays the staged reveal (its bigReveal is true). On every state of such a game, and
    // only there: this is where phones read it, since they cannot read bigReveal itself.
    staged?: boolean;
    // "Same time next week?", a 50/50 test, on the final state only, of a game that is a group's
    // second or later game of a sitting (a Replay, or a crew's game). true: the final screen offers the
    // button that sets next week's date. false: in the test, and the screen stays as it was. Absent: not
    // in the test. The half follows the sitting (see functions/src/controllers/next-week.ts).
    nextWeek?: boolean;
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
    // PIN of the first game of this sitting: copied from Replay to Replay. Absent on a sitting's first
    // game, which is its own root. A Replay of a taste starts a sitting (the taste was played alone).
    root?: string;
    // Players who tapped NEXT on the reveal. When every player has, the reveal ends early.
    revealDone?: { [pid: string]: boolean };
    // Seats that have sent a lie or a pick in this game, stored as each question's picks close.
    // From question 2 on, the "everyone answered" checks do not wait for the other seats.
    played?: { [pid: string]: boolean };
    // The question index `played` was first kept from: only ever 0. A game without it (one that was
    // already running when this was released) waits for every seat, as before.
    playedFrom?: number;
    // Set when the game ends: the seats that sent a lie, a pick or a NEXT on its last question, the
    // players still at the table. A Replay starts with these seats (fork.ts seatsForReplay). Server only.
    lastSent?: { [pid: string]: boolean };
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
    // The staged reveal, a 50/50 test set when the game is made, and only for a game made by a client
    // that can show it. true: the staged reveal, with the scoreboard folded into it. false: in the
    // test, and the game keeps today's reveal. Absent: not in the test (an older client made it, or it
    // was made before the test). It follows from the game's PIN and is independent of `coach`; each
    // Replay is a new game with a half of its own. Phones cannot read it: see state.staged.
    bigReveal?: boolean;
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
 * Players' lies nobody picked are not timed rows: they appear together after the truth, once all is
 * shown, each in a row of its own so it can be laughed at (see LAUGH_HOLD_MS).
 * Used by both the server (phase deadline) and the client (what to show when).
 */
export const revealTiming = {
    phones: { step: 1600, hold: 3000 },
    // A big screen plays a sound per row and the room reads it together: give each row more time.
    presenter: { step: 4500, hold: 3000 },
};

/**
 * Lies nobody picked appear only once every row is shown, so their only time to be laughed at is the
 * hold. When there are any, the hold lasts this much longer (both reveals, phones and big screen).
 * NEXT from every player still ends the reveal early.
 */
export const LAUGH_HOLD_MS = 1000;

/**
 * The staged reveal (games with bigReveal: true). Each row is three beats: the answer alone, then who
 * picked it (`pickersAt` ms into the row), then who wrote it, with the points (`writerAt`). Before the
 * truth, the last row, "And the truth is…" stands alone for `truthIntro` ms. During `hold` everyone
 * sees their own result and the scores with each player's change: such a game has no separate
 * scoreboard (its phase lasts 0 ms, see scoreBoardDuration), which pays for the slower rows.
 */
export const stagedRevealTiming = {
    phones: { step: 2400, pickersAt: 700, writerAt: 1400, truthIntro: 1200, hold: 3500 },
    presenter: { step: 4500, pickersAt: 1300, writerAt: 2600, truthIntro: 2000, hold: 5500 },
};

/** How long the scoreboard after each question lasts: not at all once the reveal shows the scores. */
export function scoreBoardDuration(staged?: boolean): number {
    return staged ? 0 : 3000;
}

export function revealRows(revealAnswers: RevealAnswer[] | undefined | null): number {
    return Math.max((revealAnswers || []).filter(a => (a.selectors && a.selectors.length) || a.realAnswer).length, 1);
}

export interface RevealSchedule {
    rows: number;
    step: number;
    // Into each row: when its pickers and its writer appear.
    pickersAt: number;
    writerAt: number;
    // Before the last row (the truth): how long "And the truth is…" stands alone.
    truthIntro: number;
    // When the last row's writer has been shown, and when the reveal ends (ms after it starts).
    allShown: number;
    duration: number;
    staged: boolean;
}

/**
 * The timetable of one reveal. `staged` must be the game's own bigReveal === true, on the server and
 * on every client, so that all of them agree. A client that does not know the staged reveal (an older
 * build) calls this with two arguments and plays today's faster rows inside the longer phase: its rows
 * end early, its NEXT button appears early, and the game moves on at the server's deadline all the same.
 */
export function revealSchedule(revealAnswers: RevealAnswer[] | undefined | null, presenter: boolean, staged = false): RevealSchedule {
    const rows = revealRows(revealAnswers);
    // Time to laugh at the lies nobody picked, which appear only at the end (see LAUGH_HOLD_MS).
    const laughHold = hasUnpickedLies(revealAnswers) ? LAUGH_HOLD_MS : 0;

    if (staged) {
        const t = presenter ? stagedRevealTiming.presenter : stagedRevealTiming.phones;
        const allShown = (rows - 1) * t.step + t.truthIntro + t.writerAt;
        return {
            rows, step: t.step, pickersAt: t.pickersAt, writerAt: t.writerAt, truthIntro: t.truthIntro,
            allShown, duration: allShown + t.hold + laughHold, staged: true,
        };
    }

    const timing = presenter ? revealTiming.presenter : revealTiming.phones;
    const allShown = rows * timing.step - timing.step / 2;
    return {
        rows, step: timing.step, pickersAt: 0, writerAt: timing.step / 2, truthIntro: 0,
        allShown, duration: allShown + timing.hold + laughHold, staged: false,
    };
}

/** When row `index` (from 0; the last row is the truth) appears, in ms after the reveal starts. */
export function revealRowStart(schedule: RevealSchedule, index: number): number {
    return index * schedule.step + (index >= schedule.rows - 1 ? schedule.truthIntro : 0);
}

export interface RevealMoment {
    // Rows on screen, and of those how many show their pickers and their writer.
    visibleRows: number;
    pickersShown: number;
    writersShown: number;
    // "And the truth is…" stands alone: the truth row is not on screen yet.
    truthIntro: boolean;
    allShown: boolean;
}

/** What the reveal shows `elapsed` ms after it started. Every screen works this out from server time. */
export function revealMoment(schedule: RevealSchedule, elapsed: number): RevealMoment {
    const rows = schedule.rows;
    let visibleRows = 0;
    let pickersShown = 0;
    let writersShown = 0;

    for (let i = 0; i < rows; i++) {
        const into = elapsed - revealRowStart(schedule, i);
        if (into >= 0 || i === 0) {
            visibleRows++;
        }
        if (into >= schedule.pickersAt) {
            pickersShown++;
        }
        if (into >= schedule.writerAt) {
            writersShown++;
        }
    }

    const truthFrom = (rows - 1) * schedule.step;
    return {
        visibleRows, pickersShown, writersShown,
        truthIntro: schedule.truthIntro > 0 && elapsed >= truthFrom && elapsed < truthFrom + schedule.truthIntro,
        allShown: elapsed >= schedule.allShown,
    };
}

/**
 * What one question did to each player's score, from the reveal rows alone (so a phone can show it
 * during the reveal, before the server adds it up): a lie's writer gets the row's points, a player who
 * found the truth gets the row's points, and a player who picked a house lie loses what `pointsBy` says.
 * Must agree with addQuestionScores in the functions' scoring.ts (functions/test/big-reveal.test.js checks).
 */
export function revealScoreChanges(revealAnswers: RevealAnswer[] | undefined | null): { [pid: string]: number } {
    const changes: { [pid: string]: number } = {};
    const add = (pid: string, points: number) => {
        if (pid) {
            changes[pid] = (changes[pid] || 0) + (points || 0);
        }
    };

    (revealAnswers || []).forEach(row => {
        if (!row) {
            return;
        }
        const selectors = row.selectors || [];
        if (row.realAnswer) {
            selectors.forEach(pid => add(pid, row.points));
        } else if (row.houseLie) {
            selectors.forEach(pid => add(pid, row.pointsBy && pid in row.pointsBy ? row.pointsBy[pid] : row.points));
        } else {
            (row.creators || []).forEach(pid => add(pid, row.points));
        }
    });

    return changes;
}

export interface Standing {
    pid: string;
    nickname: string;
    // The player's seat (their order in the game), which picks their avatar.
    seat: number;
    before: number;
    change: number;
    after: number;
    // Places from 1; players level on points share a place.
    placeBefore: number;
    placeAfter: number;
    // Row order on screen before and after the change (from 0, no ties: seat order breaks them).
    rowBefore: number;
    rowAfter: number;
}

/**
 * The scoreboard folded into the staged reveal: every player with their score before this question,
 * the change, and where they stood and stand. `players` hold the scores before the question, or after
 * it when `scoresIncludeChanges` (the server has already added them). In the order after the change.
 */
export function revealStandings(players: GamePlayers | undefined | null, changes: { [pid: string]: number },
    scoresIncludeChanges = false): Standing[] {
    const list: Standing[] = Object.keys(players || {}).map((pid, seat) => {
        const change = (changes || {})[pid] || 0;
        const score = players[pid].score || 0;
        const before = scoresIncludeChanges ? score - change : score;
        return {
            pid, seat, nickname: players[pid].nickname, before, change, after: before + change,
            placeBefore: 0, placeAfter: 0, rowBefore: 0, rowAfter: 0,
        };
    });

    const placesBefore = finalPlaces(list.map(s => s.before));
    const placesAfter = finalPlaces(list.map(s => s.after));
    list.forEach((s, i) => {
        s.placeBefore = placesBefore[i];
        s.placeAfter = placesAfter[i];
    });

    list.slice().sort((a, b) => b.before - a.before || a.seat - b.seat).forEach((s, i) => s.rowBefore = i);
    list.sort((a, b) => b.after - a.after || a.seat - b.seat).forEach((s, i) => s.rowAfter = i);
    return list;
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

/**
 * Is `pick` one made in the picks step `state`? A pick names the step it was made in, so one that a
 * phone kept while offline and sent in a later question is no pick there: it does not count, and
 * that phone can still pick. A pick with no step (from an older site) is taken as before.
 */
export function pickIsFor(pick: any, state: GameStateInfo): boolean {
    if (!pick || typeof pick !== 'object') {
        return false;
    }
    if (typeof pick.step !== 'string') {
        return true;
    }
    return !!state && state.id === GameState.ShowAnswers && typeof state.timestamp === 'number' && pick.step === sentMark(state);
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
    // The picks step the phone picked in (sentMark of that state). A phone that was offline sends its
    // pick when it is back, maybe in a later question: there it is no pick (see pickIsFor).
    // Picks from sites older than this field have none.
    step?: string;
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
    // Lies only (players' and house lies): the players who laughed at it during the reveal (see laugh.ts in
    // the functions). Written by the server, one key per player, while the reveal is on. Laughs give no points.
    laughs?: { [pid: string]: boolean };
}

/**
 * Laughs on lies. During the reveal every lie, picked or not, has a laugh button: a player may laugh at
 * as many lies as they like, once each, but never at their own. House lies take laughs too, so that no
 * button or count tells the room that the house wrote a lie before the reveal shows its writer: a row
 * with no button would. A phone cannot write a laugh itself (the database rules let it write only its
 * pick and its NEXT): it calls the `laugh` function, which writes revealAnswers/<row>/laughs/<pid>. The
 * counts show beside each lie; at the end of each question the server keeps each writer's most
 * laughed-at lie in the highlights (addLaughs), and the final screen names the funniest lie. Laughs on a
 * house lie are counted on the reveal and credited to nobody, so the funniest lie is always a player's.
 * Laughs give no points.
 */
export function laughCount(row: RevealAnswer | null | undefined): number {
    const laughs = row && row.laughs;
    return laughs && typeof laughs === 'object' ? Object.keys(laughs).filter(pid => laughs[pid] === true).length : 0;
}

/** A player's lie (not the truth, not a house lie): the lies that can be the funniest lie. */
export function isPlayerLie(row: RevealAnswer | null | undefined): boolean {
    return !!row && !row.realAnswer && !row.houseLie && typeof row.text === 'string' && !!row.text &&
        (row.creators || []).some(pid => !!pid);
}

/** A row that takes laughs: any lie, a player's or the house's (not the truth). */
export function isLie(row: RevealAnswer | null | undefined): boolean {
    return !!row && !row.realAnswer && typeof row.text === 'string' && !!row.text && (!!row.houseLie || isPlayerLie(row));
}

/** May `pid` laugh at this row? At any lie, the house's too, but never at a lie they wrote themselves. */
export function canLaugh(row: RevealAnswer | null | undefined, pid: string | null | undefined): boolean {
    return !!pid && isLie(row) && (row.creators || []).indexOf(pid) === -1;
}

/** Players' lies nobody picked: on the reveal they get rows of their own, after the truth. */
export function hasUnpickedLies(revealAnswers: RevealAnswer[] | undefined | null): boolean {
    return (revealAnswers || []).some(row => isPlayerLie(row) && !(row.selectors && row.selectors.length));
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
    // Made by "Same time next week?" with a name nobody typed ("Dana's crew"): the browser that made
    // it (creator) may still rename it from that sheet.
    auto?: boolean;
    // The crew's next game night, set by one player's tap (see functions/src/controllers/crew-night.ts).
    night?: CrewNight;
}

/**
 * A crew's next game night: when, who proposed it, and who said "I'm in" (keyed by crewMemberKey of
 * the nickname; the value is the nickname as typed, or true in older data).
 */
export interface CrewNight {
    time: number;
    by: string;
    in?: { [memberKey: string]: string | true };
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
    // The player's most laughed-at lie (see addLaughs). A player whose lies fooled nobody but got a
    // laugh has a highlight with an empty text and this.
    funny?: FunnyLie;
}

export interface FunnyLie {
    text: string;
    laughs: number;     // players who laughed at it
    q?: string;         // the question it answered
    n?: number;         // that question's index in the game
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
            if (had && had.funny) {
                best.funny = had.funny;
            }
            next[pid] = best;
        });
    });

    return next;
}

/**
 * Adds one question's laughs to the game's highlights: each writer keeps their most laughed-at lie
 * (ties: the earlier one; between writers, funniestLies prefers the later). Called by the server as the
 * question ends, once its laughs are in. Players who wrote the same lie share it. Returns `previous`
 * itself when no lie got a laugh, else a new object.
 */
export function addLaughs(previous: Highlights | null | undefined, revealAnswers: RevealAnswer[] | null | undefined,
    question?: string, questionIndex?: number): Highlights | null | undefined {
    const rows = (revealAnswers || []).filter(row => isPlayerLie(row) && laughCount(row) > 0);
    if (!rows.length) {
        return previous;
    }

    const next: Highlights = {};
    Object.keys(previous || {}).forEach(pid => next[pid] = Object.assign({}, previous[pid]));

    rows.forEach(row => {
        const laughs = laughCount(row);
        (row.creators || []).filter(pid => !!pid).forEach(pid => {
            const had = next[pid] || { text: '', fooled: 0, points: 0, total: 0 };
            if (had.funny && (had.funny.laughs || 0) >= laughs) {
                next[pid] = had;
                return;
            }
            const funny: FunnyLie = { text: row.text, laughs };
            if (typeof question === 'string' && question) {
                funny.q = question;
            }
            if (typeof questionIndex === 'number') {
                funny.n = questionIndex;
            }
            next[pid] = Object.assign({}, had, { funny });
        });
    });

    return next;
}

/**
 * The funniest lie of the game, for the final screen: the most laughed-at lie and the players who wrote
 * it (two, when they wrote the same lie), or none when no lie got a laugh. One lie wins: between lies
 * with as many laughs, the later one, which the room remembers best.
 */
export function funniestLies(highlights: Highlights | null | undefined): { text: string; laughs: number; pids: string[] }[] {
    const pids = Object.keys(highlights || {}).filter(pid => highlights[pid] && highlights[pid].funny &&
        typeof highlights[pid].funny.text === 'string' && (highlights[pid].funny.laughs || 0) > 0);
    const order = (pid: string) => typeof highlights[pid].funny.n === 'number' ? highlights[pid].funny.n : -1;
    const top = pids.slice()
        .sort((a, b) => highlights[b].funny.laughs - highlights[a].funny.laughs || order(b) - order(a))[0];
    if (!top) {
        return [];
    }
    const best = highlights[top].funny;
    const writers = pids.filter(pid => highlights[pid].funny.text === best.text && order(pid) === order(top) &&
        highlights[pid].funny.laughs === best.laughs);
    return [{ text: best.text, laughs: best.laughs, pids: writers }];
}

/** Where a game's highlights count from: kept once set, else the question being revealed now. */
export function highlightsStart(previous: number | null | undefined, questionIndex: number | null | undefined): number {
    return typeof previous === 'number' ? previous : questionIndex || 0;
}

/** The players' rank order on the final screen: by score, ties share a place (1, 1, 3). */
export function finalPlaces(scores: number[]): number[] {
    return scores.map(s => 1 + scores.filter(o => (o || 0) > (s || 0)).length);
}

/**
 * The taste: what a host who starts alone gets in place of a whole game. Nobody would read a lie
 * they wrote, so there is no writing: TASTE_QUESTIONS questions, each with the truth among
 * TASTE_OPTIONS - 1 house lies, a score, and then an invitation to play with friends.
 *
 * A game is a taste when it leaves the lobby with one player and no big screen (see taste.ts in the
 * functions). Phones learn it from the game's state, which every phone may read and only the server
 * may write: every state of a taste carries `taste`, from the first round card to the final screen.
 * A game of two or more players never carries it and plays exactly as before.
 */
export const TASTE_QUESTIONS = 5;
export const TASTE_OPTIONS = 4;

export interface Taste {
    // Questions on which the truth was picked, so far.
    found: number;
    // The length the host chose for the game. A Replay of a taste is a whole game of this length.
    length: number;
}

/** The game's state as a taste carries it. */
export interface TasteState extends GameStateInfo {
    taste?: Taste;
}

/** The taste a state carries, or null: for any game that is not one, and for anything unreadable. */
export function tasteOf(state: any): Taste | null {
    const taste = state && typeof state === 'object' ? state.taste : null;
    if (!taste || typeof taste !== 'object') {
        return null;
    }
    const count = (n: any) => typeof n === 'number' && isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    return { found: count(taste.found), length: count(taste.length) };
}
