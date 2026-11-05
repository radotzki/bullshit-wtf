// Unit tests for the round-1 lie helper (src/controllers/lie-helper.ts). Run with: npm test
const test = require('node:test');
const assert = require('node:assert');
const { pickIdeas, isIdea, pickCoach, questionResult, IDEAS_PER_PLAYER } = require('../dist/controllers/lie-helper');

// A fixed sequence of "random" numbers, so the shuffle is repeatable.
function seq(...values) { let i = 0; return () => values[i++ % values.length]; }

const fakes = ['Reverse Paradise', "The Devil's Toe Jam", 'The French Kiss of Death', 'Tahiti Two', 'Isle of Regret', 'Sandbar Nine', 'Gloom Atoll'];

test('every player gets two lies, never the real answer', () => {
    const ideas = pickIdeas(fakes.concat(['Disappointment Islands']), 'disappointment islands', ['a', 'b', 'c']);
    assert.deepStrictEqual(Object.keys(ideas).sort(), ['a', 'b', 'c']);
    Object.keys(ideas).forEach(pid => {
        assert.strictEqual(ideas[pid].length, IDEAS_PER_PLAYER);
        assert.notStrictEqual(ideas[pid][0], ideas[pid][1]);
        ideas[pid].forEach(i => assert.notStrictEqual(i.toLowerCase(), 'disappointment islands'));
    });
});

test('players get different lies while the question has enough', () => {
    const ideas = pickIdeas(fakes, 'x', ['a', 'b', 'c']);
    const all = [].concat(ideas.a, ideas.b, ideas.c);
    assert.strictEqual(new Set(all).size, 6);
    assert.strictEqual(all.length, 6);
});

function holders(ideas) {
    const count = {};
    Object.keys(ideas).forEach(pid => ideas[pid].forEach(l => count[l] = (count[l] || 0) + 1));
    return count;
}

test('4 fake answers: no lie goes to two players while the pool lasts (2/2, 2/1/1, 1/1/1/1)', () => {
    const four = ['f0', 'f1', 'f2', 'f3'];
    [[['a', 'b'], [2, 2]], [['a', 'b', 'c'], [1, 1, 2]], [['a', 'b', 'c', 'd'], [1, 1, 1, 1]]].forEach(([pids, sizes]) => {
        for (let run = 0; run < 50; run++) {
            const ideas = pickIdeas(four, 'truth', pids);
            assert.deepStrictEqual(Object.keys(ideas).map(p => ideas[p].length).sort(), sizes, JSON.stringify(ideas));
            Object.values(holders(ideas)).forEach(n => assert.strictEqual(n, 1, JSON.stringify(ideas)));
        }
    });
});

test('3 fake answers, 2 players: 2 and 1, nothing shared', () => {
    const ideas = pickIdeas(['f0', 'f1', 'f2'], 'truth', ['a', 'b']);
    assert.deepStrictEqual(Object.keys(ideas).map(p => ideas[p].length).sort(), [1, 2]);
    Object.values(holders(ideas)).forEach(n => assert.strictEqual(n, 1));
});

test('more players than lies: everyone gets one, spread as evenly as it can be', () => {
    const ideas = pickIdeas(['f0', 'f1', 'f2', 'f3'], 'truth', ['a', 'b', 'c', 'd', 'e', 'f']);
    Object.keys(ideas).forEach(pid => assert.strictEqual(ideas[pid].length, 1));
    const counts = Object.values(holders(ideas)).sort();
    assert.deepStrictEqual(counts, [1, 1, 2, 2]);
});

test('who gets the second lie is not always the first to join', () => {
    const firsts = new Set();
    for (let run = 0; run < 50; run++) {
        const ideas = pickIdeas(['f0', 'f1', 'f2', 'f3'], 'truth', ['a', 'b', 'c']);
        firsts.add(Object.keys(ideas).find(p => ideas[p].length === 2));
    }
    assert.ok(firsts.size > 1);
});

test('one usable fake answer is shared by everyone; no usable fake answers gives no ideas at all', () => {
    assert.deepStrictEqual(pickIdeas(['only one', 'ONLY ONE ', 'truth'], 'Truth', ['a', 'b']), { a: ['only one'], b: ['only one'] });
    assert.deepStrictEqual(pickIdeas([], 'truth', ['a']), {});
    assert.deepStrictEqual(pickIdeas(undefined, 'truth', ['a']), {});
    assert.deepStrictEqual(pickIdeas(['truth', ' '], 'truth', ['a']), {});
    assert.deepStrictEqual(pickIdeas(['a lie'], 'truth', []), {});
});

test('a sent lie counts as an idea whatever its case and spacing', () => {
    assert.strictEqual(isIdea(['Reverse Paradise', 'Gloom Atoll'], '  reverse PARADISE '), true);
    assert.strictEqual(isIdea(['Reverse Paradise'], 'reverse paradise island'), false);
    assert.strictEqual(isIdea(undefined, 'anything'), false);
    assert.strictEqual(isIdea(['a'], ''), false);
});

test('about half of all games get the helper', () => {
    assert.strictEqual(pickCoach(() => 0.49), true);
    assert.strictEqual(pickCoach(() => 0.5), false);
    let on = 0;
    for (let i = 0; i < 2000; i++) { if (pickCoach()) on++; }
    assert.ok(on > 850 && on < 1150, `${on} of 2000`);
});

test('a question result counts lies, helper lies, picks and friends fooled', () => {
    const game = {
        questionIndex: 0, roundIndex: 0, totalQ: 7, locale: 'he', coach: true,
        players: { a: {}, b: {}, c: {}, d: {} },
        answers: {
            a: { text: 'reverse paradise', houseLie: false, realAnswer: false, idea: true },
            b: { text: 'a goat named steve', houseLie: false, realAnswer: false },
            h1: { text: 'gloom atoll', houseLie: true, realAnswer: false },
            truth: { text: 'disappointment islands', houseLie: false, realAnswer: true },
        },
        answerSelections: {
            a: { text: 'a goat named steve' },        // fooled by b
            b: { text: 'disappointment islands' },    // found the truth
            c: { text: 'reverse paradise' },          // fooled by a
            d: { text: 'gloom atoll' },               // house lie
        },
    };
    assert.deepStrictEqual(questionResult('JUPU', game), {
        id: 'JUPU', q_index: 0, round: 1, total_q: 7, players: 4,
        lies: 2, idea_lies: 1, picks: 4, friend_fooled: 2, coach: true, locale: 'he',
    });
});

test('a question nobody wrote or picked on still gives a row', () => {
    const r = questionResult('ABCD', { questionIndex: 4, roundIndex: 1, totalQ: 7, locale: 'en', players: { a: {} } });
    assert.deepStrictEqual(r, {
        id: 'ABCD', q_index: 4, round: 2, total_q: 7, players: 1,
        lies: 0, idea_lies: 0, picks: 0, friend_fooled: 0, coach: false, locale: 'en',
    });
});
