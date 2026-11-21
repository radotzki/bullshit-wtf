/**
 * The lie helper on the writing screen, in the game's language.
 *   - Every game, every question: "Your lie" in the box. It is also the box's accessible name
 *     (aria-label), so a screen reader names the box on every question, not only while it is empty.
 *   - Games with coach: true, questions 1 and 2: a line above the box that says what to write.
 *   - Games with coach: true, round 1 only: STUCK? GIVE ME A LIE under SEND, which fills the box
 *     with a ready-made lie. A second tap swaps in a second one; then the button goes away. Round 1
 *     only by design: in the 50/50 test the lie drop after round 1 was the same with the helper and
 *     without it, so later rounds keep the plain screen (bar the box's name).
 *   Until 20 November 2026 the box had no name from round 2 on (question 3 of a 5-question game).
 * Kept free of Angular so it can be tested in Node.
 */

export interface LieHelperStrings {
    hint: string;
    placeholder: string;
    giveMeALie: string;
}

const en: LieHelperStrings = {
    hint: 'Make up a fake answer that sounds true. +500 for every friend who picks it.',
    placeholder: 'Your lie',
    giveMeALie: 'STUCK? GIVE ME A LIE',
};

const he: LieHelperStrings = {
    hint: 'המציאו תשובה מזויפת שנשמעת אמיתית. 500+ על כל חבר שבוחר בה.',
    placeholder: 'השקר שלך',
    giveMeALie: 'תקועים? תנו לי שקר',
};

export function lieHelperStrings(locale: string): LieHelperStrings {
    return locale === 'he' ? he : en;
}

export interface LieHelperView {
    /** The line above the box, or null. */
    hint: string | null;
    /** The box's placeholder and accessible name. */
    placeholder: string;
    /** The give-me-a-lie button's text, or null when there is no button. */
    button: string | null;
}

/**
 * What the writing screen shows.
 * `ideas` are this player's ready-made lies; `used` is how many of them were already put in the box.
 */
export function lieHelperView(
    coach: boolean,
    roundIndex: number,
    questionIndex: number,
    locale: string,
    ideas: string[] | null | undefined,
    used: number,
): LieHelperView {
    const s = lieHelperStrings(locale);
    if (!coach || (roundIndex || 0) !== 0) {
        return { hint: null, placeholder: s.placeholder, button: null };
    }

    const left = (ideas || []).length - (used || 0);

    return {
        // Only the first two questions of the game: by then a player knows what to write.
        hint: (questionIndex || 0) <= 1 ? s.hint : null,
        placeholder: s.placeholder,
        button: left > 0 ? s.giveMeALie : null,
    };
}

/** The lie a tap on the button puts in the box (the first tap gets the first, the second the second). */
export function nextIdea(ideas: string[] | null | undefined, used: number): string | null {
    const list = ideas || [];
    return used >= 0 && used < list.length ? list[used] : null;
}
