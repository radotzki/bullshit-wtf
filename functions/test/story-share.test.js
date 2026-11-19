// The story card's presses in BigQuery `shares` (content_type "results", method "story"): one row a press.
// The client side is game/src/app/components/share-results/story-card.ts (tests: game/test/story-card.test.js).
// Runs the compiled functions (dist/) with a fake database and a fake BigQuery.
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');

const ref = () => ({ child: () => ref(), once: async () => ({ val: () => null }) });
const rows = [];
class FakeBigQuery {
    dataset() {
        return { table: (table) => ({ insert: async (row) => rows.push({ table, row }) }) };
    }
}
const realLoad = Module._load;
Module._load = function (request) {
    if (request === '@google-cloud/bigquery') return { BigQuery: FakeBigQuery };
    if (/[\\/]firebase$/.test(request)) return { gamesRef: ref(), crewsRef: ref(), get: (r) => r.once('value').then(s => s.val()) };
    return realLoad.apply(this, arguments);
};
const { cleanShare, onShare, SHARE_METHODS } = require(path.join(__dirname, '..', 'dist', 'controllers', 'analytics'));
Module._load = realLoad;

test('results counts the story press beside its old methods', () => {
    assert.deepStrictEqual(SHARE_METHODS['results'], ['whatsapp', 'native', 'copy', 'download', 'story']);
});

test('a story press is a shares row: results / story, with its language and uid', async () => {
    const row = cleanShare({ content_type: 'results', method: 'story', locale: 'he', uid: 'u1' });
    assert.deepStrictEqual(row, { content_type: 'results', method: 'story', crew_id: null, locale: 'he', uid: 'u1' });
    rows.length = 0;
    await onShare(row);
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].table, 'shares');
    assert.strictEqual(rows[0].row.method, 'story');
    assert.ok(rows[0].row.time instanceof Date);
});

test('story is not a method of other kinds of share', () => {
    assert.strictEqual(cleanShare({ content_type: 'invite', method: 'story' }), null);
    assert.strictEqual(cleanShare({ content_type: 'story', method: 'story' }), null);
});
