import * as assert from 'assert';
import { pickQuestions, pickWithPack, pickWithOpener, withSeasonKids, mergeSeen, shuffle, SeenRecord } from '../src/controllers/question-picker';
import { questionPacks, kidsSeasonPack, KIDS_SEASON_PER_GAME } from '../src/game-model';

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

    'pack game: up to perGame pack questions, first one opens the game, rest normal'() {
        const regular = bank(40);
        const pack = Array.from({ length: 12 }, (_, i) => `h${i}`);
        for (const count of [5, 7, 9]) {
            const qids = pickWithPack(regular, pack, [], count, 3, seeded(count));
            assert.strictEqual(qids.length, count);
            assert.strictEqual(new Set(qids).size, count);
            assert.strictEqual(qids.filter(q => q[0] === 'h').length, 3);
            assert.ok(qids[0][0] === 'h', 'first question is from the pack');
            assert.ok(qids[1][0] === 'q', 'pack questions are spread out');
        }
    },

    'pack questions are never repeated; once used up, games are normal'() {
        const regular = bank(60);
        const pack = Array.from({ length: 7 }, (_, i) => `h${i}`);
        const store: SeenRecord = {};
        const counts: number[] = [];
        for (let g = 0; g < 4; g++) {
            const qids = pickWithPack(regular, pack, [store], 7, 3, seeded(g + 1));
            counts.push(qids.filter(q => q[0] === 'h').length);
            qids.forEach((q, i) => store[q] = g * 10 + i + 1);
        }
        assert.deepStrictEqual(counts, [3, 3, 1, 0]);
        assert.strictEqual(Object.keys(store).filter(q => q[0] === 'h').length, 7);
    },

    'pack game with a tiny normal bank tops up from the pack'() {
        const qids = pickWithPack(bank(2), ['h0', 'h1', 'h2', 'h3', 'h4'], [], 5, 2, seeded(3));
        assert.strictEqual(qids.length, 5);
        assert.strictEqual(new Set(qids).size, 5);
    },
    'opener game: question 1 is an unseen opener, the rest come from the normal bank'() {
        const regular = bank(40);
        const openers = Array.from({ length: 30 }, (_, i) => `o${i}`);
        const seen: SeenRecord = { o0: 1, o1: 2, o2: 3 };
        for (const count of [1, 5, 7, 9]) {
            const random = seeded(count);
            const qids = pickWithOpener(regular, openers, [seen], count, (ids, n) => pickQuestions(ids, [seen], n, random), random);
            assert.strictEqual(qids.length, count);
            assert.strictEqual(new Set(qids).size, count);
            assert.ok(qids[0][0] === 'o', 'first question is an opener');
            assert.ok(!(qids[0] in seen), 'the opener is one the room has not seen');
            assert.ok(qids.slice(1).every(q => q[0] === 'q'), 'only one opener per game');
        }
    },

    'a room meets every opener once before they mix into the bank'() {
        const regular = bank(200);
        const openers = Array.from({ length: 6 }, (_, i) => `o${i}`);
        const store: SeenRecord = {};
        const firsts: string[] = [];
        for (let g = 0; g < 8; g++) {
            const random = seeded(g + 1);
            const qids = pickWithOpener(regular, openers, [store], 7, (ids, n) => pickQuestions(ids, [store], n, random), random);
            firsts.push(qids[0]);
            qids.forEach((q, i) => store[q] = g * 10 + i + 1);
        }
        assert.deepStrictEqual(firsts.slice(0, 6).sort(), openers.slice().sort());
        assert.ok(firsts.slice(6).every(q => q[0] === 'q'), 'after all openers are seen, the bank is unseen first');
    },

    'no openers in the bank: picks as before'() {
        const random = seeded(5);
        const qids = pickWithOpener(bank(20), [], [], 7, (ids, n) => pickQuestions(ids, [], n, random), random);
        assert.strictEqual(qids.length, 7);
        assert.strictEqual(new Set(qids).size, 7);
    },

    // The English Thanksgiving family night: "Kids are playing" took every Thanksgiving question away.
    'a kids game in season gets two fresh season questions, spread out, never first'() {
        const kids = ['k0', 'k1', 'k2', 'k3', 'k4'];
        const season = ['t0', 't1', 't2'];
        const qids = withSeasonKids(kids, season, [{ t0: 1 }], 2, seeded(3));
        assert.strictEqual(qids.length, 5);
        assert.strictEqual(qids[0], 'k0', 'the kids opener stays');
        const added = qids.filter(q => q[0] === 't');
        assert.deepStrictEqual(added.slice().sort(), ['t1', 't2'], 'only unseen season questions');
        assert.ok(qids[1][0] === 'k' && qids[4][0] === 'k', 'spread out, not side by side at an end');
        assert.strictEqual(new Set(qids).size, 5);
    },

    'a kids game with no fresh season questions is the kids questions as picked'() {
        const kids = ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6'];
        assert.deepStrictEqual(withSeasonKids(kids, ['t0'], [{ t0: 5 }], 2, seeded(1)), kids);
        assert.deepStrictEqual(withSeasonKids(kids, [], [], 2, seeded(1)), kids);
        assert.deepStrictEqual(withSeasonKids(['k0'], ['t0'], [], 2, seeded(1)), ['k0']);
    },

    'Thanksgiving week: English kids games get Thanksgiving kid questions, Hebrew ones none'() {
        const thursday = Date.parse('2026-11-26T23:30:00Z');
        assert.strictEqual(kidsSeasonPack(thursday, 'en'), 'thanksgiving');
        assert.strictEqual(kidsSeasonPack(thursday, 'he'), undefined);
        assert.strictEqual(kidsSeasonPack(Date.parse('2026-11-10T12:00:00Z'), 'en'), undefined);
        assert.strictEqual(KIDS_SEASON_PER_GAME, 2);
        const ids = questionPacks.thanksgiving.kidsToo;
        const file = require('../../data/thanksgiving-questions.json');
        assert.ok(ids.length >= 8, 'enough for a rematch or three');
        ids.forEach(id => assert.ok(file[id], `${id} is a question of the pack`));
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
