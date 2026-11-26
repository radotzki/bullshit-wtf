import * as assert from 'assert';
import { isSameAnswer, normalizeAnswer, isPartOfTruth, wordsWithin } from '../src/controllers/same-answer';

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

    'a lie that is only part of the truth is refused (live game: "גרמניה" for "גרמניה הנאצית")'() {
        assert.ok(isPartOfTruth('גרמניה', 'גרמניה הנאצית'));
        assert.ok(isPartOfTruth('הנאצית', 'גרמניה הנאצית'));
        assert.ok(isPartOfTruth('נאצית', 'גרמניה הנאצית'));
        assert.ok(isPartOfTruth('הנאצית גרמניה', 'גרמניה הנאצית'));
        assert.ok(isPartOfTruth('Germany', 'Nazi Germany'));
        assert.ok(isPartOfTruth('nazi', 'Nazi Germany'));
        assert.ok(isPartOfTruth('germany nazi', 'Nazi Germany'));
        assert.ok(isPartOfTruth('Germany!', 'Nazi Germany'));
    },

    'a Hebrew prefix glued to a word, or an English article, does not get the part through'() {
        assert.ok(isPartOfTruth('וגרמניה', 'גרמניה הנאצית'));
        assert.ok(isPartOfTruth('בגרמניה', 'גרמניה הנאצית'));
        assert.ok(isPartOfTruth('לגרמניה', 'גרמניה הנאצית'));
        assert.ok(isPartOfTruth('מגרמניה', 'גרמניה הנאצית'));
        assert.ok(isPartOfTruth('שגרמניה', 'גרמניה הנאצית'));
        assert.ok(isPartOfTruth('והגרמניה', 'גרמניה הנאצית'));
        assert.ok(isPartOfTruth('מהגרמניה', 'גרמניה הנאצית'));
        assert.ok(isPartOfTruth('the Germany', 'Nazi Germany'));
        assert.ok(isPartOfTruth('a nazi', 'Nazi Germany'));
        assert.ok(isPartOfTruth('Germany', 'Germany, under the Nazis'));
        // A prefix on the truth's word that the lie leaves out.
        assert.ok(isPartOfTruth('בית', 'הבית הלבן'));
        assert.ok(isPartOfTruth('white house', 'The White House'));
    },

    'the whole truth is still refused, as before'() {
        assert.ok(isPartOfTruth('גרמניה הנאצית', 'גרמניה הנאצית'));
        assert.ok(isPartOfTruth('the beatles', 'Beatles'));
        assert.ok(isPartOfTruth('הלונדון', 'לונדון'));
    },

    'a lie with one word of its own stays allowed'() {
        assert.ok(!isPartOfTruth('Nazi Italy', 'Nazi Germany'));
        assert.ok(!isPartOfTruth('East Germany', 'Nazi Germany'));
        assert.ok(!isPartOfTruth('איטליה הפשיסטית', 'גרמניה הנאצית'));
        assert.ok(!isPartOfTruth('גרמניה המזרחית', 'גרמניה הנאצית'));
        assert.ok(!isPartOfTruth('איטליה', 'גרמניה הנאצית'));
        assert.ok(!isPartOfTruth('mashed potato salad', 'mashed potatoes'));
        assert.ok(!isPartOfTruth('potato', 'mashed potatoes'));
        assert.ok(!isPartOfTruth('the germans', 'Nazi Germany'));
    },

    'a word is not matched by a few of its letters'() {
        assert.ok(!isPartOfTruth('man', 'Germany'));
        assert.ok(!isPartOfTruth('גרמן', 'גרמניה הנאצית'));
        assert.ok(!isPartOfTruth('צית', 'גרמניה הנאצית'));
        // מ and ש start ordinary words: alone they are dropped only from a long word.
        assert.ok(!isPartOfTruth('שמים', 'מים קרים'));
        assert.ok(!isPartOfTruth('משפחה', 'שפחה נאמנה'));
        // Short words keep their first letter, as above ("bread" and "hot").
        assert.ok(!isPartOfTruth('לחם', 'חם מאוד'));
    },

    'question bank cases that must stay allowed: a repeated word, numbers'() {
        // Both from the bank's own house lies, checked against their truths.
        assert.ok(!isPartOfTruth('שש שש', 'שש חמש'));
        assert.ok(!isPartOfTruth('5 cm', '1.5 cm'));
        assert.ok(!isPartOfTruth('4', '4 million'));
        assert.ok(!isPartOfTruth('1,000', '1,000 years'));
        // A word with its unit is still the truth's own words.
        assert.ok(isPartOfTruth('years', '1,000 years'));
        assert.ok(isPartOfTruth('Germany,', 'Germany (Nazi)'));
    },

    'a lie that leaves out a word that changes the meaning goes in, in both languages'() {
        // half: a different amount
        assert.ok(!isPartOfTruth('an hour', 'half an hour'));
        assert.ok(!isPartOfTruth('hour', 'half an hour'));
        assert.ok(!isPartOfTruth('שעה', 'חצי שעה'));
        assert.ok(!isPartOfTruth('שעה', 'שעה וחצי'), 'a prefixed meaning word ("and a half")');
        // no, not, never and their Hebrew kin: the opposite
        assert.ok(!isPartOfTruth('work', 'do no work'));
        assert.ok(!isPartOfTruth('do work', 'do no work'));
        assert.ok(!isPartOfTruth('best', 'second-best bed'));
        assert.ok(!isPartOfTruth('fly', 'cannot fly'));
        assert.ok(!isPartOfTruth('fly', "doesn't fly"));
        assert.ok(!isPartOfTruth('sleep', 'never sleep'));
        assert.ok(!isPartOfTruth('עובדות', 'לא עובדות'));
        assert.ok(!isPartOfTruth('מלבן', 'אינו מלבן'));
        assert.ok(!isPartOfTruth('סוכר', 'בלי סוכר'));
        assert.ok(!isPartOfTruth('סוכר', 'ללא סוכר'));
        assert.ok(!isPartOfTruth('חשמל', 'אין חשמל'));
        assert.ok(!isPartOfTruth('ישנים', 'שלא ישנים'));
        // second: another place
        assert.ok(!isPartOfTruth('best bed', 'second-best bed'));
        assert.ok(!isPartOfTruth('best bed', 'second best bed'));
    },

    'a lie that keeps the meaning word, or misses only other words, is still refused'() {
        assert.ok(isPartOfTruth('Germany', 'Nazi Germany'));
        assert.ok(isPartOfTruth('גרמניה', 'גרמניה הנאצית'));
        assert.ok(isPartOfTruth('half', 'half an hour'));
        assert.ok(isPartOfTruth('no work', 'do no work'));
        assert.ok(isPartOfTruth('לא עובדות', 'הן לא עובדות'));
        assert.ok(isPartOfTruth('חצי', 'חצי שעה'));
        assert.ok(isPartOfTruth('second bed', 'second-best bed'));
        assert.ok(isPartOfTruth('half an hour', 'half an hour'));
        assert.ok(isPartOfTruth('חצי שעה', 'חצי שעה'));
        // The meaning word and the word it turns both left out: still a part of the truth.
        assert.ok(isPartOfTruth('bed', 'second-best bed'));
        assert.ok(isPartOfTruth('do', 'do no work'));
        assert.ok(isPartOfTruth('בוער', 'בוער בלי הפסקה'));
        assert.ok(!isPartOfTruth('הפסקה', 'בוער בלי הפסקה'), 'but keeping the turned word is a lie');
        // "מלא" (full) is not "not" with a prefix: dropping it is still a part of the truth.
        assert.ok(isPartOfTruth('ירח', 'ירח מלא'));
    },

    'an empty lie, or one of articles only, is not refused here'() {
        assert.ok(!isPartOfTruth('', 'Nazi Germany'));
        assert.ok(!isPartOfTruth('   ', 'Nazi Germany'));
        assert.ok(!isPartOfTruth('the', 'The Beatles'));
        assert.ok(!wordsWithin('a', 'a cat'));
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
