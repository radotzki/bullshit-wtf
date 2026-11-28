// Tests the `test` and `page` tags on the site's Sentry reports (src/app/sentry/report-tags.ts).
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const dir = path.join(__dirname, '..', 'src', 'app', 'sentry');

function load() {
    const out = ts.transpileModule(fs.readFileSync(path.join(dir, 'report-tags.ts'), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}

const { testTag, pageTag, routeOf, addReportTags } = load();

/** One tab: its address and what it keeps for the tab. */
function tab(pathname, { search = '', hash = '', kept = null, blocked = false } = {}) {
    const win = { location: { pathname, search, hash } };
    Object.defineProperty(win, 'sessionStorage', {
        get() {
            if (blocked) { throw new Error('blocked'); }
            return { getItem: (k) => (k === 'BS_CAMPAIGN' ? kept : null) };
        },
    });
    return win;
}

test('a ?via=test or ?via=test-<name> address is a test', () => {
    assert.strictEqual(testTag(tab('/join-game/ABCD', { search: '?via=test' })), 'yes');
    assert.strictEqual(testTag(tab('/create-game', { search: '?x=1&via=test-qa-lobby' })), 'yes');
    assert.strictEqual(testTag(tab('/', { search: '?via=TEST' })), 'yes');
});

test('a tab that arrived as a test stays one after the router drops the query', () => {
    assert.strictEqual(testTag(tab('/game-staging/ABCD', { kept: 'test' })), 'yes');
    assert.strictEqual(testTag(tab('/show-question/ABCD', { kept: 'test-two-phones' })), 'yes');
});

test('the portal\'s hash address can carry the test tag', () => {
    assert.strictEqual(testTag(tab('/portal/crazygames', { hash: '#/join-game/ABCD?via=test' })), 'yes');
});

test('players are not tests', () => {
    assert.strictEqual(testTag(tab('/')), 'no');
    assert.strictEqual(testTag(tab('/join-game/ABCD', { search: '?via=qr' })), 'no');
    assert.strictEqual(testTag(tab('/', { search: '?via=testing' })), 'no');
    assert.strictEqual(testTag(tab('/', { search: '?via=fb-test' })), 'no');
    assert.strictEqual(testTag(tab('/', { kept: 'fb-he-hanukkah' })), 'no');
    assert.strictEqual(testTag(tab('/', { blocked: true })), 'no');
    assert.strictEqual(testTag(null), 'no');
});

test('the page tag names the route and never the game code', () => {
    assert.strictEqual(pageTag(tab('/')), '/');
    assert.strictEqual(pageTag(tab('/he')), '/he');
    assert.strictEqual(pageTag(tab('/create-game', { search: '?via=test' })), '/create-game');
    assert.strictEqual(pageTag(tab('/join-game/ABCD')), '/join-game/:pin');
    assert.strictEqual(pageTag(tab('/he/join-game/ABCD')), '/he/join-game/:pin');
    assert.strictEqual(pageTag(tab('/score-board-final/JWVS')), '/score-board-final/:pin');
    assert.strictEqual(pageTag(tab('/he/c/x1_Yz-9')), '/he/c/:id');
    assert.strictEqual(pageTag(tab('/challenge/AB12')), '/challenge/:pin');
    assert.strictEqual(pageTag(tab('/join-game')), '/join-game');
    for (const p of ['game-staging', 'round-intro', 'show-question', 'show-answers', 'reveal-the-truth', 'score-board', 'step', 'present-game']) {
        assert.strictEqual(pageTag(tab(`/${p}/QWER`)), `/${p}/:pin`);
    }
});

test('the portal\'s page keeps its hash route, code out', () => {
    assert.strictEqual(pageTag(tab('/portal/crazygames', { hash: '#/game-staging/ABCD' })),
        '/portal/crazygames#/game-staging/:pin');
    assert.strictEqual(pageTag(tab('/he/portal/crazygames', { hash: '#/join-game/ABCD?via=test' })),
        '/he/portal/crazygames#/join-game/:pin');
});

test('an odd path is cleaned, not copied', () => {
    assert.strictEqual(routeOf('/Some Name/x'), '/_/x');
    assert.ok(routeOf('/' + 'a'.repeat(300)).length <= 100);
    assert.strictEqual(pageTag({}), '/');
});

test('both tags are added to an event, beside its own', () => {
    const data = addReportTags({ tags: { where: 'join' } }, tab('/join-game/ABCD', { search: '?via=test' }));
    assert.deepStrictEqual(data.tags, { test: 'yes', page: '/join-game/:pin', where: 'join' });
    const bare = addReportTags({}, tab('/'));
    assert.deepStrictEqual(bare.tags, { test: 'no', page: '/' });
    assert.strictEqual(addReportTags(null, tab('/')), null);
});

test('the site hands every report to the tags', () => {
    const src = fs.readFileSync(path.join(dir, 'sentry.module.ts'), 'utf8');
    assert.match(src, /dataCallback:\s*\(data: any\) => addReportTags\(data,/);
});
