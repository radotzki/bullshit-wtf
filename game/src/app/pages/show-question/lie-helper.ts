/**
 * The round-1 lie helper on the writing screen, in the game's language.
 * Only games with coach: true get it, and only in round 1:
 *   - questions 1 and 2: a line above the box that says what to write;
 *   - all of round 1: "Your lie" in the box, and STUCK? GIVE ME A LIE under SEND, which fills the box
 *     with a ready-made lie. A second tap swaps in a second one; then the button goes away.
 * Rounds 2 and 3, and games without the helper, keep the plain screen.
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
    /** The box's placeholder, or null for none. */
    placeholder: string | null;
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
    if (!coach || (roundIndex || 0) !== 0) {
        return { hint: null, placeholder: null, button: null };
    }

    const s = lieHelperStrings(locale);
    const left = (ideas || []).length - (used || 0);

    return {
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
