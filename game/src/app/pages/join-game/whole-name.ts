/**
 * The nickname box shows 9 characters at most (the server's NICKNAME_MAX), but the server checks the
 * whole name for slurs and sex words before it cuts it (functions/src/controllers/join.ts,
 * cleanNickname). So a name longer than the box (a pasted one, or the CrazyGames username the portal
 * puts in the box) is sent whole: the box shows its first 9 characters, and the server checks every
 * character, then keeps the same first 9, or swaps a rude name for a harmless one. Cutting it here
 * first would let "a cheap whore" in as "a cheap w".
 * Kept free of Angular so it can be tested in Node (test/whole-name.test.js).
 */

/** The box's length, the server's NICKNAME_MAX (name-flag.ts). */
export const SHOWN_MAX = 9;

/** The most of a long name that is sent: far past any rude word, and no huge post. */
export const WHOLE_MAX = 64;

/** Characters, not UTF-16 units: an emoji is one, never split in half. */
export function firstChars(text: string | null | undefined, max: number): string {
    return Array.from(String(text == null ? '' : text)).slice(0, max).join('');
}

/** A long name as the box received it, and what the box shows of it. */
export interface WholeName {
    whole: string;
    shown: string;
}

/**
 * The box got a value: what it shows, and the whole name to keep when the value was longer than the
 * box (null when it fits: the box shows all of it).
 */
export function boxValue(value: string | null | undefined): { shown: string; kept: WholeName | null } {
    const text = String(value == null ? '' : value);
    const shown = firstChars(text, SHOWN_MAX);
    return { shown, kept: shown === text ? null : { whole: firstChars(text, WHOLE_MAX), shown } };
}

/**
 * A paste into the box: the whole name it makes, before the browser's maxlength cuts it. The pasted
 * text takes the selection's place, as the browser puts it. null when it fits the box.
 */
export function pastedName(before: string | null | undefined, start: number | null, end: number | null,
    pasted: string | null | undefined): string | null {
    const box = String(before == null ? '' : before);
    const from = typeof start === 'number' ? start : box.length;
    const to = typeof end === 'number' ? end : from;
    const whole = box.slice(0, from) + String(pasted == null ? '' : pasted) + box.slice(to);
    return Array.from(whole).length > SHOWN_MAX ? firstChars(whole, WHOLE_MAX) : null;
}

/**
 * What the join sends: the whole name while the box still shows the beginning that was cut from it,
 * else what the box shows (the player typed over it, or picked a crew name).
 */
export function nicknameToSend(shown: string | null | undefined, kept: WholeName | null): string {
    const box = String(shown == null ? '' : shown);
    return kept && kept.shown === box && box.trim() ? kept.whole : box;
}
