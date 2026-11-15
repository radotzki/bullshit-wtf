/**
 * The daily puzzle's group mode: a round that a whole chat group plays from one link.
 *
 * Each person taps the link once, picks an answer among the truth and the lies of everyone who came
 * before, sees whose lie got them, and adds a lie of their own for those who come after. There are
 * no stages: a round takes plays on its day and the next (the puzzle's "today or yesterday" rule),
 * then shows its final board until it is erased nine days after its day.
 *
 * This file is pure (no Firebase, no clock of its own) so it can be unit tested: the screen a typed
 * lie must pass, the answers a browser is dealt, the acts a page posts, and the board it is shown.
 * The reads and writes are in daily-store.ts, and the route in index.ts (`daily`).
 *
 * A round, under qHistory/daily/<lang>/<day>/rounds/<id> (the server's alone, like the tallies):
 *   at, by       when and by which browser it was started
 *   test         started from a play-test (?via=test): nothing in it is counted or written to BigQuery
 *   names/<uid>  the name a browser gave (9 letters at most, one per round)
 *   lies/<uid>   { id, l, at, seen, flags: { <uid>: true }, hidden }: one lie per browser
 *   picks/<uid>  { k, at }: 't' the truth, 'h' a house lie, a lie's id, or 's' (started it, no pick here)
 *   deal/<uid>   the answers this browser was dealt, in its order: 't', 'h<k>' or a lie's id
 * `uid` is the page's random browser id. It is never sent to another browser: lies go out under their
 * own random id.
 */
import { nameFlag } from '../name-flag';
import { cleanCampaign, isTestCampaign } from '../game-model';
import { isSameAnswer } from './same-answer';
import { DailyBank, DailyLang, DailyQuestion, addDays, contentTypeOf, daysBetween, isDay, israelDay, questionFor } from './daily';

/** A round's id: 10 small letters or digits, made in the starter's browser. */
export const ROUND_ID = /^[a-z0-9]{10}$/;
/** A lie's id inside a round: 6 small letters or digits, made here. */
const LIE_ID = /^[a-z0-9]{6}$/;
const UID = /^[a-z0-9]{16}$/;

export const LIE_MAX = 40;
export const NAME_MAX = 9;
/** The most browsers that take part in one round, and so the most lies. */
export const ROUND_MAX = 30;
/** Two "Not OK" taps from two browsers hide a lie for everyone. */
export const FLAGS_TO_HIDE = 2;
/** A round is served this many days after its own day (its day is day 0), then erased. */
export const KEEP_DAYS = 8;

// ---------- the screen a lie and a name pass (the same rules as the page's daily-core.js) ----------

const UNSEEN = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/g;

export function tidy(text: any): string {
    return String(text == null ? '' : text).replace(/\s+/g, ' ').replace(UNSEEN, '').replace(/ +/g, ' ').trim();
}

function lengthOf(text: string): number {
    return text.replace(/[\ud800-\udbff][\udc00-\udfff]/g, '_').length;
}

function carriesContact(text: string): boolean {
    return /@/.test(text)
        || /\d{5,}/.test(text)
        || /(https?:|www\.|:\/\/)/i.test(text)
        || /[a-z0-9-]\.[a-z]{2,}(\/|$|[^a-z])/i.test(text + ' ');
}

/** 'refused' when a name may not be shown (too long, a slur or sex word, a contact), else null. */
export function screenName(name: string): 'refused' | null {
    const n = tidy(name);
    return lengthOf(n) > NAME_MAX || (n && (nameFlag(n) || carriesContact(n))) ? 'refused' : null;
}

/**
 * Why a lie is refused, or null when it may go in: 'empty', 'truth', 'taken' (a house lie or a lie
 * already in the round), 'refused' (too long, a slur or sex word, a link, an @, five digits in a row).
 */
export function screenLie(lie: string, truth: string, taken: string[]): string | null {
    const l = tidy(lie);
    if (!l) {
        return 'empty';
    }
    if (lengthOf(l) > LIE_MAX) {
        return 'refused';
    }
    if (isSameAnswer(l, truth)) {
        return 'truth';
    }
    if (taken.some(t => isSameAnswer(l, t))) {
        return 'taken';
    }
    return nameFlag(l) || carriesContact(l) ? 'refused' : null;
}

function sameName(a: string, b: string): boolean {
    return tidy(a).toLowerCase() === tidy(b).toLowerCase();
}

// ---------- the round as the database holds it ----------

export interface RoundLie { id: string; l: string; at: number; seen: number; flags?: { [uid: string]: boolean }; hidden?: boolean; }
export interface RoundPick { k: string; at: number; }
export interface Round {
    at: number;
    by: string;
    test?: boolean;
    names?: { [uid: string]: string };
    lies?: { [uid: string]: RoundLie };
    picks?: { [uid: string]: RoundPick };
    deal?: { [uid: string]: string[] };
}

function keys(o: any): string[] {
    return o && typeof o === 'object' ? Object.keys(o) : [];
}

/** Every browser that took part: started, picked, gave a name or wrote a lie. */
export function participants(r: Round): string[] {
    const seen: { [uid: string]: boolean } = {};
    [r.picks, r.names, r.lies].forEach(o => keys(o).forEach(u => seen[u] = true));
    if (r.by) {
        seen[r.by] = true;
    }
    return Object.keys(seen);
}

/** The lies that are shown, oldest first: not hidden by two "Not OK" taps. */
export function visibleLies(r: Round): { uid: string, lie: RoundLie }[] {
    return keys(r.lies)
        .map(uid => ({ uid, lie: r.lies[uid] }))
        .filter(x => x.lie && typeof x.lie.l === 'string' && !x.lie.hidden)
        .sort((a, b) => (a.lie.at - b.lie.at) || (a.lie.id < b.lie.id ? -1 : 1));
}

// ---------- the day ----------

/** The day of puzzle number `no` in a language's file (the number counts days from the file's first). */
export function dayOfNumber(list: DailyQuestion[], no: number): string | null {
    if (!list || !list.length || typeof no !== 'number' || no !== Math.floor(no) || Math.abs(no) > 100000) {
        return null;
    }
    return addDays(list[0].day, no - 1);
}

/** 'open' (plays are taken), 'over' (the final board) or 'gone' (erased, or about to be). */
export function roundPhase(day: string, now: number): 'open' | 'over' | 'gone' | 'early' {
    const since = daysBetween(day, israelDay(now));
    if (since < 0) {
        return 'early';
    }
    return since <= 1 ? 'open' : since <= KEEP_DAYS ? 'over' : 'gone';
}

/** The days whose rounds are past keeping: from KEEP_DAYS + 1 to `back` days before today. */
export function daysToErase(now: number, back = 40): string[] {
    const today = israelDay(now);
    const out: string[] = [];
    for (let n = KEEP_DAYS + 1; n <= back; n++) {
        out.push(addDays(today, -n));
    }
    return out;
}

// ---------- the answers a browser is dealt ----------

/**
 * The answers for one browser, shuffled: the truth, up to three of the group's lies (four once the
 * group has four or more), and house lies to fill up to four answers in all. Of the group's lies,
 * the ones fewest browsers have been dealt come first, so every lie gets its turn. The browser's own
 * lie is never among them.
 */
export function deal(r: Round, uid: string, houseLies: number, random: () => number = Math.random): string[] {
    const shuffle = <T>(list: T[]): T[] => {
        for (let i = list.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            const t = list[i]; list[i] = list[j]; list[j] = t;
        }
        return list;
    };
    const theirs = shuffle(visibleLies(r).filter(x => x.uid !== uid))
        .sort((a, b) => (a.lie.seen || 0) - (b.lie.seen || 0));
    const take = theirs.length >= 4 ? 4 : Math.min(3, theirs.length);
    const out: string[] = ['t'].concat(theirs.slice(0, take).map(x => x.lie.id));
    const house = shuffle(Array.from({ length: houseLies }, (v, i) => 'h' + (i + 1)));
    while (out.length < 4 && house.length) {
        out.push(house.shift());
    }
    return shuffle(out);
}

/** A deal kept from an earlier visit still holds: the truth once, and every lie in it still shown. */
export function dealHolds(r: Round, d: any, houseLies: number): boolean {
    if (!Array.isArray(d) || d.length < 2 || d.length > 5 || d.filter(k => k === 't').length !== 1) {
        return false;
    }
    const shown: { [id: string]: boolean } = {};
    visibleLies(r).forEach(x => shown[x.lie.id] = true);
    return d.every(k => k === 't' || (/^h\d$/.test(k) && Number(k.slice(1)) >= 1 && Number(k.slice(1)) <= houseLies) || shown[k]);
}

// ---------- what the page is shown ----------

function lieOwner(r: Round, id: string): string | null {
    return keys(r.lies).find(u => r.lies[u] && r.lies[u].id === id) || null;
}

function nameOf(r: Round, uid: string): string {
    return (r.names && typeof r.names[uid] === 'string' && r.names[uid]) || '';
}

export interface Row { names: string[]; more: number; }

function rowOf(r: Round, uids: string[]): Row {
    const sorted = uids.slice().sort((a, b) => (r.picks[a].at - r.picks[b].at));
    const names = sorted.map(u => nameOf(r, u)).filter(n => !!n);
    return { names, more: sorted.length - names.length };
}

/**
 * The board: every shown lie with who fell for it, the truth with who found it, the house's lies
 * with who fell for them. `played` counts every browser that took part, picked or not.
 */
export function board(r: Round, viewer: string, truth: string) {
    const picks = r.picks || {};
    const by = (test: (k: string) => boolean) => keys(picks).filter(u => picks[u] && test(picks[u].k));
    const lies = visibleLies(r).map(x => Object.assign({
        id: x.lie.id, name: nameOf(r, x.uid), lie: x.lie.l, mine: x.uid === viewer,
        flagged: !!(x.lie.flags && viewer && x.lie.flags[viewer]),
    }, rowOf(r, by(k => k === x.lie.id))));
    return {
        played: participants(r).length,
        picked: by(k => k !== 's').length,
        lies,
        truth: Object.assign({ text: truth }, rowOf(r, by(k => k === 't'))),
        house: rowOf(r, by(k => k === 'h')),
    };
}

/** What this browser did in the round: its pick (and whose lie got it), its name and its lie. */
export function mine(r: Round, viewer: string) {
    const p = r.picks && r.picks[viewer];
    const own = r.lies && r.lies[viewer];
    let kind: string = null;
    let by = '';
    if (p) {
        kind = p.k === 't' ? 'truth' : p.k === 'h' ? 'house' : p.k === 's' ? 'none' : 'friend';
        if (kind === 'friend') {
            const owner = lieOwner(r, p.k);
            by = owner ? nameOf(r, owner) : '';
        }
    }
    return { kind, by, name: nameOf(r, viewer), lie: own && !own.hidden ? own.l : '', lieHidden: !!(own && own.hidden), started: r.by === viewer };
}

/**
 * What GET /_daily?g= answers about a round, for one browser:
 *   state    'open', 'over', 'full' (open, but 30 took part and this browser is not one), 'gone', 'missing'
 *   liars    the names on the shown lies (for "Dana and Yossi hid lies in here"), and how many in all
 *   answers  the texts this browser was dealt, in its order, until it picks (the lies come unmarked)
 *   board    once this browser took part, or the round is over
 */
export function roundView(r: Round | null, g: string, day: string, q: DailyQuestion | null, no: number, viewer: string, now: number) {
    const phase = roundPhase(day, now);
    const base: { [key: string]: any } = { g, day, no };
    if (!r || !q || phase === 'early') {
        return Object.assign(base, { state: phase === 'gone' ? 'gone' : 'missing' });
    }
    if (phase === 'gone') {
        return Object.assign(base, { state: 'gone' });
    }
    Object.assign(base, {
        q: q.questionText,
        cite: q.citation,
        pack: q.pack && day === q.day ? q.pack : null,
        candle: q.pack && day === q.day && q.candle ? q.candle : null,
        test: !!r.test,
    });
    const shown = visibleLies(r);
    base.liars = shown.map(x => nameOf(r, x.uid)).filter(n => !!n);
    base.lieCount = shown.length;
    const inIt = !!viewer && participants(r).indexOf(viewer) >= 0;
    if (phase === 'open' && !inIt && participants(r).length >= ROUND_MAX) {
        base.state = 'full';
        return base;
    }
    base.state = phase;
    if (viewer && !inIt && phase === 'open' && r.deal && r.deal[viewer]) {
        base.answers = r.deal[viewer].map(k => k === 't' ? q.realAnswer
            : k.charAt(0) === 'h' && /^h\d$/.test(k) ? q.fakeAnswers[Number(k.slice(1)) - 1]
                : (r.lies[lieOwner(r, k)] || { l: '' }).l);
    }
    if (inIt || phase === 'over') {
        base.board = board(r, viewer, q.realAnswer);
        base.me = inIt ? mine(r, viewer) : null;
    }
    if (inIt && phase === 'open') {
        // For the page's own check of a lie and a name before it posts them (the server checks again).
        base.taken = q.fakeAnswers.concat(shown.filter(x => x.uid !== viewer).map(x => x.lie.l));
        base.names = keys(r.names).filter(u => u !== viewer).map(u => r.names[u]);
    }
    return base;
}

// ---------- what a page posts ----------

export type RoundAct = 'start' | 'pick' | 'lie' | 'remove' | 'flag';

export interface RoundPost {
    a: RoundAct;
    lang: DailyLang;
    day: string;
    g: string;
    uid: string;
    src: string;
    test: boolean;
    /** start: 'round-start' or 'round-other' (a round in another group). */
    m?: string;
    /** start: how the starter did on the plain question ('truth', 'house', or none). */
    k?: string;
    /** pick: the place of the answer in this browser's deal. */
    i?: number;
    /** start and lie: the name and the lie, tidied ('' for none). */
    n?: string;
    l?: string;
    /** flag: the lie's id. */
    id?: string;
}

/**
 * One act from the page ({a, lang, n (the puzzle's number), g, uid, src, ...}), or null when it is not one we take.
 * The round's day comes from the puzzle's number, and must be today or yesterday for every act but
 * removing one's own lie.
 */
export function cleanRoundPost(body: any, bank: DailyBank, now: number): RoundPost | null {
    if (!body || typeof body !== 'object' || (body.lang !== 'en' && body.lang !== 'he')) {
        return null;
    }
    const lang: DailyLang = body.lang;
    const a = body.a;
    if (['start', 'pick', 'lie', 'remove', 'flag'].indexOf(a) < 0) {
        return null;
    }
    const day = dayOfNumber(bank[lang], Number(body.no));
    if (!day || !isDay(day) || typeof body.g !== 'string' || !ROUND_ID.test(body.g)
        || typeof body.uid !== 'string' || !UID.test(body.uid)) {
        return null;
    }
    const phase = roundPhase(day, now);
    if (phase !== 'open' && !(a === 'remove' && phase === 'over')) {
        return null;
    }
    if (!questionFor(bank[lang], day)) {
        return null;
    }
    const src = cleanCampaign(body.src) || '';
    const post: RoundPost = { a, lang, day, g: body.g, uid: body.uid, src, test: isTestCampaign(src) };
    if (a === 'start' || a === 'lie') {
        if ((body.n !== undefined && typeof body.n !== 'string') || (body.l !== undefined && typeof body.l !== 'string')) {
            return null;
        }
        post.n = tidy(body.n);
        post.l = tidy(body.l);
    }
    if (a === 'start') {
        post.m = body.m === 'round-other' ? 'round-other' : 'round-start';
        post.k = body.k === 'truth' || body.k === 'house' ? body.k : '';
    }
    if (a === 'pick') {
        if (typeof body.i !== 'number' || body.i !== Math.floor(body.i) || body.i < 0 || body.i > 4) {
            return null;
        }
        post.i = body.i;
    }
    if (a === 'flag') {
        if (typeof body.id !== 'string' || !LIE_ID.test(body.id)) {
            return null;
        }
        post.id = body.id;
    }
    return post;
}

export interface ActResult {
    /** The round as it is to be written, or null to leave it as it was (a refusal). */
    round: Round | null;
    /** Why it was refused: 'name-taken', 'name', 'truth', 'taken', 'refused', 'full', 'played', 'exists', 'missing', 'no'. */
    error?: string;
    /** For a pick: what it was, for the day's tallies: '0', the house lie's place, or 'f'. */
    tally?: string;
    /** shares.method of the row it leaves, if any. */
    method?: string;
}

function newLieId(r: Round, random: () => number): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (;;) {
        let id = '';
        for (let i = 0; i < 6; i++) {
            id += chars.charAt(Math.floor(random() * chars.length));
        }
        if (!lieOwner(r, id)) {
            return id;
        }
    }
}

/** The name and lie of a start or a lie act, checked against the round. Returns an error, or null. */
function placeWords(r: Round, uid: string, n: string, l: string, q: DailyQuestion, now: number, random: () => number): string | null {
    if (l && !n) {
        return 'name';
    }
    if (n) {
        if (screenName(n)) {
            return 'refused';
        }
        const clash = keys(r.names).some(u => u !== uid && sameName(r.names[u], n));
        if (clash) {
            return 'name-taken';
        }
    }
    if (l) {
        if (r.lies && r.lies[uid] && !r.lies[uid].hidden && r.lies[uid].l === l) {
            l = '';
        } else {
            if (r.lies && r.lies[uid]) {
                // One lie per browser: a second one replaces nothing.
                return 'played';
            }
            const others = visibleLies(r).filter(x => x.uid !== uid).map(x => x.lie.l);
            const why = screenLie(l, q.realAnswer, q.fakeAnswers.concat(others));
            if (why) {
                return why;
            }
            if (visibleLies(r).length >= ROUND_MAX) {
                return 'full';
            }
        }
    }
    r.names = r.names || {};
    if (n) {
        r.names[uid] = n;
    }
    if (l) {
        r.lies = r.lies || {};
        r.lies[uid] = { id: newLieId(r, random), l, at: now, seen: 0 };
    }
    return null;
}

function copy(r: any): Round {
    return r && typeof r === 'object' ? JSON.parse(JSON.stringify(r)) : null;
}

/**
 * One act on a round, as a transaction applies it: the round as the database holds it (null when
 * there is none) in, the round to write and what to count out. Never changes `current`.
 */
export function applyAct(current: Round | null, post: RoundPost, q: DailyQuestion, now: number, random: () => number = Math.random): ActResult {
    const r = copy(current);
    const uid = post.uid;
    if (post.a === 'start') {
        if (r && r.by !== uid) {
            return { round: null, error: 'exists' };
        }
        const round: Round = r || { at: now, by: uid };
        if (post.test) {
            round.test = true;
        }
        round.picks = round.picks || {};
        if (!round.picks[uid]) {
            round.picks[uid] = { k: post.k === 'truth' ? 't' : post.k === 'house' ? 'h' : 's', at: now };
        }
        const error = placeWords(round, uid, post.n, post.l, q, now, random);
        if (error) {
            // A refused lie still leaves no round half made: the starter fixes it and taps again.
            return { round: null, error };
        }
        return { round, method: r ? undefined : post.m };
    }
    if (!r) {
        return { round: null, error: 'missing' };
    }
    const inIt = participants(r).indexOf(uid) >= 0;
    if (post.a === 'pick') {
        if (r.picks && r.picks[uid]) {
            return { round: null, error: 'played' };
        }
        if (inIt) {
            // Wrote a lie or a name first (it played today's question elsewhere): it has seen the board.
            return { round: null, error: 'played' };
        }
        if (participants(r).length >= ROUND_MAX) {
            return { round: null, error: 'full' };
        }
        const d = r.deal && r.deal[uid];
        const k = Array.isArray(d) ? d[post.i] : undefined;
        if (!k) {
            return { round: null, error: 'no' };
        }
        r.picks = r.picks || {};
        let tally: string;
        let method: string;
        if (k === 't') {
            r.picks[uid] = { k: 't', at: now };
            tally = '0';
            method = 'truth';
        } else if (/^h\d$/.test(k)) {
            r.picks[uid] = { k: 'h', at: now };
            tally = k.slice(1);
            method = 'house';
        } else {
            r.picks[uid] = { k, at: now };
            tally = 'f';
            method = 'friend';
        }
        delete r.deal[uid];
        return { round: r, tally, method };
    }
    if (post.a === 'lie') {
        if (!inIt && participants(r).length >= ROUND_MAX) {
            return { round: null, error: 'full' };
        }
        if (!inIt && r.deal && r.deal[uid]) {
            // Dealt but not picked: a lie now would end its turn unpicked. The page never asks this.
            delete r.deal[uid];
        }
        const hadLie = !!(r.lies && r.lies[uid]);
        const error = placeWords(r, uid, post.n, post.l, q, now, random);
        if (error) {
            return { round: null, error };
        }
        if (!r.names[uid] && !r.lies?.[uid] && !(r.picks && r.picks[uid])) {
            // Neither a name nor a lie, from a browser not yet in it: it is counted as one more.
            r.picks = r.picks || {};
            r.picks[uid] = { k: 's', at: now };
        }
        return { round: r, method: !hadLie && r.lies && r.lies[uid] && r.by !== uid ? 'round-lie' : undefined };
    }
    if (post.a === 'remove') {
        if (!r.lies || !r.lies[uid]) {
            return { round: null, error: 'no' };
        }
        delete r.lies[uid];
        return { round: r };
    }
    // flag
    const owner = lieOwner(r, post.id);
    if (!owner || owner === uid || !inIt) {
        return { round: null, error: 'no' };
    }
    const lie = r.lies[owner];
    lie.flags = lie.flags || {};
    if (lie.flags[uid]) {
        return { round: r };
    }
    lie.flags[uid] = true;
    if (keys(lie.flags).length >= FLAGS_TO_HIDE) {
        lie.hidden = true;
    }
    return { round: r, method: 'round-flag' };
}

/**
 * A browser opens a round it is not yet in: the deal it keeps, made on its first visit and kept on
 * later ones while every lie in it is still shown. Returns the round to write, or null when nothing
 * changes (a deal that holds, a browser already in it, a full or closed round).
 */
export function dealFor(current: Round | null, uid: string, houseLies: number, random: () => number = Math.random): Round | null {
    if (!current || !uid) {
        return null;
    }
    if (participants(current).indexOf(uid) >= 0 || participants(current).length >= ROUND_MAX) {
        return null;
    }
    if (current.deal && dealHolds(current, current.deal[uid], houseLies)) {
        return null;
    }
    const r = copy(current);
    r.deal = r.deal || {};
    if (keys(r.deal).length >= 200) {
        // A link passed round far beyond its chat: forget the oldest deals.
        keys(r.deal).slice(0, 50).forEach(u => delete r.deal[u]);
    }
    r.deal[uid] = deal(r, uid, houseLies, random);
    r.deal[uid].forEach(k => {
        const owner = lieOwner(r, k);
        if (owner) {
            r.lies[owner].seen = (r.lies[owner].seen || 0) + 1;
        }
    });
    return r;
}

/** The row an act leaves in BigQuery `shares`: the round's id in crew_id. Null for a test round. */
export function roundRow(post: RoundPost, method: string | undefined, testRound: boolean) {
    if (!method || post.test || testRound) {
        return null;
    }
    return { content_type: contentTypeOf(post.src), method, crew_id: post.g, locale: post.lang, uid: post.uid };
}
