/**
 * Every word on the Create page, in the visitor's language. Hebrew visitors (arrived from a Hebrew
 * page, or a browser set to Hebrew) get the page in Hebrew, right to left; everyone else keeps the
 * English page. The page's language is the visitor's, not the game's: picking the other game
 * language on the form does not flip the page under their thumb.
 * Kept free of Angular so it can be tested in Node.
 */

export interface CreateStrings {
    lang: 'he' | 'en';
    dir: 'rtl' | 'ltr';
    title: string;
    heading: string;
    language: string;
    english: string;
    hebrew: string;
    length: string;
    /** The word after the number of questions: "7 questions". */
    questions: string;
    special: string;
    /** The "Kids are playing" switch: its heading, its words, and the line under it while it is on. */
    players: string;
    kids: string;
    kidsNote: string;
    create: string;
    error: string;
    /** The host's own questions (see OwnQuestion in game-model): a closed section until tapped. */
    own: OwnFormStrings;
}

export interface OwnFormStrings {
    toggle: string;
    intro: string;
    hostRule: string;
    number: (n: number) => string;
    textLabel: string;
    textPlaceholder: string;
    truthLabel: string;
    truthPlaceholder: string;
    liesLabel: string;
    liePlaceholders: string[];
    add: string;
    remove: string;
    /** Why a card is not taken, by OwnProblem. */
    problems: { text: string; truth: string; lies: string; same: string; words: string };
}

const en: CreateStrings = {
    lang: 'en',
    dir: 'ltr',
    title: 'Bullshit',
    heading: 'Create new game',
    language: 'Language:',
    english: 'English',
    hebrew: 'Hebrew',
    length: 'Length:',
    questions: 'questions',
    special: 'Special:',
    players: 'Players:',
    kids: '🧒 Kids are playing',
    kidsNote: 'Questions kids of 8 to 12 get. After all 20, the usual questions.',
    create: 'CREATE',
    error: 'oops, something went wrong. Please try again',
    own: {
        toggle: '✍️ Add your own questions (optional)',
        intro: 'Up to 3 questions only your table knows. They play from question 2, in this game only.',
        hostRule: 'You know these answers, so on them you write a lie but don\'t pick.',
        number: n => `Question ${n}`,
        textLabel: 'Your question (___ is the blank)',
        textPlaceholder: 'On the class trip, Noa lost her ___',
        truthLabel: 'The true answer',
        truthPlaceholder: 'left shoe',
        liesLabel: 'Two wrong answers',
        liePlaceholders: ['phone', 'passport'],
        add: '+ Another question',
        remove: 'Remove',
        problems: {
            text: 'Write a question of 8 to 110 letters.',
            truth: 'Add the true answer (up to 30 letters).',
            lies: 'Add two wrong answers (up to 30 letters each).',
            same: 'The wrong answers must differ from the truth and from each other.',
            words: 'Some words here aren\'t allowed. Try others.',
        },
    },
};

const he: CreateStrings = {
    lang: 'he',
    dir: 'rtl',
    title: 'בולשיט',
    heading: 'משחק חדש',
    language: 'שפת המשחק:',
    english: 'אנגלית',
    hebrew: 'עברית',
    length: 'אורך המשחק:',
    questions: 'שאלות',
    special: 'מיוחד:',
    players: 'מי משחק:',
    kids: '🧒 ילדים משחקים',
    kidsNote: 'שאלות שילדים בני 8 עד 12 יבינו. אחרי כל ה־20, השאלות הרגילות.',
    create: 'פתיחת משחק',
    error: 'אופס, משהו השתבש. נסו שוב',
    own: {
        toggle: '✍️ להוסיף שאלות משלכם (לא חובה)',
        intro: 'עד 3 שאלות שרק השולחן שלכם יודע. הן מגיעות מהשאלה השנייה, ורק במשחק הזה.',
        hostRule: 'את התשובות אתם יודעים, אז בשאלות האלה כותבים שקר ולא בוחרים.',
        number: n => `שאלה ${n}`,
        textLabel: 'השאלה (___ במקום התשובה)',
        textPlaceholder: 'בטיול השנתי נועה איבדה את ה___ שלה',
        truthLabel: 'התשובה הנכונה',
        truthPlaceholder: 'נעל',
        liesLabel: 'שתי תשובות שגויות',
        liePlaceholders: ['טלפון', 'דרכון'],
        add: '+ עוד שאלה',
        remove: 'הסרה',
        problems: {
            text: 'כתבו שאלה של 8 עד 110 תווים.',
            truth: 'הוסיפו את התשובה הנכונה (עד 30 תווים).',
            lies: 'הוסיפו שתי תשובות שגויות (עד 30 תווים כל אחת).',
            same: 'התשובות השגויות צריכות להיות שונות מהאמת ואחת מהשנייה.',
            words: 'יש פה מילים שלא עוברות אצלנו. נסו אחרות.',
        },
    },
};

export function createStrings(locale: string): CreateStrings {
    return locale === 'he' ? he : en;
}
