// Writes the plain HTML pages, sitemap.xml and robots.txt into dist/ after the
// Angular build. Firebase Hosting serves real files before the SPA rewrite, and
// cleanUrls in firebase.json serves /how-to-play from how-to-play.html.
//   node seo/build-pages.js [outDir]
const fs = require('fs');
const path = require('path');
const pages = require('./pages');

const SITE = 'https://bullshit.wtf';
const IMAGE = 'https://res.cloudinary.com/bullshit-wtf/image/upload/v1489440712/logo_y0uyd5.png';
const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const byPath = {};
pages.forEach(p => byPath[p.path] = p);

function hreflang(p) {
    const en = p.site.lang === 'en' ? p : byPath[p.twin];
    const he = p.site.lang === 'he' ? p : byPath[p.twin];
    return [
        `<link rel="alternate" hreflang="en" href="${SITE}${en.path}">`,
        `<link rel="alternate" hreflang="he" href="${SITE}${he.path}">`,
        `<link rel="alternate" hreflang="x-default" href="${SITE}${en.path}">`,
    ].join('\n  ');
}

function render(p) {
    const s = p.site;
    const ld = {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: p.title,
        description: p.description,
        inLanguage: s.lang,
        url: SITE + p.path,
        about: {
            '@type': 'VideoGame',
            name: s.lang === 'he' ? 'בולשיט' : 'Bullshit',
            url: SITE + '/',
            genre: ['Party game', 'Trivia', 'Bluffing'],
            gamePlatform: 'Web browser',
            playMode: 'MultiPlayer',
            numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 8 },
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        },
    };
    const nav = s.nav.map(n => n.href === p.path
        ? `<a href="${n.href}" aria-current="page">${esc(n.label)}</a>`
        : `<a href="${n.href}">${esc(n.label)}</a>`).join('\n      ');

    return `<!doctype html>
<html lang="${s.lang}" dir="${s.dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(p.title)}</title>
  <meta name="description" content="${esc(p.description)}">
  <link rel="canonical" href="${SITE}${p.path}">
  ${hreflang(p)}
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Bullshit">
  <meta property="og:title" content="${esc(p.title)}">
  <meta property="og:description" content="${esc(p.description)}">
  <meta property="og:url" content="${SITE}${p.path}">
  <meta property="og:image" content="${IMAGE}">
  <meta property="og:locale" content="${s.lang === 'he' ? 'he_IL' : 'en_US'}">
  <meta name="twitter:card" content="summary">
  <link rel="icon" type="image/png" href="/assets/favicon-32x32.png" sizes="32x32">
  <link href="https://fonts.googleapis.com/css?family=Luckiest+Guy|Suez+One" rel="stylesheet">
  <script type="application/ld+json">${JSON.stringify(ld)}</script>
  <style>
    :root { --brand: #db7151; --gold: #f3d467; --wine: #97374e; --ink: #2b2523; --paper: #fffaf3; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--paper); color: var(--ink); font: 17px/1.6 system-ui, -apple-system, "Segoe UI", Arial, sans-serif; }
    header { background: var(--wine); color: #fff; padding: 14px 16px; }
    header .bar { max-width: 760px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .logo { font-family: "Luckiest Guy", cursive; font-size: 28px; color: var(--gold); text-decoration: none; letter-spacing: 1px; }
    header a.lang { color: #fff; font-size: 15px; }
    main { max-width: 760px; margin: 0 auto; padding: 8px 16px 32px; }
    h1 { font-family: ${s.lang === 'he' ? '"Suez One", serif' : '"Luckiest Guy", cursive'}; color: var(--wine); font-weight: normal; font-size: 34px; line-height: 1.2; margin: 24px 0 12px; }
    h2 { color: var(--wine); font-size: 22px; margin: 28px 0 8px; }
    a { color: var(--wine); }
    ol, ul { padding-inline-start: 22px; }
    li { margin: 6px 0; }
    table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 15px; }
    th, td { border: 1px solid #e6d9cc; padding: 6px 8px; text-align: start; }
    th { background: #f7ece0; }
    .cta { display: flex; flex-wrap: wrap; gap: 12px; margin: 28px 0 8px; }
    .btn { display: inline-block; padding: 14px 22px; border-radius: 8px; text-decoration: none; font-size: 19px; font-weight: 600; }
    .btn.primary { background: var(--brand); color: #fff; }
    .btn.secondary { border: 2px solid var(--brand); color: var(--brand); }
    nav.more { border-top: 1px solid #e6d9cc; margin-top: 32px; padding-top: 16px; display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 15px; }
    nav.more a[aria-current] { color: var(--ink); text-decoration: none; font-weight: 600; }
    footer { max-width: 760px; margin: 0 auto; padding: 0 16px 32px; font-size: 14px; color: #6b5f59; }
  </style>
</head>
<body>
  <header>
    <div class="bar">
      <a class="logo" href="/">${s.lang === 'he' ? 'בולשיט' : 'Bullshit'}</a>
      <a class="lang" href="${p.twin}" hreflang="${s.lang === 'he' ? 'en' : 'he'}" lang="${s.lang === 'he' ? 'en' : 'he'}">${esc(s.other)}</a>
    </div>
  </header>
  <main>
    <h1>${esc(p.h1)}</h1>
${p.body.trim().split('\n').map(l => '    ' + l).join('\n')}
    <div class="cta">
      <a class="btn primary" href="${s.start.href}">${esc(s.start.label)}</a>
      <a class="btn secondary" href="${s.join.href}">${esc(s.join.label)}</a>
    </div>
    <nav class="more">
      ${nav}
    </nav>
  </main>
  <footer>${esc(s.footer)}</footer>
</body>
</html>
`;
}

function sitemap() {
    const today = new Date().toISOString().slice(0, 10);
    const home = `  <url>\n    <loc>${SITE}/</loc>\n    <lastmod>${today}</lastmod>\n  </url>`;
    const urls = pages.map(p => {
        const en = p.site.lang === 'en' ? p : byPath[p.twin];
        const he = p.site.lang === 'he' ? p : byPath[p.twin];
        return `  <url>
    <loc>${SITE}${p.path}</loc>
    <lastmod>${today}</lastmod>
    <xhtml:link rel="alternate" hreflang="en" href="${SITE}${en.path}"/>
    <xhtml:link rel="alternate" hreflang="he" href="${SITE}${he.path}"/>
  </url>`;
    });
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${[home].concat(urls).join('\n')}
</urlset>
`;
}

// Game screens (a PIN in the address) have nothing to index. Join links stay
// crawlable so chat apps can still read their link previews.
const robots = `User-agent: *
Disallow: /game-staging/
Disallow: /round-intro/
Disallow: /show-question/
Disallow: /show-answers/
Disallow: /reveal-the-truth/
Disallow: /score-board/
Disallow: /score-board-final/

Sitemap: ${SITE}/sitemap.xml
`;

// Every page needs its twin, and twins must point at each other.
pages.forEach(p => {
    const t = byPath[p.twin];
    if (!t || t.twin !== p.path || t.site.lang === p.site.lang) {
        throw new Error(`Page ${p.path} has no matching twin`);
    }
});

if (!fs.existsSync(out)) {
    throw new Error(`No build output at ${out}; run the Angular build first`);
}
pages.forEach(p => {
    const file = path.join(out, p.path.replace(/^\//, '') + '.html');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, render(p));
});
fs.writeFileSync(path.join(out, 'sitemap.xml'), sitemap());
fs.writeFileSync(path.join(out, 'robots.txt'), robots);
console.log(`Wrote ${pages.length} pages, sitemap.xml and robots.txt to ${out}`);
