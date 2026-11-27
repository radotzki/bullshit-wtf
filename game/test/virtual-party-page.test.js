// The virtual holiday party page (/virtual-holiday-party-game), on its own ahead of PR #195: it names
// the lobby button the host will really see, and the office party and video call pages link it.
// PR #195 carries the same checks in more-search-pages.test.js, with one more on its new lobby
// question; once #195 is merged, this file can go. Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const pages = require('../seo/pages');

const root = path.join(__dirname, '..', '..');
const page = p => pages.find(x => x.path === p);

test('the virtual party page walks a computer host to the big screen, shared in the call', () => {
    const b = page('/virtual-holiday-party-game').body;
    // The lobby button's own words (big-screen-host.ts), so the page names what the host will see.
    const hostStrings = fs.readFileSync(path.join(root, 'game', 'src', 'app', 'pages', 'game-staging', 'big-screen-host.ts'), 'utf8');
    assert.match(hostStrings, /button: 'USE AS THE BIG SCREEN'/);
    assert.match(b, /"Use as the big screen"/);
    assert.match(b, /Share that browser window in the call/);
    assert.match(b, /"Join Game"/);
    // Linked from the office party page and the video call page.
    assert.match(page('/office-holiday-party-game').body, /href="\/virtual-holiday-party-game"/);
    assert.match(page('/video-call-party-game').body, /href="\/virtual-holiday-party-game"/);
});
