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
    create: string;
    error: string;
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
    create: 'CREATE',
    error: 'oops, something went wrong. Please try again',
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
    create: 'פתיחת משחק',
    error: 'אופס, משהו השתבש. נסו שוב',
};

export function createStrings(locale: string): CreateStrings {
    return locale === 'he' ? he : en;
}
