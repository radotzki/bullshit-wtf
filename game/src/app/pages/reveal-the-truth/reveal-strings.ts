/**
 * The lines that tell a player how they did on a question, and which sound a reveal row plays.
 * The words themselves are the game's (game-strings.ts), in the game's language, the same in today's
 * reveal and in the staged one.
 * Pure (no Angular), so it is unit tested: game/test/reveal-strings.test.js.
 */

/** The words the result lines are built from: the reveal's part of GameStrings. */
export interface ResultWords {
    foundTheTruth: (points: string) => string;
    fellForOurs: (points: string) => string;
    fellForOursNoPoints: string;
    fellFor: (names: string) => string;
    didNotPick: string;
    fooled: (names: string, points: string) => string;
    nobodyFellForYours: string;
    names: (names: string[]) => string;
    signed: (points: number) => string;
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
export function resultLines(pid: string, rows: ResultRow[], t: ResultWords): string[] {
    const lines: string[] = [];
    const pickedRow = rows.filter(r => r.pickerIds.indexOf(pid) !== -1)[0];
    const myLie = rows.filter(r => r.creatorIds.indexOf(pid) !== -1)[0];

    if (pickedRow && pickedRow.realAnswer) {
        lines.push(t.foundTheTruth(t.signed(pickedRow.points)));
    } else if (pickedRow && pickedRow.houseLie) {
        const lost = pickedRow.pointsBy && pid in pickedRow.pointsBy ? pickedRow.pointsBy[pid] : pickedRow.points;
        lines.push(lost < 0 ? t.fellForOurs(t.signed(lost)) : t.fellForOursNoPoints);
    } else if (pickedRow) {
        lines.push(t.fellFor(t.names(pickedRow.creatorNames)));
    } else {
        lines.push(t.didNotPick);
    }

    if (myLie && myLie.pickerNames.length) {
        lines.push(t.fooled(t.names(myLie.pickerNames), t.signed(myLie.points)));
    } else if (myLie) {
        lines.push(t.nobodyFellForYours);
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
