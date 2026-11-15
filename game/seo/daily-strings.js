// Every word of the daily puzzle (/daily and /he/daily), in both languages. The page is plain HTML
// built by daily-page.js; the words of its language are written into it as data, and the page's
// script fills the {gaps}. Tested in test/daily-strings.test.js.
//
// Hebrew follows the game's rule: plural for an instruction, and forms that read for any gender
// ("מצאת", "נפלת"). The messages people send never name an answer.
//
// {noTag} is " #12" (with its leading space), or nothing before the puzzle's first day.
'use strict';

const en = {
    lang: 'en',
    dir: 'ltr',
    logo: 'Bullshit',
    home: '/',
    path: '/daily',
    other: 'בעברית',
    // The link preview: fixed per language, so it never spoils a day.
    title: 'Today\'s Bullshit: one truth, three lies',
    description: 'One strange fact a day. Spot the true answer among the lies, then fool your friends. Free, no sign-up.',
    image: '/assets/og-daily-en.png',
    noscript: 'Today\'s question needs JavaScript. Switch it on and reload the page.',

    kicker: 'TODAY\'S BULLSHIT{dot}',
    kickerDot: ' · #{no}',
    kickerCandle: 'CANDLE {candle} · TODAY\'S BULLSHIT{noTag}',
    candles: ['1', '2', '3', '4', '5', '6', '7', '8'],
    instruction: 'One answer is true. The rest are lies. Spot the truth.',
    foot: 'A new one every day. No sign-up.',
    loading: 'Loading today\'s question…',
    friendNamed: '{name} wrote one of these answers to fool you.',
    friendUnnamed: 'A friend wrote one of these answers to fool you.',

    headTruth: 'YOU SPOTTED THE TRUTH',
    headLie: 'BULLSHIT! YOU FELL FOR A LIE',
    headFriendNamed: '{name} FOOLED YOU',
    headFriendUnnamed: 'YOUR FRIEND FOOLED YOU',
    friendMissedNamed: '{name}\'s lie was "{lie}". Not this time.',
    friendMissedUnnamed: 'Your friend\'s lie was "{lie}". Not this time.',
    truthLine: 'The truth: {answer}',
    labelTruth: 'THE TRUTH',
    labelLie: 'A LIE',
    labelPick: 'YOUR PICK',
    labelFriendNamed: '{name}\'S LIE',
    labelFriendUnnamed: 'YOUR FRIEND\'S LIE',
    numbers: '{p}% of {n} players fell for a lie today',
    tooFew: 'You\'re among the first today. The numbers show up as more people play.',
    source: 'Really? Here\'s the source',

    send: 'SEND TO YOUR GROUP',
    share: 'SHARE',
    copy: 'COPY',
    copied: 'Copied',

    foolTitle: 'Now fool your friends',
    foolText: 'Write a lie for today\'s question. We\'ll hide it among the answers and tell you how many friends fell for it.',
    foolLie: 'Your lie',
    foolName: 'Your name (optional)',
    foolSend: 'SEND MY LIE',
    lieIsTruth: 'That\'s the truth. You have to lie!',
    lieIsTaken: 'That answer is already there. Try another.',
    lieRefused: 'Try other words.',
    count: 'Your lie "{lie}" fooled {x} of {y} friends so far.',
    countNone: 'Nobody has opened your lie yet.',

    gameTitle: 'This is half the game',
    gameText: 'With friends in one room, everyone writes a lie, and you score each time someone falls for yours.',
    gameStart: 'START A GAME WITH FRIENDS',
    gameStartHanukkah: 'START A HANUKKAH GAME',
    gameHint: 'Free. 2 to {max} players, each on their own phone.',

    countdown: 'Next question in {t}',
    newQuestion: 'NEW QUESTION',
    yesterday: 'Yesterday: {s}.',
    yesterdayPct: '{p}% fell for a lie.',
    played: 'You\'ve played today\'s.',
    otherDay: 'That one was from another day. Here\'s today\'s.',
    loadError: 'Today\'s question didn\'t load.',
    tryAgain: 'TRY AGAIN',

    // The messages. The question is in them, an answer never is.
    shareTruth: 'Bullshit{noTag} ✅ I spotted the truth.',
    shareTruthPct: ' {p}% fell for a lie.',
    shareTruthAsk: 'Can you spot it?',
    shareLie: 'Bullshit{noTag} 🤥 I fell for a lie.',
    shareLiePct: ' So did {p}%.',
    shareLieAsk: 'Can you spot the truth?',
    shareFool: 'Bullshit{noTag}: I hid a lie in today\'s question. Bet you fall for it.',

    // Where the rest of the site points here.
    seoLink: 'Try today\'s question',
};

const he = {
    lang: 'he',
    dir: 'rtl',
    logo: 'בולשיט',
    home: '/he',
    path: '/he/daily',
    other: 'English',
    title: 'הבולשיט היומי: אמת אחת, שלושה שקרים',
    description: 'כל יום עובדה מוזרה אחת. מצאו את התשובה הנכונה בין השקרים, ואז תעבדו על החברים. בחינם, בלי הרשמה.',
    image: '/assets/og-daily-he.png',
    noscript: 'השאלה של היום צריכה JavaScript. הפעילו אותו וטענו את העמוד מחדש.',

    kicker: 'הבולשיט היומי{dot}',
    kickerDot: ' · #{no}',
    kickerCandle: 'נר {candle} · הבולשיט היומי{noTag}',
    candles: ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שביעי', 'שמיני'],
    instruction: 'רק תשובה אחת נכונה. כל השאר שקרים. מצאו את האמת.',
    foot: 'כל יום שאלה חדשה. בלי הרשמה.',
    loading: 'השאלה של היום נטענת…',
    friendNamed: 'אחת מהתשובות היא שקר של {name}. לא ליפול.',
    friendUnnamed: 'אחת מהתשובות היא שקר של מי ששלח לך את הקישור. לא ליפול.',

    headTruth: 'מצאת את האמת',
    headLie: 'בולשיט! נפלת בשקר',
    headFriendNamed: 'נפלת בשקר של {name}',
    headFriendUnnamed: 'נפלת בשקר של החבר ששלח',
    friendMissedNamed: 'השקר של {name} היה "{lie}". הפעם זה לא עבד.',
    friendMissedUnnamed: 'השקר של החבר ששלח היה "{lie}". הפעם זה לא עבד.',
    truthLine: 'האמת: {answer}',
    labelTruth: 'האמת',
    labelLie: 'שקר',
    labelPick: 'הבחירה שלך',
    labelFriendNamed: 'השקר של {name}',
    labelFriendUnnamed: 'השקר של החבר ששלח',
    numbers: '{p}% מתוך {n} שחקנים נפלו היום בשקר',
    tooFew: 'אתם מהראשונים היום. המספרים יופיעו כשעוד אנשים ישחקו.',
    source: 'באמת? הנה המקור',

    send: 'שלחו לקבוצה',
    share: 'שיתוף',
    copy: 'העתקה',
    copied: 'הועתק',

    foolTitle: 'עכשיו תעבדו על החברים',
    foolText: 'כתבו שקר לשאלה של היום. נחביא אותו בין התשובות ונספר לכם כמה חברים נפלו בו.',
    foolLie: 'השקר שלכם',
    foolName: 'השם שלכם (לא חובה)',
    foolSend: 'שלחו את השקר שלי',
    lieIsTruth: 'זאת האמת. צריך לשקר!',
    lieIsTaken: 'התשובה הזאת כבר מופיעה. נסו אחרת.',
    lieRefused: 'נסו מילים אחרות.',
    count: 'השקר שלך "{lie}" עבד על {x} מתוך {y} חברים עד עכשיו.',
    countNone: 'אף אחד עוד לא פתח את השקר שלך.',

    gameTitle: 'זה רק חצי מהמשחק',
    gameText: 'כשיושבים יחד, כל אחד כותב שקר ומקבלים נקודות על כל מי שנופל בו.',
    gameStart: 'פותחים משחק עם חברים',
    gameStartHanukkah: 'פותחים משחק חנוכה',
    gameHint: 'בחינם. 2 עד {max} שחקנים, כל אחד בטלפון שלו.',

    countdown: 'השאלה הבאה בעוד {t}',
    newQuestion: 'שאלה חדשה',
    yesterday: 'אתמול: {s}.',
    yesterdayPct: '{p}% נפלו בשקר.',
    played: 'כבר שיחקת היום.',
    otherDay: 'הקישור היה של יום אחר. הנה השאלה של היום.',
    loadError: 'השאלה של היום לא נטענה.',
    tryAgain: 'נסו שוב',

    shareTruth: 'בולשיט{noTag} ✅ מצאתי את האמת.',
    shareTruthPct: ' {p}% נפלו בשקר.',
    shareTruthAsk: 'תצליחו למצוא?',
    shareLie: 'בולשיט{noTag} 🤥 נפלתי בשקר.',
    shareLiePct: ' כמו {p}% מהשחקנים.',
    shareLieAsk: 'תצליחו למצוא את האמת?',
    shareFool: 'בולשיט{noTag}: החבאתי שקר בשאלה של היום. בטוח תיפלו בו.',

    seoLink: 'נסו את השאלה של היום',
};

module.exports = { en, he };
