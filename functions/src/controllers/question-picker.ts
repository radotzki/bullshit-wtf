/**
 * Picks questions for a game so that a group does not see repeats.
 *
 * Each device (anonymous Firebase uid) has a record of the questions it has
 * been shown: { [qid]: timestampSeen }. When a game starts we merge the
 * records of every player in the room and pick, in this order:
 *   1. questions nobody in the room has seen yet, at random;
 *   2. only when those run out, the questions the room saw longest ago.
 *
 * So a returning group sees every question in the bank before any repeat,
 * and once the bank is used up it cycles through the oldest ones first.
 *
 * This file is pure (no Firebase) so it can be unit tested.
 */

export interface SeenRecord {
    [qid: string]: number;
}

export type Random = () => number;

export function pickQuestions(
    allIds: string[],
    seenRecords: SeenRecord[],
    count: number,
    random: Random = Math.random,
): string[] {
    const lastSeen = mergeSeen(seenRecords);
    const unseen = shuffle(allIds.filter(id => !(id in lastSeen)), random);

    if (unseen.length >= count) {
        return unseen.slice(0, count);
    }

    const seenOldestFirst = shuffle(allIds.filter(id => id in lastSeen), random)
        .sort((a, b) => lastSeen[a] - lastSeen[b]);

    return unseen.concat(seenOldestFirst).slice(0, count);
}

/** For each question, the most recent time anyone in the room saw it. */
export function mergeSeen(seenRecords: SeenRecord[]): SeenRecord {
    const merged: SeenRecord = {};

    seenRecords.forEach(record => {
        Object.keys(record || {}).forEach(qid => {
            const ts = record[qid];
            if (!(qid in merged) || ts > merged[qid]) {
                merged[qid] = ts;
            }
        });
    });

    return merged;
}

/** Fisher-Yates shuffle; returns a new array. */
export function shuffle<T>(items: T[], random: Random = Math.random): T[] {
    const arr = items.slice();

    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
    }

    return arr;
}
