/**
 * Is a player's pick this answer on the table?
 *
 * Phones send a pick in lower case (the client lower-cases the text it shows), and players' lies
 * are stored in lower case too. The truth and the house lies are stored as the question bank
 * writes them, so that they are shown as written. A truth with a capital letter ("KFC") therefore
 * never matched its own pick ("kfc"): the player who found the truth got nothing, and the reveal
 * showed nobody under it.
 *
 * So a pick is matched to an answer without regard to case. The stored texts are left alone.
 *
 * This file is pure (no Firebase) so it can be unit tested.
 */
export function isSamePick(answerText: string, pickText: string): boolean {
    if (typeof answerText !== 'string' || typeof pickText !== 'string') {
        return false;
    }

    return answerText === pickText || answerText.toLowerCase() === pickText.toLowerCase();
}
