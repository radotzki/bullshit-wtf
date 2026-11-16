import { Crew, CrewNight, NIGHT_IN_MAX, cleanTzOffset, crewMemberKey, nightStillAhead } from '../game-model';
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

/**
 * Characters that show nothing: zero-width spaces and joiners, text-direction marks and controls, the
 * byte-order mark, the soft hyphen. A name made of them would be a tick with nothing beside it.
 */
const INVISIBLE = /[\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u200B-\u200F\u202A-\u202E\u2060-\u206F\u3164\uFE00-\uFE0F\uFEFF\uFFA0]/g;

/**
 * A name on the night's list: one line, without invisible characters, cut to a nickname's length.
 * Empty when there is none, or when the name is not text (an object would read "[object O").
 */
export function cleanNightName(name: any): string {
    if (typeof name !== 'string') {
        return '';
    }
    const typed = name.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim();
    return Array.from(typed).slice(0, NICKNAME_MAX).join('').trim();
}

/** The whole typed name is checked, before any cut, like a nickname at the join page. */
function refused(name: any): boolean {
    const typed = typeof name === 'string' ? name.replace(INVISIBLE, '') : '';
    return !!nameFlag(typed) || !!nameFlag(cleanNightName(name));
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

/** Runs a transaction; `update` may return undefined to leave the value as it is (the result is then the value). */
function transact<T>(ref: any, update: (current: T) => T | undefined): Promise<T> {
    return new Promise((resolve, reject) => {
        ref.transaction(update, (error: any, committed: boolean, snapshot: any) =>
            error ? reject(error) : resolve(snapshot && snapshot.val()));
    });
}

/**
 * Sets the crew's next game night. Whoever sets it is in. The same time again keeps the list of who
 * is in; a new time starts a new list, since "I'm in" was said for the other night.
 *
 * `prev`, when given, is the night the sender's screen showed (null for none): "Same time next week?"
 * sends it. If another phone set a different night in the meantime, and that night is still ahead,
 * the crew keeps it and the answer says `kept`: two players with the sheet open at once cannot move
 * each other's date. The sender who set a night can still change it, since they send that night as
 * `prev`. The crew page's NEXT GAME NIGHT sends no `prev`, and moves the night as before.
 *
 * "Still ahead" is the final screen's own rule (nightStillAhead in game-model.ts): after tonight's
 * 05:00 on the sender's clock, `tz` being that clock's Date.getTimezoneOffset, with the server's time.
 * A night later tonight is the one being played, here as on the phone, so it does not stop next
 * week's. A sender with no `tz` (an old site) gets the old rule, later than now.
 */
export async function setCrewNight(crewId: any, time: any, by?: any, prev?: any, tz?: any)
    : Promise<{ night: CrewNight; kept?: boolean }> {
    const crew = await crewOf(crewId);
    const now = Date.now();
    const at = Math.floor(Number(time) / MINUTE_MS) * MINUTE_MS;

    if (!isFinite(at) || at < now - PAST_SLACK_MS || at > now + AHEAD_MAX_MS) {
        return fail('Pick a time that is still ahead', 'BAD_TIME');
    }

    const name = refused(by) ? '' : cleanNightName(by);
    const checked = prev !== undefined;
    const seen = prev === null ? null : Math.floor(Number(prev) / MINUTE_MS) * MINUTE_MS;
    const offset = cleanTzOffset(tz);
    const ahead = (t: number) => offset === null ? t > Date.now() : nightStillAhead(t, Date.now(), offset);
    let kept = false;
    const night = await transact<CrewNight>(crewsRef.child(crew.id).child('night'), (current) => {
        kept = false;
        if (checked && current && current.time && current.time !== at && current.time !== seen
            && ahead(current.time)) {
            kept = true;
            return undefined;
        }
        const next: CrewNight = current && current.time === at ? current : { time: at };
        if (name) {
            next.by = next.by || name;
            next.in = next.in || {};
            next.in[crewMemberKey(name)] = name;
        }
        return next;
    });
    return kept ? { night, kept } : { night };
}

/**
 * "I'm in" (or "Can't make it") for the crew's night, by nickname: no accounts, like the crew itself.
 * A name the crew never had is welcome: that is a friend who comes along. Saying it twice is one name.
 */
export async function crewNightIn(crewId: any, nickname: any, coming: boolean)
    : Promise<{ in: boolean; nickname: string; isNew: boolean; count: number }> {
    const crew = await crewOf(crewId);
    const name = cleanNightName(nickname);

    // An empty name, one of invisible characters only, or one that is not text: in the crew's language,
    // since the page shows a BAD_NAME's words as they are.
    if (!name || typeof nickname !== 'string') {
        return fail(crew.locale === 'he' ? 'כתבו את השם שלכם.' : 'Type your name.', 'BAD_NAME');
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

/**
 * The crewNight function's body: `{ crew, time, by, prev?, tz? }` sets the night, `{ crew, nickname, in }`
 * answers it.
 */
export function crewNight(body: any) {
    body = body && typeof body === 'object' ? body : {};
    if (body.time !== undefined && body.time !== null) {
        return setCrewNight(body.crew, body.time, body.by, 'prev' in body ? body.prev : undefined, body.tz);
    }
    return crewNightIn(body.crew, body.nickname, body.in !== false);
}
