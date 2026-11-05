import * as assert from 'assert';
import { houseLiePoints, HOUSE_LIE_PENALTY } from '../src/controllers/house-lie';

const tests: { [name: string]: () => void } = {
    'a player with enough points loses the round penalty'() {
        assert.strictEqual(houseLiePoints(0, 1000), -250);
        assert.strictEqual(houseLiePoints(1, 1000), -375);
        assert.strictEqual(houseLiePoints(2, 1000), -500);
    },

    'penalty is half the old one and below what fooling one friend earns'() {
        assert.deepStrictEqual(HOUSE_LIE_PENALTY, [250, 375, 500]);
        const fooling = [500, 750, 1000];
        HOUSE_LIE_PENALTY.forEach((p, i) => assert.ok(p < fooling[i]));
    },

    'a player at zero loses nothing'() {
        assert.strictEqual(houseLiePoints(0, 0) === 0, true);
        assert.strictEqual(houseLiePoints(2, 0) === 0, true);
    },

    'a house lie only takes back what the player has'() {
        assert.strictEqual(houseLiePoints(2, 300), -300);
        assert.strictEqual(houseLiePoints(1, 100, 0), -100);
    },

    'points earned this question for their own lie count'() {
        assert.strictEqual(houseLiePoints(0, 0, 500), -250);
        assert.strictEqual(houseLiePoints(2, 0, 200), -200);
    },

    'a score that is already negative (old games) loses nothing more'() {
        assert.strictEqual(houseLiePoints(1, -750) === 0, true);
    },

    'missing or odd inputs never crash or go below zero'() {
        assert.strictEqual(houseLiePoints(undefined as any, undefined as any) === 0, true);
        assert.strictEqual(houseLiePoints(9, 10000), -500);
    },

    'a replayed game of house-lie picks never goes below zero'() {
        for (let seed = 1; seed < 200; seed++) {
            let s = seed;
            const rnd = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
            let score = 0;
            for (let q = 0; q < 7; q++) {
                const round = q < 3 ? 0 : q < 6 ? 1 : 2;
                const r = rnd();
                const earned = r < 0.3 ? [500, 750, 1000][round] : 0;
                if (r < 0.6) {
                    score += earned + houseLiePoints(round, score, earned);
                } else if (r < 0.8) {
                    score += [1000, 1500, 2000][round];
                } else {
                    score += earned;
                }
                assert.ok(score >= 0, `seed ${seed} q ${q}: ${score}`);
            }
        }
    },
};

let failed = 0;
Object.keys(tests).forEach(name => {
    try {
        tests[name]();
        console.log(`ok - ${name}`);
    } catch (e) {
        failed++;
        console.log(`not ok - ${name}\n  ${e && e.message}`);
    }
});
if (failed) {
    process.exit(1);
}
