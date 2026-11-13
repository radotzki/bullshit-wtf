/**
 * Every word on the "How do I play?" page, in the visitor's language. Hebrew visitors (arrived from
 * a Hebrew page, or a browser set to Hebrew) get the page in Hebrew, right to left; everyone else
 * gets the English page. The language is decided the way the Create page decides it.
 *
 * The page says only what the game does today. test/learn-strings.test.js holds its numbers to the
 * code: the points to the round intro and the house-lie penalty, the lengths to the Create page, the
 * player limit to the join function. Change the game, and that test says which sentence to change.
 * It names no button of another page but the big screen's, which is on another device.
 * Kept free of Angular so it can be tested in Node.
 */

/** Round 1's points. Rounds 2 and 3 are these times ROUND_FACTORS. */
export const ROUND_ONE = { truth: 1000, fooled: 500, houseLie: 250 };
export const ROUND_FACTORS = [1, 1.5, 2];
export const GAME_LENGTHS = [5, 7, 9];
export const MAX_PLAYERS = 8;

export interface LearnStrings {
    lang: 'he' | 'en';
    dir: 'rtl' | 'ltr';
    title: string;
    heading: string;
    intro: string;
    /** One question, step by step. */
    steps: string[];
    pointsHeading: string;
    /** Round 1: what each thing is worth. `value` is a signed number, always read left to right. */
    points: { label: string; value: string }[];
    rounds: string;
    startHeading: string;
    start: string[];
    /** The big screen, an option: the words before the address, the address, and the words after it
     * (with their own leading space or comma). */
    screenBefore: string;
    screenAddress: string;
    screenAfter: string;
    rematch: string;
    create: string;
    havePin: string;
    join: string;
    /** The language the switch moves to, and its label (written in that language). Only the Hebrew page shows it. */
    switchTo: 'he' | 'en';
    switchLabel: string;
}

const lengths = (or: string) => `${GAME_LENGTHS.slice(0, -1).join(', ')} ${or} ${GAME_LENGTHS[GAME_LENGTHS.length - 1]}`;

const en: LearnStrings = {
    lang: 'en',
    dir: 'ltr',
    title: 'Bullshit',
    heading: 'How do I play?',
    intro: 'A game for friends in one room. Everyone plays on their own phone: no app, no sign-up.',
    steps: [
        'A strange true fact appears, with a piece missing.',
        'Everyone writes a lie to fill the gap: one that sounds true enough to fool the others. Be quick, the clock is running.',
        'All the lies appear together with the truth, and with a few lies the game adds itself. Everyone picks the answer they believe.',
        'The truth comes out, and you see who fell for whose lie.',
    ],
    pointsHeading: 'Points',
    points: [
        { label: 'You find the truth', value: `+${ROUND_ONE.truth}` },
        { label: 'Each friend who picks your lie', value: `+${ROUND_ONE.fooled}` },
        { label: 'You fall for one of the game\'s lies', value: `-${ROUND_ONE.houseLie}` },
    ],
    rounds: 'A game has three rounds, and the points grow: one and a half times as much in round 2, double in round 3. '
        + 'Whoever has the most points at the end wins.',
    startHeading: 'How to start',
    start: [
        `One of you creates a game and picks its language and length: ${lengths('or')} questions.`,
        `The game gives a PIN of four letters. Everyone else joins on their own phone: they type the PIN on this site, `
        + `or use the link or the QR code that the game's creator shows them. Up to ${MAX_PLAYERS} players.`,
        'When everyone is in, the one who created the game starts it.',
    ],
    screenBefore: 'A TV or a laptop nearby? You don\'t need one, but it can show the questions and the scores to the whole room. Open',
    screenAddress: 'bullshit.wtf',
    screenAfter: ' on it, choose Present and type the game\'s PIN. Everyone still plays on their phone.',
    rematch: 'When a game ends, one tap starts a rematch: same players, new questions.',
    create: 'Create Game',
    havePin: 'Got a PIN from a friend?',
    join: 'Join Game',
    switchTo: 'he',
    switchLabel: 'עברית',
};

// Hebrew: short and plain, plural for an instruction, and the game's own words:
// "קוד" for the PIN and "סיבוב" for one of the three rounds, as the game screens say them.
const he: LearnStrings = {
    lang: 'he',
    dir: 'rtl',
    title: 'בולשיט',
    heading: 'איך משחקים?',
    intro: 'משחק לחברים שיושבים יחד. כל אחד משחק מהטלפון שלו: בלי אפליקציה ובלי הרשמה.',
    steps: [
        'מופיעה עובדה אמיתית ומוזרה, עם חלק חסר.',
        'כל אחד ממציא שקר שמשלים אותה, כזה שנשמע אמיתי מספיק כדי לעבוד על האחרים. כדאי למהר, השעון רץ.',
        'כל השקרים מופיעים יחד עם האמת, ועם כמה שקרים שהמשחק מוסיף בעצמו. כל אחד בוחר את התשובה שהוא מאמין לה.',
        'האמת נחשפת, ורואים מי נפל בשקר של מי.',
    ],
    pointsHeading: 'נקודות',
    points: [
        { label: 'מצאתם את האמת', value: `+${ROUND_ONE.truth}` },
        { label: 'על כל חבר שבחר בשקר שלכם', value: `+${ROUND_ONE.fooled}` },
        { label: 'נפלתם בשקר של המשחק', value: `-${ROUND_ONE.houseLie}` },
    ],
    rounds: 'במשחק יש שלושה סיבובים, והנקודות גדלות: פי אחד וחצי בסיבוב 2, פי שניים בסיבוב 3. '
        + 'מי שצבר הכי הרבה נקודות בסוף מנצח.',
    startHeading: 'איך מתחילים',
    start: [
        `אחד מכם פותח משחק חדש, ובוחר שפה ואורך: ${lengths('או')} שאלות.`,
        `המשחק נותן קוד של ארבע אותיות. כל השאר מצטרפים מהטלפון שלהם: מקלידים את הקוד באתר הזה, `
        + `או נכנסים דרך הקישור או הברקוד שמי שפתח את המשחק מראה להם. עד ${MAX_PLAYERS} שחקנים.`,
        'כשכולם בפנים, מי שפתח את המשחק מתחיל אותו.',
    ],
    screenBefore: 'יש בסביבה טלוויזיה או מחשב? לא חייבים, אבל אפשר להציג עליהם את השאלות והניקוד לכל החדר. פותחים שם את',
    screenAddress: 'bullshit.wtf/he',
    screenAfter: ', לוחצים על "מסך" ומקלידים את קוד המשחק. כולם ממשיכים לשחק מהטלפון.',
    rematch: 'כשהמשחק נגמר, לחיצה אחת פותחת משחק חוזר: אותם שחקנים, שאלות חדשות.',
    create: 'משחק חדש',
    havePin: 'קיבלתם קוד מחבר?',
    join: 'הצטרפות למשחק',
    switchTo: 'en',
    switchLabel: 'English',
};

export function learnStrings(locale: string): LearnStrings {
    return locale === 'he' ? he : en;
}
