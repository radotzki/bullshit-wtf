/**
 * The story card: a tall (9:16) picture of one player's best lie of the game, for an Instagram story
 * or WhatsApp Status. It shows only the sharer's own lie and counts: no other player's name or avatar.
 * The words and the choice of lie live here, apart from the drawing (results-card.service.ts), so they
 * can be tested without a canvas.
 */

/** The arrival tag of the story's link: a campaign tag, so it reaches opened_games.campaign and visits.via. */
export const STORY_VIA = 'story';

export const storyStrings = {
    en: {
        button: 'POST TO YOUR STORY',
        heading: 'MY BEST LIE OF THE NIGHT',
        name: 'BULLSHIT.WTF',
        site: 'bullshit.wtf',
        play: 'PLAY WITH YOUR FRIENDS',
        tagline: 'The game where you lie to your friends',
        fooled: (n: number) => n === 1 ? 'FOOLED 1 FRIEND' : `FOOLED ${n} FRIENDS`,
        laughed: (n: number) => n === 1 ? '1 FRIEND LAUGHED' : `${n} FRIENDS LAUGHED`,
        biggest: 'BIGGEST BULLSHITTER',
        funniest: 'FUNNIEST LIE',
        shareText: 'Can you tell my lie from the truth? Play with your friends:',
        saved: 'Saved! Add the picture to your story.',
        alt: 'My best lie, story picture',
    },
    he: {
        button: 'לפרסם בסטורי',
        heading: 'השקר הכי טוב שלי הערב',
        name: 'בולשיט',
        site: 'bullshit.wtf',
        play: 'שחקו עם החברים',
        tagline: 'המשחק שבו משקרים לחברים',
        fooled: (n: number) => n === 1 ? 'חבר אחד נפל בזה' : `${n} חברים נפלו בזה`,
        laughed: (n: number) => n === 1 ? 'חבר אחד צחק' : `${n} חברים צחקו`,
        biggest: 'הבולשיטר הגדול',
        funniest: 'השקר הכי מצחיק',
        shareText: 'תצליחו להבדיל בין השקר שלי לאמת? שחקו עם החברים:',
        saved: 'נשמר! אפשר להעלות את התמונה לסטורי.',
        alt: 'השקר הכי טוב שלי, תמונה לסטורי',
    },
};

export type StoryStrings = typeof storyStrings.en;

export function storyWords(locale: string): StoryStrings {
    return storyStrings[locale === 'he' ? 'he' : 'en'];
}

/** What a final-screen row offers the story card. Only the sharer's own row is ever read. */
export interface StoryPlayer {
    me?: boolean;
    best?: { text: string; fooled: number; q?: string };
    biggest?: boolean;
    funniest?: { text: string; laughs: number; q?: string };
}

export interface StoryLie {
    /** The question, its blank shown as a line; empty for a game that kept no question with the lie. */
    question: string;
    lie: string;
    /** Friends the lie fooled; 0 when the card is about the funniest lie, which fooled nobody. */
    fooled: number;
    /** Friends who laughed at it, when the card is about the funniest lie. */
    laughs: number;
    biggest: boolean;
    funniest: boolean;
}

/** The blank of a question ($blank$), shown as a line, as on the game's screens (bs-question.pipe.ts). */
export function questionWithBlank(q: string): string {
    return typeof q === 'string' ? q.replace(/\$\s?blank\s?\$/gi, '_____').replace(/\s+/g, ' ').trim() : '';
}

/**
 * The sharer's lie for the card: their best lie (the one that fooled the most friends), else, when no lie
 * of theirs fooled anyone but one got the game's most laughs, that one. Null when there is nothing to
 * post: no row marked as this phone's, or no lie that fooled or amused anyone.
 */
export function storyLie(players: StoryPlayer[]): StoryLie | null {
    const mine = (players || []).find(p => !!p && p.me === true);
    if (!mine) {
        return null;
    }
    const best = mine.best && mine.best.text && mine.best.fooled > 0 ? mine.best : null;
    const funny = mine.funniest && mine.funniest.text ? mine.funniest : null;
    if (best) {
        return {
            question: questionWithBlank(best.q),
            lie: best.text.trim(),
            fooled: best.fooled,
            // The best lie that was also the funniest keeps its laughs.
            laughs: funny && funny.text === best.text ? funny.laughs || 0 : 0,
            biggest: !!mine.biggest,
            // The badge is the player's, whichever of their lies won it.
            funniest: !!funny,
        };
    }
    if (funny) {
        return {
            question: questionWithBlank(funny.q),
            lie: funny.text.trim(),
            fooled: 0,
            laughs: funny.laughs || 0,
            biggest: false,
            funniest: true,
        };
    }
    return null;
}

/** The line under the lie: friends fooled, else friends who laughed. */
export function countLine(lie: StoryLie, locale: string): string {
    const t = storyWords(locale);
    return lie.fooled > 0 ? t.fooled(lie.fooled) : t.laughed(lie.laughs);
}

/** The badges the sharer won, in the card's order. */
export function storyBadges(lie: StoryLie, locale: string): string[] {
    const t = storyWords(locale);
    const out: string[] = [];
    if (lie.biggest) {
        out.push(t.biggest);
    }
    if (lie.funniest) {
        out.push(t.funniest);
    }
    return out;
}

/**
 * Breaks text into lines no wider than maxWidth, by words; a single word wider than the line is cut
 * with an ellipsis. At most maxLines lines: the last one ends with an ellipsis when text was left out.
 * `measure` is the canvas's measureText width (a fake in tests).
 */
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number, maxLines = 99): string[] {
    const words = (text || '').split(/\s+/).filter(w => !!w);
    const lines: string[] = [];
    let line = '';
    let cut = false;
    for (let i = 0; i < words.length; i++) {
        const tryLine = line ? `${line} ${words[i]}` : words[i];
        if (measure(tryLine) <= maxWidth) {
            line = tryLine;
            continue;
        }
        if (line) {
            lines.push(line);
            line = '';
            i--;
        } else {
            lines.push(fit(words[i], maxWidth, measure));
        }
        if (lines.length >= maxLines) {
            cut = i < words.length - 1 || !!line;
            break;
        }
    }
    if (line && lines.length < maxLines) {
        lines.push(line);
    }
    if (cut && lines.length) {
        lines[lines.length - 1] = fit(lines[lines.length - 1] + '…', maxWidth, measure, true);
    }
    return lines;
}

function fit(text: string, maxWidth: number, measure: (s: string) => number, ended = false): string {
    if (measure(text) <= maxWidth) {
        return text;
    }
    let body = ended ? text.replace(/…$/, '') : text;
    while (body.length > 1 && measure(body.trim() + '…') > maxWidth) {
        body = body.slice(0, -1);
    }
    return body.trim() + '…';
}
