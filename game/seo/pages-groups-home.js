// Search pages for the two sources the marketing plan ranks first (marketing drafts 6 and 7):
//  - groups that meet every week: a ready-made activity for youth counselors (/he/youth-group) and a
//    bonding evening (/he/gibush);
//  - families and friends at home together: /he/home-together, /he/days-at-home, /he/video-call,
//    /he/school-break, and in English /family-game-night, /video-call-party-game, /snow-day-games.
// Each Start button carries the page's own tag (?via=), so a game opened from the page is counted for it.
//
// Say only what is true of the game (November 2026): free, in the browser, up to 12 players a game,
// 5, 7 or 9 questions, three rounds where points grow, Hebrew and English questions, an optional big
// screen ("מסך" / "Present"), Rematch, saved crews, rude nicknames swapped for a harmless one. Each
// example is a real question of the game (functions/data/opening-questions.json) with its true answer;
// test/groups-home-pages.test.js fails if one leaves the file.
//
// /he/days-at-home is read on hard days too (closures, sick days, emergencies): calm and practical, no
// joke about why people are home, no war words in its title or picture, and the safe room once, in the
// questions at the end.
//
// The English pages turn the seasonal pack off (?pack=none), as the holiday pages do: from 1 to 13
// December the Create page would otherwise switch the Hanukkah questions on for everyone.

const example = (q, story) => `<div class="example">
  <p class="q">${q}</p>
  <p>${story}</p>
</div>`;

// The three steps, in the Hebrew site's own button names (test/groups-home-pages.test.js checks them).
const startHe = (button) => `<h2>איך מתחילים</h2>
<ol>
  <li>לוחצים על "${button}" בעמוד הזה, בוחרים 5, 7 או 9 שאלות ולוחצים על "פתיחת משחק".</li>
  <li>מופיע קוד של ארבע אותיות, ואיתו קישור הזמנה וקוד לסריקה. שולחים את הקישור בוואטסאפ, או שכולם נכנסים ל-<bdi dir="ltr">bullshit.wtf/he</bdi>, בוחרים "הצטרפות למשחק" ומקלידים את הקוד.</li>
  <li>כל אחד בוחר כינוי. כשכולם בפנים, מי שפתח את המשחק לוחץ על "מתחילים".</li>
</ol>`;

const startEn = (button) => `<h2>How to start</h2>
<ol>
  <li>Tap "${button}" on this page, choose English or Hebrew questions and 5, 7 or 9 questions, and tap "Create".</li>
  <li>The game shows a four-letter PIN, an invite link and a QR code. Send the link to the group chat, or everyone opens bullshit.wtf on their phone, taps "Join Game" and types the PIN.</li>
  <li>Everyone picks a nickname. When everyone is in, the person who opened the game taps "Start".</li>
</ol>`;

// The counselor-to-counselor share (draft 6, message C): short on purpose so it survives forwarding,
// and tagged wa-he-madrichim so games that come from it can be told apart from the page's own Start button.
const waMadrichimText = [
    'מדריכים, יש לי פעולה מוכנה לשבוע הבא 👇',
    'בולשיט: משחק בטלפונים. מופיעה עובדה מוזרה עם מילה חסרה, כל חניך ממציא תשובה, וכולם מחפשים את האמת בין השקרים. החניכים מתים על החלק של "מי הצליח לעבוד על המדריך".',
    'חינם, בלי הורדה, עד 12 במשחק, מקרינים על הקיר. יש גם מערך של 40 דקות עם שיחה על אמון ופייק ניוז:',
    'https://bullshit.wtf/he/youth-group?via=wa-he-madrichim',
].join('\n');
const waMadrichim = 'https://wa.me/?text=' + encodeURIComponent(waMadrichimText);

const youth = `
<p>צריכים פעולה לשבוע הבא ואין זמן להכין? בולשיט הוא משחק קבוצתי בטלפונים שעובד גם על השכבה הכי קשה: מופיעה עובדה אמיתית ומוזרה עם מילה חסרה, כל חניך כותב תשובה מומצאת שנשמעת אמינה, ואז כל התשובות עולות ביחד וכולם מחפשים את האמת. נקודות על מציאת האמת, ועוד נקודות על כל מי שנפל בשקר שלך. החלק שחניכים הכי אוהבים: לגלות מי הצליח לעבוד על המדריך.</p>
<p><strong>מתכננים את הפעולה של שבוע חנוכה?</strong> יש <a href="/he/hanukkah-activity">פעולת חנוכה מוכנה ל-45 דקות</a>, עם שאלות חנוכה במשחק, שיחת סיכום וגרסה להדפסה.</p>
<!--start-->
<h2>מה צריך</h2>
<ul>
  <li><strong>טלפון לכל חניך, או טלפון לכל זוג.</strong> המשחק רץ בדפדפן: אין אפליקציה, אין הרשמה ואין מה להוריד.</li>
  <li><strong>מקרן או טלוויזיה, אם יש.</strong> לא חובה, אבל זה הופך את המשחק לפעולה של כל החדר. פותחים במחשב שמחובר למקרן את <bdi dir="ltr">bullshit.wtf/he</bdi>, לוחצים על "מסך" ומקלידים את קוד המשחק. על הקיר מופיעים השאלות, התשובות, מי נפל במה והניקוד.</li>
  <li><strong>אינטרנט.</strong> רשת של המקום או הטלפונים של החניכים.</li>
</ul>
<h2>מערך פעולה של 40 דקות</h2>
<table>
  <tr><th>דקות</th><th>מה עושים</th></tr>
  <tr><td style="white-space: nowrap">0–5</td><td>פתיחה: "מי פה הכי טוב בלשקר?" כל חניך אומר משפט אחד על עצמו, אמת או שקר, והשאר מנחשים.</td></tr>
  <tr><td style="white-space: nowrap">5–8</td><td>המדריך פותח משחק, בוחר משחק של 5 שאלות ומקרין אותו. החניכים סורקים את הקוד או מקלידים אותו.</td></tr>
  <tr><td style="white-space: nowrap">8–17</td><td>משחק ראשון, 5 שאלות.</td></tr>
  <tr><td style="white-space: nowrap">17–22</td><td>עצירה קצרה: מי כתב את השקר הכי טוב? איך הוא גרם לכם להאמין לו?</td></tr>
  <tr><td style="white-space: nowrap">22–31</td><td>לוחצים על "משחק חוזר": משחק שני עם אותם שחקנים ושאלות חדשות. המשחק החוזר באורך של הראשון, אז שוב 5 שאלות.</td></tr>
  <tr><td style="white-space: nowrap">31–38</td><td>שיחה: למה האמנו לשקר? מה גורם למשהו להישמע אמין? ובשכבות הבוגרות: איפה אנחנו נופלים בזה ברשת ובחדשות?</td></tr>
  <tr><td style="white-space: nowrap">38–40</td><td>סיכום: המסך האחרון מכתיר את "הבולשיטר הגדול" של הערב. מי רוצה לשחק את זה בבית בשישי?</td></tr>
</table>
<p>השיחה בסוף הופכת משחק לפעולה עם נושא: אמון, שכנוע ופייק ניוז. זה גם מה שאפשר לספר לרכז.</p>
${example('ב-1932 הצבא האוסטרלי יצא למלחמה נגד ____, והפסיד',
    'נניח שנועה כותבת "קנגורו", איתי כותב "ארנבים" והמדריך כותב "כרישים". הכול נשמע הגיוני לגמרי בשביל אוסטרליה. התשובה האמיתית: ציפורי אמו. ומי שבחר ב"קנגורו" פשוט נתן לנועה נקודות.')}
<h2>קבוצה גדולה?</h2>
<ul>
  <li><strong>12 מקומות במשחק, והמדריך תופס אחד.</strong> מי שפותח את המשחק משחק בו (וגם כותב שקרים), אז נשארים 11 מקומות: עד 11 חניכים, כל אחד מהטלפון שלו.</li>
  <li><strong>12 עד 22: זוגות. 23 עד 33: שלישיות.</strong> כל צוות על טלפון אחד, ובמקום כינוי כותבים שם של צוות. ההתייעצות בלחש על השקר היא חצי מהכיף.</li>
  <li><strong>המדריך לא משחק?</strong> פותחים את המשחק במחשב שמחובר למקרן ובלובי לוחצים על "להפוך למסך הגדול". המחשב נהיה המסך, והמקום של המדריך מתפנה: 12 מקומות לחניכים, עד 24 בזוגות. מי שלא מצטרף מהטלפון לא תופס מקום.</li>
  <li><strong>שכבה גדולה:</strong> שני משחקים במקביל עם שני מדריכים, ותחרות בין הקבוצות על הניקוד.</li>
  <li><strong>מעט טלפונים בחדר?</strong> צוותים של שלושה או ארבעה על טלפון אחד, והמשחק על המקרן.</li>
</ul>
<h2>שאלות של מדריכים</h2>
<ul>
  <li><strong>בעברית או באנגלית?</strong> בשתיהן. בוחרים את שפת השאלות כשפותחים משחק.</li>
  <li><strong>מאיזה גיל?</strong> מכיתה ז' בערך. השאלות הן עובדות כלליות ומשונות, ולא נכתבו במיוחד לילדים, אז כדאי לשחק משחק אחד עם חברים או בבית לפני הפעולה ולהתרשם. אפשר גם לפתוח משחק וללחוץ בלובי הריק על "לנסות לבד 5 שאלות מהירות".</li>
  <li><strong>יש צ'אט או פרסומות?</strong> לא. אין צ'אט, אין פרסומות ואין איסוף פרטים: רק כינוי. כינויים פוגעניים מוחלפים אוטומטית בכינוי תמים. התשובות עצמן עולות כמו שנכתבו, אז שווה לסכם מראש מה מותר לכתוב.</li>
  <li><strong>והשם?</strong> "בולשיט" זה שם המשחק, והוא מופיע על המסכים. רוב החניכים יצחקו. אתם מכירים את השכבה שלכם.</li>
</ul>
${startHe('פותחים משחק לקבוצה')}
<h2>הפעלתם? ספרו למדריכים אחרים</h2>
<p>אם זה עבד, שלחו את העמוד הזה בקבוצת המדריכים. רוצים להפעיל את זה בכיתה? יש גם <a href="/he/classroom">עמוד למורים</a>, ולערב של כל המחזור יש <a href="/he/gibush">משחק לערב גיבוש</a>. החוקים המלאים נמצאים ב<a href="/he/how-to-play">איך משחקים</a>.</p>
<p class="cta"><a class="btn secondary" href="${waMadrichim}">שליחה למדריכים בוואטסאפ</a></p>`;

const gibush = `
<p>ערב גיבוש צריך משהו שכולם משחקים, לא רק החמישה שתמיד מדברים. בולשיט הוא משחק כזה: כל אחד מהטלפון שלו, בלי קופסה, בלי הכנה ובלי מישהו שצריך להקריא שאלות. מופיעה עובדה אמיתית ומוזרה עם חלק חסר, כל אחד ממציא תשובה שתעבוד על האחרים, וכולם מחפשים את האמת. תוך כמה דקות כולם יודעים מי השקרן הכי טוב בקבוצה, ומי מאמין לכל דבר.</p>
<!--start-->
<h2>למי זה מתאים</h2>
<p>למכינות ולשנת שירות, לצוות חדש בעבודה, לקורס, לכיתה בסוף שנה, לקבוצת ספורט ולוועד סטודנטים. בכל מקום שיש בו קבוצה שמכירה קצת, ורוצה להכיר יותר. ככל שמכירים יותר טוב, השקרים נעשים יותר אישיים ויותר מצחיקים: שקר טוב נכתב בשביל מישהו מסוים בחדר.</p>
<h2>איך זה עובד</h2>
<ol>
  <li><strong>שאלה.</strong> על המסך מופיעה עובדה אמיתית ומשונה, ובמקום החלק הכי מעניין שלה יש קו ריק.</li>
  <li><strong>שקר.</strong> כל אחד כותב בשקט תשובה מומצאת, כזאת שנשמעת מספיק אמיתית.</li>
  <li><strong>האמת.</strong> כל התשובות מופיעות יחד: השקרים של כולם, כמה שקרים שהמשחק מוסיף בעצמו, והתשובה הנכונה. כל אחד בוחר. מי שמצא את האמת מקבל נקודות, ומי שעבד על חבר מקבל נקודות על כל אחד שנפל.</li>
</ol>
${example('לוטרות ים ____ כשהן ישנות, כדי לא להיסחף אחת מהשנייה',
    'נניח שהמפקדת כותבת "קושרות את עצמן לאצות", מישהו מהצוות כותב "שרות" ועוד מישהו כותב "צפות על הגב בעיגול". התשובה האמיתית: מחזיקות ידיים. שזה, בעצם, כל הרעיון של ערב גיבוש.')}
<h2>ערב של חצי שעה</h2>
<ul>
  <li><strong>משחק ראשון, 5 שאלות.</strong> בין חמש לעשר דקות. כולם לומדים את המשחק אחרי שאלה אחת.</li>
  <li><strong>הפסקה של חמש דקות.</strong> מי כתב את השקר הכי טוב? מי נפל הכי הרבה? המסך האחרון מראה את השקר הכי טוב של כל אחד ומכתיר את "הבולשיטר הגדול".</li>
  <li><strong>משחק שני, עוד 5 שאלות.</strong> לוחצים על "משחק חוזר" וממשיכים עם אותם שחקנים ושאלות חדשות. עכשיו כולם כבר יודעים על מי לשקר.</li>
</ul>
<h2>קבוצה של 20 ומעלה</h2>
<p>במשחק אחד משחקים עד 12 טלפונים. בקבוצה גדולה יותר משחקים בזוגות או בשלישיות, צוות על טלפון אחד עם שם של צוות בתור כינוי. ההתייעצות בלחש היא חלק מהגיבוש. אפשר גם לפתוח שני משחקים במקביל, אחד לכל חצי של החדר, ולהשוות ניקוד בסוף.</p>
<h2>המסך הגדול</h2>
<p>פותחים בטלוויזיה, במקרן או במחשב את <bdi dir="ltr">bullshit.wtf/he</bdi>, לוחצים על "מסך" ומקלידים את קוד המשחק. השאלות, התשובות, מי נפל בשקר של מי והניקוד מופיעים בגדול לכל החדר, עם מוזיקה. הטלפונים נשארים לכתיבה ולבחירה.</p>
${startHe('פותחים משחק לגיבוש')}
<h2>שאלות קצרות</h2>
<ul>
  <li><strong>כמה זה עולה?</strong> כלום. אין פרסומות במשחק ואין הרשמה.</li>
  <li><strong>צריך להוריד משהו?</strong> לא. המשחק רץ בדפדפן של הטלפון.</li>
  <li><strong>בעברית?</strong> כן, ויש גם שאלות באנגלית.</li>
  <li><strong>שומרים את הקבוצה?</strong> בסוף המשחק אפשר לתת לחבורה שם. מאותו רגע יש לה עמוד משלה, עם טבלת ניצחונות שנמשכת ממשחק למשחק.</li>
</ul>
<p>מדריכים בתנועת נוער? יש <a href="/he/youth-group">פעולה מוכנה עם מערך של 40 דקות</a>. צוות בעבודה? ראו <a href="/he/team-building">משחק לגיבוש צוות</a>.</p>`;

const homeTogether = `
<p>כולם בבית, כל אחד בטלפון שלו, ואף אחד לא ממש ביחד. בולשיט הופך את הטלפונים האלה למשחק אחד: מי שמארח פותח משחק, כל השאר מצטרפים עם קוד של ארבע אותיות, ותוך דקה כל הבית משחק. הוא חינמי, בעברית, רץ בדפדפן, ואין מה להוריד או לסדר אחר כך.</p>
<!--start-->
<h2>למה זה עובד כשכולם בבית</h2>
<p>כל אחד מחזיק את הטלפון שלו, אבל כולם משחקים באותו משחק ומסתכלים אחד על השני. על המסך מופיעה עובדה אמיתית ומוזרה עם חלק חסר. כל אחד כותב תשובה מומצאת שנשמעת אמינה, ואז כל התשובות מופיעות יחד עם האמת, וכל אחד בוחר במה שהוא מאמין. מקבלים נקודות על מציאת האמת, ועל כל אחד מבני הבית שנפל בשקר שלכם.</p>
${example('פליידו נמכר בהתחלה כחומר לניקוי ____',
    'נניח שאמא כותבת "שטיחים", הבן כותב "חלונות" והסבא כותב "מחבתות". הכול נשמע אמין. התשובה האמיתית: טפטים. ומי שבחר ב"חלונות" נתן לבן נקודות, והוא לא ייתן לכם לשכוח את זה.')}
<h2>כמה זמן ולאיזה גיל</h2>
<ul>
  <li><strong>10 עד 20 דקות לסיבוב.</strong> משחק של 5 שאלות לוקח בין חמש לעשר דקות. יש גם 7 ו-9 שאלות, ובסוף לוחצים על "משחק חוזר" וממשיכים עם אותם שחקנים ושאלות חדשות.</li>
  <li><strong>מגיל 10 בערך.</strong> צריך לכתוב תשובה קצרה, לא לדעת עובדות. אף אחד לא מכיר את העובדות האלה, אז גם סבא וסבתא וגם הילדים מתחילים מאותו מקום.</li>
  <li><strong>ילדים צעירים יותר</strong> משחקים בזוג עם הורה, על טלפון אחד.</li>
  <li><strong>עד 12 שחקנים</strong> במשחק אחד.</li>
</ul>
<h2>אפשר על הטלוויזיה</h2>
<p>פותחים בטלוויזיה או במחשב את <bdi dir="ltr">bullshit.wtf/he</bdi>, לוחצים על "מסך" ומקלידים את קוד המשחק. השאלות, התשובות והניקוד מופיעים בגדול, וגם מי שלא משחק יכול לצפות ולצעוק עצות גרועות. בלי טלוויזיה זה עובד באותה מידה: כל אחד רואה הכול בטלפון שלו.</p>
${startHe('פותחים משחק לבית')}
<h2>שאלות קצרות</h2>
<ul>
  <li><strong>זה בחינם?</strong> כן. בלי תשלום, בלי פרסומות במשחק ובלי הרשמה.</li>
  <li><strong>צריך להוריד אפליקציה?</strong> לא. המשחק רץ בדפדפן של הטלפון.</li>
  <li><strong>בעברית?</strong> כן, ויש גם שאלות באנגלית.</li>
  <li><strong>מישהו לא בבית?</strong> אפשר לשלוח לו את הקישור והוא משחק מרחוק. ראו <a href="/he/video-call">משחק בשיחת וידאו</a>.</li>
</ul>
<h2>עוד רעיונות לערב בבית</h2>
<p>יש לנו עמודים ל<a href="/he/family-evening">ערב משפחתי</a>, ל<a href="/he/friends-evening">ערב חברים</a> ול<a href="/he/days-at-home">ימים ארוכים בבית עם הילדים</a>. החוקים המלאים נמצאים ב<a href="/he/how-to-play">איך משחקים</a>.</p>`;

const daysAtHome = `
<p>יש ימים שבהם כולם בבית, הרבה יותר זמן ממה שתכננו: חופש שהתארך, ילד חולה, סוף שבוע ארוך, או ימים שבהם פשוט לא יוצאים. אחרי כמה שעות כל אחד נעלם לתוך המסך שלו. בולשיט הוא דרך פשוטה להחזיר את כולם לשולחן לרבע שעה: משחק קבוצתי שכל אחד משחק מהטלפון שלו, בחינם, בלי הורדה ובלי שום הכנה.</p>
<!--start-->
<h2>מה עושים במשחק</h2>
<p>מופיעה עובדה אמיתית ומוזרה עם מילה חסרה. כל אחד כותב תשובה מומצאת, ואז כל התשובות מופיעות יחד עם האמת, וכל אחד מנסה לזהות אותה. מקבלים נקודות על מציאת האמת ועל כל מי שנפל בשקר שלכם. אחרי שאלה אחת כולם מבינים, ואחרי שתיים כולם כבר צוחקים.</p>
${example('קנגורו לא מסוגלים בקלות ____',
    'נניח שהבת כותבת "לשחות", אבא כותב "לישון בשכיבה" והקטן כותב "לקפוץ במקום". התשובה האמיתית: ללכת אחורה. ומי שבחר ב"לשחות" נתן לבת נקודות.')}
<h2>עובד גם בחדר קטן ובלי מסך גדול</h2>
<p>לא צריך טלוויזיה, שולחן גדול או קופסה. כל אחד רואה את השאלה, את התשובות ואת התוצאות בטלפון שלו, אז אפשר לשחק על הספה, על המיטה או על השטיח. אם יש טלוויזיה או מחשב, אפשר להציג עליהם את המשחק: פותחים את <bdi dir="ltr">bullshit.wtf/he</bdi>, לוחצים על "מסך" ומקלידים את הקוד.</p>
<h2>עובד גם כשכל אחד בבית אחר</h2>
<p>סבא וסבתא בבית שלהם? הדודים בעיר אחרת? מי שפותח את המשחק שולח את קישור ההזמנה בקבוצת המשפחה בוואטסאפ, וכל אחד מצטרף מהטלפון שלו, מכל מקום. אפשר לשחק תוך כדי שיחת וידאו כדי לשמוע את כולם צועקים, ואפשר גם בלי. עוד על זה ב<a href="/he/video-call">משחק בשיחת וידאו</a>.</p>
<h2>קצר, למי שאין לו ריכוז לעוד</h2>
<p>משחק של 5 שאלות לוקח בין חמש לעשר דקות. אם רוצים עוד, לוחצים על "משחק חוזר" וממשיכים עם אותם שחקנים ושאלות חדשות. אם לא, עשר דקות של צחוק ביחד זה גם משהו.</p>
<h2>ילדים צעירים</h2>
<p>המשחק מתאים מגיל 10 בערך, כי צריך לכתוב תשובה קצרה. ילדים צעירים יותר משחקים בזוג עם הורה על טלפון אחד: הם ממציאים את השקר, ההורה מקליד. זה בדרך כלל השקר הכי מצחיק בסיבוב.</p>
${startHe('פותחים משחק')}
<h2>שאלות קצרות</h2>
<ul>
  <li><strong>זה עולה כסף?</strong> לא. אין תשלום, אין פרסומות במשחק ואין הרשמה.</li>
  <li><strong>צריך להוריד משהו?</strong> לא. המשחק רץ בדפדפן של הטלפון.</li>
  <li><strong>כמה יכולים לשחק?</strong> עד 12 טלפונים במשחק אחד.</li>
  <li><strong>עובד גם בממ"ד?</strong> כן, בלי כלום חוץ מטלפונים ואינטרנט.</li>
  <li><strong>בעברית?</strong> כן, ויש גם שאלות באנגלית.</li>
</ul>
<p>עוד רעיונות: <a href="/he/home-together">משחק קבוצתי לבית</a> ו<a href="/he/school-break">משחקים לחופש</a>.</p>`;

const videoCall = `
<p>סבא וסבתא בעיר אחרת, החברים בחו"ל, או שפשוט אי אפשר להיפגש הערב. בולשיט הוא משחק שמשחקים יחד מרחוק: מי שמארח פותח משחק ושולח קישור, כל אחד מצטרף מהטלפון שלו, ומשחקים תוך כדי שיחת וידאו. הוא חינמי, בעברית, ואף אחד לא צריך להוריד אפליקציה או להירשם.</p>
<!--start-->
<h2>איך עושים את זה</h2>
<ul>
  <li><strong>השיחה במחשב או בטלוויזיה, המשחק בטלפון.</strong> כולם בשיחה בזום, בוואטסאפ או בכל אפליקציה אחרת, וכל אחד משחק מהטלפון שלו. השאלה, התשובות והתוצאות מופיעות אצל כל אחד, אז לא צריך לשתף מסך.</li>
  <li><strong>או: מסך המשחק משותף בשיחה.</strong> מי שמארח פותח במחשב את <bdi dir="ltr">bullshit.wtf/he</bdi>, לוחץ על "מסך", מקליד את קוד המשחק ומשתף את החלון בשיחה. כולם רואים את השאלות והניקוד בגדול, עם מוזיקה, והטלפונים נשארים לכתיבה ולבחירה.</li>
  <li><strong>או: בלי שיחה בכלל.</strong> המשחק עובד גם כשכל אחד משחק מהספה שלו, ורק התוצאות נשלחות אחר כך לקבוצה.</li>
</ul>
<h2>מה עושים במשחק</h2>
<p>מופיעה עובדה אמיתית ומוזרה עם חלק חסר. כל אחד כותב בשקט תשובה מומצאת שנשמעת אמינה. אחר כך כל התשובות מופיעות יחד עם האמת, וכל אחד בוחר במה שהוא מאמין. מקבלים נקודות על מציאת האמת ועל כל מי שנפל בשקר שלכם. בשיחת וידאו יש בונוס: רואים את הפרצופים ברגע החשיפה.</p>
${example('מצלמת הרשת הראשונה בעולם הוקמה כדי לצפות ב ____',
    'מתאים לשיחת וידאו. נניח שסבתא כותבת "תינוק ישן", הנכד בברלין כותב "חתול" והדודה כותבת "חניה". התשובה האמיתית: קנקן קפה. חוקרים באוניברסיטה רצו לדעת אם נשאר קפה בלי ללכת עד המטבח.')}
<h2>משפחות ישראליות בחו"ל</h2>
<p>הילדים גדלים באנגלית, הסבים מדברים עברית? בוחרים את שפת השאלות כשפותחים משחק: עברית או אנגלית. ערב משחק אחד בשבוע הוא דרך קלה לשמור על קשר בלי שאף אחד יצטרך לחשוב על מה לדבר.</p>
<h2>ערב חברים מרחוק</h2>
<p>במשחק אחד משחקים עד 12 טלפונים. בסוף המשחק אפשר לתת לחבורה שם, ומאותו רגע יש לה עמוד משלה עם טבלת ניצחונות שנמשכת ממשחק למשחק, וכפתור למשחק הבא. בעמוד החבורה קובעים את הערב הבא ושולחים לכולם הזמנה ליומן.</p>
${startHe('פותחים משחק מרחוק')}
<h2>שאלות קצרות</h2>
<ul>
  <li><strong>זה בחינם?</strong> כן. בלי תשלום, בלי פרסומות במשחק ובלי הרשמה.</li>
  <li><strong>צריך את אותה אפליקציית שיחה?</strong> לא. המשחק לא קשור לשיחה: כל אחד נכנס מהדפדפן בטלפון.</li>
  <li><strong>מאיזה גיל?</strong> מגיל 10 בערך. ילדים צעירים יותר משחקים בזוג עם הורה.</li>
  <li><strong>כמה זמן?</strong> משחק של 5 שאלות לוקח בין חמש לעשר דקות. יש גם 7 ו-9.</li>
</ul>
<p>עוד רעיונות: <a href="/he/home-together">משחק קבוצתי לבית</a> ו<a href="/he/family-evening">משחק לערב משפחתי</a>.</p>`;

const schoolBreak = `
<p><strong>בחופש חנוכה:</strong> בימי חנוכה המשחק מציע גם שאלות חנוכה. עוד על זה ב<a href="/he/hanukkah">משחק לחנוכה</a>.</p>
<p>חופש. הילדים בבית, ההורים לפעמים גם, והמתבגרים לא יוצאים מהטלפון. בולשיט הוא משחק שמנצל בדיוק את זה: כל אחד משחק מהטלפון שלו, אבל כולם ביחד, סביב שולחן אחד או על ספה אחת. הוא חינמי, בעברית, רץ בדפדפן ולא דורש הכנה.</p>
<!--start-->
<h2>איך משחקים</h2>
<p>מופיעה עובדה אמיתית ומוזרה עם חלק חסר. כל אחד ממציא תשובה שנשמעת אמינה, ואז כל התשובות מופיעות יחד עם האמת, וכל אחד בוחר. מקבלים נקודות על מציאת האמת ועל כל מי שנפל בשקר שלכם. לא צריך לדעת טריוויה: אף אחד לא מכיר את העובדות האלה, אז מנצח מי שמשקר הכי טוב.</p>
${example('החיה הלאומית של סקוטלנד היא ____',
    'נניח שהאח הגדול כותב "פרה שעירה", אמא כותבת "כבשה" והקטנה כותבת "דרקון". התשובה האמיתית: חד קרן. והקטנה, שהייתה הכי קרובה, תזכיר את זה עד סוף החופש.')}
<h2>לילות של חופש</h2>
<ul>
  <li><strong>ערב ראשון: כל המשפחה.</strong> משחק של 5 שאלות אחרי ארוחת הערב. בסוף לוחצים על "משחק חוזר" וממשיכים עם שאלות חדשות.</li>
  <li><strong>ערב שני: הטלוויזיה.</strong> פותחים בטלוויזיה או במחשב את <bdi dir="ltr">bullshit.wtf/he</bdi>, לוחצים על "מסך" ומקלידים את קוד המשחק. השאלות והניקוד בגדול, לכל הסלון.</li>
  <li><strong>ערב שלישי: סבא וסבתא מרחוק.</strong> שולחים להם את הקישור בוואטסאפ, וכל אחד משחק מהבית שלו, אפשר בשיחת וידאו.</li>
  <li><strong>ערב רביעי: החברים של הילדים.</strong> עד 12 טלפונים במשחק אחד. המתבגרים כבר יודעים איך עובדים על ההורים.</li>
  <li><strong>כל ערב: טבלת החופש.</strong> בסוף המשחק נותנים לחבורה שם, ומאותו רגע יש לה עמוד עם טבלת ניצחונות שנמשכת ממשחק למשחק. בסוף החופש יודעים מי הבולשיטר של המשפחה.</li>
</ul>
${startHe('פותחים משחק לחופש')}
<h2>שאלות קצרות</h2>
<ul>
  <li><strong>זה בחינם?</strong> כן. בלי תשלום, בלי פרסומות במשחק ובלי הרשמה.</li>
  <li><strong>צריך להוריד משהו?</strong> לא. המשחק רץ בדפדפן של הטלפון.</li>
  <li><strong>מאיזה גיל?</strong> מגיל 10 בערך. ילדים צעירים יותר משחקים בזוג עם הורה, על טלפון אחד.</li>
  <li><strong>כמה זמן?</strong> משחק של 5 שאלות לוקח בין חמש לעשר דקות. יש גם 7 ו-9 שאלות.</li>
  <li><strong>ובפסח?</strong> יש <a href="/he/seder">משחק לליל הסדר</a>.</li>
</ul>
<p>עוד רעיונות: <a href="/he/home-together">משחק קבוצתי לבית</a> ו<a href="/he/days-at-home">ימים ארוכים בבית</a>. החוקים המלאים נמצאים ב<a href="/he/how-to-play">איך משחקים</a>.</p>`;

const familyNight = `
<p>Family game night usually means a box, a missing piece and an argument about the rules. Bullshit needs none of that: everyone plays on their own phone, in the browser, and the game runs the rules. One person starts a game, everyone else joins with a four-letter PIN, and the whole family is playing in a minute. It is free, with no app and no sign-up.</p>
<!--start-->
<h2>How it works</h2>
<p>A strange true fact appears with a blank. Everyone writes a lie to fill it, one that sounds true enough to fool the others. Then all the answers appear together, the lies and the truth, and everyone picks the one they believe. You score for finding the truth, and for every relative who falls for your lie. Nobody needs to know trivia: nobody knows these facts, so the kids and the grandparents start level.</p>
${example('Play-Doh was first sold as a putty for cleaning ____',
    'Say Mom writes "carpets", your son writes "windows" and Grandpa writes "frying pans". All of them sound believable. The real answer: wallpaper. Whoever picked "windows" just gave your son points, and he will mention it at breakfast.')}
<h2>Why it works for families</h2>
<ul>
  <li><strong>Ages from about 10 up</strong> play together: you need to write a short answer, that's all. Younger kids play as a pair with a parent, one phone between them.</li>
  <li><strong>Up to 12 phones a game.</strong> A bigger family plays in pairs.</li>
  <li><strong>Short.</strong> A game of 5 questions takes about ten minutes. There are 7- and 9-question games too, and "Rematch" at the end starts another with the same players and new questions.</li>
  <li><strong>The TV can join in.</strong> On a laptop or computer connected to the TV, open bullshit.wtf, click "Present" and type the PIN. The room sees the questions, the answers and the scores, with music, while phones are for writing and picking.</li>
  <li><strong>It keeps score from week to week.</strong> At the end, give your family a name and it gets its own page, with a table of wins that carries over from game to game.</li>
</ul>
${startEn('Start a family game')}
<h2>Questions families ask</h2>
<ul>
  <li><strong>Is it free?</strong> Yes. No payment, no ads in the game, no sign-up.</li>
  <li><strong>Can family far away play?</strong> Yes. Send them the invite link and they play from their own phone. See <a href="/video-call-party-game">a party game for a video call</a>.</li>
  <li><strong>What about the name?</strong> "Bullshit" is a swear word, and it is on the screens, including the "biggest bullshitter" title at the end. In most families that is half the fun. You know yours.</li>
</ul>
<p>The full rules and points are on <a href="/how-to-play">How to play</a>. Snowed in? See <a href="/snow-day-games">snow day games</a>.</p>`;

const videoCallEn = `
<p>Can't all be in one room tonight? Bullshit is a party game you play together over a video call. One person starts a game and sends a link, everyone joins on their own phone, and you play while you talk on Zoom, FaceTime, WhatsApp or whatever you already use. It is free, it runs in the browser, and nobody has to download anything or make an account.</p>
<!--start-->
<h2>How to set it up</h2>
<ul>
  <li><strong>The call on a laptop or TV, the game on phones.</strong> Everyone stays on the call and plays on their own phone. Each phone shows the question, the answers and the results, so nobody needs to share a screen.</li>
  <li><strong>Or share the game's big screen.</strong> The host opens bullshit.wtf on a computer, clicks "Present", types the PIN and shares that window on the call. Everyone sees the questions and the scores large, with music, and phones are just for writing and picking. This is how most hosts on a laptop already play.</li>
  <li><strong>Or skip the call.</strong> The game works with everyone on their own sofa; share the results card in the group chat afterwards.</li>
</ul>
<h2>What you do in the game</h2>
<p>A strange true fact appears with a blank. Everyone writes a believable lie to fill it. Then all the answers appear together, the lies and the truth, and everyone picks the one they believe. You score for finding the truth, and for every friend who falls for your lie. On a video call you get a bonus: you see everyone's face at the reveal.</p>
${example('The world\'s first webcam was set up to keep an eye on a ____',
    'Fitting, for a video call. Say your sister writes "sleeping baby", a friend in Toronto writes "parking space" and Grandpa writes "goldfish". The real answer: coffee pot. Researchers at a university wanted to know whether there was coffee left without walking to the kitchen.')}
<h2>Good for</h2>
<ul>
  <li><strong>Families spread across cities or countries.</strong> A weekly game night is an easy way to see each other without having to think of what to say. Questions come in English or Hebrew.</li>
  <li><strong>Friends who moved away.</strong> Up to 12 phones a game. Save your group at the end and it gets a page with a table of wins that carries over, a button for the next game, and a way to send everyone the next game night for their calendar.</li>
  <li><strong>Remote teams.</strong> A game of 5 questions takes about ten minutes. See <a href="/team-building-game">a team-building game</a>.</li>
</ul>
${startEn('Start a video call game')}
<h2>Quick answers</h2>
<ul>
  <li><strong>Is it free?</strong> Yes. No payment, no ads in the game, no sign-up.</li>
  <li><strong>Does it need a particular video app?</strong> No. The game is separate from the call: everyone joins in their phone's browser.</li>
  <li><strong>What ages?</strong> From about 10 up. Younger kids play in a pair with a parent.</li>
</ul>
<p>The full rules and points are on <a href="/how-to-play">How to play</a>. Everyone in one house? See <a href="/family-game-night">family game night</a>.</p>`;

const snowDay = `
<p>School is closed, the roads are white, and by eleven in the morning everyone has retreated to their own screen. Bullshit turns those screens into one game the whole house plays together: everyone on their own phone, around one table or one sofa. It is free, it runs in the browser, and there is nothing to set up, find or tidy away.</p>
<!--start-->
<h2>How it works</h2>
<p>A strange true fact appears with a blank. Everyone writes a lie to fill it. Then all the answers appear together, the lies and the truth, and everyone picks the one they believe. You score for finding the truth and for everyone who falls for your lie. Nobody needs to know trivia, so the youngest and the oldest start level, and whoever lies best wins.</p>
${example('Sea otters ____ while they sleep, so they don\'t drift apart',
    'Say your daughter writes "tie seaweed around themselves", Dad writes "sing" and your son writes "freeze together". The real answer: hold hands. Which is more or less the plan for the rest of the snow day.')}
<h2>A snow day, game by game</h2>
<ul>
  <li><strong>Mid-morning: a quick one.</strong> A game of 5 questions takes about ten minutes. "Rematch" at the end starts another with the same players and new questions.</li>
  <li><strong>After lunch: put it on the TV.</strong> On a laptop or computer connected to the TV, open bullshit.wtf, click "Present" and type the PIN. Questions, answers and scores show for the whole room, with music.</li>
  <li><strong>Afternoon: the grandparents, from their house.</strong> Send them the invite link and they play on their own phone, on a video call or not. See <a href="/video-call-party-game">a party game for a video call</a>.</li>
  <li><strong>Evening: the neighbors' kids.</strong> Up to 12 phones a game, and pairs share a phone for a bigger group.</li>
  <li><strong>All winter: keep score.</strong> At the end of a game, give your family a name and it gets its own page, with a table of wins that carries over to the next snow day.</li>
</ul>
${startEn('Start a snow day game')}
<h2>Quick answers</h2>
<ul>
  <li><strong>Is it free?</strong> Yes. No payment, no ads in the game, no sign-up.</li>
  <li><strong>What ages?</strong> From about 10 up: you need to write a short answer. Younger kids play in a pair with a parent, one phone between them.</li>
  <li><strong>What about the name?</strong> "Bullshit" is a swear word, and it is on the screens. In most houses that is the joke. You know yours.</li>
</ul>
<p>The full rules and points are on <a href="/how-to-play">How to play</a>. More ideas: <a href="/family-game-night">family game night</a>, and for December, <a href="/christmas-party-game">a Christmas party game</a>.</p>`;

module.exports = {
    pages: (en, he) => [
        {
            path: '/he/youth-group', site: he, tag: 'seo-he-youth',
            start: { href: '/create-game?lang=he', label: 'פותחים משחק לקבוצה' },
            image: '/assets/og-youth-he.png',
            title: 'פעולה מוכנה לשבט ולסניף: משחק בולשיט בטלפונים, בלי הכנה',
            description: 'פעולה מוכנה לחניכים מכיתה ז\' ומעלה: כל אחד ממציא תשובה מהטלפון, כולם מחפשים את האמת. חינם, בדפדפן, עד 12 משתתפים במשחק, מוקרן על הקיר.',
            h1: 'פעולה מוכנה: בולשיט, משחק השקרים',
            body: youth,
        },
        {
            path: '/he/gibush', site: he, tag: 'seo-he-gibush',
            start: { href: '/create-game?lang=he', label: 'פותחים משחק לגיבוש' },
            image: '/assets/og-gibush-he.png',
            title: 'משחק לערב גיבוש: בולשיט בטלפונים | חינם, עד 12 שחקנים',
            description: 'משחק לערב גיבוש של מכינה, צוות, כיתה או קורס. כל אחד ממציא תשובה, כולם מחפשים את האמת, ומגלים מי השקרן הכי טוב בקבוצה.',
            h1: 'משחק לערב גיבוש שכולם משחקים מהטלפון',
            body: gibush,
        },
        {
            path: '/he/home-together', twin: '/family-game-night', site: he, tag: 'seo-he-home',
            start: { href: '/create-game?lang=he', label: 'פותחים משחק לבית' },
            image: '/assets/og-home-he.png',
            title: 'משחק קבוצתי לבית: כולם משחקים מהטלפון | בולשיט, חינם',
            description: 'כל המשפחה או החבר\'ה בבית? משחק שכולם משחקים מהטלפון, בלי הורדה ובלי הכנה: ממציאים תשובות לשאלות מוזרות ומחפשים את האמת.',
            h1: 'משחק קבוצתי לבית שמתחיל בדקה',
            body: homeTogether,
        },
        {
            path: '/he/days-at-home', site: he, tag: 'seo-he-days-home',
            start: { href: '/create-game?lang=he', label: 'פותחים משחק' },
            image: '/assets/og-days-home-he.png',
            title: 'ימים בבית עם הילדים? בולשיט, משחק קבוצתי בטלפון, חינם',
            description: 'כשכולם בבית: משחק של רבע שעה שכולם משחקים מהטלפון, גם בחדר קטן, גם עם המשפחה שבבית אחר. חינם, בעברית, בלי הורדה.',
            h1: 'כשכולם בבית: רבע שעה של צחוק ביחד',
            body: daysAtHome,
        },
        {
            path: '/he/video-call', twin: '/video-call-party-game', site: he, tag: 'seo-he-video',
            start: { href: '/create-game?lang=he', label: 'פותחים משחק מרחוק' },
            image: '/assets/og-video-he.png',
            title: 'משחק לשיחת וידאו עם המשפחה או החברים | בולשיט, בעברית וחינם',
            description: 'סבא וסבתא בעיר אחרת? חברים בחו"ל? כל אחד פותח קישור בטלפון, ומשחקים יחד תוך כדי שיחת וידאו. חינם, בלי הורדה, עד 12 שחקנים.',
            h1: 'משחק לשחק יחד מרחוק, בשיחת וידאו',
            body: videoCall,
        },
        {
            path: '/he/school-break', site: he, tag: 'seo-he-break',
            start: { href: '/create-game?lang=he', label: 'פותחים משחק לחופש' },
            image: '/assets/og-break-he.png',
            title: 'משחקים לחופש חנוכה ולכל חופש: בולשיט, משחק לכל המשפחה',
            description: 'חופש חנוכה, פסח או החופש הגדול: מה עושים עם הילדים בבית? משחק שכל המשפחה משחקת מהטלפון, בעברית, בחינם ובלי הורדה. ממציאים תשובות ומחפשים את האמת.',
            h1: 'משחק לחופש חנוכה, ולכל חופש: כל המשפחה משחקת מהטלפון',
            body: schoolBreak,
        },
        {
            path: '/family-game-night', twin: '/he/home-together', site: en, tag: 'seo-en-family-night',
            start: { href: '/create-game?lang=en&pack=none', label: 'Start a family game' },
            image: '/assets/og-family-night-en.png',
            title: 'Free family game night on your phones: Bullshit',
            description: 'A family game night with nothing to set up: everyone writes a lie to a strange true fact on their own phone, then hunts for the truth. Free, no app, up to 12 players.',
            h1: 'Family game night, on everyone\'s phone',
            body: familyNight,
        },
        {
            path: '/video-call-party-game', twin: '/he/video-call', site: en, tag: 'seo-en-video',
            start: { href: '/create-game?lang=en&pack=none', label: 'Start a video call game' },
            image: '/assets/og-video-en.png',
            title: 'Bullshit: a party game to play on a video call, free',
            description: 'Play together on Zoom, FaceTime or WhatsApp: everyone joins on their own phone, writes a lie and hunts for the truth. Free, in the browser, up to 12 players.',
            h1: 'A party game for a video call',
            body: videoCallEn,
        },
        {
            path: '/snow-day-games', site: en, tag: 'seo-en-snow',
            start: { href: '/create-game?lang=en&pack=none', label: 'Start a snow day game' },
            image: '/assets/og-snow-en.png',
            title: 'Snow day? A game the whole house plays on phones · Bullshit',
            description: 'Stuck inside on a snow day: a free game everyone plays on their own phone. Write a lie to a strange true fact, find the truth, fool the family. No app, no sign-up.',
            h1: 'Snow day games for the whole house',
            body: snowDay,
        },
    ],
};
