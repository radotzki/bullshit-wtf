/**
 * "Pick a decoy", a 50/50 test on two-player games.
 *
 * At a table of two, a pick that is not the truth used to land on the friend's one lie or on one of
 * three neutral house lies, so about four rounds in five fooled nobody. In a pair game (pair: true)
 * there are no neutral house lies. Each player is offered up to two house lies of their own (the lie
 * helper's ideas, pickIdeas, on every question, so a lie offered to one is never offered to the other)
 * and picks one as their decoy, with one tap on the writing screen. Each phone then sees three
 * answers: the truth, the friend's lie and the friend's decoy. A decoy that fools pays its owner half
 * a lie's points; the friend who fell for it loses nothing.
 *
 * The half is set once at START, for games with exactly two players that are not a taste: one bit of
 * a hash of the PIN with its own salt, the same method as the staged reveal (stagedHalf), so it is
 * independent of it. In BigQuery, with the PIN in column id:
 *   MOD(TO_CODE_POINTS(SHA256(CONCAT('pair:', UPPER(id))))[OFFSET(0)], 2) = 1
 * A Replay that still has two players keeps its parent's half, so a pair doesn't switch modes between
 * games. Games of three or more are not in the test (pair absent) and play as before.
 *
 * This file is pure (no Firebase) so it can be unit tested.
 */
import { createHash } from 'crypto';
import { normalize } from './answer-options';
import { Random } from './question-picker';
import { Answers, GameScheme } from '../game-model';

/** What a decoy that fools the friend is worth, by round: half a lie (the size of a house lie's penalty). */
export const DECOY_POINTS = [250, 375, 500];

/** Which half a PIN falls in: true for decoys. The lowest bit of the first byte of SHA-256('pair:' + PIN). */
export function pairHalf(pin: string): boolean {
    const digest = createHash('sha256').update('pair:' + String(pin).toUpperCase(), 'utf8').digest();
    return digest[0] % 2 === 1;
}

/**
 * The game's pair value at START: true or false for a game in the test, undefined for one that is not.
 * `parentPair` is the pair value of the game this one was replayed from, if any.
 */
export function drawPair(playersCount: number, pin: string, parentPair?: boolean | null): boolean | undefined {
    if (playersCount !== 2) {
        return undefined;
    }
    if (parentPair === true || parentPair === false) {
        return parentPair;
    }
    return pairHalf(pin);
}

/** Is `text` one of the player's offers (case and spacing do not matter)? The offer as offered, or null. */
export function matchOffer(offers: string[] | null | undefined, text: any): string | null {
    const key = typeof text === 'string' ? normalize(text) : '';
    if (!key) {
        return null;
    }
    return (offers || []).filter(o => typeof o === 'string' && normalize(o) === key)[0] || null;
}

/**
 * The decoy a player gets when the answers go on the table: the one they chose if it is still one of
 * their offers and no answer on the table has its text (a lie, the truth), else one of their other
 * offers at random, else none. `takenTexts` are every answer already on the table.
 */
export function chooseDecoy(
    offers: string[] | null | undefined,
    chosen: string | null | undefined,
    takenTexts: string[],
    random: Random = Math.random,
): string | null {
    const taken = new Set((takenTexts || []).map(t => normalize(t)).filter(t => !!t));
    const free = (offers || []).filter(o => typeof o === 'string' && !!normalize(o) && !taken.has(normalize(o)));
    if (!free.length) {
        return null;
    }
    const picked = matchOffer(free, chosen);
    if (picked) {
        return picked;
    }
    return free[Math.min(free.length - 1, Math.floor(random() * free.length))];
}

/**
 * A pair game's answers besides the lies and the truth: no neutral house lies, and each player still
 * in the game who has offers gets a decoy, the one they chose or one of their offers (see chooseDecoy),
 * under a key of its own. That includes a player who wrote no lie: otherwise, when only one of the two
 * writes, the writer's phone would list the truth alone (their own lie and decoy are hidden from them).
 * A decoy never has the text of a lie, of the truth or of the other decoy.
 * null when nobody wrote a lie: the question then gets house lies as in any game, so it still has
 * answers to pick from.
 */
export function pairDecoys(game: GameScheme, realAnswer: string, newKey: () => string, random: Random = Math.random): Answers | null {
    const answers = game.answers || {};
    const writers = Object.keys(answers)
        .filter(pid => !!answers[pid] && !answers[pid].houseLie && !answers[pid].realAnswer && !!(game.players || {})[pid])
        .sort();
    if (!writers.length) {
        return null;
    }
    const taken = writers.map(pid => answers[pid].text).concat([realAnswer]);
    const players = game.players || {};
    const present = Object.keys(players).filter(pid => !!players[pid]).sort();
    const res: Answers = {};
    present.forEach(pid => {
        const text = chooseDecoy((game.ideas || {})[pid], (game.decoys || {})[pid], taken, random);
        if (text) {
            taken.push(text);
            res[newKey()] = { text, houseLie: false, realAnswer: false, decoyOf: pid };
        }
    });
    return res;
}
