/**
 * The staged reveal ("big reveal"), a 50/50 test.
 *
 * Half of the games made by a client that can show the staged reveal get it (bigReveal: true): rows
 * in three beats, "And the truth is…", sound on phones, and the scores folded into the reveal in place
 * of the separate scoreboard. The other half keep today's reveal (bigReveal: false). The timing of both
 * is in game-model (revealSchedule), shared with the client.
 *
 * A game made by a client that does not say it can show it (a phone still on an older build, as every
 * phone is between the release of the functions and of the site) is not in the test: no bigReveal at
 * all, and it plays exactly as before. So is every game that was already in play at the release.
 *
 * The draw is its own, independent of the lie helper's (pickCoach): each half of one test holds both
 * halves of the other.
 */
type Random = () => number;

/** The game's bigReveal: true or false for a game in the test, undefined for one that is not. */
export function drawBigReveal(clientCanShowIt: boolean, random: Random = Math.random): boolean | undefined {
    if (clientCanShowIt !== true) {
        return undefined;
    }
    return random() < 0.5;
}

/** The arm as BigQuery gets it (column big_reveal): true, false, or null for a game not in the test. */
export function bigRevealArm(game: { bigReveal?: boolean } | null | undefined): boolean | null {
    return game && typeof game.bigReveal === 'boolean' ? game.bigReveal : null;
}
