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
    /** The weekly entry's button: "EVERY FRIDAY IN MY CALENDAR". */
    weekly: (day: string) => string;
    weeklyHint: string;
    weeklyGoogle: string;
    weeklySent: (day: string) => string;
    // WHO'S IN? The game night block at the top of the page (see crew-night.ts).
    gameNight: string;
    whosIn: string;
    imIn: string;
    namePrompt: string;
    /** "You're in. See you Friday." With no weekday (the night is today): "See you tonight." */
    youreIn: (day: string) => string;
    cantMakeIt: string;
    addToCalendar: string;
    nudge: string;
    /** The WhatsApp text of ASK WHO ELSE IS IN; the crew link follows on its own line. */
    nudgeText: (count: number, when: string, names: string[]) => string;
    /** One line for a visitor who has never played. */
    whatIsIt: string;
    itsGameNight: string;
    openLobby: string;
    /** "3 in: Omer, Noa, Dana" */
    inCount: (names: string[]) => string;
    nightPassed: string;
    pickNight: string;
    /** Shown when I'M IN fails for a reason the server gave no words for in this language. */
    inFailed: string;
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
    weekly: day => `EVERY ${day.toUpperCase()} IN MY CALENDAR`,
    weeklyHint: 'Same night every week, with the crew link in it. Skip a week whenever you like.',
    weeklyGoogle: 'or every week in Google Calendar',
    weeklySent: day => `In your calendar: every ${day}.`,
    gameNight: 'GAME NIGHT',
    whosIn: 'WHO\'S IN?',
    imIn: 'I\'M IN',
    namePrompt: 'Your name in the game',
    youreIn: day => day ? `You're in. See you ${day}.` : 'You\'re in. See you tonight.',
    cantMakeIt: 'Can\'t make it',
    addToCalendar: 'ADD TO MY CALENDAR',
    nudge: 'ASK WHO ELSE IS IN',
    nudgeText: (n, when, names) => `${n} of us are in for Bullshit on ${when}: ${names.join(', ')}. Who's missing?`,
    whatIsIt: 'Bullshit is a party game on your phones: everyone invents a fake answer, then tries to spot the real one. '
        + 'Free, nothing to install.',
    itsGameNight: 'IT\'S GAME NIGHT',
    openLobby: 'OPEN THE LOBBY',
    inCount: names => `${names.length} in: ${names.join(', ')}`,
    nightPassed: 'That night has passed. Pick a new one?',
    pickNight: 'PICK A NIGHT',
    inFailed: 'That did not go through. Try again.',
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
    lobby: (n, pin) => `${n === 1 ? 'שחקן אחד' : n + ' שחקנים'} כבר בפנים, קוד ${pin}`,
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
    weekly: day => `כל ${day} ביומן שלי`,
    weeklyHint: 'אותו ערב בכל שבוע, עם הקישור לחבורה. אפשר לדלג על שבוע מתי שרוצים.',
    weeklyGoogle: 'או כל שבוע ביומן Google',
    weeklySent: day => `ביומן: כל ${day}.`,
    gameNight: 'ערב המשחק',
    whosIn: 'מי בפנים?',
    imIn: 'אני בפנים',
    namePrompt: 'השם שלך במשחק',
    youreIn: day => day ? `נרשמת. נתראה ב${day}.` : 'נרשמת. נתראה הערב.',
    cantMakeIt: 'לא יוצא לי',
    addToCalendar: 'הוספה ליומן שלי',
    nudge: 'לשאול מי עוד בא',
    nudgeText: (n, when, names) => `${n} כבר בפנים לבולשיט ב${when}: ${names.join(', ')}. מי חסר?`,
    whatIsIt: 'בולשיט הוא משחק חברתי בטלפונים: כולם ממציאים תשובה שקרית ומנסים לזהות את האמיתית. בחינם, בלי להתקין כלום.',
    itsGameNight: 'ערב המשחק התחיל',
    openLobby: 'פותחים משחק',
    inCount: names => `${names.length} בפנים: ${names.join(', ')}`,
    nightPassed: 'הערב הזה עבר. קובעים חדש?',
    pickNight: 'קביעת ערב',
    inFailed: 'זה לא עבר. נסו שוב.',
};

export function crewStrings(locale: string): CrewStrings {
    return locale === 'he' ? he : en;
}

/** The page's language before the crew loads (or when it is not found): /he/c/<id> is Hebrew. */
export function localeFromPath(path: string) {
    return /^\/he(\/|$)/.test(path || '') ? 'he' : 'en';
}
