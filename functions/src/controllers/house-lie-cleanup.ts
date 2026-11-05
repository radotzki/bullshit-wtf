/**
 * Keeps offensive house lies off the answers screen, without touching the question bank.
 *
 * Since #7 small groups see two house lies on every answers screen, so players meet the bank's fake
 * answers far more often. A read of all 1,197 fake answers (314 questions, English and Hebrew) on
 * 2026-11-05 found some that are hateful rather than cheeky: a swastika, Nazi apologia, terror
 * jokes, slurs about immigrants, gay people, Aboriginal people and disabled people. The game stays
 * bawdy (rude words and sex jokes are part of it); these are the ones that punch at a group of people.
 *
 * Two layers:
 *   1. HOUSE_LIE_REPLACEMENTS swaps a flagged lie for a harmless one of the same kind, so the question
 *      keeps as many choices as before.
 *   2. BLOCKED_HOUSE_LIE drops any other lie that matches, as a net for questions added later.
 *
 * Players' own lies are not filtered: only lies the game itself puts on screen.
 * To bring a lie back, delete its line.
 */

export const HOUSE_LIE_REPLACEMENTS: { [qid: string]: { [lie: string]: string } } = {
    // A Detroit strip-club owner's giant bronze sculpture (middle finger).
    '9cf71beb-4b04-79e2-a213-df263c99b17b': { 'swastika': 'thumbs up' },
    // Hitler's nephew's 1939 article (Why I hate my uncle).
    '8bbb5608-766e-482e-8479-c42c75705e79': {
        'hitler did nothing wrong': 'my uncle the painter',
        "hitler's grandpa was jewish": 'life with uncle adolf',
    },
    // An Oklahoma mayor's husband dressed as KKK members.
    'a461ea8a-7306-3387-0bfe-0cafba3a36a0': { 'muslim terrorists': 'circus clowns', 'rape victims': 'pirates' },
    // One in ten European babies is conceived in (an IKEA bed).
    '59700825-3e8f-c023-242e-6ad2bc8d79ba': { 'an immigrants boat': 'a tent' },
    'f7cb3887-39da-4b00-b471-00a9b136a1a2': { 'בספינת מהגרים': 'באוהל' },
    // Queensland pet rabbits (a magician).
    'a26772e0-2faa-450f-9ce2-4f387013d887': { 'an aboriginee': 'a farmer' },
    // Father and son Scrabble final (defeated).
    '19babd38-6235-a153-0744-8805cc466a07': { 'abortion': 'stalemate' },
    'e8e87739-e478-4068-b26f-924492357695': { 'הפלה': 'תיקו' },
    // In ancient Greek an "idiot" was anyone who wasn't (a politician).
    '46273593-10b3-b226-1125-3c0a9fc5c696': { 'a homosexual': 'a sailor' },
    '1465fe85-38d6-40b2-9bb1-74d7311e2cec': { 'הומוסקסואל': 'ספן' },
    // Goosebumps "Calling All Creeps!" (lizards in disguise).
    '823b90c0-c3c3-28f1-c7cc-71ce6f22e3e5': { 'mentally disabled': 'invisible' },
    // The Mayflower ran out of (beer).
    '9fb7126e-fc15-4106-bab0-2dc9ef2bbe7d': { 'slaves': 'cheese' },
    // DJ Khaled's first stage name (Arab Attack): the lies were 9/11 jokes.
    '29b26a02-2fcd-bb90-dd72-53dd9a42f4c8': {
        'tower destroyer': 'dj miami vice',
        'plane hijacker': 'the arabian knight',
        'jihad': 'dj big money',
        'dj saddam': 'khaled the great',
    },
    'fc8b9867-7bd5-4db2-9d5d-a64eecb7c954': {
        'הורס המגדלים': "דיג'יי מיאמי",
        'חוטף המטוסים': 'האביר הערבי',
        "ג'יהאד": "דיג'יי כסף גדול",
        "דיג'יי סדאם": 'חאלד הגדול',
    },
    // Israel paid for the Russian Compound in Jerusalem with (oranges).
    'd7d26268-e0e3-456b-9158-274931f2c780': { 'תינוקות תימניים': 'יין' },
};

/** House lies the game never shows, whatever question they belong to. */
export const BLOCKED_HOUSE_LIE: RegExp[] = [
    /swastika/i,
    /hitler did nothing/i,
    /\bjihad/i,
    /terroris/i,
    /\brap(e|es|ed|ist|ists)\b/i,
    /\bimmigrant/i,
    /aborigin/i,
    /homosexual/i,
    /\bretard/i,
    /mentally (disabled|retarded)/i,
    /\bn[i1]gg/i,
    /\bfag(got)?s?\b/i,
    /צלב קרס/,
    /ג'יהאד/,
    /טרור/,
    /אונס/,
    /הומוסקסואל/,
    /מהגרים/,
    /תינוקות תימניים/,
    /מפגר/,
    /חוטף המטוסים/,
    /הורס המגדלים/,
];

function key(text: string): string {
    return (text || '').trim().toLowerCase();
}

export function isBlockedHouseLie(text: string): boolean {
    return BLOCKED_HOUSE_LIE.some(re => re.test(text || ''));
}

/** The question's fake answers with flagged ones replaced and any blocked ones left out. */
export function cleanHouseLies(qid: string, fakeAnswers: string[]): string[] {
    const replacements = HOUSE_LIE_REPLACEMENTS[qid] || {};
    const byKey: { [k: string]: string } = {};
    Object.keys(replacements).forEach(lie => byKey[key(lie)] = replacements[lie]);

    return (fakeAnswers || [])
        .map(text => Object.prototype.hasOwnProperty.call(byKey, key(text)) ? byKey[key(text)] : text)
        .filter(text => !isBlockedHouseLie(text));
}
