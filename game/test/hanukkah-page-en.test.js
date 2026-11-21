// The English Hanukkah page, as a family abroad meets it from a pitch: from the English Hanukkah night
// walk-through (grandparents on one tablet, two kids, a cousin on a video call, the laptop on the TV).
// The page told them a TV "can show the game" but not how, said nothing of the cousin far away, and
// sent them to a "Replay" button the game doesn't have. Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const pages = require('../seo/pages');

const page = pages.find(p => p.path === '/hanukkah-party-game');
const text = page.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

test('the English Hanukkah page says how to put the game on the TV, both ways', () => {
    // The lobby's button on a computer host, and the home's button on a computer when the game was made on a phone.
    assert.match(text, /"Use as the big screen"/);
    assert.match(text, /"Present Game" and type the PIN/);
});

test('the English Hanukkah page covers family far away and a latecomer', () => {
    assert.match(text, /video call/);
    assert.match(text, /Share the laptop's screen/);
    assert.match(text, /comes late opens the same link and joins/);
    assert.match(text, /share one phone or a tablet/);
});

test('the English Hanukkah page names the buttons the game has, and this year\'s nights', () => {
    assert.doesNotMatch(text, /Replay/);
    assert.match(text, /REMATCH/);
    assert.match(text, /SAME TABLE TOMORROW/);
    assert.match(text, /Friday evening, 4 December/);
    assert.match(text, /Shabbat/);
});
