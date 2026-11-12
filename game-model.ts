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
 * Answers nobody picked get no row: they are listed together at the end, at no extra time.
 * Used by both the server (phase deadline) and the client (what to show when).
 */
export const revealTiming = {
    phones: { step: 1600, hold: 3000 },
    // A big screen plays a sound per row and the room reads it together: give each row more time.
    presenter: { step: 4500, hold: 3000 },
};

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

    if (staged) {
        const t = presenter ? stagedRevealTiming.presenter : stagedRevealTiming.phones;
        const allShown = (rows - 1) * t.step + t.truthIntro + t.writerAt;
        return {
            rows, step: t.step, pickersAt: t.pickersAt, writerAt: t.writerAt, truthIntro: t.truthIntro,
            allShown, duration: allShown + t.hold, staged: true,
        };
    }

    const timing = presenter ? revealTiming.presenter : revealTiming.phones;
    const allShown = rows * timing.step - timing.step / 2;
    return {
        rows, step: timing.step, pickersAt: 0, writerAt: timing.step / 2, truthIntro: 0,
        allShown, duration: allShown + timing.hold, staged: false,
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
