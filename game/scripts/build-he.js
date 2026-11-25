// Writes dist/he.html: the built index.html as a Hebrew page. firebase.json serves /he and the
// Hebrew app addresses (/he/join-game, /he/c/<id>) from it, so a Hebrew invite link
// (bullshit.wtf/he/join-game/ABCD) previews in Hebrew on WhatsApp and friends, and a search engine
// reads /he as what it is: a Hebrew page (lang and dir, title, description, the schema.org block and
// the text under the app, between the BS:ABOUT markers, and the loading card, between BS:LOAD).
// Run after `ng build` (see the "build" script in package.json).
const fs = require('fs');
const path = require('path');

// node scripts/build-he.js [outDir]
const dist = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist'));
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');

// The page's own title carries the words people add to the name when they search for it
// ("בולשיט משחק"); the link-preview title stays the short one.
const pageTitle = 'בולשיט: משחק מסיבות חינם בטלפון, לכל המשפחה';
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

const ld = {
    '@context': 'https://schema.org',
    '@type': 'VideoGame',
    name: 'בולשיט',
    alternateName: 'Bullshit',
    url: 'https://bullshit.wtf/he',
    description: 'משחק מסיבות חינמי בטלפון. כל אחד ממציא שקר שמשלים עובדה אמיתית ומוזרה, ואז כולם מחפשים את האמת בין כל התשובות.',
    genre: ['משחק מסיבות', 'טריוויה', 'בלוף'],
    gamePlatform: 'Web browser',
    playMode: 'MultiPlayer',
    numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 12 },
    inLanguage: ['he', 'en'],
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'ILS' },
};

// The text under the app, in Hebrew. Facts must match the game, as in seo/pages.js.
const about = `
  <main id="bs-about" class="bs-about" lang="he" dir="rtl">
    <h2>בולשיט: משחק מסיבות חינם בטלפון</h2>
    <p>כל אחד משחק מהטלפון שלו, באותו חדר, בדפדפן. מופיעה עובדה אמיתית ומוזרה עם חלק חסר, כל אחד ממציא שקר שישלים אותה,
      ואז כולם מחפשים את האמת בין כל התשובות. עבדתם על חבר? קיבלתם נקודות. מצאתם את האמת? גם. חינם, בלי הורדה ובלי הרשמה,
      עד 12 שחקנים, עם שאלות בעברית או באנגלית. מתאים לערב משפחתי, לארוחת שישי, לערב חברים, לכיתה ולגיבוש.</p>
    <h2>איך זה עובד</h2>
    <ol>
      <li><strong>מישהו אחד פותח משחק</strong> ומקבל קוד של ארבע אותיות.</li>
      <li><strong>כל השאר מצטרפים</strong> מהטלפון שלהם עם הקוד.</li>
      <li><strong>ממציאים שקר, ואז מחפשים את האמת.</strong> 5, 7 או 9 שאלות, והנקודות גדלות בכל סבב.</li>
    </ol>
    <p>לקבוצה גדולה, אפשר להציג את השאלות והניקוד על טלוויזיה או מחשב במצב הצגה.</p>
    <p>בחופש חנוכה, או בכל יום שכולם בבית: יש לנו <a href="/he/school-break">משחקים לחופש</a>, רעיונות ל<a href="/he/days-at-home">ימים ארוכים בבית עם הילדים</a>,
      ו<a href="/he/home-together">משחק קבוצתי לבית</a> לערב שכולם יחד בסלון.</p>
    <h2>עוד על המשחק</h2>
    <p class="bs-links"><a href="/he/how-to-play">איך משחקים</a> · <a href="/he/party-game-phone">משחק חברה בטלפון</a> ·
      <a href="/he/hanukkah">משחק לחנוכה</a> · <a href="/he/friday-dinner">משחק לארוחת שישי</a> ·
      <a href="/he/family-evening">משחק לערב משפחתי</a> · <a href="/he/friends-evening">משחק לערב חברים</a> ·
      <a href="/he/classroom">משחק לכיתה</a> · <a href="/he/team-building">משחק לגיבוש צוות</a> ·
      <a href="/he/game-like-jackbox">משחק כמו ג'קבוקס</a> · <a href="/he/youth-group">פעולה מוכנה לתנועת נוער</a> ·
      <a href="/he/hanukkah-activity">פעולה לחנוכה</a> ·
      <a href="/he/gibush">משחק לערב גיבוש</a> · <a href="/he/home-together">משחק קבוצתי לבית</a> ·
      <a href="/he/days-at-home">ימים בבית</a> · <a href="/he/video-call">משחק לשיחת וידאו</a> ·
      <a href="/he/school-break">משחקים לחופש</a> · <a href="/he/purim">משחק לפורים</a> ·
      <a href="/he/seder">משחק לליל הסדר</a> · <a href="/he/made-up-answers">משחק שממציאים בו תשובות</a> ·
      <a href="/he/bachelorette">משחק למסיבת רווקות</a> · <a href="/he/adult-birthday">משחק ליום הולדת למבוגרים</a> ·
      <a href="/he/friends-weekend">משחק לסופ"ש בצימר</a> ·
      <a href="/?lang=en" hreflang="en" lang="en">Bullshit in English</a></p>
    <p>מחפשים את משחק הקלפים? כאן מוסבר <a href="/he/bullshit-card-game">איך משחקים בולשיט בקלפים</a>.</p>
    <noscript><p>המשחק עצמו צריך JavaScript פעיל בדפדפן.</p></noscript>
  </main>
  `;

// Each part of index.html that becomes Hebrew, by its markers; a missing marker fails the build.
function swap(page, name, inner) {
    const block = new RegExp(`<!-- BS:${name}:START -->[\\s\\S]*?<!-- BS:${name}:END -->`);
    if (!block.test(page)) {
        throw new Error(`build-he: BS:${name} markers not found in dist/index.html`);
    }
    return page.replace(block, () => `<!-- BS:${name}:START -->${inner}<!-- BS:${name}:END -->`);
}

// The loading card inside <app-root>, shown until the app draws: in Hebrew, right to left.
const loading = '<div id="bs-load" role="status" lang="he" dir="rtl"><b>בולשיט</b><i></i><span>המשחק נטען…</span></div>';

let out = swap(html, 'META', hebrewMeta);
out = swap(out, 'LOAD', loading);
out = swap(out, 'LD', `\n  <script type="application/ld+json">${JSON.stringify(ld)}</script>\n  `);
out = swap(out, 'ABOUT', about);
// The build may add its own attributes to <html> (data-beasties-container): change only the language.
if (!/<html lang="en"[ >]/.test(out)) {
    throw new Error('build-he: <html lang="en"> not found in dist/index.html');
}
out = out
    .replace(/<html lang="en"([ >])/, '<html lang="he" dir="rtl"$1')
    .replace(/<title>[^<]*<\/title>/, () => `<title>${pageTitle}</title>`);

fs.writeFileSync(path.join(dist, 'he.html'), out);
console.log('build-he: wrote dist/he.html');
