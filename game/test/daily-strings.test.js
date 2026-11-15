// The words of the daily puzzle (seo/daily-strings.js): both languages have every line, each in
// its own language, and the lines the spec fixes read word for word. Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const { en, he } = require('../seo/daily-strings');
const core = require('../seo/daily-core');

const hebrew = /[֐-׿]/;
const latin = /[A-Za-z]/;
// Not words: codes, addresses, and the other language's own name.
const NOT_WORDS = ['lang', 'dir', 'home', 'path', 'image', 'other', 'candles', 'kickerDot'];
const sample = { name: '', lie: '', answer: '', p: 61, n: 240, x: 3, y: 5, t: '07:12:44', no: 12, noTag: ' #12', dot: '', candle: '', max: 8, s: '' };

test('both languages have every line, Hebrew in Hebrew and English in English', () => {
    assert.deepStrictEqual(Object.keys(he).sort(), Object.keys(en).sort());
    for (const key of Object.keys(en)) {
        if (NOT_WORDS.includes(key)) { continue; }
        const e = core.fill(en[key], sample);
        const h = core.fill(he[key], sample);
        assert.ok(e.trim() && !hebrew.test(e), `English ${key}: ${e}`);
        assert.ok(h.trim() && hebrew.test(h), `Hebrew ${key}: ${h}`);
        // The noscript line names JavaScript; nothing else in Hebrew has Latin letters.
        if (key !== 'noscript') { assert.ok(!latin.test(h), `Hebrew ${key} has Latin letters: ${h}`); }
        // The same gaps in both languages, so neither loses a name or a number.
        const gaps = t => (String(t).match(/\{\w+\}/g) || []).sort().join();
        assert.strictEqual(gaps(he[key]), gaps(en[key]), `${key}: the same gaps`);
    }
    assert.deepStrictEqual([en.dir, he.dir, en.path, he.path, en.home, he.home], ['ltr', 'rtl', '/daily', '/he/daily', '/', '/he']);
    assert.strictEqual(en.candles.length, 8);
    assert.strictEqual(he.candles.length, 8);
    he.candles.forEach(c => assert.ok(hebrew.test(c) && !latin.test(c)));
});

test('the question screen, word for word', () => {
    assert.strictEqual(core.kicker(en, 12, 0), 'TODAY\'S BULLSHIT · #12');
    assert.strictEqual(core.kicker(he, 12, 0), 'הבולשיט היומי · #12');
    assert.strictEqual(core.kicker(en, 10, 3), 'CANDLE 3 · TODAY\'S BULLSHIT #10');
    assert.strictEqual(core.kicker(he, 10, 3), 'נר שלישי · הבולשיט היומי #10');
    assert.strictEqual(core.kicker(en, 0, 0), 'TODAY\'S BULLSHIT', 'no number before the first day');
    assert.strictEqual(core.kicker(he, -3, 0), 'הבולשיט היומי');
    assert.strictEqual(en.instruction, 'One answer is true. The rest are lies. Spot the truth.');
    assert.strictEqual(he.instruction, 'רק תשובה אחת נכונה. כל השאר שקרים. מצאו את האמת.');
    assert.strictEqual(en.foot, 'A new one every day. No sign-up.');
    assert.strictEqual(he.foot, 'כל יום שאלה חדשה. בלי הרשמה.');
    assert.strictEqual(core.fill(en.friendNamed, { name: 'Dana' }), 'Dana wrote one of these answers to fool you.');
    assert.strictEqual(core.fill(he.friendNamed, { name: 'דנה' }), 'אחת מהתשובות היא שקר של דנה. לא ליפול.');
    assert.strictEqual(en.friendUnnamed, 'A friend wrote one of these answers to fool you.');
    assert.strictEqual(he.friendUnnamed, 'אחת מהתשובות היא שקר של מי ששלח לך את הקישור. לא ליפול.');
});

test('the reveal, word for word', () => {
    assert.deepStrictEqual([en.headTruth, en.headLie, en.headFriendUnnamed], ['YOU SPOTTED THE TRUTH', 'BULLSHIT! YOU FELL FOR A LIE', 'YOUR FRIEND FOOLED YOU']);
    assert.deepStrictEqual([he.headTruth, he.headLie, he.headFriendUnnamed], ['מצאת את האמת', 'בולשיט! נפלת בשקר', 'נפלת בשקר של החבר ששלח']);
    assert.strictEqual(core.fill(en.headFriendNamed, { name: 'Dana' }), 'Dana FOOLED YOU');
    assert.strictEqual(core.fill(he.headFriendNamed, { name: 'דנה' }), 'נפלת בשקר של דנה');
    assert.strictEqual(core.fill(en.friendMissedNamed, { name: 'Dana', lie: 'singing' }), 'Dana\'s lie was "singing". Not this time.');
    assert.strictEqual(core.fill(he.friendMissedNamed, { name: 'דנה', lie: 'לשיר' }), 'השקר של דנה היה "לשיר". הפעם זה לא עבד.');
    assert.strictEqual(core.fill(en.truthLine, { answer: 'dancing' }), 'The truth: dancing');
    assert.strictEqual(core.fill(he.truthLine, { answer: 'לרקוד' }), 'האמת: לרקוד');
    assert.deepStrictEqual([en.labelTruth, en.labelLie, en.labelPick, core.fill(en.labelFriendNamed, { name: 'Dana' })], ['THE TRUTH', 'A LIE', 'YOUR PICK', 'Dana\'S LIE']);
    assert.deepStrictEqual([he.labelTruth, he.labelLie, he.labelPick, core.fill(he.labelFriendNamed, { name: 'דנה' })], ['האמת', 'שקר', 'הבחירה שלך', 'השקר של דנה']);
    assert.strictEqual(core.fill(en.numbers, { p: 61, n: 240 }), '61% of 240 players fell for a lie today');
    assert.strictEqual(core.fill(he.numbers, { p: 61, n: 240 }), '61% מתוך 240 שחקנים נפלו היום בשקר');
    assert.strictEqual(en.tooFew, 'You\'re among the first today. The numbers show up as more people play.');
    assert.strictEqual(he.tooFew, 'אתם מהראשונים היום. המספרים יופיעו כשעוד אנשים ישחקו.');
    assert.deepStrictEqual([en.source, he.source], ['Really? Here\'s the source', 'באמת? הנה המקור']);
    assert.deepStrictEqual([en.send, en.share, en.copy, en.copied], ['SEND TO YOUR GROUP', 'SHARE', 'COPY', 'Copied']);
    assert.deepStrictEqual([he.send, he.share, he.copy, he.copied], ['שלחו לקבוצה', 'שיתוף', 'העתקה', 'הועתק']);
    assert.deepStrictEqual([en.played, he.played], ['You\'ve played today\'s.', 'כבר שיחקת היום.']);
    assert.deepStrictEqual([en.otherDay, he.otherDay], ['That one was from another day. Here\'s today\'s.', 'הקישור היה של יום אחר. הנה השאלה של היום.']);
    assert.deepStrictEqual([en.loadError, en.tryAgain, he.loadError, he.tryAgain], ['Today\'s question didn\'t load.', 'TRY AGAIN', 'השאלה של היום לא נטענה.', 'נסו שוב']);
    assert.strictEqual(core.fill(en.countdown, { t: '07:12:44' }), 'Next question in 07:12:44');
    assert.strictEqual(core.fill(he.countdown, { t: '07:12:44' }), 'השאלה הבאה בעוד 07:12:44');
    assert.deepStrictEqual([en.newQuestion, he.newQuestion], ['NEW QUESTION', 'שאלה חדשה']);
});

test('fool your friends and the game, word for word', () => {
    assert.deepStrictEqual([en.foolTitle, en.foolLie, en.foolName, en.foolSend], ['Now fool your friends', 'Your lie', 'Your name (optional)', 'SEND MY LIE']);
    assert.deepStrictEqual([he.foolTitle, he.foolLie, he.foolName, he.foolSend], ['עכשיו תעבדו על החברים', 'השקר שלכם', 'השם שלכם (לא חובה)', 'שלחו את השקר שלי']);
    assert.strictEqual(en.foolText, 'Write a lie for today\'s question. We\'ll hide it among the answers and tell you how many friends fell for it.');
    assert.strictEqual(he.foolText, 'כתבו שקר לשאלה של היום. נחביא אותו בין התשובות ונספר לכם כמה חברים נפלו בו.');
    assert.deepStrictEqual([en.lieIsTruth, en.lieIsTaken, en.lieRefused], ['That\'s the truth. You have to lie!', 'That answer is already there. Try another.', 'Try other words.']);
    assert.deepStrictEqual([he.lieIsTruth, he.lieIsTaken, he.lieRefused], ['זאת האמת. צריך לשקר!', 'התשובה הזאת כבר מופיעה. נסו אחרת.', 'נסו מילים אחרות.']);
    assert.strictEqual(core.fill(en.count, { lie: 'singing', x: 3, y: 5 }), 'Your lie "singing" fooled 3 of 5 friends so far.');
    assert.strictEqual(core.fill(he.count, { lie: 'לשיר', x: 3, y: 5 }), 'השקר שלך "לשיר" עבד על 3 מתוך 5 חברים עד עכשיו.');
    assert.deepStrictEqual([en.countNone, he.countNone], ['Nobody has opened your lie yet.', 'אף אחד עוד לא פתח את השקר שלך.']);
    assert.deepStrictEqual([en.gameTitle, en.gameStart, en.gameStartHanukkah], ['This is half the game', 'START A GAME WITH FRIENDS', 'START A HANUKKAH GAME']);
    assert.deepStrictEqual([he.gameTitle, he.gameStart, he.gameStartHanukkah], ['זה רק חצי מהמשחק', 'פותחים משחק עם חברים', 'פותחים משחק חנוכה']);
    assert.strictEqual(en.gameText, 'With friends in one room, everyone writes a lie, and you score each time someone falls for yours.');
    assert.strictEqual(he.gameText, 'כשיושבים יחד, כל אחד כותב שקר ומקבלים נקודות על כל מי שנופל בו.');
    assert.strictEqual(core.fill(en.gameHint, { max: 8 }), 'Free. 2 to 8 players, each on their own phone.');
    assert.strictEqual(core.fill(he.gameHint, { max: 12 }), 'בחינם. 2 עד 12 שחקנים, כל אחד בטלפון שלו.');
});

test('the link preview is fixed per language and never names a day\'s answer', () => {
    assert.strictEqual(en.title, 'Today\'s Bullshit: one truth, three lies');
    assert.strictEqual(en.description, 'One strange fact a day. Spot the true answer among the lies, then fool your friends. Free, no sign-up.');
    assert.strictEqual(he.title, 'הבולשיט היומי: אמת אחת, שלושה שקרים');
    assert.strictEqual(he.description, 'כל יום עובדה מוזרה אחת. מצאו את התשובה הנכונה בין השקרים, ואז תעבדו על החברים. בחינם, בלי הרשמה.');
    assert.deepStrictEqual([en.image, he.image], ['/assets/og-daily-en.png', '/assets/og-daily-he.png']);
});

const puzzle = lang => ({
    no: 12,
    q: lang === 'he' ? 'בשנת 1518 מאות אנשים בשטרסבורג לא הצליחו להפסיק $blank$ במשך שבועות'
        : 'In 1518, hundreds of people in Strasbourg could not stop $blank$ for weeks',
});

test('the messages, with and without numbers', () => {
    assert.strictEqual(core.shareText(en, 'truth', puzzle('en'), 61, 'https://bullshit.wtf/daily?via=daily-share'),
        'Bullshit #12 ✅ I spotted the truth. 61% fell for a lie.\n"In 1518, hundreds of people in Strasbourg could not stop ____ for weeks"\nCan you spot it?\nhttps://bullshit.wtf/daily?via=daily-share');
    assert.strictEqual(core.shareText(en, 'lie', puzzle('en'), 61, 'https://bullshit.wtf/daily?via=daily-share'),
        'Bullshit #12 🤥 I fell for a lie. So did 61%.\n"In 1518, hundreds of people in Strasbourg could not stop ____ for weeks"\nCan you spot the truth?\nhttps://bullshit.wtf/daily?via=daily-share');
    assert.strictEqual(core.shareText(he, 'truth', puzzle('he'), 61, 'https://bullshit.wtf/he/daily?via=daily-share'),
        'בולשיט #12 ✅ מצאתי את האמת. 61% נפלו בשקר.\n"בשנת 1518 מאות אנשים בשטרסבורג לא הצליחו להפסיק ____ במשך שבועות"\nתצליחו למצוא?\nhttps://bullshit.wtf/he/daily?via=daily-share');
    assert.strictEqual(core.shareText(he, 'lie', puzzle('he'), 61, 'https://bullshit.wtf/he/daily?via=daily-share'),
        'בולשיט #12 🤥 נפלתי בשקר. כמו 61% מהשחקנים.\n"בשנת 1518 מאות אנשים בשטרסבורג לא הצליחו להפסיק ____ במשך שבועות"\nתצליחו למצוא את האמת?\nhttps://bullshit.wtf/he/daily?via=daily-share');
    // Fewer than 20 picks: the sentence with the percentage is left out.
    assert.strictEqual(core.shareText(en, 'truth', puzzle('en'), null, 'U').split('\n')[0], 'Bullshit #12 ✅ I spotted the truth.');
    assert.strictEqual(core.shareText(en, 'lie', puzzle('en'), null, 'U').split('\n')[0], 'Bullshit #12 🤥 I fell for a lie.');
    assert.strictEqual(core.shareText(he, 'truth', puzzle('he'), null, 'U').split('\n')[0], 'בולשיט #12 ✅ מצאתי את האמת.');
    assert.strictEqual(core.shareText(he, 'lie', puzzle('he'), null, 'U').split('\n')[0], 'בולשיט #12 🤥 נפלתי בשקר.');
    // A lie of one's own.
    assert.strictEqual(core.shareText(en, 'fool', puzzle('en'), 61, 'U'),
        'Bullshit #12: I hid a lie in today\'s question. Bet you fall for it.\n"In 1518, hundreds of people in Strasbourg could not stop ____ for weeks"\nU');
    assert.strictEqual(core.shareText(he, 'fool', puzzle('he'), null, 'U'),
        'בולשיט #12: החבאתי שקר בשאלה של היום. בטוח תיפלו בו.\n"בשנת 1518 מאות אנשים בשטרסבורג לא הצליחו להפסיק ____ במשך שבועות"\nU');
    // Before the first day there is no number to send.
    assert.strictEqual(core.shareText(en, 'truth', Object.assign(puzzle('en'), { no: 0 }), null, 'U').split('\n')[0], 'Bullshit ✅ I spotted the truth.');
    assert.strictEqual(core.shareText(en, 'fool', Object.assign(puzzle('en'), { no: -4 }), null, 'U').split('\n')[0], 'Bullshit: I hid a lie in today\'s question. Bet you fall for it.');
});

test('yesterday\'s line', () => {
    assert.strictEqual(core.yesterdayLine(en, { text: 'Frank Hayes won a race while dead', fooledPct: 61, total: 240 }), 'Yesterday: Frank Hayes won a race while dead. 61% fell for a lie.');
    assert.strictEqual(core.yesterdayLine(he, { text: 'פרנק הייז ניצח כשהוא מת.', fooledPct: 61, total: 240 }), 'אתמול: פרנק הייז ניצח כשהוא מת. 61% נפלו בשקר.');
    assert.strictEqual(core.yesterdayLine(en, { text: 'A fact', fooledPct: 50, total: 19 }), 'Yesterday: A fact.', 'too few picks: no percentage');
    assert.strictEqual(core.yesterdayLine(en, null), '');
});
