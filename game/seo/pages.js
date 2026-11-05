// Plain HTML pages that search engines can read without running JavaScript.
// Each English page has a Hebrew twin (`twin`), linked with hreflang.
// Facts here must match the game: free, in the browser, up to 8 players,
// 5, 7 or 9 questions, three rounds where points grow, English and Hebrew questions.

const en = {
    lang: 'en',
    dir: 'ltr',
    start: { href: '/create-game', label: 'Start a game' },
    join: { href: '/join-game', label: 'Join with a PIN' },
    nav: [
        { href: '/how-to-play', label: 'How to play' },
        { href: '/party-games-on-your-phone', label: 'Party games on your phone' },
        { href: '/hanukkah-party-game', label: 'Hanukkah party game' },
        { href: '/purim-party-game', label: 'Purim party game' },
    ],
    other: 'בעברית',
    footer: 'Bullshit is a free party game for phones. No app, no sign-up, no ads in the game.',
};

const he = {
    lang: 'he',
    dir: 'rtl',
    start: { href: '/create-game', label: 'פותחים משחק' },
    join: { href: '/join-game', label: 'מצטרפים עם קוד' },
    nav: [
        { href: '/he/how-to-play', label: 'איך משחקים' },
        { href: '/he/party-game-phone', label: 'משחק חברה בטלפון' },
        { href: '/he/hanukkah', label: 'משחק לחנוכה' },
        { href: '/he/purim', label: 'משחק לפורים' },
    ],
    other: 'English',
    footer: 'בולשיט הוא משחק חברה חינמי בטלפון. בלי אפליקציה, בלי הרשמה, בלי פרסומות במשחק.',
};

const howEn = `
<p>Bullshit is a trivia game where the best liar wins. Everyone plays on their own phone, in the same room, in the browser. There is nothing to install.</p>
<h2>The game in one minute</h2>
<ol>
  <li><strong>A strange true fact appears, with a blank.</strong> For example: "In 1932 the Australian army lost a war against ____."</li>
  <li><strong>Everyone writes a lie</strong> that sounds true enough to fool the others. If you type the real answer by accident, the game tells you to try another.</li>
  <li><strong>All the answers appear together</strong>: every player's lie, a few lies from the house, and the truth.</li>
  <li><strong>Everyone picks the answer they believe.</strong> Find the truth and you score. Every friend who picks your lie scores for you too. Fall for one of the house lies and you lose points.</li>
  <li><strong>The truth is revealed</strong>, with its source, and you see who fooled whom.</li>
</ol>
<h2>Rounds and points</h2>
<p>A game has 5, 7 or 9 questions over three rounds, and points grow each round, so nobody is out of it until the end.</p>
<table>
  <tr><th>Round</th><th>Find the truth</th><th>Each friend you fool</th><th>Fall for a house lie</th></tr>
  <tr><td>1</td><td>+1000</td><td>+500</td><td>-500</td></tr>
  <tr><td>2</td><td>+1500</td><td>+750</td><td>-750</td></tr>
  <tr><td>3</td><td>+2000</td><td>+1000</td><td>-1000</td></tr>
</table>
<h2>How to start</h2>
<ol>
  <li>One person opens bullshit.wtf and taps <a href="/create-game">create a game</a>, picks English or Hebrew and the number of questions.</li>
  <li>The game shows a four-letter PIN. Everyone else opens bullshit.wtf on their phone, taps <a href="/join-game">join</a> and types it. Up to 8 players.</li>
  <li>For a bigger group, put the game on a TV or laptop with <a href="/present-game">present</a>: the screen shows the questions and the scores, and phones are for writing and picking.</li>
</ol>
<h2>Tips for a good lie</h2>
<ul>
  <li>Match the style of the question: a number for a number, a name for a name.</li>
  <li>Boring lies work better than funny ones. The truth is usually the strangest answer.</li>
  <li>Watch who falls for what, and use it next round.</li>
</ul>`;

const howHe = `
<p>בולשיט הוא משחק טריוויה שבו השקרן הכי טוב מנצח. כל אחד משחק מהטלפון שלו, באותו חדר, בדפדפן. אין מה להתקין.</p>
<h2>המשחק בדקה</h2>
<ol>
  <li><strong>מופיעה עובדה אמיתית ומוזרה, עם חלק חסר.</strong> למשל: "ב-1932 הצבא האוסטרלי הפסיד במלחמה נגד ____."</li>
  <li><strong>כל אחד ממציא תשובה</strong> שנשמעת אמיתית מספיק כדי לעבוד על האחרים. מי שכותב בטעות את התשובה הנכונה מתבקש לנסות משהו אחר.</li>
  <li><strong>כל התשובות מופיעות יחד</strong>: השקרים של כל השחקנים, כמה שקרים של הבית, והאמת.</li>
  <li><strong>כל אחד בוחר את התשובה שהוא מאמין לה.</strong> מצאתם את האמת? קיבלתם נקודות. כל חבר שבחר בשקר שלכם מביא לכם נקודות. נפלתם בשקר של הבית? מפסידים נקודות.</li>
  <li><strong>האמת נחשפת</strong>, עם המקור, ורואים מי עבד על מי.</li>
</ol>
<h2>סבבים ונקודות</h2>
<p>במשחק יש 5, 7 או 9 שאלות בשלושה סבבים, והנקודות גדלות בכל סבב, כך שאף אחד לא בחוץ עד הסוף.</p>
<table>
  <tr><th>סבב</th><th>מצאתם את האמת</th><th>על כל חבר שעבדתם עליו</th><th>נפלתם בשקר של הבית</th></tr>
  <tr><td>1</td><td><bdi dir="ltr">+1000</bdi></td><td><bdi dir="ltr">+500</bdi></td><td><bdi dir="ltr">-500</bdi></td></tr>
  <tr><td>2</td><td><bdi dir="ltr">+1500</bdi></td><td><bdi dir="ltr">+750</bdi></td><td><bdi dir="ltr">-750</bdi></td></tr>
  <tr><td>3</td><td><bdi dir="ltr">+2000</bdi></td><td><bdi dir="ltr">+1000</bdi></td><td><bdi dir="ltr">-1000</bdi></td></tr>
</table>
<h2>איך מתחילים</h2>
<ol>
  <li>מישהו אחד נכנס ל-<bdi dir="ltr">bullshit.wtf</bdi>, לוחץ על <a href="/create-game">פתיחת משחק</a>, ובוחר עברית או אנגלית ומספר שאלות.</li>
  <li>המשחק מציג קוד של ארבע אותיות. כל השאר נכנסים ל-<bdi dir="ltr">bullshit.wtf</bdi> בטלפון, לוחצים <a href="/join-game">הצטרפות</a> ומקלידים אותו. עד 8 שחקנים.</li>
  <li>לקבוצה גדולה, אפשר להציג את המשחק על טלוויזיה או מחשב עם <a href="/present-game">מצב הצגה</a>: המסך מראה את השאלות והניקוד, והטלפונים משמשים לכתיבה ולבחירה.</li>
</ol>
<h2>טיפים לשקר טוב</h2>
<ul>
  <li>תתאימו את עצמכם לשאלה: מספר לשאלה על מספר, שם לשאלה על שם.</li>
  <li>שקרים משעממים עובדים יותר טוב ממצחיקים. האמת היא בדרך כלל התשובה הכי מוזרה.</li>
  <li>שימו לב מי נופל במה, ותשתמשו בזה בסבב הבא.</li>
</ul>`;

module.exports = [
    {
        path: '/how-to-play', twin: '/he/how-to-play', site: en,
        title: 'How to play Bullshit, the free bluffing trivia game for phones',
        description: 'The rules of Bullshit: write a lie that fools your friends, then find the truth among everyone\'s answers. Free, in the browser, up to 8 players.',
        h1: 'How to play Bullshit',
        body: howEn,
    },
    {
        path: '/he/how-to-play', twin: '/how-to-play', site: he,
        title: 'איך משחקים בולשיט, משחק הבלוף והטריוויה החינמי בטלפון',
        description: 'החוקים של בולשיט: ממציאים תשובה שתעבוד על החברים, ואז מחפשים את האמת בין כל התשובות. חינם, בדפדפן, עד 8 שחקנים.',
        h1: 'איך משחקים בולשיט',
        body: howHe,
    },
    {
        path: '/party-games-on-your-phone', twin: '/he/party-game-phone', site: en,
        title: 'A free party game on your phones: Bullshit, the bluffing trivia game',
        description: 'Looking for a party game everyone can play on their own phone, in the same room, with no download? Bullshit is free and starts in under a minute.',
        h1: 'A party game everyone plays on their own phone',
        body: `
<p>Most party games need a box, a deck, or one person reading cards aloud. Bullshit needs only the phones already in everyone's pocket. One person starts a game, the others type a four-letter PIN, and you are playing.</p>
<h2>Why groups like it</h2>
<ul>
  <li><strong>No download, no sign-up.</strong> It runs in the phone's browser. Nobody has to install an app or make an account.</li>
  <li><strong>Free.</strong> No paid packs, no ads in the game.</li>
  <li><strong>Up to 8 players</strong> on phones, plus an optional big screen (a TV or laptop) that shows the questions and scores.</li>
  <li><strong>Short games.</strong> 5, 7 or 9 questions, so it fits before dinner, after dinner or between other games.</li>
  <li><strong>You don't need to know trivia.</strong> Nobody knows these facts. The game is about lying well and reading your friends.</li>
  <li><strong>English and Hebrew questions.</strong></li>
</ul>
<h2>Good for</h2>
<p>Family evenings and holiday dinners, friends' game nights, office parties and team events, youth groups, and English classes, where writing a believable wrong answer is good practice.</p>
<p>New here? Read <a href="/how-to-play">how to play</a>, or just start: the rules explain themselves after one question.</p>`,
    },
    {
        path: '/he/party-game-phone', twin: '/party-games-on-your-phone', site: he,
        title: 'משחק חברה חינמי בטלפון: בולשיט, משחק הבלוף והטריוויה',
        description: 'מחפשים משחק חברה שכל אחד משחק מהטלפון שלו, באותו חדר, בלי להוריד כלום? בולשיט חינמי ומתחיל בפחות מדקה.',
        h1: 'משחק חברה שכל אחד משחק מהטלפון שלו',
        body: `
<p>רוב משחקי החברה צריכים קופסה, חפיסת קלפים או מישהו שמקריא. בולשיט צריך רק את הטלפונים שכבר בכיס. מישהו אחד פותח משחק, השאר מקלידים קוד של ארבע אותיות, ומשחקים.</p>
<h2>למה חבר'ה אוהבים אותו</h2>
<ul>
  <li><strong>בלי הורדה ובלי הרשמה.</strong> הוא עובד בדפדפן של הטלפון. אף אחד לא צריך להתקין אפליקציה או לפתוח חשבון.</li>
  <li><strong>חינם.</strong> בלי חבילות בתשלום ובלי פרסומות במשחק.</li>
  <li><strong>עד 8 שחקנים</strong> בטלפונים, ואפשר להוסיף מסך גדול (טלוויזיה או מחשב) שמציג את השאלות והניקוד.</li>
  <li><strong>משחקים קצרים.</strong> 5, 7 או 9 שאלות, כך שזה נכנס לפני ארוחת הערב, אחריה או בין משחקים.</li>
  <li><strong>לא צריך לדעת טריוויה.</strong> אף אחד לא מכיר את העובדות האלה. המשחק הוא על לשקר טוב ולקרוא את החברים.</li>
  <li><strong>שאלות בעברית ובאנגלית.</strong></li>
</ul>
<h2>מתאים ל</h2>
<p>ערבי משפחה וארוחות חג, ערב חברים, מסיבות וימי גיבוש בעבודה, תנועות נוער ושיעורי אנגלית.</p>
<p>פעם ראשונה? קראו <a href="/he/how-to-play">איך משחקים</a>, או פשוט תתחילו: החוקים מובנים אחרי שאלה אחת.</p>`,
    },
    {
        path: '/hanukkah-party-game', twin: '/he/hanukkah', site: en,
        title: 'A Hanukkah party game for the whole family, free on your phones',
        description: 'Eight nights, one family, a lot of latkes. Bullshit is a free bluffing trivia game everyone plays on their own phone after candle lighting. No download.',
        h1: 'A Hanukkah game for after the candles',
        body: `
<p>Hanukkah has eight nights and most of them end with the family around a table. Bullshit gives that table a game: everyone on their own phone, the grandparents included, and nothing to set up or clean away.</p>
<h2>How it works</h2>
<p>A strange true fact appears with a blank. Everyone writes a lie to fill it, then everyone tries to spot the truth among all the answers. You score for finding the truth and for every relative who falls for your lie. A game of 5 questions takes about ten minutes.</p>
<h2>Why it fits Hanukkah</h2>
<ul>
  <li><strong>Ages from about 10 up</strong> can play together: you need to write a short answer, not know facts.</li>
  <li><strong>Up to 8 phones</strong>, and a TV or laptop can show the game to the whole room.</li>
  <li><strong>Free, no app.</strong> Cousins who arrive late join with the PIN in seconds.</li>
  <li><strong>Eight nights, new questions.</strong> Play again with Replay and the same group stays together.</li>
</ul>
<p>Read <a href="/how-to-play">how to play</a>, or start a game now.</p>`,
    },
    {
        path: '/he/hanukkah', twin: '/hanukkah-party-game', site: he,
        title: 'משחק לחנוכה לכל המשפחה, חינם בטלפון',
        description: 'שמונה לילות, משפחה אחת והרבה סופגניות. בולשיט הוא משחק בלוף וטריוויה חינמי שכל אחד משחק מהטלפון שלו אחרי הדלקת הנרות. בלי הורדה.',
        h1: 'משחק לחנוכה, לאחרי הדלקת הנרות',
        body: `
<p>בחנוכה יש שמונה לילות, ורובם נגמרים עם המשפחה סביב השולחן. בולשיט נותן לשולחן הזה משחק: כל אחד מהטלפון שלו, גם סבא וסבתא, ובלי שום דבר לסדר או לאסוף אחר כך.</p>
<h2>איך זה עובד</h2>
<p>מופיעה עובדה אמיתית ומוזרה עם חלק חסר. כל אחד ממציא תשובה, ואז כולם מנסים לזהות את האמת בין כל התשובות. מקבלים נקודות על מציאת האמת ועל כל קרוב משפחה שנפל בשקר שלכם. משחק של 5 שאלות לוקח בערך עשר דקות.</p>
<h2>למה זה מתאים לחנוכה</h2>
<ul>
  <li><strong>מגיל 10 בערך</strong> משחקים יחד: צריך לכתוב תשובה קצרה, לא לדעת עובדות.</li>
  <li><strong>עד 8 טלפונים</strong>, וטלוויזיה או מחשב יכולים להציג את המשחק לכל החדר.</li>
  <li><strong>חינם, בלי אפליקציה.</strong> בני דודים שמגיעים באיחור מצטרפים עם הקוד תוך שניות.</li>
  <li><strong>שמונה לילות, שאלות חדשות.</strong> בסוף משחק לוחצים שוב, ואותה חבורה ממשיכה למשחק חדש.</li>
</ul>
<p>קראו <a href="/he/how-to-play">איך משחקים</a>, או פתחו משחק עכשיו.</p>`,
    },
    {
        path: '/purim-party-game', twin: '/he/purim', site: en,
        title: 'A Purim party game: free bluffing trivia on your phones',
        description: 'On the holiday of masks, the best liar wins. Bullshit is a free party game for phones where you fool your friends with fake answers. No download.',
        h1: 'A Purim game where the best liar wins',
        body: `
<p>Purim is the one day a year when hiding who you are is the point. Bullshit is a game about exactly that: everyone writes a lie, dresses it up as the truth, and tries to fool the room.</p>
<h2>How it works</h2>
<p>A strange true fact appears with a blank. Everyone writes a believable fake answer, then everyone picks what they think is the truth. Fool a friend and you score; find the truth and you score more. Fall for one of the house lies and you lose points.</p>
<h2>Good for Purim parties</h2>
<ul>
  <li><strong>Free and in the browser.</strong> No app, so a whole party can join with one PIN.</li>
  <li><strong>Up to 8 players</strong> per game, with an optional big screen for everyone else to watch and shout.</li>
  <li><strong>Youth groups and classes</strong>: short games of 5, 7 or 9 questions, in English or Hebrew.</li>
</ul>
<p>Read <a href="/how-to-play">how to play</a>, or start a game now.</p>`,
    },
    {
        path: '/he/purim', twin: '/purim-party-game', site: he,
        title: 'משחק לפורים: בלוף וטריוויה בטלפון, בחינם',
        description: 'בחג התחפושות, השקרן הכי טוב מנצח. בולשיט הוא משחק חברה חינמי בטלפון שבו עובדים על החברים עם תשובות מומצאות. בלי הורדה.',
        h1: 'משחק לפורים שבו השקרן הכי טוב מנצח',
        body: `
<p>פורים הוא היום היחיד בשנה שבו להסתתר מאחורי תחפושת זה כל העניין. בולשיט הוא משחק בדיוק על זה: כל אחד ממציא שקר, מלביש אותו כאמת, ומנסה לעבוד על כולם.</p>
<h2>איך זה עובד</h2>
<p>מופיעה עובדה אמיתית ומוזרה עם חלק חסר. כל אחד כותב תשובה מומצאת ומשכנעת, ואז כולם בוחרים מה לדעתם האמת. עבדתם על חבר? קיבלתם נקודות. מצאתם את האמת? קיבלתם יותר. נפלתם בשקר של הבית? מפסידים נקודות.</p>
<h2>מתאים למסיבות פורים</h2>
<ul>
  <li><strong>חינם ובדפדפן.</strong> בלי אפליקציה, כך שכל המסיבה מצטרפת עם קוד אחד.</li>
  <li><strong>עד 8 שחקנים</strong> בכל משחק, ואפשר מסך גדול שכל השאר יצפו בו ויצעקו.</li>
  <li><strong>תנועות נוער וכיתות</strong>: משחקים קצרים של 5, 7 או 9 שאלות, בעברית או באנגלית.</li>
</ul>
<p>קראו <a href="/he/how-to-play">איך משחקים</a>, או פתחו משחק עכשיו.</p>`,
    },
];
