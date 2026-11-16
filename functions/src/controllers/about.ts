/**
 * The "About us" questions (fun plan, move 6), a 50/50 test. See aboutOf in game-model for the play.
 *
 * Who gets them: half of the games made by a client that can show them (aboutUs: true), by the PIN, or
 * by the crew for a game that counts for a saved crew, so that a crew plays every one of its games in
 * the same half and "games per crew per week" can be compared between the halves. A game plays them
 * only when it leaves the lobby with three or more players: with two, one would write the truth and one
 * would guess alone. A game alone (the taste) never does.
 *
 * Where they go: two in a game of 5 or 7 questions, three in a game of 9, spread over the middle of the
 * game. Never the first question (the easy opener, and nobody has played yet, so the server cannot tell
 * who is at the table) and never the last (the final question stays a bank question, as its card says).
 * The bank question picked for that place stays in the game's list as the fallback: if the named player
 * sends nothing in time, it is played there, from the start of its own 25 seconds.
 *
 * Who is named: a player who has sent a lie or a pick in this game (so never an empty seat, see seats.ts),
 * not named before in this game while another such player is left, at random. Three such players are
 * needed, else the question is skipped and the bank question is played.
 *
 * The truth: the named player writes it on the writing screen while the others write their lies, in the
 * same 25 seconds. It is kept at games/{pin}/aboutTruth, which no phone may read, until the answers are
 * on the table. A lie that is the truth (a friend who knows them that well) is not a second answer: it is
 * left out, and its writer can still pick the truth. A small table gets house answers from the prompt
 * (about-prompts.ts) up to ABOUT_MIN_OPTIONS answers; a big one none, since every lie is a real one.
 *
 * In the usage rows: opened_games and closed_games carry about_us (the game's half, null outside the
 * test); question_results carries about (asked/played/fallback/skipped, null for a bank question) and
 * about_prompt. No answer anybody typed goes there.
 *
 * This file is pure (no Firebase) so it can be unit tested.
 */
import { createHash } from 'crypto';
import { Answers, GameScheme, GameState, GameStateInfo, About, AboutSlot, aboutOf } from '../game-model';
import { shuffle, Random, pickQuestions, SeenRecord } from './question-picker';
import { aboutPrompts, aboutPrompt, aboutPromptText } from './about-prompts';
import { isSameAnswer } from './same-answer';
import { normalize } from './answer-options';

/** A game plays About questions only when it leaves the lobby with this many players or more. */
export const ABOUT_MIN_PLAYERS = 3;

/** House answers fill an About question's list up to this many answers (lies, house answers and the truth). */
export const ABOUT_MIN_OPTIONS = 5;

/** The prefix of a prompt's id in a room's seen questions, so a crew meets every prompt before a repeat. */
export const ABOUT_SEEN_PREFIX = 'about-';

/**
 * Which half a game falls in: true for the About questions. The lowest bit of the first byte of
 * SHA-256('about-us:' + the crew's id, or the PIN in capitals). In BigQuery:
 *   MOD(TO_CODE_POINTS(SHA256(CONCAT('about-us:', IFNULL(crew_id, UPPER(id)))))[OFFSET(0)], 2) = 1
 * It says nothing about the staged reveal's half (another hash) or the lie helper's (a random draw).
 */
export function aboutHalf(pin: string, crew?: string): boolean {
    const key = crew ? String(crew) : String(pin).toUpperCase();
    return createHash('sha256').update('about-us:' + key, 'utf8').digest()[0] % 2 === 1;
}

/** The game's aboutUs: true or false for a game in the test, undefined for one that is not. */
export function drawAboutUs(clientCanShowIt: boolean, pin: string, crew?: string): boolean | undefined {
    if (clientCanShowIt !== true || !pin) {
        return undefined;
    }
    return aboutHalf(pin, crew);
}

/** How many About questions a game of `totalQ` questions gets: 2 for 5 or 7, 3 for 9. */
export function aboutCount(totalQ: number): number {
    if (!(totalQ >= 4)) {
        return 0;
    }
    return totalQ >= 9 ? 3 : 2;
}

/** The question indexes that are About questions: spread over 1 .. totalQ - 2 (5: 1, 3; 7: 2, 4; 9: 2, 4, 6). */
export function aboutSlots(totalQ: number): number[] {
    const count = aboutCount(totalQ);
    const places: number[] = [];
    for (let i = 1; i <= totalQ - 2; i++) {
        places.push(i);
    }
    if (!count || places.length < count) {
        return [];
    }
    const slots: number[] = [];
    for (let k = 1; k <= count; k++) {
        const at = Math.round(k * (places.length + 1) / (count + 1)) - 1;
        const place = places[Math.min(Math.max(at, 0), places.length - 1)];
        if (slots.indexOf(place) < 0) {
            slots.push(place);
        }
    }
    return slots;
}

/**
 * A pack game's questions, reordered so that no About place holds a pack question. The About question
 * takes the place's question, so a pack question there would be lost, and a Hanukkah game promises three.
 * Each pack question on an About place swaps with the nearest bank question on a place that is not an
 * About place, the later one on a tie (5: P A P A P; 7: P R A P A P R; 9: P R A P A R A P R). An About
 * question that falls back still plays the place's question, now a bank one. Nothing moves in a game
 * with no pack question on an About place.
 */
export function clearAboutPlaces(qids: string[], places: number[], isPackQuestion: (qid: string) => boolean): string[] {
    const result = (qids || []).slice();
    const about = new Set(places || []);
    const movable = (i: number) => !about.has(i) && !!result[i] && !isPackQuestion(result[i]);
    (places || []).forEach(place => {
        if (!result[place] || !isPackQuestion(result[place])) {
            return;
        }
        for (let d = 1; d < result.length; d++) {
            const to = [place + d, place - d].find(i => i >= 0 && i < result.length && movable(i));
            if (to !== undefined) {
                [result[place], result[to]] = [result[to], result[place]];
                return;
            }
        }
    });
    return result;
}

export function slotKey(questionIndex: number): string {
    return `q${questionIndex || 0}`;
}

/** Does this game, leaving its lobby now, play About questions? */
export function playsAboutUs(game: Partial<GameScheme> | null | undefined, taste: boolean): boolean {
    return !!game && game.aboutUs === true && !taste && Object.keys(game.players || {}).length >= ABOUT_MIN_PLAYERS &&
        aboutCount(game.totalQ) > 0;
}

/**
 * The game's About questions, written at START: which places, and which prompt each (ones the room has
 * not seen first, as with the bank's questions).
 */
export function planAbout(totalQ: number, seen: SeenRecord[], random: Random = Math.random): { [key: string]: AboutSlot } {
    const slots = aboutSlots(totalQ);
    const ids = aboutPrompts.map(p => ABOUT_SEEN_PREFIX + p.id);
    const picked = pickQuestions(ids, seen || [], slots.length, random).map(id => id.slice(ABOUT_SEEN_PREFIX.length));
    const plan: { [key: string]: AboutSlot } = {};
    slots.forEach((q, i) => {
        if (picked[i]) {
            plan[slotKey(q)] = { prompt: picked[i] };
        }
    });
    return plan;
}

/** The About question planned for this question index, if one is and it has not been asked yet. */
export function plannedSlot(game: Partial<GameScheme>, questionIndex: number): AboutSlot | null {
    const slot = game && game.aboutQs ? game.aboutQs[slotKey(questionIndex)] : null;
    return slot && !slot.result && aboutPrompt(slot.prompt) ? slot : null;
}

/** The seats that are playing: those that sent a lie or a pick in this game, or every seat in a game without the flags. */
function playingSeats(game: Partial<GameScheme>): string[] {
    const pids = Object.keys(game.players || {}).filter(pid => !!game.players[pid] && typeof game.players[pid] === 'object');
    if (typeof game.playedFrom !== 'number') {
        return pids;
    }
    return pids.filter(pid => !!(game.played && game.played[pid]));
}

/**
 * Whom the question is about: a playing seat not named yet in this game, at random; once each has been,
 * any playing seat. Null when fewer than ABOUT_MIN_PLAYERS seats are playing.
 */
export function nameFor(game: Partial<GameScheme>, random: Random = Math.random): string | null {
    const playing = playingSeats(game);
    if (playing.length < ABOUT_MIN_PLAYERS) {
        return null;
    }
    const named = Object.keys(game.aboutQs || {}).map(k => game.aboutQs[k] && game.aboutQs[k].pid).filter(p => !!p);
    const fresh = playing.filter(pid => named.indexOf(pid) < 0);
    return shuffle(fresh.length ? fresh : playing, random)[0];
}

/** The question as every screen shows it: the prompt in the game's language, with the player's name. */
export function aboutQuestionText(promptId: string, locale: string, nickname: string): string {
    const prompt = aboutPrompt(promptId);
    if (!prompt) {
        return '';
    }
    const name = String(nickname || '').trim() || '?';
    return aboutPromptText(prompt, locale).text.split('{name}').join(name);
}

/** The state of an About question: its `about`, for every phone to read. */
export function withAbout(state: GameStateInfo, about: About): GameStateInfo {
    return Object.assign({}, state, { about: { pid: about.pid, prompt: about.prompt } });
}

/**
 * The state of the bank question played in place of an About question that got no truth: it names the
 * player who sent none, so phones and the big screen can say why the question changed. Only that writing
 * step carries it: carryAbout does not, so the answers and the reveal look like any bank question's.
 */
export function withAboutMissed(state: GameStateInfo, pid: string): GameStateInfo {
    return Object.assign({}, state, { aboutMissed: { pid } });
}

/**
 * The state the game moves to keeps the question's `about` while it stays on the same question: from the
 * writing to the answers, the reveal and the scoreboard. A new question, or a round card, starts without it.
 */
export function carryAbout(from: GameStateInfo, to: GameStateInfo, update: Partial<GameScheme>): GameStateInfo {
    const about = aboutOf(from);
    const stays = [GameState.ShowAnswers, GameState.RevealTheTruth, GameState.ScoreBoard].indexOf(to.id) >= 0 &&
        (update.questionIndex === undefined || update.questionIndex === null);
    return about && stays && !aboutOf(to) ? withAbout(to, about) : to;
}

/** The named player's truth, if it is in and is theirs. */
export function truthOf(game: Partial<GameScheme>): { pid: string; text: string } | null {
    const about = aboutOf(game && game.state);
    const truth = game && game.aboutTruth;
    return about && truth && truth.pid === about.pid && typeof truth.text === 'string' && truth.text.trim()
        ? { pid: truth.pid, text: truth.text } : null;
}

/**
 * Who has sent on the writing screen: the players' lies, and on an About question the named player's
 * truth, which is kept apart from the lies (games/{pin}/aboutTruth).
 */
export function writingSent(game: Partial<GameScheme>): { [pid: string]: any } {
    const sent: { [pid: string]: any } = Object.assign({}, (game && game.answers) || {});
    const truth = truthOf(game);
    if (truth) {
        sent[truth.pid] = true;
    }
    return sent;
}

/** The player an About question is about while its answers are picked (they know the truth, so they do not pick), or null. */
export function notPicking(game: Partial<GameScheme>): string | null {
    const about = aboutOf(game && game.state);
    return about && game.state.id === GameState.ShowAnswers ? about.pid : null;
}

/**
 * The answers of an About question, as the table picks from them: the players' lies (less any that is the
 * truth), house answers from the prompt for a small table, and the named player's truth, written in the
 * same way as a lie (lower case, as typed) so that nothing in its look tells it apart.
 */
export function aboutAnswers(game: Partial<GameScheme>, truth: { pid: string; text: string }, promptId: string,
    newKey: () => string, random: Random = Math.random): Answers {
    const answers: Answers = {};
    const truthText = truth.text.toLowerCase();

    Object.keys(game.answers || {}).forEach(pid => {
        const lie = game.answers[pid];
        if (!lie || pid === truth.pid || typeof lie.text !== 'string' || !lie.text) {
            return;
        }
        // A friend wrote the truth itself: one answer, the truth, which that friend can still pick.
        if (isSameAnswer(lie.text, truthText)) {
            return;
        }
        answers[pid] = Object.assign({}, lie);
    });

    const prompt = aboutPrompt(promptId);
    const taken = new Set(Object.keys(answers).map(k => normalize(answers[k].text)));
    taken.add(normalize(truthText));
    const candidates = (prompt ? aboutPromptText(prompt, game.locale).house : [])
        .filter(text => !taken.has(normalize(text)) && !isSameAnswer(text, truthText) &&
            !Object.keys(answers).some(k => isSameAnswer(text, answers[k].text)));
    const needed = Math.max(0, ABOUT_MIN_OPTIONS - taken.size);
    shuffle(candidates, random).slice(0, needed).forEach(text => {
        answers[newKey()] = { text, houseLie: true, realAnswer: false };
    });

    answers.truth = { text: truthText, houseLie: false, realAnswer: true };
    return answers;
}

/** The columns of a question_results row for an About question (nulls for a bank question). */
export function aboutColumns(game: Partial<GameScheme>): { about: string | null; about_prompt: string | null } {
    const slot = game && game.aboutQs ? game.aboutQs[slotKey(game.questionIndex)] : null;
    return slot && slot.result
        ? { about: slot.result, about_prompt: slot.prompt || null }
        : { about: null, about_prompt: null };
}
