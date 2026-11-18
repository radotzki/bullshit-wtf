// The daily puzzle on other sites, with one line of code:
//   - the embed, /embed/daily and /he/embed/daily: a small page made to sit in an iframe 300 to 420
//     px wide on another site. Today's question, the answers, the reveal, and a button to a game with
//     friends on bullshit.wtf in a new tab. Not for search (noindex, not in the sitemap), and the one
//     path firebase.json lets any site frame;
//   - the copy page, /daily-on-your-site and /he/daily-on-your-site: the line to copy and a live
//     preview, linked from the daily puzzle and from the search pages' footer.
// build-embed.js writes all four after build-daily.js. Words: embed-strings.js, with the puzzle's own
// (daily-strings.js). Rules: embed-core.js, with the puzzle's daily-core.js. Script: embed-client.js.
//
// The embed asks the puzzle's /_daily for its question, as the puzzle's page does, so the answer is
// never in the page itself; and it counts with the puzzle's rows (docs/daily-embed.md).
'use strict';
const fs = require('fs');
const path = require('path');
const daily = require('./daily-page');
const dailyWords = require('./daily-strings');
const words = require('./embed-strings');

const SITE = daily.SITE;
/** The embed's height in the line to copy: the reveal of a long question at 320 px fits without a scroll. */
const HEIGHT = 600;
const MAX_WIDTH = 420;
const read = (...parts) => fs.readFileSync(path.join(...parts), 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inScript = (js) => js.replace(/<\/(?=script)/gi, '<\\/').replace(/<!--/g, '<\\!--');
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const pick = (lang) => (lang === 'he' ? 'he' : 'en');

/**
 * The line a site copies: one iframe and nothing else. The sandbox lets the embed run its own script
 * and open the game in a new tab, and never lets it move or touch the host page.
 */
function snippet(lang, origin) {
    const e = words[pick(lang)];
    const s = dailyWords[pick(lang)];
    return `<iframe src="${origin === undefined ? SITE : origin}${e.embedPath}" title="${esc(s.title)}" width="100%" height="${HEIGHT}" `
        + `style="max-width:${MAX_WIDTH}px;border:0;border-radius:12px" loading="lazy" `
        + 'sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"></iframe>';
}

/** The words of the puzzle that the embed shows: only those, so the page stays small. */
const DAILY_KEYS = ['lang', 'dir', 'path', 'kicker', 'kickerDot', 'kickerCandle', 'candles', 'instruction', 'loading', 'loadError',
    'tryAgain', 'played', 'headTruth', 'headLie', 'truthLine', 'labelTruth', 'labelLie', 'labelPick', 'numbers', 'tooFew'];

function renderEmbed(lang) {
    const s = dailyWords[pick(lang)];
    const e = words[pick(lang)];
    const config = { s: {}, e: { play: e.play, playHanukkah: e.playHanukkah, playHint: e.playHint, more: e.more } };
    DAILY_KEYS.forEach(k => { config.s[k] = s[k]; });
    const he = s.lang === 'he';
    return `<!doctype html>
<html lang="${s.lang}" dir="${s.dir}" data-page="plain">
<head>
  <meta charset="utf-8">
  ${daily.visitBeacon()}
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <title>${esc(s.title)}</title>
  <link rel="canonical" href="${SITE}${s.path}">
  <style>
    :root { --brand: #db7151; --gold: #f3d467; --wine: #97374e; --ink: #2b2523; --paper: #fffaf3; --line: #e6d9cc; --good: #2f8f5b; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    html, body { margin: 0; }
    body { background: var(--paper); color: var(--ink); font: 15px/1.4 system-ui, -apple-system, "Segoe UI", Arial, sans-serif; }
    header { background: var(--wine); color: #fff; padding: 8px 12px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    header a { color: var(--gold); text-decoration: none; font-weight: 800; font-size: 18px; letter-spacing: ${he ? '0' : '1px'}; }
    header .kicker { font-size: 11px; font-weight: 700; letter-spacing: ${he ? '0' : '1px'}; color: #fff; text-align: end; margin: 0; }
    main { padding: 4px 12px 12px; }
    .how { margin: 8px 0 0; color: #5d524c; font-size: 14px; }
    .q { font-size: 19px; line-height: 1.3; font-weight: 700; margin: 8px 0 12px; overflow-wrap: anywhere; }
    .q .blank { color: var(--brand); letter-spacing: -1px; white-space: nowrap; }
    .answers { display: grid; gap: 8px; }
    .answer { display: block; width: 100%; padding: 10px 12px; border: 2px solid var(--wine); border-radius: 10px; background: #fff; color: var(--ink); font-family: inherit; font-weight: 600; font-size: 16px; line-height: 1.25; text-align: center; cursor: pointer; text-transform: uppercase; overflow-wrap: anywhere; }
    .answer:hover, .answer:focus-visible { background: #fbeee6; outline: none; }
    .note { margin: 8px 0 0; padding: 4px 10px; border-radius: 8px; background: #f7ece0; font-size: 13px; }
    h2.head { font-weight: 800; font-size: 20px; line-height: 1.2; margin: 8px 0 2px; text-transform: uppercase; color: var(--wine); overflow-wrap: anywhere; }
    h2.head.won { color: var(--good); }
    .sub { margin: 0 0 6px; font-weight: 600; overflow-wrap: anywhere; }
    .bars { display: grid; gap: 6px; margin: 8px 0 4px; }
    .bar { position: relative; overflow: hidden; border: 2px solid var(--line); border-radius: 10px; background: #fff; padding: 6px 10px; }
    .bar.truth { border-color: var(--good); }
    .bar.mine { box-shadow: 0 0 0 2px var(--gold); }
    .bar .fill { position: absolute; top: 0; bottom: 0; inset-inline-start: 0; background: #f7e3d8; }
    .bar.truth .fill { background: #d8f0e2; }
    .bar .line { position: relative; display: flex; align-items: baseline; gap: 6px; font-weight: 600; font-size: 15px; }
    .bar .text { text-transform: uppercase; overflow-wrap: anywhere; min-width: 0; }
    .bar .tags { display: flex; flex-wrap: wrap; gap: 4px; flex: 1 1 auto; }
    .bar .pct { margin-inline-start: auto; }
    .tag { font-size: 10px; font-weight: 700; letter-spacing: ${he ? '0' : '.5px'}; color: #7a5a4a; text-transform: uppercase; }
    .bar.truth .tag { color: var(--good); }
    .tag.pick { color: var(--ink); background: var(--gold); border-radius: 4px; padding: 0 4px; }
    .numbers { margin: 4px 0 10px; font-size: 13px; color: #5d524c; }
    .btn { display: block; width: 100%; padding: 12px 14px; border-radius: 8px; border: 0; text-decoration: none; text-align: center; font-family: inherit; font-weight: 800; font-size: 16px; line-height: 1.25; cursor: pointer; }
    .btn.primary { background: var(--brand); color: #fff; }
    .hint { margin: 6px 0 0; text-align: center; font-size: 12px; color: #6b5f59; }
    .more-line { margin: 8px 0 0; text-align: center; font-size: 13px; }
    a.more { color: var(--wine); }
    .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    #e-error { margin-top: 6px; }
    body.hanukkah header { background: #24407e; }
    body.hanukkah h2.head.lost { color: #24407e; }
    body.hanukkah .answer { border-color: #24407e; }
  </style>
</head>
<body>
  <header>
    <a id="e-home" href="${SITE}${s.path}" target="_blank" rel="noopener" aria-describedby="e-newtab">${esc(s.logo)}</a>
    <p class="kicker" id="e-kicker">${esc(s.kicker.replace('{dot}', ''))}</p>
  </header>
  <main>
    <p class="how" id="e-how">${esc(s.instruction)}</p>
    <p class="q" id="e-q">${esc(s.loading)}</p>
    <div id="e-error" hidden><button type="button" class="btn primary" id="e-retry">${esc(s.tryAgain)}</button></div>
    <div class="answers" id="e-answers"></div>
    <div id="e-reveal" hidden></div>
    <span class="sr" id="e-newtab">${esc(e.newTab)}</span>
    <noscript><p class="note">${esc(s.noscript)}</p></noscript>
  </main>
  <script>window.BSEmbed = ${json(config)};</script>
${['daily-core.js', 'embed-core.js', 'embed-client.js'].map(file => `  <script>
${inScript(read(__dirname, file))}
  </script>`).join('\n')}
</body>
</html>
`;
}

function renderCopy(lang) {
    const s = dailyWords[pick(lang)];
    const e = words[pick(lang)];
    const twin = words[pick(lang) === 'he' ? 'en' : 'he'];
    const he = s.lang === 'he';
    const ld = { '@context': 'https://schema.org', '@type': 'WebPage', name: e.h1, description: e.description, inLanguage: s.lang, url: SITE + e.path };
    return `<!doctype html>
<html lang="${s.lang}" dir="${s.dir}" data-page="plain">
<head>
  <meta charset="utf-8">
  ${daily.visitBeacon()}
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(e.title)}</title>
  <meta name="description" content="${esc(e.description)}">
  <link rel="canonical" href="${SITE}${e.path}">
  <link rel="alternate" hreflang="en" href="${SITE}${words.en.path}">
  <link rel="alternate" hreflang="he" href="${SITE}${words.he.path}">
  <link rel="alternate" hreflang="x-default" href="${SITE}${words.en.path}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Bullshit">
  <meta property="og:title" content="${esc(e.h1)}">
  <meta property="og:description" content="${esc(e.description)}">
  <meta property="og:url" content="${SITE}${e.path}">
  <meta property="og:image" content="${SITE}${s.image}">
  <meta property="og:locale" content="${he ? 'he_IL' : 'en_US'}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" type="image/png" href="/assets/favicon-32x32.png" sizes="32x32">
  <script type="application/ld+json">${json(ld)}</script>
  <style>
    :root { --brand: #db7151; --gold: #f3d467; --wine: #97374e; --ink: #2b2523; --paper: #fffaf3; --line: #e6d9cc; }
    * { box-sizing: border-box; }
    body { margin: 0; background: var(--paper); color: var(--ink); font: 17px/1.55 system-ui, -apple-system, "Segoe UI", Arial, sans-serif; }
    header { background: var(--wine); padding: 12px 16px; }
    header .top { max-width: 760px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    header a.logo { color: var(--gold); font-weight: 800; font-size: 24px; text-decoration: none; letter-spacing: ${he ? '0' : '1px'}; }
    header a.lang { color: #fff; font-size: 15px; }
    main { max-width: 760px; margin: 0 auto; padding: 8px 16px 32px; }
    h1 { color: var(--wine); font-size: 28px; line-height: 1.2; margin: 18px 0 8px; }
    h2 { color: var(--wine); font-size: 20px; margin: 26px 0 8px; }
    a { color: var(--wine); }
    textarea { display: block; width: 100%; min-height: 170px; padding: 10px 12px; border: 2px solid var(--line); border-radius: 8px; background: #fff; color: var(--ink); font: 14px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; direction: ltr; text-align: left; resize: vertical; }
    .btn { display: inline-block; margin: 10px 0 0; padding: 12px 18px; border-radius: 8px; border: 0; background: var(--brand); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
    .help { font-size: 15px; color: #5d524c; }
    .preview { display: flex; justify-content: center; padding: 16px 0; background: #f2e8dc; border-radius: 12px; }
    .preview iframe { display: block; }
    ul { padding-inline-start: 22px; }
    nav.more { border-top: 1px solid var(--line); margin-top: 28px; padding-top: 14px; display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 15px; }
  </style>
</head>
<body>
  <header>
    <div class="top">
      <a class="logo" href="${he ? '/he' : '/'}">${esc(s.logo)}</a>
      <a class="lang" href="${twin.path}" hreflang="${twin.lang}" lang="${twin.lang}">${esc(e.otherLang)}</a>
    </div>
  </header>
  <main>
    <h1>${esc(e.h1)}</h1>
    <p>${esc(e.lead)}</p>
    <h2><label for="e-line">${esc(e.stepCopy)}</label></h2>
    <textarea id="e-line" readonly spellcheck="false">${esc(snippet(lang))}</textarea>
    <button type="button" class="btn" id="e-copy">${esc(e.copyLine)}</button>
    <p class="help">${esc(e.copyHelp)}</p>
    <h2>${esc(e.previewTitle)}</h2>
    <div class="preview">
      <iframe src="${e.embedPath}" title="${esc(s.title)}" width="100%" height="${HEIGHT}" style="max-width:${MAX_WIDTH}px;border:0;border-radius:12px"></iframe>
    </div>
    <h2>${esc(e.goodTitle)}</h2>
    <ul>
${e.good.map(line => `      <li>${esc(line)}</li>`).join('\n')}
    </ul>
    <nav class="more">
      <a href="${s.path}">${esc(e.playToday)}</a>
      <a href="${twin.path}" hreflang="${twin.lang}" lang="${twin.lang}">${esc(e.otherLang)}</a>
    </nav>
  </main>
  <script>
    (function () {
      var area = document.getElementById('e-line');
      var button = document.getElementById('e-copy');
      var done = function () {
        button.textContent = ${json(e.copied)};
        setTimeout(function () { button.textContent = ${json(e.copyLine)}; }, 2000);
      };
      var old = function () {
        area.focus();
        area.select();
        try { if (document.execCommand('copy')) { done(); } } catch (err) { }
      };
      button.onclick = function () {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(area.value).then(done, old);
        } else {
          old();
        }
      };
      area.onfocus = function () { area.select(); };
    })();
  </script>
</body>
</html>
`;
}

/** The four pages, as build-embed.js writes them: [{ path, lang, kind, html }]. */
function pages() {
    const out = [];
    ['en', 'he'].forEach(lang => {
        out.push({ path: words[lang].embedPath, lang, kind: 'embed', html: renderEmbed(lang) });
        out.push({ path: words[lang].path, lang, kind: 'copy', html: renderCopy(lang) });
    });
    return out;
}

/** The copy pages' entries for sitemap.xml, twins of each other. The embeds are not for search. */
function sitemapUrls() {
    return ['en', 'he'].map(lang => `  <url>
    <loc>${SITE}${words[lang].path}</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${SITE}${words.en.path}"/>
    <xhtml:link rel="alternate" hreflang="he" href="${SITE}${words.he.path}"/>
  </url>`).join('\n');
}

module.exports = { renderEmbed, renderCopy, pages, sitemapUrls, snippet, words, HEIGHT, MAX_WIDTH, SITE };
