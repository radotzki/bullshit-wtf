// robots.txt, written into dist/ by build-pages.js.
//
// The game's screens (/game-staging/ABCD, /score-board-final/ABCD and the rest) are kept out of search
// by the X-Robots-Tag: noindex header in firebase.json, not here. A search engine reads that header only
// on a page it is allowed to fetch: a Disallow line would hide the noindex, and a game address it already
// holds would stay listed, with no text. So robots blocks nothing, and test/robots-noindex.test.js fails
// if a Disallow line comes back over a game screen, a home or a search page.
function robotsTxt(site) {
    return `User-agent: *
Allow: /

Sitemap: ${site}/sitemap.xml
`;
}

module.exports = { robotsTxt };
