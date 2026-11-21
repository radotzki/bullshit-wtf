// The English holiday pages (seo/pages-en-holidays.js), from the English Christmas night walk: a family
// in Ohio (grandparents on a tablet, two parents, kids of 8 and 14, an uncle who comes late, a cousin on
// a video call, the game on the living-room TV from a laptop) followed the Christmas page.
// Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const pages = require('../seo/pages');

const data = path.join(__dirname, '..', '..', 'functions', 'data');
const page = p => pages.find(x => x.path === p);
const text = html => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const norm = s => String(s).toLowerCase().replace(/\$blank\$|_+/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
const questions = [];
for (const f of fs.readdirSync(data).filter(f => f.endsWith('.json'))) {
    const d = JSON.parse(fs.readFileSync(path.join(data, f), 'utf8'));
    const list = Array.isArray(d) ? d : Object.values(d);
    list.forEach(q => q && q.questionText && questions.push(q));
}
const HOLIDAY = ['/christmas-party-game', '/new-years-eve-party-game', '/office-holiday-party-game'];
const truths = {
    '/christmas-party-game': 'roller skates',
    '/new-years-eve-party-game': 'dolls',
    '/office-holiday-party-game': 'super-strong glue',
};

test('a holiday page\'s example is in no question file, so a game never shows a truth the page gave away', () => {
    for (const p of HOLIDAY) {
        const q = (page(p).body.match(/<p class="q">([^<]+)<\/p>/) || [])[1];
        assert.ok(q, `${p} has an example`);
        const words = norm(q);
        questions.forEach(x => assert.notStrictEqual(norm(x.questionText), words, `${p}: ${q}`));
        assert.ok(page(p).body.includes(truths[p]), `${p} tells its truth`);
        const truth = norm(truths[p]);
        questions.forEach(x => assert.notStrictEqual(norm(x.realAnswer), truth, `${p}: ${x.questionText}`));
    }
    // The old examples were questions of the game (opening-questions.json): KFC, the coffee pot, the laser pointer.
    for (const p of HOLIDAY) {
        assert.doesNotMatch(page(p).body, /KFC|coffee pot|laser pointer/, p);
    }
});

// The office page's line sits beside #195's link to the virtual party page; it says "Present" still.
test('the Christmas and New Year\'s Eve pages name the big-screen buttons the game has', () => {
    for (const p of HOLIDAY.slice(0, 2)) {
        const t = text(page(p).body);
        assert.doesNotMatch(t, /click "Present" /, p);
        assert.match(t, /"Present Game"/, p);
    }
    assert.match(text(page('/christmas-party-game').body), /"Use as the big screen"/);
});

test('the Christmas page fits a family night: kids of 8, the grandparents, the cousin on a call, the late uncle', () => {
    const t = text(page('/christmas-party-game').body);
    assert.match(t, /Ages 8 and up/);
    assert.doesNotMatch(t, /about 10 up/);
    // The create page's own words: a kids game has no Christmas questions.
    assert.match(t, /"Kids are playing" off .*a kids game has no Christmas questions/);
    // Nicknames are 9 characters at most (NICKNAME_MAX): "Grandma & Grandpa" became "Grandma &".
    assert.match(t, /"Gran&Pop"/);
    assert.ok(Array.from('Gran&Pop').length <= 9);
    assert.match(t, /video call/);
    assert.match(t, /joins the game under way, at 0 points/);
    assert.match(t, /REMATCH/);
});
