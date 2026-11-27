// The English home's search title and description in Christmas season (scripts/en-season.js, run by
// scripts/stamp-release.js on the built page): Christmas and family game night while the Christmas
// question pack is in season, by the build's date, the game's name first and "not the card game"
// kept; the year-round words before and after; link previews and the Hebrew home untouched.
// Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { christmasSeason, readModel } = require('../scripts/en-season.js');

const GAME = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(GAME, 'src', 'index.html'), 'utf8');
const season = christmasSeason(readModel());

function read(html) {
    return {
        title: /<title>([^<]*)<\/title>/.exec(html)[1],
        description: /<meta name="description" content="([^"]*)">/.exec(html)[1],
        ogTitle: /<meta property="og:title" content="([^"]*)">/.exec(html)[1],
        ogDescription: /<meta property="og:description" content="([^"]*)">/.exec(html)[1],
        twitterTitle: /<meta name="twitter:title" content="([^"]*)">/.exec(html)[1],
    };
}

/**
 * The English and Hebrew homes as the build makes them on `day`: stamp-release.js, then build-he.js
 * (with `stamp` false, build-he.js alone, as if there were no Christmas step).
 */
function homesOn(day, stamp = true) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-en-christmas-'));
    fs.writeFileSync(path.join(dir, 'index.html'), SRC);
    const env = { ...process.env, BS_BUILD_DATE: day };
    if (stamp) {
        execFileSync(process.execPath, [path.join(GAME, 'scripts', 'stamp-release.js'), dir], { stdio: 'pipe', env });
    }
    execFileSync(process.execPath, [path.join(GAME, 'scripts', 'build-he.js'), dir], { stdio: 'pipe', env });
    const en = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
    const he = fs.readFileSync(path.join(dir, 'he.html'), 'utf8');
    fs.rmSync(dir, { recursive: true, force: true });
    return { en: read(en), he: read(he), enHtml: en };
}

function dayAfter(d, n) {
    const t = new Date(d + 'T12:00:00Z');
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
}

const yearRound = read(SRC);

test('the Christmas pack has a season the build can read, through New Year', () => {
    assert.match(season.from, /^\d{4}-12-01$/);
    assert.match(season.to, /^\d{4}-01-0\d$/);
});

test('in Christmas season the English home names Christmas, the game first', () => {
    [season.from, '2026-12-24', season.to].forEach(day => {
        const { en } = homesOn(day);
        assert.match(en.title, /^Bullshit: /, day);
        assert.match(en.title, /Christmas party game/, day);
        assert.match(en.title, /phones?/, day);
        assert.match(en.title, /not the card game/, day);
        assert.ok(en.title.length <= 60, `${day}: ${en.title.length} characters`);
        assert.match(en.description, /^Not the card game: Bullshit is a free bluffing party game/, day);
        assert.match(en.description, /Christmas, holiday parties and family game night/, day);
        assert.match(en.description, /phone/, day);
        assert.ok(en.description.length <= 160, `${day}: ${en.description.length} characters`);
    });
});

test('before and after the season the English home keeps its year-round words', () => {
    [dayAfter(season.from, -1), dayAfter(season.to, 1), dayAfter(season.to, 60)].forEach(day => {
        const { en } = homesOn(day);
        assert.strictEqual(en.title, yearRound.title, day);
        assert.strictEqual(en.description, yearRound.description, day);
        assert.doesNotMatch(en.title + en.description, /Christmas/, day);
    });
});

test('link previews keep their year-round words; the Hebrew home gets none of Christmas', () => {
    ['2026-12-03', '2026-12-24'].forEach(day => {
        const homes = homesOn(day);
        ['ogTitle', 'ogDescription', 'twitterTitle'].forEach(k => assert.strictEqual(homes.en[k], yearRound[k], `${day} ${k}`));
        // The Hebrew home is what build-he.js makes of the page on that day without this step.
        assert.deepStrictEqual(homes.he, homesOn(day, false).he, day);
        assert.doesNotMatch(homes.he.title + homes.he.description, /Christmas/, day);
    });
});

test('only the title and the description change', () => {
    const strip = h => h
        .replace(/<title>[^<]*<\/title>/, '')
        .replace(/<meta name="description" content="[^"]*">/, '')
        .replace(/\n?[ \t]*<meta name="bs-release"[^>]*>/g, '');
    assert.strictEqual(strip(homesOn(season.from).enHtml), strip(SRC));
});
