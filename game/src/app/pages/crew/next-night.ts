/**
 * "Pick the next game night" on a crew page: a day and time the group gets as a calendar file
 * and a WhatsApp text with the crew link. Client-only: nothing is stored on the server, the
 * date travels in the group's chat and calendars. Kept free of Angular so it can be tested in Node.
 */

export const NIGHT_MINUTES = 90;
const DEFAULT_HOUR = 21;
const THURSDAY = 4;
const FRIDAY = 5;

export interface NightInfo {
    crewName: string;
    leader: string;
    url: string;
    locale: string;
}

const pad = (n: number) => (n < 10 ? '0' : '') + n;

/** The night a crew's week points to: in Israel the weekend starts Thursday night (Friday evening is family dinner). */
export function defaultNightDay(locale: string) {
    return locale === 'he' ? THURSDAY : FRIDAY;
}

/** The next Friday (Thursday for Hebrew crews) at 21:00 local time that is at least two hours away. */
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

/** A one-event calendar file, with a reminder an hour before. */
export function buildIcs(start: Date, info: NightInfo, crewId: string, now: Date) {
    const end = new Date(start.getTime() + NIGHT_MINUTES * 60 * 1000);
    const title = nightTitle(info);
    const description = `${nightText(start, info)}\n${info.url}`;
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//bullshit.wtf//Crew game night//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `UID:${crewId}-${utcStamp(start)}@bullshit.wtf`,
        `DTSTAMP:${utcStamp(now)}`,
        `DTSTART:${utcStamp(start)}`,
        `DTEND:${utcStamp(end)}`,
        `SUMMARY:${icsText(title)}`,
        `DESCRIPTION:${icsText(description)}`,
        `URL:${info.url}`,
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${icsText(title)}`,
        'TRIGGER:-PT1H',
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR',
    ];
    return lines.map(fold).join('\r\n') + '\r\n';
}

/** Google Calendar's "add event" link, for phones that do nothing with a downloaded .ics. */
export function googleCalendarUrl(start: Date, info: NightInfo) {
    const end = new Date(start.getTime() + NIGHT_MINUTES * 60 * 1000);
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
        `&text=${encodeURIComponent(nightTitle(info))}` +
        `&dates=${utcStamp(start)}/${utcStamp(end)}` +
        `&details=${encodeURIComponent(`${nightText(start, info)}\n${info.url}`)}`;
}

export function icsFileName(crewName: string) {
    const slug = (crewName || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `bullshit-${slug || 'game-night'}.ics`;
}
