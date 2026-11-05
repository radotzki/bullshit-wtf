/**
 * What falling for a house lie costs.
 *
 * Since #7 small groups see two house lies on every answers screen, so a guess lands on one far more
 * often. At -500/-750/-1000 scores went deep below zero (one dev playtest phone was at -1750 before the
 * last question). Now the penalty is half that, and a house lie never takes a player below zero: it can
 * only take back points the player already has, counting what they earn this question for their own lie.
 * Friends' lies (+500/+750/+1000 for each player fooled) and the truth stay the main way to score.
 */
export const HOUSE_LIE_PENALTY = [250, 375, 500];

/**
 * Points a player loses (as a negative number, or 0) for picking a house lie.
 * @param roundIndex 0, 1 or 2
 * @param scoreBefore the player's score before this question
 * @param earnedThisQuestion points the player earns this question for their own lie
 */
export function houseLiePoints(roundIndex: number, scoreBefore: number, earnedThisQuestion = 0): number {
    const penalty = HOUSE_LIE_PENALTY[Math.min(Math.max(roundIndex || 0, 0), HOUSE_LIE_PENALTY.length - 1)];
    const available = Math.max((scoreBefore || 0) + (earnedThisQuestion || 0), 0);
    return -Math.min(penalty, available);
}
