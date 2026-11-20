import { normalizeName } from '../name-flag';

/**
 * The lie filter: is a player's lie one a clean game refuses? It runs only where a game asks for it
 * (portal.ts: CrazyGames games, and main-site games made with "Kids are playing"). Everywhere else a
 * cheeky lie is half the fun, and nothing is filtered.
 *
 * Unlike the nickname filter (name-flag.ts), which reads a short name as one squashed string, a lie is
 * a sentence, so this one reads whole words: "Scunthorpe", "Cumbria" and "Dickens" are not the words
 * they contain. A listed word inside an allowed phrase ("Dick Van Dyke", "cum laude", "Homo sapiens",
 * "blue tits", "כוס קפה") is fine. History is fair game ("Hitler", "Nazi"); hate slogans are not.
 * "sex" on its own is not swearing ("Sex and the City", "sex education"), and neither is "bullshit",
 * the game's own name.
 *
 * Every entry is normalized the way the lie is (name-flag.ts: lower case, look-alikes and digits mapped,
 * Hebrew final letters made regular), and only the letters a to z and Hebrew letters count.
 */
export const LIE_WORDS = {
    // A whole word.
    word: [
        // English swearing
        'shit', 'shits', 'shitty', 'shite', 'shithead', 'shitheads', 'shithole', 'shitface', 'shitting', 'shitted',
        'bullshitter', 'horseshit', 'dipshit', 'batshit', 'apeshit', 'sht',
        'fck', 'fk', 'fuk', 'fuks', 'fuking', 'fuq', 'phuck', 'phuk', 'fcking', 'fkn', 'fking', 'stfu',
        'bitch', 'bitches', 'bitchy', 'bitching', 'biatch', 'btch', 'sonofabitch',
        'bastard', 'bastards', 'asshole', 'assholes', 'arsehole', 'arseholes', 'asshat', 'dumbass', 'jackass',
        'hooker', 'hookers', 'whore', 'whores', 'slut', 'sluts', 'slutty', 'skank', 'skanks',
        'cock', 'cocks', 'cocksucker', 'dick', 'dicks', 'dickhead', 'dickheads',
        'pussy', 'pussies', 'twat', 'twats', 'wank', 'wanker', 'wankers', 'wanking', 'tosser',
        'piss', 'pissing', 'pisser', 'douche', 'douchebag', 'bollocks',
        'tits', 'titties', 'titty', 'boob', 'boobs', 'boobies', 'boner', 'horny', 'dildo', 'dildos',
        'cum', 'cumming', 'jizz', 'porn', 'porno', 'rape', 'raped', 'rapes', 'raping', 'rapist',
        'anal', 'blowjob', 'handjob', 'rimjob', 'milf', 'orgasm', 'penis', 'vagina', 'clit',
        'pedo', 'pedophile', 'paedo', 'paedophile',
        // slurs
        'nigger', 'niggers', 'nigga', 'niggas', 'niggah', 'nig', 'nigs', 'negro', 'negroes', 'coon', 'coons',
        'chink', 'chinks', 'gook', 'gooks', 'spic', 'spics', 'kike', 'kikes', 'wetback', 'raghead', 'towelhead',
        'paki', 'pakis', 'fag', 'fags', 'faggot', 'faggots', 'dyke', 'dykes', 'tranny', 'trannies', 'homo', 'homos',
        'retard', 'retards', 'retarded', 'tard', 'mongoloid', 'kkk',
        // transliterated Hebrew and Arabic
        'zona', 'kus', 'kusemek', 'kusemak', 'kusummak', 'sharmuta', 'sharmouta', 'sharmota', 'manyak', 'maniak',
        // Hebrew
        'זונה', 'זונות', 'שרמוטה', 'שרמוטות', 'כוסית', 'כוסיות', 'כוסאמק', 'כוסעמק', 'כוסאמא', 'כוסאמאשלך',
        'זין', 'זיין', 'זיון', 'זיונים', 'לזיין', 'מזדיין', 'מזדיינת', 'מזדיינים', 'תזדיין', 'תזדייני', 'הזדיין', 'יזדיין',
        'חרא', 'חראות', 'מניאק', 'מניאקית', 'מניאקים', 'בנזונה', 'יבנזונה', 'שפיך', 'ציצים', 'פורנו', 'אונס', 'אנס',
        'חרמן', 'חרמנית', 'דגדגן', 'מציצה', 'פדופיל', 'הומו', 'הומואים', 'מתרומם', 'קוקסינל', 'מפגר', 'מפגרת',
        'מפגרים', 'כושי', 'כושית', 'כושים', 'כושון', 'ערבוש', 'ערבושים', 'פרענק', 'פרענקים', 'צחצח', 'צחצחים', 'אשכנאצי',
    ],
    // A word that starts with it: no fair word does.
    start: ['fuck', 'motherf', 'cunt', 'nigg', 'cocksuck', 'shithead', 'jizz', 'whore', 'blowjob', 'gangbang', 'cumshot',
        'cumslut', 'masturbat', 'pornograph'],
    // Anywhere in a word ("clusterfuck", "dumbfuck").
    any: ['fuck', 'nigger', 'motherfuck', 'faggot'],
    // Consecutive words, also written as one ("kill the jews", "killthejews").
    phrase: ['heil hitler', 'sieg heil', 'seig heil', 'gas the jews', 'kill the jews', 'kill all jews', 'death to jews',
        'white power', 'white pride', 'son of a bitch', 'kiss my ass',
        'כוס אמק', 'כוס אמא', 'כוס אמא שלך', 'כוס אחותך', 'כוס עמק', 'בן זונה', 'בת זונה', 'יא בן זונה', 'לך תזדיין',
        'מוות לערבים', 'מוות ליהודים', 'ערבי מסריח', 'ערבים מסריחים'],
    // Typed as is (digits that the letters can't show).
    raw: ['1488'],
    // Fine although a listed word is in it: a phrase covers its own words, a single word itself.
    allow: [
        'dick van dyke', 'van dyke', 'philip k dick', 'philip dick', 'dick cheney', 'moby dick', 'dick tracy',
        'dick turpin', 'dick whittington', 'dick grayson', 'tricky dick', 'dick clark', 'dick francis', 'dick smith',
        'dick fosbury', 'dick advocaat', 'spotted dick',
        'homo sapiens', 'homo erectus', 'homo habilis', 'homo neanderthalensis', 'homo floresiensis', 'homo naledi',
        'homo ergaster', 'homo heidelbergensis', 'homo luzonensis', 'homo genus', 'genus homo',
        'cum laude', 'magna cum laude', 'summa cum laude', 'cum grano salis', 'cum hoc',
        'blue tit', 'blue tits', 'great tit', 'great tits', 'coal tit', 'coal tits', 'marsh tit', 'willow tit',
        'long tailed tit', 'long tailed tits', 'crested tit', 'bearded tit',
        'oilseed rape', 'rape seed', 'rape oil', 'rape of the lock', 'rape of nanking', 'rape of the sabine women',
        'hooker oak', 'john lee hooker', 'joseph hooker', 'hooker valley', 'hooker telescope',
        'cock a doodle doo', 'cock of the walk', 'weather cock', 'stop cock', 'cock robin', 'shuttle cock',
        'pussy cat', 'pussy willow', 'pussy riot', 'puss in boots', 'pussy galore',
        'anal retentive', 'boob tube', 'booby trap', 'piss artist',
        'rio negro', 'negro river', 'maine coon', 'maine coons',
        // Hebrew: "כוס" alone is a cup, so only its swearing phrases are listed. These hold a listed word
        // after a prefix letter, or are the same letters as one: food, fed, weapons.
        'כלי זין', 'זינה', 'זינגר', 'מזין', 'מזינה', 'מזינים', 'מזינות', 'הזין את', 'הזינה', 'הזינו', 'להזין',
        'מזונה', 'מזונות',
    ],
};

const NOT_LETTERS = /[^a-zא-ת]+/;
// Signs inside a word that hide a letter or split one ("f*ck", "sh.it"). A hyphen or an apostrophe
// splits words as a space does ("dick-head" is "dick head"; "f-ck" is spelled out, see wordsRefused).
const INNER_SIGNS = /([a-zא-ת])[*._"`~^#%&+]+(?=[a-zא-ת])/g;
// One-letter Hebrew prefixes: and, the, in, to, from, that, as.
const HE_PREFIX = 'והבלמשכ';
const HE_LETTER = /^[א-ת]/;

const words = (s: string) => normalizeName(s).split(NOT_LETTERS).filter(w => !!w);
const set = (list: string[]) => {
    const out: { [w: string]: boolean } = {};
    list.forEach(e => out[words(e).join('')] = true);
    return out;
};
const WORD = set(LIE_WORDS.word);
const START = LIE_WORDS.start.map(e => words(e).join(''));
const ANY = LIE_WORDS.any.map(e => words(e).join(''));
const PHRASES = LIE_WORDS.phrase.map(words);
const PHRASE_ONE = set(LIE_WORDS.phrase);
const ALLOW_PHRASES = LIE_WORDS.allow.map(words).filter(p => p.length > 1);
const ALLOW_ONE = set(LIE_WORDS.allow.filter(a => words(a).length === 1));

/** The word, and for a Hebrew word the word without one or two prefix letters ("והזונה" is "זונה"). */
function forms(w: string): string[] {
    const out = [w];
    if (HE_LETTER.test(w)) {
        for (let i = 0; i < 2 && w.length - i > 3 && HE_PREFIX.indexOf(w.charAt(i)) >= 0; i++) {
            out.push(w.slice(i + 1));
        }
    }
    return out;
}

function wordRefused(w: string): boolean {
    if (ALLOW_ONE[w]) {
        return false;
    }
    if (ANY.some(e => w.indexOf(e) >= 0)) {
        return true;
    }
    return forms(w).some(f => !ALLOW_ONE[f] && (!!WORD[f] || !!PHRASE_ONE[f] || START.some(e => f.indexOf(e) === 0)));
}

/** Whether the words from `at` on are `phrase` (Hebrew prefixes allowed on its first word). */
function phraseAt(ws: string[], at: number, phrase: string[]): boolean {
    if (at + phrase.length > ws.length) {
        return false;
    }
    return phrase.every((p, j) => j === 0 ? forms(ws[at]).indexOf(p) >= 0 : ws[at + j] === p);
}

function wordsRefused(ws: string[]): boolean {
    if (!ws.length) {
        return false;
    }
    if (ws.some((_, i) => PHRASES.some(p => phraseAt(ws, i, p)))) {
        return true;
    }
    // Words inside an allowed phrase are fine.
    const covered: boolean[] = ws.map(() => false);
    ws.forEach((_, i) => ALLOW_PHRASES.forEach(p => {
        if (phraseAt(ws, i, p)) {
            p.forEach((__, j) => covered[i + j] = true);
        }
    }));
    if (ws.some((w, i) => !covered[i] && wordRefused(w))) {
        return true;
    }
    // Spelled out a letter or two at a time ("c u n t", "f u c k").
    return ws.length > 1 && ws.every(w => w.length <= 2) && wordRefused(ws.join(''));
}

/** A lie the filter refuses. */
export function lieRefused(text: string): boolean {
    const raw = String(text == null ? '' : text);
    if (LIE_WORDS.raw.some(e => raw.indexOf(e) >= 0)) {
        return true;
    }
    const n = normalizeName(raw);
    const split = n.split(NOT_LETTERS).filter(w => !!w);
    // The same lie with the signs inside its words taken out, so "f*ck" and "dick-head" read as words.
    const joined = n.replace(INNER_SIGNS, '$1').replace(INNER_SIGNS, '$1').split(NOT_LETTERS).filter(w => !!w);
    return wordsRefused(split) || wordsRefused(joined);
}
