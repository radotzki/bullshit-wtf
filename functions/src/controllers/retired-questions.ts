/**
 * Questions the game no longer picks, without touching the question bank.
 *
 * The game works best on a strange true fact with a blank to fill. These are
 * plain trivia with a well-known answer and no blank, so most players just
 * type the truth (which is refused) or spot it at once. Found in a review of
 * the bank on 2026-11-05: 17 of 314 questions have no blank; these 6 are the
 * ones whose answer most people already know. The other 11 stay in play.
 *
 * A second review (2026-11-05) retired questions whose true answer sours a
 * party: suicide, domestic violence, and setups (9/11, the KKK) that pull
 * players toward writing hate or terror jokes as their lies. Rude, gross and
 * merely dark-but-silly questions stay: that is the game's tone.
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
    // Grim true answers.
    'c6d5cccb-ec6b-4462-8499-27ca96099048': 'grim: Blue Whale game, to win you must (commit suicide)',
    '8fc05c5b-410b-2951-c6a8-8c2df1c3c268': 'grim: man assaulted his wife and locked her in a shed over a song (ding dong, the witch is dead)',
    '29b26a02-2fcd-bb90-dd72-53dd9a42f4c8': "grim: DJ Khaled's name before 9/11 (arab attack); invites terror jokes",
    'fc8b9867-7bd5-4db2-9d5d-a64eecb7c954': "grim: DJ Khaled's name before 9/11, Hebrew (arab attack); invites terror jokes",
    'a461ea8a-7306-3387-0bfe-0cafba3a36a0': "grim: Oklahoma mayor's husband dressed as (KKK members); invites hate jokes",
    // Hebrew question review (2026-11-07): too easy, or a joke that only works in English.
    '3ffff3b9-3d1c-46ff-b8fb-e1543528cdfa': "the only food that doesn't spoil, Hebrew (honey)",
    'cadcd592-202a-49f1-a81b-c4c1373c1069': 'largest organ in the human body, Hebrew (skin)',
    'cc7dbbb3-e7b4-4244-8d86-5149949f1dca': 'crows wait for a better treat; the test is called (marshmallow), Hebrew; too famous',
    '908603d2-6492-441b-98a7-0de5c728c6fb': 'Wikipedia page edited 500+ times (pedant), Hebrew; English-only joke',
    'a3a8fc0a-94f0-406a-8794-30cbd00e3677': "2013 YouTube hack of (Soulja Boy), Hebrew; few Israeli players know him",
};

export function isRetired(qid: string): boolean {
    return Object.prototype.hasOwnProperty.call(RETIRED_QUESTIONS, qid);
}
