/**
 * Is a player's lie really the true answer, typed a little differently?
 *
 * Before: a lie was refused only when it matched the truth letter for letter
 * (ignoring case). In Hebrew a player could add a prefix letter ("הלונדון"),
 * a space or quote marks and put the truth on screen as a lie, which spoils
 * the round.
 *
 * Now both texts are normalized (case, spaces, quote marks, hyphens, Hebrew
 * vowel points, end punctuation), and one leading Hebrew prefix letter or
 * English article on either side is ignored.
 *
 * This file is pure (no Firebase) so it can be unit tested.
 */

// Straight and curly quotes, backtick, Hebrew geresh and gershayim.
const QUOTES = /["'`‘’‚‛“”„‟׳״´]/g;
// Hyphens, dashes and the Hebrew maqaf read as a space: "תל-אביב" = "תל אביב".
const DASHES = /[-‐-―־]/g;
// Hebrew vowel points and cantillation marks.
const NIQQUD = /[֑-ׇ]/g;
const END_PUNCTUATION = /[.,!?;:]+$/;

// One-letter Hebrew prefixes: the, in, to, and. Others (מ, כ, ש) are left
// out: they start too many ordinary words.
const HEBREW_PREFIXES = ['ה', 'ב', 'ל', 'ו'];
const ENGLISH_ARTICLES = ['the ', 'a ', 'an '];
// A prefix is only dropped when at least this many letters are left, so short
// different words ("לחם" bread vs "חם" hot) are never matched.
const MIN_REST = 3;

export function normalizeAnswer(text: string): string {
    return (text || '')
        .normalize('NFC')
        .toLowerCase()
        // Dashes first: the maqaf sits inside the vowel-point range.
        .replace(DASHES, ' ')
        .replace(NIQQUD, '')
        .replace(QUOTES, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(END_PUNCTUATION, '')
        .trim();
}

/** The text with one leading prefix letter or article removed, if it has one. */
function withoutPrefix(text: string): string | null {
    for (const article of ENGLISH_ARTICLES) {
        if (text.startsWith(article) && text.length - article.length >= MIN_REST) {
            return text.slice(article.length);
        }
    }
    const first = text.charAt(0);
    if (HEBREW_PREFIXES.indexOf(first) >= 0) {
        const rest = text.slice(1).trim();
        if (rest.length >= MIN_REST) {
            return rest;
        }
    }
    return null;
}

export function isSameAnswer(lie: string, truth: string): boolean {
    const a = normalizeAnswer(lie);
    const b = normalizeAnswer(truth);
    if (!a || !b) {
        return false;
    }
    if (a === b) {
        return true;
    }
    // Only one side loses its prefix: dropping a letter from both would match
    // different words that share an ending ("בית" and "לית").
    return withoutPrefix(a) === b || withoutPrefix(b) === a;
}
