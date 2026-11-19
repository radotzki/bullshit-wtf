// Pages are sent with "Cache-Control: no-cache" (firebase.json, hosting.headers), so a browser asks
// again after a release instead of keeping a page whose hashed stylesheet and scripts are gone
// (15 Nov: a desktop Chrome loaded the Hebrew home and the create page with styles-RH2ZQKJR.css,
// deleted by the release before). The hashed scripts and styles keep Hosting's default caching, and
// the function routes (join previews, the daily puzzle, the visit beacon) keep their own.
// Run: npm test (from game/). The regexes are RE2 on Hosting; these ones read the same in JavaScript.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const hosting = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'firebase.json'), 'utf8')).hosting;

function globToRegExp(glob) {
    const re = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0001').replace(/\*\*/g, '\u0002').replace(/\*/g, '[^/]*')
        .replace(/\u0001/g, '(?:.*/)?').replace(/\u0002/g, '.*');
    return new RegExp('^' + re + '$');
}

/** The Cache-Control a request path gets from firebase.json, or null. */
function cacheControl(p) {
    let value = null;
    for (const rule of hosting.headers) {
        const re = rule.regex ? new RegExp(rule.regex) : globToRegExp(rule.source);
        if (re.test(p)) {
            for (const h of rule.headers) {
                if (h.key.toLowerCase() === 'cache-control') value = h.value;
            }
        }
    }
    return value;
}

const PAGES = ['/', '/he', '/he/', '/index.html', '/he.html', '/create-game', '/m', '/d', '/learn', '/join-game',
    '/he/join-game', '/c/k7m2qx', '/he/c/k7m2qx', '/game-staging/JVAA', '/score-board-final/JVAA', '/present-game/JVAA',
    '/step/JVAA', '/how-to-play', '/he/how-to-play', '/hanukkah-party-game', '/he/friday-dinner', '/daily', '/he/daily', '/404.html'];

test('every page of the site is sent with no-cache', () => {
    for (const p of PAGES) {
        assert.strictEqual(cacheControl(p), 'no-cache', p);
    }
});

test('hashed scripts, styles, images and the function routes are left alone', () => {
    for (const p of ['/main-IO5O265C.js', '/polyfills-LVNOU2XZ.js', '/styles-RH2ZQKJR.css', '/assets/logo.png',
        '/favicon.ico', '/sitemap.xml', '/robots.txt', '/join-game/JVAA', '/he/join-game/JVAA', '/_daily', '/_v']) {
        assert.strictEqual(cacheControl(p), null, p);
    }
});

test('every function rewrite stays out of the no-cache rules', () => {
    // A rewrite by regex (the past daily puzzles) is tried on addresses it must match.
    const samples = ['/daily/past', '/he/daily/past', '/daily/2026-11-18', '/he/daily/2026-11-18'];
    const fnPaths = [].concat(...hosting.rewrites.filter(r => r.function).map(r => r.source
        ? [r.source.replace('*', 'ABCD')]
        : samples.filter(p => new RegExp(r.regex).test(p))));
    assert.ok(hosting.rewrites.filter(r => r.regex && r.function).every(r => samples.some(p => new RegExp(r.regex).test(p))),
        'each regex rewrite to a function has a sample address here');
    assert.ok(fnPaths.length >= 4);
    for (const p of fnPaths) {
        assert.strictEqual(cacheControl(p), null, p);
    }
});
