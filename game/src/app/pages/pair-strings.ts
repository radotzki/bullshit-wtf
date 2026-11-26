/**
 * "Pick a decoy", a 50/50 test on two-player games (see pair.ts in the functions): the words, in the
 * game's language, and what the writing screen's decoy chooser shows.
 *
 * In a pair game each player is offered up to two house lies of their own (the same ready-made lies as
 * STUCK? GIVE ME A LIE) and picks one as their decoy. The friend sees it among the answers; a decoy that
 * fools pays its chooser half a lie's points.
 * Kept free of Angular so it can be tested in Node: game/test/pair-strings.test.js.
 */

export interface PairStrings {
    /** Above the chips: "YOUR DECOY: which one would fool Dana?" */
    label: (name: string) => string;
    /** With a single offer, there is nothing to choose: "YOUR DECOY:" and the lie. */
    single: string;
    /** Under the chips, small. */
    note: (name: string) => string;
    /**
     * Under the lie box, when a chip is tapped while the box is empty: a decoy is not a lie, and SEND
     * waits for one. Live, two Hebrew tables tapped chips and never sent a lie (see lieNudge).
     */
    nudge: string;
    /** The first question's card, under the round's points. */
    intro: string;
    /** The tag on a decoy's reveal row, where a house lie shows its tag. */
    tag: string;
    /** Across the phone of the player whose decoy fooled their friend. */
    flash: (names: string) => string;
    /** That player's result line on the reveal. */
    fooled: (names: string, points: string) => string;
    /** In place of the friend's name, when it cannot be read. */
    friend: string;
}

const en: PairStrings = {
    label: name => `YOUR DECOY: which one would fool ${name}?`,
    single: 'YOUR DECOY:',
    note: name => `If it fools ${name}, you get half points.`,
    nudge: 'Now write your own lie in the box, then SEND.',
    intro: 'Two players: each of you also picks a decoy. Every answer you see is the truth or a trap from your friend.',
    tag: 'DECOY',
    flash: names => `Your decoy fooled ${names}!`,
    fooled: (names, points) => `Your decoy fooled ${names}! ${points}`,
    friend: 'your friend',
};

// Gender-neutral throughout: "what will fool Dana" rather than "what will Dana fall for", whose verb
// would have to guess the friend's gender.
const he: PairStrings = {
    label: name => `הפיתיון שלך: מה יעבוד על ${name}?`,
    single: 'הפיתיון שלך:',
    note: name => `עובד על ${name}? חצי נקודות בשבילך`,
    nudge: 'עכשיו לכתוב שקר משלך בתיבה, ואז לשלוח.',
    intro: 'שני שחקנים: כל אחד בוחר גם פיתיון. כל תשובה שתראו היא האמת או מלכודת מהצד השני.',
    tag: 'פיתיון',
    flash: names => `הפיתיון שלך עבד על ${names}!`,
    fooled: (names, points) => `הפיתיון שלך עבד על ${names}! ${points}`,
    friend: 'הצד השני',
};

export function pairStrings(locale: string): PairStrings {
    return locale === 'he' ? he : en;
}

function key(text: string): string {
    return (text || '').trim().toLowerCase();
}

export interface DecoyView {
    /** The offers the player can still choose from: those not already typed in the box. */
    offers: string[];
    /** The chosen offer, if it is still one of `offers`; with one offer only, that one. */
    chosen: string | null;
    /** One offer only: shown as the decoy, nothing to choose. */
    single: boolean;
}

/**
 * What the chooser shows. `offers` are the player's ready-made lies, `box` what the lie box holds now
 * (STUCK? may have put an offer there, and the player's own lie is never their decoy), `chosen` the chip
 * the player tapped. No offers left: null, and the chooser hides.
 */
export function decoyView(
    offers: string[] | null | undefined,
    box: string | null | undefined,
    chosen: string | null | undefined,
): DecoyView | null {
    const typed = key(box);
    const free = (offers || []).filter(o => typeof o === 'string' && !!key(o) && key(o) !== typed);
    if (!free.length) {
        return null;
    }
    const single = free.length === 1;
    const kept = free.filter(o => key(o) === key(chosen))[0] || null;
    return { offers: free, chosen: single ? free[0] : kept, single };
}

/**
 * Show the nudge under the lie box? Only once the player has tapped a chip themself and the box is
 * still empty. A tapped chip is filled like an answer while SEND stays greyed out, so a new player can
 * take the tap for their answer and wait out the clock with no lie sent (live, 20 November: two Hebrew
 * pair games, JVGI and JVGO, picks on the first question and not one lie in either game).
 */
export function lieNudge(box: string | null | undefined, tapped: boolean): boolean {
    return !!tapped && !key(box);
}

/** The friend's name for the chooser's lines: the other players' nicknames, or '' if none is known. */
export function friendName(players: { [pid: string]: { nickname?: string } } | null | undefined, myPid: string | null | undefined): string {
    const all = players || {};
    return Object.keys(all)
        .filter(pid => pid !== myPid && !!all[pid] && typeof all[pid].nickname === 'string' && !!all[pid].nickname)
        .map(pid => all[pid].nickname)
        .join(', ');
}
