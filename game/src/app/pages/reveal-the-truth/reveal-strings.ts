/**
 * Words of the staged reveal, in the game's language, and the lines that tell a player how they did.
 * Pure (no Angular), so it is unit tested: game/test/reveal-strings.test.js.
 * Hebrew avoids gendered verbs: every line reads the same to any player.
 */

// Keeps "+500" reading left to right inside a Hebrew line (a left-to-right isolate).
const LRI = '\u2066';
const PDI = '\u2069';

export function signedPoints(points: number): string {
    return `${LRI}${points > 0 ? '+' : ''}${points}${PDI}`;
}

function listEn(names: string[]): string {
    return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function listHe(names: string[]): string {
    return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} ו-${names[names.length - 1]}`;
}

export const revealStrings = {
    en: {
        truthIs: 'AND THE TRUTH IS…',
        theTruth: 'THE TRUTH',
        houseLie: 'Home Grown Bullshit',
        pickedBy: 'picked by',
        foundBy: 'found by',
        nobodyFound: 'nobody found it',
        bullshitBy: 'bullshit by',
        nobodyFellFor: 'Nobody fell for:',
        scores: 'SCORES',
        next: 'NEXT',
        waiting: (n: number) => `Waiting for ${n} ${n === 1 ? 'friend' : 'friends'}`,
        soundOn: 'Sound is on. Tap to mute',
        soundOff: 'Sound is off. Tap to unmute',
        list: listEn,
        youFooled: (names: string[]) => `You fooled ${listEn(names)}!`,
        foundTruth: (points: number) => `You found the truth! ${signedPoints(points)}`,
        fellForHouse: (lost: number) => `You fell for our bullshit. ${signedPoints(lost)}`,
        fellForHouseFree: 'You fell for our bullshit. No points to lose yet!',
        fellFor: (names: string[]) => `You fell for ${listEn(names)}'s bullshit.`,
        didNotPick: 'You didn\'t pick an answer.',
        fooled: (names: string[], points: number) => `You fooled ${listEn(names)}! ${signedPoints(points)}`,
        fooledNobody: 'Nobody fell for your answer.',
    },
    he: {
        truthIs: 'והאמת היא…',
        theTruth: 'האמת',
        houseLie: 'בולשיט של הבית',
        pickedBy: 'בחרו בזה:',
        foundBy: 'מצאו את האמת:',
        nobodyFound: 'אף אחד לא מצא את האמת',
        bullshitBy: 'בולשיט של',
        nobodyFellFor: 'אף אחד לא נפל בזה:',
        scores: 'הניקוד',
        next: 'הלאה',
        waiting: (n: number) => n === 1 ? 'מחכים לעוד חבר אחד' : `מחכים לעוד ${n} חברים`,
        soundOn: 'הצליל פועל. לחיצה להשתקה',
        soundOff: 'הצליל מושתק. לחיצה להפעלה',
        list: listHe,
        youFooled: (names: string[]) => `עבדת על ${listHe(names)}!`,
        foundTruth: (points: number) => `מצאת את האמת! ${signedPoints(points)}`,
        fellForHouse: (lost: number) => `נפלת בבולשיט שלנו. ${signedPoints(lost)}`,
        fellForHouseFree: 'נפלת בבולשיט שלנו. עוד אין נקודות להפסיד!',
        fellFor: (names: string[]) => `נפלת בבולשיט של ${listHe(names)}.`,
        didNotPick: 'לא בחרת תשובה.',
        fooled: (names: string[], points: number) => `עבדת על ${listHe(names)}! ${signedPoints(points)}`,
        fooledNobody: 'אף אחד לא נפל בתשובה שלך.',
    },
};

export type RevealStrings = typeof revealStrings.en;

export function revealStringsFor(locale: string): RevealStrings {
    return locale === 'he' ? revealStrings.he : revealStrings.en;
}

/** What the result lines need to know of one reveal row. */
export interface ResultRow {
    realAnswer: boolean;
    houseLie: boolean;
    points: number;
    pointsBy?: { [pid: string]: number };
    pickerIds: string[];
    creatorIds: string[];
    pickerNames: string[];
    creatorNames: string[];
}

/** One or two short lines on how the player `pid` did this question. */
export function resultLines(pid: string, rows: ResultRow[], s: RevealStrings): string[] {
    const lines: string[] = [];
    const pickedRow = rows.filter(r => r.pickerIds.indexOf(pid) !== -1)[0];
    const myLie = rows.filter(r => r.creatorIds.indexOf(pid) !== -1)[0];

    if (pickedRow && pickedRow.realAnswer) {
        lines.push(s.foundTruth(pickedRow.points));
    } else if (pickedRow && pickedRow.houseLie) {
        const lost = pickedRow.pointsBy && pid in pickedRow.pointsBy ? pickedRow.pointsBy[pid] : pickedRow.points;
        lines.push(lost < 0 ? s.fellForHouse(lost) : s.fellForHouseFree);
    } else if (pickedRow) {
        lines.push(s.fellFor(pickedRow.creatorNames));
    } else {
        lines.push(s.didNotPick);
    }

    if (myLie && myLie.pickerNames.length) {
        lines.push(s.fooled(myLie.pickerNames, myLie.points));
    } else if (myLie) {
        lines.push(s.fooledNobody);
    }

    return lines;
}

/** Which of the two stings of a kind a row plays: by its place, so every phone in the room plays the same one. */
export function stingFor(row: { realAnswer: boolean; houseLie: boolean }, index: number): string {
    if (row.realAnswer) {
        return 'the-truth';
    }
    return `${row.houseLie ? 'house-lie' : 'player-lie'}-${index % 2}`;
}
