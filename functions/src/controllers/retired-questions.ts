/**
 * Questions the game no longer picks, without touching the question bank.
 *
 * The game works best on a strange true fact with a blank to fill. These are
 * plain trivia with a well-known answer and no blank, so most players just
 * type the truth (which is refused) or spot it at once. Found in a review of
 * the bank on 2026-11-05: 17 of 314 questions have no blank; these 6 are the
 * ones whose answer most people already know. The other 11 stay in play.
 *
 * To bring one back, delete its line.
 */
export const RETIRED_QUESTIONS: { [qid: string]: string } = {
    '3be6f72c-bead-ebfc-bf09-1ea8e74d02d2': 'riddle: what do you call a male cat (tom)',
    '1d2a60df-3677-73eb-f0bd-6c254aec1bd1': "Canada's national animal (beaver)",
    'd03794d8-975b-4bc0-95fb-e9e42d143462': "Canada's national animal, Hebrew (beaver)",
    '9195e93c-3173-97b7-9b19-e6c2f805f7fd': 'largest organ in the human body (skin)',
    '43283937-46bd-64c8-9e79-342a9951d668': "the only food that doesn't spoil (honey)",
    '3cec54c0-d575-7b85-25d3-618c643c560b': 'vitamin C deficiency (scurvy)',
};

export function isRetired(qid: string): boolean {
    return Object.prototype.hasOwnProperty.call(RETIRED_QUESTIONS, qid);
}
