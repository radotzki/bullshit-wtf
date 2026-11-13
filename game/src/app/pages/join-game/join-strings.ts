/**
 * Every word on the PIN page and the nickname page, in the visitor's language. Hebrew visitors get
 * both pages in Hebrew, right to left; everyone else keeps the English pages. The page's language
 * is the visitor's, decided the way the Create page decides it, so the two never disagree.
 * Kept free of Angular so it can be tested in Node.
 */

export interface JoinStrings {
    lang: 'he' | 'en';
    dir: 'rtl' | 'ltr';
    title: string;
    pinHeading: string;
    nicknameHeading: string;
    /** A crew's rematch: the crew's name, then the question. */
    crewHeading: (crew: string) => string;
    pinPlaceholder: string;
    nicknamePlaceholder: string;
    next: string;
    join: string;
    gameOverTitle: string;
    gameOverText: (pin: string) => string;
    rematchText: (pin: string) => string;
    justEnded: string;
    joinRematch: (pin: string) => string;
    tryAnother: string;
    /** This phone's seat went to another phone with the same name (GameService.seatTaken). */
    seatTakenTitle: string;
    seatTakenText: string;
    /** What to show for a failed PIN or join: the server's code, and its (English) message. */
    error: (code: string, message: string) => string;
}

const en: JoinStrings = {
    lang: 'en',
    dir: 'ltr',
    title: 'Bullshit',
    pinHeading: 'Enter a game PIN',
    nicknameHeading: 'Enter a nickname',
    crewHeading: crew => `${crew} rematch: who are you?`,
    pinPlaceholder: 'Game PIN',
    nicknamePlaceholder: 'Nickname',
    next: 'NEXT',
    join: 'JOIN',
    gameOverTitle: 'Game over',
    gameOverText: pin => `Game ${pin} has finished. Check the PIN and try again.`,
    rematchText: pin => `Its players started a new game: ${pin}.`,
    justEnded: 'If they play again, ask for the new PIN.',
    joinRematch: pin => `JOIN ${pin}`,
    tryAnother: 'TRY ANOTHER PIN',
    seatTakenTitle: 'Someone else took this seat',
    seatTakenText: 'Another phone joined under the same name. Pick a new name to join again.',
    // The English pages show the server's own words, as before.
    error: (code, message) => message,
};

const heErrors: { [code: string]: string } = {
    GAME_NOT_EXIST: 'קוד המשחק שגוי',
    GAME_IS_FULL: 'מצטערים, המשחק מלא',
};

const he: JoinStrings = {
    lang: 'he',
    dir: 'rtl',
    title: 'בולשיט',
    pinHeading: 'הקלידו את קוד המשחק',
    nicknameHeading: 'בחרו כינוי',
    crewHeading: crew => `המשחק החוזר של ${crew}: מי אתם?`,
    pinPlaceholder: 'קוד המשחק',
    nicknamePlaceholder: 'כינוי',
    next: 'המשך',
    join: 'הצטרפות',
    gameOverTitle: 'המשחק נגמר',
    gameOverText: pin => `המשחק ${pin} הסתיים. בדקו את הקוד ונסו שוב.`,
    rematchText: pin => `השחקנים שלו פתחו משחק חדש: ${pin}.`,
    justEnded: 'אם הם משחקים שוב, בקשו את הקוד החדש.',
    joinRematch: pin => `הצטרפות למשחק ${pin}`,
    tryAnother: 'לנסות קוד אחר',
    seatTakenTitle: 'מישהו אחר תפס את המקום הזה',
    seatTakenText: 'טלפון אחר הצטרף עם אותו כינוי. בחרו כינוי חדש כדי להצטרף שוב.',
    error: code => heErrors[code] || 'אופס, משהו השתבש. נסו שוב',
};

export function joinStrings(locale: string): JoinStrings {
    return locale === 'he' ? he : en;
}

/**
 * The language of the PIN and nickname pages. `lang` on the address wins (the Create page sends
 * its own language along when it differs from the browser's), then a Hebrew address (/he/...),
 * then the language this browser last arrived in: the Create page's own rule.
 */
export function joinLocale(path: string, lang: string, preferred: string): 'he' | 'en' {
    if (lang === 'he' || lang === 'en') {
        return lang;
    }
    if (/^\/he(\/|$)/.test(path || '')) {
        return 'he';
    }
    return preferred === 'he' ? 'he' : 'en';
}
