// A page for people who search for a free Jackbox or Fibbage alternative, in English, with a Hebrew twin.
// People who already know the genre search by the name of the best-known game in it, never by ours.
//
// Keep it an honest comparison, and keep it useful to the searcher:
// - Jackbox Games and its products are named only to compare. No logo, no picture of their games, and no
//   word that suggests Bullshit is made by them, endorsed by them or connected to them. The page says so.
// - Say only what is true of both. Of Jackbox: its party packs are paid games that one person buys and runs
//   on a shared screen (a console, a computer or a streaming device), and players join from their phones
//   with a room code; Fibbage is its game where players write lies to a trivia question. Name where Jackbox
//   is the better choice too: many more games, and a big audience can watch and vote.
// - Of Bullshit, only what the game does (November 2026): free, in the phone's browser, up to 8 players,
//   no big screen needed (an optional one through Present), 5, 7 or 9 questions, English and Hebrew questions.

const example = (q, story) => `<div class="example">
  <p class="q">${q}</p>
  <p>${story}</p>
</div>`;

const jackboxEn = `
<p>If you have played Fibbage, you already know how Bullshit works: a strange true fact appears with a blank, everyone writes a lie to fill it, and then everyone tries to spot the truth among all the lies. Bullshit is a free game in that same spirit. It runs in the browser on everyone's phone, nobody has to buy anything, and you don't need a TV.</p>
<!--start-->
<h2>How it plays</h2>
${example('In 1932, the Australian army went to war against ____, and lost',
    'Say Dana writes "kangaroos", Sam writes "a cricket team" and Lee writes "rabbits". All of them sound possible in Australia. The truth: emus. Anyone who picked "kangaroos" just gave Dana points.')}
<p>You score for finding the truth and for every friend who falls for your lie. The game adds a few lies of its own, and picking one of those costs you points. There are three rounds, and points grow each round, so nobody is out of it until the last question.</p>
<h2>Bullshit and Jackbox side by side</h2>
<table>
  <tr><th></th><th>Bullshit</th><th>Jackbox party packs</th></tr>
  <tr><td>Price</td><td>Free. No paid packs, no ads in the game.</td><td>Paid. One person buys a pack, and each pack is sold on its own.</td></tr>
  <tr><td>What you need</td><td>Phones with a browser. That's all.</td><td>A copy of the game, and a TV, computer or console that runs it on a screen everyone can see. Players join from their phones.</td></tr>
  <tr><td>Who sets it up</td><td>Anyone: open bullshit.wtf on a phone and tap "Create Game".</td><td>The person who owns the game and the screen.</td></tr>
  <tr><td>Players</td><td>Up to 8 phones a game.</td><td>Depends on the game; many take up to 8, and a large audience can watch and vote.</td></tr>
  <tr><td>Games</td><td>One game: bluffing trivia.</td><td>Several different games in each pack.</td></tr>
  <tr><td>Languages</td><td>Questions in English and in Hebrew.</td><td>Mostly English, with some games in other languages.</td></tr>
</table>
<p>If your group wants many kinds of game in one evening, or you stream to a big online audience, a Jackbox pack is worth the money. If you want the write-a-lie, find-the-truth game tonight, at a friend's place, on a train or at the office, with nothing to buy or set up, start a game of Bullshit.</p>
<h2>A big screen is optional</h2>
<p>Bullshit works on phones alone: each phone shows the question, all the answers and the scores. If there is a TV or laptop in the room, open bullshit.wtf on it, click "Present" and type the game's PIN. The big screen then shows the question, the answers, who picked what and the scores, and plays music and sounds, while phones are only for writing and picking.</p>
<h2>How to start</h2>
<ol>
  <li>Tap "Start a free game" on this page, choose English or Hebrew questions and 5, 7 or 9 questions, and tap "Create".</li>
  <li>The game shows a four-letter PIN and an invite link. Send the link to the group, or everyone opens bullshit.wtf, taps "Join Game" and types the PIN.</li>
  <li>When everyone is in, the person who opened the game taps "Start". A game of 5 questions takes about ten minutes, and "Rematch" at the end starts a new one with the same players and new questions.</li>
</ol>
<p>The full rules and points are on <a href="/how-to-play">How to play</a>. More about playing on phones: <a href="/party-games-on-your-phone">party games on your phone</a>.</p>
<p><small>Jackbox, The Jackbox Party Pack and Fibbage are trademarks of Jackbox Games. Bullshit is an independent game and is not made by, endorsed by or connected to Jackbox Games.</small></p>`;

const jackboxHe = `
<p>מי ששיחק בפיבאג' (Fibbage) של ג'קבוקס כבר יודע איך משחקים בבולשיט: מופיעה עובדה אמיתית ומוזרה עם חלק חסר, כל אחד ממציא תשובה שקרית שתשלים אותה, ואז כולם מנסים לזהות את האמת בין כל השקרים. בולשיט הוא משחק מאותו סוג, אבל חינמי ובעברית. הוא עובד בדפדפן של הטלפון, אף אחד לא צריך לקנות כלום, ולא צריך טלוויזיה.</p>
<!--start-->
<h2>איך זה נראה</h2>
${example('ב-1932 הצבא האוסטרלי יצא למלחמה נגד ____, והפסיד',
    'נניח שנועה כותבת "קנגורו", יואב כותב "נבחרת קריקט" ומיכל כותבת "ארנבים". הכול נשמע אפשרי באוסטרליה. התשובה האמיתית: ציפורי אמו. מי שבחר ב"קנגורו" פשוט נתן לנועה נקודות.')}
<p>מקבלים נקודות על מציאת האמת ועל כל חבר שנפל בשקר שלכם. המשחק מוסיף גם כמה שקרים משלו, ומי שנופל באחד מהם מפסיד נקודות. יש שלושה סבבים, והנקודות גדלות בכל סבב, כך שאף אחד לא בחוץ עד השאלה האחרונה.</p>
<h2>בולשיט וג'קבוקס, זה מול זה</h2>
<table>
  <tr><th></th><th>בולשיט</th><th>חבילות של ג'קבוקס</th></tr>
  <tr><td>מחיר</td><td>חינם. בלי חבילות בתשלום ובלי פרסומות במשחק.</td><td>בתשלום. מישהו אחד קונה חבילה, וכל חבילה נמכרת בנפרד.</td></tr>
  <tr><td>מה צריך</td><td>טלפונים עם דפדפן, וזהו.</td><td>עותק של המשחק, וטלוויזיה, מחשב או קונסולה שמריצים אותו על מסך שכולם רואים. השחקנים מצטרפים מהטלפון.</td></tr>
  <tr><td>מי פותח</td><td>כל אחד: נכנסים ל-<bdi dir="ltr">bullshit.wtf/he</bdi> בטלפון ולוחצים על "פתיחת משחק".</td><td>מי שקנה את המשחק ומחזיק את המסך.</td></tr>
  <tr><td>שחקנים</td><td>עד 8 טלפונים במשחק.</td><td>תלוי במשחק; ברבים מהם עד 8, וקהל גדול יכול לצפות ולהצביע.</td></tr>
  <tr><td>משחקים</td><td>משחק אחד: בלוף וטריוויה.</td><td>כמה משחקים שונים בכל חבילה.</td></tr>
  <tr><td>שפה</td><td>שאלות בעברית ובאנגלית.</td><td>בעיקר אנגלית, וחלק מהמשחקים גם בשפות אחרות. עברית, למיטב ידיעתנו, אין.</td></tr>
</table>
<p>אם החבורה רוצה הרבה סוגים של משחקים בערב אחד, או שאתם משדרים לקהל גדול ברשת, חבילה של ג'קבוקס שווה את הכסף. אם אתם רוצים את המשחק של "ממציאים שקר ומחפשים את האמת" הערב, בעברית, אצל חברים, בארוחת שישי או בעבודה, בלי לקנות ובלי להתקין, פתחו משחק בולשיט.</p>
<h2>מסך גדול זה בונוס, לא חובה</h2>
<p>בולשיט עובד גם בטלפונים בלבד: כל טלפון מציג את השאלה, את כל התשובות ואת הניקוד. אם יש בחדר טלוויזיה או מחשב, נכנסים בו ל-<bdi dir="ltr">bullshit.wtf/he</bdi>, לוחצים על "מסך" ומקלידים את קוד המשחק. המסך הגדול מציג את השאלה, התשובות, מי בחר במה ואת הניקוד, עם מוזיקה וצלילים, והטלפונים משמשים רק לכתיבה ולבחירה.</p>
<h2>איך מתחילים</h2>
<ol>
  <li>לוחצים על "פותחים משחק בחינם" בעמוד הזה, בוחרים שאלות בעברית או באנגלית ו-5, 7 או 9 שאלות, ולוחצים על "פתיחת משחק".</li>
  <li>מופיע קוד של ארבע אותיות וקישור הזמנה. שולחים את הקישור בקבוצת הוואטסאפ, או שכולם נכנסים ל-<bdi dir="ltr">bullshit.wtf/he</bdi>, בוחרים "הצטרפות למשחק" ומקלידים את הקוד.</li>
  <li>כשכולם בפנים, מי שפתח את המשחק לוחץ על "מתחילים". משחק של 5 שאלות לוקח בערך עשר דקות, ובסוף "משחק חוזר" פותח משחק חדש עם אותם שחקנים ושאלות חדשות.</li>
</ol>
<p>כל החוקים והניקוד נמצאים ב<a href="/he/how-to-play">איך משחקים</a>. עוד על משחק בטלפון: <a href="/he/party-game-phone">משחק חברה בטלפון</a>.</p>
<p><small>Jackbox, The Jackbox Party Pack ו-Fibbage הם סימנים מסחריים של Jackbox Games. בולשיט הוא משחק עצמאי, ואינו קשור ל-Jackbox Games, לא נוצר על ידה ולא קיבל ממנה המלצה.</small></p>`;

module.exports = {
    pages: (en, he) => [
        {
            path: '/free-jackbox-alternative', twin: '/he/game-like-jackbox', site: en, tag: 'seo-en-jackbox',
            start: { href: '/create-game?lang=en', label: 'Start a free game' },
            image: '/assets/og-jackbox-en.png',
            title: 'A free Jackbox and Fibbage alternative: Bullshit, bluffing trivia on your phones',
            description: 'Like Fibbage, but free and with no TV needed: write a lie, find the truth, fool your friends. Bullshit runs in the phone browser, up to 8 players, English and Hebrew.',
            h1: 'A free alternative to Jackbox\'s Fibbage',
            body: jackboxEn,
        },
        {
            path: '/he/game-like-jackbox', twin: '/free-jackbox-alternative', site: he, tag: 'seo-he-jackbox',
            start: { href: '/create-game?lang=he', label: 'פותחים משחק בחינם' },
            image: '/assets/og-jackbox-he.png',
            title: 'משחק כמו ג\'קבוקס בעברית, בחינם: בולשיט, בלוף וטריוויה בטלפון',
            description: 'כמו פיבאג\' של ג\'קבוקס, אבל בעברית, בחינם ובלי טלוויזיה: ממציאים שקר, מחפשים את האמת ועובדים על החברים. בדפדפן של הטלפון, עד 8 שחקנים.',
            h1: 'משחק כמו ג\'קבוקס, בעברית ובחינם',
            body: jackboxHe,
        },
    ],
};
