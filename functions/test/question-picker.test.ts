import * as assert from 'assert';
import { pickQuestions, mergeSeen, shuffle, SeenRecord } from '../src/controllers/question-picker';

// Seeded random so failures are reproducible.
function seeded(seed: number) {
    return () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
    };
}

function bank(n: number) {
    return Array.from({ length: n }, (_, i) => `q${i}`);
}

/** Simulates the server: pick at game start, mark each shown question seen. */
function playGame(store: { [uid: string]: SeenRecord }, uids: string[], allIds: string[], count: number, clock: { t: number }, random) {
    const qids = pickQuestions(allIds, uids.map(u => store[u] || {}), count, random);
    qids.forEach(qid => {
        clock.t++;
        uids.forEach(u => (store[u] = store[u] || {})[qid] = clock.t);
    });
    return qids;
}

const tests: { [name: string]: () => void } = {
    'returning group sees no repeat until the bank is used up'() {
        for (const [size, count] of [[30, 7], [35, 7], [20, 5], [50, 9], [7, 7]]) {
            const allIds = bank(size);
            const store = {};
            const clock = { t: 0 };
            const group = ['phoneA', 'phoneB', 'phoneC', 'phoneD'];
            const random = seeded(size * 31 + count);
            const shown: string[] = [];

            const gamesToUseBank = Math.ceil(size / count);
            for (let g = 0; g < gamesToUseBank; g++) {
                const qids = playGame(store, group, allIds, count, clock, random);
                assert.strictEqual(new Set(qids).size, qids.length, 'no repeat inside a game');
                shown.push(...qids);
            }

            const firstPass = shown.slice(0, size);
            assert.strictEqual(new Set(firstPass).size, size,
                `bank ${size}/${count}: first ${size} questions shown are all different`);
            assert.deepStrictEqual(firstPass.slice().sort(), allIds.slice().sort(), 'whole bank used');
        }
    },

    'after the bank is used up, the questions seen longest ago come back first'() {
        const allIds = bank(10);
        const store = {};
        const clock = { t: 0 };
        const group = ['a', 'b'];
        const random = seeded(7);
        const g1 = playGame(store, group, allIds, 5, clock, random);
        const g2 = playGame(store, group, allIds, 5, clock, random);
        const g3 = playGame(store, group, allIds, 5, clock, random);
        assert.deepStrictEqual(g3.slice().sort(), g1.slice().sort());
        assert.strictEqual(new Set(g1.concat(g2)).size, 10);
    },

    'a newcomer does not bring back questions the regulars have seen'() {
        const allIds = bank(21);
        const store = {};
        const clock = { t: 0 };
        const random = seeded(3);
        const g1 = playGame(store, ['a', 'b', 'c'], allIds, 7, clock, random);
        const g2 = playGame(store, ['a', 'b', 'c', 'newbie'], allIds, 7, clock, random);
        const g3 = playGame(store, ['a', 'newbie'], allIds, 7, clock, random);
        assert.strictEqual(new Set(g1.concat(g2, g3)).size, 21);
    },

    'bank smaller than a game returns what exists, no duplicates'() {
        const qids = pickQuestions(bank(3), [], 7);
        assert.strictEqual(qids.length, 3);
        assert.strictEqual(new Set(qids).size, 3);
    },

    'mergeSeen keeps the latest time and ignores empty records'() {
        assert.deepStrictEqual(mergeSeen([{ x: 1, y: 5 }, null, { x: 3 }, {}]), { x: 3, y: 5 });
    },

    'shuffle is a permutation and does not change its input'() {
        const input = bank(20);
        const out = shuffle(input, seeded(1));
        assert.deepStrictEqual(input, bank(20));
        assert.deepStrictEqual(out.slice().sort(), input.slice().sort());
    },
};

let failed = 0;
Object.keys(tests).forEach(name => {
    try {
        tests[name]();
        console.log(`ok - ${name}`);
    } catch (e) {
        failed++;
        console.log(`not ok - ${name}\n  ${e.message}`);
    }
});
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
