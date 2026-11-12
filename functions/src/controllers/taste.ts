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
 * This file is pure (no Firebase) so it can be unit tested.
 */
import { GameScheme, GameStateInfo, RevealAnswer, Taste, TASTE_OPTIONS, TASTE_QUESTIONS, tasteOf } from '../game-model';
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

/** What a taste starts with: nothing found yet, and the length the host chose kept for a Replay. */
export function newTaste(game: Partial<GameScheme>): Taste {
    const length = Number(game && game.totalQ);
    return { found: 0, length: isFinite(length) && length > 0 ? Math.floor(length) : TASTE_QUESTIONS };
}

/** The house lies of one taste question: up to TASTE_OPTIONS - 1 of the question's fake answers. */
export function tasteHouseLies(fakeAnswers: string[], realAnswer: string, random: Random = Math.random): string[] {
    const real = normalize(realAnswer);
    const candidates: string[] = [];
    (fakeAnswers || []).forEach(text => {
        const key = normalize(text);
        if (key && key !== real && !candidates.some(c => normalize(c) === key)) {
            candidates.push(text);
        }
    });
    return shuffle(candidates, random).slice(0, TASTE_OPTIONS - 1);
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
    const found = taste.found + (update && update.revealAnswers && truthFound(update.revealAnswers) ? 1 : 0);
    return { found, length: taste.length };
}

/** The state with the taste on it. */
export function withTaste(state: GameStateInfo, taste: Taste): GameStateInfo {
    return Object.assign({}, state, { taste: { found: taste.found, length: taste.length } });
}

/**
 * The length of the game a Replay makes: a taste's Replay is a whole game again, of the length its
 * host chose in the first place; any other game's Replay keeps its length, as before.
 */
export function replayLength(game: Partial<GameScheme> | null | undefined): number {
    const taste = gameTaste(game);
    return taste && taste.length > 0 ? taste.length : (game ? game.totalQ : undefined);
}
