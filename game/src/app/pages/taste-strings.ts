/**
 * The words of the taste: the five pick-only questions a host who starts alone gets (see
 * TASTE_QUESTIONS in game-model), from the card before the first question to the final screen's invitation. (The lobby's link that
 * starts it is with the lobby's other lines, in game-staging/lobby-host.ts.)
 * In the game's language, like every game screen. Hebrew avoids gendered verbs: plural for an
 * instruction, and "מצאת" reads either way.
 * Kept free of Angular so it can be tested in Node.
 */

export interface TasteStrings {
    /** The card before the first question. */
    introTitle: (questions: number) => string;
    introHow: string;
    /** The final screen's headline: on how many questions the truth was picked. */
    found: (found: number, questions: number) => string;
    /** The final screen's invitation, in place of REMATCH. */
    askTitle: string;
    askText: string;
    invite: string;
    inviteHint: string;
}

const en: TasteStrings = {
    introTitle: n => `${n} QUICK QUESTIONS`,
    introHow: 'No lies to write. Find the truth among ours.',
    found: (found, n) => found >= n ? `${n} OF ${n}! YOU FOUND EVERY TRUTH`
        : `YOU FOUND ${found} OF ${n} TRUTHS`,
    askTitle: 'Now try it with friends',
    askText: 'That was half the game. With friends, everyone writes a lie, and you score each time someone falls for yours.',
    invite: 'INVITE FRIENDS',
    inviteHint: 'Opens a new game with a link to send',
};

const he: TasteStrings = {
    introTitle: n => `${n} שאלות מהירות`,
    introHow: 'בלי לכתוב שקרים. מצאו את האמת בין השקרים שלנו.',
    found: (found, n) => found >= n ? `${n} מתוך ${n}! מצאת את האמת בכל שאלה`
        : `מצאת את האמת ב־${found} מתוך ${n} שאלות`,
    askTitle: 'עכשיו נסו עם חברים',
    askText: 'זה היה רק חצי מהמשחק. עם חברים כל אחד כותב שקר, ומקבלים נקודות על כל מי שנופל בו.',
    invite: 'הזמנת חברים',
    inviteHint: 'נפתח משחק חדש עם קישור לשליחה',
};

export function tasteStrings(locale: string): TasteStrings {
    return locale === 'he' ? he : en;
}
