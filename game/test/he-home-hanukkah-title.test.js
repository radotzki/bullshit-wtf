// The Hebrew home's search title and description in Hanukkah season (scripts/build-he.js): the
// holiday's search words while the Hanukkah question pack is in season, by the build's date, the
// game's name still first; the year-round words before and after. Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const GAME = path.join(__dirname, '..');
const model = fs.readFileSync(path.join(GAME, '..', 'game-model.ts'), 'utf8');
const season = /\bhanukkah: \{[^}]*?season: \{ from: '([\d-]+)', to: '([\d-]+)' \}/.exec(model);

function heOn(day) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-he-hanukkah-'));
    fs.copyFileSync(path.join(GAME, 'src', 'index.html'), path.join(dir, 'index.html'));
    execFileSync(process.execPath, [path.join(GAME, 'scripts', 'build-he.js'), dir], {
        stdio: 'pipe', env: { ...process.env, BS_BUILD_DATE: day },
    });
    const html = fs.readFileSync(path.join(dir, 'he.html'), 'utf8');
    fs.rmSync(dir, { recursive: true, force: true });
    return {
        title: /<title>([^<]*)<\/title>/.exec(html)[1],
        description: /<meta name="description" content="([^"]*)">/.exec(html)[1],
        ogTitle: /<meta property="og:title" content="([^"]*)">/.exec(html)[1],
    };
}

function dayAfter(d, n) {
    const t = new Date(d + 'T12:00:00Z');
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
}

test('the Hanukkah pack has a season the build can read', () => {
    assert.ok(season, 'questionPacks.hanukkah.season in game-model.ts');
});

test('in Hanukkah season the Hebrew home names Hanukkah, the game first', () => {
    [season[1], dayAfter(season[1], 4), season[2]].forEach(day => {
        const he = heOn(day);
        assert.match(he.title, /^בולשיט: /, day);
        assert.match(he.title, /משחק לחנוכה/, day);
        assert.ok(he.title.length <= 60, `${day}: ${he.title.length} characters`);
        assert.match(he.description, /^בולשיט הוא משחק מסיבות/, day);
        assert.match(he.description, /משחק לחנוכה עם כל המשפחה/, day);
        assert.match(he.description, /עובדות מוזרות ואמיתיות/, day);
        assert.ok(he.description.length <= 160, `${day}: ${he.description.length} characters`);
    });
});

test('before and after the season the Hebrew home has no Hanukkah words', () => {
    [dayAfter(season[1], -1), dayAfter(season[2], 1), dayAfter(season[2], 60)].forEach(day => {
        const he = heOn(day);
        assert.strictEqual(he.title, 'בולשיט: משחק מסיבות חינם בטלפון, לכל המשפחה', day);
        assert.doesNotMatch(he.description, /חנוכה/, day);
        assert.match(he.description, /^בולשיט הוא משחק מסיבות חינמי לעד 12 שחקנים בטלפון\./, day);
    });
});

test('the link preview keeps its short title all year', () => {
    assert.strictEqual(heOn(season[1]).ogTitle, heOn(dayAfter(season[2], 1)).ogTitle);
});
