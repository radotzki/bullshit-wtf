// The home address (/ or /he) moves on to the phone or computer menu (/m, /d) in place of itself in the
// history, so Back leaves the site instead of landing on / and moving on again (play-test, 20 Nov 2026).
// The ?via= tag is read before the move, so the counts keep it. Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = (...p) => fs.readFileSync(path.join(__dirname, '..', 'src', ...p), 'utf8');

test('the home moves on to /m or /d with replaceUrl, so Back is not trapped', () => {
    const landing = src('app', 'pages', 'landing', 'landing.component.ts');
    assert.match(landing, /this\.router\.navigate\(\[isMobile\(\) \? 'm' : 'd'\], \{ replaceUrl: true \}\)/);
    assert.ok(!/navigate\(\['[md]'\]\)/.test(landing), 'no move that adds a history entry');
});

test('the campaign tag is read from the address the app was opened with, before the move', () => {
    assert.match(src('app', 'services', 'join-source.ts'), /readCampaign\(window\.location\.search\)/);
    // The visit beacon reads the tag and the first path inline, at load.
    const index = src('index.html');
    assert.match(index, /first = location\.pathname/);
    assert.match(index, /\[\?&\]via=\(\[\^&#\]\*\)\/\.exec\(location\.search\)/);
});
