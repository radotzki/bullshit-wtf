// Laughs on lies, as one phone shows them (see laughCount in the game model). Kept apart from Angular,
// so that it can be tested (game/test/reveal-laughs.test.js).

/** What a lie's laugh button shows. */
export interface LaughView {
    /** Players who laughed at it, this phone's own laugh counted as soon as it is tapped. */
    count: number;
    /** This phone's player laughed at it. */
    mine: boolean;
}

/**
 * @param laughs the lie's laughs as the server holds them (pid: true), or nothing yet
 * @param me this phone's player, or null on the big screen
 * @param tapped this phone tapped the lie's button, and the server has not refused it
 */
export function laughView(laughs: { [pid: string]: boolean } | null | undefined, me: string | null, tapped: boolean): LaughView {
    const pids = Object.keys(laughs && typeof laughs === 'object' ? laughs : {}).filter(pid => laughs[pid] === true);
    const onServer = !!me && pids.indexOf(me) !== -1;
    const mine = onServer || (!!me && tapped);
    return { count: pids.length + (mine && !onServer ? 1 : 0), mine };
}
