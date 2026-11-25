/**
 * CHALLENGE ANOTHER GROUP. On the final screen a player sends a link to another group: that group plays
 * the very same questions, and at the end both tables' scores show side by side. The server builds every
 * name and score from the games' own records (functions: controllers/challenge.ts); a link carries only
 * the challenged game's PIN and a ?via= tag. Every row goes to BigQuery `shares` with content_type
 * challenge and the challenged game's PIN in crew_id.
 *
 * Kept free of Angular so it can be tested in Node.
 */

const SITE = 'https://bullshit.wtf';

/** The content_type of the challenge's rows in BigQuery `shares` (see SHARE_METHODS in the functions). */
export const CHALLENGE_CONTENT = 'challenge';

/** How the challenge was sent, and the ?via= tag its link carries (so the game it makes carries it as campaign). */
export const CHALLENGE_TAGS = {
    whatsapp: 'challenge-whatsapp',
    native: 'challenge-share',
    copy: 'challenge-copy',
};
export type ChallengeMethod = keyof typeof CHALLENGE_TAGS;

/** The tag of a game made from a challenge link that came with no challenge tag of its own. */
export const CHALLENGE_TAG = 'challenge';
/** The tag of a game started from the page of a challenge that is over. */
export const CHALLENGE_OVER_TAG = 'challenge-over';

/** How many rows of each table the side-by-side scores show. */
export const VERSUS_ROWS = 5;

export interface ChallengeRow {
    name: string;
    score: number;
    place: number;
}

/** A challenged table, as the server sends it (ChallengeCard in game-model). */
export interface ChallengeCard {
    from: string;
    host: string;
    locale: 'en' | 'he';
    questions: number;
    played: number;
    top: number;
    rows: ChallengeRow[];
    test?: boolean;
}

function count(n: any, max: number): number | null {
    const v = Number(n);
    return typeof n === 'number' && isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null;
}

function text(s: any, max: number): string | null {
    return typeof s === 'string' ? Array.from(s).slice(0, max).join('') : null;
}

/**
 * A card from the server's answer, or null when it isn't one. Only plain strings and numbers are kept;
 * the page shows the names as text, never as markup.
 */
export function readCard(raw: any): ChallengeCard | null {
    if (!raw || typeof raw !== 'object' || typeof raw.from !== 'string' || !/^[A-Z]{1,12}$/.test(raw.from)) {
        return null;
    }
    const questions = count(raw.questions, 50);
    const played = count(raw.played, 50);
    const top = count(raw.top, 1e7);
    const host = raw.host === undefined || raw.host === null ? '' : text(raw.host, 24);
    if (!questions || played === null || top === null || host === null || !Array.isArray(raw.rows)) {
        return null;
    }
    const rows: ChallengeRow[] = [];
    for (const r of raw.rows.slice(0, 12)) {
        const name = r && text(r.name, 24);
        const score = r && count(r.score, 1e7);
        const place = r && count(r.place, 50);
        if (name === null || name === undefined || score === null || score === undefined || !place) {
            return null;
        }
        rows.push({ name, score, place });
    }
    const card: ChallengeCard = {
        from: raw.from, host, locale: raw.locale === 'he' ? 'he' : 'en', questions, played, top, rows,
    };
    if (raw.test === true) {
        card.test = true;
    }
    return card;
}

/** The challenge's link, in the game's language: the Hebrew one previews in Hebrew. */
export function challengeUrl(pin: string, locale: string, method: ChallengeMethod): string {
    return `${SITE}${locale === 'he' ? '/he' : ''}/challenge/${String(pin || '').toUpperCase()}?via=${CHALLENGE_TAGS[method]}`;
}

/**
 * The campaign of a game made from the challenge page: the link's own tag when it is a challenge tag or a
 * play-test tag (a test stays a test), else plain `challenge`.
 */
export function challengeCampaign(via: string | null | undefined): string {
    const tag = typeof via === 'string' ? via.toLowerCase().trim() : '';
    if (/^[a-z0-9][a-z0-9-]{0,39}$/.test(tag) && (/^challenge(-|$)/.test(tag) || /^test(-|$)/.test(tag))) {
        return tag;
    }
    return CHALLENGE_TAG;
}

export type Verdict = 'won' | 'lost' | 'tie';

/** How this table did against the other: by each table's best score. */
export function verdict(ourTop: number, theirTop: number): { verdict: Verdict; by: number } {
    const us = Number(ourTop) || 0;
    const them = Number(theirTop) || 0;
    return { verdict: us > them ? 'won' : us < them ? 'lost' : 'tie', by: Math.abs(us - them) };
}

/** The first rows of a table for the side-by-side scores, and how many more there are. */
export function topRows<T>(rows: T[], n = VERSUS_ROWS): { rows: T[]; more: number } {
    const list = Array.isArray(rows) ? rows : [];
    return { rows: list.slice(0, n), more: Math.max(0, list.length - n) };
}

const words = {
    en: {
        // The final screen's button and the sheet it opens.
        button: 'CHALLENGE ANOTHER GROUP',
        hint: 'Same questions, another group. Both scores side by side at the end.',
        sheetTitle: 'Challenge another group',
        sheetText: (top: number, questions: number) =>
            `They play the same ${questions} questions. Your best score to beat: ${top}.`,
        making: 'Getting your challenge ready…',
        failed: 'Could not make the challenge.',
        retry: 'TRY AGAIN',
        whatsapp: 'WHATSAPP',
        share: 'SHARE',
        copy: 'COPY LINK',
        copied: 'Copied! Paste it in their group chat.',
        done: 'DONE',
        message: (top: number, questions: number, pack?: string) => (pack === 'hanukkah'
            ? `Our Hanukkah game night of Bullshit: we scored ${top}. Same ${questions} questions, your group: can you beat us?`
            : `We scored ${top} at Bullshit. Same ${questions} questions, your group: can you beat us?`),
        shareTitle: (pack?: string): string => (pack === 'hanukkah' ? 'A Hanukkah Bullshit challenge' : 'A Bullshit challenge'),
        // The challenge link's page.
        title: 'YOU\'VE BEEN CHALLENGED',
        table: (host: string, played: number) => host ? `${host}'s table` : `A table of ${played}`,
        toBeat: 'points to beat',
        facts: (played: number, questions: number) => `${played} players · ${questions} questions`,
        text: (questions: number) =>
            `Play the same ${questions} questions with your group. At the end, both tables' scores show side by side.`,
        start: 'START THE CHALLENGE',
        startHint: 'You host it: your friends join from their phones.',
        error: 'Could not start the challenge. Try again.',
        overTitle: 'This challenge is over',
        overText: 'A challenge stays open for a week. Start a fresh game instead.',
        newGame: 'START A NEW GAME',
        // The side-by-side scores at the end of a game played against a challenge.
        label: 'THE CHALLENGE',
        us: 'YOUR TABLE',
        them: (host: string) => host ? `${host}'s table` : 'the other table',
        won: (by: number, them: string) => `You beat ${them} by ${by} points!`,
        lost: (by: number, them: string) => `${them.charAt(0).toUpperCase()}${them.slice(1)} wins by ${by} points.`,
        tie: 'A dead heat: the same best score!',
        more: (n: number) => `+${n} more`,
    },
    he: {
        button: 'אתגר לחבורה אחרת',
        hint: 'אותן שאלות, חבורה אחרת. בסוף רואים את שתי התוצאות זו לצד זו.',
        sheetTitle: 'אתגר לחבורה אחרת',
        sheetText: (top: number, questions: number) =>
            `הם משחקים באותן ${questions} שאלות, וצריכים לעבור את הניקוד הכי גבוה שלכם: ${top}.`,
        making: 'מכינים את האתגר…',
        failed: 'לא הצלחנו להכין את האתגר.',
        retry: 'לנסות שוב',
        whatsapp: 'וואטסאפ',
        share: 'שיתוף',
        copy: 'העתקת הקישור',
        copied: 'הועתק! אפשר להדביק בקבוצה שלהם.',
        done: 'סיום',
        // A Hanukkah game's challenge says it came from the family's Hanukkah night (no question in it).
        message: (top: number, questions: number, pack?: string) => (pack === 'hanukkah'
            ? `ערב בולשיט של חנוכה: עשינו ${top} נקודות. אותן ${questions} שאלות, החבורה שלכם: תצליחו לנצח אותנו?`
            : `עשינו ${top} נקודות בבולשיט. אותן ${questions} שאלות, החבורה שלכם: תצליחו לנצח אותנו?`),
        shareTitle: (pack?: string): string => (pack === 'hanukkah' ? 'אתגר חנוכה בבולשיט' : 'אתגר בבולשיט'),
        title: 'קיבלתם אתגר',
        table: (host: string, played: number) => host ? `השולחן של ${host}` : `שולחן של ${played} שחקנים`,
        toBeat: 'הניקוד שצריך לעבור',
        facts: (played: number, questions: number) => `${played} שחקנים · ${questions} שאלות`,
        text: (questions: number) =>
            `שחקו עם החבורה שלכם באותן ${questions} שאלות. בסוף תראו את התוצאות של שני השולחנות זו לצד זו.`,
        start: 'מתחילים את האתגר',
        startHint: 'אתם מארחים: החברים מצטרפים מהטלפון.',
        error: 'לא הצלחנו לפתוח את האתגר. נסו שוב.',
        overTitle: 'האתגר הזה נגמר',
        overText: 'אתגר נשאר פתוח שבוע. אפשר לפתוח משחק חדש במקום.',
        newGame: 'משחק חדש',
        label: 'האתגר',
        us: 'השולחן שלכם',
        them: (host: string) => host ? `השולחן של ${host}` : 'השולחן השני',
        won: (by: number, them: string) => `ניצחתם את ${them} ב-${by} נקודות!`,
        lost: (by: number, them: string) => `${them} ניצח ב-${by} נקודות.`,
        tie: 'תיקו: אותו ניקוד בדיוק!',
        more: (n: number) => `ועוד ${n}`,
    },
};

export type ChallengeStrings = typeof words.en;

export function challengeWords(locale: string): ChallengeStrings {
    return words[locale === 'he' ? 'he' : 'en'];
}

/** The line under the side-by-side scores. */
export function verdictLine(ourTop: number, card: ChallengeCard, locale: string): string {
    const t = challengeWords(locale);
    const v = verdict(ourTop, card.top);
    const them = t.them(card.host);
    return v.verdict === 'won' ? t.won(v.by, them) : v.verdict === 'lost' ? t.lost(v.by, them) : t.tie;
}
