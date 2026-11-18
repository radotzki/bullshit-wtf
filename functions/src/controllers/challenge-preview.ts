// A challenge link's own link preview. CHALLENGE ANOTHER GROUP (challenge.ts) sends a link,
// /challenge/<PIN> (/he/challenge/<PIN> for a Hebrew game), into another group's chat. Whether anyone
// taps it depends on its preview, so the preview leads with the night's funniest moment: the lie that
// fooled the most players at that table, and how many it fooled:
//   “Penguins have knees” fooled 4 of 5. Can your group spot the truth?
// in the game's language. firebase.json sends both paths to the joinPreview function (no new function),
// which answers with the site's own page, its preview tags rewritten here, exactly as for a join link
// (join-preview.ts): a preview fetcher reads the tags, a browser runs the app's challenge page.
//
// What it promises:
// - A preview only while the link itself works: the challenge was opened by a player of that table and
//   its week is not over (openCard in challenge.ts). Any other PIN gets the page as Hosting serves it.
// - No player's name, ever: not the host's, not the liar's, and no lie that holds a nickname of that table.
// - The lie is a player's own words, which no filter checked when it was written (only nicknames are
//   filtered), and it lands in a stranger's chat. So a lie is shown only when the nickname filter
//   (name-flag.ts) passes it, as written and with its spaces taken out, and it holds no web or mail
//   address. Otherwise the next best lie is shown, and with none left, the plain preview (no lie).
// - The best lie: the one that fooled the most players; ties go to the later question, then to more
//   points. It is cleaned of invisible characters, kept to one line and cut to LIE_MAX characters.
// - It reads only small parts of the game (CHALLENGE_PARTS), never its questions or answers, and never
//   writes.
import { ChallengeCard, GameScheme, Highlights } from '../game-model';
import { nameFlag, normalizeName } from '../name-flag';
import { openCard, qidsOf } from './challenge';
import { readPart } from './old-games';
import {
    Fetcher, JoinPreviewAnswer, Preview, PreviewLocale, SITE, imageOf, previewPage, startsRightToLeft,
} from './join-preview';

/** The longest lie a preview shows, in characters; a longer one is cut at a word and ends with "…". */
export const LIE_MAX = 60;

/** The parts of a game the challenge preview reads. */
export const CHALLENGE_PARTS = ['locale', 'state', 'timestamp', 'idle', 'qids', 'totalQ', 'players', 'creator',
    'challengeOpen', 'campaign', 'pack', 'highlights'];

/** What a challenge link's path says: the PIN and which of the site's two pages it is served from. */
export function parseChallengePath(path: any): { pin: string; shell: PreviewLocale } | null {
    // The same PINs challenge.ts takes: letters only.
    const m = /^\/(he\/)?challenge\/([A-Za-z]{1,12})\/?$/.exec(typeof path === 'string' ? path : '');
    return m ? { pin: m[2].toUpperCase(), shell: m[1] ? 'he' : 'en' } : null;
}

// Control characters, and the invisible ones that turn text around (bidi overrides and isolates).
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;
// A web or mail address: a lie is no place for a link to somewhere else.
const ADDRESS = /(https?:|www\.|@[a-z0-9]|[a-z0-9-]\.(com|net|org|info|biz|io|co|il|me|ly|ru|xyz|app|gg|tv|wtf)\b)/i;
// Letters and digits of every script the game is played in; anything else splits words.
const NOT_WORD = /[^a-z0-9\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff\u0590-\u05ff\u0600-\u06ff]+/;
// Hebrew one-letter prefixes (and, the, in, to, from, that, as): "ולדנה" still names "דנה".
const HE_PREFIX = /^[\u05d5\u05d4\u05d1\u05dc\u05de\u05e9\u05db]{1,2}$/;

/** A lie as one clean line, or '' when there is nothing to show. */
export function cleanLie(text: any): string {
    return typeof text === 'string' ? text.replace(/\s+/g, ' ').replace(INVISIBLE, '').replace(/ +/g, ' ').trim() : '';
}

/** The lie cut to LIE_MAX characters, at a word when one ends late enough, with "…". */
export function cutLie(lie: string): string {
    const chars = Array.from(lie);
    if (chars.length <= LIE_MAX) {
        return lie;
    }
    const head = chars.slice(0, LIE_MAX - 1).join('');
    const space = head.lastIndexOf(' ');
    return (space >= LIE_MAX / 2 ? head.slice(0, space) : head).replace(/[\s.,;:!?\-\u2013\u2014]+$/, '') + '\u2026';
}

function words(text: string): string[] {
    return normalizeName(text).split(NOT_WORD).filter(w => !!w);
}

/** The lie names a player of the table: a nickname's words appear in it, in a row (a Hebrew prefix allowed). */
export function namesAPlayer(lie: string, nicknames: string[]): boolean {
    const lieWords = words(lie);
    return nicknames.some(nickname => {
        const name = words(typeof nickname === 'string' ? nickname : '');
        if (!name.length || name.join('').length < 2) {
            return false;
        }
        for (let i = 0; i + name.length <= lieWords.length; i++) {
            const first = lieWords[i];
            const firstOk = first === name[0] || (/^[\u0590-\u05ff]/.test(name[0])
                && [1, 2].some(n => first.length > n && HE_PREFIX.test(first.slice(0, n)) && first.slice(n) === name[0]));
            if (firstOk && name.every((w, j) => j === 0 || lieWords[i + j] === w)) {
                return true;
            }
        }
        return false;
    });
}

/** A lie a stranger's chat may show: the nickname filter passes it, it holds no address and names nobody. */
export function showableLie(lie: string, nicknames: string[]): boolean {
    if (!lie || !/[A-Za-z0-9\u00c0-\u024f\u0370-\u03ff\u0400-\u04ff\u0590-\u05ff\u0600-\u06ff]/.test(lie)) {
        return false;
    }
    if (nameFlag(lie) || nameFlag(lie.replace(/\s+/g, ''))) {
        return false;
    }
    return !ADDRESS.test(lie) && !namesAPlayer(lie, nicknames);
}

export interface BestLie {
    /** The lie as the preview shows it: cleaned and cut. */
    text: string;
    /** Players it fooled. */
    fooled: number;
}

type LieGame = Pick<GameScheme, 'players' | 'highlights' | 'qids' | 'totalQ'>;

/**
 * The table's best lie a preview may show, or null. From the game's highlights (each player's best lie,
 * kept by the server as the game is played): most players fooled first, then the later question, then
 * more points; the first one showableLie passes.
 */
export function bestLie(game: LieGame | null): BestLie | null {
    const highlights: Highlights = (game && game.highlights && typeof game.highlights === 'object') ? game.highlights : {};
    const players: any = (game && game.players && typeof game.players === 'object') ? game.players : {};
    const nicknames = Object.keys(players).map(k => players[k] && players[k].nickname).filter(n => typeof n === 'string');
    const qids = qidsOf(game as GameScheme) || [];
    const order = (q: any) => typeof q === 'string' ? qids.indexOf(q) : -1;
    const lies = Object.keys(highlights)
        .map(pid => ({ pid, h: highlights[pid] }))
        .filter(x => players[x.pid] && x.h && typeof x.h === 'object' && Math.round(Number(x.h.fooled)) > 0)
        .map(x => ({ pid: x.pid, text: cleanLie(x.h.text), fooled: Math.round(Number(x.h.fooled)), points: Number(x.h.points) || 0, at: order(x.h.q) }))
        .filter(x => !!x.text)
        .sort((a, b) => b.fooled - a.fooled || b.at - a.at || b.points - a.points || (a.pid < b.pid ? -1 : 1));
    const best = lies.find(x => showableLie(x.text, nicknames));
    return best ? { text: cutLie(best.text), fooled: best.fooled } : null;
}

const TEXT = {
    en: {
        // A Hebrew or Arabic lie goes after English words, so the line still reads left to right.
        lie: (lie: string, fooled: number, of: number) => startsRightToLeft(lie)
            ? `${fooled} of ${of} fell for “${lie}”. Can your group spot the truth?`
            : `“${lie}” fooled ${fooled} of ${of}. Can your group spot the truth?`,
        plain: 'Your group is challenged to a game of Bullshit',
        description: (questions: number, top: number) =>
            `Bullshit, the party game of lies: play the same ${questions} questions and beat ${top} points. Everyone plays on their own phone. Free, no download.`,
        alt: 'Bullshit: fool your friends with fake answers to strange true facts',
    },
    // Hebrew with no gender: "תצליחו" and "אתכם" are the plural, said to a group. A lie that starts left
    // to right (English) goes after Hebrew words, so the line still reads right to left.
    he: {
        lie: (lie: string, fooled: number, of: number) => startsRightToLeft(lie) || !/[A-Za-z]/.test(lie)
            ? `״${lie}״ עבד על ${fooled} מתוך ${of}. תצליחו לזהות את האמת?`
            : `השקר שעבד על ${fooled} מתוך ${of}: ״${lie}״. תצליחו לזהות את האמת?`,
        plain: 'אתגר בבולשיט: קבוצה אחרת מאתגרת אתכם',
        description: (questions: number, top: number) =>
            `בולשיט, משחק השקרים למסיבות: אותן ${questions} שאלות, ו־${top} נקודות לעבור. כל אחד משחק מהטלפון, בחינם ובלי הורדה.`,
        alt: 'בולשיט: עבדו על החברים עם תשובות מזויפות לעובדות מוזרות ואמיתיות',
    },
};

/** The parts of a game the challenge preview reads. */
export type ChallengePreviewGame = Pick<GameScheme, 'locale' | 'state' | 'timestamp' | 'idle' | 'qids' | 'totalQ' | 'players'
    | 'creator' | 'challengeOpen' | 'campaign' | 'pack' | 'highlights'>;

/**
 * The preview of a challenge link, or null for the generic page: no such game, a challenge nobody opened,
 * or one whose week is over. `host` is always '' (no names); a preview with a lie has `lie` set.
 */
export function challengePreviewOf(game: ChallengePreviewGame | null, pin: string, now: number, origin: string = SITE): (Preview & { lie: boolean }) | null {
    const card: ChallengeCard | null = openCard(pin, game as GameScheme, now);
    if (!card) {
        return null;
    }
    const locale: PreviewLocale = card.locale === 'he' ? 'he' : 'en';
    const t = TEXT[locale];
    const lie = bestLie(game);
    // Everyone but the writer could have fallen for it (a lie two players wrote fooled at most the rest).
    const of = lie ? Math.max(lie.fooled, card.played - 1) : 0;
    return {
        locale,
        title: lie ? t.lie(lie.text, lie.fooled, of) : t.plain,
        description: t.description(card.questions, card.top),
        image: imageOf(locale, game.pack, origin),
        imageAlt: t.alt,
        host: '',
        lie: !!lie,
    };
}

/** The game's parts the challenge preview needs, read one by one, or null when there is no such game. */
export async function readChallengeGame(pin: string): Promise<ChallengePreviewGame | null> {
    // An old game's players and highlights are under `kept` (see old-games.ts): readPart looks there too.
    const values = await Promise.all(CHALLENGE_PARTS.map(part => readPart<any>(pin, part)));
    if (values.every(v => v === null || v === undefined)) {
        return null;
    }
    const out: any = {};
    CHALLENGE_PARTS.forEach((part, i) => {
        if (values[i] !== null && values[i] !== undefined) {
            out[part] = values[i];
        }
    });
    return out;
}

export interface ChallengePreviewDeps {
    readGame: (pin: string) => Promise<ChallengePreviewGame | null>;
    fetcher: Fetcher;
    project: string;
    emulator: boolean;
    now?: () => number;
    fault?: (e: any) => void;
}

/**
 * How long a challenge link's answer is kept. Browsers ask again every time (max-age=0), as for the site's
 * other pages, so a phone never keeps a page that names scripts a release deleted; the CDN keeps it ten
 * minutes (Hosting empties it on every release), a minute when the database was slow, never the page
 * that tries again.
 */
export function challengeCache(kind: string): string {
    if (kind === 'fallback') {
        return 'no-store';
    }
    return kind === 'slow' ? 'public, max-age=0, s-maxage=60' : 'public, max-age=0, s-maxage=600';
}

/** The answer to GET /challenge/<PIN> or /he/challenge/<PIN> (path and query as the visitor sent them). */
export async function challengePreviewPage(path: string, query: string, headers: any, deps: ChallengePreviewDeps): Promise<JoinPreviewAnswer> {
    const parsed = parseChallengePath(path);
    return previewPage<ChallengePreviewGame>(path, query, headers, deps, parsed && {
        pin: parsed.pin,
        shell: parsed.shell,
        read: deps.readGame,
        build: (game, now, origin) => challengePreviewOf(game, parsed.pin, now, origin),
        url: (origin) => `${origin}${parsed.shell === 'he' ? '/he' : ''}/challenge/${parsed.pin}`,
        kindOf: (preview: any) => preview.lie ? 'challenge' : 'challenge-plain',
        cacheOf: challengeCache,
    });
}
