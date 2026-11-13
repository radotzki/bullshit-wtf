import { Crew, CrewNight, NIGHT_IN_MAX, crewMemberKey } from '../game-model';
import { get, crewsRef } from '../firebase';
import { nameFlag, crewNameRefused, NICKNAME_MAX } from '../name-flag';
import { cleanCrewId } from './crew';

// A night can be set from a little in the past (a slow phone, a clock that is off) to a year ahead.
const PAST_SLACK_MS = 10 * 60 * 1000;
const AHEAD_MAX_MS = 366 * 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

function fail(message: string, code: string) {
    return Promise.reject({ message, code });
}

/** A name on the night's list: one line, cut to a nickname's length. Empty when there is none. */
export function cleanNightName(name: any): string {
    const typed = String(name == null ? '' : name).replace(/\s+/g, ' ').trim();
    return Array.from(typed).slice(0, NICKNAME_MAX).join('').trim();
}

/** The whole typed name is checked, before any cut, like a nickname at the join page. */
function refused(name: any): boolean {
    return !!nameFlag(String(name == null ? '' : name)) || !!nameFlag(cleanNightName(name));
}

async function crewOf(crewId: any): Promise<Crew> {
    const id = cleanCrewId(crewId);
    const crew = id ? await get<Crew>(crewsRef.child(id)) : null;
    if (!crew) {
        return fail('Crew does not exist', 'CREW_NOT_EXIST') as any;
    }
    crew.id = id;
    return crew;
}

function transact<T>(ref: any, update: (current: T) => T): Promise<T> {
    return new Promise((resolve, reject) => {
        ref.transaction(update, (error: any, committed: boolean, snapshot: any) =>
            error ? reject(error) : resolve(snapshot && snapshot.val()));
    });
}

/**
 * Sets the crew's next game night. Whoever sets it is in. The same time again keeps the list of who
 * is in; a new time starts a new list, since "I'm in" was said for the other night.
 */
export async function setCrewNight(crewId: any, time: any, by?: any): Promise<{ night: CrewNight }> {
    const crew = await crewOf(crewId);
    const now = Date.now();
    const at = Math.floor(Number(time) / MINUTE_MS) * MINUTE_MS;

    if (!isFinite(at) || at < now - PAST_SLACK_MS || at > now + AHEAD_MAX_MS) {
        return fail('Pick a time that is still ahead', 'BAD_TIME');
    }

    const name = refused(by) ? '' : cleanNightName(by);
    const night = await transact<CrewNight>(crewsRef.child(crew.id).child('night'), (current) => {
        const next: CrewNight = current && current.time === at ? current : { time: at };
        if (name) {
            next.by = next.by || name;
            next.in = next.in || {};
            next.in[crewMemberKey(name)] = name;
        }
        return next;
    });
    return { night };
}

/**
 * "I'm in" (or "Can't make it") for the crew's night, by nickname: no accounts, like the crew itself.
 * A name the crew never had is welcome: that is a friend who comes along. Saying it twice is one name.
 */
export async function crewNightIn(crewId: any, nickname: any, coming: boolean)
    : Promise<{ in: boolean; nickname: string; isNew: boolean; count: number }> {
    const crew = await crewOf(crewId);
    const name = cleanNightName(nickname);

    if (!name) {
        return fail('Type your name', 'BAD_NAME');
    }
    if (refused(nickname)) {
        return fail(crewNameRefused(crew.locale), 'BAD_NAME');
    }
    if (!crew.night || !crew.night.time) {
        return fail('This crew has no game night yet', 'NO_NIGHT');
    }

    const key = crewMemberKey(name);
    let full = false;
    const list = await transact<{ [key: string]: string | boolean }>(
        crewsRef.child(crew.id).child('night').child('in'), (current) => {
            const next = current || {};
            full = false;
            if (!coming) {
                delete next[key];
            } else if (!next[key]) {
                if (Object.keys(next).length >= NIGHT_IN_MAX) {
                    full = true;
                } else {
                    next[key] = name;
                }
            }
            return next;
        });

    if (full) {
        return fail('This night is full', 'NIGHT_FULL');
    }
    return {
        in: coming,
        nickname: name,
        isNew: !(crew.members && crew.members[key]),
        count: Object.keys(list || {}).length,
    };
}

/** The crewNight function's body: `{ crew, time, by }` sets the night, `{ crew, nickname, in }` answers it. */
export function crewNight(body: any) {
    body = body && typeof body === 'object' ? body : {};
    if (body.time !== undefined && body.time !== null) {
        return setCrewNight(body.crew, body.time, body.by);
    }
    return crewNightIn(body.crew, body.nickname, body.in !== false);
}
