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

/*
 * Is a player's lie only part of the truth?
 *
 * Before: a lie was refused only when it was the whole truth (see isSameAnswer). In a live game the
 * truth was "גרמניה הנאצית" (Nazi Germany) and the lie "גרמניה" (Germany) went in and scored: the
 * player who picked it picked something true and lost points for it.
 *
 * Now a lie is also refused when every one of its words is a word of the truth. Words are compared
 * after normalizeAnswer, English articles in the lie are skipped, and a Hebrew prefix glued to a word
 * on either side is ignored ("וגרמניה", "הנאצית"). A lie with even one word that is not in the truth
 * still goes in: "Nazi Italy" against "Nazi Germany" is a real lie. So does a lie of numbers only
 * ("4" against "4 million"), and a word of the truth counts once ("שש שש" against "שש חמש").
 *
 * A lie that leaves out a word that changes the truth's meaning (no, not, half, second, לא, אין, חצי
 * and a few more: MEANING_WORDS), and keeps the word it turns, also goes in: "an hour" against "half an
 * hour" and "work" against "do no work" are different answers, so fair lies.
 */

// Words that carry nothing of their own, skipped in the lie: "the Germany" is "Germany".
const SKIPPED_WORDS = ['the', 'a', 'an'];
// Hebrew prefixes, from the letters ה ו ב ל מ ש and their usual pairs. ה ו ב ל are dropped when at
// least MIN_REST letters are left. מ and ש start too many ordinary words ("שמים", "משפחה") to drop
// alone from a short word, so alone they need MIN_REST_MEM_SHIN letters left.
const WORD_PREFIXES = [
    'וה', 'וב', 'ול', 'ומ', 'וש', 'מה', 'שה', 'שב', 'של', 'שמ', 'ומה', 'ושה',
    'ה', 'ו', 'ב', 'ל', 'מ', 'ש',
];
const MIN_REST_MEM_SHIN = 5;
// Punctuation at either end of a word: "Germany," is "Germany". Inside a word it stays: "1.5" is not "5".
const EDGE_PUNCTUATION = /^[,.;:!?()\[\]\/&+]+|[,.;:!?()\[\]\/&+]+$/g;
// A number alone: "4" against "4 million" is a real lie, so a lie of numbers only is never refused here.
const NUMBER = /^[\d.,%]+$/;

// Words that turn a phrase into another answer: "an hour" is not "half an hour", "work" is the opposite
// of "do no work". When the truth has one of these and the lie leaves it out, the lie is a different
// answer and goes in. Kept short on purpose: each word here lets more lies through.
const MEANING_WORDS = [
    'no', 'not', 'never', 'without', 'half', 'second',
    'dont', 'doesnt', 'didnt', 'isnt', 'arent', 'wasnt', 'werent', 'cant', 'cannot', 'wont',
    'לא', 'אין', 'אינו', 'אינה', 'אינם', 'אינן', 'בלי', 'ללא', 'חצי',
];
// The only prefixes taken off a truth's word to find a meaning word in it: "ולא" (and not), "שלא"
// (that not), "וחצי" (and a half). Not מ, ה, ב or ל: "מלא" is "full", "הלא" and "בלא" are rare.
const MEANING_PREFIXES = ['ו', 'ש', 'וש'];

function isMeaningWord(word: string): boolean {
    if (MEANING_WORDS.indexOf(word) >= 0) {
        return true;
    }
    return MEANING_PREFIXES.some(p => word.startsWith(p) && MEANING_WORDS.indexOf(word.slice(p.length)) >= 0);
}

function wordsOf(text: string): string[] {
    return normalizeAnswer(text).split(' ').map(w => w.replace(EDGE_PUNCTUATION, '')).filter(w => w);
}

/** Is `long` the word `short` with one of the Hebrew prefixes in front? */
function prefixedWord(long: string, short: string): boolean {
    if (long.length <= short.length || !long.endsWith(short) || short.length < MIN_REST) {
        return false;
    }
    const prefix = long.slice(0, long.length - short.length);
    if (WORD_PREFIXES.indexOf(prefix) < 0) {
        return false;
    }
    return (prefix === 'מ' || prefix === 'ש') ? short.length >= MIN_REST_MEM_SHIN : true;
}

function sameWord(a: string, b: string): boolean {
    return a === b || prefixedWord(a, b) || prefixedWord(b, a);
}

/**
 * Does every word of `part` appear among the words of `whole`, each word of `whole` used once?
 * English articles in `part` are skipped; `part` with no other word, or with numbers only, is never
 * inside anything.
 */
export function wordsWithin(part: string, whole: string): boolean {
    const words = wordsOf(part).filter(w => SKIPPED_WORDS.indexOf(w) < 0);
    const wholeWords = wordsOf(whole);
    if (!words.length || !wholeWords.length || words.every(w => NUMBER.test(w))) {
        return false;
    }
    // Each word of `whole` stands for one word of `part`: "שש שש" (six six) is not in "שש חמש".
    const used = wholeWords.map(() => false);
    const within = words.every(w => {
        const i = wholeWords.findIndex((t, k) => !used[k] && sameWord(w, t));
        if (i < 0) {
            return false;
        }
        used[i] = true;
        return true;
    });
    return within && !changesMeaning(wholeWords, used);
}

/**
 * Does `part` leave out a meaning word of `whole` (MEANING_WORDS) and keep the word it turns: "an hour"
 * for "half an hour", "work" for "do no work", "best bed" for "second-best bed"? Then `part` is another
 * answer. Leaving out the turned word too keeps it a part of the truth: "bed" is still the "second-best
 * bed", "בוער" still "בוער בלי הפסקה". A meaning word at the end has no word to turn: "שעה" for "שעה
 * וחצי" is another answer.
 */
function changesMeaning(wholeWords: string[], used: boolean[]): boolean {
    return wholeWords.some((w, i) => {
        if (used[i] || !isMeaningWord(w)) {
            return false;
        }
        let j = i + 1;
        while (j < wholeWords.length && SKIPPED_WORDS.indexOf(wholeWords[j]) >= 0) {
            j++;
        }
        return j >= wholeWords.length || used[j];
    });
}

/** Is the lie the truth, or a part of it (all its words are the truth's words)? */
export function isPartOfTruth(lie: string, truth: string): boolean {
    return isSameAnswer(lie, truth) || wordsWithin(lie, truth);
}
