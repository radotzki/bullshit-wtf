/**
 * The phone home page as a front door: what a visitor sees first, and what the small picture
 * of the game says. A stranger used to meet a menu of four equal buttons with Join on top and
 * not a word about what the game is.
 *
 * Kept free of Angular so it can be tested in Node.
 */

/** What the home page knows about the visitor, read from what the game already keeps. */
export interface Visitor {
    /** This browser has sat in a game before (as a guest or as a host). */
    played: boolean;
    /** This browser has created a game before. */
    hosted: boolean;
    /** The tag of the post this visit came from (?via=fb-he-friday), if any. */
    tag?: string | null;
}

/**
 * Which button leads the menu.
 *
 * Create leads for a stranger: they have no PIN, so Join is a dead end, and for anyone who came
 * from a post or who has hosted before. Join keeps its old place on top only for a browser that
 * has played and never hosted: a returning guest, who is most likely here to type a PIN again.
 * Either way both buttons stay on the first screen, one tap each.
 */
export function firstButton(visitor: Visitor): 'create' | 'join' {
    if (!visitor || visitor.tag) {
        return 'create';
    }
    return visitor.played && !visitor.hosted ? 'join' : 'create';
}

/** The picture of the game is for someone who has never played. A returning player keeps the short menu. */
export function showPicture(visitor: Visitor): boolean {
    return !visitor || !visitor.played;
}

/**
 * The query the Create button carries: the post's tag, so a game opened from here is counted for
 * the post even where the tab's storage is blocked or the Create page is reloaded.
 */
export function createQuery(tag: string | null | undefined): { via?: string } {
    return tag ? { via: tag } : {};
}

function parsed(read: (key: string) => string | null, key: string): any {
    try {
        return JSON.parse(read(key) || 'null');
    } catch (e) {
        return null;
    }
}

/**
 * Reads the visitor from the browser's storage. BS_PLAYER is the seat of the last game joined
 * (session.service), BS_HOST_KEYS the last games created here (host-key), BS_CREWS the crews
 * this browser played in (crew.service). Storage that throws or is empty reads as a stranger.
 */
export function readVisitor(read: (key: string) => string | null, tag?: string | null): Visitor {
    const player = parsed(read, 'BS_PLAYER');
    const keys = parsed(read, 'BS_HOST_KEYS');
    const crews = parsed(read, 'BS_CREWS');
    const hosted = !!keys && typeof keys === 'object' && Object.keys(keys).length > 0;
    const played = hosted || (!!player && typeof player === 'object') || (Array.isArray(crews) && crews.length > 0);
    return { played, hosted, tag: tag || null };
}

/** The words of the three-frame picture: one real opening question, a lie, and the reveal. */
export interface PictureStrings {
    /** Read out by a screen reader in place of the picture. */
    alt: string;
    steps: [string, string, string];
    /** The question, before and after its blank. */
    before: string;
    after: string;
    /** The lie this player writes, the other player's lie, and the truth. */
    lie: string;
    otherLie: string;
    truth: string;
    send: string;
    fooled: string;
    yourLie: string;
    theTruth: string;
}

const picture: { en: PictureStrings; he: PictureStrings } = {
    en: {
        alt: 'How a round goes. A strange fact appears with a blank: The national animal of Scotland is the blank. '
            + 'Everyone writes a lie to fill it. Then everyone looks for the truth among all the answers: '
            + 'highland cow, unicorn, Loch Ness monster. The truth is unicorn. '
            + 'You score for finding it, and for every friend who picked your lie.',
        steps: ['Write a lie', 'Find the truth', 'See who fell for it'],
        before: 'The national animal of Scotland is the',
        after: '',
        lie: 'Loch Ness monster',
        otherLie: 'Highland cow',
        truth: 'Unicorn',
        send: 'SEND',
        fooled: 'Ben picked it',
        yourLie: 'your lie',
        theTruth: 'THE TRUTH',
    },
    he: {
        alt: 'כך נראה סיבוב. מופיעה עובדה מוזרה עם חלק חסר: החיה הלאומית של סקוטלנד היא. '
            + 'כולם ממציאים שקר שישלים אותה. אחר כך כולם מחפשים את האמת בין כל התשובות: '
            + 'פרה היילנדית, חד קרן, מפלצת לוך נס. האמת היא חד קרן. '
            + 'מקבלים נקודות על מציאת האמת, ועל כל חבר שבחר בשקר שלכם.',
        steps: ['ממציאים שקר', 'מחפשים את האמת', 'מגלים מי נפל בפח'],
        before: 'החיה הלאומית של סקוטלנד היא',
        after: '',
        lie: 'מפלצת לוך נס',
        otherLie: 'פרה היילנדית',
        truth: 'חד קרן',
        send: 'שליחה',
        fooled: 'בן נפל בזה',
        yourLie: 'השקר שלכם',
        theTruth: 'האמת',
    },
};

export function pictureStrings(locale: string): PictureStrings {
    return locale === 'he' ? picture.he : picture.en;
}

/**
 * The code box at the top of the home ("Got a code? [ ____ ] Join"). Last weekend a third of the
 * Hebrew phones from search that pressed anything were guests typing a friend's PIN, and the PIN
 * box was a page away, behind Join Game. The box takes them straight to the nickname.
 *
 * What was typed is made into a PIN by cleanCode (services/game-code.ts), shared with the PIN page:
 * letters only, upper-cased, and a code typed on a Hebrew keyboard read as the English letters on
 * the same keys. So "abcd", " AbCd ", "ab-cd" and "שנבג" all reach game ABCD. Nothing left: null.
 */
export { cleanCode } from '../../services/game-code';

/**
 * The facts line ("Free · no app · 2 to 12 players, …") in its parts, for the computer home, which
 * shows each part whole and hides the dot that would start or end a line when the line wraps (at
 * 1280 px the Hebrew line broke after "אפליקציה ·" and left the dot hanging).
 */
export function factParts(facts: string): string[] {
    return String(facts || '').split(' · ').map(part => part.trim()).filter(part => !!part);
}

/**
 * The join source of a join made from the code box, for BigQuery `users.via` (join-source.ts and
 * JOIN_SOURCES in the functions): an existing column, a new value.
 */
export const CODE_BOX_VIA = 'home';

/**
 * Where the code box sends a guest: the PIN's own join page (the Hebrew one under /he), which opens
 * on the nickname. The tag rides on the address, so the join is counted as a code-box join even
 * where the tab's storage is blocked or the page is reloaded.
 */
export function codeJoinRoute(pin: string, locale: string): { path: string[]; query: { via: string } } {
    return { path: [locale === 'he' ? '/he/join-game' : '/join-game', pin], query: { via: CODE_BOX_VIA } };
}

/**
 * What the code box does with the server's answer to the PIN. A wrong PIN is said right under the
 * box, so the guest can fix a typo where they typed it. A game that is over goes on to its join page,
 * which says so and offers its rematch. A full game goes on too: its join page takes the name, and a
 * refused join offers a second table (join-game/second-table.ts). Any other failure goes on, and the
 * join page tries again there.
 */
export function codeBoxOutcome(errorCode: string | null | undefined): 'go' | 'stay' {
    return errorCode === 'GAME_NOT_EXIST' ? 'stay' : 'go';
}
