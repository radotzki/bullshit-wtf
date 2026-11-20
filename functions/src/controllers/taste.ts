/**
 * The taste: five pick-only questions for a host who starts alone (see TASTE_QUESTIONS in game-model).
 *
 * A whole game alone has nobody to fool: the lone host wrote a lie that nobody read, for 25 seconds a
 * question. Of the ten games started alone from 6 to 12 November 2026, eight were left within three
 * questions. A taste skips the writing: the question goes straight to its answers, the truth among
 * three house lies, and the final screen asks the player to bring friends.
 *
 * The server decides, when the game leaves the lobby: one player and no big screen. So a lobby that a
 * second player joined before START is a whole game, and a game on a big screen is one too. A phone
 * still on an older site gets the taste as well: its screens follow the game's state as before, and
 * it never passes the writing screen.
 *
 * In the usage rows a taste is a game with players = 1: opened_games and closed_games carry
 * questions = 5, and its question_results rows carry lies = 0 and total_q = 5. No column is new.
 *
 * A solo run (SoloRun in game-model) is a taste its host started as one: it goes on until the player
 * is fooled SOLO_RUN_LIVES times, with total_q = questions = SOLO_RUN_MAX in those rows.
 *
 * This file is pure (no Firebase) so it can be unit tested.
 */
import {
    GameScheme, GameState, GameStateInfo, RevealAnswer, Taste, TASTE_OPTIONS, TASTE_QUESTIONS, tasteOf, newSoloRun, nextSoloRun,
    soloRunOptions,
} from '../game-model';
import { shuffle, Random } from './question-picker';
import { normalize } from './answer-options';

/** Does this game, still in its lobby, start as a taste? One player, and no big screen. */
export function startsAsTaste(game: Partial<GameScheme> | null | undefined): boolean {
    return !!game && !game.presenter && Object.keys(game.players || {}).length === 1;
}

/** The taste a running game is, or null for every other game. */
export function gameTaste(game: Partial<GameScheme> | null | undefined): Taste | null {
    return tasteOf(game && game.state);
}

/**
 * What a taste starts with: nothing found yet, and the length the host chose kept for a Replay.
 * A game whose host started it as a solo run (soloRun, written by startGame) carries the run too.
 */
export function newTaste(game: Partial<GameScheme>): Taste {
    const length = Number(game && game.totalQ);
    const taste: Taste = { found: 0, length: isFinite(length) && length > 0 ? Math.floor(length) : TASTE_QUESTIONS };
    if (game && game.soloRun === true) {
        taste.run = newSoloRun();
    }
    return taste;
}

/** How many answers a taste's question `qIndex` shows: TASTE_OPTIONS, or a run's (soloRunOptions). */
export function tasteOptions(taste: Taste | null, qIndex: number): number {
    return taste && taste.run ? soloRunOptions(qIndex) : TASTE_OPTIONS;
}

/** The house lies of one taste question: up to `options` - 1 (TASTE_OPTIONS - 1) of the question's fake answers. */
export function tasteHouseLies(fakeAnswers: string[], realAnswer: string, random: Random = Math.random,
    options = TASTE_OPTIONS): string[] {
    const real = normalize(realAnswer);
    const candidates: string[] = [];
    (fakeAnswers || []).forEach(text => {
        const key = normalize(text);
        if (key && key !== real && !candidates.some(c => normalize(c) === key)) {
            candidates.push(text);
        }
    });
    return shuffle(candidates, random).slice(0, Math.max(1, options - 1));
}

/** Was the truth picked on the question these reveal rows are for? */
export function truthFound(revealAnswers: RevealAnswer[] | null | undefined): boolean {
    return (Array.isArray(revealAnswers) ? revealAnswers : [])
        .some(row => !!row && row.realAnswer === true && Array.isArray(row.selectors) && row.selectors.length > 0);
}

/**
 * The taste as the next state carries it: the same one, with one more found when this step revealed
 * a question on which the truth was picked.
 */
export function nextTaste(taste: Taste, update: Partial<GameScheme>): Taste {
    const hit = !!(update && update.revealAnswers && truthFound(update.revealAnswers));
    const next: Taste = { found: taste.found + (hit ? 1 : 0), length: taste.length };
    if (taste.run) {
        // A run counts each reveal: the truth found, or a life lost (fooled, or nothing picked in time).
        const id = update && update.state ? update.state.id : null;
        next.run = id === GameState.RevealTheTruth ? nextSoloRun(taste.run, hit)
            : id === GameState.ShowAnswers ? withoutGain(taste.run) : Object.assign({}, taste.run);
    }
    return next;
}

/** The run as a new question carries it: a life given back shows on its reveal and scoreboard only. */
function withoutGain(run: Taste['run']): Taste['run'] {
    return { lives: run.lives, streak: run.streak, bestStreak: run.bestStreak };
}

/** The state with the taste on it. */
export function withTaste(state: GameStateInfo, taste: Taste): GameStateInfo {
    const copy: Taste = { found: taste.found, length: taste.length };
    if (taste.run) {
        copy.run = Object.assign({}, taste.run);
    }
    return Object.assign({}, state, { taste: copy });
}

/**
 * The length of the game a Replay makes: a taste's Replay is a whole game again, of the length its
 * host chose in the first place; any other game's Replay keeps its length, as before.
 */
export function replayLength(game: Partial<GameScheme> | null | undefined): number {
    const taste = gameTaste(game);
    return taste && taste.length > 0 ? taste.length : (game ? game.totalQ : undefined);
}
