/**
 * The card before a game's last question: that it is the last one, and how far first place is
 * ahead. Worked out on the phone from what every phone may already read (the question's number,
 * the game's length and the players' scores); the server is not asked for anything new.
 * Kept free of Angular so it can be tested in Node.
 */

/** The words the card needs: the game's strings (game-strings.ts) have them all. */
export interface FinalQuestionWords {
    names: (names: string[]) => string;
    leadsBy: (name: string, gap: number) => string;
    tiedForFirst: (names: string) => string;
    manyTiedForFirst: (count: number) => string;
    youLeadBy: (gap: number) => string;
    youAreTiedWith: (names: string) => string;
    youAreTiedWithMany: (others: number) => string;
    behind: (gap: number, names: string) => string;
    behindFirstPlace: (gap: number) => string;
}

export interface Standing {
    /** How many players are in the game. */
    players: number;
    /** Nicknames of everyone on the top score, in the order the game lists its players. */
    leaders: string[];
    /** First place's lead over second place: 0 on a tie for first, and with one player. */
    lead: number;
    /** This phone's player: alone in first place, sharing it, behind it, or no player (a big screen). */
    you: 'first' | 'tied' | 'behind' | 'none';
    /** Points between this phone's player and first place. */
    behind: number;
    /** The other players on the top score, when this phone's player shares it. */
    tiedWith: string[];
}

/** More names than this do not fit a line read in three seconds: the line counts them. */
const NAMES_ON_A_LINE = 2;

function isNumber(n: any): boolean {
    return typeof n === 'number' && !isNaN(n);
}

function score(player: any): number {
    return player && isNumber(player.score) ? player.score : 0;
}

/**
 * Whether the question at `questionIndex` (from 0) is the last of a game of `totalQ` questions.
 * False while either number is not read yet, and for a game of one question, whose first card it would be.
 */
export function isFinalQuestion(questionIndex: number, totalQ: number): boolean {
    return isNumber(questionIndex) && isNumber(totalQ) && totalQ > 1 && questionIndex === totalQ - 1;
}

/**
 * Who is in first place and by how much, and where the player `pid` stands.
 * Null while the players are not read, or there are none: the card then shows no line about the gap.
 */
export function standing(players: { [pid: string]: { nickname: string, score: number } }, pid?: string): Standing {
    const pids = players && typeof players === 'object' ? Object.keys(players).filter(k => !!players[k]) : [];

    if (!pids.length) {
        return null;
    }

    const scores = pids.map(k => score(players[k]));
    const top = Math.max.apply(null, scores);
    const leaderPids = pids.filter(k => score(players[k]) === top);
    const rest = scores.filter(s => s < top);
    const lead = leaderPids.length === 1 && rest.length ? top - Math.max.apply(null, rest) : 0;
    const name = (k: string) => String(players[k].nickname || '');
    const me = pid && players[pid] ? pid : null;
    const mine = me ? score(players[me]) : 0;

    let you: Standing['you'] = 'none';
    if (me) {
        you = mine < top ? 'behind' : leaderPids.length === 1 ? 'first' : 'tied';
    }

    return {
        players: pids.length,
        leaders: leaderPids.map(name),
        lead,
        you,
        behind: me ? top - mine : 0,
        tiedWith: you === 'tied' ? leaderPids.filter(k => k !== me).map(name) : [],
    };
}

/** A nickname inside a line of the other direction keeps to itself (first-strong isolate). */
function isolate(name: string): string {
    return `⁨${name}⁩`;
}

/**
 * The card's one line about the gap. A phone reads its own player's place ("500 points behind Dana"),
 * a big screen the room's ("Dana leads by 500 points"). Empty with one player, and while nothing is known.
 */
export function gapLine(s: Standing, t: FinalQuestionWords): string {
    if (!s || s.players < 2 || !s.leaders.length) {
        return '';
    }

    const list = (names: string[]) => t.names(names.map(isolate));

    switch (s.you) {
        case 'first':
            return t.youLeadBy(s.lead);

        case 'tied':
            return s.tiedWith.length <= NAMES_ON_A_LINE
                ? t.youAreTiedWith(list(s.tiedWith))
                : t.youAreTiedWithMany(s.tiedWith.length);

        case 'behind':
            return s.leaders.length <= NAMES_ON_A_LINE
                ? t.behind(s.behind, list(s.leaders))
                : t.behindFirstPlace(s.behind);

        default:
            if (s.leaders.length === 1) {
                return t.leadsBy(isolate(s.leaders[0]), s.lead);
            }
            return s.leaders.length <= NAMES_ON_A_LINE + 1
                ? t.tiedForFirst(list(s.leaders))
                : t.manyTiedForFirst(s.leaders.length);
    }
}
