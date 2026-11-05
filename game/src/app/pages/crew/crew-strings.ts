/**
 * Every word on a crew page, in the crew's language. A Hebrew crew (crew.locale === 'he') gets
 * the whole page in Hebrew, right to left; every other crew keeps the English page.
 * Kept free of Angular so it can be tested in Node.
 */

export interface CrewStrings {
    dir: 'rtl' | 'ltr';
    notFoundTitle: string;
    notFound: string;
    createGame: string;
    played: (games: number) => string;
    wins: string;
    points: string;
    rematch: string;
    joinRematch: string;
    lobby: (players: number, pin: string) => string;
    rematchHint: string;
    /** Shown in place of the server's (English, technical) message when a rematch fails; null keeps it. */
    rematchFailed: string | null;
    sendToCrew: string;
    whatsapp: string;
    copyLink: string;
    copied: string;
    nightTitle: string;
    nightHint: string;
    day: string;
    time: string;
    nightPast: string;
    nightWhatsapp: string;
    calendar: string;
    google: string;
    nightSent: string;
}

const en: CrewStrings = {
    dir: 'ltr',
    notFoundTitle: 'Crew not found',
    notFound: 'This crew link does not work. Check it, or start a new game and save your crew at the end.',
    createGame: 'CREATE GAME',
    played: n => n === 1 ? '1 game played' : `${n} games played`,
    wins: 'Wins',
    points: 'Points',
    rematch: 'REMATCH',
    joinRematch: 'JOIN THE REMATCH',
    lobby: (n, pin) => `${n === 1 ? '1 player' : n + ' players'} in the lobby, PIN ${pin}`,
    rematchHint: 'Starts a new game for the crew. Send the link so everyone joins.',
    rematchFailed: null,
    sendToCrew: 'SEND TO THE CREW',
    whatsapp: 'WHATSAPP',
    copyLink: 'COPY CREW LINK',
    copied: 'Copied! Paste it in your group chat.',
    nightTitle: 'NEXT GAME NIGHT',
    nightHint: 'Pick a day and time, then send it to the group with a calendar invite.',
    day: 'Day',
    time: 'Time',
    nightPast: 'That time has passed. Pick a later one.',
    nightWhatsapp: 'SEND THE DATE ON WHATSAPP',
    calendar: 'CALENDAR INVITE',
    google: 'or add it to Google Calendar',
    nightSent: 'Game night:',
};

const he: CrewStrings = {
    dir: 'rtl',
    notFoundTitle: 'החבורה לא נמצאה',
    notFound: 'הקישור לחבורה לא עובד. בדקו אותו, או פתחו משחק חדש ושמרו את החבורה בסוף.',
    createGame: 'משחק חדש',
    played: n => n === 1 ? 'משחק אחד עד עכשיו' : `${n} משחקים עד עכשיו`,
    wins: 'ניצחונות',
    points: 'נקודות',
    rematch: 'משחק חוזר',
    joinRematch: 'הצטרפו למשחק החוזר',
    lobby: (n, pin) => `${n === 1 ? 'שחקן אחד מחכה' : n + ' שחקנים מחכים'} במשחק, קוד ${pin}`,
    rematchHint: 'פותח משחק חדש לחבורה. שלחו את הקישור כדי שכולם יצטרפו.',
    rematchFailed: 'משהו השתבש בפתיחת המשחק. נסו שוב.',
    sendToCrew: 'שליחה לחבורה',
    whatsapp: 'וואטסאפ',
    copyLink: 'העתקת הקישור לחבורה',
    copied: 'הקישור הועתק. הדביקו אותו בקבוצה שלכם.',
    nightTitle: 'ערב המשחק הבא',
    nightHint: 'בחרו יום ושעה, ושלחו לחבורה עם הזמנה ליומן.',
    day: 'יום',
    time: 'שעה',
    nightPast: 'השעה הזאת כבר עברה. בחרו מועד מאוחר יותר.',
    nightWhatsapp: 'שליחת המועד בוואטסאפ',
    calendar: 'הזמנה ליומן',
    google: 'או הוסיפו ליומן Google',
    nightSent: 'ערב המשחק:',
};

export function crewStrings(locale: string): CrewStrings {
    return locale === 'he' ? he : en;
}

/** The page's language before the crew loads (or when it is not found): /he/c/<id> is Hebrew. */
export function localeFromPath(path: string) {
    return /^\/he(\/|$)/.test(path || '') ? 'he' : 'en';
}
