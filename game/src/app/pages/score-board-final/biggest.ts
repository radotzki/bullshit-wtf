/**
 * The final's "biggest bullshitter": the players whose lies fooled the most players over the whole
 * game. Players who tie on that count all get the title, as a tie for first place shares the win.
 * Nobody gets it when no lie fooled anyone: a title for fooling nobody would mean nothing, and that
 * player's row already says "Nobody fell for their lies".
 */
export function biggestBullshitters(players: { pid: string; best?: { total?: number } }[]): string[] {
    const fooled = (p: { best?: { total?: number } }) => p.best ? p.best.total || 0 : 0;
    const most = Math.max(0, ...players.map(fooled));
    if (most === 0) {
        return [];
    }
    return players.filter(p => fooled(p) === most).map(p => p.pid);
}
