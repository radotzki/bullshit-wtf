// The lone-host help's rows in BigQuery `shares` (content_type "lobby-help"): which are counted, that
// each carries the lobby's PIN in crew_id, and that a test game's lobby leaves none.
// The client side is game/src/app/pages/game-staging/lone-host.ts (tests: game/test/lone-host.test.js).
// Runs the compiled functions (dist/) with a fake database and a fake BigQuery.
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');

const games = { TESTA: { campaign: 'test' }, TESTB: { campaign: 'test-qa-lobby' }, REAL: { campaign: 'reddit' }, PLAIN: {} };
const ref = (parts) => ({
    child: (p) => ref(parts.concat(String(p))),
    once: async () => ({ val: () => parts.reduce((node, p) => (node == null ? null : node[p]), games) ?? null }),
});
const rows = [];
class FakeBigQuery {
    dataset() {
        return { table: (table) => ({ insert: async (row) => rows.push({ table, row }) }) };
    }
}
const realLoad = Module._load;
Module._load = function (request) {
    if (request === '@google-cloud/bigquery') return { BigQuery: FakeBigQuery };
    if (/[\\/]firebase$/.test(request)) return { gamesRef: ref([]), crewsRef: ref([]), get: (r) => r.once('value').then(s => s.val()) };
    return realLoad.apply(this, arguments);
};
const { cleanShare, onShare, SHARE_METHODS } = require(path.join(__dirname, '..', 'dist', 'controllers', 'analytics'));
Module._load = realLoad;

test('every lobby-help value is counted, with the PIN in capitals in crew_id', () => {
    assert.deepStrictEqual(SHARE_METHODS['lobby-help'], ['seen-new-phone', 'seen-new-computer',
        'seen-classic-phone', 'seen-classic-computer', 'whatsapp', 'native', 'copy']);
    for (const method of SHARE_METHODS['lobby-help']) {
        assert.deepStrictEqual(cleanShare({ content_type: 'lobby-help', method, crew: 'abcd', locale: 'he', uid: 'u1' }),
            { content_type: 'lobby-help', method, crew_id: 'ABCD', locale: 'he', uid: 'u1' });
    }
});

test('a lobby-help row without a PIN of letters is not counted', () => {
    assert.strictEqual(cleanShare({ content_type: 'lobby-help', method: 'copy' }), null);
    assert.strictEqual(cleanShare({ content_type: 'lobby-help', method: 'copy', crew: '' }), null);
    assert.strictEqual(cleanShare({ content_type: 'lobby-help', method: 'copy', crew: 'AB1D' }), null);
    assert.strictEqual(cleanShare({ content_type: 'lobby-help', method: 'copy', crew: 'ABCDEFGHIJKLM' }), null);
    assert.strictEqual(cleanShare({ content_type: 'lobby-help', method: 'copy', crew: ['ABCD'] }), null);
    assert.strictEqual(cleanShare({ content_type: 'lobby-help', method: 'solo-start', crew: 'ABCD' }), null);
    assert.strictEqual(cleanShare({ content_type: 'lobby-help', method: 'seen-new', crew: 'ABCD' }), null);
});

test('other rows keep their crew id as before', () => {
    assert.strictEqual(cleanShare({ content_type: 'invite', method: 'copy', locale: 'en' }).crew_id, null);
    assert.strictEqual(cleanShare({ content_type: 'crew-night', method: 'whatsapp', crew: 'KvRue3' }).crew_id, 'kvrue3');
});

test('a real lobby\'s row lands in shares; a test game\'s lobby leaves none', async () => {
    const send = (pin, method = 'seen-new-computer') => onShare(cleanShare({ content_type: 'lobby-help', method, crew: pin, locale: 'en' }));
    rows.length = 0;
    await send('TESTA');
    await send('testb', 'copy');
    assert.strictEqual(rows.length, 0);
    await send('REAL');
    await send('plain', 'whatsapp');
    // A lobby the database no longer holds is counted: it cannot be told from a real one.
    await send('GONE', 'copy');
    assert.deepStrictEqual(rows.map(r => [r.table, r.row.crew_id, r.row.method]),
        [['shares', 'REAL', 'seen-new-computer'], ['shares', 'PLAIN', 'whatsapp'], ['shares', 'GONE', 'copy']]);
    assert.ok(rows[0].row.time instanceof Date);
});

test('an invite row of a test game is counted as before: only lobby-help looks at the game', async () => {
    rows.length = 0;
    await onShare(cleanShare({ content_type: 'invite', method: 'copy', locale: 'en' }));
    assert.strictEqual(rows.length, 1);
});
