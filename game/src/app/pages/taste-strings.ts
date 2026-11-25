/**
 * The words of the taste: the five pick-only questions a host who starts alone gets (see
 * TASTE_QUESTIONS in game-model), from the card before the first question to the final screen's invitation. (The lobby's link that
 * starts it is with the lobby's other lines, in game-staging/lobby-host.ts.)
 * In the game's language, like every game screen. Hebrew avoids gendered verbs: plural for an
 * instruction, and "מצאת" reads either way.
 * Kept free of Angular so it can be tested in Node.
 */

export interface TasteStrings {
    /** The card before the first question. */
    introTitle: (questions: number) => string;
    introHow: string;
    /** The final screen's headline: on how many questions the truth was picked. */
    found: (found: number, questions: number) => string;
    /** The final screen's invitation, in place of REMATCH. */
    askTitle: string;
    askText: string;
    invite: string;
    inviteHint: string;
    /** Under the invitation: the link to the daily puzzle (/daily, a page outside the app). */
    daily: string;
}

const en: TasteStrings = {
    introTitle: n => `${n} QUICK QUESTIONS`,
    introHow: 'No lies to write. Find the truth among ours.',
    found: (found, n) => found >= n ? `${n} OF ${n}! YOU FOUND EVERY TRUTH`
        : `YOU FOUND ${found} OF ${n} TRUTHS`,
    askTitle: 'Now try it with friends',
    askText: 'That was half the game. With friends, everyone writes a lie, and you score each time someone falls for yours.',
    invite: 'INVITE FRIENDS',
    inviteHint: 'Opens a new game with a link to send',
    daily: 'One question a day: today\'s Bullshit',
};

const he: TasteStrings = {
    introTitle: n => `${n} שאלות מהירות`,
    introHow: 'בלי לכתוב שקרים. מצאו את האמת בין השקרים שלנו.',
    found: (found, n) => found >= n ? `${n} מתוך ${n}! מצאת את האמת בכל שאלה`
        : `מצאת את האמת ב־${found} מתוך ${n} שאלות`,
    askTitle: 'עכשיו נסו עם חברים',
    askText: 'זה היה רק חצי מהמשחק. עם חברים כל אחד כותב שקר, ומקבלים נקודות על כל מי שנופל בו.',
    invite: 'הזמנת חברים',
    inviteHint: 'נפתח משחק חדש עם קישור לשליחה',
    daily: 'שאלה אחת ביום: הבולשיט היומי',
};

export function tasteStrings(locale: string): TasteStrings {
    return locale === 'he' ? he : en;
}

/**
 * The counselor's ending: the taste's final screen in a game opened from a group page (a youth
 * group, a counselors' post, a gibush), where the one who played alone is preparing an activity, not
 * looking for friends tonight. It says what happens on the day, offers a second phone to see the
 * lie-writing screen (the same new game as INVITE FRIENDS), and saves the activity's link with its
 * tag, so the day's game is still counted as the post's. Every other taste ends as before.
 */
export interface CounselorStrings {
    title: string;
    /** Three short lines: what the kids do, what happens on the day, the projector. */
    lines: string[];
    /** The main button: a new game with a link, to join from a second phone. */
    seeIt: string;
    seeItHint: string;
    /** The second button: the activity's link, to the share sheet (or copied). */
    save: string;
    saveTitle: string;
    saveText: string;
    copied: string;
}

const counselorEn: CounselorStrings = {
    title: 'That\'s how it looks on your phone. In the activity it\'s a different game:',
    lines: [
        'The kids write lies, not just pick answers.',
        'On the day, open a new game in front of the group: they scan the code off the screen, and you press START. It takes a minute.',
        'Got a projector? Open the game on the computer and press USE AS THE BIG SCREEN.',
    ],
    seeIt: 'SEE THE REAL GAME WITH A SECOND PHONE',
    seeItHint: 'Opens a new game with a link: join it from another phone',
    save: 'SAVE THE LINK FOR THE ACTIVITY',
    saveTitle: 'Bullshit for the activity',
    saveText: 'The activity\'s game: open it on the day in front of the group.',
    copied: 'Link copied. Paste it somewhere you\'ll find it on the day.',
};

const counselorHe: CounselorStrings = {
    title: 'ככה זה נראה מהטלפון שלכם. בפעולה זה משחק אחר:',
    lines: [
        'החניכים כותבים שקרים, לא רק בוחרים.',
        'ביום הפעולה פותחים משחק חדש מול החניכים: הם סורקים את הקוד מהמסך, ואתם לוחצים \'מתחילים\'. זה לוקח דקה.',
        'יש מקרן? פתחו את המשחק במחשב ולחצו \'להפוך למסך הגדול\'.',
    ],
    seeIt: 'לראות את המשחק האמיתי עם טלפון נוסף',
    seeItHint: 'נפתח משחק חדש עם קישור: מצטרפים אליו מטלפון אחר',
    save: 'שמירת הקישור לפעולה',
    saveTitle: 'בולשיט לפעולה',
    saveText: 'המשחק של הפעולה: פותחים אותו ביום הפעולה מול החניכים.',
    copied: 'הקישור הועתק. הדביקו אותו איפה שתמצאו אותו ביום הפעולה.',
};

export function counselorStrings(locale: string): CounselorStrings {
    return locale === 'he' ? counselorHe : counselorEn;
}

/**
 * The campaign tags of the group pages and the counselors' posts, and the page each one's link opens.
 * A family's tag (peula-net-home, the kids' take-home link) is not one: that game is played at home.
 */
const GROUP_PAGES: { [tag: string]: string } = {
    'peula-net': '/he/youth-group',
    'seo-he-youth': '/he/youth-group',
    'bnei-akiva': '/he/youth-group',
    'zofim': '/he/youth-group',
    'pitch-he-zofim': '/he/youth-group',
    'pop-edu': '/he/youth-group',
    'seo-he-gibush': '/he/gibush',
};

/**
 * The group tag of this tab's campaign, or null. A play-test of one (test-peula-net) counts as it, so
 * the ending can be played from a ?via=test- link that stays out of every count.
 */
export function groupTag(campaign: string | null | undefined): string | null {
    const tag = String(campaign || '').toLowerCase().trim().replace(/^test-/, '');
    return Object.prototype.hasOwnProperty.call(GROUP_PAGES, tag) ? tag : null;
}

/** The activity's link: the group page, with the tag it came by (a play-test keeps its test tag). */
export function activityLink(campaign: string): string {
    const tag = groupTag(campaign);
    if (!tag) {
        return null;
    }
    const via = String(campaign).toLowerCase().trim();
    return `https://bullshit.wtf${GROUP_PAGES[tag]}?via=${encodeURIComponent(via)}`;
}
