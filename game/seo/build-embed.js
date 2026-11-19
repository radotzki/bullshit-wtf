// Writes the daily puzzle's embed (embed/daily.html, he/embed/daily.html) and the page with its line
// of code (daily-on-your-site.html, he/daily-on-your-site.html) into dist/, and lists the two copy
// pages in sitemap.xml. Runs after build-daily.js; see embed-page.js.
//   node seo/build-embed.js [outDir]
'use strict';
const fs = require('fs');
const path = require('path');
const embed = require('./embed-page');

const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist'));
const sitemapFile = path.join(out, 'sitemap.xml');
if (!fs.existsSync(sitemapFile)) {
    throw new Error(`No sitemap.xml in ${out}; run seo/build-pages.js first`);
}
const pages = embed.pages();
pages.forEach(p => {
    const file = path.join(out, p.path.replace(/^\//, '') + '.html');
    if (fs.existsSync(file)) {
        throw new Error(`The daily puzzle's embed and another page share the path ${p.path}`);
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, p.html);
});
const sitemap = fs.readFileSync(sitemapFile, 'utf8');
if (sitemap.indexOf('</urlset>') < 0 || sitemap.indexOf(`<loc>${embed.SITE}${embed.words.en.path}</loc>`) >= 0) {
    throw new Error('sitemap.xml is not the one build-pages.js writes, or already lists the embed\'s copy page');
}
fs.writeFileSync(sitemapFile, sitemap.replace('</urlset>', embed.sitemapUrls() + '\n</urlset>'));
console.log(`Wrote ${pages.length} pages of the daily puzzle's embed to ${out} and listed the copy pages in sitemap.xml`);
