/**
 * The words of the host's own questions on the game screens (see OwnQuestion in game-model): the host
 * wrote the question and knows its truth, so they write a lie and do not pick; everyone else plays it as
 * any question. In the game's language, like every game screen. Hebrew avoids gendered verbs, as the
 * About questions' words do: plural for an instruction, and a name never takes a verb.
 * Kept free of Angular so it can be tested in Node: game/test/own-strings.test.js.
 */

export interface OwnStrings {
    /** The host's writing screen. */
    youTitle: string;
    youHint: string;
    /** Everyone else's writing screen, with the host's name, or without it when it is unknown. */
    lieHint: (name: string) => string;
    lieHintNoName: string;
    /** The big screen, all through the question. */
    bigScreen: (name: string) => string;
    bigScreenNoName: string;
    /** The host's answers screen: they watch. */
    youWatch: string;
    /** The host's line on the reveal, in place of "You didn't pick an answer." */
    youKnew: string;
}

const en: OwnStrings = {
    youTitle: 'YOUR OWN QUESTION',
    youHint: 'You know the truth. Write a lie to fool them. You sit this pick out.',
    lieHint: name => `${name}'s own question. Write a lie that fits.`,
    lieHintNoName: 'The host\'s own question. Write a lie that fits.',
    bigScreen: name => `${name}'s own question`,
    bigScreenNoName: 'The host\'s own question',
    youWatch: 'Your question. Watch them hunt for the truth.',
    youKnew: 'Your question: you knew the truth, so no pick.',
};

const he: OwnStrings = {
    youTitle: 'השאלה שלך',
    youHint: 'האמת אצלך. כתבו שקר שיעבוד עליהם. את הבחירה הזאת מדלגים.',
    lieHint: name => `השאלה של ${name}. כתבו שקר שמתאים.`,
    lieHintNoName: 'שאלה מהמארחים. כתבו שקר שמתאים.',
    bigScreen: name => `השאלה של ${name}`,
    bigScreenNoName: 'שאלה מהמארחים',
    youWatch: 'השאלה שלך. עכשיו הם מחפשים את האמת.',
    youKnew: 'השאלה שלך: האמת אצלך, אז בלי בחירה.',
};

export function ownStrings(locale: string): OwnStrings {
    return locale === 'he' ? he : en;
}

/** The line under an own question's text: the host's own hint, a friend's hint, or null on a bank question. */
export function ownLine(t: OwnStrings, view: { ownMe: boolean; ownName: string } | null, presenter: boolean): string | null {
    if (!view) {
        return null;
    }
    if (presenter) {
        return view.ownName ? t.bigScreen(view.ownName) : t.bigScreenNoName;
    }
    if (view.ownMe) {
        return t.youHint;
    }
    return view.ownName ? t.lieHint(view.ownName) : t.lieHintNoName;
}
