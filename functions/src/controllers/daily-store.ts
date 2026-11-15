/**
 * The daily puzzle's reads and writes (the rules are in daily.ts, which is pure).
 * The tallies: picks per answer and, for a sender's lie link, how many opened it and fell for it.
 * That lie itself is never here: it travels in the link and stays on the phones.
 * And a chat group's rounds (daily-round.ts), which do keep first names and lies, for nine days.
 */
import { ServerValue } from 'firebase-admin/database';
import { dailyRef, get } from '../firebase';
import { Round, RoundPost, applyAct, daysToErase, dealFor } from './daily-round';
import { DailyLang, DailyPost, DailyQuestion, FriendCount, Picks, addDays, cleanFriend, cleanPicks, questionFor } from './daily';

/** Adds one to each tally a pick touches, in one write. */
export function addPicks(post: DailyPost): Promise<void> {
    if (!post.add.length) {
        return Promise.resolve();
    }
    const update: { [path: string]: any } = {};
    post.add.forEach(path => update[path] = ServerValue.increment(1));
    return dailyRef.child(post.lang).child(post.day).update(update);
}

/** Today's picks, yesterday's, and a sender's count when one is asked for. Only the picks are read, never every link. */
export async function readTallies(lang: DailyLang, list: DailyQuestion[], today: string, countDay: string | null, link: string | null):
    Promise<{ picks: Picks, before: Picks, friend: FriendCount | null }> {
    const days = dailyRef.child(lang);
    const yesterday = addDays(today, -1);
    const todayQ = questionFor(list, today);
    const beforeQ = questionFor(list, yesterday);
    const [a, b, c] = await Promise.all([
        get<any>(days.child(today).child('picks')),
        get<any>(days.child(yesterday).child('picks')),
        countDay && link ? get<any>(days.child(countDay).child('links').child(link)) : Promise.resolve(undefined),
    ]);
    return {
        picks: cleanPicks(a, todayQ ? todayQ.q.fakeAnswers.length : 0),
        before: cleanPicks(b, beforeQ ? beforeQ.q.fakeAnswers.length : 0),
        friend: countDay && link ? cleanFriend(c) : null,
    };
}

// ---------- a chat group's round (daily-round.ts) ----------

function roundRef(lang: DailyLang, day: string, g: string) {
    return dailyRef.child(lang).child(day).child('rounds').child(g);
}

/** A round as the database holds it, or null. */
export function readRound(lang: DailyLang, day: string, g: string): Promise<Round | null> {
    return get<Round>(roundRef(lang, day, g));
}

/**
 * The round a browser opens, with its deal made (or kept) for it: one transaction, so two
 * browsers opening at once both count as having seen the lies they were dealt.
 */
export async function openRound(lang: DailyLang, day: string, g: string, uid: string | null, houseLies: number): Promise<Round | null> {
    const first = await readRound(lang, day, g);
    if (!first || !uid || !dealFor(first, uid, houseLies)) {
        return first;
    }
    const done = await roundRef(lang, day, g).transaction((current: Round | null) => {
        // The first run may see null before the server's copy arrives: write null over null then (a
        // no-op that the server turns into a retry with the real round), never abort on it.
        if (current === null) {
            return null;
        }
        const next = dealFor(current, uid, houseLies);
        // Undefined leaves the round as it is: a deal that holds now.
        return next || undefined;
    }, undefined, false);
    return done.snapshot.val();
}

/**
 * One act, in a transaction that keeps one pick and one lie per browser, the caps and the names.
 * Returns the round after it, and what it was (an error, the tally and the row's method).
 */
export async function actOnRound(post: RoundPost, q: DailyQuestion, now: number):
    Promise<{ round: Round | null, error?: string, tally?: string, method?: string }> {
    let outcome: { error?: string, tally?: string, method?: string } = {};
    const done = await roundRef(post.lang, post.day, post.g).transaction((current: Round | null) => {
        const result = applyAct(current, post, q, now);
        outcome = { error: result.error, tally: result.tally, method: result.method };
        // As above: on a first run that saw null, a refusal writes null over null, so the server
        // retries with the real round instead of the transaction ending on a guess.
        return result.round || (current === null ? null : undefined);
    }, undefined, false);
    return Object.assign({ round: done.snapshot.val() }, outcome);
}

/** A pick in a round adds to the day's tallies as a plain pick does ('0', a house lie's place, or 'f'). */
export function addRoundPick(lang: DailyLang, day: string, tally: string): Promise<void> {
    return dailyRef.child(lang).child(day).child('picks').child(tally).set(ServerValue.increment(1));
}

/** Erases every round past keeping (nine days and more after its day), in one write per language. */
export function eraseOldRounds(lang: DailyLang, now: number): Promise<void> {
    const update: { [path: string]: null } = {};
    daysToErase(now).forEach(day => update[`${day}/rounds`] = null);
    return dailyRef.child(lang).update(update);
}
