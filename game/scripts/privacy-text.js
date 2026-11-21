// The words of the privacy page (/privacy, /he/privacy), written by build-privacy.js. Every line
// says what the code does today; change it with the code it describes:
//   join:     functions/src/controllers/analytics.ts onJoinGame (users: ip, useragent, nickname, pin, via)
//   visits:   functions/src/controllers/visit.ts (no IP, no uid, no nickname)
//   games:    the Realtime Database, games/<PIN>; old-games.ts moves players' parts out of reach, erases nothing
//   crews:    functions/src/controllers/crew.ts; daily group rounds: daily-store.ts eraseOldRounds (nine days)
//   errors:   game/src/app/sentry; fonts and icons: game/src/index.html
//   portal:   game/src/app/portal (CrazyGames username and language)
// No contact address: the site shows none, so questions go to the public repository's issues.

const ISSUES = 'https://github.com/radotzki/bullshit-wtf/issues';

const en = {
    lang: 'en',
    dir: 'ltr',
    path: '/privacy',
    title: 'Privacy',
    pageTitle: 'Privacy · Bullshit',
    other: { href: '/he/privacy', label: 'בעברית' },
    updated: 'Last updated 21 November 2026',
    intro: 'Bullshit is a party trivia game you play on your phone or computer. This page says what the game keeps, and why.',
    sections: [
        {
            h: 'No account',
            p: ['You don\'t sign up. The game gives your browser a random id (an anonymous sign-in with Google Firebase), so it knows '
                + 'which player in a game is you. It never asks for your email, phone number or real name.'],
        },
        {
            h: 'What a game keeps',
            list: [
                'The nickname you type (on CrazyGames, your CrazyGames username), the answers and fake answers you write, your picks '
                + 'and your score. The other players in the game see them. A few hours after the game, they are moved out of '
                + 'other players\' reach and kept on our server.',
                'When you join a game: your IP address, your browser\'s description (its user agent), your nickname, the game\'s code, '
                + 'and how you came to it (a link, the code, a QR code).',
                'If your group saves a crew: its name, and its players\' nicknames and scores.',
                'In a group round of the daily puzzle: the first names and fake answers sent. They are erased nine days after the '
                + 'puzzle\'s day.',
            ],
        },
        {
            h: 'What a visit keeps',
            p: ['For each page you open: the page, its language, the kind of device and browser, the site that sent you, the tag on '
                + 'the link, and how long the page took to load. No IP address and no name.'],
        },
        {
            h: 'Errors',
            p: ['When something breaks, a report goes to Sentry, the service we use to find bugs: what went wrong, on which page, in '
                + 'which browser.'],
        },
        {
            h: 'On your device',
            p: ['Your browser keeps a few things so the game remembers you: your nickname, your language, your recent games and '
                + 'crews, your best solo score. They stay on your device. Clearing your browser\'s data for this site removes them.'],
        },
        {
            h: 'Other services',
            p: ['What the game keeps is stored with Google (Firebase and BigQuery). The game\'s fonts come from Google Fonts and its '
                + 'icons from BootstrapCDN; like any web server, they see your IP address when your browser fetches them. '
                + 'The game shows no ads of its own.'],
        },
        {
            h: 'Why',
            p: ['To run the game, to keep rude names and lies out of it, to count how many people play and what they enjoy, and to '
                + 'fix what breaks.'],
        },
        {
            h: 'How long',
            p: ['Apart from the daily puzzle\'s group rounds, there is no set time after which what the game keeps is erased.'],
        },
        {
            h: 'On CrazyGames',
            p: ['CrazyGames runs its own site, and its own privacy policy covers what it keeps. From CrazyGames, the game gets your '
                + 'username and your language.'],
        },
        {
            h: 'Questions',
            p: ['Ask on the game\'s GitHub page. What you write there is public.'],
            link: { href: ISSUES, label: 'github.com/radotzki/bullshit-wtf/issues' },
        },
    ],
};

const he = {
    lang: 'he',
    dir: 'rtl',
    path: '/he/privacy',
    title: 'פרטיות',
    pageTitle: 'פרטיות · בולשיט',
    other: { href: '/privacy', label: 'In English' },
    updated: 'עודכן ב-21 בנובמבר 2026',
    intro: 'בולשיט הוא משחק טריוויה למסיבות שמשחקים מהטלפון או מהמחשב. בעמוד הזה כתוב מה המשחק שומר, ולמה.',
    sections: [
        {
            h: 'בלי חשבון',
            p: ['לא נרשמים. המשחק נותן לדפדפן שלכם מזהה אקראי (כניסה אנונימית דרך Google Firebase), כדי לדעת מי מהשחקנים במשחק '
                + 'הוא אתם. הוא אף פעם לא מבקש אימייל, מספר טלפון או שם אמיתי.'],
        },
        {
            h: 'מה משחק שומר',
            list: [
                'הכינוי שאתם מקלידים (ב-CrazyGames, שם המשתמש שלכם שם), התשובות והתשובות המומצאות שאתם כותבים, הבחירות שלכם '
                + 'והניקוד. שאר השחקנים במשחק רואים אותם. כמה שעות אחרי המשחק הם מועברים למקום ששחקנים אחרים לא מגיעים אליו, '
                + 'ונשמרים אצלנו בשרת.',
                'כשמצטרפים למשחק: כתובת ה-IP, תיאור הדפדפן (ה-user agent), הכינוי, קוד המשחק, ואיך הגעתם אליו (קישור, הקוד, '
                + 'קוד QR).',
                'אם הקבוצה שלכם שומרת חבורה: השם שלה, והכינויים והניקוד של השחקנים בה.',
                'בסבב קבוצתי של החידה היומית: השמות הפרטיים והתשובות המומצאות שנשלחו. הם נמחקים תשעה ימים אחרי היום של החידה.',
            ],
        },
        {
            h: 'מה ביקור שומר',
            p: ['על כל עמוד שפותחים: העמוד, השפה שלו, סוג המכשיר והדפדפן, האתר ששלח אתכם, התג שעל הקישור, וכמה זמן העמוד נטען. '
                + 'בלי כתובת IP ובלי שם.'],
        },
        {
            h: 'תקלות',
            p: ['כשמשהו נשבר, נשלח דיווח ל-Sentry, השירות שבו אנחנו מוצאים באגים: מה השתבש, באיזה עמוד, באיזה דפדפן.'],
        },
        {
            h: 'במכשיר שלכם',
            p: ['הדפדפן שומר כמה דברים כדי שהמשחק יזכור אתכם: הכינוי, השפה, המשחקים והחבורות האחרונים שלכם, השיא שלכם במשחק לבד. הם נשארים '
                + 'במכשיר. מחיקת נתוני האתר בדפדפן מוחקת אותם.'],
        },
        {
            h: 'שירותים אחרים',
            p: ['מה שהמשחק שומר נשמר אצל Google (Firebase ו-BigQuery). הגופנים של המשחק מגיעים מ-Google Fonts והסמלים '
                + 'מ-BootstrapCDN; כמו כל שרת אינטרנט, הם רואים את כתובת ה-IP שלכם כשהדפדפן מוריד אותם. במשחק עצמו אין פרסומות.'],
        },
        {
            h: 'למה',
            p: ['כדי להפעיל את המשחק, כדי להרחיק ממנו שמות ושקרים גסים, כדי לספור כמה אנשים משחקים ומה הם אוהבים, וכדי לתקן '
                + 'את מה שנשבר.'],
        },
        {
            h: 'לכמה זמן',
            p: ['חוץ מהסבבים הקבוצתיים של החידה היומית, אין זמן קבוע שאחריו נמחק מה שהמשחק שומר.'],
        },
        {
            h: 'ב-CrazyGames',
            p: ['ל-CrazyGames יש אתר משלה, ומדיניות הפרטיות שלה חלה על מה שהיא שומרת. מ-CrazyGames המשחק מקבל את שם המשתמש '
                + 'ואת השפה שלכם.'],
        },
        {
            h: 'שאלות',
            p: ['אפשר לשאול בעמוד ה-GitHub של המשחק. מה שכותבים שם גלוי לכולם.'],
            link: { href: ISSUES, label: 'github.com/radotzki/bullshit-wtf/issues' },
        },
    ],
};

module.exports = { PRIVACY: { en, he }, ISSUES };
