import * as assert from 'assert';
import { cleanHouseLies, isBlockedHouseLie, HOUSE_LIE_REPLACEMENTS } from '../src/controllers/house-lie-cleanup';

const tests: { [name: string]: () => void } = {
    'the Detroit sculpture question no longer offers a swastika'() {
        const out = cleanHouseLies('9cf71beb-4b04-79e2-a213-df263c99b17b', ['penis', 'swastika', 'vagina', 'naked santa']);
        assert.deepStrictEqual(out, ['penis', 'thumbs up', 'vagina', 'naked santa']);
    },
    'replacements match whatever the case and spacing in the bank'() {
        const out = cleanHouseLies('9cf71beb-4b04-79e2-a213-df263c99b17b', [' Swastika ']);
        assert.deepStrictEqual(out, ['thumbs up']);
    },
    'Hebrew lies are replaced too'() {
        const out = cleanHouseLies('fc8b9867-7bd5-4db2-9d5d-a64eecb7c954', ['הורס המגדלים', 'חוטף המטוסים', "ג'יהאד", "דיג'יי סדאם"]);
        assert.strictEqual(out.length, 4);
        out.forEach(t => assert.ok(!isBlockedHouseLie(t), t));
    },
    'a question keeps as many house lies as before'() {
        Object.keys(HOUSE_LIE_REPLACEMENTS).forEach(qid => {
            const lies = Object.keys(HOUSE_LIE_REPLACEMENTS[qid]);
            assert.strictEqual(cleanHouseLies(qid, lies).length, lies.length, qid);
        });
    },
    'no replacement is itself blocked'() {
        Object.keys(HOUSE_LIE_REPLACEMENTS).forEach(qid => {
            Object.keys(HOUSE_LIE_REPLACEMENTS[qid]).forEach(lie => {
                assert.ok(!isBlockedHouseLie(HOUSE_LIE_REPLACEMENTS[qid][lie]), HOUSE_LIE_REPLACEMENTS[qid][lie]);
            });
        });
    },
    'the net drops a hateful lie on any other question'() {
        assert.deepStrictEqual(cleanHouseLies('some-new-question', ['cats', 'a swastika flag', 'muslim terrorists']), ['cats']);
    },
    'ordinary rude lies stay: the game is meant to be cheeky'() {
        const lies = ['dildos', 'blowjobs', 'feces', 'grape juice', 'drapes', 'therapist'];
        assert.deepStrictEqual(cleanHouseLies('x', lies), lies);
    },
    'other questions are untouched'() {
        assert.deepStrictEqual(cleanHouseLies('x', ['papier-mache', 'styrofoam']), ['papier-mache', 'styrofoam']);
        assert.deepStrictEqual(cleanHouseLies('x', undefined as any), []);
    },
};

let failed = 0;
Object.keys(tests).forEach(name => {
    try { tests[name](); console.log('ok -', name); } catch (e) { failed++; console.log('not ok -', name, '\n', e); }
});
if (failed) { process.exit(1); }
