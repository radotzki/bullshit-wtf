// A kit for people who lead a room: teachers and youth leaders, and team leads at work. One page
// per audience in each language, twins of each other. Each page carries its own tag on its Start
// button (kit-<lang>-<audience>), so a game opened from it is counted for that audience.
//
// Say only what the game really does (read in the code, November 2026):
// - up to 12 players a game, and the phone that opens it is one of them; a thirteenth is told it is full;
// - only the phone that opened the game can press Start;
// - 25 seconds to write a lie, 20 to pick, a phase ends early when every phone has answered;
// - a big screen (Present / מסך on a computer, the game's PIN typed in) shows the lobby with the
//   PIN and a QR code, the questions, the answers, who picked what and the scores, and plays sounds;
// - nicknames with slurs or sex words are swapped for a harmless name; lies are shown as typed;
// - an empty lobby offers the host five quick questions alone, picking only, no writing;
// - a game of five questions takes five to ten minutes of play.
// Nothing about sources, grades, accounts for classes, or more than 12 seats: the game has none.

const classroomEn = `
<p><strong>The game in one line:</strong> a strange true fact appears with a blank, everyone writes a lie to fill it, and then everyone tries to find the truth among all the lies.</p>
<p>Bullshit runs in the browser, on phones. It is free, there is nothing to install, and nobody signs up: the game asks for a nickname and nothing else. One game takes up to 12 phones, and a projector can show it to the whole room. This page is for teachers and youth leaders: how to put it on the projector, how to split a class, and which settings fit a 15-minute slot.</p>
<!--start-->
<h2>Before the lesson</h2>
<ul>
  <li><strong>Try it once yourself.</strong> Open a game, and in the empty lobby tap "Try 5 quick questions alone". You will see five of the game's questions. They are odd true facts about the world and were not written for children, so check that they suit your group.</li>
  <li><strong>A word on the name.</strong> In English, "bullshit" is a swear word, and it is on the screens, including the "biggest bullshitter" title at the end. Decide whether that is fine for your class before it goes up on the projector.</li>
  <li><strong>Agree on one rule.</strong> The game swaps nicknames with slurs or sex words for a harmless name. It does not change the lies: they appear on the big screen exactly as they were typed. Say before the first question that a rude lie is out.</li>
  <li><strong>Phones.</strong> Each team needs one phone with a browser and an internet connection.</li>
</ul>
<h2>Putting it on the projector</h2>
<ol>
  <li>On your phone, tap "Start a class game" on this page, choose the language of the questions and how many questions, and tap "Create". Type a nickname, and you are in the lobby with the game's four-letter PIN.</li>
  <li>On the classroom computer, open <bdi dir="ltr">bullshit.wtf</bdi>, click "Present" and type the PIN. The projector now shows the lobby, with the PIN and a QR code.</li>
  <li>Students scan the QR code on the projector, or open <bdi dir="ltr">bullshit.wtf</bdi> on a phone, tap "Join Game" and type the PIN. Each team picks a nickname of up to 9 letters: a team name works well.</li>
  <li>When everyone is in, tap "Start" on your phone. Only the phone that opened the game can start it.</li>
</ol>
<p>From then on the projector shows the question, all the answers, who picked what, and the scores. Phones are only for writing and picking, so heads stay up. The big screen also plays sounds: music in the lobby, a ticking clock, a sound for each answer revealed. Set the speakers to suit the room.</p>
<h2>A room of 12 to 40: split it into teams</h2>
<p>A game takes 12 phones at most, and the phone that opens it is one of the 12. A thirteenth phone is told the game is full. Two ways to fit a bigger room:</p>
<ul>
  <li><strong>One game, a phone per team.</strong> Split the class into up to 12 teams of three or four, one phone each. If you play from your phone too, you are one of the 12; or let one team open the game on its phone and start it when you say. Each team whispers over its lie and argues over the truth, and the whole room watches one screen. This is the way to go with one projector.</li>
  <li><strong>Several games, one per table of up to 12.</strong> Each table opens its own game on one phone and gets its own PIN, and everyone plays on their own phone. Only one game can be on the projector, so the other tables play on their phones alone. At the end, each table's winner can join one last game on the projector: a final.</li>
</ul>
<h2>Which settings fit 15 minutes</h2>
<table>
  <tr><th>Time you have</th><th>Choose</th></tr>
  <tr><td>15 minutes</td><td>5 questions. Five to ten minutes of play, a few minutes for everyone to join, and time to talk about the best lie.</td></tr>
  <tr><td>20 to 30 minutes</td><td>7 or 9 questions, or two games of 5: "Rematch" at the end starts a new game with the same players and new questions.</td></tr>
</table>
<p>Each question gives 25 seconds to write a lie and 20 seconds to pick an answer, and moves on as soon as every phone has answered. With a projector the answers are revealed more slowly, one at a time, so the room can read them. The first question of a game is an easier one, so the room learns the game on it. There are three rounds, and points grow each round, so a team that starts badly can still win.</p>
<h2>What the class gets out of it</h2>
<ul>
  <li><strong>Everyone starts equal.</strong> Nobody is meant to know these facts. A quiet student who writes a believable lie can beat the class expert.</li>
  <li><strong>A short talk about truth.</strong> The last screen shows each team's best lie and how many it fooled. Ask the room why that lie sounded true. It is a quick way into how false claims are made to look believable.</li>
  <li><strong>Writing to a reader.</strong> A good lie matches the style of the question and the people who will read it: a number for a number, a name for a name.</li>
  <li><strong>Talking in teams.</strong> Three or four students have 25 seconds to agree on one lie, and 20 to agree on one answer.</li>
</ul>
<p>The full rules and points are on <a href="/how-to-play">How to play</a>. The game is also good for <a href="/team-building-game">a team at work</a>.</p>`;

const classroomHe = `
<p><strong>המשחק בשורה אחת:</strong> מופיעה עובדה אמיתית ומוזרה עם חלק חסר, כל אחד ממציא תשובה שקרית שתשלים אותה, ואז כולם מנסים למצוא את האמת בין כל השקרים.</p>
<p>בולשיט רץ בדפדפן של הטלפון. הוא חינמי, אין מה להתקין, ואין הרשמה: המשחק מבקש כינוי ותו לא. במשחק אחד יכולים להשתתף עד 12 טלפונים, והמקרן מציג אותו לכל הכיתה. העמוד הזה נכתב למורים ולמדריכים: איך מציגים את המשחק על המקרן, איך מחלקים כיתה, ואילו הגדרות מתאימות לרבע שעה.</p>
<!--start-->
<h2>לפני השיעור</h2>
<ul>
  <li><strong>מנסים פעם אחת לבד.</strong> פותחים משחק, ובלובי הריק לוחצים על "לנסות לבד 5 שאלות מהירות". כך רואים חמש שאלות מהמשחק. אלה עובדות אמיתיות ומשונות על העולם, והן לא נכתבו במיוחד לילדים, אז כדאי לבדוק שהן מתאימות לקבוצה.</li>
  <li><strong>קובעים כלל אחד מראש.</strong> כינוי עם עלבון גזעני או מילה מינית מוחלף אוטומטית בכינוי תמים. את השקרים המשחק לא משנה: הם מופיעים על המסך הגדול בדיוק כפי שהוקלדו. כדאי לקבוע לפני השאלה הראשונה: בלי שקרים גסים.</li>
  <li><strong>טלפונים.</strong> כל צוות צריך טלפון אחד עם דפדפן וחיבור לאינטרנט.</li>
</ul>
<h2>איך מציגים על המקרן</h2>
<ol>
  <li>בטלפון שלכם לוחצים על "פותחים משחק לכיתה" בעמוד הזה, בוחרים את שפת השאלות ואת מספר השאלות, ולוחצים על "פתיחת משחק". מקלידים כינוי, ונכנסים ללובי, שבו מופיע קוד המשחק בן ארבע האותיות.</li>
  <li>במחשב של הכיתה פותחים את <bdi dir="ltr">bullshit.wtf/he</bdi>, לוחצים על "מסך" ומקלידים את קוד המשחק. עכשיו המקרן מציג את הלובי, עם הקוד וקוד QR.</li>
  <li>התלמידים סורקים את קוד ה-QR מהמקרן, או פותחים בטלפון את <bdi dir="ltr">bullshit.wtf/he</bdi>, בוחרים "הצטרפות למשחק" ומקלידים את הקוד. כל צוות בוחר כינוי של עד 9 אותיות, ושם הצוות הוא כינוי מצוין.</li>
  <li>כשכולם בפנים, לוחצים בטלפון שלכם על "מתחילים". רק הטלפון שפתח את המשחק יכול להתחיל אותו.</li>
</ol>
<p>מכאן המקרן מציג את השאלה, את כל התשובות, מי בחר במה ואת הניקוד. הטלפונים משמשים רק לכתיבה ולבחירה, כך שכולם מסתכלים קדימה. המסך הגדול גם משמיע צלילים: מוזיקה בלובי, שעון מתקתק וצליל לכל תשובה שנחשפת. כדאי לכוון את עוצמת הרמקולים מראש.</p>
<h2>כיתה של 12 עד 40: מחלקים לצוותים</h2>
<p>במשחק אחד יש מקום ל-12 טלפונים לכל היותר, והטלפון שפותח את המשחק הוא אחד מהם. הטלפון ה-13 מקבל הודעה שהמשחק מלא. יש שתי דרכים להכניס קבוצה גדולה יותר:</p>
<ul>
  <li><strong>משחק אחד, טלפון לכל צוות.</strong> מחלקים את הכיתה לעד 12 צוותים של שלושה או ארבעה, טלפון אחד לכל צוות. אם גם אתם משחקים מהטלפון שלכם, אתם אחד מה-12. אפשר גם לתת לאחד הצוותים לפתוח את המשחק בטלפון שלו ולהתחיל כשתגידו. כל צוות מתלחש על השקר שלו ומתווכח על האמת, וכל הכיתה מסתכלת על מסך אחד. כשיש מקרן אחד, זו הדרך הכי טובה.</li>
  <li><strong>כמה משחקים, אחד לכל שולחן של עד 12.</strong> כל שולחן פותח משחק משלו בטלפון אחד ומקבל קוד משלו, וכל אחד משחק מהטלפון שלו. על המקרן אפשר להציג רק משחק אחד, אז שאר השולחנות משחקים בטלפונים בלבד. בסוף, המנצחים של כל שולחן יכולים להצטרף למשחק אחרון על המקרן: גמר.</li>
</ul>
<h2>אילו הגדרות מתאימות לרבע שעה</h2>
<table>
  <tr><th>הזמן שיש לכם</th><th>מה בוחרים</th></tr>
  <tr><td>רבע שעה</td><td>5 שאלות. בין חמש לעשר דקות של משחק, כמה דקות עד שכולם מצטרפים, וזמן לדבר על השקר הכי טוב.</td></tr>
  <tr><td>20 עד 30 דקות</td><td>7 או 9 שאלות, או שני משחקים של 5: "משחק חוזר" בסוף פותח משחק חדש עם אותם שחקנים ושאלות חדשות.</td></tr>
</table>
<p>בכל שאלה יש 25 שניות לכתוב שקר ו-20 שניות לבחור תשובה, והמשחק ממשיך ברגע שכל הטלפונים ענו. כשיש מקרן, התשובות נחשפות לאט יותר, אחת אחת, כדי שכל הכיתה תספיק לקרוא. השאלה הראשונה בכל משחק קלה יותר, כך שלומדים את המשחק תוך כדי. יש שלושה סיבובים, והנקודות גדלות מסיבוב לסיבוב, אז גם צוות שהתחיל רע יכול לנצח.</p>
<h2>מה הכיתה מרוויחה</h2>
<ul>
  <li><strong>כולם מתחילים מאותה נקודה.</strong> אף אחד לא אמור להכיר את העובדות האלה. מי ששקט בדרך כלל וכותב שקר משכנע יכול לנצח את מי שיודע הכי הרבה.</li>
  <li><strong>שיחה קצרה על אמת.</strong> המסך האחרון מראה את השקר הכי טוב של כל צוות וכמה נפלו בו. שואלים את הכיתה למה דווקא השקר הזה נשמע אמיתי. זו דרך קצרה להתחיל לדבר על איך בונים טענה שקרית שנראית אמינה.</li>
  <li><strong>שיעור אנגלית.</strong> יש שאלות בעברית ובאנגלית. בוחרים אנגלית בשפת המשחק, והצוותים קוראים, כותבים ומתווכחים באנגלית.</li>
  <li><strong>עבודת צוות.</strong> לשלושה או ארבעה תלמידים יש 25 שניות להסכים על שקר אחד, ו-20 שניות להסכים על תשובה אחת.</li>
  <li><strong>גם בתנועת הנוער.</strong> אותו מבנה מתאים לפעולה: צוותים, מקרן או טלוויזיה, ורבע שעה בפתיחה או בסיום.</li>
</ul>
<p>כל החוקים והניקוד נמצאים ב<a href="/he/how-to-play">איך משחקים</a>. המשחק מתאים גם ל<a href="/he/team-building">גיבוש של צוות בעבודה</a>.</p>`;

const teamEn = `
<p><strong>The game in one line:</strong> a strange true fact appears with a blank, everyone writes a lie to fill it, and then everyone tries to find the truth among all the lies.</p>
<p>Bullshit runs in the browser, on phones. It is free, there is nothing to install, and nobody signs up: the game asks for a nickname and nothing else. One game takes up to 12 phones, and the screen in the meeting room can show it to everyone. This page is for team leads who want 15 minutes of something that is not a status update: how to run it on a big screen, how to split a large team, and which settings fit the slot.</p>
<!--start-->
<h2>Before the meeting</h2>
<ul>
  <li><strong>Try it once yourself.</strong> Open a game, and in the empty lobby tap "Try 5 quick questions alone" to see five of the game's questions.</li>
  <li><strong>A word on the name.</strong> In English, "bullshit" is a swear word, and it is on the screens. In most teams that is the joke; you know yours.</li>
  <li><strong>The lies go up on the screen as typed.</strong> The game swaps rude nicknames for a harmless one, but it does not touch the lies. If the room includes people who would mind, say so before the first question.</li>
</ul>
<h2>Putting it on the big screen</h2>
<ol>
  <li>On your phone, tap "Start a team game" on this page, choose the language of the questions and how many questions, and tap "Create". Type a nickname, and you are in the lobby with the game's four-letter PIN.</li>
  <li>On the computer connected to the screen, open <bdi dir="ltr">bullshit.wtf</bdi>, click "Present" and type the PIN. The screen now shows the lobby, with the PIN and a QR code.</li>
  <li>Everyone scans the QR code, or opens <bdi dir="ltr">bullshit.wtf</bdi> on a phone, taps "Join Game" and types the PIN, then picks a nickname of up to 9 letters.</li>
  <li>When everyone is in, tap "Start" on your phone. Only the phone that opened the game can start it.</li>
</ol>
<p>The big screen shows the question, all the answers, who picked what, and the scores, and plays sounds: music in the lobby, a ticking clock, a sound for each answer revealed. Phones are only for writing and picking.</p>
<p><strong>On a video call?</strong> Everyone can join with the PIN from wherever they are. The person who shares their screen opens the big screen view as above, so the whole call sees the same questions and scores.</p>
<h2>More than 12 people</h2>
<p>A game takes 12 phones at most, and the phone that opens it is one of the 12. A thirteenth phone is told the game is full.</p>
<ul>
  <li><strong>Up to about 40: pairs or small teams on one phone.</strong> Up to 12 teams of two to four, one phone each, all in one game on one screen. Mixing people who rarely work together is the point.</li>
  <li><strong>Several tables, one game each.</strong> Each table of up to 12 opens its own game and gets its own PIN; only one of them can be on the big screen. Each table's winner then plays a final on the big screen.</li>
</ul>
<h2>Which settings fit 15 minutes</h2>
<table>
  <tr><th>Time you have</th><th>Choose</th></tr>
  <tr><td>15 minutes</td><td>5 questions. Five to ten minutes of play and a few minutes for everyone to join.</td></tr>
  <tr><td>30 minutes, an offsite or a team evening</td><td>7 or 9 questions, or two games of 5: "Rematch" at the end starts a new game with the same players and new questions.</td></tr>
</table>
<p>Each question gives 25 seconds to write a lie and 20 seconds to pick an answer, and moves on as soon as every phone has answered. With a big screen the answers are revealed more slowly, one at a time, so the room can read them. There are three rounds, and points grow each round, so nobody is out of it until the end.</p>
<h2>Why it works for a team</h2>
<ul>
  <li><strong>Nobody needs to know anything.</strong> The facts are strange enough that the new hire and the old hand start from the same place. What wins is knowing how your colleagues think.</li>
  <li><strong>Everyone plays at once.</strong> No one waits for a turn, and quiet people play as much as loud ones.</li>
  <li><strong>It ends with a story.</strong> The last screen shows each player's best lie and how many it fooled, and crowns the room's biggest bullshitter.</li>
</ul>
<p>The full rules and points are on <a href="/how-to-play">How to play</a>. Teachers and youth leaders: see <a href="/classroom-game">the classroom page</a>.</p>`;

const teamHe = `
<p><strong>המשחק בשורה אחת:</strong> מופיעה עובדה אמיתית ומוזרה עם חלק חסר, כל אחד ממציא תשובה שקרית שתשלים אותה, ואז כולם מנסים למצוא את האמת בין כל השקרים.</p>
<p>בולשיט רץ בדפדפן של הטלפון. הוא חינמי, אין מה להתקין, ואין הרשמה: המשחק מבקש כינוי ותו לא. במשחק אחד יכולים להשתתף עד 12 טלפונים, והמסך בחדר הישיבות מציג אותו לכולם. העמוד הזה נכתב לראשי צוותים שרוצים רבע שעה של משהו שהוא לא עוד עדכון סטטוס: איך מציגים את המשחק על מסך גדול, איך מחלקים צוות גדול, ואילו הגדרות מתאימות לזמן שיש.</p>
<!--start-->
<h2>לפני הישיבה</h2>
<ul>
  <li><strong>מנסים פעם אחת לבד.</strong> פותחים משחק, ובלובי הריק לוחצים על "לנסות לבד 5 שאלות מהירות" כדי לראות חמש שאלות מהמשחק.</li>
  <li><strong>השקרים עולים למסך כפי שהוקלדו.</strong> המשחק מחליף כינויים גסים בכינוי תמים, אבל את השקרים הוא לא משנה. אם יש בחדר מי שזה יפריע לו, כדאי להגיד את זה לפני השאלה הראשונה.</li>
</ul>
<h2>איך מציגים על המסך הגדול</h2>
<ol>
  <li>בטלפון שלכם לוחצים על "פותחים משחק לצוות" בעמוד הזה, בוחרים את שפת השאלות ואת מספר השאלות, ולוחצים על "פתיחת משחק". מקלידים כינוי, ונכנסים ללובי, שבו מופיע קוד המשחק בן ארבע האותיות.</li>
  <li>במחשב שמחובר למסך פותחים את <bdi dir="ltr">bullshit.wtf/he</bdi>, לוחצים על "מסך" ומקלידים את קוד המשחק. עכשיו המסך מציג את הלובי, עם הקוד וקוד QR.</li>
  <li>כולם סורקים את קוד ה-QR, או פותחים בטלפון את <bdi dir="ltr">bullshit.wtf/he</bdi>, בוחרים "הצטרפות למשחק", מקלידים את הקוד ובוחרים כינוי של עד 9 אותיות.</li>
  <li>כשכולם בפנים, לוחצים בטלפון שלכם על "מתחילים". רק הטלפון שפתח את המשחק יכול להתחיל אותו.</li>
</ol>
<p>המסך הגדול מציג את השאלה, את כל התשובות, מי בחר במה ואת הניקוד, ומשמיע צלילים: מוזיקה בלובי, שעון מתקתק וצליל לכל תשובה שנחשפת. הטלפונים משמשים רק לכתיבה ולבחירה.</p>
<p><strong>בשיחת וידאו?</strong> כל אחד יכול להצטרף עם הקוד מאיפה שהוא נמצא. מי שמשתף מסך פותח את תצוגת המסך הגדול כמו למעלה, וכך כל המשתתפים בשיחה רואים את אותן שאלות ואותו ניקוד.</p>
<h2>יותר מ-12 אנשים</h2>
<p>במשחק אחד יש מקום ל-12 טלפונים לכל היותר, והטלפון שפותח את המשחק הוא אחד מהם. הטלפון ה-13 מקבל הודעה שהמשחק מלא.</p>
<ul>
  <li><strong>עד כ-40: זוגות או צוותים קטנים על טלפון אחד.</strong> עד 12 צוותים של שניים עד ארבעה, טלפון אחד לכל צוות, כולם במשחק אחד על מסך אחד. זו גם הזדמנות לערבב אנשים שלא עובדים יחד בדרך כלל.</li>
  <li><strong>כמה שולחנות, משחק לכל שולחן.</strong> כל שולחן של עד 12 פותח משחק משלו ומקבל קוד משלו, ורק אחד מהם יכול להיות על המסך הגדול. בסוף, המנצחים של כל שולחן משחקים גמר על המסך הגדול.</li>
</ul>
<h2>אילו הגדרות מתאימות לרבע שעה</h2>
<table>
  <tr><th>הזמן שיש לכם</th><th>מה בוחרים</th></tr>
  <tr><td>רבע שעה</td><td>5 שאלות. בין חמש לעשר דקות של משחק, וכמה דקות עד שכולם מצטרפים.</td></tr>
  <tr><td>חצי שעה, ביום גיבוש או בערב צוות</td><td>7 או 9 שאלות, או שני משחקים של 5: "משחק חוזר" בסוף פותח משחק חדש עם אותם שחקנים ושאלות חדשות.</td></tr>
</table>
<p>בכל שאלה יש 25 שניות לכתוב שקר ו-20 שניות לבחור תשובה, והמשחק ממשיך ברגע שכל הטלפונים ענו. כשיש מסך גדול, התשובות נחשפות לאט יותר, אחת אחת, כדי שכל החדר יספיק לקרוא. יש שלושה סיבובים, והנקודות גדלות מסיבוב לסיבוב, אז אף אחד לא בחוץ עד הסוף.</p>
<h2>למה זה עובד בצוות</h2>
<ul>
  <li><strong>לא צריך לדעת כלום.</strong> העובדות מוזרות מספיק כדי שמי שהצטרף אתמול ומי שנמצא כאן עשר שנים יתחילו מאותה נקודה. מה שמנצח זה להכיר איך הקולגות חושבים.</li>
  <li><strong>כולם משחקים בבת אחת.</strong> אף אחד לא מחכה לתור, והשקטים משחקים בדיוק כמו מי שמדבר הכי הרבה.</li>
  <li><strong>נגמר עם סיפור.</strong> המסך האחרון מראה את השקר הכי טוב של כל אחד וכמה נפלו בו, ומכתיר את "הבולשיטר הגדול" של החדר.</li>
</ul>
<p>כל החוקים והניקוד נמצאים ב<a href="/he/how-to-play">איך משחקים</a>. מורים ומדריכים ימצאו את <a href="/he/classroom">העמוד לכיתה</a>.</p>`;

module.exports = {
    pages: (en, he) => [
        {
            path: '/classroom-game', twin: '/he/classroom', site: en, tag: 'kit-en-teachers',
            start: { href: '/create-game?lang=en', label: 'Start a class game' },
            image: '/assets/og-image.png',
            title: 'A 15-minute classroom game on the projector: Bullshit, free bluffing trivia',
            description: 'For teachers and youth leaders: run Bullshit on a projector, split a class of up to 30 into teams, and fit a game into 15 minutes. Free, in the browser, no sign-up.',
            h1: 'A 15-minute game for the whole class',
            body: classroomEn,
        },
        {
            path: '/he/classroom', twin: '/classroom-game', site: he, tag: 'kit-he-teachers',
            start: { href: '/create-game?lang=he', label: 'פותחים משחק לכיתה' },
            image: '/assets/og-image-he.png',
            title: 'משחק לכיתה על המקרן, לרבע שעה: בולשיט, בלוף וטריוויה בחינם',
            description: 'למורים ולמדריכים: איך מציגים את בולשיט על המקרן, איך מחלקים כיתה של עד 30 לצוותים, ואיך משחק נכנס ברבע שעה. חינם, בדפדפן, בלי הרשמה.',
            h1: 'משחק של רבע שעה לכל הכיתה',
            body: classroomHe,
        },
        {
            path: '/team-building-game', twin: '/he/team-building', site: en, tag: 'kit-en-teams',
            start: { href: '/create-game?lang=en', label: 'Start a team game' },
            image: '/assets/og-image.png',
            title: 'A 15-minute team-building game on the big screen: Bullshit, free bluffing trivia',
            description: 'For team leads: run Bullshit on the meeting-room screen or a video call, split a team of up to 30, and fit a game into 15 minutes. Free, in the browser, no sign-up.',
            h1: 'A 15-minute team game for the meeting room',
            body: teamEn,
        },
        {
            path: '/he/team-building', twin: '/team-building-game', site: he, tag: 'kit-he-teams',
            start: { href: '/create-game?lang=he', label: 'פותחים משחק לצוות' },
            image: '/assets/og-image-he.png',
            title: 'משחק לגיבוש צוות, לרבע שעה על המסך: בולשיט, בלוף וטריוויה בחינם',
            description: 'לראשי צוותים: איך מציגים את בולשיט על המסך בחדר הישיבות או בשיחת וידאו, איך מחלקים צוות של עד 30, ואיך משחק נכנס ברבע שעה. חינם, בלי הרשמה.',
            h1: 'משחק של רבע שעה לגיבוש הצוות',
            body: teamHe,
        },
    ],
};
