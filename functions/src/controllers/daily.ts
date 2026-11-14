/**
 * The daily puzzle (/daily and /he/daily): one question a day per language, the same for everyone.
 * The visitor picks the true answer among the house's lies, sees how today's players did, and sends
 * it on. A friend's own lie travels inside the link and never reaches this code.
 *
 * This file is pure (no Firebase, no clock of its own) so it can be unit tested: the day in Israel,
 * the day's question, the answer the page gets, and the cleaning of what a page posts back.
 * The reads and writes are in index.ts (`daily`).
 *
 * The questions are in functions/data/daily-questions.json, written for the puzzle. They are never
 * loaded into the game's bank: a puzzle player must not meet the same fact at a table.
 */
import { cleanCampaign, isTestCampaign } from '../game-model';

export type DailyLang = 'en' | 'he';

export interface DailyQuestion {
    id: string;
    /** The day in Israel this question is for: YYYY-MM-DD. */
    day: string;
    lang: DailyLang;
    /** The sentence, with $blank$ where the answer goes (as the game's questions have it). */
    questionText: string;
    realAnswer: string;
    fakeAnswers: string[];
    citation: string;
    pack?: string;
    candle?: number;
}

export type DailyBank = { [lang in DailyLang]: DailyQuestion[] };

/** Percentages are shown from this many picks on. Below it the page says "among the first". */
export const MIN_PICKS_TO_SHOW = 20;
/** A warning is logged (and reaches Sentry) when fewer days of questions than this are left. */
export const WARN_DAYS_LEFT = 10;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 3600 * 1000;
/** A sender's link id: made in the browser, 8 small letters or digits. */
const LINK_ID = /^[a-z0-9]{8}$/;

// ---------- the day ----------

const israelParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

/** Israel's wall clock at `now`, read as if it were UTC (so the two can be subtracted). */
function israelClock(now: number): number {
    const p: { [type: string]: number } = {};
    israelParts.formatToParts(new Date(now)).forEach(part => p[part.type] = Number(part.value));
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** The date in Israel at `now` (summer time included): YYYY-MM-DD. One clock for both languages. */
export function israelDay(now: number): string {
    return new Date(israelClock(now)).toISOString().slice(0, 10);
}

function dayNumber(day: string): number {
    return Math.round(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) / DAY_MS);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
    return dayNumber(to) - dayNumber(from);
}

export function addDays(day: string, n: number): string {
    return new Date((dayNumber(day) + n) * DAY_MS).toISOString().slice(0, 10);
}

/** A real calendar day, written YYYY-MM-DD. */
export function isDay(day: any): boolean {
    return typeof day === 'string' && DAY.test(day) && addDays(day, 0) === day;
}

/** The moment (epoch ms) the day changes in Israel after `now`. */
export function nextMidnight(now: number): number {
    const tomorrow = dayNumber(israelDay(now)) * DAY_MS + DAY_MS;
    // Israel's clocks change at 02:00, never at midnight, so the offset just before midnight is the
    // offset at midnight. Twice, in case the first guess fell on the other side of a clock change.
    let at = tomorrow - (israelClock(now) - Math.floor(now / 1000) * 1000);
    at = tomorrow - (israelClock(at - 1000) - (at - 1000));
    return at;
}

// ---------- the questions ----------

function isText(v: any, max: number): boolean {
    return typeof v === 'string' && v.trim().length > 0 && v.length <= max;
}

/**
 * The file's questions by language, in day order. An entry that is not a whole question is left
 * out, and so is a second question for a day that already has one (the earlier id wins), so one
 * bad line never takes the page down. The file's own test (daily-questions.test.js) is what keeps
 * such lines out of a release.
 */
export function loadDaily(raw: any): DailyBank {
    const bank: DailyBank = { en: [], he: [] };
    const taken: { [key: string]: boolean } = {};
    Object.keys(raw && typeof raw === 'object' ? raw : {}).sort().forEach(id => {
        const q = raw[id];
        if (!q || typeof q !== 'object' || (q.lang !== 'en' && q.lang !== 'he') || !isDay(q.day)) {
            return;
        }
        if (!isText(q.questionText, 300) || q.questionText.indexOf('$blank$') < 0 || !isText(q.realAnswer, 60)) {
            return;
        }
        const lies = Array.isArray(q.fakeAnswers) ? q.fakeAnswers.filter((l: any) => isText(l, 60)) : [];
        if (lies.length < 3 || taken[q.lang + q.day]) {
            return;
        }
        taken[q.lang + q.day] = true;
        const candle = Number(q.candle);
        bank[q.lang as DailyLang].push({
            id, day: q.day, lang: q.lang,
            questionText: q.questionText.trim(), realAnswer: q.realAnswer.trim(),
            fakeAnswers: lies.slice(0, 5).map((l: string) => l.trim()),
            citation: typeof q.citation === 'string' && /^https?:\/\/[^\s"<>]+$/.test(q.citation) ? q.citation : '',
            pack: q.pack === 'hanukkah' ? 'hanukkah' : undefined,
            candle: q.pack === 'hanukkah' && candle >= 1 && candle <= 8 && candle === Math.floor(candle) ? candle : undefined,
        });
    });
    bank.en.sort((a, b) => a.day < b.day ? -1 : 1);
    bank.he.sort((a, b) => a.day < b.day ? -1 : 1);
    return bank;
}

export interface DayQuestion {
    q: DailyQuestion;
    /**
     * The puzzle's number: 1 on the language's first day, rising by one a day for ever. Before the
     * first day it is 0 or less, and the page shows no number.
     */
    no: number;
    /** The question was written for this very day (false: a repeat, see below). */
    own: boolean;
}

/**
 * The question of `day`. A day with no question of its own (before the first day, after the last,
 * or a gap in the file) gets a repeat: the file is walked round from its first question, by the
 * count of days since the first day, so the page is never blank and two days in a row never show
 * the same question while the file holds two or more. Null only when the language has no question.
 */
export function questionFor(list: DailyQuestion[], day: string): DayQuestion | null {
    if (!list || !list.length || !isDay(day)) {
        return null;
    }
    const since = daysBetween(list[0].day, day);
    const own = list.find(q => q.day === day);
    if (own) {
        return { q: own, no: since + 1, own: true };
    }
    const at = ((since % list.length) + list.length) % list.length;
    return { q: list[at], no: since + 1, own: false };
}

/** Days after `day` that still have a question of their own (0 on the last day, negative after it). */
export function daysLeft(list: DailyQuestion[], day: string): number {
    return list && list.length ? daysBetween(day, list[list.length - 1].day) : -1;
}

// ---------- the tallies ----------

export interface Picks {
    /** Picks per answer: '0' is the truth, '1' and up the lies in the file's order, 'f' a friend's lie. */
    picks: { [k: string]: number };
    total: number;
}

/**
 * The day's picks as the database holds them. The database hands back a list when the keys are
 * 0, 1, 2..., and an object once 'f' is among them: both are read here.
 */
export function cleanPicks(raw: any, lies: number): Picks {
    const picks: { [k: string]: number } = {};
    let total = 0;
    if (raw && typeof raw === 'object') {
        Object.keys(raw).forEach(k => {
            const n = Number(raw[k]);
            const known = k === 'f' || (/^\d$/.test(k) && Number(k) <= lies);
            if (known && isFinite(n) && n > 0) {
                picks[k] = Math.floor(n);
                total += picks[k];
            }
        });
    }
    return { picks, total };
}

/** Of 100 picks, how many were a lie. Null with no pick. */
export function fooledPct(p: Picks): number | null {
    return p.total > 0 ? Math.round(100 * (p.total - (p.picks['0'] || 0)) / p.total) : null;
}

export interface FriendCount {
    seen: number;
    fooled: number;
}

export function cleanFriend(raw: any): FriendCount {
    const n = (v: any) => isFinite(Number(v)) && Number(v) > 0 ? Math.floor(Number(v)) : 0;
    const seen = n(raw && raw.seen);
    return { seen, fooled: Math.min(seen, n(raw && raw.fooled)) };
}

// ---------- what the page gets ----------

export function cleanLang(lang: any): DailyLang {
    return lang === 'he' ? 'he' : 'en';
}

export function cleanLinkId(f: any): string | null {
    return typeof f === 'string' && LINK_ID.test(f) ? f : null;
}

/** The day a sender's count is asked for: today or yesterday only. */
export function cleanCountDay(d: any, now: number): string | null {
    const today = israelDay(now);
    return isDay(d) && (d === today || d === addDays(today, -1)) ? d : null;
}

/** The sentence with its answer in place of the blank. */
export function filled(q: DailyQuestion): string {
    return q.questionText.replace('$blank$', q.realAnswer);
}

/**
 * The answer to GET /_daily. The truth comes with the question, so the reveal is instant and
 * works when the next call fails: a casual puzzle need not hide it from the network tab.
 */
export function puzzleBody(list: DailyQuestion[], now: number, today: Picks | null, yesterday: Picks | null, friend?: FriendCount | null) {
    const day = israelDay(now);
    const found = questionFor(list, day);
    if (!found) {
        return null;
    }
    const q = found.q;
    const picks = today || { picks: {}, total: 0 };
    const before = questionFor(list, addDays(day, -1));
    const body: { [key: string]: any } = {
        no: found.no,
        day,
        lang: q.lang,
        q: q.questionText,
        options: [q.realAnswer].concat(q.fakeAnswers).map((t, k) => ({ k, t })),
        truth: 0,
        cite: q.citation,
        picks: picks.picks,
        total: picks.total,
        // A repeat of a Hanukkah question on another day is an ordinary question.
        pack: found.own && q.pack ? q.pack : null,
        candle: found.own && q.pack && q.candle ? q.candle : null,
        nextAt: nextMidnight(now),
        yesterday: before && before.q !== q ? {
            text: filled(before.q),
            fooledPct: yesterday ? fooledPct(yesterday) : null,
            total: yesterday ? yesterday.total : 0,
        } : null,
    };
    if (friend) {
        body.friend = friend;
    }
    return body;
}

/**
 * How long Firebase Hosting's cache may answer for the function: five minutes (one minute for a
 * sender's count), and never past midnight in Israel, when the question changes.
 */
export function cacheSeconds(now: number, friend: boolean): number {
    const toMidnight = Math.floor((nextMidnight(now) - now) / 1000);
    return Math.max(1, Math.min(friend ? 60 : 300, toMidnight));
}

// ---------- what a page posts back ----------

/**
 * How the visitor arrived (BigQuery shares.content_type), from the page's ?via= tag:
 *   daily        typed the address, or unknown
 *   daily-home   the home page's line
 *   daily-seo    a search page
 *   daily-game   the taste's final screen
 *   daily-share  a friend's result
 *   daily-fool   a friend's lie
 *   daily-post   any other tag, such as a post's
 */
export const DAILY_ARRIVALS = ['daily', 'daily-home', 'daily-seo', 'daily-game', 'daily-share', 'daily-fool'];

/**
 * What they did (shares.method):
 *   open                              the question was shown (once per browser per day)
 *   truth, house, friend              the pick: the truth, a house lie, the friend's lie
 *   whatsapp, native, copy            sent the result
 *   fool-whatsapp, fool-native, fool-copy   sent a lie
 *   create                            tapped START A GAME
 */
export const DAILY_PICKS = ['truth', 'house', 'friend'];
export const DAILY_METHODS = ['open'].concat(DAILY_PICKS,
    ['whatsapp', 'native', 'copy', 'fool-whatsapp', 'fool-native', 'fool-copy', 'create']);

export function contentTypeOf(src: any): string {
    const tag = cleanCampaign(src);
    if (!tag) {
        return 'daily';
    }
    return DAILY_ARRIVALS.indexOf(tag) >= 0 ? tag : 'daily-post';
}

export interface DailyPost {
    lang: DailyLang;
    day: string;
    /** Database paths under qHistory/daily/<lang>/<day> to add one to. Empty for anything but a pick. */
    add: string[];
    /** The row for BigQuery `shares`: existing columns only. */
    row: { content_type: string, method: string, crew_id: null, locale: DailyLang, uid: string | null };
}

/**
 * One post from the page ({lang, day, m, k, f, src, uid}), or null when it is not one we count.
 * Only today's or yesterday's day (a pick sent just after midnight still counts for its own day),
 * an answer that exists and a well-formed link id pass. A play-test (?via=test, ?via=test-...)
 * is dropped whole: it changes no tally and writes no row.
 */
export function cleanPost(body: any, bank: DailyBank, now: number): DailyPost | null {
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { return null; }
    }
    if (!body || typeof body !== 'object' || (body.lang !== 'en' && body.lang !== 'he')) {
        return null;
    }
    const lang: DailyLang = body.lang;
    const today = israelDay(now);
    if (!isDay(body.day) || (body.day !== today && body.day !== addDays(today, -1))) {
        return null;
    }
    const method = typeof body.m === 'string' ? body.m : '';
    if (DAILY_METHODS.indexOf(method) < 0 || isTestCampaign(body.src)) {
        return null;
    }
    const add: string[] = [];
    if (DAILY_PICKS.indexOf(method) >= 0) {
        const found = questionFor(bank[lang], body.day);
        if (!found) {
            return null;
        }
        const link = cleanLinkId(body.f);
        if (method === 'friend') {
            // The friend's lie is not in the file: its picks are counted together, under 'f'.
            if (!link || body.k !== 'f') {
                return null;
            }
            add.push('picks/f', `links/${link}/seen`, `links/${link}/fooled`);
        } else {
            const k = body.k;
            const lies = found.q.fakeAnswers.length;
            if (typeof k !== 'number' || k !== Math.floor(k) || (method === 'truth' ? k !== 0 : (k < 1 || k > lies))) {
                return null;
            }
            add.push(`picks/${k}`);
            if (body.f !== undefined && body.f !== null && body.f !== '') {
                if (!link) {
                    return null;
                }
                add.push(`links/${link}/seen`);
            }
        }
    }
    const uid = typeof body.uid === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.uid) ? body.uid : null;
    return { lang, day: body.day, add, row: { content_type: contentTypeOf(body.src), method, crew_id: null, locale: lang, uid } };
}
