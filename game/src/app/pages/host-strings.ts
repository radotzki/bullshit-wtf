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
};

const he: HostStrings = {
    playersButton: 'שחקנים',
    playersTitle: 'השחקנים בשולחן',
    removeHint: 'אפשר להוציא מי שלא אמור להיות כאן. מהטלפון הזה אי אפשר יהיה לחזור למשחק.',
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
