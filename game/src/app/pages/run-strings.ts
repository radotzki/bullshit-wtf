/**
 * The words of the solo run (SoloRun in game-model): questions against the house's lies until the
 * player is fooled three times. From its first card to its final screen, and the lobby's line when
 * the run did not start by itself. In the game's language, like every game screen. Hebrew avoids
 * gendered verbs: plural for an instruction, and "מצאת" reads either way.
 * Kept free of Angular so it can be tested in Node.
 */

export interface RunStrings {
    /** The card before the first question. */
    introTitle: string;
    introHow: (lives: number) => string;
    /** The bar above each question: lives, truths found, the streak, a life given back. */
    lives: (lives: number, of: number) => string;
    found: (found: number) => string;
    streak: (streak: number) => string;
    gained: string;
    /** The final screen. */
    headline: (found: number) => string;
    best: (best: number) => string;
    newBest: string;
    longestStreak: (streak: number) => string;
    playAgain: string;
    /** The invitation, beside PLAY AGAIN. */
    askText: string;
    /** On the taste's final screen: the run, after the five questions. */
    keepGoing: string;
    keepGoingSub: (lives: number) => string;
    /** The lobby, when the solo game did not start by itself. */
    startFailed: string;
    startButton: string;
}

const en: RunStrings = {
    introTitle: 'SOLO RUN',
    introHow: n => `Find the truth among our lies. Fooled ${n} times and it's over.`,
    lives: (n, of) => `${n} of ${of} lives left`,
    found: n => `${n} found`,
    streak: n => `${n} in a row`,
    gained: '+1 LIFE!',
    headline: n => n === 0 ? 'NO TRUTH FOUND THIS TIME' : n === 1 ? 'YOU FOUND 1 TRUTH' : `YOU FOUND ${n} TRUTHS`,
    best: n => `Your best: ${n}`,
    newBest: 'NEW BEST!',
    longestStreak: n => `Longest streak: ${n} in a row`,
    playAgain: 'PLAY AGAIN',
    askText: 'Alone you only find the truth. With friends, everyone writes a lie, and you score each time someone falls for yours.',
    keepGoing: 'KEEP GOING ALONE',
    keepGoingSub: n => `Play until you're fooled ${n} times`,
    startFailed: 'The solo game didn\'t start.',
    startButton: 'START SOLO GAME',
};

const he: RunStrings = {
    introTitle: 'משחק סולו',
    introHow: n => `מצאו את האמת בין השקרים שלנו. נופלים ${n} פעמים והמשחק נגמר.`,
    lives: (n, of) => `נשארו ${n} מתוך ${of} לבבות`,
    found: n => `נמצאו: ${n}`,
    streak: n => `${n} ברצף`,
    gained: 'לב נוסף!',
    headline: n => n === 0 ? 'הפעם לא נמצאה אמת' : n === 1 ? 'מצאת אמת אחת' : `מצאת ${n} אמיתות`,
    best: n => `השיא שלך: ${n}`,
    newBest: 'שיא חדש!',
    longestStreak: n => `הרצף הארוך: ${n} ברצף`,
    playAgain: 'עוד סיבוב',
    askText: 'לבד רק מחפשים את האמת. עם חברים כל אחד כותב שקר, ומקבלים נקודות על כל מי שנופל בו.',
    keepGoing: 'להמשיך לבד',
    keepGoingSub: n => `משחקים עד שנופלים ${n} פעמים`,
    startFailed: 'משחק הסולו לא התחיל.',
    startButton: 'להתחיל משחק סולו',
};

export function runStrings(locale: string): RunStrings {
    return locale === 'he' ? he : en;
}
