/**
 * Every word on the Present Game page (the TV or computer that shows the game to the room), in the
 * visitor's language: a Hebrew family that taps "הצגה על מסך" on the Hebrew home gets the page in
 * Hebrew, right to left, as the join page does (joinLocale). Kept free of Angular, for Node tests.
 */

export interface PresentStrings {
    lang: 'he' | 'en';
    dir: 'rtl' | 'ltr';
    title: string;
    heading: string;
    placeholder: string;
    present: string;
    /** No game has this code: what the TV says, instead of a lobby nobody can join. */
    notFound: (pin: string) => string;
    /** Said after notFound when the code was typed in Hebrew letters that name no game either. */
    englishLetters: string;
    error: string;
}

const en: PresentStrings = {
    lang: 'en',
    dir: 'ltr',
    title: 'Bullshit',
    heading: 'Enter a game PIN',
    placeholder: 'Game PIN',
    present: 'PRESENT',
    notFound: (pin: string) => `No game has the code ${pin}. Check the code on the host's phone.`,
    englishLetters: 'Game codes are English letters.',
    error: 'Oops, something went wrong. Please try again.',
};

const he: PresentStrings = {
    lang: 'he',
    dir: 'rtl',
    title: 'בולשיט',
    heading: 'מקלידים את קוד המשחק',
    placeholder: 'קוד המשחק',
    present: 'הצגה על המסך',
    notFound: (pin: string) => `אין משחק עם הקוד ${pin}. בדקו את הקוד בטלפון של מי שפתח את המשחק.`,
    englishLetters: 'הקוד באותיות באנגלית.',
    error: 'אופס, משהו השתבש. נסו שוב.',
};

export function presentStrings(locale: string): PresentStrings {
    return locale === 'he' ? he : en;
}
