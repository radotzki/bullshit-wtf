const test = require('node:test');
const assert = require('node:assert');
const { cleanVisit, visitRecord, deviceOf, browserOf, botOf, deviceKindOf, pageOf, localeOf, isTestTag } = require('../dist/controllers/visit');

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36';
const IG = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0';

test('a text/plain beacon body is parsed and cleaned', () => {
    const row = cleanVisit(JSON.stringify({ k: 'end', v: 'k3j9x0ab', first: '/join-game/ABCD', last: '/game-staging/ABCD', booted: true, ms: 15234.6, err: '', lang: 'he-IL', ref: 'l.instagram.com' }), IPHONE);
    assert.deepStrictEqual(row, { kind: 'end', view: 'k3j9x0ab', first: '/join-game/ABCD', last: '/game-staging/ABCD', booted: true, ms: 15235, err: '', lang: 'he-IL', ref: 'l.instagram.com', tag: '', first_visit: null, created: false, joined: false, plain: false, webdriver: false, device: 'iphone', browser: 'safari 18.1', bot: false });
});

test('a stuck page keeps its first error', () => {
    const row = cleanVisit({ k: 'stuck', first: '/', last: '/', booted: false, ms: 12001, err: 'SyntaxError: Unexpected token' }, ANDROID);
    assert.strictEqual(row.kind, 'stuck');
    assert.strictEqual(row.booted, false);
    assert.strictEqual(row.err, 'SyntaxError: Unexpected token');
    assert.strictEqual(row.device, 'android');
    assert.strictEqual(row.browser, 'chrome 156');
});

test('junk is refused, and paths with query strings are dropped', () => {
    assert.strictEqual(cleanVisit('not json', IPHONE), null);
    assert.strictEqual(cleanVisit({ k: 'other' }, IPHONE), null);
    assert.strictEqual(cleanVisit(null, IPHONE), null);
    const row = cleanVisit({ k: 'end', first: '/c/abc?token=x', last: 'javascript:alert(1)', ms: 'x', lang: '<b>', ref: 'a b' }, '');
    assert.strictEqual(row.first, '');
    assert.strictEqual(row.last, '');
    assert.strictEqual(row.ms, -1);
    assert.strictEqual(row.lang, '');
    assert.strictEqual(row.ref, '');
    assert.strictEqual(row.device, 'other');
    assert.strictEqual(row.view, '');
    assert.strictEqual(cleanVisit({ k: 'end', v: 'BAD-ID!' }, '').view, '');
    assert.strictEqual(cleanVisit({ k: 'end', lang: 'zh-Hant-TW' }, '').lang, 'zh-Hant-TW');
});

test('devices and browsers, in-app ones included', () => {
    assert.strictEqual(browserOf(IG), 'instagram');
    assert.strictEqual(deviceOf(IG), 'iphone');
    assert.strictEqual(browserOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/156.0 Mobile/15E148 Safari/604.1'), 'chrome-ios 156');
    assert.strictEqual(browserOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'), 'ios-webview');
    assert.strictEqual(browserOf('Mozilla/5.0 (Linux; Android 14; SM-S911B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/156.0 Mobile Safari/537.36'), 'webview 156');
    assert.strictEqual(browserOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:159.0) Gecko/20100101 Firefox/159.0'), 'firefox 159');
    assert.strictEqual(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:159.0) Gecko/20100101 Firefox/159.0'), 'windows');
});

test('the new kinds are taken, and the tag, first visit, created and joined are cleaned', () => {
    const row = cleanVisit({ k: 'view', v: 'abc12345', first: '/he', last: '/he', tag: 'FB-he-Hanukkah-parents', fv: true, cr: false, jn: false, pl: false, wd: false, lang: 'he-IL', ref: 'm.facebook.com' }, IPHONE);
    assert.strictEqual(row.kind, 'view');
    assert.strictEqual(row.tag, 'fb-he-hanukkah-parents');
    assert.strictEqual(row.first_visit, true);
    assert.strictEqual(row.created, false);
    assert.strictEqual(cleanVisit({ k: 'create' }, IPHONE).created, true);
    assert.strictEqual(cleanVisit({ k: 'join' }, IPHONE).joined, true);
    assert.strictEqual(cleanVisit({ k: 'end', cr: true, jn: true }, IPHONE).created, true);
    assert.strictEqual(cleanVisit({ k: 'end', fv: false }, IPHONE).first_visit, false);
    // A tag is letters, digits and dashes, 40 at most: anything else is dropped, never stored.
    for (const bad of ['<script>', 'a b', 'dana@example.com', 'x'.repeat(41), '-x', 12, null, { a: 1 }]) {
        assert.strictEqual(cleanVisit({ k: 'view', tag: bad }, IPHONE).tag, '', String(bad));
    }
    assert.strictEqual(cleanVisit({ k: 'view', fv: 'yes', cr: 'yes', jn: 1 }, IPHONE).first_visit, null);
    assert.strictEqual(cleanVisit({ k: 'view', cr: 'yes' }, IPHONE).created, false);
});

test('pages lose the Hebrew prefix, PINs and crew ids', () => {
    assert.strictEqual(pageOf('/'), '/');
    assert.strictEqual(pageOf('/he'), '/');
    assert.strictEqual(pageOf('/he/'), '/');
    assert.strictEqual(pageOf('/join-game/ABCD'), '/join-game/:pin');
    assert.strictEqual(pageOf('/he/join-game/ABCD'), '/join-game/:pin');
    assert.strictEqual(pageOf('/he/join-game'), '/join-game');
    assert.strictEqual(pageOf('/game-staging/ABCD'), '/game-staging/:pin');
    assert.strictEqual(pageOf('/score-board-final/ABCD'), '/score-board-final/:pin');
    assert.strictEqual(pageOf('/present-game/ABCD'), '/present-game/:pin');
    assert.strictEqual(pageOf('/c/k3j9x0'), '/c/:id');
    assert.strictEqual(pageOf('/he/c/k3j9x0'), '/c/:id');
    assert.strictEqual(pageOf('/create-game'), '/create-game');
    assert.strictEqual(pageOf('/how-to-play'), '/how-to-play');
    assert.strictEqual(pageOf('/he/hanukkah'), '/he/hanukkah');
    assert.strictEqual(pageOf('/how-to-play/'), '/how-to-play');
    assert.strictEqual(pageOf(''), '');
    assert.strictEqual(localeOf('/he'), 'he');
    assert.strictEqual(localeOf('/he/join-game/ABCD'), 'he');
    assert.strictEqual(localeOf('/hello'), 'en');
    assert.strictEqual(localeOf('/'), 'en');
});

test('device kinds, bots and test tags', () => {
    assert.strictEqual(deviceKindOf('iphone'), 'phone');
    assert.strictEqual(deviceKindOf('android'), 'phone');
    assert.strictEqual(deviceKindOf('ipad'), 'tablet');
    assert.strictEqual(deviceKindOf('android-tablet'), 'tablet');
    assert.strictEqual(deviceKindOf('mac'), 'desktop');
    assert.strictEqual(deviceKindOf('windows'), 'desktop');
    assert.strictEqual(deviceKindOf('other'), 'other');
    assert.strictEqual(botOf('Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), true);
    assert.strictEqual(botOf('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36'), true);
    assert.strictEqual(botOf(IPHONE), false);
    assert.strictEqual(botOf(ANDROID), false);
    assert.strictEqual(botOf(IG), false);
    assert.strictEqual(cleanVisit({ k: 'view', wd: true }, IPHONE).bot, true);
    assert.strictEqual(isTestTag('test'), true);
    assert.strictEqual(isTestTag('test-hanukkah'), true);
    assert.strictEqual(isTestTag('testing'), false);
    assert.strictEqual(isTestTag('fb-he-test'), false);
    assert.strictEqual(isTestTag(''), false);
});

test('the BigQuery row: only the listed columns, and nothing that names a person or a game', () => {
    const now = new Date('2026-12-04T17:00:00Z');
    const rec = visitRecord(cleanVisit({ k: 'end', v: 'abc12345', first: '/he/join-game/ABCD', last: '/game-staging/ABCD', booted: true, ms: 9000, lang: 'he-IL', ref: 'l.instagram.com', tag: 'link', fv: false, cr: false, jn: true }, IPHONE), now);
    assert.deepStrictEqual(rec, {
        time: now, kind: 'end', view: 'abc12345', page: '/join-game/:pin', last_page: '/game-staging/:pin', locale: 'he',
        lang: 'he-il', ref: 'l.instagram.com', tag: 'link', test: false, first_visit: false, created: false, joined: true,
        device: 'iphone', device_kind: 'phone', browser: 'safari 18.1', bot: false, booted: true, ms: 9000, err: null,
    });
    const text = JSON.stringify(rec);
    assert.ok(!/ABCD/.test(text), 'no PIN');
    assert.ok(!/Mozilla|AppleWebKit/.test(text), 'no user agent');
    // Not known as the page opens, and a plain page has no app: booted is null, not false.
    assert.strictEqual(visitRecord(cleanVisit({ k: 'view', first: '/' }, IPHONE)).booted, null);
    assert.strictEqual(visitRecord(cleanVisit({ k: 'end', first: '/how-to-play', pl: true }, IPHONE)).booted, null);
    assert.strictEqual(visitRecord(cleanVisit({ k: 'stuck', first: '/' }, IPHONE)).booted, false);
    // A test link marks its rows.
    assert.strictEqual(visitRecord(cleanVisit({ k: 'view', first: '/', tag: 'test' }, IPHONE)).test, true);
    assert.strictEqual(visitRecord(cleanVisit({ k: 'view', first: '/', tag: 'test-alice' }, IPHONE)).test, true);
    // Empty things are NULL in the table, not empty strings.
    const bare = visitRecord(cleanVisit({ k: 'view' }, ''));
    assert.deepStrictEqual([bare.view, bare.page, bare.last_page, bare.lang, bare.ref, bare.tag, bare.ms, bare.err, bare.first_visit], [null, null, null, null, null, null, null, null, null]);
});
