/**
 * SEND THE SCORES TO THE GROUP: one tap on the host's final screen that puts the winner and the
 * game's own link back in the group's chat (WhatsApp first, the phone's share sheet as a fallback).
 *
 * Why: guests who reopen a finished game's link a day later host from its page 2 times in 9; the
 * final screen's ask in the moment converts 1 in 116, and almost no guest ever sees that link again
 * (guest-to-host funnel read, 24 Nov 2026). This button sends the link to all of them.
 *
 * Counted in BigQuery: a press is a `shares` row, content_type `scores` (whatsapp, native, copy) with
 * the game's PIN in crew_id; the link carries ?via=scores, so its visits are tagged `scores`; the join
 * page counts its seen row as night-after seen-scores-player / seen-scores-other; and a game started
 * from that page carries campaign after-game-late-scores (so `campaign LIKE 'after-game%'` still counts
 * it). A test game's rows are dropped by the server, by the PIN.
 *
 * Kept free of Angular so it can be tested in Node.
 */

const SITE = 'https://bullshit.wtf';

/** The content_type of the button's rows in BigQuery `shares` (see SHARE_METHODS in the functions). */
export const SCORES_CONTENT = 'scores';

/** The tag the link carries (?via=scores): a visit's tag, and the join page's cue. */
export const SCORES_VIA = 'scores';

/** The campaign of a game started from the join page a ?via=scores link opened. */
export const SCORES_CREATE_TAG = 'after-game-late-scores';

/** The fewest players for the button: a game of two is a couple, not a group chat. */
export const SCORES_MIN_PLAYERS = 3;

export interface SendScoresInput {
    /** A big screen: nobody presses anything on it. */
    presenter: boolean;
    /** This phone hosted the finished game (hostedGame in host-ask.ts). */
    hosted: boolean;
    /** This phone played the game (it has a row on the final screen). */
    played: boolean;
    players: number;
    /** The game was a solo taste or run. */
    taste: boolean;
    /** The CrazyGames version: its texts send no one to bullshit.wtf. */
    portal: boolean;
}

/** The host's phone, on a real game of 3 or more, outside the portal. */
export function showSendScores(input: SendScoresInput): boolean {
    return !input.presenter && !!input.hosted && !!input.played && !input.taste && !input.portal
        && input.players >= SCORES_MIN_PLAYERS;
}

/** Words of the button, in the game's language. Hebrew avoids gendered verbs. */
export const scoresStrings = {
    en: {
        button: 'SEND THE SCORES TO THE GROUP',
        hint: 'Everyone gets the scores and the best lies.',
        other: 'Share another way',
        copied: 'Copied! Paste it in the group chat.',
        sent: 'Sent. Thanks!',
        title: 'Bullshit scores',
    },
    he: {
        button: 'לשלוח את התוצאות לקבוצה',
        hint: 'כולם יקבלו את התוצאות ואת השקרים הכי טובים.',
        other: 'שיתוף בדרך אחרת',
        copied: 'הועתק. הדביקו בקבוצה.',
        sent: 'נשלח. תודה!',
        title: 'התוצאות בבולשיט',
    },
};

export type ScoresStrings = typeof scoresStrings.en;

export function scoresWords(locale: string): ScoresStrings {
    return locale === 'he' ? scoresStrings.he : scoresStrings.en;
}

/** The game's own link, in its language, tagged ?via=scores. */
export function scoresUrl(pin: string, locale: string): string {
    return `${SITE}${locale === 'he' ? '/he' : ''}/join-game/${String(pin || '').toUpperCase()}?via=${SCORES_VIA}`;
}

export interface ScoresWinner {
    nickname: string;
    score: number;
}

/** Names joined as the final screen joins them: "A, B & C", Hebrew "א, ב וג" (ו- before Latin letters). */
function joinNames(names: string[], he: boolean): string {
    if (names.length < 2) {
        return names[0] || '';
    }
    const last = names[names.length - 1];
    const and = he ? (/^[֐-׿]/.test(last) ? ' ו' : ' ו-') : ' & ';
    return names.slice(0, -1).join(', ') + and + last;
}

/**
 * The message the host sends; the link follows on its own line. One winner, or a tie (every player in
 * first place). With no winner known, the plain line with no name.
 */
export function scoresMessage(winners: ScoresWinner[], locale: string): string {
    const he = locale === 'he';
    const list = (winners || []).filter(w => !!w && !!w.nickname);
    const score = list.length ? list[0].score || 0 : 0;
    const names = joinNames(list.map(w => String(w.nickname).replace(/\s+/g, ' ').trim()), he);
    const tail = he ? 'התוצאות, השקרים הכי טובים, ומשחק משלכם:' : 'Scores, the best lies, and a game of your own:';
    if (!list.length) {
        return he ? `🏆 המשחק בבולשיט הערב נגמר. ${tail}` : `🏆 Tonight's Bullshit is over. ${tail}`;
    }
    if (list.length > 1) {
        return he
            ? `🏆 תיקו בבולשיט הערב: ${names} עם ${score} נקודות. ${tail}`
            : `🏆 ${names} tied for tonight's Bullshit with ${score} points. ${tail}`;
    }
    return he
        ? `🏆 ${names} לקח/ה את הבולשיט הערב עם ${score} נקודות. ${tail}`
        : `🏆 ${names} won tonight's Bullshit with ${score} points. ${tail}`;
}

/** The join page came by the scores link: ?via=scores. */
export function isScoresVisit(via: any): boolean {
    return typeof via === 'string' && via.toLowerCase().trim() === SCORES_VIA;
}

/**
 * The join page's seen row for a scores visit: the night-after row it stands in for (seenMethod in
 * night-after.ts, null beside an open rematch) gets its own method, so scores visits are counted
 * apart and the night-after test's halves still compare the same visits.
 */
export function scoresSeenMethod(seen: string | null, player: boolean): string | null {
    return seen ? 'seen-scores-' + (player ? 'player' : 'other') : null;
}
