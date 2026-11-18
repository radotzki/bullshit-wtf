/**
 * Whether this phone's seat now belongs to another sign-in. A guest whose invite link opened in an empty
 * browser gets a quiet seat back by name (functions join.ts seatByName): the seat takes the new browser's
 * uid. When that was a different person with the same name on the same model of phone, the first phone,
 * back online, still holds the player id while the seat is someone else's; its lies and picks would
 * overwrite theirs. That phone leaves the game screen instead (GameService).
 *
 * True only when both are known and differ: the seat has a uid, and this browser is signed in. A seat
 * that joined before sign-in finished (no uid), or a page that is not signed in yet, is never taken.
 * The same browser, a Replay or a crew rematch keep the seat's uid this browser's, so they never are either.
 * Kept free of Angular and Firebase so it can be tested in Node.
 */
export function seatTaken(seatUid: any, myUid: any): boolean {
    return typeof seatUid === 'string' && !!seatUid && typeof myUid === 'string' && !!myUid && seatUid !== myUid;
}
