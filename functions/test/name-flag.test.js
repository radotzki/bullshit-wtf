// The nickname filter (growth spec: nickname-filter-spec.md). Runs the compiled code in dist/
// against an in-memory database and a fake BigQuery:  npm run build && npm test
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');

const { nameFlag, swapName, swapToast, SWAP_NAMES, NICKNAME_MAX } = require('../dist/name-flag');

// ---- the spec's test cases ----
const cases = {
    hate: ['nigger', 'Nigger', 'N1GG3R', 'n!gger', 'knee grow', 'hitlerson', '1488', 'נאצי', 'אדולף', 'היטלר',
        'הומו', 'כושי', "צ'חצ'ח", 'מוות לערבים', 'lilnigga', 'nigga24', 'n_i_g_g_a', 'kkk', 'myn1gg3r'],
    sex: ['cum', 'CUMSHOT', 'bbcman', 'cockalari', 'זין', 'זונה', 'כוס אמק', 'maya זונה'],
    none: ['cucumber', 'cocktail', 'therapist', 'booboo', 'ben dover', 'mike hawk', 'gay', 'bitch', 'kaki',
        'moby dick', 'dickens', 'pussycat', 'nazir', 'הומוס', 'כושר', 'ערבי', 'זינה', 'בננה', 'פין', 'כוס תה',
        'מזונה', 'רום המלך', 'peacock', 'analyst', 'כוסות', 'dana', 'יואב', '', 'fuck you', 'bullshit', 'jew', 'black', 'epstein'],
};

test('names from the spec get the expected flag', () => {
    const wrong = [];
    for (const n of cases.hate) if (nameFlag(n) !== 'hate') wrong.push(`${n} -> ${nameFlag(n)} (want hate)`);
    for (const n of cases.sex) if (nameFlag(n) !== 'sex') wrong.push(`${n} -> ${nameFlag(n)} (want sex)`);
    for (const n of cases.none) if (nameFlag(n) !== null) wrong.push(`${n} -> ${nameFlag(n)} (want null)`);
    assert.deepStrictEqual(wrong, []);
});

test('niqqud, invisible characters, Cyrillic look-alikes and Hebrew finals do not hide a word', () => {
    assert.strictEqual(nameFlag('n​igger'), 'hate');
    assert.strictEqual(nameFlag('c\u043Eck'), 'sex'); // Cyrillic о
    assert.strictEqual(nameFlag('nigg\u0435r'), 'hate'); // Cyrillic е
    assert.strictEqual(nameFlag('זוֹנָה'), 'sex');
    assert.strictEqual(nameFlag('אדולף'), 'hate'); // a list entry ending in a final letter
});

test('swap names fit the nickname limit, and the same uid gets the same one', () => {
    for (const n of SWAP_NAMES.en.concat(SWAP_NAMES.he)) assert.ok(Array.from(n).length <= NICKNAME_MAX, n);
    assert.strictEqual(swapName('uidA', 'en'), swapName('uidA', 'en'));
    assert.ok(SWAP_NAMES.he.includes(swapName('uidA', 'he')));
    assert.ok(SWAP_NAMES.en.includes(swapName('uidA', 'en')));
    const first = swapName('uidA', 'en');
    const next = swapName('uidA', 'en', [first.toUpperCase()]);
    assert.notStrictEqual(next, first);
    assert.ok(swapToast('Angel', 'en').includes('tonight you\'re Angel'));
    assert.ok(swapToast('סבתא', 'he').includes('קוראים לך סבתא'));
});

// ---- join, crews and analytics, against fakes ----
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
const rows = [];
class FakeBigQuery {
    dataset() { return { table: (table) => ({ insert: async (row) => rows.push({ table, row }) }) }; }
}
const realLoad = Module._load;
Module._load = function (request) {
    if (request === '@google-cloud/bigquery') return { BigQuery: FakeBigQuery };
    if (/[\\/]firebase$/.test(request)) return fakeFirebase;
    return realLoad.apply(this, arguments);
};
const dist = path.join(__dirname, '..', 'dist', 'controllers');
const { join } = require(path.join(dist, 'join'));
const { createCrew } = require(path.join(dist, 'crew'));
const analytics = require(path.join(dist, 'analytics'));
const { crewStandings } = require('../dist/game-model');

test('join swaps a flagged name, keeps normal names, and cuts names to 9 after checking', async () => {
    db.games = { ABCD: { locale: 'en', players: {} }, HEHE: { locale: 'he', players: {} } };

    const normal = await join('abcd', '  ben   dover  ', 'u1');
    assert.deepStrictEqual(Object.keys(normal).sort(), ['nickname', 'pid']);
    assert.strictEqual(normal.nickname, 'ben dover');

    const long = await join('abcd', 'cucumbersandwich', 'u2');
    assert.strictEqual(long.nickname, 'cucumbers');

    const slur = await join('abcd', 'nigger123456', 'u3');
    assert.strictEqual(slur.swapped, true);
    assert.ok(SWAP_NAMES.en.includes(slur.nickname));
    assert.strictEqual(db.games.ABCD.players[slur.pid].nickname, slur.nickname);

    // The same phone joining again keeps its sweet name; another flagged phone never shares it.
    const again = await join('abcd', 'n1gger', 'u3');
    assert.strictEqual(again.nickname, slur.nickname);
    const other = await join('abcd', 'cumshot', 'u4');
    assert.ok(SWAP_NAMES.en.includes(other.nickname));
    assert.notStrictEqual(other.nickname, slur.nickname);

    const he = await join('hehe', 'כוס אמק', 'u5');
    assert.strictEqual(he.swapped, true);
    assert.ok(SWAP_NAMES.he.includes(he.nickname));
    const heNormal = await join('hehe', 'כוס תה', 'u6');
    assert.strictEqual(heNormal.nickname, 'כוס תה');
    assert.strictEqual(heNormal.swapped, undefined);
});

test('BigQuery keeps the typed name and logs name_flag on each join', async () => {
    rows.length = 0;
    await analytics.onJoinGame('u', '1.2.3.4', 'ua', 'ABCD', 'N1gger', 'pin');
    await analytics.onJoinGame('u', '1.2.3.4', 'ua', 'ABCD', 'cumshot', 'pin');
    await analytics.onJoinGame('u', '1.2.3.4', 'ua', 'ABCD', 'dana', 'pin');
    assert.deepStrictEqual(rows.map(r => [r.row.nickname, r.row.name_flag]),
        [['N1gger', 'hate'], ['cumshot', 'sex'], ['dana', null]]);
});

test('a crew name that is a slur or a sex word is refused in the game\'s language', async () => {
    db.games = { DONE: { locale: 'he', state: { id: 6 }, players: { a: { nickname: 'dana', score: 3 }, b: { nickname: 'yoav', score: 1 } } } };
    await assert.rejects(createCrew('DONE', 'הזונות'), e => e.code === 'BAD_NAME' && e.message === 'השם הזה לא עובר אצלנו. נסו שם אחר.');
    db.games.DONE.locale = 'en';
    await assert.rejects(createCrew('DONE', 'kkk crew'), e => e.code === 'BAD_NAME' && e.message === 'That name\'s not allowed. Try another one.');
    const ok = await createCrew('DONE', 'The Liars');
    assert.strictEqual(ok.name, 'The Liars');
});

test('old crews hide flagged members from the standings and the rematch chips', () => {
    const crew = { members: { a: { nickname: 'dana', wins: 1 }, b: { nickname: 'nigger', wins: 5 }, c: { nickname: 'cumshot' } } };
    assert.deepStrictEqual(crewStandings(crew).map(m => m.nickname), ['dana']);
});
