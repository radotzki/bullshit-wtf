const test = require('node:test');
const assert = require('node:assert');
const { cleanVisit, deviceOf, browserOf } = require('../dist/controllers/visit');

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36';
const IG = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0';

test('a text/plain beacon body is parsed and cleaned', () => {
    const row = cleanVisit(JSON.stringify({ k: 'end', first: '/join-game/ABCD', last: '/game-staging/ABCD', booted: true, ms: 15234.6, err: '', lang: 'he-IL', ref: 'l.instagram.com' }), IPHONE);
    assert.deepStrictEqual(row, { kind: 'end', first: '/join-game/ABCD', last: '/game-staging/ABCD', booted: true, ms: 15235, err: '', lang: 'he-IL', ref: 'l.instagram.com', device: 'iphone', browser: 'safari 18.1' });
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
