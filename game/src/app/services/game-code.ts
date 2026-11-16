/**
 * A game code (PIN) as a guest types it, made into the PIN the server knows. One function for every
 * box that takes a code: the home's "Got a code?" box (pages/landing/code-box.ts) and the PIN page
 * (pages/join-game).
 *
 * A PIN is capital English letters only, A to Z: the server writes a counter in base 26 with the
 * letters A-Z (functions/src/controllers/new-game.ts, generateGameName). No digits, no other signs.
 *
 * Many guests who look the game up to join a friend's table have a Hebrew keyboard up, and type the
 * code in Hebrew letters: game ABCD comes out as "שנבג". Each Hebrew letter is read as the English
 * letter on the same key of the standard Israeli keyboard (SI-1452), so the code just works. Q and W
 * carry "/" and "'" on that keyboard: they are read as Q and W only when the code also holds a
 * Hebrew letter or no English letter at all, so a stray slash in a code typed in English is
 * still dropped. Kept free of Angular, for Node tests.
 */

/** The Hebrew letter on each English letter key of the standard Israeli keyboard. */
export const HEBREW_KEYS: { [hebrew: string]: string } = {
    // Top row: Q "/" and W "'" are below; E to P.
    'ק': 'E', 'ר': 'R', 'א': 'T', 'ט': 'Y', 'ו': 'U', 'ן': 'I', 'ם': 'O', 'פ': 'P',
    // Middle row: A to L.
    'ש': 'A', 'ד': 'S', 'ג': 'D', 'כ': 'F', 'ע': 'G', 'י': 'H', 'ח': 'J', 'ל': 'K', 'ך': 'L',
    // Bottom row: Z to M.
    'ז': 'Z', 'ס': 'X', 'ב': 'C', 'ה': 'V', 'נ': 'B', 'מ': 'N', 'צ': 'M',
};

/** The signs on the Q and W keys in Hebrew (the geresh too, which some keyboards put on W). */
const HEBREW_SIGN_KEYS: { [sign: string]: string } = { '/': 'Q', '\'': 'W', '׳': 'W' };

/** The longest code the boxes take. */
export const CODE_MAX = 12;

/**
 * The typed text with every Hebrew letter put back to the English letter on its key ("שנבג" is
 * "ABCD"). Anything else stays as it was; Q's "/" and W's "'" change only beside a Hebrew letter, or
 * where no English letter was typed.
 */
export function fromHebrewKeys(typed: string | null | undefined): string {
    const text = String(typed || '');
    const signs = /[א-ת]/.test(text) || !/[A-Za-z]/.test(text);
    return text.replace(/./g, ch => HEBREW_KEYS[ch] || (signs && HEBREW_SIGN_KEYS[ch]) || ch);
}

/**
 * The PIN in what was typed: Hebrew keys read as their English letters, then its letters only,
 * upper-cased, at most 12. So "abcd", " AbCd ", "ab-cd" and "שנבג" all reach game ABCD. Nothing left: null.
 */
export function cleanCode(typed: string | null | undefined): string | null {
    const pin = fromHebrewKeys(typed).replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, CODE_MAX);
    return pin || null;
}

/**
 * Whether what was typed held a Hebrew letter. A code typed in Hebrew that still names no game was
 * most likely typed on a phone's Hebrew keyboard, where the letters don't sit on the English keys:
 * the boxes then add that game codes are English letters (pinError in pages/join-game/join-strings.ts).
 */
export function typedHebrew(typed: string | null | undefined): boolean {
    return /[א-ת]/.test(String(typed || ''));
}
