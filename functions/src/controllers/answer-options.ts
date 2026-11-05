/**
 * How many answers players pick from, and which house lies fill the screen.
 *
 * Before: house lies only topped the answers up to one per player, so in a
 * 3-player game with three different lies nobody got a house lie, and each
 * player (whose own lie is hidden) picked from just 3 answers. The truth was
 * easy to spot.
 *
 * Now there are always at least MIN_OPTIONS different answers on the screen
 * (players' lies + house lies + the truth), so a player who wrote a lie sees
 * at least MIN_OPTIONS - 1 to pick from, as long as the question has enough
 * fake answers. Bigger groups keep the old rule: one answer per player plus
 * the truth.
 *
 * This file is pure (no Firebase) so it can be unit tested.
 */
import { shuffle, Random } from './question-picker';

export const MIN_OPTIONS = 6;

export function normalize(text: string): string {
    return (text || '').trim().toLowerCase();
}

export function pickHouseLies(
    fakeAnswers: string[],
    playerAnswers: string[],
    realAnswer: string,
    playersCount: number,
    random: Random = Math.random,
): string[] {
    const taken = new Set((playerAnswers || []).map(normalize).filter(t => t));
    taken.add(normalize(realAnswer));

    const candidates: string[] = [];
    (fakeAnswers || []).forEach(text => {
        const key = normalize(text);
        if (key && !taken.has(key) && !candidates.some(c => normalize(c) === key)) {
            candidates.push(text);
        }
    });

    const target = Math.max(playersCount + 1, MIN_OPTIONS);
    const needed = Math.max(0, target - taken.size);

    return shuffle(candidates, random).slice(0, needed);
}
