// Tests for the words and the small rules of the host's controls (src/app/pages/host-strings.ts): hide a lie,
// remove a player, and the lines the hidden writer and the checking host see.
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
    new Function('module', 'exports', 'require', out)(mod, mod.exports, () => ({}));
    return mod.exports;
}

const app = path.join(__dirname, '..', 'src', 'app');
const { hostStrings, hostSeatRows, hostLieRows, answersNotice, seatRemoved } = load(path.join(app, 'pages', 'host-strings.ts'));
const { joinStrings } = load(path.join(app, 'pages', 'join-game', 'join-strings.ts'));
const hebrew = /[א-ת]/;

test('every line is there in English and in Hebrew, and Hebrew is Hebrew', () => {
    const en = hostStrings('en');
    const he = hostStrings('he');
    assert.deepStrictEqual(Object.keys(he).sort(), Object.keys(en).sort());
    for (const key of Object.keys(en)) {
        const e = typeof en[key] === 'function' ? en[key]('Noa') : en[key];
        const h = typeof he[key] === 'function' ? he[key]('נועה') : he[key];
        assert.ok(typeof e === 'string' && e.length > 0, key);
        assert.ok(!hebrew.test(e), `English ${key}`);
        assert.ok(hebrew.test(h), `Hebrew ${key}`);
    }
    assert.strictEqual(hostStrings('fr'), en);
    assert.match(en.removeConfirm('Noa'), /Noa/);
    assert.match(he.removeConfirm('נועה'), /נועה/);
});

test('the host who reads the lies is told first that their pick won\'t score', () => {
    for (const t of [hostStrings('en'), hostStrings('he')]) {
        assert.ok(t.checkWarn.length > 20);
        assert.notStrictEqual(t.checkWarn, t.checkedNoScore);
    }
    assert.match(hostStrings('en').checkWarn, /won't score/);
    assert.match(hostStrings('he').checkWarn, /ניקוד/);
});

test('a removed phone that tries to join again is told why, in both languages', () => {
    assert.strictEqual(joinStrings('he').error('REMOVED', 'The host removed you from this game.'), 'המארחים הוציאו אותך מהמשחק הזה.');
    assert.strictEqual(joinStrings('en').error('REMOVED', 'The host removed you from this game.'), 'The host removed you from this game.');
});

test('the players list: the host\'s own seat first and without REMOVE, the rest by name', () => {
    const rows = hostSeatRows({
        z: { nickname: 'Zoe' }, a: { nickname: 'Ari' }, me: { nickname: 'Dana', host: true }, gone: null,
    }, 'me');
    assert.deepStrictEqual(rows.map(r => [r.nickname, r.mine]), [['Dana', true], ['Ari', false], ['Zoe', false]]);
    // The big screen (no seat of its own): the host's seat is still marked by its host flag.
    assert.strictEqual(hostSeatRows({ me: { nickname: 'Dana', host: true } }, null)[0].mine, true);
    assert.deepStrictEqual(hostSeatRows(null, 'me'), []);
});

test('the lies list: players\' lies only, not the host\'s own, sorted, with what was hidden', () => {
    const rows = hostLieRows({
        me: { text: 'my lie' },
        b: { text: 'zebra' },
        c: { text: 'apple' },
        h: { text: 'house', houseLie: true },
        truth: { text: 'truth', realAnswer: true },
        e: { text: '' },
    }, 'me', { c: true });
    assert.deepStrictEqual(rows, [{ id: 'c', text: 'apple', hidden: true }, { id: 'b', text: 'zebra', hidden: false }]);
    assert.deepStrictEqual(hostLieRows(null, 'me', {}), []);
});

test('the answers screen tells the hidden writer, and the checking host, and nobody else', () => {
    const t = hostStrings('en');
    assert.strictEqual(answersNotice(t, 2, 2, null, false, false), t.yourLieHidden);
    assert.strictEqual(answersNotice(t, 2, 2, null, true, false), null, 'the lie is on the list');
    assert.strictEqual(answersNotice(t, 2, 1, null, false, false), null, 'sent on another question');
    assert.strictEqual(answersNotice(t, 2, null, null, false, false), null, 'sent nothing');
    assert.strictEqual(answersNotice(t, 2, 2, null, false, true), null, 'the truth of an About question is never listed');
    assert.strictEqual(answersNotice(t, 2, 2, 2, true, false), t.checkedNoScore);
    assert.strictEqual(answersNotice(t, 2, 2, 1, true, false), null);
    assert.strictEqual(answersNotice(t, null, 2, 2, false, false), null);
});

test('a seat counts as removed only once the phone had it, while the game is on', () => {
    assert.strictEqual(seatRemoved(true, { other: {} }, 'me', false), true);
    assert.strictEqual(seatRemoved(false, { other: {} }, 'me', false), false, 'still joining');
    assert.strictEqual(seatRemoved(true, { me: {} }, 'me', false), false);
    assert.strictEqual(seatRemoved(true, { other: {} }, 'me', true), false, 'the game is over');
    assert.strictEqual(seatRemoved(true, null, 'me', false), false, 'the players of an old game moved away');
    assert.strictEqual(seatRemoved(true, { other: {} }, null, false), false, 'the big screen');
});
