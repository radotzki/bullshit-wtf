import * as assert from 'assert';
import { pickHouseLies, MIN_OPTIONS } from '../src/controllers/answer-options';
import { RETIRED_QUESTIONS, isRetired } from '../src/controllers/retired-questions';

function seeded(seed: number) {
    return () => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return seed / 2147483648;
    };
}

/** What one phone shows: distinct texts, minus that player's own lie (as the client does). */
function seenBy(own: string | undefined, all: string[]) {
    const distinct = all.filter((v, i, a) => a.indexOf(v) === i);
    return own === undefined ? distinct : distinct.filter(a => a !== own);
}

const fakes = ['papier-mache', 'styrofoam', 'plastic', 'lard'];

const tests: { [name: string]: () => void } = {
    '3 players with 3 different lies: everyone sees at least 4 answers'() {
        for (let s = 1; s < 50; s++) {
            const lies = ['glue', 'shaving cream', 'mayo'];
            const house = pickHouseLies(fakes, lies, 'mashed potatoes', 3, seeded(s));
            const all = lies.concat(house, ['mashed potatoes']);
            lies.forEach(own => assert.ok(seenBy(own, all).length >= 4, `saw ${seenBy(own, all)}`));
            assert.strictEqual(new Set(all).size, MIN_OPTIONS);
        }
    },

    '2 players: house lies fill up to the minimum when the question has enough'() {
        const lies = ['glue', 'mayo'];
        const house = pickHouseLies(fakes, lies, 'mashed potatoes', 2, seeded(3));
        assert.strictEqual(house.length, 3);
        lies.forEach(own => assert.ok(seenBy(own, lies.concat(house, ['mashed potatoes'])).length >= 4));
    },

    'two players wrote the same lie: more house lies make up for it'() {
        const lies = ['glue', 'glue', 'mayo'];
        const house = pickHouseLies(fakes, lies, 'mashed potatoes', 3, seeded(4));
        assert.strictEqual(house.length, 3);
    },

    'a house lie that matches a player lie or the truth is never added'() {
        const house = pickHouseLies(['Plastic', 'styrofoam', 'MASHED POTATOES', 'lard', 'lard'], ['plastic'], 'mashed potatoes', 3, seeded(5));
        assert.ok(!house.map(h => h.toLowerCase()).includes('plastic'));
        assert.ok(!house.map(h => h.toLowerCase()).includes('mashed potatoes'));
        assert.strictEqual(new Set(house).size, house.length);
        assert.deepStrictEqual(house.slice().sort(), ['lard', 'styrofoam']);
    },

    'big groups keep the old rule: one answer per player plus the truth'() {
        const lies = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
        assert.strictEqual(pickHouseLies(fakes, lies, 'truth', 8, seeded(6)).length, 0);
        assert.strictEqual(pickHouseLies(fakes, lies.slice(0, 6), 'truth', 8, seeded(6)).length, 2);
    },

    'nobody answered: house lies still fill the screen'() {
        assert.strictEqual(pickHouseLies(fakes, [], 'truth', 3, seeded(7)).length, 4);
    },

    'a question with few fake answers uses what it has'() {
        assert.deepStrictEqual(pickHouseLies(['x', 'y'], ['a'], 'truth', 2, seeded(8)).sort(), ['x', 'y']);
        assert.deepStrictEqual(pickHouseLies(undefined, ['a'], 'truth', 2), []);
    },

    'house lies are not always the first ones listed'() {
        const firsts = new Set<string>();
        for (let s = 1; s < 40; s++) {
            firsts.add(pickHouseLies(fakes, ['a', 'b', 'c'], 'truth', 3, seeded(s)).sort().join('|'));
        }
        assert.ok(firsts.size > 1);
    },

    'retired questions include the male cat riddle'() {
        assert.ok(isRetired('3be6f72c-bead-ebfc-bf09-1ea8e74d02d2'));
        assert.ok(!isRetired('toString'));
        assert.strictEqual(Object.keys(RETIRED_QUESTIONS).length, 6);
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
