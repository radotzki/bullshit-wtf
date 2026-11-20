// A name longer than the nickname box is checked whole before it is cut: the join page's box shows
// 9 characters, sends the whole name (game/src/app/pages/join-game/whole-name.ts), and the server's
// join checks every character before it cuts (controllers/join.ts, cleanNickname). The same path
// serves the CrazyGames portal (its username is put in the box whole) and the main site (a paste).
// Runs the compiled join from dist/ against an in-memory database:  npm run build && npm test
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const { nameFlag, SWAP_NAMES, NICKNAME_MAX } = require('../dist/name-flag');

// ---- the game's own code, as the browser runs it ----
const GAME = path.join(__dirname, '..', '..', 'game', 'src', 'app');
function loadGame(...p) {
    const out = ts.transpileModule(fs.readFileSync(path.join(GAME, ...p), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}
const box = loadGame('pages', 'join-game', 'whole-name.ts');
const portal = loadGame('portal', 'portal.ts');

// ---- the server's join, against fakes (as name-flag.test.js) ----
const db = {};
const at = (parts) => parts.reduce((n, p) => (n == null || typeof n !== 'object') ? null : n[p], db) ?? null;
function put(parts, value) {
    let node = db;
    parts.slice(0, -1).forEach(p => { node[p] = node[p] && typeof node[p] === 'object' ? node[p] : {}; node = node[p]; });
    node[parts[parts.length - 1]] = value === null ? undefined : JSON.parse(JSON.stringify(value));
}
let pushId = 0;
function ref(parts) {
    return {
        child: (p) => ref(parts.concat(String(p).split('/'))),
        once: async () => ({ val: () => JSON.parse(JSON.stringify(at(parts))) }),
        set: async (v) => put(parts, v),
        update: async (v) => Object.keys(v).forEach(k => put(parts.concat(k.split('/')), v[k])),
        push: () => ({ key: 'p' + (++pushId) }),
        transaction: (fn, done) => { const v = fn(at(parts)); put(parts, v); done(null, true, { val: () => v }); },
    };
}
const fakeFirebase = {
    gamesRef: ref(['games']), crewsRef: ref(['crews']), qHistoryRef: ref(['qHistory']),
    gameCounterRef: ref(['gameCounter']), questionsRef: ref(['questions']), seenQuestionsRef: ref(['seenQuestions']),
    get: (r) => r.once('value').then(s => s.val()),
};
class FakeBigQuery {
    dataset() { return { table: () => ({ insert: async () => { } }) }; }
}
const realLoad = Module._load;
Module._load = function (request) {
    if (request === '@google-cloud/bigquery') return { BigQuery: FakeBigQuery };
    if (/[\\/]firebase$/.test(request)) return fakeFirebase;
    return realLoad.apply(this, arguments);
};
const { join } = require(path.join(__dirname, '..', 'dist', 'controllers', 'join'));

/** The join page: the box receives a value, shows its first 9, and the join sends what it would send. */
function joinPage(value) {
    const { shown, kept } = box.boxValue(value);
    return { shown, sent: box.nicknameToSend(shown, kept) };
}

let uid = 0;
async function joinAs(pin, value) {
    const { shown, sent } = joinPage(value);
    const result = await join(pin, sent, 'u' + (++uid));
    return { shown, sent, result };
}

// A rude word that starts before, at and after the 9th character, in English and in Hebrew. Each
// passes the filter once cut to 9 (except where the word ends inside the first 9): cutting first
// would let it in.
const RUDE = {
    en: {
        'before the 9th': 'whore of babylon',
        'ending at the 9th': 'big whore',
        'at the 9th': 'a cheap whore',
        'after the 9th': 'my name is whore',
        'glued on at the 8th': 'abcdefgwhore',
        'slur after the 9th': 'i am a nigger',
    },
    he: {
        'before the 9th': 'זונה גדולה מאוד',
        'ending at the 9th': 'סבתא זונה',
        'at the 9th': 'אבא שלי זונה',
        'after the 9th': 'הכינוי שלי זונה',
        'slur after the 9th': 'מוות לערבים',
    },
};

test('the box shows 9 characters and the join sends the whole name', () => {
    assert.strictEqual(box.SHOWN_MAX, NICKNAME_MAX);
    assert.deepStrictEqual(joinPage('a cheap whore'), { shown: 'a cheap w', sent: 'a cheap whore' });
    assert.deepStrictEqual(joinPage('Bob'), { shown: 'Bob', sent: 'Bob' });
    assert.deepStrictEqual(joinPage(''), { shown: '', sent: '' });
    // Characters, not UTF-16 units: an emoji is never split.
    const emoji = '😀'.repeat(11);
    assert.strictEqual(joinPage(emoji).shown, '😀'.repeat(9));
    assert.strictEqual(joinPage(emoji).sent, emoji);
    // No huge post: 64 characters at most are sent.
    assert.strictEqual(Array.from(joinPage('x'.repeat(500)).sent).length, box.WHOLE_MAX);
});

test('a rude word before, at or after the 9th character is swapped, in English and in Hebrew', async () => {
    db.games = { ENEN: { locale: 'en', players: {} }, HEHE: { locale: 'he', players: {} } };
    for (const locale of ['en', 'he']) {
        for (const [where, name] of Object.entries(RUDE[locale])) {
            assert.ok(nameFlag(name), `${where}: ${name} is flagged whole`);
            const { result } = await joinAs(locale === 'he' ? 'hehe' : 'enen', name);
            assert.strictEqual(result.swapped, true, `${locale} ${where}: "${name}" -> "${result.nickname}"`);
            assert.ok(SWAP_NAMES[locale].includes(result.nickname), `${locale} ${where}: a ${locale} swap name`);
        }
    }
    // Before this fix the box cut the name first: these are the ones that got through.
    const cutFirst = ['a cheap whore', 'my name is whore', 'abcdefgwhore', 'i am a nigger', 'אבא שלי זונה', 'הכינוי שלי זונה', 'מוות לערבים'];
    for (const n of cutFirst) assert.strictEqual(nameFlag(Array.from(n).slice(0, 9).join('')), null, n);
});

test('a clean long name joins as its first 9 characters, as the box showed it', async () => {
    db.games = { ENEN: { locale: 'en', players: {} }, HEHE: { locale: 'he', players: {} } };
    for (const [pin, name] of [['enen', 'cucumbersandwich'], ['enen', 'AVeryLongCrazyGamesName_12345'], ['hehe', 'שושנה צחורה וגדולה']]) {
        const { shown, result } = await joinAs(pin, name);
        assert.strictEqual(result.swapped, undefined, name);
        assert.strictEqual(result.nickname, shown.trim(), name);
    }
});

test('the box sends what it shows once the player types over a long name', () => {
    const { shown, kept } = box.boxValue('a cheap whore');
    assert.strictEqual(box.nicknameToSend('Bob', kept), 'Bob');
    assert.strictEqual(box.nicknameToSend(shown, kept), 'a cheap whore');
    assert.strictEqual(box.nicknameToSend('   ', { whole: '   x', shown: '   ' }), '   ');
});

test('a paste longer than the box keeps the whole name it makes', () => {
    assert.strictEqual(box.pastedName('', 0, 0, 'a cheap whore'), 'a cheap whore');
    assert.strictEqual(box.pastedName('my ', 3, 3, 'name is whore'), 'my name is whore');
    assert.strictEqual(box.pastedName('xxBob', 0, 2, 'my name is '), 'my name is Bob');
    assert.strictEqual(box.pastedName('', 0, 0, 'Bob'), null);
});

test('the portal puts the whole CrazyGames username in the box, and a rude one is swapped', async () => {
    db.games = { ENEN: { locale: 'en', players: {} }, HEHE: { locale: 'he', players: {} } };
    assert.strictEqual(portal.portalNickname('  a   cheap   whore '), 'a cheap whore');
    portal.setPortalUsername('a cheap whore');
    const { shown, result } = await joinAs('enen', portal.portalUsername());
    assert.strictEqual(shown, 'a cheap w');
    assert.strictEqual(result.swapped, true);
    portal.setPortalUsername('דניאל');
    assert.strictEqual((await joinAs('hehe', portal.portalUsername())).result.nickname, 'דניאל');
    // A blank username leaves the nickname step to the player, as before.
    portal.setPortalUsername('    ');
    assert.strictEqual(portal.portalUsername(), '');
});
