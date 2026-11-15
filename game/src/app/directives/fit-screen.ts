/**
 * The scale that makes a page fit its screen, for the big screen in the room: a TV can't scroll, so
 * what is below its bottom edge is lost to everyone. Kept apart from the directive (fit-screen.directive.ts)
 * so it runs under Node's test runner with no browser.
 */

/** Below this the text is too small to read from a sofa: the page is left cut rather than shrunk more. */
export const SMALLEST_SCALE = 0.5;

/** One step of the scale: scales are whole hundredths, so the same page always gets the same scale. */
const STEP = 0.01;

/**
 * The largest scale, from SMALLEST_SCALE to 1, at which the page fits. `fitsAt` draws the page at a
 * scale and says whether nothing is cut. A page reflows as it shrinks (lines join, columns widen), so
 * its height can't be worked out from one look: this tries scales, halving the range each time
 * (at most seven looks). When even the smallest scale doesn't fit, the smallest scale is the answer.
 */
export function fittingScale(fitsAt: (scale: number) => boolean): number {
    if (fitsAt(1)) {
        return 1;
    }
    const steps = Math.round((1 - SMALLEST_SCALE) / STEP);
    let low = 0;        // steps above SMALLEST_SCALE known (or taken) to fit
    let high = steps;   // known not to fit
    while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if (fitsAt(scaleOf(mid))) {
            low = mid;
        } else {
            high = mid;
        }
    }
    return scaleOf(low);
}

function scaleOf(step: number): number {
    return Math.round((SMALLEST_SCALE + step * STEP) * 100) / 100;
}
