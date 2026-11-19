// The words of the daily puzzle's embed (/embed/daily, /he/embed/daily: the small page another site
// puts in an iframe) and of the page that hands out its line of code (/daily-on-your-site,
// /he/daily-on-your-site), in both languages. The embed also uses the puzzle's own words
// (daily-strings.js) for the question, the reveal and the numbers, so both read the same.
// Tested in test/embed.test.js.
//
// Hebrew follows the game's rule: plural for an instruction, and forms that read for any gender.
'use strict';

const en = {
    lang: 'en',
    dir: 'ltr',
    // The embed itself.
    embedPath: '/embed/daily',
    play: 'PLAY THIS WITH FRIENDS',
    playHanukkah: 'PLAY A HANUKKAH GAME WITH FRIENDS',
    playHint: 'Free on bullshit.wtf. Everyone writes a lie on their own phone, and scores when friends fall for it.',
    more: 'Send this one to friends',
    newTab: '(opens in a new tab)',

    // The page with the line to copy.
    path: '/daily-on-your-site',
    title: 'Put today\'s puzzle on your site | Bullshit',
    description: 'Add the daily Bullshit puzzle to your class page, youth group site or blog with one line of code. '
        + 'A new strange fact every day. Free, no sign-up, no cookies.',
    h1: 'Put today\'s puzzle on your site',
    lead: 'One strange fact a day, with the true answer hidden among lies. Your visitors pick, see the truth and how many '
        + 'people fell for a lie, and can start a game with friends. Free, no sign-up, nothing to install.',
    stepCopy: 'Copy this line into your page',
    copyLine: 'COPY THE LINE',
    copied: 'Copied',
    copyHelp: 'Paste it where your site takes HTML (an "embed", "HTML" or "code" block). Change the height if you need to.',
    previewTitle: 'What your visitors see',
    goodTitle: 'Good to know',
    good: [
        'Nothing runs in your page: it is one iframe, nothing more.',
        'No cookies on your site, no ads, no sign-up.',
        'It fits 300 to 420 pixels wide, on a phone too.',
        'A new question every day at midnight, Israel time.',
        'The game button opens bullshit.wtf in a new tab, so your page stays open.',
    ],
    otherLang: 'The puzzle in Hebrew',
    playToday: 'Play today\'s puzzle',
    // The link to this page from the daily puzzle and from the search pages' footer.
    link: 'Put today\'s puzzle on your site',
};

const he = {
    lang: 'he',
    dir: 'rtl',
    embedPath: '/he/embed/daily',
    play: 'משחקים את זה עם חברים',
    playHanukkah: 'משחקים משחק חנוכה עם חברים',
    playHint: 'בחינם ב-bullshit.wtf. כל אחד כותב שקר בטלפון שלו, ומקבל נקודות על כל מי שנופל בו.',
    more: 'שלחו את השאלה לחברים',
    newTab: '(נפתח בלשונית חדשה)',

    path: '/he/daily-on-your-site',
    title: 'השאלה היומית של בולשיט באתר שלכם',
    description: 'הוסיפו את השאלה היומית של בולשיט לאתר הכיתה, לאתר של תנועת הנוער או לבלוג, בשורת קוד אחת. '
        + 'כל יום עובדה מוזרה חדשה. בחינם, בלי הרשמה ובלי עוגיות.',
    h1: 'השאלה היומית באתר שלכם',
    lead: 'כל יום עובדה מוזרה אחת, והתשובה הנכונה מסתתרת בין שקרים. המבקרים באתר שלכם בוחרים, רואים את האמת '
        + 'וכמה אנשים נפלו בשקר, ויכולים לפתוח משחק עם חברים. בחינם, בלי הרשמה ובלי שום התקנה.',
    stepCopy: 'העתיקו את השורה הזאת לעמוד שלכם',
    copyLine: 'העתקת השורה',
    copied: 'הועתק',
    copyHelp: 'הדביקו אותה במקום שבו האתר שלכם מקבל HTML (רכיב "הטמעה", "HTML" או "קוד"). אפשר לשנות את הגובה לפי הצורך.',
    previewTitle: 'ככה זה ייראה אצלכם',
    goodTitle: 'כדאי לדעת',
    good: [
        'שום קוד לא רץ בעמוד שלכם: זו מסגרת (iframe) אחת, וזהו.',
        'בלי עוגיות באתר שלכם, בלי פרסומות ובלי הרשמה.',
        'מתאים לרוחב של 300 עד 420 פיקסלים, גם בטלפון.',
        'שאלה חדשה כל יום בחצות, שעון ישראל.',
        'כפתור המשחק פותח את bullshit.wtf בלשונית חדשה, והעמוד שלכם נשאר פתוח.',
    ],
    otherLang: 'השאלה באנגלית',
    playToday: 'לשאלה של היום',
    link: 'השאלה היומית באתר שלכם',
};

module.exports = { en, he };
