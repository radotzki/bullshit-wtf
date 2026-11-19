/**
 * The words of the host's two controls (see functions/src/controllers/host-controls.ts): hide a lie
 * before the answers are on the screens, and remove a player. In the game's language, like every game
 * screen. Hebrew avoids gendered verbs: the plural for an instruction, and "the hosts" for the host.
 * Kept free of Angular so it can be tested in Node: game/test/host-controls.test.js.
 */

export interface HostStrings {
    /** The header's button that opens the players list, on the host's phone or big screen. */
    playersButton: string;
    playersTitle: string;
    removeHint: string;
    remove: string;
    removeConfirm: (name: string) => string;
    yesRemove: string;
    cancel: string;
    close: string;
    thisPhone: string;
    /** On the removed player's own phone. */
    removedTitle: string;
    removedText: string;
    backHome: string;
    /** The host's writing screen, once their own lie is in. */
    checkButton: string;
    checkWarn: string;
    checkOpen: string;
    checkTitle: string;
    hide: string;
    unhide: string;
    hidden: string;
    noLiesYet: string;
    showNow: string;
    checkingNote: string;
    tooLate: string;
    /** The answers screen. */
    yourLieHidden: string;
    checkedNoScore: string;
    /** The big screen's pairing of the host's phone (a big-screen host has no seat and no phone in the game). */
    remoteButton: string;
    /** The header button's own words, short enough for the big screen's lobby header. */
    remoteShort: string;
    remoteIntro: string;
    remoteScan: string;
    remoteType: string;
    remoteSafety: string;
    remotePair: string;
    remoteAsked: (count: string) => string;
    remoteWrong: string;
    remoteExpired: string;
    remoteOnce: string;
    remoteNewCode: string;
    remotePaired: string;
    remoteDisconnect: string;
    remotePairAnother: string;
    remoteCantPair: string;
    /** The host's phone, paired as the big screen's remote (pages/host-remote). */
    phoneTitle: string;
    phoneShowNumber: string;
    phoneWaiting: string;
    phoneNoLink: string;
    phoneLost: string;
    phoneNotPlayer: string;
    phoneLiesLater: string;
    phoneGameOver: string;
}

const en: HostStrings = {
    playersButton: 'Players',
    playersTitle: 'Players at the table',
    removeHint: 'Remove someone who shouldn\'t be here. That phone can\'t come back to this game.',
    remove: 'REMOVE',
    removeConfirm: name => `Remove ${name} from the game?`,
    yesRemove: 'YES, REMOVE',
    cancel: 'CANCEL',
    close: 'CLOSE',
    thisPhone: '(this phone)',
    removedTitle: 'You\'re out of this game',
    removedText: 'The host removed you from this game.',
    backHome: 'BACK HOME',
    checkButton: 'CHECK THE LIES',
    checkWarn: 'You\'ll read every lie before the table does, so your pick won\'t score this question.',
    checkOpen: 'SHOW ME THE LIES',
    checkTitle: 'Hide a lie before it goes on the screens. Nobody is told whose it was.',
    hide: 'HIDE',
    unhide: 'SHOW',
    hidden: 'Hidden',
    noLiesYet: 'No lies yet.',
    showNow: 'SHOW THE ANSWERS',
    checkingNote: 'The answers wait for you until the clock runs out.',
    tooLate: 'The answers are already on the screens.',
    yourLieHidden: 'The host hid your lie this time, so it isn\'t on the list. Pick as usual.',
    checkedNoScore: 'You checked the lies, so your pick doesn\'t score this question.',
    remoteButton: 'Host controls on your phone',
    remoteShort: 'Your phone',
    remoteIntro: 'Hide lies and remove players from your phone, where the big screen doesn\'t show them. Your phone won\'t take a seat.',
    remoteScan: 'Scan with your phone, or open:',
    remoteType: 'Then type here the number your phone shows:',
    remoteSafety: 'Type only the number on your own phone, never one someone else gives you.',
    remotePair: 'PAIR',
    remoteAsked: count => `${count} phones opened this link. Type only the number on yours.`,
    remoteWrong: 'That\'s not the number on a phone that opened the link.',
    remoteExpired: 'This code has expired.',
    remoteOnce: 'The code works once, for 3 minutes.',
    remoteNewCode: 'NEW CODE',
    remotePaired: 'Your phone has the host controls.',
    remoteDisconnect: 'DISCONNECT THE PHONE',
    remotePairAnother: 'PAIR ANOTHER PHONE',
    remoteCantPair: 'A phone can be paired only when this computer is the big screen.',
    phoneTitle: 'Host controls',
    phoneShowNumber: 'Type this number on the big screen:',
    phoneWaiting: 'Waiting for the big screen…',
    phoneNoLink: 'This link has expired. Press "Host controls on your phone" on the big screen for a new one.',
    phoneLost: 'This phone no longer has the host controls. Pair it again from the big screen.',
    phoneNotPlayer: 'This phone runs the game. It isn\'t a player.',
    phoneLiesLater: 'The lies show up here while the players write them.',
    phoneGameOver: 'The game is over.',
};

const he: HostStrings = {
    playersButton: 'שחקנים',
    playersTitle: 'השחקנים בשולחן',
    removeHint: 'אפשר להוציא מי שלא אמור להיות כאן. הטלפון שיוצא לא יוכל לחזור למשחק הזה.',
    remove: 'הוצאה',
    removeConfirm: name => `להוציא את ${name} מהמשחק?`,
    yesRemove: 'כן, להוציא',
    cancel: 'ביטול',
    close: 'סגירה',
    thisPhone: '(הטלפון הזה)',
    removedTitle: 'יצאת מהמשחק הזה',
    removedText: 'המארחים הוציאו אותך מהמשחק הזה.',
    backHome: 'חזרה לדף הבית',
    checkButton: 'בדיקת השקרים',
    checkWarn: 'השקרים יוצגו לך לפני כולם, ולכן הבחירה שלך לא תקבל ניקוד בשאלה הזאת.',
    checkOpen: 'להציג לי את השקרים',
    checkTitle: 'אפשר להסתיר שקר לפני שהוא עולה למסכים. אף אחד לא יידע של מי הוא היה.',
    hide: 'הסתרה',
    unhide: 'החזרה',
    hidden: 'מוסתר',
    noLiesYet: 'עוד אין שקרים.',
    showNow: 'להציג את התשובות',
    checkingNote: 'התשובות מחכות לך עד שהזמן נגמר.',
    tooLate: 'התשובות כבר על המסכים.',
    yourLieHidden: 'המארחים הסתירו את השקר שלך הפעם, ולכן הוא לא ברשימה. בחרו כרגיל.',
    checkedNoScore: 'בדקת את השקרים, ולכן הבחירה שלך לא מקבלת ניקוד בשאלה הזאת.',
    remoteButton: 'שליטה מהטלפון',
    remoteShort: 'מהטלפון',
    remoteIntro: 'אפשר להסתיר שקרים ולהוציא שחקנים מהטלפון, בלי שזה יופיע על המסך הגדול. הטלפון לא תופס מקום במשחק.',
    remoteScan: 'סורקים בטלפון, או פותחים:',
    remoteType: 'ואז מקלידים כאן את המספר שמופיע בטלפון:',
    remoteSafety: 'מקלידים רק את המספר שבטלפון שלכם, אף פעם לא מספר שמישהו אחר נותן.',
    remotePair: 'חיבור',
    remoteAsked: count => `${count} טלפונים פתחו את הקישור. מקלידים רק את המספר שבטלפון שלכם.`,
    remoteWrong: 'זה לא המספר שמופיע בטלפון שפתח את הקישור.',
    remoteExpired: 'תוקף הקוד הזה נגמר.',
    remoteOnce: 'הקוד עובד פעם אחת, למשך 3 דקות.',
    remoteNewCode: 'קוד חדש',
    remotePaired: 'הטלפון מחובר לשליטת המארחים.',
    remoteDisconnect: 'ניתוק הטלפון',
    remotePairAnother: 'חיבור טלפון אחר',
    remoteCantPair: 'אפשר לחבר טלפון רק כשהמחשב הזה הוא המסך הגדול.',
    phoneTitle: 'שליטת המארחים',
    phoneShowNumber: 'מקלידים את המספר הזה במסך הגדול:',
    phoneWaiting: 'מחכים למסך הגדול…',
    phoneNoLink: 'תוקף הקישור הזה נגמר. לוחצים על "שליטה מהטלפון" במסך הגדול לקישור חדש.',
    phoneLost: 'הטלפון הזה כבר לא מחובר לשליטת המארחים. אפשר לחבר אותו שוב מהמסך הגדול.',
    phoneNotPlayer: 'הטלפון הזה מנהל את המשחק. הוא לא משתתף בו.',
    phoneLiesLater: 'השקרים יופיעו כאן בזמן שהשחקנים כותבים אותם.',
    phoneGameOver: 'המשחק נגמר.',
};

export function hostStrings(locale: string): HostStrings {
    return locale === 'he' ? he : en;
}

/** One seat in the host's players list. */
export interface HostSeatRow {
    pid: string;
    nickname: string;
    /** The host's own seat: it has no REMOVE button. */
    mine: boolean;
}

/** The players list the host sees: every seat by name, the host's own first and without REMOVE. */
export function hostSeatRows(players: { [pid: string]: { nickname?: string; host?: boolean } } | null | undefined,
    myPid: string | null | undefined): HostSeatRow[] {
    const all = players || {};
    return Object.keys(all)
        .filter(pid => !!all[pid])
        .map(pid => ({ pid, nickname: String(all[pid].nickname || ''), mine: pid === myPid || all[pid].host === true }))
        .sort((a, b) => (a.mine === b.mine ? (a.nickname > b.nickname ? 1 : a.nickname < b.nickname ? -1 : 0) : a.mine ? -1 : 1));
}

/**
 * The line on the answers screen about this phone's own lie, or null: the host hid it (this phone sent
 * a lie on this question and it is not among the answers), or this phone is the host who read the lies.
 * `sentOn` and `checkedOn` are the question indexes this phone sent a lie on and checked the lies on.
 */
export function answersNotice(t: HostStrings, question: number | null | undefined, sentOn: number | null | undefined,
    checkedOn: number | null | undefined, ownLieListed: boolean, aboutMe: boolean): string | null {
    if (typeof question !== 'number') {
        return null;
    }
    if (checkedOn === question) {
        return t.checkedNoScore;
    }
    if (!aboutMe && sentOn === question && !ownLieListed) {
        return t.yourLieHidden;
    }
    return null;
}

/**
 * Has this phone's seat gone from the table while the game is on? Then the host removed it (a seat is
 * never taken away otherwise). Only once the phone has seen its seat: a phone still joining has none.
 */
export function seatRemoved(hadSeat: boolean, players: { [pid: string]: any } | null | undefined, myPid: string | null | undefined,
    gameOver: boolean): boolean {
    return hadSeat && !!myPid && !gameOver && !!players && typeof players === 'object' && !players[myPid];
}

/** One lie in the host's list. */
export interface HostLieRow {
    id: string;
    text: string;
    hidden: boolean;
}

/**
 * The host's list of the lies written so far, from the answers node as it is now: players' lies only (no
 * house lie, no truth), not the host's own, sorted by text so the order says nothing of who sent first.
 * `hidden` is the set of lies the host hid on this question.
 */
export function hostLieRows(answers: { [pid: string]: { text?: string; houseLie?: boolean; realAnswer?: boolean } } | null | undefined,
    myPid: string | null | undefined, hidden: { [id: string]: boolean }): HostLieRow[] {
    const all = answers || {};
    return Object.keys(all)
        .filter(id => id !== myPid && !!all[id] && !all[id].houseLie && !all[id].realAnswer
            && typeof all[id].text === 'string' && !!all[id].text)
        .map(id => ({ id, text: all[id].text, hidden: !!(hidden && hidden[id]) }))
        .sort((a, b) => a.text > b.text ? 1 : a.text < b.text ? -1 : 0);
}

/** The address the big screen shows (as a QR and a link) for pairing the host's phone: the PIN and a one-time code. */
export function remoteLink(site: string, pin: string, code: string): string {
    return `${site}/host/${String(pin || '').toUpperCase()}?c=${encodeURIComponent(code || '')}`;
}

/** The phone's number, spaced for reading across a room: "48 21". */
export function spacedNumber(digits: string | null | undefined): string {
    const d = String(digits || '');
    return d.length === 4 ? `${d.slice(0, 2)} ${d.slice(2)}` : d;
}
