// The card-game rules pages (/bullshit-card-game and its Hebrew twin /he/bullshit-card-game): they answer
// "how do you play the card game Bullshit", name no company or product for it, end with one tagged link to
// our game, and the homes link them. Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const pages = require('../seo/pages');

const page = p => pages.find(x => x.path === p);
const words = body => body.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(w => /[א-ת0-9a-z]/i.test(w)).length;
const pair = { '/bullshit-card-game': 'seo-en-cards', '/he/bullshit-card-game': 'seo-he-cards' };

test('both pages are there, twins, each with its own tag', () => {
    assert.strictEqual(page('/bullshit-card-game').twin, '/he/bullshit-card-game');
    assert.strictEqual(page('/he/bullshit-card-game').twin, '/bullshit-card-game');
    assert.strictEqual(page('/he/bullshit-card-game').site.lang, 'he');
    Object.keys(pair).forEach(p => assert.strictEqual(page(p).tag, pair[p], p));
});

Object.keys(pair).forEach(p => {
    test(`${p}: a full answer, with the Start button near the top`, () => {
        assert.ok(words(page(p).body) >= 600, `${words(page(p).body)} words`);
        assert.ok(page(p).body.indexOf('<!--start-->') > 0);
    });

    test(`${p}: one start link in the text, carrying the page's tag, and links only to pages that exist`, () => {
        const b = page(p).body;
        const starts = b.match(/href="\/create-game[^"]*"/g) || [];
        assert.strictEqual(starts.length, 1, 'one start link');
        assert.ok(starts[0].indexOf('via=' + pair[p]) > 0, starts[0]);
        (b.match(/href="\/[^"]*"/g) || []).filter(h => h.indexOf('/create-game') < 0)
            .forEach(h => assert.ok(page(h.slice(6, -1)), h));
    });

    test(`${p}: covers the rules a searcher asks for`, () => {
        const b = page(p).body;
        const want = page(p).site.lang === 'he'
            ? [/52/, /2 עד 10/, /אס, 2, 3/, /מלך/, /הערימה/, /שתי חפיסות/, /גרסת שתייה/, /מנצח/]
            : [/52/, /2 to 10/, /ace, 2, 3/, /king/, /whole pile/, /Two decks/, /Counting down/, /Drinking/, /wins/];
        want.forEach(r => assert.match(b, r));
    });

    test(`${p}: says plainly that our game is a different game, and claims no company for the card game`, () => {
        const b = page(p).body;
        assert.match(b, page(p).site.lang === 'he' ? /הוא לא משחק הקלפים/ : /is not the card game/);
        assert.doesNotMatch(b, /<img|Bicycle|Hoyle|Mattel|Hasbro|™|®/);
        assert.strictEqual(page(p).about['@type'], 'Game');
    });
});
