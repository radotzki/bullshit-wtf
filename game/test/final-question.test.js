// Tests for the card before a game's last question (src/app/pages/round-intro/final-question.ts).
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const pages = path.join(__dirname, '..', 'src', 'app', 'pages');
const { gameStrings } = load(path.join(pages, 'game-strings.ts'));
const { isFinalQuestion, standing, gapLine } = load(path.join(pages, 'round-intro', 'final-question.ts'));

const en = gameStrings('en');
const he = gameStrings('he');

/** A line without the marks that keep a nickname to itself, to compare words. */
const plain = line => line.replace(/[⁦-⁩]/g, '');
const game = scores => {
    const players = {};
    Object.keys(scores).forEach((nickname, i) => players['p' + i] = { nickname, score: scores[nickname], uid: 'u' + i });
    return players;
};

test('the last question is the one before the final scores, in every length the game offers', () => {
    for (const totalQ of [5, 7, 9]) {
        for (let q = 0; q < totalQ; q++) {
            assert.strictEqual(isFinalQuestion(q, totalQ), q === totalQ - 1, `question ${q + 1} of ${totalQ}`);
        }
    }
});

test('the rounds the server announces: only the third round\'s card is the last question\'s', () => {
    // The server shows a round's card before question 1, after question floor(n / 2) and before the last one.
    for (const totalQ of [5, 7, 9]) {
        const cards = [0, Math.floor(totalQ / 2), totalQ - 1];
        assert.deepStrictEqual(cards.map(q => isFinalQuestion(q, totalQ)), [false, false, true]);
    }
});

test('nothing is called the last question before both numbers are read', () => {
    for (const missing of [undefined, null, NaN, '6']) {
        assert.strictEqual(isFinalQuestion(missing, 7), false);
        assert.strictEqual(isFinalQuestion(6, missing), false);
    }
    assert.strictEqual(isFinalQuestion(0, 1), false, 'a game of one question has only a first card');
});

test('a big screen reads who leads and by how much', () => {
    const s = standing(game({ Dan: 3500, Ben: 3000, Gal: 500 }));
    assert.deepStrictEqual(s, { players: 3, leaders: ['Dan'], lead: 500, you: 'none', behind: 0, tiedWith: [] });
    assert.strictEqual(plain(gapLine(s, en)), 'Dan leads by 500 points');
    assert.strictEqual(plain(gapLine(s, he)), 'ל־Dan יתרון של 500 נקודות');
});

test('a big screen names a tie for first, and counts it when the names would not fit', () => {
    assert.strictEqual(plain(gapLine(standing(game({ Dan: 2000, Ben: 2000, Gal: 500 })), en)), 'Dan and Ben are tied for first');
    assert.strictEqual(plain(gapLine(standing(game({ Dan: 2000, Ben: 2000, Gal: 2000 })), en)), 'Dan, Ben and Gal are tied for first');
    assert.strictEqual(plain(gapLine(standing(game({ Dan: 0, Ben: 0, Gal: 0, Tal: 0 })), en)), '4 players are tied for first');
    assert.strictEqual(plain(gapLine(standing(game({ Dan: 2000, Ben: 2000, Gal: 500 })), he)), 'תיקו בראש: Dan ו־Ben');
    assert.strictEqual(plain(gapLine(standing(game({ Dan: 0, Ben: 0, Gal: 0, Tal: 0 })), he)), 'תיקו בראש בין 4 שחקנים');
});

test('a phone reads its own player\'s place', () => {
    const players = game({ Dan: 3500, Ben: 3000, Gal: 500 });
    assert.strictEqual(plain(gapLine(standing(players, 'p0'), en)), 'You lead by 500 points');
    assert.strictEqual(plain(gapLine(standing(players, 'p1'), en)), '500 points behind Dan');
    assert.strictEqual(plain(gapLine(standing(players, 'p2'), en)), '3000 points behind Dan');
    assert.strictEqual(plain(gapLine(standing(players, 'p0'), he)), 'היתרון שלך: 500 נקודות');
    assert.strictEqual(plain(gapLine(standing(players, 'p1'), he)), '500 נקודות אחרי Dan');
});

test('a phone in a tie for first reads who shares it, and one behind a tie reads both names', () => {
    const two = game({ Dan: 2000, Ben: 2000, Gal: 500 });
    assert.strictEqual(plain(gapLine(standing(two, 'p0'), en)), 'You are tied for first with Ben');
    assert.strictEqual(plain(gapLine(standing(two, 'p1'), he)), 'תיקו בראש עם Dan');
    assert.strictEqual(plain(gapLine(standing(two, 'p2'), en)), '1500 points behind Dan and Ben');
    assert.strictEqual(plain(gapLine(standing(two, 'p2'), he)), '1500 נקודות אחרי Dan ו־Ben');

    const all = game({ Dan: 0, Ben: 0, Gal: 0, Tal: 0 });
    assert.strictEqual(plain(gapLine(standing(all, 'p0'), en)), 'You are tied for first with 3 others');
    assert.strictEqual(plain(gapLine(standing(all, 'p0'), he)), 'תיקו בראש עם עוד 3');

    const three = game({ Dan: 2000, Ben: 2000, Gal: 2000, Tal: 500 });
    assert.strictEqual(plain(gapLine(standing(three, 'p3'), en)), '1500 points behind first place');
    assert.strictEqual(plain(gapLine(standing(three, 'p3'), he)), '1500 נקודות אחרי המקום הראשון');
});

test('one player alone gets no line about a gap', () => {
    const solo = game({ Dan: 4000 });
    assert.strictEqual(gapLine(standing(solo, 'p0'), en), '');
    assert.strictEqual(gapLine(standing(solo), he), '');
});

test('nothing is said about a gap while the players are not read', () => {
    for (const missing of [undefined, null, {}, 'x']) {
        assert.strictEqual(standing(missing, 'p0'), null);
        assert.strictEqual(gapLine(standing(missing, 'p0'), en), '');
    }
    assert.strictEqual(gapLine(null, he), '');
});

test('no line ever prints a missing number', () => {
    // A player whose score is not a number counts as 0; a player this phone does not know reads as the room.
    const odd = { a: { nickname: 'Dan', score: 1000 }, b: { nickname: 'Ben' }, c: { nickname: 'Gal', score: null } };
    for (const t of [en, he]) {
        for (const pid of [undefined, 'a', 'b', 'c', 'nobody']) {
            const line = gapLine(standing(odd, pid), t);
            assert.ok(line.length > 0);
            assert.doesNotMatch(line, /undefined|null|NaN/);
        }
        for (const missing of [undefined, null, NaN]) {
            assert.strictEqual(t.leadsBy('Dan', missing), '');
            assert.strictEqual(t.youLeadBy(missing), '');
            assert.strictEqual(t.behind(missing, 'Dan'), '');
            assert.strictEqual(t.behindFirstPlace(missing), '');
            assert.strictEqual(t.manyTiedForFirst(missing), '');
            assert.strictEqual(t.youAreTiedWithMany(missing), '');
        }
    }
    assert.strictEqual(plain(gapLine(standing(odd, 'nobody'), en)), 'Dan leads by 1000 points');
});

test('a nickname keeps to itself inside a line of the other direction', () => {
    const line = gapLine(standing(game({ 'דנה': 1000, Ben: 500 })), en);
    assert.strictEqual(line, '⁨דנה⁩ leads by 500 points');
    assert.strictEqual(gapLine(standing(game({ 'דנה': 1000, Ben: 1500 }), 'p0'), he), '500 נקודות אחרי ⁨Ben⁩');
});
