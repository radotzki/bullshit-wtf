// Writes dist/privacy.html and dist/he/privacy.html: what the game keeps, and why (words in
// privacy-text.js). cleanUrls in firebase.json serves them at /privacy and /he/privacy.
// A plain page with no way into the game (no Start button, no link home): the CrazyGames version
// links to it, and CrazyGames allows a privacy link but no link to a playable version. No visit
// beacon, and not in the sitemap: it is not a page for search.
// Run after `ng build` (see the "build" script in package.json).
//   node scripts/build-privacy.js [outDir]
const fs = require('fs');
const path = require('path');
const { PRIVACY } = require('./privacy-text');

const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist'));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function section(s) {
    const parts = [`<h2>${esc(s.h)}</h2>`];
    (s.p || []).forEach(p => parts.push(`<p>${esc(p)}</p>`));
    if (s.list) {
        parts.push('<ul>' + s.list.map(li => `<li>${esc(li)}</li>`).join('') + '</ul>');
    }
    if (s.link) {
        parts.push(`<p><a href="${esc(s.link.href)}" rel="noopener" dir="ltr">${esc(s.link.label)}</a></p>`);
    }
    return `    <section>\n      ${parts.join('\n      ')}\n    </section>`;
}

function render(t) {
    return `<!doctype html>
<html lang="${t.lang}" dir="${t.dir}" data-page="plain">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(t.pageTitle)}</title>
  <link rel="icon" type="image/png" href="/assets/favicon-32x32.png" sizes="32x32">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #fffaf3; color: #2b2523; font: 17px/1.6 system-ui, -apple-system, "Segoe UI", Arial, sans-serif; }
    header { background: #97374e; color: #f3d467; padding: 14px 16px; font-size: 26px; font-weight: 700; letter-spacing: 1px;
      display: flex; justify-content: space-between; align-items: center; }
    header a { color: #f3d467; font-size: 15px; font-weight: 400; letter-spacing: 0; }
    main { max-width: 760px; margin: 0 auto; padding: 8px 16px 32px; }
    section { margin: 22px 0; }
    h1 { color: #97374e; font-size: 28px; line-height: 1.25; margin: 20px 0 4px; }
    h2 { color: #97374e; font-size: 20px; line-height: 1.3; margin: 0 0 6px; }
    p, ul { margin: 0 0 8px; }
    ul { padding-inline-start: 22px; }
    li { margin: 4px 0; }
    a { color: #97374e; overflow-wrap: anywhere; }
    .updated { color: #6b5f5a; font-size: 14px; }
  </style>
</head>
<body>
  <header><span>${t.lang === 'he' ? 'בולשיט' : 'BULLSHIT'}</span><a href="${t.other.href}" lang="${t.lang === 'he' ? 'en' : 'he'}">${esc(t.other.label)}</a></header>
  <main>
    <h1>${esc(t.title)}</h1>
    <p class="updated">${esc(t.updated)}</p>
    <p>${esc(t.intro)}</p>
${t.sections.map(section).join('\n')}
  </main>
</body>
</html>
`;
}

if (require.main === module) {
    if (!fs.existsSync(out)) {
        throw new Error(`No build output at ${out}; run the Angular build first`);
    }
    for (const t of [PRIVACY.en, PRIVACY.he]) {
        const file = path.join(out, t.path.replace(/^\//, '') + '.html');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, render(t));
    }
    console.log(`Wrote privacy.html and he/privacy.html to ${out}`);
}

module.exports = { render };
