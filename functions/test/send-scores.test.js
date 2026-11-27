// SEND THE SCORES TO THE GROUP rows in BigQuery `shares` (content_type "scores"), and the scores link's
// seen rows on the join page (night-after seen-scores-player / seen-scores-other). A test game leaves none.
// The client side is game/src/app/components/send-scores (tests: game/test/send-scores.test.js).
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

test('the scores button counts WhatsApp, the share sheet and a copy, with the PIN in capitals', () => {
    assert.deepStrictEqual(SHARE_METHODS['scores'], ['whatsapp', 'native', 'copy']);
    for (const method of SHARE_METHODS['scores']) {
        assert.deepStrictEqual(cleanShare({ content_type: 'scores', method, crew: 'abcd', locale: 'he', uid: 'u1' }),
            { content_type: 'scores', method, crew_id: 'ABCD', locale: 'he', uid: 'u1' });
    }
    assert.strictEqual(cleanShare({ content_type: 'scores', method: 'whatsapp' }), null);
    assert.strictEqual(cleanShare({ content_type: 'scores', method: 'whatsapp', crew: 'ab12' }), null);
    assert.strictEqual(cleanShare({ content_type: 'scores', method: 'download', crew: 'ABCD' }), null);
});

test('the scores link\'s seen rows are night-after rows', () => {
    for (const method of ['seen-scores-player', 'seen-scores-other']) {
        assert.deepStrictEqual(cleanShare({ content_type: 'night-after', method, crew: 'abcd', locale: 'en' }),
            { content_type: 'night-after', method, crew_id: 'ABCD', locale: 'en', uid: null });
    }
});

test('a test game sends no scores row, and no seen row from its scores link', async () => {
    rows.length = 0;
    await onShare(cleanShare({ content_type: 'scores', method: 'whatsapp', crew: 'TESTA' }));
    await onShare(cleanShare({ content_type: 'scores', method: 'native', crew: 'TESTB' }));
    await onShare(cleanShare({ content_type: 'night-after', method: 'seen-scores-other', crew: 'TESTA' }));
    await onShare(cleanShare({ content_type: 'scores', method: 'whatsapp', crew: 'REAL' }));
    await onShare(cleanShare({ content_type: 'night-after', method: 'seen-scores-player', crew: 'PLAIN' }));
    assert.deepStrictEqual(rows.map(r => [r.table, r.row.content_type, r.row.crew_id, r.row.method]), [
        ['shares', 'scores', 'REAL', 'whatsapp'],
        ['shares', 'night-after', 'PLAIN', 'seen-scores-player'],
    ]);
});
