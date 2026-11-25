// Four holiday pages Google had found but never fetched by 24 November (Search Console showed no
// referring page for the three Hebrew ones): /thanksgiving-party-game, /he/home-together,
// /he/school-break and /he/days-at-home. Each is linked in a sentence of a page Google has: the
// Hebrew home (/he) and, for Thanksgiving, the English Hanukkah page. A menu or footer list is not
// enough. (/he/hanukkah links them too: see sitemap-lastmod.test.js.)
//   node --test test/holiday-links-in-text.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');

/** Runs a build script into a temporary folder and returns the file it wrote there. */
function built(script, file, seed) {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-links-'));
    try {
        if (seed) {
            fs.writeFileSync(path.join(out, 'index.html'), seed);
        }
        execFileSync(process.execPath, [path.join(root, script), out], { stdio: 'pipe' });
        return fs.readFileSync(path.join(out, file), 'utf8');
    } finally {
        fs.rmSync(out, { recursive: true, force: true });
    }
}

/** The plain <p> paragraphs of some HTML: the list of links (class="bs-links") is not one. */
const sentences = (html) => (html.match(/<p>[\s\S]*?<\/p>/g) || []);

test('the Hebrew home links the three Hebrew holiday pages in a sentence, not only in its list', () => {
    const index = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
    const he = built('scripts/build-he.js', 'he.html', index);
    const about = /<!-- BS:ABOUT:START -->([\s\S]*?)<!-- BS:ABOUT:END -->/.exec(he)[1];
    ['/he/school-break', '/he/days-at-home', '/he/home-together'].forEach(to => {
        const line = sentences(about).find(p => p.includes(`href="${to}"`));
        assert.ok(line, `/he links ${to} in a sentence of its text`);
        assert.match(line.replace(/<[^>]+>/g, ''), /[֐-׿]{2,}.*[֐-׿]{2,}/, 'the sentence is Hebrew');
    });
});

test('the English Hanukkah page links the Thanksgiving page in a sentence', () => {
    const html = built('seo/build-pages.js', 'hanukkah-party-game.html');
    const line = sentences(html).find(p => p.includes('href="/thanksgiving-party-game"'));
    assert.ok(line, '/hanukkah-party-game links /thanksgiving-party-game in its text');
    assert.ok(!/[֐-׿]/.test(line), 'in English');
});
