// Writes dist/404.html: the page for an address that is neither a file nor one of the game's own
// screens. firebase.json lists the game's screens one by one (no catch-all), so Firebase Hosting
// answers any other address with this file and a real 404 status, and search engines stop seeing
// every mistyped or old address as a copy of the home page. In both languages, with links home.
// Run after `ng build` (see the "build" script in package.json).
//   node scripts/build-404.js [outDir]
const fs = require('fs');
const path = require('path');

const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist'));

// The visit beacon, as on the search pages (seo/build-pages.js): a view of this page is counted, with
// the address that was not found, so broken links show up in the visits table.
function visitBeacon() {
    const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
    const m = /<!-- BS:VISIT:START -->\s*(<script>[\s\S]*?<\/script>)\s*<!-- BS:VISIT:END -->/.exec(html);
    if (!m) {
        throw new Error('build-404: the visit beacon (BS:VISIT markers) is missing from src/index.html');
    }
    return m[1];
}

const page = `<!doctype html>
<html lang="en" data-page="plain">
<head>
  <meta charset="utf-8">
  ${visitBeacon()}
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>Page not found · Bullshit</title>
  <link rel="icon" type="image/png" href="/assets/favicon-32x32.png" sizes="32x32">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #fffaf3; color: #2b2523; font: 17px/1.6 system-ui, -apple-system, "Segoe UI", Arial, sans-serif; }
    header { background: #97374e; color: #f3d467; padding: 14px 16px; font-size: 26px; font-weight: 700; letter-spacing: 1px; }
    main { max-width: 760px; margin: 0 auto; padding: 8px 16px 32px; }
    section { margin: 24px 0; }
    h1 { color: #97374e; font-size: 26px; line-height: 1.25; margin: 0 0 8px; }
    a { color: #97374e; }
    .btn { display: inline-block; margin-top: 8px; padding: 12px 20px; border-radius: 8px; background: #db7151; color: #fff; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <header>Bullshit · בולשיט</header>
  <main>
    <section>
      <h1>This page doesn't exist</h1>
      <p>The address may be mistyped, or the page has moved. To join a game, ask the host for the four-letter PIN.</p>
      <a class="btn" href="/">Go to the game</a> <a href="/how-to-play">How to play</a>
    </section>
    <section lang="he" dir="rtl">
      <h1>הדף הזה לא קיים</h1>
      <p>אולי יש טעות בכתובת, או שהדף עבר. כדי להצטרף למשחק, בקשו מהמארח את הקוד בן ארבע האותיות.</p>
      <a class="btn" href="/he">למשחק</a> <a href="/he/how-to-play">איך משחקים</a>
    </section>
  </main>
</body>
</html>
`;

if (!fs.existsSync(out)) {
    throw new Error(`build-404: no build output at ${out}; run the Angular build first`);
}
fs.writeFileSync(path.join(out, '404.html'), page);
console.log('build-404: wrote dist/404.html');
