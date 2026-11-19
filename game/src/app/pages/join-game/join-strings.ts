/**
 * Every word on the PIN page and the nickname page, in the visitor's language. Hebrew visitors get
 * both pages in Hebrew, right to left; everyone else keeps the English pages. The page's language
 * is the visitor's, decided the way the Create page decides it, so the two never disagree.
 * Kept free of Angular so it can be tested in Node.
 */
import { typedHebrew } from '../../services/game-code';

export interface JoinStrings {
    lang: 'he' | 'en';
    dir: 'rtl' | 'ltr';
    title: string;
    pinHeading: string;
    nicknameHeading: string;
    /** The host's first screen after Create: the game exists, now their name (hostButton under it). */
    hostHeading: string;
    hostButton: string;
    /** A guest's line above the nickname box: who invited them and what the game is ('' host: nameless). */
    invited: (host: string) => string;
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
    /** Added to a wrong PIN that was typed with Hebrew letters: codes are English letters. */
    englishLetters: string;
}

/** A name kept apart from the sentence's direction, so "Dana" in a Hebrew line, or a Hebrew name in an English one, keeps its place. */
function isolate(name: string): string {
    return `\u2068${name}\u2069`;
}

const en: JoinStrings = {
    lang: 'en',
    dir: 'ltr',
    title: 'Bullshit',
    pinHeading: 'Enter a game PIN',
    nicknameHeading: 'Enter a nickname',
    hostHeading: 'Your game is ready. What\'s your name?',
    hostButton: 'CONTINUE',
    invited: host => host
        ? `${isolate(host)} invited you to Bullshit, a 10-minute lying game.`
        : 'You\'re invited to Bullshit, a 10-minute lying game.',
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
    englishLetters: 'Game codes are English letters.',
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
    hostHeading: 'המשחק שלכם מוכן. איך יקראו לכם?',
    hostButton: 'להמשך',
    // "מחכה" is written the same for a man and a woman, as the link's own preview says it.
    invited: host => host
        ? `${isolate(host)} מחכה לכם בבולשיט, משחק שקרים של 10 דקות.`
        : 'הוזמנתם לבולשיט, משחק שקרים של 10 דקות.',
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
    englishLetters: 'הקוד באותיות באנגלית.',
};

export function joinStrings(locale: string): JoinStrings {
    return locale === 'he' ? he : en;
}

/**
 * What to say for a failed PIN, on the PIN page and on the home's code box: the page's words for
 * the server's code and, when no game has that PIN and the guest typed Hebrew letters, that game
 * codes are English letters. Hebrew typed on a computer keyboard already reaches the right game
 * (cleanCode); on a phone's Hebrew keyboard it can't, so the guest is told what to switch to.
 * `typed` is the text as the guest typed it, before cleanCode.
 */
export function pinError(locale: string, code: string, message: string, typed: string | null | undefined): string {
    const t = joinStrings(locale);
    const said = t.error(code, message);
    if (code !== 'GAME_NOT_EXIST' || !typedHebrew(typed)) {
        return said;
    }
    const stop = /[.!?]$/.test(said) ? '' : '.';
    return `${said}${stop} ${t.englishLetters}`;
}

/**
 * The language of the PIN and nickname pages. `lang` on the address wins (the Create page sends
 * its own language along when it differs from the browser's), then the language of the game the
 * guest is joining, once it is read (an English game's link opened on a phone that last played in
 * Hebrew is English from the first tap), then a Hebrew address (/he/...), then the language this
 * browser last arrived in: the Create page's own rule. The host's page passes no game language: it
 * stays in the language of the Create page they came from.
 */
export function joinLocale(path: string, lang: string, preferred: string, gameLocale?: string): 'he' | 'en' {
    if (lang === 'he' || lang === 'en') {
        return lang;
    }
    if (gameLocale === 'he' || gameLocale === 'en') {
        return gameLocale;
    }
    if (/^\/he(\/|$)/.test(path || '')) {
        return 'he';
    }
    return preferred === 'he' ? 'he' : 'en';
}
