// Tests for "Pick a decoy" on the phones (two-player games in the test, see pair.ts in the functions):
// the words and the chooser (src/app/pages/pair-strings.ts), the answers a phone lists
// (src/app/services/answers-list.ts) and the decoy's result line (reveal-the-truth/reveal-strings.ts).
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

const app = path.join(__dirname, '..', 'src', 'app');
const { pairStrings, decoyView, friendName, lieNudge } = load(path.join(app, 'pages', 'pair-strings.ts'));
const { answersList } = load(path.join(app, 'services', 'answers-list.ts'));
const { resultLines } = load(path.join(app, 'pages', 'reveal-the-truth', 'reveal-strings.ts'));
const { gameStrings } = load(path.join(app, 'pages', 'game-strings.ts'));

test('the words, in both languages, with the friend\'s name', () => {
    const en = pairStrings('en');
    const he = pairStrings('he');
    assert.strictEqual(pairStrings('fr'), en);
    assert.strictEqual(en.label('Dana'), 'YOUR DECOY: which one would fool Dana?');
    assert.strictEqual(en.note('Dana'), 'If it fools Dana, you get half points.');
    assert.strictEqual(en.tag, 'DECOY');
    assert.strictEqual(en.flash('Dana'), 'Your decoy fooled Dana!');
    assert.strictEqual(he.label('דנה'), 'הפיתיון שלך: מה יעבוד על דנה?');
    assert.strictEqual(he.note('דנה'), 'עובד על דנה? חצי נקודות בשבילך');
    assert.strictEqual(he.tag, 'פיתיון');
    assert.strictEqual(he.flash('דנה'), 'הפיתיון שלך עבד על דנה!');
    Object.keys(en).forEach(k => assert.strictEqual(typeof he[k], typeof en[k], k));
    assert.ok(/[֐-׿]/.test(he.intro) && !/[֐-׿]/.test(en.intro));
});

test('the chooser: the offers not in the box, the chip tapped, one offer only', () => {
    const offers = ['Red Deer', 'Golden Eagle'];
    assert.deepStrictEqual(decoyView(offers, '', null), { offers, chosen: null, single: false });
    assert.deepStrictEqual(decoyView(offers, 'my lie', 'golden eagle'), { offers, chosen: 'Golden Eagle', single: false });
    // STUCK? GIVE ME A LIE put the first offer in the box: only the other is left, and it is the decoy.
    assert.deepStrictEqual(decoyView(offers, ' red deer ', 'Red Deer'), { offers: ['Golden Eagle'], chosen: 'Golden Eagle', single: true });
    assert.deepStrictEqual(decoyView(['Red Deer'], '', null), { offers: ['Red Deer'], chosen: 'Red Deer', single: true });
    assert.strictEqual(decoyView(['Red Deer'], 'RED DEER', null), null, 'nothing left: the chooser hides');
    assert.strictEqual(decoyView([], '', null), null);
    assert.strictEqual(decoyView(null, '', null), null);
    assert.deepStrictEqual(decoyView(offers, '', 'Unicorn').chosen, null, 'a chip that is not an offer is no choice');
});

test('the friend\'s name is the other player\'s', () => {
    const players = { p1: { nickname: 'Ana' }, p2: { nickname: 'Ben' } };
    assert.strictEqual(friendName(players, 'p1'), 'Ben');
    assert.strictEqual(friendName(players, 'p2'), 'Ana');
    assert.strictEqual(friendName(null, 'p1'), '');
    assert.strictEqual(friendName({ p1: { nickname: 'Ana' } }, 'p1'), '');
});

test('a phone never lists its own decoy, nor its own lie; the big screen lists them all', () => {
    const answers = {
        p1: { text: 'ana lie' },
        p2: { text: 'ben lie' },
        k1: { text: 'Red Deer', decoyOf: 'p1' },
        k2: { text: 'Golden Eagle', decoyOf: 'p2' },
        truth: { text: 'Unicorn' },
    };
    assert.deepStrictEqual(answersList(answers, 'p1'), ['Golden Eagle', 'Unicorn', 'ben lie']);
    assert.deepStrictEqual(answersList(answers, 'p2'), ['Red Deer', 'Unicorn', 'ana lie']);
    assert.strictEqual(answersList(answers).length, 5);
});

test('result lines: a decoy that fooled gets its own line; a written lie\'s lines are unchanged', () => {
    const t = gameStrings('en');
    const plain = s => s.replace(/[⁦⁩]/g, '');
    const row = extra => Object.assign({
        realAnswer: false, houseLie: false, points: 0, pickerIds: [], creatorIds: [], pickerNames: [], creatorNames: [],
    }, extra);
    const rows = [
        row({ text: 'ben lie', creatorIds: ['p2'], creatorNames: ['Ben'], pickerIds: ['p1'], pickerNames: ['Ana'], points: 500 }),
        row({ text: 'Red Deer', decoy: true, creatorIds: ['p1'], creatorNames: ['Ana'] }),
        row({ text: 'ana lie', creatorIds: ['p1'], creatorNames: ['Ana'] }),
        row({ text: 'Golden Eagle', decoy: true, creatorIds: ['p2'], creatorNames: ['Ben'], pickerIds: [], points: 0 }),
        row({ text: 'Unicorn', realAnswer: true, pickerIds: ['p2'], pickerNames: ['Ben'], points: 1000 }),
    ];
    const fooled = pairStrings('en').fooled;
    assert.deepStrictEqual(resultLines('p1', rows, t, fooled).map(plain), [t.fellFor('Ben'), t.nobodyFellForYours].map(plain));
    rows[1].pickerIds = ['p2'];
    rows[1].pickerNames = ['Ben'];
    rows[1].points = 250;
    rows[4].pickerIds = [];
    rows[4].pickerNames = [];
    assert.deepStrictEqual(resultLines('p1', rows, t, fooled).map(plain),
        [t.fellFor('Ben'), t.nobodyFellForYours, 'Your decoy fooled Ben! +250']);
    assert.deepStrictEqual(resultLines('p2', rows, t, fooled).map(plain), [t.fellFor('Ana'), t.fooled('Ana', '+500')].map(plain));
    assert.deepStrictEqual(resultLines('p1', rows, t).map(plain), [t.fellFor('Ben'), t.nobodyFellForYours].map(plain),
        'without the decoy words, as before');
});

test('a tapped chip with an empty box asks for the lie, in both languages', () => {
    assert.strictEqual(pairStrings('en').nudge, 'Now write your own lie in the box, then SEND.');
    assert.strictEqual(pairStrings('he').nudge, 'עכשיו לכתוב שקר משלך בתיבה, ואז לשלוח.');
    // Tapped, box empty or blank: the nudge shows.
    assert.strictEqual(lieNudge('', true), true);
    assert.strictEqual(lieNudge('   ', true), true);
    assert.strictEqual(lieNudge(null, true), true);
    assert.strictEqual(lieNudge(undefined, true), true);
    // A lie in the box: no nudge, SEND is lit.
    assert.strictEqual(lieNudge('a cow', true), false);
    assert.strictEqual(lieNudge('פרה', true), false);
    // No chip tapped yet (or the one-offer default): nothing to correct.
    assert.strictEqual(lieNudge('', false), false);
    assert.strictEqual(lieNudge('a cow', false), false);
});
