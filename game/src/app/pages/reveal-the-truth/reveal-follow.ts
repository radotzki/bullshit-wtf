// Where the staged reveal's page should be scrolled to on a phone. Kept apart from Angular, so that it
// can be tested (game/test/reveal-follow.test.js).

/** The truth row never starts closer than this to the top edge of the scrolled area. */
export const TRUTH_MARGIN_PX = 6;

/**
 * The scroll position that shows the newest thing without losing the truth.
 *
 * The page follows what arrives below the rows (the scores, NEXT) by scrolling down. Once the truth row
 * is up it must stay readable: the page goes down only until the top of the truth row reaches the top
 * of the scrolled area. On a short phone with many players the last scores are then below the edge,
 * and the player can scroll to them; the truth, the player's own result and the top of the scores stay.
 *
 * @param scrollHeight the height of everything in the scrolled area
 * @param clientHeight the height of the part of it that is in view
 * @param truthTop where the truth row starts, measured from the top of everything; null before it is up
 */
export function followScrollTop(scrollHeight: number, clientHeight: number, truthTop: number | null): number {
    const bottom = Math.max(0, scrollHeight - clientHeight);
    if (truthTop === null || truthTop === undefined || isNaN(truthTop)) {
        return bottom;
    }
    return Math.min(bottom, Math.max(0, truthTop - TRUTH_MARGIN_PX));
}
