// The Hebrew faults the live check of 25 November 2026 found, kept fixed. Each was also seen in a
// browser against the Firebase emulators (a Hebrew solo game on a phone, the home on a computer).
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const pages = path.join(__dirname, '..', 'src', 'app', 'pages');
const read = (...p) => fs.readFileSync(path.join(pages, ...p), 'utf8');

test('the home keeps the address the visitor opened (/ or /he), not /m or /d', () => {
    // A copied /d opens the English page, and on a phone the computer menu.
    const landing = read('landing', 'landing.component.ts');
    const moves = landing.match(/this\.router\.navigate\(\[[^\]]*\][^)]*\)/g) || [];
    assert.strictEqual(moves.length, 2, moves.join('; '));
    assert.match(landing, /const keep = \{ skipLocationChange: true \};/);
    moves.forEach(move => assert.match(move, /, keep\)$/, move));
});

test('the computer menu names the big-screen button as the pages do ("מסך", "Present")', () => {
    // The activity, kit, occasion and groups pages and the rules page tell a leader to press presentShort.
    const computer = read('landing', 'desktop-landing', 'desktop-landing.component.html');
    assert.match(computer, /routerLink="\/present-game"><i [^>]*><\/i> \{\{ t\.presentShort \}\}<\/a>/);
    assert.ok(computer.indexOf('{{ t.present }}') < 0);
});

test('a folded truth row keeps its label on its own line above the answer', () => {
    // Folded side by side, the label ran into the answer: "האמתלסובב".
    const scss = read('reveal-the-truth', 'reveal-the-truth.component.scss');
    const folded = scss.indexOf('// An earlier row, folded to one line: the answer, then who wrote it and the points.');
    assert.ok(folded > 0);
    const block = scss.slice(folded, scss.indexOf('.text-line', folded));
    assert.match(block, /flex-wrap: wrap;/);
    assert.match(block, /\.truth-label \{\s*flex: 0 0 100%;/);
});

test('the solo final\'s keep-going button reads its two lines with a pause between them', () => {
    const html = read('score-board-final', 'score-board-final.component.html');
    assert.ok(html.indexOf(`[attr.aria-label]="soloRunEnd ? runWords.playAgain : runWords.keepGoing + ', ' + runWords.keepGoingSub(runLives)"`) > 0);
});
