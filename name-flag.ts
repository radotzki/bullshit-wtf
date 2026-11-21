// The nickname filter: is a name a slur or a sex word? Shared by the functions and the game
// (copied in by copy-shared.js, like game-model.ts). The word lists are in name-lists.json in the
// repo root; growth spec: names about hate or sex are swapped for a sweet name, nothing else is.
// Written for the game's TypeScript 2.3 and ES5: no for..of on strings, no regex u flag.
import { NAME_LISTS } from './name-lists';

export type NameFlag = 'hate' | 'sex';

/** Longest nickname the server keeps. The join page allows the same. */
export const NICKNAME_MAX = 9;

const CHAR_MAP: { [c: string]: string } = {
    '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i',
    // Hebrew final letters
    'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ',
    // Cyrillic look-alikes: а е о р с х і у ѕ ј
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'і': 'i', 'у': 'y', 'ѕ': 's', 'ј': 'j',
    // Small capitals, as "fancy text" keyboards type them (ꜰᴜᴄᴋ); NFKC leaves them as they are.
    'ᴀ': 'a', 'ʙ': 'b', 'ᴄ': 'c', 'ᴅ': 'd', 'ᴇ': 'e', 'ꜰ': 'f', 'ɢ': 'g', 'ʜ': 'h', 'ɪ': 'i', 'ᴊ': 'j',
    'ᴋ': 'k', 'ʟ': 'l', 'ᴍ': 'm', 'ɴ': 'n', 'ᴏ': 'o', 'ᴘ': 'p', 'ʀ': 'r', 'ꜱ': 's', 'ᴛ': 't', 'ᴜ': 'u',
    'ᴠ': 'v', 'ᴡ': 'w', 'ʏ': 'y', 'ᴢ': 'z',
    // Signs that are drawn as a letter: ƒ (florin), ¢ (cent), © (copyright)
    'ƒ': 'f', '¢': 'c', '©': 'c',
};
// Letters in boxes and circles that NFKC leaves as they are (🅵🆄🅲🅺, 🅕🅤🅒🅚, 🇫🇺🇨🇰): two UTF-16 units each,
// the first 0xD83C, the second in one of these runs of 26, A to Z.
const BOXED_LOW = [0xDD50, 0xDD70, 0xDDE6];
// Accents and other marks on a letter ("fúck"), once NFKD has taken them off it.
const MARKS = /[\u0300-\u036f]/g;

// Hebrew niqqud and cantillation, and invisible characters.
const STRIP = /[֑-ׇ​-‏‪-‮⁠﻿]/g;
const NOT_LETTER = /[^a-zא-ת]/g;
const NOT_LETTERS = /[^a-zא-ת]+/;

/** Step 1 of the spec: NFKC with accents taken off, lower case, no marks or invisible characters, look-alikes mapped. */
export function normalizeName(s: string): string {
    s = String(s == null ? '' : s);
    if (typeof (s as any).normalize === 'function') {
        s = (s as any).normalize('NFKD').replace(MARKS, '').normalize('NFKC');
    }
    s = s.toLowerCase().replace(STRIP, '');
    let out = '';
    for (let i = 0; i < s.length; i++) {
        const c = s.charAt(i);
        if (s.charCodeAt(i) === 0xD83C && i + 1 < s.length) {
            const low = s.charCodeAt(i + 1);
            const run = BOXED_LOW.filter(b => low >= b && low < b + 26)[0];
            if (run) {
                out += String.fromCharCode(97 + low - run);
                i++;
                continue;
            }
        }
        out += Object.prototype.hasOwnProperty.call(CHAR_MAP, c) ? CHAR_MAP[c] : c;
    }
    return out;
}

/** Only a to z and Hebrew letters, everything else removed. */
function squash(normalized: string): string {
    return normalized.replace(NOT_LETTER, '');
}

function tokens(normalized: string): string[] {
    return normalized.split(NOT_LETTERS).filter(t => !!t);
}

interface Tier {
    any: string[];
    start: string[];
    word: { [w: string]: boolean };
    raw: string[];
}

function prepare(t: any): Tier {
    const norm = (list: string[]) => (list || []).map(e => squash(normalizeName(e))).filter(e => !!e);
    const word: { [w: string]: boolean } = {};
    norm(t && t.word).forEach(w => word[w] = true);
    return { any: norm(t && t.any), start: norm(t && t.start), word, raw: ((t && t.raw) || []).slice() };
}

// List entries are normalized once, the same way as names (Hebrew finals especially).
const HATE = prepare((NAME_LISTS as any).hate);
const SEX = prepare((NAME_LISTS as any).sex);
const ALLOW: { [w: string]: boolean } = {};
((NAME_LISTS as any).allow || []).forEach((a: string) => ALLOW[squash(normalizeName(a))] = true);

function hits(t: Tier, raw: string, sq: string, toks: string[]): boolean {
    if (t.any.some(e => sq.indexOf(e) >= 0)) {
        return true;
    }
    if (t.start.some(e => toks.some(tk => tk.indexOf(e) === 0))) {
        return true;
    }
    if (t.word[sq] || toks.some(tk => !!t.word[tk])) {
        return true;
    }
    return t.raw.some(e => raw.indexOf(e) >= 0);
}

// Signs that hide one letter or more inside a word ("b*tch", "f@ck", "d#ck", "c.nt", "b🐝tch", "ז*ן"): any
// sign at all, bar a space. A run of k signs stands for 1 to k letters (at most 3); "a**hole" is "asshole".
const HIDDEN_MAX = 3;
const LETTER = /^[a-zא-ת]$/;
const WILD_SIGNS = '@$!';
export type Piece = string | number;
// An apostrophe and an English ending end a word ("Hooke's", "pen's", "who'd"): the apostrophe hides no letter.
// "'t" only after an n ("don't", "can't"): "sl't" still hides a letter.
const ENDING = /(['’`](s|d|m|re|ll|ve)|n['’`]t)$/i;
// A geresh after these Hebrew letters is part of the letter (ז'ן is Jean, צ'יפס is chips), not a hidden one.
const GERESH = /([גזצץת])['׳’`]/g;
const HE_ANY = /[א-ת]/;
const DIGIT = /[0-9]/;

/**
 * One word, as letters and hidden-letter runs (numbers), or null if nothing is hidden inside it. `wild` are
 * the look-alike signs that count as hidden letters too ("f@ck" is not "fack").
 */
export function hiddenPattern(token: string, wild: string = WILD_SIGNS): Piece[] | null {
    const pieces: Piece[] = [];
    token = token.replace(ENDING, m => /^n/i.test(m) ? 'n' : '').replace(GERESH, '$1');
    let real = 0;
    const hebrew = HE_ANY.test(token);
    for (let i = 0; i < token.length; i++) {
        // A character outside the first plane (an emoji) is two UTF-16 units: one sign.
        const code = token.charCodeAt(i);
        const c = code >= 0xD800 && code < 0xDC00 && i + 1 < token.length ? token.substr(i++, 2) : token.charAt(i);
        const n = normalizeName(c);
        if (!n) {
            continue;
        }
        // In a Hebrew word a digit is no Latin letter but a hidden Hebrew one ("ז1ן").
        if (LETTER.test(n) && wild.indexOf(c) < 0 && !(hebrew && DIGIT.test(c))) {
            pieces.push(n);
            if (!DIGIT.test(c) && WILD_SIGNS.indexOf(c) < 0) {
                real++;
            }
        } else if (typeof pieces[pieces.length - 1] === 'number') {
            pieces[pieces.length - 1] = Math.min(HIDDEN_MAX, (pieces[pieces.length - 1] as number) + 1);
        } else {
            pieces.push(1);
        }
    }
    while (typeof pieces[0] === 'number') {
        pieces.shift();
    }
    while (typeof pieces[pieces.length - 1] === 'number') {
        pieces.pop();
    }
    const letters = pieces.filter(p => typeof p === 'string').length;
    const hidden = pieces.filter(p => typeof p === 'number').length;
    // Three or more letters one at a time between signs are initials ("C.S.I", "s.h.e"), or a word spelled out
    // (wordsRefused). Two are a word with one hidden letter ("ז*ן", "ח*א").
    const initials = pieces.every((p, j) => j === 0 || typeof p === 'number' || typeof pieces[j - 1] === 'number');
    // Digits and signs alone are a number, a time or a date ("4.5", "4-5", "4:55", "25.9.23"), never a word.
    return real && hidden && !(initials && letters >= 3) && letters >= 2 && letters >= hidden ? pieces : null;
}

/** Whether the pieces spell `t` exactly, or, with `start`, the beginning of a word that starts with `t`. */
export function spells(pieces: Piece[], t: string, start: boolean, p: number = 0, at: number = 0): boolean {
    if (p === pieces.length) {
        return at === t.length;
    }
    const piece = pieces[p];
    if (typeof piece === 'string') {
        if (t.charAt(at) !== piece) {
            return false;
        }
        // A word start is matched once its last letter is typed: "mother-in-law" is not "motherf…".
        return (start && at + 1 === t.length) || spells(pieces, t, start, p + 1, at + 1);
    }
    for (let k = 1; k <= piece && at + k < t.length + (start ? 0 : 1); k++) {
        if (spells(pieces, t, start, p + 1, at + k)) {
            return true;
        }
    }
    return false;
}

/**
 * A name with letters hidden inside a word ("wh*re", "p*ssy", "n!gg@"), read against a tier's lists: its
 * words whole, its starts at a word's start, and its anywhere-strings from any typed letter on.
 */
function hiddenHits(t: Tier, raw: string): boolean {
    // In a name other signs join two parts ("Mary-Jane", "O'Neil", "dan_k", "AC/DC", a link), and so do digits
    // that look like no letter: they hide none. Stars, hashes and emoji do ("wh*re", "p#ssy").
    // Spaces as JavaScript's \s lists them, bar U+FEFF, which hides inside a word.
    return raw.split(/[ \t\n\r\f\v\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000!"$-)+-\/:-?\[-`{-~’2689]+/).some(token => {
        // "@", "$" and "!" are read as the letters they look like (normalizeName): "Ke$ha" and "Ni$$an" are names.
        const pieces = hiddenPattern(token, '');
        if (!pieces) {
            return false;
        }
        const first = pieces[0] as string;
        if (t.start.some(e => e.charAt(0) === first && spells(pieces, e, true))
            || Object.keys(t.word).some(w => w.charAt(0) === first && spells(pieces, w, false))) {
            return true;
        }
        return pieces.some((p, i) => typeof p === 'string'
            && t.any.some(e => e.charAt(0) === p && spells(pieces.slice(i), e, true)));
    });
}

/** 'hate' or 'sex' when a nickname (or crew name) is one we swap, else null. Check the whole name, before any cut. */
export function nameFlag(name: string): NameFlag | null {
    const raw = String(name == null ? '' : name);
    const n = normalizeName(raw);
    const sq = squash(n);
    if (ALLOW[sq]) {
        return null;
    }
    const toks = tokens(n);
    if (hits(HATE, raw, sq, toks) || hiddenHits(HATE, raw)) {
        return 'hate';
    }
    if (hits(SEX, raw, sq, toks) || hiddenHits(SEX, raw)) {
        return 'sex';
    }
    return null;
}

export const SWAP_NAMES: { en: string[]; he: string[] } = (NAME_LISTS as any).swap_names;

/**
 * The sweet name a flagged player gets: picked by their uid, so the same phone gets the same name
 * every game, and the next one in the pool if someone in the game already has it.
 */
export function swapName(key: string, locale: string, taken: string[] = []): string {
    const pool = locale === 'he' ? SWAP_NAMES.he : SWAP_NAMES.en;
    const s = String(key || '');
    let h = 5381;
    for (let i = 0; i < s.length; i++) {
        h = (h * 33 + s.charCodeAt(i)) % 2147483647;
    }
    const used = taken.map(t => String(t || '').trim().toLowerCase());
    for (let i = 0; i < pool.length; i++) {
        const name = pool[(h + i) % pool.length];
        if (used.indexOf(name.toLowerCase()) < 0) {
            return name;
        }
    }
    return pool[h % pool.length];
}

/** The toast on the swapped player's own phone, once, in the lobby. */
export function swapToast(name: string, locale: string): string {
    return locale === 'he'
        ? `ניסיון יפה. השם הזה לא עובר אצלנו, אז הערב קוראים לך ${name}. את החוצפה שמרו לשקרים.`
        : `Nice try. That name's not allowed here, so tonight you're ${name}. Save the cheek for your lies.`;
}

export function crewNameRefused(locale: string): string {
    return locale === 'he' ? 'השם הזה לא עובר אצלנו. נסו שם אחר.' : 'That name\'s not allowed. Try another one.';
}
