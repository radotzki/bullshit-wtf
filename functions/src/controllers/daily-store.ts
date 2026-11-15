/**
 * The daily puzzle's reads and writes (the rules are in daily.ts, which is pure).
 * Tallies only: picks per answer and, for a sender's lie link, how many opened it and fell for it.
 * The lie itself is never here: it travels in the link and stays on the phones.
 */
import { ServerValue } from 'firebase-admin/database';
import { dailyRef, get } from '../firebase';
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
