// The side links that send a visitor into a game, or home first, carry an arrival tag, so a game
// started through them still says where the visitor came from: the "create a game" links in the
// text of the how-to-play and phone pages, the logo and the language link to the other home, and
// the not-found page's buttons. The Start buttons' own tags are checked in search-pages.test.js.
//   node --test test/side-links-tags.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const pages = require('../seo/pages');

const root = path.join(__dirname, '..');
const TAG = /^[a-z0-9][a-z0-9-]{0,39}$/;

function build(script) {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-side-links-'));
    execFileSync(process.execPath, [path.join(root, ...script), out], { stdio: 'pipe' });
    return out;
}
const read = (dir, p) => fs.readFileSync(path.join(dir, p.replace(/^\//, '') + '.html'), 'utf8');
// Every link on a page, with &amp; read back as & (what the browser hands the game).
const hrefs = (html) => [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map(m => m[1].replace(/&amp;/g, '&'));
const anchor = (html, cls) => {
    const m = new RegExp(`<a class="${cls}" href="([^"]*)"`).exec(html);
    return m && m[1].replace(/&amp;/g, '&');
};

test('the in-text "create a game" links carry the page tag (and Hebrew keeps lang=he)', () => {
    const out = build(['seo', 'build-pages.js']);
    try {
        const want = {
            '/how-to-play': '/create-game?via=seo-en-how',
            '/he/how-to-play': '/create-game?lang=he&via=seo-he-how',
            '/party-games-on-your-phone': '/create-game?via=seo-en-phone',
        };
        Object.keys(want).forEach(p => {
            const html = read(out, p);
            const main = html.slice(html.indexOf('<main>'), html.indexOf('<div class="cta">'));
            const create = hrefs(main).filter(h => /^\/create-game/.test(h));
            assert.ok(create.includes(want[p]), p + ': ' + create.join(', '));
        });
        // No link on any search page goes into Create without a tag.
        pages.forEach(p => {
            hrefs(read(out, p.path)).filter(h => /^\/create-game/.test(h)).forEach(h => {
                assert.match(h, /[?&]via=[a-z0-9-]+/, p.path + ': ' + h);
            });
        });
    } finally {
        fs.rmSync(out, { recursive: true, force: true });
    }
});

test('the logo goes to the page\'s own home, and the language link to the other home, both tagged', () => {
    const out = build(['seo', 'build-pages.js']);
    try {
        let oneLanguage = 0;
        pages.forEach(p => {
            assert.match(p.tag, TAG, p.path);
            const html = read(out, p.path);
            const home = p.site.lang === 'he' ? '/he' : '/';
            assert.strictEqual(anchor(html, 'logo'), home + '?via=' + p.tag, p.path + ': the logo');
            const lang = anchor(html, 'lang');
            if (p.twin) {
                assert.strictEqual(lang, p.twin, p.path + ': a twin has its own tag');
            } else {
                oneLanguage++;
                // From Hebrew, ?lang=en keeps the English home in English (test/english-from-hebrew.test.js).
                const other = p.site.lang === 'he' ? '/?lang=en&' : '/he?';
                assert.strictEqual(lang, other + 'via=' + p.tag, p.path + ': the language link');
            }
        });
        assert.ok(oneLanguage > 0, 'some pages are in one language only');
    } finally {
        fs.rmSync(out, { recursive: true, force: true });
    }
});

test('the not-found page\'s home buttons carry a tag of their own', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-side-links-'));
    try {
        execFileSync(process.execPath, [path.join(root, 'scripts', 'build-404.js'), dir], { stdio: 'pipe' });
        const html = fs.readFileSync(path.join(dir, '404.html'), 'utf8');
        const buttons = [...html.matchAll(/<a class="btn" href="([^"]*)"/g)].map(m => m[1]);
        assert.deepStrictEqual(buttons, ['/?via=notfound-en', '/he?via=notfound-he']);
        buttons.forEach(b => assert.match(b.split('via=')[1], TAG));
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});
