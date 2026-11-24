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

/**
 * Picks a game's questions with a seasonal pack mixed in: up to `perGame` pack questions nobody
 * in the room has seen (a pack question is never repeated), the rest from the normal bank as
 * pickQuestions does. The pack questions are spread out, the first one opening the game.
 * `openerIds`: pack questions most players already half know (the pack's `openers`). While the
 * room has one it hasn't seen, the game opens with it, so a family's first question is one the
 * grandparents and the kids can play, not an obscure one; the other pack questions are picked as before.
 */
export function pickWithPack(
    regularIds: string[],
    packIds: string[],
    seenRecords: SeenRecord[],
    count: number,
    perGame: number,
    random: Random = Math.random,
    openerIds: string[] = [],
): string[] {
    const lastSeen = mergeSeen(seenRecords);
    const freshPack = packIds.filter(id => !(id in lastSeen));
    const opener = count > 0 && perGame > 0
        ? shuffle(freshPack.filter(id => openerIds.indexOf(id) >= 0), random)[0]
        : undefined;
    const pack = (opener ? [opener] : []).concat(shuffle(freshPack.filter(id => id !== opener), random))
        .slice(0, Math.max(0, Math.min(perGame, count)));
    const regular = pickQuestions(regularIds, seenRecords, count - pack.length, random);

    // Short of normal questions (tiny bank): top up with more fresh pack questions.
    const extra = shuffle(freshPack.filter(id => pack.indexOf(id) < 0), random)
        .slice(0, Math.max(0, count - pack.length - regular.length));
    const packAll = pack.concat(extra);

    const result: string[] = [];
    const slots = new Set(packAll.map((_, i) => Math.round(i * count / packAll.length)));
    let p = 0;
    let r = 0;
    for (let i = 0; i < count && (p < packAll.length || r < regular.length); i++) {
        if ((slots.has(i) && p < packAll.length) || r >= regular.length) {
            result.push(packAll[p++]);
        } else {
            result.push(regular[r++]);
        }
    }
    return result;
}

/**
 * Picks a game's questions with an easy opener first: question 1 is an opener nobody in the room
 * has seen, the rest are picked as before (with the pack, if any). Openers are kept for question 1,
 * so a room meets every opener before any of them shows up again. Once a room has seen them all,
 * they join the normal bank and question 1 is picked like the others.
 */
export function pickWithOpener(
    regularIds: string[],
    openerIds: string[],
    seenRecords: SeenRecord[],
    count: number,
    pickRest: (regularIds: string[], count: number) => string[],
    random: Random = Math.random,
): string[] {
    if (count <= 0) {
        return [];
    }
    const lastSeen = mergeSeen(seenRecords);
    const opener = shuffle(openerIds.filter(id => !(id in lastSeen)), random)[0];
    if (!opener) {
        return pickRest(regularIds.concat(openerIds), count);
    }
    return [opener].concat(pickRest(regularIds, count - 1));
}

/**
 * A kids game in a holiday's season: puts up to `perGame` of the season's kid-friendly questions
 * (QuestionPack.kidsToo) that nobody in the room has seen into a kids game's picked questions,
 * spread out, never as question 1 (the kids' own opener stays) and never at an index in `avoid`
 * (the About questions' slots, which would replace them). With none left fresh, or none given,
 * the game is the kids' questions as picked.
 */
export function withSeasonKids(
    qids: string[],
    seasonIds: string[],
    seenRecords: SeenRecord[],
    perGame: number,
    random: Random = Math.random,
    avoid: number[] = [],
): string[] {
    const lastSeen = mergeSeen(seenRecords);
    const fresh = shuffle(seasonIds.filter(id => !(id in lastSeen) && qids.indexOf(id) < 0), random);
    const all = qids.map((_, i) => i).slice(1);
    const free = all.filter(i => avoid.indexOf(i) < 0);
    const places = free.length ? free : all;
    const n = Math.max(0, Math.min(perGame, fresh.length, places.length));
    const result = qids.slice();
    for (let k = 1; k <= n; k++) {
        result[places[Math.round(k * (places.length + 1) / (n + 1)) - 1]] = fresh[k - 1];
    }
    return result;
}
