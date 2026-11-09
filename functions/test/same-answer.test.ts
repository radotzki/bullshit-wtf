import * as assert from 'assert';
import { isSameAnswer, normalizeAnswer } from '../src/controllers/same-answer';

const tests: { [name: string]: () => void } = {
    'exact and case-only matches are refused, as before'() {
        assert.ok(isSameAnswer('Mashed Potatoes', 'mashed potatoes'));
        assert.ok(isSameAnswer('לונדון', 'לונדון'));
    },

    'extra spaces are ignored'() {
        assert.ok(isSameAnswer('  mashed   potatoes ', 'mashed potatoes'));
        assert.ok(isSameAnswer(' תל  אביב ', 'תל אביב'));
    },

    'quote marks are ignored'() {
        assert.ok(isSameAnswer('"mashed potatoes"', 'mashed potatoes'));
        assert.ok(isSameAnswer('rock n roll', "rock 'n' roll"));
        assert.ok(isSameAnswer('צה"ל', 'צהל'));
        assert.ok(isSameAnswer('צה״ל', 'צה"ל'));
        assert.ok(isSameAnswer('ג׳ירפה', "ג'ירפה"));
        assert.ok(isSameAnswer('“the beatles”', 'The Beatles'));
    },

    'one leading Hebrew prefix on the lie is ignored'() {
        assert.ok(isSameAnswer('הלונדון', 'לונדון'));
        assert.ok(isSameAnswer('בלונדון', 'לונדון'));
        assert.ok(isSameAnswer('ללונדון', 'לונדון'));
        assert.ok(isSameAnswer('ולונדון', 'לונדון'));
        assert.ok(isSameAnswer('ה לונדון', 'לונדון'));
        assert.ok(isSameAnswer(' "הלונדון" ', 'לונדון'));
    },

    'a prefix on the true answer that the lie leaves out is ignored'() {
        assert.ok(isSameAnswer('כותל', 'הכותל'));
        assert.ok(isSameAnswer('beatles', 'The Beatles'));
    },

    'English articles are ignored like Hebrew prefixes'() {
        assert.ok(isSameAnswer('the mashed potatoes', 'mashed potatoes'));
        assert.ok(isSameAnswer('a giraffe', 'giraffe'));
    },

    'hyphens, maqaf, vowel points and end punctuation are ignored'() {
        assert.ok(isSameAnswer('תל-אביב', 'תל אביב'));
        assert.ok(isSameAnswer('תל־אביב', 'תל אביב'));
        assert.ok(isSameAnswer('שָׁלוֹם', 'שלום'));
        assert.ok(isSameAnswer('mashed potatoes.', 'mashed potatoes'));
        assert.ok(isSameAnswer('papier mache', 'papier-mache'));
    },

    'real lies still go through'() {
        assert.ok(!isSameAnswer('glue', 'mashed potatoes'));
        assert.ok(!isSameAnswer('פריז', 'לונדון'));
        assert.ok(!isSameAnswer('mashed potato salad', 'mashed potatoes'));
        assert.ok(!isSameAnswer('', 'mashed potatoes'));
        assert.ok(!isSameAnswer('   ', 'mashed potatoes'));
    },

    'only one prefix letter is dropped, and only from one side'() {
        // Both start with a prefix letter and share the rest: different words.
        assert.ok(!isSameAnswer('בית ספר', 'לית ספר'));
        // Two prefix letters is a different answer.
        assert.ok(!isSameAnswer('והלונדון', 'לונדון'));
    },

    'short words keep their first letter'() {
        // "bread" and "hot": a prefix is dropped only when 3 letters remain.
        assert.ok(!isSameAnswer('לחם', 'חם'));
        assert.ok(!isSameAnswer('חם', 'לחם'));
        assert.ok(!isSameAnswer('the', 'he'));
    },

    'other one-letter prefixes are not dropped'() {
        assert.ok(!isSameAnswer('מים', 'ים'));
        assert.ok(!isSameAnswer('שמים', 'מים'));
    },

    'normalizeAnswer trims, lowercases and strips quotes'() {
        assert.strictEqual(normalizeAnswer('  "Hello"   World! '), 'hello world');
        assert.strictEqual(normalizeAnswer(undefined as any), '');
    },
};

let failed = 0;
Object.keys(tests).forEach(name => {
    try {
        tests[name]();
        console.log(`ok - ${name}`);
    } catch (e) {
        failed++;
        console.log(`not ok - ${name}\n  ${(e as Error).message}`);
    }
});
if (failed) {
    process.exit(1);
}
