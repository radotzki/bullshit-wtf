/**
 * Every word on the home menu, in the visitor's language. Hebrew visitors (arrived on /he, or a
 * browser set to Hebrew) get the menu in Hebrew, right to left; everyone else keeps the English menu.
 * Kept free of Angular so it can be tested in Node.
 */

export interface HomeStrings {
    lang: 'he' | 'en';
    dir: 'rtl' | 'ltr';
    title: string;
    /** The desktop page's heading. */
    name: string;
    subTitle: string;
    /** What the game is, in one line, above the phone menu. */
    pitch: string;
    /** One line of facts under the pitch, for a stranger from a search: price, download, who plays. */
    facts: string;
    /** The code box at the top of the home: "Got a code? [ ____ ] Join" (front-door.ts). */
    codeAsk: string;
    codePlaceholder: string;
    codeJoin: string;
    /** Said under the box when nothing was typed (a PIN is letters). */
    codeEmpty: string;
    /** The line under the pitch that opens the daily puzzle (/daily, a page outside the app). */
    daily: string;
    /** The computer home's one big button: host a game on this screen (the create flow). */
    host: string;
    /** The few words before the daily line on the computer home, for someone on their own. */
    alone: string;
    /** The line under Create on both homes, once the daily puzzle is live (daily-line.ts). */
    aloneTry: string;
    join: string;
    joinHint: string;
    joinShort: string;
    create: string;
    createHint: string;
    createShort: string;
    present: string;
    presentHint: string;
    presentShort: string;
    learn: string;
    learnHint: string;
    learnShort: string;
    crewAction: string;
    yourCrews: string;
    crewActionShort: string;
    /** A remembered crew whose game night is today: "TONIGHT 21:00: Dana's crew". */
    tonight: (time: string, crew: string) => string;
    /** The language the switch moves to, and its label (written in that language). Only the Hebrew menu shows it. */
    switchTo: 'he' | 'en';
    switchLabel: string;
}

const en: HomeStrings = {
    lang: 'en',
    dir: 'ltr',
    title: 'BULLSHIT',
    name: 'Bullshit',
    subTitle: 'Because the truth is overrated',
    pitch: 'Everyone writes a lie. One answer is true. Fool your friends.',
    // No-break spaces keep "2 to 12 players" and "no app" whole when the line wraps.
    facts: 'Free · no\u00a0app · 2\u00a0to\u00a012\u00a0players, each on their own phone',
    codeAsk: 'Got a code?',
    codePlaceholder: 'GAME PIN',
    codeJoin: 'Join',
    codeEmpty: 'Type the game PIN from the host\'s screen',
    daily: 'Today\'s question: can you spot the truth?',
    host: 'Host a game on this screen',
    alone: 'On your own?',
    aloneTry: 'On your own? Try today\'s question',
    join: 'Join Game',
    joinHint: 'Join a game by entering its PIN',
    joinShort: 'Join',
    create: 'Create Game',
    createHint: 'Set up a new game for you and your friends',
    createShort: 'Create',
    present: 'Present Game',
    presentHint: 'Click here from the device you wish to use as a presenter',
    presentShort: 'Present',
    learn: 'How Do I Play?',
    learnHint: 'Click here to learn the rules',
    learnShort: 'Learn',
    crewAction: 'SCORES & REMATCH',
    yourCrews: 'Your crews',
    crewActionShort: 'scores & rematch',
    tonight: (time, crew) => `TONIGHT ${time}: ${crew}`,
    switchTo: 'he',
    switchLabel: 'עברית',
};

const he: HomeStrings = {
    lang: 'he',
    dir: 'rtl',
    title: 'בולשיט',
    name: 'בולשיט',
    subTitle: 'כי האמת מוערכת יותר מדי',
    pitch: 'כולם ממציאים שקר. רק תשובה אחת נכונה. תעבדו על החברים.',
    facts: 'חינם · בלי\u00a0אפליקציה · 2\u00a0עד\u00a012\u00a0שחקנים, כל אחד מהטלפון שלו',
    codeAsk: 'יש לכם קוד?',
    codePlaceholder: 'קוד המשחק',
    codeJoin: 'הצטרפות',
    codeEmpty: 'הקלידו את קוד המשחק שמופיע אצל המארח',
    daily: 'השאלה של היום: תמצאו את האמת?',
    host: 'מארחים משחק על המסך הזה',
    alone: 'לבד?',
    aloneTry: 'לבד? נסו את השאלה של היום',
    join: 'הצטרפות למשחק',
    joinHint: 'הקלידו את קוד המשחק כדי להצטרף',
    joinShort: 'הצטרפות',
    create: 'משחק חדש',
    createHint: 'פתחו משחק חדש לכם ולחברים',
    createShort: 'משחק חדש',
    present: 'הצגה על מסך',
    presentHint: 'לחצו כאן מהמכשיר שישמש כמסך המשותף',
    presentShort: 'מסך',
    learn: 'איך משחקים?',
    learnHint: 'לחצו כאן כדי ללמוד את החוקים',
    learnShort: 'איך משחקים',
    crewAction: 'ניקוד ומשחק חוזר',
    yourCrews: 'החבורות שלכם',
    crewActionShort: 'ניקוד ומשחק חוזר',
    tonight: (time, crew) => `הערב ב־${time}: ${crew}`,
    switchTo: 'en',
    switchLabel: 'English',
};

export function homeStrings(locale: string): HomeStrings {
    return locale === 'he' ? he : en;
}
