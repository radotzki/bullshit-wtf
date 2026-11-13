/**
 * A crew's next game night: the date one player set ("Same time next week?" on the final screen,
 * or the crew page), and who said "I'm in". Stored on the crew as
 *   night: { time, by, in: { <crewMemberKey(nickname)>: <nickname> } }
 * Crews are readable by link and written only here, as before: no database rule changes.
 *
 * One call, two uses:
 *   { crew, time, by }              sets the date. A new time clears the list and puts the sender in;
 *                                   the same time again only adds the sender.
 *   { crew, nickname, in: bool }    adds a name to the list, or takes it off.
 */
import { Crew, CrewNight, crewMemberKey } from '../game-model';
import { get, crewsRef } from '../firebase';
import { cleanCrewId } from './crew';
import { nameFlag, NICKNAME_MAX, crewNameRefused } from '../name-flag';

/** A night can be set this far ahead. */
export const NIGHT_MAX_AHEAD_MS = 90 * 24 * 3600 * 1000;
/** A night that began this long ago can still be set (a phone's clock, a slow tap). */
export const NIGHT_PAST_GRACE_MS = 60 * 60 * 1000;
/** No more names than this on one night's list. */
export const NIGHT_IN_MAX = 40;

function fail(message: string, code: string) {
    return Promise.reject({ message, code });
}

/** A nickname as the game shows it: trimmed and cut like a player's. '' when there is none. */
export function cleanNightName(name: any): string {
    return Array.from(String(name == null ? '' : name).replace(/\s+/g, ' ').trim()).slice(0, NICKNAME_MAX).join('').trim();
}

export interface CrewNightBody {
    crew?: any;
    time?: any;
    by?: any;
    nickname?: any;
    in?: any;
}

/** The night with the date set by `by` (pure). */
export function nightWithDate(night: CrewNight | null | undefined, time: number, by: string): CrewNight {
    const same = !!night && night.time === time;
    const next: CrewNight = { time, by: same && night.by ? night.by : by };
    const list = same && night.in ? Object.assign({}, night.in) : {};
    if (by) {
        list[crewMemberKey(by)] = by;
    }
    if (Object.keys(list).length) {
        next.in = list;
    }
    return next;
}

/** The night with `nickname` on its list, or off it (pure). */
export function nightWithName(night: CrewNight, nickname: string, coming: boolean): CrewNight {
    const list = Object.assign({}, night.in || {});
    const key = crewMemberKey(nickname);
    if (coming) {
        if (!list[key] && Object.keys(list).length >= NIGHT_IN_MAX) {
            return night;
        }
        list[key] = nickname;
    } else {
        delete list[key];
    }
    const next: CrewNight = { time: night.time, by: night.by };
    if (Object.keys(list).length) {
        next.in = list;
    }
    return next;
}

export async function crewNight(body: CrewNightBody, now: number = Date.now()): Promise<{ night: CrewNight }> {
    body = body || {};
    const id = cleanCrewId(body.crew);
    const crew = id ? await get<Crew>(crewsRef.child(id)) : null;

    if (!crew) {
        return fail('Crew does not exist', 'CREW_NOT_EXIST');
    }

    const setsDate = body.time !== undefined && body.time !== null;
    let change: (night: CrewNight | null) => CrewNight | null;

    if (setsDate) {
        const time = Math.floor(Number(body.time));
        if (!isFinite(time) || time < now - NIGHT_PAST_GRACE_MS || time > now + NIGHT_MAX_AHEAD_MS) {
            return fail('Pick a night in the coming weeks', 'BAD_TIME');
        }
        // A name the filter would refuse is left out: the date still stands.
        const typed = cleanNightName(body.by);
        const by = typed && !nameFlag(typed) && !nameFlag(String(body.by)) ? typed : '';
        change = night => nightWithDate(night, time, by);
    } else {
        const nickname = cleanNightName(body.nickname);
        if (!nickname) {
            return fail('Who is coming?', 'BAD_NAME');
        }
        if (nameFlag(nickname) || nameFlag(String(body.nickname))) {
            return fail(crewNameRefused(crew.locale), 'BAD_NAME');
        }
        if (!crew.night || typeof crew.night.time !== 'number') {
            return fail('This crew has no game night yet', 'NO_NIGHT');
        }
        const coming = body.in !== false;
        change = night => night && typeof night.time === 'number' ? nightWithName(night, nickname, coming) : night;
    }

    const night = await new Promise<CrewNight>((resolve, reject) => {
        crewsRef.child(id).child('night').transaction(
            (current: CrewNight) => change(current),
            (error, committed, snapshot) => error ? reject(error) : resolve(snapshot.val()),
        );
    });
    return { night };
}
