// The loading card: the page draws it itself, in the page's language, before the game file has
// arrived, and nothing from another site holds up that first draw.
//   node --test test/loading-card.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'src', 'index.html'), 'utf8');
const head = index.slice(0, index.indexOf('</head>'));

/** he.html as build-he.js makes it, from this index.html, in a temporary folder. */
function hebrew() {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-he-'));
    try {
        fs.writeFileSync(path.join(out, 'index.html'), index);
        execFileSync(process.execPath, [path.join(root, 'scripts', 'build-he.js'), out], { stdio: 'pipe' });
        return fs.readFileSync(path.join(out, 'he.html'), 'utf8');
    } finally {
        fs.rmSync(out, { recursive: true, force: true });
    }
}

const card = (html) => /<app-root><!-- BS:LOAD:START -->([\s\S]*?)<!-- BS:LOAD:END --><\/app-root>/.exec(html);

test('the English page shows the loading card inside app-root, and nothing else there', () => {
    const m = card(index);
    assert.ok(m, 'BS:LOAD markers inside <app-root>');
    assert.match(m[1], /^<div id="bs-load" role="status" lang="en" dir="ltr">[\s\S]*Loading the game…[\s\S]*<\/div>$/);
    // Its look is in the page itself: no file has to arrive first.
    assert.match(head, /<style>#bs-load\{position:fixed/);
    assert.ok(!/<img|src=|url\(/.test(m[1]), 'the card loads nothing');
    // The text under the app stays hidden while the card is all there is.
    assert.match(head, /body:has\(app-root > #bs-load:only-child\) \.bs-about \{ display: none; \}/);
});

test('the Hebrew page shows the card in Hebrew, right to left', () => {
    const he = hebrew();
    const m = card(he);
    assert.ok(m);
    assert.match(m[1], /^<div id="bs-load" role="status" lang="he" dir="rtl"><b>בולשיט<\/b><i><\/i><span>המשחק נטען…<\/span><\/div>$/);
    assert.ok(!/Loading the game/.test(he));
});

test('the beacon reads the card as not drawn yet', () => {
    const beacon = /<!-- BS:VISIT:START -->\s*<script>([\s\S]*?)<\/script>/.exec(index)[1];
    assert.match(beacon, /r\.firstElementChild\.id === 'bs-load'/);
    assert.match(beacon, /send\('drawn'\)/);
});

test('no stylesheet from another site blocks the first draw', () => {
    const links = head.replace(/<noscript>[\s\S]*?<\/noscript>/g, '').match(/<link\b[^>]*rel="stylesheet"[^>]*>/g) || [];
    links.forEach(l => {
        if (/href="https?:\/\//.test(l) && !/fonts\.googleapis\.com/.test(l)) {
            // Google Fonts is inlined by the build (Angular's font inlining); every other outside file waits.
            assert.match(l, /media="print" onload="this\.media='all'"/, l);
        }
    });
    assert.ok(links.some(l => /font-awesome/.test(l)), 'the icons are still loaded');
    // The icons come from the game's own files and still wait: the browser draws without them.
    const icons = links.find(l => /font-awesome/.test(l));
    assert.match(icons, /href="assets\/font-awesome\/css\/font-awesome\.min\.css"/);
    assert.match(icons, /media="print" onload="this\.media='all'"/);
    // Without scripts the icons still come, the normal way.
    assert.match(head, /<noscript><link rel="stylesheet" href="assets\/font-awesome\/css\/font-awesome\.min\.css"><\/noscript>/);
});

test('the fonts and icons come from the game\'s own files, with their licences', () => {
    assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com|maxcdn\.bootstrapcdn\.com/.test(head), 'no font or icon from another site');
    const faces = head.match(/@font-face\s*\{[^}]*\}/g) || [];
    assert.strictEqual(faces.length, 5, 'Luckiest Guy (latin, latin-ext) and Suez One (hebrew, latin, latin-ext)');
    const assets = path.join(__dirname, '..', 'src', 'assets');
    faces.forEach(f => {
        (f.match(/url\(([^)]+)\)/g) || []).forEach(u => {
            const file = u.slice(4, -1);
            assert.match(file, /^assets\/fonts\/[a-z-]+\.woff2?$/, file);
            assert.ok(fs.existsSync(path.join(assets, '..', file)), `${file} is in src/assets`);
        });
    });
    assert.ok(faces.some(f => /'Suez One'/.test(f) && /U\+0590-05FF/.test(f)), 'the Hebrew part of Suez One');
    ['fonts/LICENSE-luckiest-guy.txt', 'fonts/OFL-suez-one.txt', 'font-awesome/LICENSE.txt'].forEach(f =>
        assert.ok(fs.existsSync(path.join(assets, f)), `${f} is kept beside the files`));
    const css = fs.readFileSync(path.join(assets, 'font-awesome', 'css', 'font-awesome.min.css'), 'utf8');
    assert.match(css, /Font Awesome 4\.7\.0/);
    (css.match(/url\('\.\.\/fonts\/[^'?#]+/g) || []).forEach(u =>
        assert.ok(fs.existsSync(path.join(assets, 'font-awesome', 'css', u.slice(5))), `${u.slice(5)} is beside the icons' stylesheet`));
});
