/**
 * The words of the "About us" questions (see aboutOf in game-model): a question about one of the
 * players, who writes the truth while everyone else writes a lie about them.
 * In the game's language, like every game screen. Hebrew avoids gendered verbs: plural for an
 * instruction, an impersonal plural for "they found it", and a name never takes a verb.
 * Kept free of Angular so it can be tested in Node: game/test/about-strings.test.js.
 */

export interface AboutStrings {
    /** The writing screen of the player the question is about. */
    youTitle: string;
    youHint: string;
    sendTruth: string;
    placeholder: string;
    truthIn: string;
    /** The writing screen of everyone else: "Make it sound like Ben." */
    lieHint: (name: string) => string;
    /** The big screen while the room writes. */
    bigScreen: (name: string) => string;
    /** The answers screen of the player the question is about: they do not pick. */
    youWatch: string;
    /** The reveal: the truth's row is the named player's. */
    theirTruth: (name: string) => string;
    /** The named player's own result line, and the flash across their phone in the staged reveal. */
    foundYours: (names: string, points: string) => string;
    nobodyFoundYours: string;
    knowYou: (names: string) => string;
}

const en: AboutStrings = {
    youTitle: 'THIS ONE IS ABOUT YOU',
    youHint: 'Write the truth. Your friends will try to find it among their lies.',
    sendTruth: 'SEND THE TRUTH',
    placeholder: 'Your truth',
    truthIn: 'Your truth is in. Keep a straight face.',
    lieHint: name => `Write a lie that sounds like ${name}.`,
    bigScreen: name => `${name} writes the truth. Everyone else: lie.`,
    youWatch: 'Your friends are hunting for your truth',
    theirTruth: name => `${name}'S TRUTH`,
    foundYours: (names, points) => `${names} found your truth! ${points}`,
    nobodyFoundYours: 'Nobody found your truth. Do they know you at all?',
    knowYou: names => `${names} know${/ and /.test(names) ? '' : 's'} you!`,
};

const he: AboutStrings = {
    youTitle: 'השאלה הזאת עליך',
    youHint: 'כתבו את האמת. החברים ינסו למצוא אותה בין השקרים שלהם.',
    sendTruth: 'שליחת האמת',
    placeholder: 'האמת שלך',
    truthIn: 'האמת שלך בפנים. פרצוף פוקר.',
    lieHint: name => `כתבו שקר שנשמע כמו ${name}.`,
    bigScreen: name => `האמת אצל ${name}. כל השאר: לשקר.`,
    youWatch: 'החברים מחפשים את האמת שלך',
    theirTruth: name => `האמת של ${name}`,
    foundYours: (names, points) => `מצאו את האמת שלך: ${names}! ${points}`,
    nobodyFoundYours: 'אף אחד לא מצא את האמת שלך. מכירים אותך בכלל?',
    knowYou: names => `מכירים אותך: ${names}!`,
};

export function aboutStrings(locale: string): AboutStrings {
    return locale === 'he' ? he : en;
}

/** What the named player's own result says, from the truth's row: who found it, and their points. */
export function aboutResultLine(t: AboutStrings, finders: string[], points: string, names: (n: string[]) => string): string {
    return finders.length ? t.foundYours(names(finders), points) : t.nobodyFoundYours;
}
