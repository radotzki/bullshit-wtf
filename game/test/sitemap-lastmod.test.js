// The sitemap's <lastmod> (seo/build-pages.js) and the holiday pages Google had not fetched by
// 20 November: /thanksgiving-party-game, /hanukkah-party-game and /he/home-together. Each is linked
// from the text of a page Google already has, in that page's language, and every search page carries
// the day it really last changed, never a day after the build.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const pages = require('../seo/pages');
const byPath = {};
pages.forEach(p => byPath[p.path] = p);

function build() {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-sitemap-'));
    execFileSync(process.execPath, [path.join(__dirname, '..', 'seo', 'build-pages.js'), out], { stdio: 'pipe' });
    return out;
}

test('every search page has a lastmod no later than the build day; the homes have none', () => {
    const out = build();
    const sitemap = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
    const today = new Date().toISOString().slice(0, 10);
    const urls = sitemap.split('<url>').slice(1);
    let dated = 0;
    urls.forEach(u => {
        const loc = /<loc>https:\/\/bullshit\.wtf([^<]*)<\/loc>/.exec(u)[1];
        const mod = /<lastmod>([^<]*)<\/lastmod>/.exec(u);
        if (loc === '/' || loc === '/he') {
            assert.strictEqual(mod, null, loc);
            return;
        }
        assert.ok(mod, `${loc} has no lastmod`);
        assert.match(mod[1], /^\d{4}-\d{2}-\d{2}$/, loc);
        assert.ok(mod[1] <= today, `${loc} is dated after the build: ${mod[1]}`);
        const p = byPath[loc];
        const want = [p.site.updated, p.updated].filter(Boolean).sort().pop();
        assert.strictEqual(mod[1], want < today ? want : today, loc);
        dated++;
    });
    assert.strictEqual(dated, pages.length);
});

test('the sitemap lists the three holiday pages', () => {
    const sitemap = fs.readFileSync(path.join(build(), 'sitemap.xml'), 'utf8');
    ['/thanksgiving-party-game', '/hanukkah-party-game', '/he/home-together'].forEach(loc =>
        assert.strictEqual(sitemap.split(`<loc>https://bullshit.wtf${loc}</loc>`).length, 2, loc));
});

test('the holiday pages are linked from the text of pages Google has, in their language', () => {
    const inText = (from, to) => {
        const p = byPath[from];
        assert.strictEqual(p.site.lang, byPath[to].site.lang, `${from} and ${to} share a language`);
        assert.ok(p.body.includes(`href="${to}"`), `${from} links ${to} in its text`);
    };
    inText('/he/hanukkah', '/he/home-together');
    inText('/free-jackbox-alternative', '/thanksgiving-party-game');
    inText('/free-jackbox-alternative', '/hanukkah-party-game');
});

// Google knew no page linking /he/school-break, /he/days-at-home or /he/friday-dinner on 20 November,
// though all three are in every Hebrew menu: each is now linked in the text of a Hebrew page it has.
test('the Hebrew break and Friday-dinner pages are linked from the text of indexed Hebrew pages', () => {
    [['/he/hanukkah', '/he/school-break'], ['/he/hanukkah', '/he/days-at-home'],
        ['/he/family-evening', '/he/friday-dinner']].forEach(([from, to]) => {
        assert.ok(byPath[to], `${to} is a page`);
        assert.strictEqual(byPath[from].site.lang, 'he', from);
        assert.ok(byPath[from].body.includes(`href="${to}"`), `${from} links ${to} in its text`);
        assert.ok(byPath[from].updated >= '2026-11-23', `${from} names the day its text changed`);
    });
});

test('a page whose text changed names a day no earlier than its language\'s menu', () => {
    pages.filter(p => p.updated).forEach(p =>
        assert.ok(p.updated >= p.site.updated, `${p.path}: ${p.updated} is before its menu's ${p.site.updated}; leave it out`));
});
