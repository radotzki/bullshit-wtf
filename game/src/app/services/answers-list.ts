/**
 * The answers a phone or the big screen lists on the answers screen: each text once, sorted,
 * without the player's own lie (a player may not pick it).
 *
 * `allAnswers` is null when the game has no answers at that moment: a phone that wakes up or reloads
 * on the answers screen after the game moved on to the next question (the server empties the answers
 * then), or after the game ended. That used to throw on `allAnswers[pid]` (Sentry BULLSHIT-WR and
 * BULLSHIT-WW). An empty list is right: the game-state listener takes the phone to the current screen.
 */
export function answersList(allAnswers: { [pid: string]: { text: string } }, ownPid?: string): string[] {
    const all = allAnswers || {};
    const own = ownPid && all[ownPid] ? all[ownPid].text : undefined;

    return Object.keys(all)
        .map(k => all[k] && all[k].text)
        .filter(text => typeof text === 'string' && text !== own)
        .filter((v, i, a) => a.indexOf(v) === i)
        .sort((a, b) => a > b ? 1 : -1);
}
