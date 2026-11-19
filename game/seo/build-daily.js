// Writes the daily puzzle's two pages (daily.html, he/daily.html) into dist/ and lists them in
// sitemap.xml. Runs after build-pages.js, which writes the search pages and the sitemap: the
// puzzle is a page of another kind (it has a script of its own and asks the server for its
// question), so it is built apart from them.
// It also lists the past puzzles: their list pages (/daily/past, /he/daily/past) here in sitemap.xml,
// and the sitemap of the days themselves (/sitemap-daily.xml, which grows by a day each day) in
// robots.txt. The dailyPast function serves both (functions/src/controllers/daily-past.ts).
//   node seo/build-daily.js [outDir]
'use strict';
const fs = require('fs');
const path = require('path');
const daily = require('./daily-page');

const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist'));
const sitemapFile = path.join(out, 'sitemap.xml');
if (!fs.existsSync(sitemapFile)) {
    throw new Error(`No sitemap.xml in ${out}; run seo/build-pages.js first`);
}
const pages = daily.pages();
pages.forEach(p => {
    const file = path.join(out, p.path.replace(/^\//, '') + '.html');
    if (fs.existsSync(file)) {
        throw new Error(`The daily puzzle and another page share the path ${p.path}`);
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, p.html);
});
const sitemap = fs.readFileSync(sitemapFile, 'utf8');
if (sitemap.indexOf('</urlset>') < 0 || sitemap.indexOf(`<loc>${daily.SITE}${pages[0].path}</loc>`) >= 0) {
    throw new Error('sitemap.xml is not the one build-pages.js writes, or already lists the daily puzzle');
}
const past = ['/daily/past', '/he/daily/past'].map(loc => `  <url>
    <loc>${daily.SITE}${loc}</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${daily.SITE}/daily/past"/>
    <xhtml:link rel="alternate" hreflang="he" href="${daily.SITE}/he/daily/past"/>
  </url>`).join('\n');
fs.writeFileSync(sitemapFile, sitemap.replace('</urlset>', daily.sitemapUrls() + '\n' + past + '\n</urlset>'));
const robotsFile = path.join(out, 'robots.txt');
const robots = fs.readFileSync(robotsFile, 'utf8');
if (robots.indexOf('/sitemap-daily.xml') < 0) {
    fs.writeFileSync(robotsFile, robots.replace(/\n*$/, '\n') + `Sitemap: ${daily.SITE}/sitemap-daily.xml\n`);
}
console.log(`Wrote ${pages.length} daily puzzle pages to ${out}, listed them and the past puzzles in sitemap.xml, and the past days' sitemap in robots.txt`);
