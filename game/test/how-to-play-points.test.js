// The how-to-play pages (seo/pages.js), English and Hebrew, must give the points the game really uses:
// the house-lie penalty from functions/src/controllers/house-lie.ts, and the truth and fooling points
// from the round intro. Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const pages = require('../seo/pages');

const root = path.join(__dirname, '..', '..');
const houseLie = fs.readFileSync(path.join(root, 'functions', 'src', 'controllers', 'house-lie.ts'), 'utf8');
const penalty = JSON.parse(/HOUSE_LIE_PENALTY = (\[[^\]]+\])/.exec(houseLie)[1]);
const intro = fs.readFileSync(path.join(root, 'game', 'src', 'app', 'pages', 'round-intro', 'round-intro.component.ts'), 'utf8');
const rounds = [];
intro.replace(/truth: (\d+), bullshit: (\d+)/g, (m, truth, bullshit) => rounds.push({ truth: +truth, bullshit: +bullshit }));

function rows(body) {
    const table = /<table>([\s\S]*?)<\/table>/.exec(body)[1];
    return table.split('<tr>').slice(2).map(tr =>
        (tr.replace(/<[^>]+>/g, ' ').match(/[+-]?\d+/g) || []).map(Number));
}

test('the sources this test reads still have three rounds', () => {
    assert.strictEqual(penalty.length, 3);
    assert.strictEqual(rounds.length, 3);
});

['/how-to-play', '/he/how-to-play'].forEach(p => {
    test(`${p} gives the game's points for each round`, () => {
        const page = pages.find(x => x.path === p);
        assert.ok(page, 'page exists');
        assert.deepStrictEqual(rows(page.body), [0, 1, 2].map(i =>
            [i + 1, rounds[i].truth, rounds[i].bullshit, -penalty[i]]));
    });
});
