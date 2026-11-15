// A chat group's round, the page's side (seo/daily-round-core.js): the 50/50 split, the link, the
// line under the kicker, the board's names and the three messages, word for word in both languages
// with one, two and many liars. Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const { en, he } = require('../seo/daily-strings');
const rc = require('../seo/daily-round-core');

const puzzle = { no: 12, q: 'In 1518, hundreds of people in Strasbourg could not stop $blank$ for weeks' };
const hePuzzle = { no: 12, q: 'בשנת 1518 מאות אנשים בשטרסבורג לא הצליחו להפסיק $blank$ במשך שבועות' };
const URL = 'https://bullshit.wtf/daily?n=12&g=k3x9q2ab7m';
const HE_URL = 'https://bullshit.wtf/he/daily?n=12&g=k3x9q2ab7m';
const lie = (name, text, names, more, mine) => ({ id: 'aaaaaa', name, lie: text, names: names || [], more: more || 0, mine: !!mine });
const board = (lies, picked) => ({ played: picked, picked, lies, truth: { text: 'dancing', names: [], more: 0 }, house: { names: [], more: 0 } });

test('the 50/50 split is by the browser id, and a play-test can choose its half', () => {
    assert.strictEqual(rc.groupHalf('a123456789abcdef', '', ''), true);
    assert.strictEqual(rc.groupHalf('r123456789abcdef', '', ''), true);
    assert.strictEqual(rc.groupHalf('s123456789abcdef', '', ''), false);
    assert.strictEqual(rc.groupHalf('0123456789abcdef', '', ''), false);
    assert.strictEqual(rc.groupHalf(null, '', ''), false, 'no id: the puzzle as built');
    assert.strictEqual(rc.groupHalf('s123456789abcdef', 'test', '?via=test&round=on'), true);
    assert.strictEqual(rc.groupHalf('a123456789abcdef', 'test-he', '?via=test-he&round=off'), false);
    assert.strictEqual(rc.groupHalf('s123456789abcdef', 'daily-home', '?round=on'), false, 'only a play-test chooses');
    // Of 36 first letters, 18 are in the group half.
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
    assert.strictEqual(chars.filter(c => rc.groupHalf(c + '123456789abcdef', '', '')).length, 18);
});

test('the round link carries the number and the id, and a play-test\'s tag', () => {
    assert.strictEqual(rc.roundUrl('https://bullshit.wtf', en, 12, 'k3x9q2ab7m', 'daily-home'), URL);
    assert.strictEqual(rc.roundUrl('https://bullshit.wtf', he, 12, 'k3x9q2ab7m', ''), HE_URL);
    assert.strictEqual(rc.roundUrl('', en, 12, 'k3x9q2ab7m', 'test'), '/daily?n=12&g=k3x9q2ab7m&via=test');
    assert.strictEqual(rc.cleanRoundId('k3x9q2ab7m'), 'k3x9q2ab7m');
    assert.strictEqual(rc.cleanRoundId('K3X9Q2AB7M'), null);
});

test('the line under the kicker, with one, two and many liars', () => {
    assert.strictEqual(rc.liarsLine(en, [], 0), 'Nobody has hidden a lie yet. Be the first, after you pick.');
    assert.strictEqual(rc.liarsLine(en, ['Dana'], 1), 'Dana hid a lie in here. One answer is true.');
    assert.strictEqual(rc.liarsLine(en, ['Dana', 'Yossi'], 2), 'Dana and Yossi hid lies in here. One answer is true.');
    assert.strictEqual(rc.liarsLine(en, ['Dana', 'Yossi', 'Noa', 'Dad'], 4), 'Dana, Yossi and 2 more hid lies in here. One answer is true.');
    assert.strictEqual(rc.liarsLine(en, ['Dana', 'Yossi', 'Noa'], 3), 'Dana, Yossi and 1 more hid lies in here. One answer is true.');
    assert.strictEqual(rc.liarsLine(he, ['דנה', 'יוסי', 'נועה'], 3), 'יש כאן שקרים של דנה, של יוסי ושל עוד אחד. רק תשובה אחת נכונה.');
    assert.strictEqual(rc.liarsLine(he, [], 0), 'עוד אין כאן שקרים של הקבוצה. אחרי שתבחרו, תהיו הראשונים.');
    assert.strictEqual(rc.liarsLine(he, ['דנה'], 1), 'יש כאן שקר של דנה. רק תשובה אחת נכונה.');
    assert.strictEqual(rc.liarsLine(he, ['דנה', 'יוסי'], 2), 'יש כאן שקרים של דנה ושל יוסי. רק תשובה אחת נכונה.');
    assert.strictEqual(rc.liarsLine(he, ['דנה', 'יוסי', 'נועה', 'אבא'], 4), 'יש כאן שקרים של דנה, של יוסי ושל עוד 2. רק תשובה אחת נכונה.');
});

test('names on the board', () => {
    assert.strictEqual(rc.names(en, [], 0), 'nobody yet');
    assert.strictEqual(rc.names(en, ['Yossi'], 0), 'Yossi');
    assert.strictEqual(rc.names(en, ['Yossi', 'Noa', 'Dad'], 0), 'Yossi, Noa and Dad');
    assert.strictEqual(rc.names(en, ['Yossi'], 2), 'Yossi and 2 more');
    assert.strictEqual(rc.names(en, [], 1), '1 more');
    assert.strictEqual(rc.names(he, [], 0), 'עוד אף אחד');
    assert.strictEqual(rc.names(he, ['יוסי', 'נועה', 'אבא'], 0), 'יוסי, נועה ואבא');
    assert.strictEqual(rc.names(he, ['יוסי'], 2), 'יוסי ועוד 2');
    assert.strictEqual(rc.names(he, [], 1), 'עוד 1');
});

test('message 1, the starter\'s, with a lie and without', () => {
    assert.strictEqual(rc.startText(en, puzzle, 'truth', null, true, URL), [
        'Bullshit #12: I hid a lie in today\'s question. Who falls for it?',
        '"In 1518, hundreds of people in Strasbourg could not stop ____ for weeks"',
        'Pick an answer, then add a lie of your own 👇', URL].join('\n'));
    assert.strictEqual(rc.startText(he, hePuzzle, 'truth', null, true, HE_URL), [
        'בולשיט #12: החבאתי שקר בשאלה של היום. מי נופל?',
        '"בשנת 1518 מאות אנשים בשטרסבורג לא הצליחו להפסיק ____ במשך שבועות"',
        'בוחרים תשובה, ואז מוסיפים שקר משלכם 👇', HE_URL].join('\n'));
    assert.strictEqual(rc.startText(en, puzzle, 'truth', 61, false, URL).split('\n')[0], 'Bullshit #12 ✅ I spotted the truth. 61% fell for a lie.');
    assert.strictEqual(rc.startText(en, puzzle, 'house', null, false, URL).split('\n')[2], 'Pick an answer, then hide a lie for the rest of us 👇');
    assert.strictEqual(rc.startText(he, hePuzzle, 'house', null, false, HE_URL).split('\n')[2], 'בוחרים תשובה, ואז מחביאים שקר לשאר הקבוצה 👇');
});

test('message 2, a player\'s: the reveal in the chat, never an answer', () => {
    const dana = [lie('Dana', 'laughing')];
    const three = [lie('Dana', 'laughing'), lie('Yossi', 'sneezing'), lie('Noa', 'yawning')];
    assert.strictEqual(rc.tellText(en, { kind: 'friend', by: 'Dana' }, dana, true, 2, URL),
        '🤥 I fell for Dana\'s lie. I hid one of my own. 2 lies in there now. Your turn: ' + URL);
    assert.strictEqual(rc.tellText(en, { kind: 'truth' }, dana, false, 1, URL), '✅ Found the truth. Dana didn\'t get me. Your turn: ' + URL);
    assert.strictEqual(rc.tellText(en, { kind: 'truth' }, three, false, 3, URL), '✅ Found the truth. None of your 3 lies got me. Your turn: ' + URL);
    assert.strictEqual(rc.tellText(en, { kind: 'truth' }, [], false, 0, URL), '✅ Found the truth. Your turn: ' + URL);
    assert.strictEqual(rc.tellText(en, { kind: 'house' }, dana, false, 1, URL), '🤥 I fell for a lie, and it wasn\'t even one of yours. Your turn: ' + URL);
    assert.strictEqual(rc.tellText(en, null, dana, true, 2, URL), 'I hid one of my own. 2 lies in there now. Your turn: ' + URL, 'played elsewhere: no pick to tell');
    // The round's first lie (a round started with no lie): never "1 lies".
    assert.strictEqual(rc.tellText(en, { kind: 'truth' }, [], true, 1, URL), '✅ Found the truth. I hid one of my own. It\'s the first lie in there. Your turn: ' + URL);
    assert.strictEqual(rc.tellText(en, { kind: 'house' }, [], true, 1, URL), '🤥 I fell for a lie, and it wasn\'t even one of yours. I hid one of my own. It\'s the first lie in there. Your turn: ' + URL);
    assert.strictEqual(rc.tellText(he, { kind: 'truth' }, [], true, 1, HE_URL), '✅ מצאתי את האמת. החבאתי שם שקר משלי, הראשון בסיבוב. תורכם: ' + HE_URL);
    for (const s of [en, he]) {
        for (let n = 1; n <= 30; n++) {
            const t = rc.tellText(s, { kind: 'truth' }, [], true, n, URL);
            assert.ok(!/(^|\D)1 (lies|שקרים)/.test(t), `no "1 lies" in ${s.lang}: ${t}`);
        }
    }
    assert.strictEqual(rc.tellText(he, { kind: 'friend', by: 'דנה' }, [lie('דנה', 'לצחוק')], true, 2, HE_URL),
        '🤥 נפלתי בשקר של דנה. החבאתי שם גם שקר משלי. יש שם כבר 2 שקרים. תורכם: ' + HE_URL);
    assert.strictEqual(rc.tellText(he, { kind: 'truth' }, [lie('דנה', 'לצחוק')], false, 1, HE_URL), '✅ מצאתי את האמת. השקר של דנה לא עבד עליי. תורכם: ' + HE_URL);
    assert.strictEqual(rc.tellText(he, { kind: 'truth' }, three, false, 3, HE_URL), '✅ מצאתי את האמת. אף אחד מ-3 השקרים שלכם לא עבד עליי. תורכם: ' + HE_URL);
    assert.strictEqual(rc.tellText(he, { kind: 'house' }, [], false, 0, HE_URL), '🤥 נפלתי בשקר, ואפילו לא של אחד מכם. תורכם: ' + HE_URL);
    const text = rc.tellText(en, { kind: 'friend', by: 'Dana' }, three, true, 4, URL);
    ['laughing', 'sneezing', 'yawning', 'dancing'].forEach(a => assert.ok(!text.includes(a), 'no answer in it'));
});

test('message 3, the score so far, and the line of a round that is over', () => {
    const b = board([lie('Dana', 'laughing', ['Yossi', 'Noa'], 1), lie('Me', 'sneezing', ['Dad'], 0, true)], 5);
    assert.strictEqual(rc.scoreText(en, 12, b, URL), 'Bullshit #12 so far: Dana\'s lie fooled 3 of 5. Mine fooled 1. Who hasn\'t played? ' + URL);
    assert.strictEqual(rc.scoreText(he, 12, b, HE_URL), 'בולשיט #12, מצב ביניים: השקר של Dana עבד על 3 מתוך 5. השקר שלי עבד על 1. מי עוד לא שיחק? ' + HE_URL);
    const lead = board([lie('Dana', 'laughing', ['Yossi'], 0), lie('Me', 'sneezing', ['Dad', 'Noa', 'Avi'], 0, true)], 5);
    assert.strictEqual(rc.scoreText(en, 12, lead, URL), 'Bullshit #12 so far: My lie fooled 3 of 5. Who hasn\'t played? ' + URL);
    assert.strictEqual(rc.scoreText(he, 12, lead, HE_URL), 'בולשיט #12, מצב ביניים: השקר שלי עבד על 3 מתוך 5. מי עוד לא שיחק? ' + HE_URL);
    const noLie = board([lie('Dana', 'laughing', ['Yossi'], 0)], 3);
    assert.strictEqual(rc.scoreText(en, 12, noLie, URL), 'Bullshit #12 so far: Dana\'s lie fooled 1 of 3. Who hasn\'t played? ' + URL, 'no lie of the sender\'s: no "Mine"');
    assert.strictEqual(rc.scoreText(en, 12, board([lie('Dana', 'laughing')], 1), URL), 'Bullshit #12 so far: No lie has fooled anyone yet. Who hasn\'t played? ' + URL);
    const won = board([lie('Dana', 'laughing', ['A', 'B', 'C'], 1), lie('Yossi', 'x', ['D'])], 7);
    assert.strictEqual(rc.overLine(en, won), 'This round is over. Dana\'s lie won: 4 of 7 fell for it.');
    assert.strictEqual(rc.overLine(he, board([lie('דנה', 'x', ['א', 'ב', 'ג', 'ד'])], 7)), 'הסיבוב הזה נגמר. השקר של דנה ניצח: 4 מתוך 7 נפלו בו.');
    assert.strictEqual(rc.overLine(en, board([], 2)), 'This round is over.');
});

test('coming back: what is new since this browser last saw the board', () => {
    const before = rc.snapshot(board([lie('Dana', 'laughing'), lie('Me', 'sneezing', ['Yossi'], 0, true)], 3));
    const after = board([lie('Dana', 'laughing'), lie('Me', 'sneezing', ['Yossi', 'Noa', 'Dad'], 0, true), lie('Noa', 'a'), lie('Dad', 'b')], 5);
    assert.strictEqual(rc.backLine(en, after, before), 'Since you played: your lie got Noa and Dad. 2 new lies.');
    assert.strictEqual(rc.backLine(he, after, before), 'מאז ששיחקת: השקר שלך עבד על Noa וDad. נוספו 2 שקרים.');
    assert.strictEqual(rc.backLine(en, board(after.lies.slice(0, 3), 4), before), 'Since you played: your lie got Noa and Dad. 1 new lie.');
    assert.strictEqual(rc.backLine(en, board(before && [lie('Dana', 'laughing'), lie('Me', 'sneezing', ['Yossi'], 0, true)], 3), before),
        'Nothing new since you played. Remind the group?');
    assert.strictEqual(rc.backLine(he, board([lie('Dana', 'laughing'), lie('Me', 'sneezing', ['Yossi'], 0, true)], 3), before), 'אין חדש מאז ששיחקת. להזכיר לקבוצה?');
    assert.strictEqual(rc.backLine(en, after, null), '', 'the first visit says nothing');
});

test('the live game card: weekdays and the weekend, by the day in Israel', () => {
    assert.strictEqual(rc.liveTitle(en, '2026-11-15', 4), '4 of you played. The full game is ten minutes, together', 'a Sunday');
    assert.strictEqual(rc.liveTitle(en, '2026-11-18', 4), '4 of you played. The full game is ten minutes, together', 'a Wednesday');
    assert.strictEqual(rc.liveTitle(en, '2026-11-19', 4), 'Seeing each other this weekend? Play the full game', 'a Thursday');
    assert.strictEqual(rc.liveTitle(he, '2026-11-21', 4), 'נפגשים בסוף השבוע? שחקו את המשחק המלא', 'a Saturday');
    assert.strictEqual(rc.liveTitle(he, '2026-11-16', 3), '3 מכם שיחקו. המשחק המלא: עשר דקות, ביחד');
});

test('the round\'s words, word for word where the spec fixes them', () => {
    assert.deepStrictEqual([en.roundTitle, en.roundSend, en.tellSend, en.scoreSend, en.playToday, en.flag, en.remove],
        ['Now fool your group', 'SEND TO YOUR GROUP', 'TELL THE GROUP', 'SEND THE SCORE', 'PLAY TODAY\'S QUESTION', 'Not OK', 'Remove my lie']);
    assert.deepStrictEqual([he.roundTitle, he.roundSend, he.tellSend, he.scoreSend, he.playToday, he.flag, he.remove],
        ['עכשיו תעבדו על הקבוצה', 'שלחו לקבוצה', 'ספרו לקבוצה', 'שלחו את התוצאות', 'לשאלה של היום', 'לא בסדר', 'הסירו את השקר שלי']);
    assert.strictEqual(en.roundFull, 'This round is full. Start your own with today\'s question.');
    assert.strictEqual(he.roundMissing, 'הסיבוב לא נטען. הנה השאלה של היום.');
    assert.strictEqual(en.playedElsewhere, 'You\'ve played today\'s, so no picking. You can still hide a lie.');
    assert.strictEqual(he.otherGroup, 'יש לכם עוד קבוצה? פתחו גם שם סיבוב');
    // The board's one plain line on keeping names and lies: nine days, in both languages.
    assert.ok(/nine days/.test(en.erased) && /תשעה ימים/.test(he.erased));
});
