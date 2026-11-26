// How to play the classic card game Bullshit (also called BS, Cheat or I Doubt It), in English, with a Hebrew twin.
// Many people who search for "bullshit card game", "how to play bullshit" or "בולשיט משחק קלפים" find our
// site and leave: they want the card game. These pages answer them properly first, then say, honestly and
// at the end, that this site is a different game with the same idea.
//
// Keep them honest and accurate:
// - The card game is a traditional game. Nobody owns it, and these pages never say it is ours. They name no
//   company, brand, product, logo or deck art for it, and show no picture of anyone's cards.
// - The rules are the common ones, as two independent rule sources give them (checked November 2026:
//   pagat.com "Cheat / Bullshit / I Doubt It", and gamerules.com "Bullshit"): 2 to 10 players on one deck of
//   52, all cards dealt, ranks called in order Ace, 2 ... King and round again, any number of cards a turn,
//   any other player may call, the loser of the call takes the whole pile, the first to empty their hand
//   and survive a call on the last play wins. The variants are ones both sources list (two decks, counting
//   down, one rank up or down, a drinking rule) and a call on any number of cards.
// - Of our game, only what it does (November 2026): free, in the phone's browser, up to 12 players, a TV is
//   optional, English and Hebrew questions. The text is ours: write, never copy, any rule source.

const cardGameEn = `
<p>Bullshit is a card game about lying with a straight face. Everyone tries to get rid of their cards by putting them face down and saying what they are, and nobody has to tell the truth. If you think someone is lying, you call "Bullshit!". Whoever is wrong takes the whole pile. The same game is also called BS, Cheat and I Doubt It. Here are the rules most people play by, with a few popular variations.</p>
<p>At the end of this page there is also a free game for phones built on the same bluffing idea, in case there's no deck of cards around.</p>
<!--start-->
<h2>What you need</h2>
<ul>
  <li><strong>Players:</strong> 2 to 10. It is best with 3 to 6. With two players there's little to guess, because each of you knows what the other can't have.</li>
  <li><strong>Cards:</strong> one standard deck of 52 cards, jokers out. For 7 or more players, shuffle two decks together.</li>
  <li><strong>Time:</strong> about 15 to 30 minutes a game, longer with more players.</li>
</ul>
<h2>The deal</h2>
<p>Shuffle and deal out the whole deck, one card at a time, face down. It's fine if some players get one card more than others. Everyone picks up their hand and keeps it hidden.</p>
<h2>A turn</h2>
<ol>
  <li>Pick someone to start: at random, or, as many tables do, whoever holds the ace of spades.</li>
  <li>The first player puts one or more cards face down in the middle and says how many there are and that they are aces: "Two aces."</li>
  <li>The next player to the left plays on the same pile and must claim twos, for example "Three twos." The next claims threes, and so on up: ace, 2, 3, 4, 5, 6, 7, 8, 9, 10, jack, queen, king, and then back to aces.</li>
  <li>You may play any number of cards, but you must play at least one, and you must claim the rank it's your turn to claim. If you don't have that rank, or don't want to give it up, lie: put down any cards and say they're the right ones.</li>
</ol>
<h2>Calling "Bullshit!"</h2>
<p>After someone plays, any other player who thinks it was a lie can call "Bullshit!" (or "Cheat!", or "I doubt it!"). The call has to come before the next player puts their cards down. Then the cards just played are turned face up:</p>
<ul>
  <li><strong>It was a lie</strong> (any card isn't the rank claimed, or there are more cards than the player said): the player who lied picks up the whole pile and adds it to their hand.</li>
  <li><strong>It was the truth</strong>: the player who called picks up the whole pile.</li>
</ul>
<p>Either way, play goes on from the next player in turn, with the next rank. If two people call at the same moment, a common rule is that the one who comes first in turn order is the caller.</p>
<h2>Winning</h2>
<p>The first player with no cards left wins, but only if their last play stands. Your last cards can be called like any others. If they turn out to be a lie, you pick up the pile and the game goes on. So the last turn is the most dangerous one, and the best moment to call.</p>
<h2>Common variations</h2>
<ul>
  <li><strong>Two decks:</strong> for big groups. A claim of "five queens" can now be true, which makes the calls much harder.</li>
  <li><strong>Counting down:</strong> claim aces, then kings, queens, jacks, 10 and so on down.</li>
  <li><strong>One up or one down:</strong> on your turn you may claim the rank just above or just below the last claim (after 8s, claim 7s or 9s). Some tables also allow the same rank again. Fewer forced lies, more guessing.</li>
  <li><strong>Drinking version:</strong> for adults only. Whoever picks up the pile takes a sip of their drink. A sip of water counts just as well, and nobody has to drink to play.</li>
</ul>
<h2>Tips for playing well</h2>
<ul>
  <li>Count. With one deck there are only four of each rank. If you hold three sevens and someone claims "two sevens", it's a lie.</li>
  <li>Tell the truth early, while the pile is small and being caught costs little, and save your lies for when you have no choice.</li>
  <li>Look ahead. You know which ranks you'll have to claim on your next turns, so keep the right cards for them.</li>
  <li>Don't call too often. A wrong call hands you the pile, and a big pile is hard to get rid of.</li>
</ul>
<h2>The same idea on your phones: our game Bullshit</h2>
<p>This site is not the card game. It's a different game that shares the idea: telling a good lie and catching everyone else's. In our Bullshit, a strange true fact appears with a word missing, everyone writes a believable fake answer, and then everyone tries to pick the real one out of all the lies. You score for finding the truth and for every friend who picks your lie.</p>
<p>It's free, runs in the browser on each player's phone with nothing to install, and takes up to 12 players, with questions in English or Hebrew. A TV or laptop can show the questions to the room if you like, but it isn't needed. One person starts a game and the others join with a four-letter PIN.</p>
<p><a href="/create-game?lang=en&amp;via=seo-en-cards">Start a free game on your phone</a>, or read <a href="/how-to-play">how our game works</a> first.</p>`;

const cardGameHe = `
<p>בולשיט הוא משחק קלפים שכל כולו לשקר בלי למצמץ. כל אחד מנסה להיפטר מהקלפים שלו: מניחים אותם הפוכים ואומרים מה הם, ואף אחד לא חייב להגיד את האמת. מי שחושב שמישהו משקר צועק "בולשיט!", ומי שטעה לוקח את כל הערימה. באנגלית המשחק נקרא גם <bdi>BS</bdi>, <bdi>Cheat</bdi> או <bdi>I Doubt It</bdi>. הנה החוקים שרוב האנשים משחקים לפיהם, ועוד כמה גרסאות אהובות.</p>
<p>בסוף העמוד יש גם משחק חינמי לטלפון שבנוי על אותו רעיון של בלוף, למקרה שאין חפיסת קלפים בהישג יד.</p>
<!--start-->
<h2>מה צריך</h2>
<ul>
  <li><strong>שחקנים:</strong> 2 עד 10. הכי כיף עם 3 עד 6. בשניים אין הרבה מה לנחש, כי כל אחד יודע מה אין לשני.</li>
  <li><strong>קלפים:</strong> חפיסה רגילה של 52 קלפים, בלי ג'וקרים. מ-7 שחקנים ומעלה, מערבבים שתי חפיסות יחד.</li>
  <li><strong>זמן:</strong> בערך 15 עד 30 דקות למשחק, יותר כשיש יותר שחקנים.</li>
</ul>
<h2>החלוקה</h2>
<p>מערבבים ומחלקים את כל החפיסה, קלף אחד בכל פעם, הפוך. זה בסדר שלחלק מהשחקנים יהיה קלף אחד יותר. כל אחד מרים את הקלפים שלו ושומר אותם מוסתרים.</p>
<h2>תור</h2>
<ol>
  <li>בוחרים מי מתחיל: באקראי, או, כמו שנהוג בהרבה שולחנות, מי שמחזיק את אס העלה.</li>
  <li>השחקן הראשון מניח קלף אחד או יותר הפוכים באמצע, ואומר כמה הם ושהם אסים: "שני אסים".</li>
  <li>השחקן הבא משמאל מניח על אותה ערימה וחייב להכריז על 2, למשל: "שלושה קלפי 2". הבא אחריו מכריז על 3, וכך הלאה כלפי מעלה: אס, 2, 3, 4, 5, 6, 7, 8, 9, 10, נסיך (J), מלכה (Q), מלך (K), ושוב אסים.</li>
  <li>מותר להניח כמה קלפים שרוצים, אבל לפחות קלף אחד, וחייבים להכריז על הדרגה שתורכם להכריז עליה. אין לכם אותה, או שאתם לא רוצים לוותר עליה? משקרים: מניחים קלפים אחרים ואומרים שהם הנכונים.</li>
</ol>
<h2>צועקים "בולשיט!"</h2>
<p>אחרי שמישהו מניח קלפים, כל שחקן אחר שחושב שזה שקר יכול לצעוק "בולשיט!". צריך לצעוק לפני שהשחקן הבא מניח את הקלפים שלו. אז הופכים את הקלפים שהונחו עכשיו:</p>
<ul>
  <li><strong>זה היה שקר</strong> (קלף כלשהו הוא לא הדרגה שהוכרזה, או שיש יותר קלפים ממה שנאמר): מי ששיקר לוקח את כל הערימה ליד שלו.</li>
  <li><strong>זו הייתה אמת</strong>: מי שצעק לוקח את כל הערימה.</li>
</ul>
<p>בכל מקרה, המשחק ממשיך מהשחקן הבא בתור, עם הדרגה הבאה. אם שניים צועקים באותו רגע, נהוג שמי שקרוב יותר בסדר התורות הוא הצועק.</p>
<h2>מי מנצח</h2>
<p>הראשון שנשאר בלי קלפים מנצח, אבל רק אם ההנחה האחרונה שלו עומדת. גם על הקלפים האחרונים אפשר לצעוק "בולשיט". אם מתברר שהם שקר, לוקחים את הערימה והמשחק ממשיך. לכן התור האחרון הוא המסוכן ביותר, וגם הרגע הכי טוב לצעוק.</p>
<h2>גרסאות נפוצות</h2>
<ul>
  <li><strong>שתי חפיסות:</strong> לקבוצה גדולה. עכשיו "חמש מלכות" יכול להיות אמת, וזה הופך את ההחלטה מתי לצעוק להרבה יותר קשה.</li>
  <li><strong>סופרים למטה:</strong> מכריזים על אסים, ואז מלכים, מלכות, נסיכים, 10 וכך הלאה כלפי מטה.</li>
  <li><strong>אחד למעלה או אחד למטה:</strong> בתור שלכם מכריזים על הדרגה שמעל או שמתחת להכרזה הקודמת (אחרי 8 מכריזים 7 או 9). יש שולחנות שמרשים גם את אותה דרגה שוב. פחות שקרים בכפייה, יותר ניחושים.</li>
  <li><strong>גרסת שתייה:</strong> למבוגרים בלבד. מי שלוקח את הערימה לוגם מהכוס שלו. גם לגימת מים נחשבת, ואף אחד לא חייב לשתות כדי לשחק.</li>
</ul>
<h2>טיפים לשחק טוב</h2>
<ul>
  <li>תספרו. בחפיסה אחת יש רק ארבעה מכל דרגה. אם יש לכם שלוש שביעיות ומישהו מכריז "שתי שביעיות", זה שקר.</li>
  <li>תגידו אמת בהתחלה, כשהערימה קטנה ולהיתפס עולה מעט, ותשמרו את השקרים לרגעים שאין ברירה.</li>
  <li>תחשבו קדימה. אתם יודעים על אילו דרגות תצטרכו להכריז בתורות הבאים, אז תשמרו להם את הקלפים הנכונים.</li>
  <li>אל תצעקו יותר מדי. צעקה לא נכונה מביאה לכם את הערימה, וערימה גדולה קשה להיפטר ממנה.</li>
</ul>
<h2>אותו רעיון בטלפונים: המשחק שלנו, בולשיט</h2>
<p>האתר הזה הוא לא משחק הקלפים. זה משחק אחר שחולק איתו את הרעיון: להמציא שקר טוב ולתפוס את השקרים של כל השאר. בבולשיט שלנו מופיעה עובדה אמיתית ומוזרה שחסרה בה מילה, כל אחד כותב תשובה מומצאת שנשמעת אמינה, ואז כולם מנסים למצוא את התשובה האמיתית בין כל השקרים. מקבלים נקודות על מציאת האמת ועל כל חבר שבחר בשקר שלכם.</p>
<p>הוא חינמי, עובד בדפדפן בטלפון של כל שחקן בלי להתקין כלום, ומתאים עד 12 שחקנים, עם שאלות בעברית או באנגלית. אפשר להציג את השאלות לכל החדר על טלוויזיה או מחשב, אבל זה לא חובה. אחד פותח משחק, והשאר מצטרפים עם קוד של ארבע אותיות.</p>
<p><a href="/create-game?lang=he&amp;via=seo-he-cards">פותחים משחק בחינם בטלפון</a>, או קודם קוראים <a href="/he/how-to-play">איך המשחק שלנו עובד</a>.</p>`;

// What the page is about, for its structured data: the card game, a traditional game that nobody sells.
const about = (name, alternateName, lang) => ({
    '@type': 'Game',
    name,
    alternateName,
    inLanguage: lang,
    numberOfPlayers: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 10 },
});

module.exports = {
    pages: (en, he) => [
        {
            path: '/bullshit-card-game', twin: '/he/bullshit-card-game', site: en, tag: 'seo-en-cards',
            start: { href: '/create-game?lang=en', label: 'Try our free phone game' },
            image: '/assets/og-card-game-en.png',
            title: 'How to Play Bullshit, the Card Game: Rules and Variants',
            description: 'Bullshit (BS, Cheat, I Doubt It) card game rules: players, the deal, a turn, calling bullshit, who takes the pile, how to win, and popular variations.',
            h1: 'How to play Bullshit, the card game',
            updated: '2026-11-24',
            about: about('Bullshit (card game)', ['BS', 'Cheat', 'I Doubt It'], 'en'),
            body: cardGameEn,
        },
        {
            path: '/he/bullshit-card-game', twin: '/bullshit-card-game', site: he, tag: 'seo-he-cards',
            start: { href: '/create-game?lang=he', label: 'נסו את המשחק שלנו בטלפון' },
            image: '/assets/og-card-game-he.png',
            title: 'בולשיט משחק קלפים: החוקים, איך משחקים וגרסאות',
            description: 'איך משחקים בולשיט בקלפים: כמה שחקנים, החלוקה, תור, מתי צועקים "בולשיט", מי לוקח את הערימה, מי מנצח, וגרסאות נפוצות.',
            h1: 'איך משחקים בולשיט, משחק הקלפים',
            updated: '2026-11-24',
            about: about('בולשיט (משחק קלפים)', ['Bullshit', 'Cheat', 'I Doubt It'], 'he'),
            body: cardGameHe,
        },
    ],
};
