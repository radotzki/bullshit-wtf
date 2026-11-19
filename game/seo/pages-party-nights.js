// Search pages for grown-up party nights: a bachelorette or bachelor party, a grown-up birthday, and a
// weekend away with friends (a zimmer, a cabin). Hebrew first, each with an English twin. Each page has
// its own ?via= tag (party-<page>-he / party-<page>-en), so the groups it brings are counted apart from
// the other search pages.
//
// Three pages a language, not one: people search for these nights separately. In Hebrew, "משחקים למסיבת
// רווקות" (which "רווקים" also finds), "משחקי מבוגרים ליום הולדת" and "משחקי חברה למבוגרים" each have
// their own ranking pages on Israeli party sites; in English, bachelorette games, adult birthday party
// games and cabin or cottage weekend games each have their own lists (searched 19 November 2026).
//
// Say only what the game really does (November 2026): free, in the phone's browser, up to 12 players a
// game, 5, 7 or 9 questions, three rounds where points grow, house lies, an optional big screen
// ("Present" / "מסך"), Rematch, saved crews, "the biggest bullshitter" at the end. The questions are
// strange facts, not adult ones: the pages say so. The Start buttons open Create with the party pack
// (?pack=party, functions/data/party-questions.json): up to 4 questions a game about weddings,
// birthdays, trips and nights out, mixed with the usual ones. No player counts, reviews or quotes.
// Each example is a real question of the game (functions/data/opening-questions.json), with its true answer.

const example = (q, story) => `<div class="example">
  <p class="q">${q}</p>
  <p>${story}</p>
</div>`;

const startHe = (button) => `<h2>איך מתחילים</h2>
<ol>
  <li>לוחצים על "${button}" בעמוד הזה, בוחרים כמה שאלות (5, 7 או 9) ולוחצים על "פתיחת משחק".</li>
  <li>המשחק מציג קוד של ארבע אותיות. שולחים את הקישור בקבוצת הוואטסאפ, או שכולם נכנסים ל-<bdi dir="ltr">bullshit.wtf/he</bdi>, בוחרים "הצטרפות למשחק" ומקלידים את הקוד.</li>
  <li>כל אחד בוחר כינוי, וכשכולם בפנים, מי שפתח את המשחק לוחץ על "מתחילים".</li>
</ol>`;

const startEn = (button) => `<h2>How to start</h2>
<ol>
  <li>Tap "${button}" on this page, choose 5, 7 or 9 questions, and tap "Create".</li>
  <li>The game shows a four-letter PIN and an invite link. Drop the link in the group chat, or everyone opens bullshit.wtf on their phone, taps "Join Game" and types the PIN.</li>
  <li>Everyone picks a nickname. When everyone is in, whoever opened the game taps "Start".</li>
</ol>`;

const bacheloretteHe = `
<p>הצימר סגור, הכתר כבר בתיק, ונשאר רק לתכנן מה עושים בערב: אחרי האוכל, לפני שכולן נרדמות על הספה. בולשיט הוא משחק שבו כל אחת משחקת מהטלפון שלה, ומי שמשקרת הכי טוב מנצחת. בלי קופסה, בלי הורדה ובלי הרשמה.</p>
<!--start-->
<h2>מה עושים במשחק</h2>
<p>על המסך מופיעה עובדה אמיתית ומוזרה, ובמקום החלק הכי מעניין שלה יש קו ריק. כל אחת כותבת תשובה מומצאת, כזאת שנשמעת אמיתית מספיק כדי שהאחרות יאמינו לה. אחר כך כל התשובות מופיעות יחד: השקרים של כולן, כמה שקרים שהמשחק מוסיף בעצמו, והאמת. כל אחת בוחרת במה שנראה לה נכון. מוצאים את האמת? מקבלים נקודות. חברה נפלה בשקר שלכן? עוד נקודות. ונפלתן בשקר של המשחק? מפסידות.</p>
<h2>שאלה לדוגמה מהמשחק</h2>
${example('בפינלנד מתקיימת אליפות עולם בסחיבת ____',
    'נניח שהכלה כותבת "בירה", נועה כותבת "חמות" ומאיה הולכת על "צמיגים". התשובה האמיתית: נשים. יש באמת אליפות עולם שבה גברים רצים במסלול מכשולים עם אישה על הגב. מי שבחרה ב"חמות" הביאה לנועה נקודות, ועכשיו כולן רוצות לדעת למה זה היה ניחוש כל כך משכנע.')}
<h2>למה זה עובד במסיבת רווקות</h2>
<ul>
  <li><strong>כל המשחק הוא לשקר בפנים רציניות.</strong> מי שמכירה את החברות שלה יודעת מי תיפול במה. בסוף המשחק מוכרז "הבולשיטר הגדול" של הערב: זאת שהשקרים שלה עבדו על הכי הרבה חברות.</li>
  <li><strong>מחבר בין החבורות.</strong> החברות מהתיכון, מהצבא ומהעבודה, שחלקן נפגשות בפעם הראשונה, מתחילות מאותה נקודה: אף אחת לא יודעת את התשובות.</li>
  <li><strong>עד 12 טלפונים במשחק.</strong> יותר מזה? משחקים בזוגות על טלפון אחד, וזה רק מוסיף התלחשויות.</li>
  <li><strong>קצר.</strong> משחק של 5 שאלות לוקח בין חמש לעשר דקות, כך שאפשר לשחק סבב אחד לפני הג'קוזי ועוד אחד אחריו.</li>
  <li><strong>חינם ובדפדפן.</strong> אין מה להוריד ואין חשבון לפתוח. מי שמגיעה באיחור מצטרפת עם הקוד תוך שניות.</li>
</ul>
<h2>טריק קטן למארגנת</h2>
<p>השאלות במשחק הן עובדות מוזרות מכל העולם, וכמה מהן על חתונות, מסיבות וטיולים, אבל אף אחת לא על הכלה. אבל השקרים הם שלכן. תשובה כמו "הדייט הראשון של הכלה" או "השיר שהחתן שר באוטו" לא תמיד תעבוד על מישהי, אבל היא תפיל את כל החדר מצחוק כשהיא תופיע על המסך. ובסוף כל משחק, "משחק חוזר" פותח סבב חדש עם אותן שחקניות ושאלות חדשות.</p>
<h2>ובמסיבת רווקים?</h2>
<p>אותו משחק בדיוק. החתן נגד החברים מהשכונה, מהצבא ומהעבודה, וכל אחד מנסה לעבוד על כולם. יש טלוויזיה בצימר או בבית? פותחים בה את <bdi dir="ltr">bullshit.wtf/he</bdi>, לוחצים על "מסך" ומקלידים את קוד המשחק: השאלות, התשובות ומי בחר במה מופיעים בגדול, והטלפונים נשארים לכתיבה ולבחירה.</p>
<h2>כדאי לדעת מראש</h2>
<ul>
  <li><strong>השם.</strong> "בולשיט" היא מילה גסה, והיא מופיעה על המסכים. במסיבת רווקות זה בדרך כלל חלק מהכיף.</li>
  <li><strong>המשחק עצמו לא גס.</strong> כמה גס יהיה הערב תלוי רק במה שתכתבו. המשחק מחליף כינויים גסים בכינוי תמים, אבל את השקרים הוא מציג כמו שנכתבו.</li>
  <li><strong>צריך אינטרנט</strong> בכל טלפון, גם בצימר.</li>
</ul>
${startHe('פותחים משחק למסיבה')}
<p>רוצים לקרוא קודם את החוקים והניקוד? הם ב<a href="/he/how-to-play">איך משחקים</a>. לערב רגיל עם החבר'ה יש גם <a href="/he/friends-evening">משחק לערב חברים</a>.</p>`;

const birthdayHe = `
<p>יום הולדת 30, 40 או 50, הבית מלא, וחצי מהאורחים לא מכירים את החצי השני. בולשיט הוא משחק שמחבר את כולם בתוך דקה: כל אחד משחק מהטלפון שלו, ומי שמשקר הכי טוב מנצח. חינם, בדפדפן, בלי הורדה.</p>
<!--start-->
<h2>מה עושים במשחק</h2>
<p>מופיעה עובדה אמיתית ומוזרה עם חלק חסר. כל אחד ממציא תשובה שנשמעת אמיתית וכותב אותה בטלפון. אחר כך כל התשובות מופיעות יחד, השקרים של האורחים, כמה שקרים של המשחק עצמו והאמת, וכל אחד בוחר במה שהוא מאמין לו. נקודות על מציאת האמת, ועוד נקודות על כל אורח שנפל בשקר שלכם. נקודות יורדות למי שנופל בשקר של המשחק.</p>
<h2>שאלה לדוגמה מהמשחק</h2>
${example('האיש שעיצב את קופסת הפרינגלס ביקש להיקבר ב ____',
    'נניח שבעל השמחה כותב "המפעל שלו", הדודה כותבת "חול של חוף בהוואי" והחבר מהעבודה הולך על "שקית של במבה". האמת: בקופסת פרינגלס. מי שבחר ב"שקית של במבה" נתן נקודות לחבר מהעבודה, ומעכשיו הוא כבר לא "החבר מהעבודה" אלא השקרן של המסיבה.')}
<h2>למה זה עובד ביום הולדת של מבוגרים</h2>
<ul>
  <li><strong>שובר את הקרח בין המעגלים.</strong> המשפחה, החברים מהילדות והקולגות לא צריכים נושא משותף. אף אחד לא יודע את התשובות, וכולם מתחילים מאותה נקודה.</li>
  <li><strong>כולם משחקים בבת אחת.</strong> אין תורות ואין מי שמחכה בצד. גם השקטים משחקים בדיוק כמו הרועשים.</li>
  <li><strong>נכנס בין העוגה למתנות.</strong> 5, 7 או 9 שאלות. משחק של 5 שאלות לוקח בין חמש לעשר דקות.</li>
  <li><strong>עד 12 טלפונים.</strong> מסיבה גדולה יותר משחקת בזוגות, טלפון לכל זוג.</li>
  <li><strong>המסך בסלון.</strong> פותחים את <bdi dir="ltr">bullshit.wtf/he</bdi> במחשב או בטלוויזיה, לוחצים על "מסך" ומקלידים את קוד המשחק, וכל החדר רואה את השאלות, את השקרים ומי עבד על מי.</li>
</ul>
<h2>רעיונות לבעל או לבעלת השמחה</h2>
<ul>
  <li>תנו לחוגג לפתוח את המשחק ולבחור את מספר השאלות. זה היום שלו.</li>
  <li>השאלות הן עובדות מוזרות, וכמה מהן על ימי הולדת, חתונות ובילויים, אבל השקרים יכולים להיות על החוגג: "הגיל שהוא מודה בו", "הדבר שהיא אף פעם לא תודה שהיא אוהבת". גם אם אף אחד לא יבחר בתשובה כזאת, כולם יצחקו כשהיא תופיע.</li>
  <li>בסוף המשחק מוכרז "הבולשיטר הגדול", מי שהשקרים שלו עבדו על הכי הרבה אורחים. שווה לראות מי זה, כי זה כמעט אף פעם לא מי שחשבתם.</li>
  <li>שמרו את החבורה בסוף המשחק: לחבורה יש דף עם טבלה שממשיכה ממשחק למשחק, והיא תחכה ליום ההולדת הבא.</li>
</ul>
<h2>כדאי לדעת מראש</h2>
<p>השם של המשחק הוא מילה גסה, והוא מופיע על המסכים. השאלות עצמן לא גסות: הן עובדות מוזרות מכל העולם, בעברית או באנגלית. מה שנכתב בתשובות נשאר באחריות האורחים.</p>
${startHe('פותחים משחק ליום הולדת')}
<p>החוקים המלאים והניקוד ב<a href="/he/how-to-play">איך משחקים</a>.</p>`;

const weekendHe = `
<p>סופ"ש בצימר, בווילה או בקמפינג עם החבר'ה: אחרי הארוחה, אחרי הג'קוזי, ומישהו שואל "אז מה עושים עכשיו?". בולשיט הוא משחק חברה למבוגרים שכל אחד משחק מהטלפון שלו. לא צריך לארוז קופסה, רק מטען.</p>
<!--start-->
<h2>מה עושים במשחק</h2>
<p>מופיעה עובדה אמיתית ומוזרה עם חלק חסר. כל אחד כותב שקר שנשמע אמיתי, ואז כל התשובות מופיעות יחד עם האמת וכמה שקרים של המשחק עצמו. כל אחד בוחר במה שהוא מאמין לו. מוצאים את האמת, מקבלים נקודות. כל חבר שנפל בשקר שלכם, עוד נקודות. הנקודות גדלות מסבב לסבב, אז אף אחד לא בחוץ עד השאלה האחרונה.</p>
<h2>שאלה לדוגמה מהמשחק</h2>
${example('לוטרות ים ____ כשהן ישנות, כדי לא להיסחף אחת מהשנייה',
    'נניח שדני כותב "נוחרות", מיכל כותבת "קושרות את הזנבות" ורועי הולך על "מזמזמות". האמת: מחזיקות ידיים. מי שבחר ב"קושרות את הזנבות" נתן נקודות למיכל, ומי שבחר באמת כבר מסתכל על בן הזוג שלו בצימר בעיניים אחרות.')}
<h2>למה זה מתאים לסופ"ש עם חברים</h2>
<ul>
  <li><strong>זה משחק למבוגרים במובן הטוב.</strong> לא צריך לדעת טריוויה, צריך לשקר טוב ולהכיר את החברים. אחרי עשר שנים ביחד, כולם יודעים מי לא מסוגל להחזיק פנים רציניות.</li>
  <li><strong>כל אחד מהטלפון שלו, כולם באותו משחק.</strong> אף אחד לא מקריא קלפים ואף אחד לא מחכה לתור.</li>
  <li><strong>עד 12 שחקנים.</strong> זוגות יכולים לשחק כצוות על טלפון אחד, או אחד נגד השני.</li>
  <li><strong>סבב אחד או כל הלילה.</strong> משחק של 5 שאלות לוקח בין חמש לעשר דקות. "משחק חוזר" פותח עוד אחד עם אותם שחקנים ושאלות חדשות.</li>
  <li><strong>יש טלוויזיה בצימר?</strong> פותחים בה את <bdi dir="ltr">bullshit.wtf/he</bdi>, לוחצים על "מסך" ומקלידים את הקוד. השאלות והניקוד על המסך הגדול, והטלפונים לכתיבה ולבחירה.</li>
</ul>
<h2>מסורת של כל סופ"ש</h2>
<p>בסוף המשחק אפשר לשמור את החבורה. לחבורה יש דף משלה, עם טבלה שממשיכה ממשחק למשחק, כך שמי שניצח בצימר בחורף יצטרך להגן על התואר בקמפינג בקיץ. ובסוף כל משחק מוכרז "הבולשיטר הגדול": מי שהשקרים שלו עבדו על הכי הרבה חברים.</p>
<h2>כדאי לדעת מראש</h2>
<ul>
  <li><strong>צריך אינטרנט</strong> בכל טלפון. אם הקליטה בצימר חלשה, בדקו את ה-Wi-Fi לפני שמתחילים.</li>
  <li><strong>השם הוא מילה גסה</strong>, והוא מופיע על המסכים. השאלות עצמן הן עובדות מוזרות מכל העולם, לא שאלות גסות. מה שתכתבו בתשובות, זה כבר עליכם.</li>
</ul>
${startHe('פותחים משחק לסופ"ש')}
<p>החוקים המלאים ב<a href="/he/how-to-play">איך משחקים</a>. לערב חברים בבית יש גם <a href="/he/friends-evening">משחק לערב חברים</a>, ולמסיבה לפני חתונה, <a href="/he/bachelorette">משחק למסיבת רווקות ורווקים</a>.</p>`;

const bacheloretteEn = `
<p>The house is booked, the sashes are packed, and the evening still needs a plan. Bullshit is a game everyone plays on their own phone, and the best liar wins. No box, no app, no sign-up.</p>
<!--start-->
<h2>How it works</h2>
<p>A strange true fact appears with a blank. Everyone writes a lie to fill it, one that sounds true enough to fool the others. Then all the answers appear together: everyone's lies, a few lies from the game itself, and the truth. Everyone picks the one they believe. Find the truth and you score; every friend who picks your lie scores for you too; fall for one of the game's own lies and you lose points.</p>
<h2>A question from the game</h2>
${example('Finland hosts a world championship in carrying your ____',
    'Say the bride writes "beer", her sister writes "mother-in-law" and her college roommate writes "luggage". The truth: wife. There really is a world championship where men race an obstacle course with their wife on their back. Whoever picked "mother-in-law" just gave the sister points, and now everyone wants to know why it sounded so convincing.')}
<h2>Why it works at a bachelorette party</h2>
<ul>
  <li><strong>The whole game is lying with a straight face.</strong> Knowing your friends is how you win. At the end the game names the biggest bullshitter: whoever fooled the most people.</li>
  <li><strong>It mixes the groups.</strong> College friends, work friends and the groom's sister, some meeting for the first time, all start equal: nobody knows these facts.</li>
  <li><strong>Up to 12 phones a game.</strong> A bigger party plays in pairs, one phone per pair, which only adds whispering.</li>
  <li><strong>Short.</strong> A game of 5 questions takes about ten minutes, so it fits between dinner and going out, or back at the house after.</li>
  <li><strong>Free and in the browser.</strong> Nothing to download. Whoever arrives late joins with the PIN in seconds.</li>
</ul>
<h2>A trick for the maid of honor</h2>
<p>The questions are strange facts from all over the world, a few of them about weddings, birthdays and nights out, but none about the bride. But the lies are yours. An answer like "the bride's first date" or "the song the groom sings in the car" may not fool anyone, but the room will lose it when it comes up on the screen. When a game ends, "Rematch" starts another with the same players and new questions.</p>
<h2>And the bachelor party?</h2>
<p>Same game. The groom against his friends from school, from work and from the team, each trying to fool the rest. If there is a TV in the house, open bullshit.wtf on a laptop connected to it, click "Present" and type the PIN: the questions, the lies and who picked what show up big, and the phones are only for writing and picking.</p>
<h2>Good to know first</h2>
<ul>
  <li><strong>The name.</strong> "Bullshit" is a swear word, and it is on the screens. At a bachelorette party that is usually part of the fun.</li>
  <li><strong>The game itself isn't dirty.</strong> How wild the night gets depends only on what you type. The game swaps rude nicknames for a harmless one, but the lies go up as typed.</li>
  <li><strong>Each phone needs internet</strong>, so check the Wi-Fi at the rental.</li>
</ul>
${startEn('Start a party game')}
<p>The full rules and points are on <a href="/how-to-play">How to play</a>. Planning a weekend away instead? See <a href="/weekend-away-games">games for a weekend away</a>.</p>`;

const birthdayEn = `
<p>A 30th, a 40th, a 50th: the house is full and half the guests have never met the other half. Bullshit gets them all playing in under a minute. Everyone plays on their own phone, and the best liar wins. Free, in the browser, nothing to download.</p>
<!--start-->
<h2>How it works</h2>
<p>A strange true fact appears with a blank. Everyone writes a believable lie to fill it. Then every guest's lie appears together with a few lies from the game and the truth, and everyone picks the one they believe. Points for finding the truth, more points for every guest who falls for your lie, and points lost for falling for one of the game's own.</p>
<h2>A question from the game</h2>
${example('The man who designed the Pringles can asked to be buried in ____',
    'Say the birthday girl writes "his factory", her uncle writes "a bag of chips" and her friend from work writes "a salad bowl". The truth: a Pringles can. Whoever picked "a bag of chips" just gave the uncle points, and he will be telling that story for the rest of the night.')}
<h2>Why it works at a grown-up birthday</h2>
<ul>
  <li><strong>It breaks the ice between circles.</strong> Family, old friends and colleagues need nothing in common. Nobody knows the answers, so everyone starts equal.</li>
  <li><strong>Everyone plays at once.</strong> No turns, nobody waiting at the side, and the quiet guests play exactly as much as the loud ones.</li>
  <li><strong>It fits between the cake and the presents.</strong> 5, 7 or 9 questions; a game of 5 takes about ten minutes.</li>
  <li><strong>Up to 12 phones.</strong> A bigger party plays in pairs, one phone per pair.</li>
  <li><strong>The big screen.</strong> On a laptop or a TV, open bullshit.wtf, click "Present" and type the PIN, and the whole room sees the questions, the lies and who fooled whom.</li>
</ul>
<h2>Ideas for the birthday</h2>
<ul>
  <li>Let the birthday person open the game and pick the number of questions. It's their day.</li>
  <li>The questions are strange facts, a few of them about birthdays, weddings and nights out, but the lies can be about the guest of honor: "the age he admits to", "the song she pretends not to know". Nobody may pick it, but everyone will laugh when it appears.</li>
  <li>At the end the game names the biggest bullshitter, whoever fooled the most guests. It is almost never who you expected.</li>
  <li>Save the group as a crew at the end. The crew gets its own page with standings that carry over from game to game, ready for the next birthday.</li>
</ul>
<h2>Good to know first</h2>
<p>The name is a swear word, and it is on the screens. The questions themselves are not adult: they are strange facts from all over the world, in English or Hebrew. What the guests type is up to them.</p>
${startEn('Start a birthday game')}
<p>The full rules and points are on <a href="/how-to-play">How to play</a>.</p>`;

const weekendEn = `
<p>A cabin, a lake house, a rented place with friends: dinner is done, someone has lit the fire, and someone asks "so what now?". Bullshit is a party game for grown-ups that everyone plays on their own phone. Nothing to pack but a charger.</p>
<!--start-->
<h2>How it works</h2>
<p>A strange true fact appears with a blank. Everyone writes a lie that sounds true, then all the answers appear together with the truth and a few lies from the game itself. Everyone picks the one they believe. Find the truth and you score; every friend who falls for your lie scores for you too. Points grow each round, so nobody is out of it until the last question.</p>
<h2>A question from the game</h2>
${example('Sea otters ____ while they sleep, so they don\'t drift apart',
    'Say Dan writes "snore", Maya writes "tie their tails together" and Sam writes "sing". The truth: hold hands. Whoever picked "tie their tails together" just gave Maya points, and every couple in the cabin is now looking at each other.')}
<h2>Why it suits a weekend away</h2>
<ul>
  <li><strong>A grown-up game, in the good sense.</strong> You don't need trivia, you need a straight face and to know your friends. After ten years, everyone knows who can't keep one.</li>
  <li><strong>Everyone on their own phone, all in one game.</strong> Nobody reads cards aloud and nobody waits for a turn.</li>
  <li><strong>Up to 12 players.</strong> Couples can play as a team on one phone, or against each other.</li>
  <li><strong>One game or all night.</strong> A game of 5 questions takes about ten minutes. "Rematch" starts another with the same players and new questions.</li>
  <li><strong>A TV in the cabin?</strong> Open bullshit.wtf on a laptop connected to it, click "Present" and type the PIN. Questions and scores go on the big screen; phones are for writing and picking.</li>
</ul>
<h2>Make it the weekend's tradition</h2>
<p>At the end of a game you can save the group as a crew. The crew gets its own page, with standings that carry over from game to game, so whoever wins at the cabin this winter has to defend the title next summer. And every game ends by naming the biggest bullshitter: whoever fooled the most friends.</p>
<h2>Good to know first</h2>
<ul>
  <li><strong>Each phone needs internet.</strong> If the signal at the cabin is weak, check the Wi-Fi before you start.</li>
  <li><strong>The name is a swear word</strong>, and it is on the screens. The questions are strange facts from all over the world, not adult ones. What you type is up to you.</li>
</ul>
${startEn('Start a weekend game')}
<p>The full rules are on <a href="/how-to-play">How to play</a>. A pre-wedding weekend? See <a href="/bachelorette-party-game">the bachelorette and bachelor party page</a>.</p>`;

module.exports = {
    pages: (en, he) => [
        {
            path: '/he/bachelorette', twin: '/bachelorette-party-game', site: he, tag: 'party-bachelorette-he',
            start: { href: '/create-game?lang=he&pack=party', label: 'פותחים משחק למסיבה' },
            image: '/assets/og-bachelorette-he.png',
            title: 'משחק למסיבת רווקות ורווקים: בולשיט, חינם בטלפון',
            description: 'מי משקרת הכי טוב? בולשיט הוא משחק בלוף חינמי שכל אחת משחקת מהטלפון שלה, בצימר, בבית או בדרך לבר. עד 12 במשחק, בלי הורדה.',
            h1: 'משחק למסיבת רווקות (וגם לרווקים)',
            body: bacheloretteHe,
        },
        {
            path: '/he/adult-birthday', twin: '/adult-birthday-party-game', site: he, tag: 'party-birthday-he',
            start: { href: '/create-game?lang=he&pack=party', label: 'פותחים משחק ליום הולדת' },
            image: '/assets/og-birthday-he.png',
            title: 'משחק ליום הולדת למבוגרים: בולשיט, חינם בטלפון',
            description: 'משחק שמחבר בין המשפחה, החברים והקולגות בתוך דקה: כל אחד ממציא שקר מהטלפון שלו, וכולם מחפשים את האמת. חינם, בדפדפן, עד 12 במשחק.',
            h1: 'משחק ליום הולדת של מבוגרים',
            body: birthdayHe,
        },
        {
            path: '/he/friends-weekend', twin: '/weekend-away-games', site: he, tag: 'party-weekend-he',
            start: { href: '/create-game?lang=he&pack=party', label: 'פותחים משחק לסופ"ש' },
            image: '/assets/og-weekend-he.png',
            title: 'משחק חברה למבוגרים לסופ"ש בצימר: בולשיט',
            description: 'סופ"ש בצימר או בווילה עם החבר\'ה? בולשיט הוא משחק בלוף וטריוויה חינמי שכל אחד משחק מהטלפון שלו. לא צריך לארוז קופסה, רק מטען.',
            h1: 'משחק חברה למבוגרים, לסופ"ש בצימר עם החבר\'ה',
            body: weekendHe,
        },
        {
            path: '/bachelorette-party-game', twin: '/he/bachelorette', site: en, tag: 'party-bachelorette-en',
            start: { href: '/create-game?lang=en&pack=party', label: 'Start a party game' },
            image: '/assets/og-bachelorette-en.png',
            title: 'Bachelorette party game on your phones, free · Bullshit',
            description: 'Who lies best? Bullshit is a free bluffing game everyone plays on their own phone, at the rental or before going out. Up to 12 players, no app.',
            h1: 'A bachelorette (and bachelor) party game',
            body: bacheloretteEn,
        },
        {
            path: '/adult-birthday-party-game', twin: '/he/adult-birthday', site: en, tag: 'party-birthday-en',
            start: { href: '/create-game?lang=en&pack=party', label: 'Start a birthday game' },
            image: '/assets/og-birthday-en.png',
            title: 'Birthday party game for adults, on phones · Bullshit',
            description: 'A game that gets family, old friends and colleagues laughing in a minute: everyone writes a lie on their phone and hunts for the truth. Free, no app.',
            h1: 'A party game for a grown-up birthday',
            body: birthdayEn,
        },
        {
            path: '/weekend-away-games', twin: '/he/friends-weekend', site: en, tag: 'party-weekend-en',
            start: { href: '/create-game?lang=en&pack=party', label: 'Start a weekend game' },
            image: '/assets/og-weekend-en.png',
            title: 'Games for a cabin weekend with friends · Bullshit',
            description: 'A cabin or lake-house weekend with friends? Bullshit is a free bluffing trivia game everyone plays on their own phone. Nothing to pack but a charger.',
            h1: 'A game for a weekend away with friends',
            body: weekendEn,
        },
    ],
};
