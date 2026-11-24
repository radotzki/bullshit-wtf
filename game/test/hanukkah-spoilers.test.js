// No page of the site gives away a question of the game's Hanukkah pack. Every page of seo/pages.js is
// read against the pack of its own language: the Hanukkah pages first (/he/hanukkah, /he/school-break,
// /hanukkah-party-game), and every other page too, since a Hanukkah game can start from any of them.
// The check itself is test/helpers/spoilers.js; the first tests below prove it catches each kind of
// spoiler. Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const pages = require('../seo/pages');
const spoilers = require('./helpers/spoilers');

const packs = { he: spoilers.pack('hanukkah', 'he'), en: spoilers.pack('hanukkah', 'en') };
const byId = (id) => packs.he.concat(packs.en).find(q => q.id === id);
const caught = (text, id) => spoilers.find(text, [byId(id)]).map(s => s.kind);

test('both Hanukkah packs are read', () => {
    assert.ok(packs.he.length > 50, `${packs.he.length} Hebrew questions`);
    assert.ok(packs.en.length > 50, `${packs.en.length} English questions`);
});

test('the Hanukkah pages are all checked', () => {
    const hanukkah = pages.filter(p => /hanukkah|חנוכה/i.test(spoilers.pageText(p)));
    ['/he/hanukkah', '/he/school-break', '/hanukkah-party-game'].forEach(path =>
        assert.ok(hanukkah.some(p => p.path === path), `${path} is a page that names Hanukkah`));
    assert.ok(hanukkah.length >= 4, `${hanukkah.length} pages name Hanukkah`);
});

// Planted spoilers: each line is how a page could give a question away.
test('a short answer is caught as a whole word, after a prefix, with its question near', () => {
    // hanukkah-26-he-11: "נס גדול היה $blank$" = "שם"; hanukkah-26-he-30: "אור ו$blank$" = "אש"
    assert.ok(caught('על סביבון מחוץ לארץ כתוב: נס גדול היה שם.', 'hanukkah-26-he-11').length);
    assert.ok(caught('באנו חושך לגרש, בידינו אור ואש.', 'hanukkah-26-he-30').length);
    // hanukkah-26-en-05: a menorah burns $blank$ candles = "44"
    assert.ok(caught('Counting the helper, a menorah burns 44 candles over the holiday.', 'hanukkah-26-en-05').length);
    // ...and not as a piece of another word, nor alone.
    assert.deepStrictEqual(caught('שמה של המשפחה, ואש לא נדלקה.', 'hanukkah-26-he-11'), []);
    assert.deepStrictEqual(caught('Up to 44 players can watch.', 'hanukkah-26-en-05'), []);
});

test('an answer is caught after a Hebrew prefix, and in another form of the word', () => {
    // hanukkah-26-he-08: told first in the $blank$ = "תלמוד"
    assert.deepStrictEqual(caught('נס פך השמן לא מופיע בספרי המקבים, הוא מסופר בתלמוד.', 'hanukkah-26-he-08'), ['answer + context']);
    // hanukkah-26-he-07: "מכבי" from an old word for $blank$ = "פטיש"; plural, with a prefix
    assert.ok(caught('השם מכבי בא מהמילה לפטישים, אומרים.', 'hanukkah-26-he-07').length);
    // hanukkah-26-en-07: Maccabee from an old word for $blank$ = "hammer"; plural
    assert.ok(caught('The name Maccabee may come from hammers, the old word says.', 'hanukkah-26-en-07').length);
    // hanukkah-26-he-20: $blank$ lamps in the Temple's menorah = "שבעה"; as a digit
    assert.ok(caught('במנורה של בית המקדש היו 7 נרות.', 'hanukkah-26-he-20').length);
});

test('a rare answer is caught on its own; an everyday one only with its question', () => {
    assert.deepStrictEqual(caught('Our favourite word this year: Thanksgivukkah!', 'hanukkah-26-en-02'), ['answer']);
    assert.deepStrictEqual(caught('There is nothing to set up.', 'hanukkah-26-en-04'), []);
    assert.ok(caught('On the dreidel, nun stood for nothing in the old Yiddish betting game.', 'hanukkah-26-en-04').length);
});

test('a teaser that names the question without its answer is no spoiler', () => {
    assert.deepStrictEqual(caught('שאלות חנוכה: מי הפך את הסופגנייה למאכל החג, ועוד.', 'hanukkah-26-he-02'), []);
    assert.deepStrictEqual(caught('the astronaut who spun a dreidel in space, and more', 'hanukkah-26-en-01'), []);
});

test('no word that is never counted as a clue is an answer of the pack', () => {
    const answers = new Set(packs.he.concat(packs.en).map(q => spoilers.words(q.realAnswer).join(' ')));
    Object.keys(spoilers.TOPIC).forEach(w => assert.ok(!answers.has(spoilers.words(w).join(' ')), `"${w}" is an answer`));
});

test('every answer that may stand alone on a page has its reason', () => {
    Object.entries(spoilers.LONE_OK).forEach(([a, why]) => assert.ok(why.length > 5, `"${a}" has its reason`));
});

// Pages that name an answer on purpose, by the answer, each with its reason. A page that is not on master
// yet may be listed, so its entry is here the day it merges.
const allowed = {
    '/he/hanukkah-activity': {
        'תלמוד': 'the closing talk tells the two stories of Hanukkah, read after both games (#239, judged fair in its review)',
    },
};

test('every page entry is allowed with its reason', () => {
    Object.values(allowed).forEach(entries => Object.entries(entries).forEach(([a, why]) =>
        assert.ok(why.length > 20, `"${a}" has its reason`)));
});

pages.forEach(p => {
    test(`${p.path}: gives away no question of the ${p.site.lang === 'he' ? 'Hebrew' : 'English'} Hanukkah pack`, () => {
        const found = spoilers.find(spoilers.pageText(p), packs[p.site.lang], allowed[p.path]);
        assert.deepStrictEqual(found.map(spoilers.describe), []);
    });
});
