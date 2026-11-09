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
    // Cyrillic look-alikes: а е о р с х і у
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'х': 'x', 'і': 'i', 'у': 'y',
};

// Hebrew niqqud and cantillation, and invisible characters.
const STRIP = /[֑-ׇ​-‏‪-‮⁠﻿]/g;
const NOT_LETTER = /[^a-zא-ת]/g;
const NOT_LETTERS = /[^a-zא-ת]+/;

/** Step 1 of the spec: NFKC, lower case, no marks or invisible characters, look-alikes mapped. */
export function normalizeName(s: string): string {
    s = String(s == null ? '' : s);
    if (typeof (s as any).normalize === 'function') {
        s = (s as any).normalize('NFKC');
    }
    s = s.toLowerCase().replace(STRIP, '');
    let out = '';
    for (let i = 0; i < s.length; i++) {
        const c = s.charAt(i);
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

/** 'hate' or 'sex' when a nickname (or crew name) is one we swap, else null. Check the whole name, before any cut. */
export function nameFlag(name: string): NameFlag | null {
    const raw = String(name == null ? '' : name);
    const n = normalizeName(raw);
    const sq = squash(n);
    if (ALLOW[sq]) {
        return null;
    }
    const toks = tokens(n);
    if (hits(HATE, raw, sq, toks)) {
        return 'hate';
    }
    if (hits(SEX, raw, sq, toks)) {
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
