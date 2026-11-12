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
    switchTo: 'en',
    switchLabel: 'English',
};

export function homeStrings(locale: string): HomeStrings {
    return locale === 'he' ? he : en;
}
