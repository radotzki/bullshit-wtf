// The daily puzzle's page: /daily (English) and /he/daily (Hebrew), plain HTML with a small inline
// script and no Angular, so a tap from a chat shows the question fast and the page has a link
// preview of its own. build-daily.js writes both pages and lists them in the sitemap as twins.
//
// The page is the words of its language (daily-strings.js), the rules (daily-core.js), the page
// script (daily-client.js) and two checks taken from the game as they are, compiled here the way
// copy-shared.js hands them to the apps: the nickname filter (name-flag.ts with name-lists.json)
// and the same-answer rule (functions/src/controllers/same-answer.ts). A friend's lie is screened
// with the very code that screens a nickname and a lie in a game.
'use strict';
const fs = require('fs');
const path = require('path');
const strings = require('./daily-strings');

const ROOT = path.join(__dirname, '..', '..');
const SITE = 'https://bullshit.wtf';
const read = (...parts) => fs.readFileSync(path.join(...parts), 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Inside <script>: no "</script" and no "<!--" may appear, whatever a word list or a comment holds.
const inScript = (js) => js.replace(/<\/(?=script)/gi, '<\\/').replace(/<!--/g, '<\\!--');
const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/** The most players a game seats, read from the game's own code (8 until the 12-seat change lands). */
function maxPlayers() {
    const m = /export const MAX_PLAYERS\s*=\s*(\d+)/.exec(read(ROOT, 'game-model.ts'));
    return m ? Number(m[1]) : 8;
}

/** A TypeScript file of the game as a CommonJS module body, for the browser (ES5) and for Node. */
function compiled(file) {
    const ts = require('typescript');
    return ts.transpileModule(read(ROOT, file), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES5 },
    }).outputText;
}

/**
 * The script that defines window.BSDailyShared = { isSameAnswer, nameFlag }: the two compiled
 * modules, each run as a function with its own `exports`, and the word lists as data.
 */
function sharedScript() {
    const lists = JSON.parse(read(ROOT, 'name-lists.json'));
    return `(function (root) {
var lists = { NAME_LISTS: ${json(lists)} };
var flag = {};
(function (exports, require) {
${compiled('name-flag.ts')}
})(flag, function () { return lists; });
var same = {};
(function (exports, require) {
${compiled(path.join('functions', 'src', 'controllers', 'same-answer.ts'))}
})(same, function () { return {}; });
root.BSDailyShared = { isSameAnswer: same.isSameAnswer, nameFlag: flag.nameFlag };
})(typeof window !== 'undefined' ? window : globalThis);`;
}

/** The same two checks for the tests in Node: { isSameAnswer, nameFlag }. */
function loadShared() {
    const root = {};
    new Function('window', sharedScript())(root);
    return root.BSDailyShared;
}

/**
 * The visit beacon of the site's pages, once the game's own page carries one (between BS:VISIT
 * markers in src/index.html): the same inline script, so a view of the puzzle is counted like a
 * view of any plain page. Until then, nothing.
 */
function visitBeacon() {
    const m = /<!-- BS:VISIT:START -->\s*(<script>[\s\S]*?<\/script>)\s*<!-- BS:VISIT:END -->/.exec(read(ROOT, 'game', 'src', 'index.html'));
    return m ? m[1] : '';
}

const coreScript = () => read(__dirname, 'daily-core.js');
const clientScript = () => read(__dirname, 'daily-client.js');

function render(lang) {
    const s = strings[lang];
    const twin = strings[lang === 'he' ? 'en' : 'he'];
    const ld = {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: s.title,
        description: s.description,
        inLanguage: s.lang,
        url: SITE + s.path,
    };
    const config = { s, max: maxPlayers() };
    return `<!doctype html>
<html lang="${s.lang}" dir="${s.dir}" data-page="plain">
<head>
  <meta charset="utf-8">
  ${visitBeacon()}
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(s.title)}</title>
  <meta name="description" content="${esc(s.description)}">
  <link rel="canonical" href="${SITE}${s.path}">
  <link rel="alternate" hreflang="en" href="${SITE}${strings.en.path}">
  <link rel="alternate" hreflang="he" href="${SITE}${strings.he.path}">
  <link rel="alternate" hreflang="x-default" href="${SITE}${strings.en.path}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Bullshit">
  <meta property="og:title" content="${esc(s.title)}">
  <meta property="og:description" content="${esc(s.description)}">
  <meta property="og:url" content="${SITE}${s.path}">
  <meta property="og:image" content="${SITE}${s.image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${esc(s.title)}">
  <meta property="og:locale" content="${s.lang === 'he' ? 'he_IL' : 'en_US'}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" type="image/png" href="/assets/favicon-32x32.png" sizes="32x32">
  <link href="https://fonts.googleapis.com/css?family=Luckiest+Guy|Suez+One" rel="stylesheet">
  <script type="application/ld+json">${json(ld)}</script>
  <style>
    :root { --brand: #db7151; --gold: #f3d467; --wine: #97374e; --ink: #2b2523; --paper: #fffaf3; --line: #e6d9cc; --good: #2f8f5b; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body { margin: 0; background: var(--paper); color: var(--ink); font: 17px/1.5 system-ui, -apple-system, "Segoe UI", Arial, sans-serif; }
    header { background: var(--wine); color: #fff; padding: 12px 16px; }
    header .top { max-width: 520px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .logo { font-family: ${s.lang === 'he' ? '"Suez One", serif' : '"Luckiest Guy", cursive'}; font-size: 26px; color: var(--gold); text-decoration: none; letter-spacing: 1px; }
    header a.lang { color: #fff; font-size: 15px; }
    main { max-width: 520px; margin: 0 auto; padding: 4px 16px 40px; }
    h1.kicker { font: 700 14px/1.3 system-ui, -apple-system, "Segoe UI", Arial, sans-serif; letter-spacing: ${s.lang === 'he' ? '0' : '1.5px'}; color: var(--wine); margin: 18px 0 4px; }
    .candles { display: flex; gap: 7px; margin: 6px 0 2px; }
    .candles i { width: 7px; height: 22px; border-radius: 2px; background: #cdbfae; position: relative; }
    .candles i.lit { background: #3a5ba0; }
    .candles i.lit::before { content: ""; position: absolute; top: -9px; left: 0; width: 7px; height: 9px; border-radius: 50% 50% 40% 40%; background: var(--gold); box-shadow: 0 0 6px #f7b733; }
    .note { margin: 6px 0; padding: 8px 12px; border-radius: 8px; background: #f7ece0; font-size: 15px; }
    .how { margin: 4px 0 0; color: #5d524c; font-size: 16px; }
    .q { font-family: ${s.lang === 'he' ? '"Suez One", serif' : 'inherit'}; font-size: 24px; line-height: 1.3; font-weight: ${s.lang === 'he' ? 'normal' : '700'}; margin: 14px 0 16px; overflow-wrap: anywhere; }
    .q .blank { color: var(--brand); letter-spacing: -1px; white-space: nowrap; }
    .answers { display: grid; gap: 10px; }
    .answer { display: block; width: 100%; padding: 14px 16px; border: 2px solid var(--wine); border-radius: 10px; background: #fff; color: var(--ink); font-family: inherit; font-weight: 600; font-size: 18px; line-height: 1.3; text-align: center; cursor: pointer; text-transform: uppercase; overflow-wrap: anywhere; }
    .answer:hover, .answer:focus-visible { background: #fbeee6; outline: none; }
    .foot { margin: 16px 0 0; text-align: center; color: #6b5f59; font-size: 14px; }
    h2 { color: var(--wine); font-size: 21px; line-height: 1.25; margin: 0 0 6px; }
    h2.head { font-family: ${s.lang === 'he' ? '"Suez One", serif' : '"Luckiest Guy", cursive'}; font-weight: normal; font-size: 30px; line-height: 1.15; margin: 6px 0 4px; text-transform: uppercase; overflow-wrap: anywhere; }
    h2.head.won { color: var(--good); }
    .sub { margin: 0 0 12px; font-weight: 600; overflow-wrap: anywhere; }
    .bars { display: grid; gap: 8px; margin: 12px 0 8px; }
    .bar { position: relative; overflow: hidden; border: 2px solid var(--line); border-radius: 10px; background: #fff; padding: 9px 12px; }
    .bar.truth { border-color: var(--good); }
    .bar.mine { box-shadow: 0 0 0 2px var(--gold); }
    .bar .fill { position: absolute; top: 0; bottom: 0; inset-inline-start: 0; background: #f7e3d8; }
    .bar.truth .fill { background: #d8f0e2; }
    .bar .line, .bar .tags { position: relative; display: flex; gap: 8px; }
    .bar .line { justify-content: space-between; font-weight: 600; font-size: 17px; }
    .bar .text { text-transform: uppercase; overflow-wrap: anywhere; min-width: 0; }
    .bar .tags { flex-wrap: wrap; margin-top: 3px; }
    .tag { font-size: 11px; font-weight: 700; letter-spacing: ${s.lang === 'he' ? '0' : '.6px'}; color: #7a5a4a; text-transform: uppercase; overflow-wrap: anywhere; }
    .bar.truth .tag { color: var(--good); }
    .tag.pick { color: var(--ink); background: var(--gold); border-radius: 4px; padding: 0 5px; }
    .numbers { margin: 4px 0; font-size: 15px; color: #5d524c; }
    .source-line { margin: 4px 0 0; font-size: 15px; }
    a { color: var(--wine); }
    .send { display: flex; flex-wrap: wrap; gap: 10px; margin: 16px 0 6px; }
    .btn { display: inline-block; padding: 13px 18px; border-radius: 8px; border: 0; text-decoration: none; text-align: center; font-family: inherit; font-weight: 700; font-size: 17px; line-height: 1.25; cursor: pointer; }
    .btn.primary { background: var(--brand); color: #fff; flex: 1 1 200px; }
    .btn.secondary { background: transparent; border: 2px solid var(--brand); color: var(--brand); flex: 0 1 auto; }
    .card { margin: 22px 0 0; padding: 16px; border: 1px solid var(--line); border-radius: 12px; background: #fff; }
    .card p { margin: 0 0 10px; }
    .card .btn.primary { display: block; width: 100%; }
    .card .send { margin: 10px 0 0; }
    .field { display: block; margin: 0 0 10px; font-size: 14px; color: #5d524c; }
    .field input { display: block; width: 100%; margin-top: 3px; padding: 11px 12px; border: 2px solid var(--line); border-radius: 8px; font-family: inherit; font-size: 17px; line-height: 1.3; color: var(--ink); background: var(--paper); }
    .field input:focus { border-color: var(--brand); outline: none; }
    .error { color: #b3261e; font-weight: 600; }
    .card .count { margin: 12px 0 0; font-weight: 600; overflow-wrap: anywhere; }
    .card .hint { margin: 8px 0 0; text-align: center; font-size: 14px; color: #6b5f59; }
    .next { margin: 24px 0 0; text-align: center; font-variant-numeric: tabular-nums; }
    .yesterday { margin: 10px 0 0; text-align: center; font-size: 15px; color: #5d524c; overflow-wrap: anywhere; }
    #d-error { margin-top: 8px; }
    body.hanukkah header { background: #24407e; }
    body.hanukkah h1.kicker, body.hanukkah h2 { color: #24407e; }
    body.hanukkah .answer { border-color: #24407e; }
  </style>
</head>
<body>
  <header>
    <div class="top">
      <a class="logo" href="${s.home}">${esc(s.logo)}</a>
      <a class="lang" href="${twin.path}" hreflang="${twin.lang}" lang="${twin.lang}">${esc(s.other)}</a>
    </div>
  </header>
  <main>
    <h1 class="kicker" id="d-kicker">${esc(s.kicker.replace('{dot}', ''))}</h1>
    <div class="candles" id="d-candles" aria-hidden="true" hidden></div>
    <p class="note" id="d-note" hidden></p>
    <p class="how" id="d-how">${esc(s.instruction)}</p>
    <p class="q" id="d-q">${esc(s.loading)}</p>
    <div id="d-error" hidden><button type="button" class="btn primary" id="d-retry">${esc(s.tryAgain)}</button></div>
    <div class="answers" id="d-answers"></div>
    <div id="d-reveal" hidden></div>
    <p class="foot" id="d-foot">${esc(s.foot)}</p>
    <noscript><p class="note">${esc(s.noscript)}</p></noscript>
  </main>
  <script>window.BSDaily = ${json(config)};</script>
  <script>
${inScript(sharedScript())}
  </script>
  <script>
${inScript(coreScript())}
  </script>
  <script>
${inScript(clientScript())}
  </script>
</body>
</html>
`;
}

/** The two pages, as build-daily.js writes them: [{ path, html }]. */
function pages() {
    return ['en', 'he'].map(lang => ({ path: strings[lang].path, lang, html: render(lang) }));
}

/** The two pages' entries for sitemap.xml, twins of each other. */
function sitemapUrls() {
    return ['en', 'he'].map(lang => `  <url>
    <loc>${SITE}${strings[lang].path}</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${SITE}${strings.en.path}"/>
    <xhtml:link rel="alternate" hreflang="he" href="${SITE}${strings.he.path}"/>
  </url>`).join('\n');
}

/** The link to today's question from another page of the site, tagged with where it stands. */
function linkTo(lang, tag) {
    return strings[lang === 'he' ? 'he' : 'en'].path + '?via=' + tag;
}

module.exports = { render, pages, sitemapUrls, linkTo, loadShared, sharedScript, maxPlayers, visitBeacon, strings, SITE };
