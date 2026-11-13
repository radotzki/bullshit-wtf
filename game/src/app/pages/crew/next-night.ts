/**
 * "Pick the next game night" on a crew page: a day and time the group gets as a calendar file
 * and a WhatsApp text with the crew link. Client-only: nothing is stored on the server, the
 * date travels in the group's chat and calendars. Kept free of Angular so it can be tested in Node.
 */

export const NIGHT_MINUTES = 90;
const DEFAULT_HOUR = 21;
const FRIDAY = 5;

export interface NightInfo {
    crewName: string;
    leader: string;
    url: string;
    locale: string;
}

const pad = (n: number) => (n < 10 ? '0' : '') + n;

/**
 * The night a crew's week points to: Friday, in every language. Friday has 2.4 times the games of
 * any other day, in Hebrew games too (the after-dinner game), so the default follows the players.
 */
export function defaultNightDay(locale?: string) {
    return FRIDAY;
}

/** The next Friday at 21:00 local time that is at least two hours away. */
export function defaultNight(now: Date, locale?: string): Date {
    const day = defaultNightDay(locale);
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), DEFAULT_HOUR, 0, 0, 0);
    d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7));
    if (d.getTime() - now.getTime() < 2 * 3600 * 1000) {
        d.setDate(d.getDate() + 7);
    }
    return d;
}

/** Value for <input type="date">, local time: 2026-11-13. */
export function dateValue(d: Date) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Value for <input type="time">, local time: 21:00. */
export function timeValue(d: Date) {
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Reads the two inputs back into a local Date; undefined when either is empty or malformed. */
export function parseNight(date: string, time: string): Date {
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || '');
    const tm = /^(\d{1,2}):(\d{2})/.exec(time || '');
    if (!dm || !tm) {
        return undefined;
    }
    const d = new Date(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2], 0, 0);
    return isNaN(d.getTime()) ? undefined : d;
}

/** "Friday 13 November, 21:00" / "יום שישי, 13 בנובמבר, 21:00" */
export function nightLabel(d: Date, locale: string) {
    const he = locale === 'he';
    let day: string;
    try {
        day = d.toLocaleDateString(he ? 'he-IL' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
    } catch (e) {
        day = dateValue(d);
    }
    return `${day}, ${timeValue(d)}`;
}

/** " Alice leads 4 to 3." / " Who takes the first one?" / "": a full stop only when the line has none. */
function leaderSentence(leader: string) {
    const l = (leader || '').trim();
    return l ? ` ${/[.!?]$/.test(l) ? l : l + '.'}` : '';
}

export function nightText(d: Date, info: NightInfo) {
    const when = nightLabel(d, info.locale);
    const leader = leaderSentence(info.leader);
    return info.locale === 'he'
        ? `ערב בולשיט של ${info.crewName}: ${when}.${leader} הטבלה והמשחק החוזר כאן:`
        : `Bullshit game night for ${info.crewName}: ${when}.${leader} Scores and rematch here:`;
}

export function nightTitle(info: NightInfo) {
    return info.locale === 'he' ? `ערב בולשיט: ${info.crewName}` : `Bullshit game night: ${info.crewName}`;
}

/** 20261113T190000Z */
function utcStamp(d: Date) {
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
        `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

/** RFC 5545 text escaping. */
function icsText(s: string) {
    return (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function utf8Bytes(ch: string) {
    const c = ch.codePointAt(0);
    return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
}

/** RFC 5545 line folding: at most 75 octets a line, continued lines start with a space. */
function fold(line: string) {
    const out: string[] = [];
    let cur = '';
    let bytes = 0;
    for (const ch of Array.from(line)) {
        const b = utf8Bytes(ch);
        if (bytes + b > (out.length ? 74 : 75)) {
            out.push(cur);
            cur = '';
            bytes = 0;
        }
        cur += ch;
        bytes += b;
    }
    out.push(cur);
    return out.join('\r\n ');
}

/** "Friday" / "יום שישי": the weekday a weekly entry repeats on. */
export function weekdayName(d: Date, locale: string) {
    try {
        return d.toLocaleDateString(locale === 'he' ? 'he-IL' : 'en-GB', { weekday: 'long' });
    } catch (e) {
        return '';
    }
}

/** One calendar entry, whatever it is for: a crew's game night, or a guest's reminder to host. */
export interface CalendarEvent {
    title: string;
    /** The text of the entry; the link goes on its own line after it. */
    text: string;
    url: string;
    /** Unique per entry: `<uid>@bullshit.wtf`. */
    uid: string;
}

/** A one-event calendar file, with a reminder an hour before. */
export function buildEventIcs(start: Date, event: CalendarEvent, now: Date) {
    const end = new Date(start.getTime() + NIGHT_MINUTES * 60 * 1000);
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//bullshit.wtf//Crew game night//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${event.uid}@bullshit.wtf`,
        `DTSTAMP:${utcStamp(now)}`,
        `DTSTART:${utcStamp(start)}`,
        `DTEND:${utcStamp(end)}`,
        `SUMMARY:${icsText(event.title)}`,
        `DESCRIPTION:${icsText(`${event.text}\n${event.url}`)}`,
        `URL:${event.url}`,
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${icsText(event.title)}`,
        'TRIGGER:-PT1H',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR',
    ];
    return lines.map(fold).join('\r\n') + '\r\n';
}

const ICS_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** RRULE:FREQ=WEEKLY;BYDAY=FR, on the weekday of `start`. */
export function weeklyRule(start: Date) {
    return `RRULE:FREQ=WEEKLY;BYDAY=${ICS_DAYS[start.getDay()]}`;
}

/** 20261113T210000: local "floating" time, so a weekly entry stays at 21:00 across clock changes. */
function localStamp(d: Date) {
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
        `T${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * A calendar file for a game night that repeats every week, on the weekday and at the time of `start`.
 * Its times are local ("floating"): in winter and summer alike it is 21:00 where the phone is.
 */
export function buildWeeklyIcs(start: Date, event: CalendarEvent, now: Date) {
    const end = new Date(start.getTime() + NIGHT_MINUTES * 60 * 1000);
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//bullshit.wtf//Crew game night//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${event.uid}@bullshit.wtf`,
        `DTSTAMP:${utcStamp(now)}`,
        `DTSTART:${localStamp(start)}`,
        `DTEND:${localStamp(end)}`,
        weeklyRule(start),
        `SUMMARY:${icsText(event.title)}`,
        `DESCRIPTION:${icsText(`${event.text}\n${event.url}`)}`,
        `URL:${event.url}`,
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${icsText(event.title)}`,
        'TRIGGER:-PT1H',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR',
    ];
    return lines.map(fold).join('\r\n') + '\r\n';
}

/** Google Calendar's "add event" link for one entry, for phones that do nothing with a downloaded .ics. */
export function googleEventUrl(start: Date, event: CalendarEvent) {
    const end = new Date(start.getTime() + NIGHT_MINUTES * 60 * 1000);
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
        `&text=${encodeURIComponent(event.title)}` +
        `&dates=${utcStamp(start)}/${utcStamp(end)}` +
        `&details=${encodeURIComponent(`${event.text}\n${event.url}`)}`;
}

function nightEvent(start: Date, info: NightInfo, crewId: string): CalendarEvent {
    return { title: nightTitle(info), text: nightText(start, info), url: info.url, uid: `${crewId}-${utcStamp(start)}` };
}

/**
 * "Bullshit night for The Liars, every Friday at 21:00. Scores and rematch here:"
 * The weekly entry repeats for months, so its text holds no dated line like who leads today:
 * only the crew, the weekday and time, and its link, which shows the current scores.
 */
export function weeklyText(d: Date, info: NightInfo) {
    const day = weekdayName(d, info.locale);
    return info.locale === 'he'
        ? `ערב בולשיט של ${info.crewName}, כל ${day} ב-${timeValue(d)}. הטבלה והמשחק החוזר כאן:`
        : `Bullshit night for ${info.crewName}, every ${day} at ${timeValue(d)}. Scores and rematch here:`;
}

/**
 * The message that goes into the group chat with the weekly file: sent once, on the day, so it may
 * say who leads now. "Bullshit night for The Liars, every Friday at 21:00. Alice leads 4 to 3. Scores and rematch here:"
 */
export function weeklyShareText(d: Date, info: NightInfo) {
    const day = weekdayName(d, info.locale);
    const leader = leaderSentence(info.leader);
    return info.locale === 'he'
        ? `ערב בולשיט של ${info.crewName}, כל ${day} ב-${timeValue(d)}.${leader} הטבלה והמשחק החוזר כאן:`
        : `Bullshit night for ${info.crewName}, every ${day} at ${timeValue(d)}.${leader} Scores and rematch here:`;
}

/** The crew's weekly entry: one UID per crew, so adding it again updates it instead of doubling it. */
function weeklyEvent(start: Date, info: NightInfo, crewId: string): CalendarEvent {
    return { title: nightTitle(info), text: weeklyText(start, info), url: info.url, uid: `${crewId}-weekly` };
}

/** Every week, on the night's weekday and time, as a calendar file. */
export function buildWeeklyCrewIcs(start: Date, info: NightInfo, crewId: string, now: Date) {
    return buildWeeklyIcs(start, weeklyEvent(start, info, crewId), now);
}

/**
 * The weekly entry as a Google Calendar link. Google reads the times in `zone` (the phone's own),
 * so the entry stays at 21:00 there through clock changes.
 */
export function googleWeeklyUrl(start: Date, info: NightInfo, zone?: string) {
    const end = new Date(start.getTime() + NIGHT_MINUTES * 60 * 1000);
    const event = weeklyEvent(start, info, '');
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
        `&text=${encodeURIComponent(event.title)}` +
        `&dates=${localStamp(start)}/${localStamp(end)}` +
        (zone ? `&ctz=${encodeURIComponent(zone)}` : '') +
        `&recur=${encodeURIComponent(weeklyRule(start))}` +
        `&details=${encodeURIComponent(`${event.text}\n${event.url}`)}`;
}

export function weeklyFileName(crewName: string) {
    return icsFileName(crewName).replace(/\.ics$/, '-weekly.ics');
}

/** A crew's game night as a calendar file. */
export function buildIcs(start: Date, info: NightInfo, crewId: string, now: Date) {
    return buildEventIcs(start, nightEvent(start, info, crewId), now);
}

/** A crew's game night as a Google Calendar link. */
export function googleCalendarUrl(start: Date, info: NightInfo) {
    return googleEventUrl(start, nightEvent(start, info, ''));
}

export function icsFileName(crewName: string) {
    const slug = (crewName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `bullshit-${slug || 'game-night'}.ics`;
}
