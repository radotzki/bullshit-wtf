// Writes dist/he.html: the built index.html with Hebrew link-preview tags.
// firebase.json serves /he and /he/** from it, so a Hebrew invite link
// (bullshit.wtf/he/join-game/ABCD) previews in Hebrew on WhatsApp and friends.
// Run after `ng build` (see the "build" script in package.json).
const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

const title = 'בולשיט - משחק השקרים למסיבות';
const description = 'עבדו על החברים עם תשובות מזויפות לעובדות מוזרות ואמיתיות. חינם, עד 12 שחקנים, כל אחד משחק מהטלפון.';
const image = 'https://bullshit.wtf/assets/og-image-he.png';

const hebrewMeta = `
  <meta name="description" content="בולשיט הוא משחק מסיבות חינמי לעד 12 שחקנים בטלפון. המציאו תשובות מזויפות לעובדות מוזרות ואמיתיות, עבדו על החברים וגלו את האמת.">
  <link rel="canonical" href="https://bullshit.wtf/he">
  <link rel="alternate" hreflang="en" href="https://bullshit.wtf/">
  <link rel="alternate" hreflang="he" href="https://bullshit.wtf/he">
  <link rel="alternate" hreflang="x-default" href="https://bullshit.wtf/">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="בולשיט">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="https://bullshit.wtf/he">
  <meta property="og:image" content="${image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="בולשיט: עבדו על החברים עם תשובות מזויפות לעובדות מוזרות ואמיתיות">
  <meta property="og:locale" content="he_IL">
  <meta property="og:locale:alternate" content="en_US">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${image}">
  <meta itemprop="name" content="בולשיט">
  <meta itemprop="description" content="${description}">
  <meta itemprop="image" content="${image}">
  `;

const block = /<!-- BS:META:START -->[\s\S]*?<!-- BS:META:END -->/;
if (!block.test(html)) {
    throw new Error('build-he: BS:META markers not found in dist/index.html');
}

const out = html
    .replace(block, `<!-- BS:META:START -->${hebrewMeta}<!-- BS:META:END -->`)
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);

fs.writeFileSync(path.join(dist, 'he.html'), out);
console.log('build-he: wrote dist/he.html');
