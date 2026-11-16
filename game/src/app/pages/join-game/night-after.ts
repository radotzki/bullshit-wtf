/**
 * "The night after": what a finished game's own link shows in the week after the game, in the new half
 * of a 50/50 test (by the game's PIN; the server's night-after.ts builds the recap and draws the half).
 * The other half keeps today's "Game over" page. Every row it sends goes to BigQuery `shares` with
 * content_type night-after and the game's PIN in crew_id; a test game sends none.
 * Kept free of Angular so it can be tested in Node.
 */

/** The recap as the server sends it on GAME_OVER (validateGameName), within a week of the game. */
export interface NightAfterRecap {
    half: 'new' | 'control';
    player: boolean;
    endedAt: number;
    locale: 'en' | 'he';
    host: string;
    rows: { name: string; score: number; place: number; fooled: number; biggest?: boolean }[];
    played: number;
    questions: number;
    fooledTotal: number;
    lie: { text: string; fooled: number; by: string } | null;
    crew?: string;
    test?: boolean;
}

/** A tester's switch, in the browser console: localStorage.BS_NIGHT_AFTER = 'new' or 'control'. */
export const NIGHT_AFTER_KEY = 'BS_NIGHT_AFTER';
export const NIGHT_AFTER_CONTENT = 'night-after';
/**
 * "Same table tomorrow": which ask the recap shows. A lobby of this game is open: everyone sees "They're
 * playing again", a player with PLAY AGAIN, SAME TABLE (it joins that lobby, with its host key), anyone
 * else with JOIN THEM. No lobby: a player opens one with PLAY AGAIN, SAME TABLE; anyone else starts their own.
 */
export function recapAsk(player: boolean, rematch: string | undefined): 'again-player' | 'again-other' | 'player' | 'other' {
    if (rematch) {
        return player ? 'again-player' : 'again-other';
    }
    return player ? 'player' : 'other';
}

/** The campaign tags of the games its buttons start (opened_games.campaign LIKE 'night-after%'). */
export const NIGHT_AFTER_TAGS = { other: 'night-after', player: 'night-after-player' };

/** The recap from a GAME_OVER error's body, or null when it has none or it is not one. */
export function readRecap(err: any): NightAfterRecap | null {
    const r = err && err.nightAfter;
    if (!r || typeof r !== 'object' || !Array.isArray(r.rows) || r.rows.length < 2 || typeof r.endedAt !== 'number') {
        return null;
    }
    return r as NightAfterRecap;
}

/** The half this browser sees: the tester's switch when it is set, else the game's own. */
export function shownHalf(recap: NightAfterRecap, forced?: string | null): 'new' | 'control' {
    if (forced === 'new' || forced === 'control') {
        return forced;
    }
    return recap.half === 'new' ? 'new' : 'control';
}

/** The `seen-` row's method for this page load. */
export function seenMethod(half: 'new' | 'control', player: boolean): string {
    return (half === 'new' ? 'seen-' : 'seen-control-') + (player ? 'player' : 'other');
}

/** When the game was, as the heading says it: tonight, today, last night, yesterday, or a weekday. */
export interface When {
    kind: 'tonight' | 'today' | 'last-night' | 'yesterday' | 'day';
    day: number;
}

/**
 * The browser's own clock and time zone decide. A night runs until 05:00, so a game at 23:30 is still
 * "tonight" at 01:00. An evening is from 17:00. Older than yesterday: the weekday (0 = Sunday).
 */
export function whenWas(endedAt: number, now: number): When {
    const NIGHT_ENDS_H = 5;
    const shift = (t: number) => {
        const d = new Date(t);
        d.setHours(d.getHours() - NIGHT_ENDS_H);
        d.setHours(0, 0, 0, 0);
        return d.getTime();
    };
    const ended = new Date(endedAt);
    const evening = ended.getHours() >= 17 || ended.getHours() < NIGHT_ENDS_H;
    const days = Math.round((shift(now) - shift(endedAt)) / (24 * 3600 * 1000));
    const playDay = new Date(shift(endedAt)).getDay();
    if (days <= 0) {
        return { kind: evening ? 'tonight' : 'today', day: playDay };
    }
    if (days === 1) {
        return { kind: evening ? 'last-night' : 'yesterday', day: playDay };
    }
    return { kind: 'day', day: playDay };
}

const EN_DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const HE_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/** Words of the recap, in the page's language. Hebrew avoids gendered verbs. */
export const nightAfterStrings = {
    en: {
        heading: (w: When, host: string) => {
            const when = w.kind === 'tonight' ? 'TONIGHT' : w.kind === 'today' ? 'TODAY'
                : w.kind === 'last-night' ? 'LAST NIGHT' : w.kind === 'yesterday' ? 'YESTERDAY' : 'ON ' + EN_DAYS[w.day];
            if (host) {
                return `${when} AT ${host.toUpperCase()}'S`;
            }
            const whose = w.kind === 'tonight' ? 'TONIGHT\'S' : w.kind === 'today' ? 'TODAY\'S'
                : w.kind === 'last-night' ? 'LAST NIGHT\'S' : w.kind === 'yesterday' ? 'YESTERDAY\'S' : EN_DAYS[w.day] + '\'S';
            return `${whose} GAME`;
        },
        winner: 'Winner',
        winners: 'Winners',
        biggest: 'Biggest bullshitter',
        and: ' & ',
        lieOfTheNight: 'The lie of the night',
        lieFooled: (n: number) => n === 1 ? 'fooled 1' : `fooled ${n}`,
        lieBy: (name: string) => `by ${name}`,
        facts: (played: number, questions: number, fooled: number) =>
            [`${played} played`, questions ? `${questions} questions` : '', fooled === 1 ? '1 fall for a lie' : `${fooled} falls for a lie`]
                .filter(s => !!s).join(' · '),
        scores: 'Final scores',
        fooledRow: (n: number) => n === 0 ? 'fooled nobody' : n === 1 ? 'fooled 1' : `fooled ${n}`,
        missedTitle: 'You missed it.',
        missedText: 'Start your own game: it is free, takes 10 seconds, and everyone plays on their own phone.',
        create: 'START YOUR OWN GAME',
        playerTitle: 'You were there.',
        playerText: 'Same people, another night? Open the table again: this link in your chat brings everyone to the same game.',
        playAgain: 'PLAY AGAIN, SAME TABLE',
        againTitle: 'They\'re playing again.',
        againText: 'The same table opened another game, and it hasn\'t started yet.',
        joinThem: 'JOIN THEM',
        againError: 'That didn\'t work. Try again.',
        createPlayer: 'HOST THE NEXT ONE',
        crew: 'See who\'s in next time',
        tryAnother: 'JOIN ANOTHER GAME',
    },
    he: {
        heading: (w: When, host: string) => {
            const when = w.kind === 'tonight' ? 'הערב' : w.kind === 'today' ? 'היום'
                : w.kind === 'last-night' ? 'אתמול בערב' : w.kind === 'yesterday' ? 'אתמול' : 'ביום ' + HE_DAYS[w.day];
            if (host) {
                return `${when} אצל ${host}`;
            }
            const whose = w.kind === 'tonight' ? 'של הערב' : w.kind === 'today' ? 'של היום'
                : w.kind === 'last-night' ? 'של אתמול בערב' : w.kind === 'yesterday' ? 'של אתמול' : 'של יום ' + HE_DAYS[w.day];
            return `המשחק ${whose}`;
        },
        winner: 'ניצחון',
        winners: 'ניצחון משותף',
        biggest: 'הבולשיטר הגדול',
        and: ' ו',
        lieOfTheNight: 'השקר של הערב',
        lieFooled: (n: number) => `נפלו בזה: ${n}`,
        lieBy: (name: string) => `מאת ${name}`,
        facts: (played: number, questions: number, fooled: number) =>
            [`${played} שחקנים`, questions ? `${questions} שאלות` : '', `נפילות בשקר: ${fooled}`]
                .filter(s => !!s).join(' · '),
        scores: 'התוצאות',
        fooledRow: (n: number) => n === 0 ? 'אף אחד לא נפל' : `נפלו: ${n}`,
        missedTitle: 'פספסתם.',
        missedText: 'פתחו משחק משלכם: זה בחינם, לוקח 10 שניות, וכל אחד משחק מהטלפון שלו.',
        create: 'לפתוח משחק משלי',
        playerTitle: 'הייתם שם.',
        playerText: 'אותם אנשים, עוד ערב? פותחים את השולחן מחדש: הקישור הזה בצ\'אט יביא את כולם לאותו משחק.',
        playAgain: 'לשחק שוב, אותו שולחן',
        againTitle: 'משחקים שוב.',
        againText: 'אותו שולחן פתח משחק נוסף, והוא עוד לא התחיל.',
        joinThem: 'להצטרף אליהם',
        againError: 'זה לא עבד. אפשר לנסות שוב.',
        createPlayer: 'לארח את המשחק הבא',
        crew: 'מי בא בפעם הבאה',
        tryAnother: 'להצטרף למשחק אחר',
    },
};

export type NightAfterStrings = typeof nightAfterStrings.en;

export function nightAfterWords(locale: string): NightAfterStrings {
    return locale === 'he' ? nightAfterStrings.he : nightAfterStrings.en;
}

/** "Yossi" or "Yossi & Dana": the names of the rows that match. */
export function namesOf(rows: NightAfterRecap['rows'], match: (r: NightAfterRecap['rows'][0]) => boolean, and: string): string {
    const names = rows.filter(match).map(r => r.name);
    if (names.length <= 1) {
        return names.join('');
    }
    return names.slice(0, -1).join(', ') + and + names[names.length - 1];
}
