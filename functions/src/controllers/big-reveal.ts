/**
 * The staged reveal ("big reveal"), a 50/50 test.
 *
 * Half of the games made by a client that can show the staged reveal get it (bigReveal: true): rows
 * in three beats, "And the truth is…", sound on phones, and the scores folded into the reveal in place
 * of the separate scoreboard. The other half keep today's reveal (bigReveal: false). The timing of both
 * is in game-model (revealSchedule), shared with the client.
 *
 * A game's half follows from its PIN alone (stagedHalf), so it can be read wherever the PIN is: every
 * usage row in BigQuery carries the PIN, and no column of its own is needed. A PIN is given once (a
 * counter), and the half is one bit of a hash of it, so the halves are even, a game's half never
 * changes, and it does not depend on the lie helper (pickCoach), which every game has had since
 * 13 November 2026; before that the two draws were independent, so each half held both helper halves.
 *
 * A game made by a client that does not say it can show it (a phone still on an older build, as every
 * phone is between the release of the functions and of the site) is not in the test: no bigReveal at
 * all, and it plays exactly as before. So is every game that was already in play at the release.
 *
 * Phones learn it from the game's state, which they already read: every state the server writes for a
 * staged game carries staged: true (see withStaged in phase.ts).
 */
import { createHash } from 'crypto';

/**
 * Which half a PIN falls in: true for the staged reveal. The lowest bit of the first byte of
 * SHA-256('big-reveal:' + PIN, in capitals). In BigQuery, with the PIN in column id:
 *   MOD(TO_CODE_POINTS(SHA256(CONCAT('big-reveal:', UPPER(id))))[OFFSET(0)], 2) = 1
 */
export function stagedHalf(pin: string): boolean {
    const digest = createHash('sha256').update('big-reveal:' + String(pin).toUpperCase(), 'utf8').digest();
    return digest[0] % 2 === 1;
}

/** The game's bigReveal: true or false for a game in the test, undefined for one that is not. */
export function drawBigReveal(clientCanShowIt: boolean, pin: string): boolean | undefined {
    if (clientCanShowIt !== true) {
        return undefined;
    }
    return stagedHalf(pin);
}
