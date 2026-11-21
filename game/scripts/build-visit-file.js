// Writes dist/visit-beacon.js: the visit beacon of src/index.html (the script between the BS:VISIT
// markers), as a file of its own. Inside Discord the Activity's content policy refuses the page's inline
// scripts, so the beacon in the page never runs there; src/discord/boot.ts loads this file instead,
// after the proxy patch, and only when the inline beacon has not run (window.bsVisit is unset).
// Off Discord nothing loads it. Same script, so the same rows and fields (see the comment in index.html).
// firebase.json serves it with Cache-Control: no-cache, like the pages, so it changes with each release.
// Run after `ng build` (see the "build" script in package.json).
//   node scripts/build-visit-file.js [outDir]
const fs = require('fs');
const path = require('path');

const FILE = 'visit-beacon.js';

/** The beacon's script text, from the game's own page. */
function beacon(html) {
    const m = /<!-- BS:VISIT:START -->\s*<script>([\s\S]*?)<\/script>\s*<!-- BS:VISIT:END -->/.exec(html);
    if (!m) {
        throw new Error('build-visit-file: the visit beacon (BS:VISIT markers) is missing from src/index.html');
    }
    return m[1].replace(/^\s*\n/, '').replace(/\s+$/, '') + '\n';
}

if (require.main === module) {
    const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist'));
    const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
    fs.writeFileSync(path.join(out, FILE), '// The visit beacon of index.html, for pages where inline scripts are refused (scripts/build-visit-file.js).\n' + beacon(html));
    console.log(`build-visit-file: wrote ${path.join(path.basename(out), FILE)}`);
}

module.exports = { beacon, FILE };
