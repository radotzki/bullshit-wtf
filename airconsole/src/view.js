// What the screen and the controllers show, worked out from the game's rows. No DOM and no
// AirConsole here, so all of it is unit tested (airconsole/test/view.test.js).
// The rules come from the game's own shared model (game-model.ts in the repository root), so the
// AirConsole version scores, waits and reveals exactly as the site does.

import {
    GameState, MAX_PLAYERS, cleanCampaign, isTestCampaign, waitingRow, revealSchedule, revealRowStart, revealRows,
} from '../../game-model';
import { answersList } from '../../game/src/app/services/answers-list';
import { resultLines } from '../../game/src/app/pages/reveal-the-truth/reveal-strings';
import { biggestBullshitters } from '../../game/src/app/pages/score-board-final/biggest';

export { GameState, MAX_PLAYERS };

/** The campaign tag of every game started from AirConsole: the scorecard counts its groups by it. */
export const AIRCONSOLE_TAG = 'portal-airconsole';

/** Fewer players than this and START waits. The checklist asks the screen to say how many are missing. */
export const MIN_PLAYERS = 2;

/** Questions in a game: the site's default, three rounds of rising points. */
export const QUESTIONS = 5;

/** The points of each round, as the site's round screen shows them (round-intro.component.ts). */
export const ROUND_POINTS = [
    { truth: 1000, bullshit: 500 },
    { truth: 1500, bullshit: 750 },
    { truth: 2000, bullshit: 1000 },
];

/** The phones wait this long past a deadline before they nudge the server, as the site's phones do. */
export const TICK_FALLBACK_MS = 2500;

/** The big screen reports in this often while the lobby is open (the site's HOST_PING_MS). */
export const HOST_PING_MS = 20 * 1000;

// The tag must stay a campaign the server keeps, and never one that marks a test game.
if (cleanCampaign(AIRCONSOLE_TAG) !== AIRCONSOLE_TAG || isTestCampaign(AIRCONSOLE_TAG)) {
    throw new Error('the AirConsole tag would not be counted');
}

/** The game's language for an AirConsole language tag ("he", "he-IL", the old "iw"): Hebrew or English. */
export function localeFor(languageTag) {
    return /^(he|iw)(\b|-|_|$)/i.test(String(languageTag || '')) ? 'he' : 'en';
}

/** A random host key, in the form the server takes (16 to 64 of A-Z, a-z, 0-9). */
export function newHostKey(random) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = random ? random(24) : fallbackBytes(24);
    let key = '';
    for (let i = 0; i < bytes.length; i++) {
        key += chars[bytes[i] % chars.length];
    }
    return key;
}

function fallbackBytes(n) {
    const bytes = new Uint8Array(n);
    try {
        crypto.getRandomValues(bytes);
    } catch (e) {
        for (let i = 0; i < n; i++) {
            bytes[i] = Math.floor(Math.random() * 256);
        }
    }
    return bytes;
}

/** The body of the newGame call the big screen makes. */
export function newGameBody(locale, uid, hostKey, waitedMs) {
    return {
        // A visit's first page: the server keeps it for opened_games.first_page (see cleanArrival).
        arrival: { page: '/portal/airconsole' },
        locale: locale === 'he' ? 'he' : 'en',
        count: QUESTIONS,
        uid: uid || undefined,
        pack: null,
        campaign: AIRCONSOLE_TAG,
        clientWaitMs: waitedMs || 0,
        hostKey,
        // START comes through the startGame function, from the big screen that holds the host key.
        serverStart: true,
        // This first version shows the site's plain reveal, and no About questions: it asks for neither test.
        stagedReveal: false,
        aboutUs: false,
    };
}

/** The players in seat order (the order the server keeps them in), each with their seat's picture. */
export function seats(players) {
    const row = waitingRow(players, null, 0, 0);
    return row.seats.map(s => ({
        pid: s.pid,
        nickname: s.nickname,
        index: s.index,
        avatar: s.index % MAX_PLAYERS,
        score: (players[s.pid] && typeof players[s.pid].score === 'number') ? players[s.pid].score : 0,
    }));
}

/** Who has sent their lie (or pick) in this phase, and who the room still waits for. */
export function waiting(players, state, questionIndex, gameTimestamp) {
    const row = waitingRow(players, state, questionIndex, gameTimestamp);
    return row.seats.map(s => ({ pid: s.pid, nickname: s.nickname, avatar: s.index % MAX_PLAYERS, done: s.done, away: s.away }));
}

/** The lobby's line: how many players are missing, or who presses START. */
export function lobbyLine(playerCount, masterName, t) {
    if (playerCount < MIN_PLAYERS) {
        return t.needMore(MIN_PLAYERS - playerCount);
    }
    return masterName ? t.masterStarts(masterName) : '';
}

/** Players by score, highest first, with their place (players on the same score share it). */
export function ranking(players) {
    const list = seats(players || {}).slice().sort((a, b) => b.score - a.score || a.index - b.index);
    let place = 0;
    let last = null;
    return list.map((p, i) => {
        if (p.score !== last) {
            place = i + 1;
            last = p.score;
        }
        return Object.assign({}, p, { place });
    });
}

/** The winners: everyone on the top score, if anyone scored. */
export function winners(players) {
    const list = ranking(players);
    if (!list.length) {
        return [];
    }
    return list.filter(p => p.place === 1);
}

/** The answers a player may pick: every text once, sorted, without their own lie (answers-list.ts). */
export function pickList(answers, ownPid) {
    return answersList(answers || {}, ownPid || undefined);
}

/**
 * What the big screen sends the controllers for the picks: each answer's text, and for a pair game's
 * decoy whose it is (a player may not be offered their own decoy). Never which one is the truth.
 */
export function picksForControllers(answers) {
    const all = answers || {};
    const out = {};
    Object.keys(all).forEach(k => {
        const a = all[k];
        if (!a || typeof a.text !== 'string') {
            return;
        }
        out[k] = a.decoyOf ? { text: a.text, decoyOf: a.decoyOf } : { text: a.text };
    });
    return out;
}

function nameOf(players, pid) {
    const p = players && players[pid];
    return p && p.nickname ? String(p.nickname) : '';
}

/** The reveal's rows as the screen shows them, in the server's order (the truth last). */
export function revealView(revealAnswers, players) {
    const shown = (revealAnswers || []).filter(a => (a.selectors && a.selectors.length) || a.realAnswer);
    const unpicked = (revealAnswers || []).filter(a => !a.realAnswer && !(a.selectors && a.selectors.length));
    const row = a => ({
        text: a.text,
        realAnswer: !!a.realAnswer,
        houseLie: !!a.houseLie,
        decoy: !!a.decoy,
        points: a.points || 0,
        pickers: (a.selectors || []).map(pid => nameOf(players, pid)).filter(Boolean),
        writers: (a.creators || []).map(pid => nameOf(players, pid)).filter(Boolean),
    });
    return {
        rows: shown.map(row),
        unpicked: unpicked.filter(a => !a.houseLie && !a.decoy).map(row),
    };
}

/** When each reveal row appears on the big screen, and how long the reveal lasts (game-model's schedule). */
export function revealTimes(revealAnswers) {
    const schedule = revealSchedule(revealAnswers, true, false);
    const starts = [];
    for (let i = 0; i < revealRows(revealAnswers); i++) {
        starts.push(revealRowStart(schedule, i));
    }
    return { starts, writerAt: schedule.writerAt, allShown: schedule.allShown, duration: schedule.duration };
}

/** The reveal's rows as a controller needs them for its own result lines (no names it can't use). */
export function revealForControllers(revealAnswers) {
    return (revealAnswers || []).map(a => ({
        realAnswer: !!a.realAnswer,
        houseLie: !!a.houseLie,
        decoy: !!a.decoy,
        points: a.points || 0,
        pointsBy: a.pointsBy || undefined,
        pickerIds: (a.selectors || []).slice(),
        creatorIds: (a.creators || []).slice(),
    }));
}

/** One player's lines on how they did this question, in the site's words (reveal-strings.ts). */
export function myResult(pid, rows, players, t) {
    const named = (rows || []).map(r => Object.assign({}, r, {
        pickerIds: r.pickerIds || [],
        creatorIds: r.creatorIds || [],
        pickerNames: (r.pickerIds || []).map(id => nameOf(players, id)).filter(Boolean),
        creatorNames: (r.creatorIds || []).map(id => nameOf(players, id)).filter(Boolean),
    }));
    return resultLines(pid, named, t);
}

/** The final's BIGGEST BULLSHITTER names and each player's best lie, from games/<pin>/highlights. */
export function finalHighlights(players, highlights) {
    const hl = highlights || {};
    const list = seats(players || {}).map(p => ({ pid: p.pid, nickname: p.nickname, best: hl[p.pid] }));
    const biggest = biggestBullshitters(list);
    const best = list
        .filter(p => p.best && p.best.text && p.best.fooled > 0)
        .sort((a, b) => b.best.fooled - a.best.fooled || b.best.points - a.best.points)[0];
    return {
        biggest: biggest.map(pid => nameOf(players, pid)).filter(Boolean),
        bestLie: best ? { nickname: best.nickname, text: best.best.text } : null,
    };
}

/** The question with its blank drawn as a line, as the site's bsQuestion pipe does. */
export function questionText(q) {
    return String(q || '').replace(/\$\s?blank\s?\$/gi, '________');
}

/** The key that names one occurrence of a phase (game.service.ts phaseKey). */
export function phaseKey(state) {
    return state && typeof state.id === 'number' ? `${state.id}:${state.timestamp}` : '';
}

/**
 * The state the big screen shares with every controller through AirConsole (its custom device state).
 * Only what a controller shows: never the truth before the reveal, and no host key.
 */
export function sharedState(game, extra) {
    const state = game.state || null;
    const step = state ? state.id : null;
    const out = {
        v: 1,
        pin: game.pin || null,
        locale: game.locale === 'he' ? 'he' : 'en',
        step,
        key: phaseKey(state),
        // Milliseconds left in the phase when this was sent; each controller counts down from its own clock.
        endsIn: state && typeof state.deadline === 'number' && typeof extra.serverNow === 'number'
            ? Math.max(0, state.deadline - extra.serverNow) : null,
        round: typeof game.roundIndex === 'number' ? game.roundIndex : 0,
        qi: typeof game.questionIndex === 'number' ? game.questionIndex : 0,
        total: typeof game.totalQ === 'number' ? game.totalQ : QUESTIONS,
        players: seats(game.players || {}).map(p => ({ pid: p.pid, nickname: p.nickname, avatar: p.avatar, score: p.score })),
        master: typeof extra.master === 'number' ? extra.master : null,
        error: extra.error || null,
    };
    if (step === GameState.ShowQuestion) {
        out.question = game.currentQ || null;
    }
    if (step === GameState.ShowAnswers) {
        out.question = game.currentQ || null;
        out.picks = picksForControllers(game.answers);
    }
    if (step === GameState.RevealTheTruth) {
        out.reveal = revealForControllers(game.revealAnswers);
        out.revealIn = typeof extra.revealAllShown === 'number' ? extra.revealAllShown : null;
    }
    return out;
}
