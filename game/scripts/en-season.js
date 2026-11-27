// The English home's search title and description in Christmas season: while the Christmas question
// pack is in season (questionPacks.christmas.season in game-model.ts, 1 December to 2 January), the
// built dist/index.html names Christmas and the holidays ("Christmas party game", "family game night"),
// the game's name still first and "not the card game" kept. Only <title> and <meta name="description">
// change: the link previews (og:, twitter:) and the page's text stay as they are all year.
//
// By the build's date: the site is built on every deploy, so the first deploy after the season's
// last day drops the words. Next year's days go in game-model.ts only. BS_BUILD_DATE=YYYY-MM-DD
// overrides the date (tests). scripts/stamp-release.js runs this on dist/index.html, before
// build-he.js copies it; the Hebrew page puts its own title and description in their place.
const fs = require('fs');
const path = require('path');

const TITLE = 'Bullshit: Christmas party game on phones, not the card game';
const DESCRIPTION = 'Not the card game: Bullshit is a free bluffing party game for Christmas, holiday parties and family game night. ' +
    'Everyone plays on their phone, 2 to 12 players.';

/** { from, to } of questionPacks.christmas.season in game-model.ts; throws if it is not there. */
function christmasSeason(model) {
    const m = /\bchristmas: \{[^}]*?season: \{ from: '(\d{4}-\d\d-\d\d)', to: '(\d{4}-\d\d-\d\d)' \}/.exec(model);
    if (!m) {
        throw new Error('en-season: questionPacks.christmas.season not found in game-model.ts');
    }
    return { from: m[1], to: m[2] };
}

function readModel() {
    return fs.readFileSync(path.join(__dirname, '..', '..', 'game-model.ts'), 'utf8');
}

/** The build's day, YYYY-MM-DD (UTC, or BS_BUILD_DATE). */
function buildDay(env) {
    return (env && env.BS_BUILD_DATE) || new Date().toISOString().slice(0, 10);
}

/** The page with the season's title and description if `day` is in the Christmas season, else as it is. */
function seasonal(html, day, season) {
    if (day < season.from || day > season.to) {
        return html;
    }
    const title = /<title>[^<]*<\/title>/;
    const description = /<meta name="description" content="[^"]*">/;
    if (!title.test(html) || !description.test(html)) {
        throw new Error('en-season: <title> or <meta name="description"> not found in dist/index.html');
    }
    return html
        .replace(title, () => `<title>${TITLE}</title>`)
        .replace(description, () => `<meta name="description" content="${DESCRIPTION}">`);
}

module.exports = { TITLE, DESCRIPTION, christmasSeason, readModel, buildDay, seasonal };
