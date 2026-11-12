/**
 * Every fixed word on the screens of a running game, from the lobby to the reveal, in the game's
 * language. These screens are shared by every phone in a game, so they follow the game's language
 * (games/<pin>/locale), not each visitor's browser: a Hebrew game reads in Hebrew, right to left,
 * on every phone, and every other game keeps the English words exactly as they were.
 * Questions, answers and nicknames are never touched.
 *
 * To correct a Hebrew word, change it here: nothing else spells these words out.
 * The final screen's words are in score-board-final/final-strings.ts, the lobby's status lines in
 * game-staging/lobby-host.ts and the round-1 lie helper's in show-question/lie-helper.ts.
 * Kept free of Angular so it can be tested in Node.
 */

export interface GameStrings {
    lang: 'he' | 'en';
    dir: 'rtl' | 'ltr';
    rtl: boolean;

    // The bar on top of every game screen.
    start: string;
    pin: (pin: string) => string;
    round: (n: number) => string;
    questionOf: (n: number, total: number) => string;
    /** Big screen, in the lobby: "Join at", the address, "with Game PIN:", the PIN. */
    joinAt: string;
    withPin: string;
    leaveTitle: string;
    leaveText: string;
    keepPlaying: string;
    backHome: string;

    // The lobby and its invite.
    waitingForPlayers: string;
    onlyHostStarts: string;
    inviteFriends: string;
    inviteHint: string;
    shareLink: string;
    whatsapp: string;
    copyLink: string;
    linkCopied: string;
    done: string;
    scanToJoin: string;
    scanLabel: (pin: string) => string;

    // Before a round: two lines each. Empty while the round's points are not read yet.
    points: (n: number) => string;
    forEveryoneYouBullshit: string;
    forFindingTheTruth: string;

    // Writing a lie.
    send: string;
    tooCloseToTruth: string;
    answerSubmitted: string;

    // Picking an answer.
    whatWasTheQuestion: string;
    waitForFriends: string;

    // The reveal.
    pickedBy: string;
    nobodyFoundIt: string;
    theTruth: string;
    houseLie: string;
    bullshitBy: string;
    nobodyFellFor: string;
    next: string;
    waitingFor: (n: number) => string;
    foundTheTruth: (points: string) => string;
    fellForOurs: (points: string) => string;
    fellForOursNoPoints: string;
    fellFor: (names: string) => string;
    didNotPick: string;
    fooled: (names: string, points: string) => string;
    nobodyFellForYours: string;
    /** "Dan", "Dan and Ben", "Dan, Ben and Gal". */
    names: (names: string[]) => string;
    /** "+500", "-500": points with their sign. */
    signed: (points: number) => string;

    /** Anything that failed without a message of its own. */
    oops: string;
}

/** A number that has been read: a line built from a missing one prints nothing, never "undefined". */
function known(n: number): boolean {
    return typeof n === 'number' && !isNaN(n);
}

const en: GameStrings = {
    lang: 'en',
    dir: 'ltr',
    rtl: false,

    start: 'START',
    pin: pin => `PIN: ${pin}`,
    round: n => `ROUND ${n}`,
    questionOf: (n, total) => `${n} OF ${total}`,
    joinAt: 'Join at',
    withPin: 'with Game PIN:',
    leaveTitle: 'Don\'t leave us :(',
    leaveText: 'Do you want to leave this awesome game?',
    keepPlaying: 'KEEP PLAYING',
    backHome: 'BACK HOME',

    waitingForPlayers: 'Waiting for players..',
    onlyHostStarts: 'Only the host can start this game',
    inviteFriends: 'INVITE FRIENDS',
    inviteHint: 'Let them scan this, or send them the link',
    shareLink: 'SHARE LINK',
    whatsapp: 'WHATSAPP',
    copyLink: 'COPY LINK',
    linkCopied: 'LINK COPIED',
    done: 'DONE',
    scanToJoin: 'SCAN TO JOIN',
    scanLabel: pin => `Scan to join game ${pin}`,

    points: n => known(n) ? `${n} points` : '',
    forEveryoneYouBullshit: 'for everyone you bullshit',
    forFindingTheTruth: 'for finding the truth',

    send: 'SEND',
    tooCloseToTruth: 'You entered the correct answer! Try something else',
    answerSubmitted: 'Your answer has been submitted',

    whatWasTheQuestion: 'WHAT WAS THE QUESTION AGAIN?',
    waitForFriends: 'Let\'s wait for your friends',

    pickedBy: 'picked by',
    nobodyFoundIt: 'nobody found it',
    theTruth: 'THE TRUTH',
    houseLie: 'Home Grown Bullshit',
    bullshitBy: 'bullshit by',
    nobodyFellFor: 'Nobody fell for:',
    next: 'NEXT',
    waitingFor: n => `Waiting for ${n} ${n === 1 ? 'friend' : 'friends'}`,
    foundTheTruth: points => `You found the truth! ${points}`,
    fellForOurs: points => `You fell for our bullshit. ${points}`,
    fellForOursNoPoints: 'You fell for our bullshit. No points to lose yet!',
    fellFor: names => `You fell for ${names}'s bullshit.`,
    didNotPick: 'You didn\'t pick an answer.',
    fooled: (names, points) => `You fooled ${names}! ${points}`,
    nobodyFellForYours: 'Nobody fell for your answer.',
    names: n => n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`,
    signed: points => points > 0 ? `+${points}` : `${points}`,

    oops: 'oops, something went wrong. Please try again',
};

// Hebrew: short and plain, as players of party games say it, and without gendered verbs
// (plural for an instruction, "מצאת" and "נפלת" read either way).
const he: GameStrings = {
    lang: 'he',
    dir: 'rtl',
    rtl: true,

    start: 'מתחילים',
    pin: pin => `קוד: ${pin}`,
    round: n => `סיבוב ${n}`,
    questionOf: (n, total) => `${n} מתוך ${total}`,
    joinAt: 'הצטרפו באתר',
    // Short: the big screen shows it on one line, with the address and the PIN.
    withPin: 'עם הקוד:',
    leaveTitle: 'אל תעזבו אותנו',
    leaveText: 'לצאת מהמשחק באמצע?',
    keepPlaying: 'ממשיכים לשחק',
    backHome: 'יציאה',

    waitingForPlayers: 'מחכים לשחקנים..',
    onlyHostStarts: 'רק המארח יכול להתחיל את המשחק',
    inviteFriends: 'הזמנת חברים',
    inviteHint: 'תנו להם לסרוק את הקוד, או שלחו להם את הקישור',
    shareLink: 'שיתוף הקישור',
    whatsapp: 'וואטסאפ',
    copyLink: 'העתקת הקישור',
    linkCopied: 'הקישור הועתק',
    done: 'סיום',
    scanToJoin: 'סרקו והצטרפו',
    scanLabel: pin => `סרקו כדי להצטרף למשחק ${pin}`,

    points: n => known(n) ? `${n} נקודות` : '',
    forEveryoneYouBullshit: 'על כל מי שנופל בשקר שלכם',
    forFindingTheTruth: 'על מציאת האמת',

    send: 'שליחה',
    tooCloseToTruth: 'זאת התשובה הנכונה! נסו משהו אחר',
    answerSubmitted: 'התשובה נשלחה',

    whatWasTheQuestion: 'מה הייתה השאלה?',
    waitForFriends: 'מחכים לחברים',

    pickedBy: 'בחרו בזה:',
    nobodyFoundIt: 'אף אחד לא מצא',
    theTruth: 'האמת',
    houseLie: 'בולשיט של הבית',
    bullshitBy: 'הבולשיט של',
    nobodyFellFor: 'שקרים שאף אחד לא נפל בהם:',
    next: 'המשך',
    waitingFor: n => n === 1 ? 'מחכים לחבר אחד' : `מחכים ל־${n} חברים`,
    foundTheTruth: points => `מצאת את האמת! ${points}`,
    fellForOurs: points => `נפלת בבולשיט שלנו. ${points}`,
    fellForOursNoPoints: 'נפלת בבולשיט שלנו. עדיין אין נקודות להפסיד!',
    fellFor: names => `נפלת בבולשיט של ${names}.`,
    didNotPick: 'לא בחרת תשובה.',
    fooled: (names, points) => `עבדת על ${names}! ${points}`,
    nobodyFellForYours: 'אף אחד לא נפל בתשובה שלך.',
    names: n => n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} ו־${n[n.length - 1]}`,
    // Kept left to right inside a Hebrew line, so the sign stays in front of the number.
    signed: points => `⁦${points > 0 ? '+' + points : points}⁩`,

    oops: 'אופס, משהו השתבש. נסו שוב',
};

export function gameStrings(locale: string): GameStrings {
    return locale === 'he' ? he : en;
}
