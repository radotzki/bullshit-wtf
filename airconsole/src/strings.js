// The words only the AirConsole version has, in the game's two languages. Every word the game's
// screens share with the site comes from the site itself (game/src/app/pages/game-strings.ts and
// score-board-final/final-strings.ts), so a Hebrew fix there reaches AirConsole too.
// Hebrew avoids gendered verbs, as the site's strings do: plural for an instruction.

const en = {
    tagline: 'Write a lie. Find the truth. Fool your friends.',
    loading: 'Loading the game…',
    joinWithPhones: 'Join with your phone: everyone is a player',
    players: (n, max) => `${n} of ${max} players`,
    needMore: n => n === 1 ? 'Needs 1 more player to start' : `Needs ${n} more players to start`,
    masterStarts: name => `${name} starts the game from their phone`,
    languageLine: 'The first player can switch the game to Hebrew',
    switchLanguage: 'עברית',
    noGame: 'Could not open a game. Trying again…',
    lateJoin: 'Joined in the middle? You start with 0 points.',
    writeOnPhone: 'Write a lie on your phone',
    pickOnPhone: 'Pick the truth on your phone',
    round: (n, total) => `QUESTION ${n} OF ${total}`,
    playAgainFrom: name => `${name} can start a new game from their phone`,
    bestLie: (name, text) => `${name}'s best lie: “${text}”`,

    // The controller.
    hello: name => `Hi ${name}!`,
    connecting: 'Connecting to the game…',
    joining: 'Joining the game…',
    youreIn: 'You\'re in! Look at the screen.',
    youStart: 'Start when everyone is in',
    waitStart: name => `${name} starts the game`,
    gameFull: 'This game is full (12 players). Join the next one when it starts.',
    joinFailed: 'Could not join the game. Trying again…',
    yourLie: 'Your lie',
    clear: 'CLEAR',
    pickTruth: 'Which one is the truth?',
    lookAtScreen: 'Look at the screen!',
    yourScore: n => `${n} points`,
    place: (place, total) => `Place ${place} of ${total}`,
    playAgain: 'PLAY AGAIN',
    keyboardLetters: 'ABC',
    keyboardHebrew: 'אבג',
    space: 'SPACE',
};

const he = {
    tagline: 'כותבים שקר. מוצאים את האמת. עובדים על החברים.',
    loading: 'המשחק נטען…',
    joinWithPhones: 'מצטרפים עם הטלפון: כל אחד הוא שחקן',
    players: (n, max) => `${n} מתוך ${max} שחקנים`,
    needMore: n => n === 1 ? 'צריך עוד שחקן אחד כדי להתחיל' : `צריך עוד ${n} שחקנים כדי להתחיל`,
    masterStarts: name => `${name} מתחילים את המשחק מהטלפון`,
    languageLine: 'השחקן הראשון יכול להעביר את המשחק לאנגלית',
    switchLanguage: 'English',
    noGame: 'לא הצלחנו לפתוח משחק. מנסים שוב…',
    lateJoin: 'הצטרפתם באמצע? מתחילים מ־0 נקודות.',
    writeOnPhone: 'כתבו שקר בטלפון',
    pickOnPhone: 'בחרו את האמת בטלפון',
    round: (n, total) => `שאלה ${n} מתוך ${total}`,
    playAgainFrom: name => `${name} יכולים להתחיל משחק חדש מהטלפון`,
    bestLie: (name, text) => `השקר הכי טוב של ${name}: ״${text}״`,

    hello: name => `היי ${name}!`,
    connecting: 'מתחברים למשחק…',
    joining: 'מצטרפים למשחק…',
    youreIn: 'אתם בפנים! הסתכלו על המסך.',
    youStart: 'מתחילים כשכולם בפנים',
    waitStart: name => `${name} מתחילים את המשחק`,
    gameFull: 'המשחק מלא (12 שחקנים). אפשר להצטרף למשחק הבא.',
    joinFailed: 'לא הצלחנו להצטרף. מנסים שוב…',
    yourLie: 'השקר שלכם',
    clear: 'ניקוי',
    pickTruth: 'מה האמת?',
    lookAtScreen: 'הסתכלו על המסך!',
    yourScore: n => `${n} נקודות`,
    place: (place, total) => `מקום ${place} מתוך ${total}`,
    playAgain: 'משחק חדש',
    keyboardLetters: 'ABC',
    keyboardHebrew: 'אבג',
    space: 'רווח',
};

export function airStrings(locale) {
    return locale === 'he' ? he : en;
}

export const AIR_STRINGS = { en, he };
