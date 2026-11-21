import { normalizeName, hiddenPattern, spells } from '../name-flag';
import { NAME_LISTS } from '../name-lists';

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
 * The nickname filter's own lists (name-lists.json, `hate` and `sex`) are read here too, whole word and
 * with simple plurals, so the lie filter refuses every slur and sex word that the nickname filter does,
 * bar the few in NOT_FROM_NAME_LISTS. A run of three or more of one letter is read once ("fuuuck").
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
        'kusima', 'kusit', 'benzona', 'benzonah', 'mefager', 'tizdayen', 'mizdayen', 'kibenimat', 'kibinimat',
        'kusomo', 'kosemek', 'kossemek', 'sharmoota', 'sharmootah',
        // "ass" and its spellings (a$$, @ss, a55), for kids: a milder word, but not on a family screen
        'ass', 'badass', 'fukc', 'fcuk', 'fawk', 'slvt', 'biotch',
        // English swearing in Hebrew letters (ביץ', דיק, אסהול): Israeli kids type these
        'דיק', 'דיקהד', 'אסהול', 'אסהולס', 'פאקיו', 'מאדרפאקר', 'מאתרפאקר', 'מאדפאקר',
        'סאנאפאביצ', 'סנאפאביצ', 'סאנופאביצ',
        // ביץ' is matched as typed (BITCH_HE): "ביצ" alone is how "ביצ'ה" or "ביצ'יקו" begins.
        // Hebrew as kids misspell it, or with "ך" for "ק" (כוס אמך)
        'כוסאמכ', 'כוסעמכ', 'כוסעמאק', 'כוסאמאק', 'בנזונא', 'זונע', 'שרמוטע', 'מזדין', 'תזדין', 'הזדין', 'להזדין',
        'אחושרמוטה', 'אחושרמוטא', 'אחשרמוטה', 'קוסאמק', 'קוסאמאק', 'קוסעמק', 'חארה', 'חארא', 'תזדיינו', 'כוסאמו',
        'כוסעומק', 'שרמוטא', 'מאניאק', 'מנייאק', 'זיינתי',
        // Hebrew
        'זונה', 'זונות', 'זונהה', 'שרמוטה', 'שרמוטות', 'כוסית', 'כוסיות', 'כוסאמק', 'כוסעמק', 'כוסאמא', 'כוסאמאשלך',
        'זין', 'זיין', 'זיון', 'זיונים', 'לזיין', 'מזדיין', 'מזדיינת', 'מזדיינים', 'תזדיין', 'תזדייני', 'הזדיין', 'יזדיין',
        'חרא', 'חראות', 'מניאק', 'מניאקית', 'מניאקים', 'בנזונה', 'יבנזונה', 'שפיך', 'ציצים', 'פורנו', 'אונס', 'אנס',
        'חרמן', 'חרמנית', 'דגדגן', 'מציצה', 'פדופיל', 'הומו', 'הומואים', 'מתרומם', 'קוקסינל', 'מפגר', 'מפגרת',
        'מפגרים', 'פאק', 'פאקינג', 'פאקין', 'כושי', 'כושית', 'כושים', 'כושון', 'ערבוש', 'ערבושים', 'פרענק', 'פרענקים', 'צחצח', 'צחצחים', 'אשכנאצי',
    ],
    // A word that starts with it: no fair word does.
    start: ['fuck', 'fvck', 'cvnt', 'motherf', 'cunt', 'nigg', 'cocksuck', 'shithead', 'jizz', 'whore', 'blowjob', 'gangbang', 'cumshot',
        'cumslut', 'masturbat', 'pornograph'],
    // Anywhere in a word ("clusterfuck", "dumbfuck").
    any: ['fuck', 'nigger', 'motherfuck', 'faggot'],
    // Consecutive words, also written as one ("kill the jews", "killthejews").
    phrase: ['heil hitler', 'sieg heil', 'seig heil', 'gas the jews', 'kill the jews', 'kill all jews', 'death to jews',
        'white power', 'white pride', 'son of a bitch', 'kiss my ass',
        'kill jews', 'porch monkey', 'porch monkeys', 'sand nigger', 'מזיין שכל', 'מזיינת שכל',
        'כוס אמק', 'כוס אמאק', 'כוס אמך', 'כוס אמו', 'קוס אמק', 'קוס אמאק', 'קוס אמא', 'קוס עמק', 'לך תמצוץ',
        'תמצוץ לי', 'kos emek', 'koss emek', 'kus emek', 'כוס עמך', 'כוס עמאק', 'בן זונא', 'בת זונא', 'כוס אמא', 'כוס אמא שלך', 'כוס אחותך', 'כוס עמק', 'בן זונה', 'בת זונה', 'יא בן זונה', 'לך תזדיין',
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
        'rio negro', 'negro river', 'maine coon', 'maine coons', 'coon rapids', 'tom dick and harry', 'dick dastardly',
        'dick van patten', 'anal fin', 'anal fins', 'horny toad', 'horny toads', 'spic and span', 'zona rosa',
        'bin laden', 'osama bin laden', 'shiite', 'shiites',
        'niggle', 'niggles', 'niggled', 'niggling', 'niggard', 'niggardly',
        // Hebrew: "כוס" alone is a cup, so only its swearing phrases are listed. These hold a listed word
        // after a prefix letter, or are the same letters as one: food, fed, weapons.
        'כלי זין', 'זינה', 'זינגר', 'מזין', 'מזינה', 'מזינים', 'מזינות', 'הזין את', 'הזינה', 'הזינו', 'להזין',
        'מזונה', 'מזונות', 'מזיין', 'מזוין', 'מזויין', 'שפיכות', 'שפיכת',
        // Hebrew names and words that hold one: Dick Van Dyke, Moby Dick, Homo sapiens, peepers and a straw.
        "דיק צ'ייני", "דיק צ'ני", 'דיק קלארק', 'דיק טרייסי', 'פיליפ ק דיק', 'פיליפ דיק', 'דיק ואן פאטן', 'fromage rape',
        'דיק ואן דייק', 'מובי דיק', 'הומו ספיינס', 'הומו סאפיינס', 'הומו ארקטוס', 'מציצים', 'קשית מציצה',
        // The Mongols, as a people: only "מונגול" alone is the slur.
        'מונגולים', 'מונגולי', 'מונגולית', 'מונגוליה',
    ],
};

const NOT_LETTERS = /[^a-zא-ת]+/;
// "bitch" in Hebrew letters: ביץ, ביץ', ביצ', ביאץ', ביטץ' as a whole word, with a prefix letter or not.
const BITCH_HE = /(^|[^א-ת])[והשלכ]?ביי?[אט]?(ץ['׳`"]?|צ['׳`][סז]?)(?![א-ת])/;
// "a-hole" and "a**" as typed: "a hole" with a space is fair, and stars only at a word's end spell nothing.
const ASS_SIGNS = /(^|[^a-z])a(-holes?|\*\*|\*\*holes?)(?![a-z])/i;

// Signs inside a word that hide a letter or split one ("f*ck", "sh.it"). A hyphen or an apostrophe
// splits words as a space does ("dick-head" is "dick head"; "f-ck" is spelled out, see wordsRefused).
const INNER_SIGNS = /([a-zא-ת])[*._"`~^#%&+]+(?=[a-zא-ת])/g;
// Digits and the signs that normalizeName reads as letters (name-flag.ts: 1 is i, ! is i, @ is a, $ is s),
// at the start or the end of a word, where they hide no letter.
const EDGE_SIGNS = /(^|[^0-9a-zA-Zא-ת@$!])[0-9@$!]+|[0-9@$!]+(?=[^0-9a-zA-Zא-ת@$!]|$)/g;
// One-letter Hebrew prefixes: and, the, in, to, from, that, as.
const HE_PREFIX = 'והבלמשכ';
const HE_LETTER = /^[א-ת]/;
// Any letter of any script as typed, or one that the normalising step reads from a fancy sign (🅵, ꜰ).
const REAL_LETTER = /\p{L}/u;
const LOOK_ALIKE = /[0-9@$!]/g;
// Spaces between words: JavaScript's \s also holds U+FEFF, which hides inside a word ("f\uFEFFuck").
const WORD_GAP = /[^\S\uFEFF]+/;
const hasLetter = (t: string) => REAL_LETTER.test(t) || /[a-zא-ת]/.test(normalizeName(t.replace(LOOK_ALIKE, '')));

// "!" at a word's end ends it ("cum laude!", "Kush!"): only inside a word is it an "i" ("b!tch").
// A letter later in the same word keeps it an "i" ("s.h.!.t", "s-h-!-t").
const END_BANGS = /!+(?![^\s]*[0-9a-zA-Zא-ת@$])/g;
const words = (s: string) => normalizeName(s).split(NOT_LETTERS).filter(w => !!w);
const set = (list: string[]) => {
    const out: { [w: string]: boolean } = {};
    list.forEach(e => out[words(e).join('')] = true);
    return out;
};
/**
 * Words of the nickname lists (name-lists.json) that a lie may hold: history is fair game, and so are
 * sex and a cup (finding 1 of Product's look at the CrazyGames version), and the BBC is a broadcaster.
 */
export const NOT_FROM_NAME_LISTS = ['hitler', 'nazi', 'auschwitz', 'holocaust', 'sex', 'adolf', 'bbc',
    'היטלר', 'נאצי', 'אושוויץ', 'סקס', 'כוס', 'אדולף'];
// Endings that make a nickname list's word start ("cock", "cum", "pedo") a word of its own.
const START_ENDINGS = ['', 's', 'head', 'heads', 'face', 'faces', 'sucker', 'suckers', 'hole', 'holes',
    'shot', 'shots', 'slut', 'sluts', 'dump', 'dumps', 'bag', 'bags', 'wad', 'phile', 'philes', 'philia', 'ring'];

const squashed = (e: string) => words(e).join('');
const LATIN = /^[a-z]/;

/** The word and its simple plurals: English s, es, ies; Hebrew ים, ות, ית, יות (זונה, זונות). */
export function plurals(w: string): string[] {
    if (LATIN.test(w)) {
        // "es" only where English puts it (spic: spics, not "spices").
        const out = [w, w + 's'];
        if (/(s|x|z|ch|sh)$/.test(w)) {
            out.push(w + 'es');
        }
        if (/[^aeiou]y$/.test(w)) {
            out.push(w.slice(0, -1) + 'ies');
        }
        return out;
    }
    const out = [w, w + 'ים', w + 'ות', w + 'ית', w + 'יות'];
    if (/ה$/.test(w)) {
        out.push(w.slice(0, -1) + 'ות', w.slice(0, -1) + 'ים');
    }
    return out;
}

const NAME_HATE = (NAME_LISTS as any).hate || {};
const NAME_SEX = (NAME_LISTS as any).sex || {};
const KEPT = set(NOT_FROM_NAME_LISTS);
const fromLists = (key: string) => [].concat(NAME_HATE[key] || [], NAME_SEX[key] || [])
    .map(squashed).filter((e: string) => !!e && !KEPT[e]);

const WORD = set(LIE_WORDS.word);
// The nickname lists' whole words and anywhere-strings, read here as whole words, with plurals.
fromLists('word').concat(fromLists('any')).forEach((e: string) => plurals(e).forEach(p => WORD[squashed(p)] = true));
// Their word starts, as a word with a crude ending ("cockhead", "cumdump", "pedophiles").
fromLists('start').forEach((e: string) => (LATIN.test(e) ? START_ENDINGS.map(x => e + x) : plurals(e))
    .forEach(p => WORD[squashed(p)] = true));
const START = LIE_WORDS.start.map(squashed);
// Anywhere inside a word: the list's own, and the nickname lists' long anywhere-strings, which no fair
// word holds ("pedophilia", "masturbation"). "retard" is left out: "fire retardant".
const ANY = LIE_WORDS.any.map(squashed).concat(fromLists('any').filter((e: string) => e.length >= 7 && e !== 'retard'));
// Written over two to four words ("white power", "כוס אמא שלך"): the nickname lists' anywhere-strings
// of hate, and of Hebrew sex words, and the phrases above.
const PHRASE_ONE = set(LIE_WORDS.phrase);
[].concat(NAME_HATE.any || [], (NAME_SEX.any || []).filter((e: string) => HE_LETTER.test(squashed(e))))
    .map(squashed).filter((e: string) => !KEPT[e]).forEach((e: string) => PHRASE_ONE[e] = true);
const PHRASES = LIE_WORDS.phrase.map(words);
const ALLOW_PHRASES = LIE_WORDS.allow.map(words).filter(p => p.length > 1);
const ALLOW_ONE = set(LIE_WORDS.allow.filter(a => words(a).length === 1));
// The nickname filter's allowed names that are one word ("cocktail", "therapist", "כוסברה").
((NAME_LISTS as any).allow || []).forEach((a: string) => ALLOW_ONE[squashed(a)] = true);

/**
 * A run of three or more of one letter read once ("fuuuck", "shiiit"). A doubled letter stays as it is:
 * "rapper", "annals" and "hommos" are words.
 */
const fold = (w: string) => w.replace(/(.)\1\1+/g, '$1');
/**
 * Doubled letters read once, but only where fair English words rarely double them: "ii" and "uu"
 * ("shiit", "fuuck", "biitch"), or every double in a word with three or more ("ffuucckk", "sshhiitt").
 * "rapper", "annals", "hommos" and "Mississippi" keep their letters.
 */
function foldDoubles(w: string): string {
    if (!LATIN.test(w)) {
        return w;
    }
    const pairs = (w.match(/([a-z])\1/g) || []).length;
    return pairs >= 3 ? w.replace(/([a-z])\1+/g, '$1') : w.replace(/([iu])\1+/g, '$1');
}

/**
 * The word, the word with its repeated letters read once, and for a Hebrew word each of those without
 * one or two prefix letters ("והזונה" is "זונה").
 */
function forms(w: string): string[] {
    const out: string[] = [];
    [w, fold(w), foldDoubles(fold(w))].forEach(v => {
        if (out.indexOf(v) < 0) {
            out.push(v);
        }
        if (HE_LETTER.test(v)) {
            for (let i = 0; i < 2 && v.length - i > 3 && HE_PREFIX.indexOf(v.charAt(i)) >= 0; i++) {
                out.push(v.slice(i + 1));
            }
        }
    });
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
    // A listed phrase written as three or four words ("kill the jews"), or a Hebrew one as two or more
    // ("כוס אמא שלך"). Two English words are often fair ("a wet back"): their phrases are listed above.
    for (let i = 0; i < ws.length; i++) {
        let joined = ws[i];
        for (let j = i + 1; j < ws.length && j < i + 4 && !covered[i] && !covered[j]; j++) {
            joined += ws[j];
            if (PHRASE_ONE[joined] && (j - i >= 2 || HE_LETTER.test(joined))) {
                return true;
            }
        }
    }
    if (ws.some((w, i) => !covered[i] && wordRefused(w))) {
        return true;
    }
    // Spelled out a letter or two at a time ("c u n t", "f u c k").
    return ws.length > 1 && ws.every(w => w.length <= 2) && wordRefused(ws.join(''));
}

const WORD_LIST = Object.keys(WORD).filter(w => !ALLOW_ONE[w]);

/**
 * A word with letters hidden inside it that can only be a listed word ("b*tch", "a**hole", "ז*ן"). The lie
 * is read again with that word in its place, so an allowed phrase still covers it ("Pu$$y Riot").
 */
function hiddenRefused(text: string): boolean {
    const tokens = text.split(WORD_GAP);
    return tokens.some((token, i) => {
        const pieces = hiddenPattern(token);
        if (!pieces) {
            return false;
        }
        const first = pieces[0] as string;
        const read = (w: string) => wordsRefused(words(tokens.slice(0, i).concat([w], tokens.slice(i + 1)).join(' ')));
        return WORD_LIST.some(w => w.charAt(0) === first && spells(pieces, w, false) && read(w))
            || START.some(e => e.charAt(0) === first && spells(pieces, e, true) && read(e));
    });
}

/** A lie the filter refuses. */
export function lieRefused(text: string): boolean {
    const raw = String(text == null ? '' : text);
    if (LIE_WORDS.raw.some(e => raw.indexOf(e) >= 0) || BITCH_HE.test(raw) || ASS_SIGNS.test(raw)) {
        return true;
    }
    // A word with no letter typed in it is a number, a time, a price or a date ("455", "4.5", "7175", "$4"),
    // not a word written in digits: only beside a real letter do digits stand for letters ("sh1t", "a55").
    // A run of one-character words with a real letter among them is a word spelled out ("5 h i t",
    // "n 1 g g e r", "s h ! t"): its lone digits and signs are letters, and stay. Alone they are numbers.
    const tokens = raw.split(WORD_GAP);
    const one = tokens.map(t => Array.from(t).length === 1);
    const kept = tokens.map(hasLetter);
    for (let i = 0; i < tokens.length;) {
        let j = i;
        while (j < tokens.length && one[j]) {
            j++;
        }
        if (j - i > 1 && kept.slice(i, j).some(k => k)) {
            for (let k = i; k < j; k++) {
                kept[k] = true;
                tokens[k] = tokens[k] === '!' ? 'i' : tokens[k];
            }
        }
        i = Math.max(j, i + 1);
    }
    const typed = tokens.filter((_, i) => kept[i]).join(' ');
    const n = normalizeName(typed.replace(END_BANGS, ' '));
    const split = n.split(NOT_LETTERS).filter(w => !!w);
    // The same lie with the signs inside its words taken out, so "f*ck" and "dick-head" read as words.
    const joined = n.replace(INNER_SIGNS, '$1').replace(INNER_SIGNS, '$1').split(NOT_LETTERS).filter(w => !!w);
    // The same lie with the look-alike signs at a word's edge read as a space: "!" is an "i" inside
    // "b!tch", but in "חרא!", "shit!!" or "זין1" it only ends the word (the Hebrew kids' play-through).
    const edged = normalizeName(typed.replace(EDGE_SIGNS, (m: string, before: string) => (before || '') + ' '))
        .split(NOT_LETTERS).filter(w => !!w);
    return wordsRefused(split) || wordsRefused(joined) || wordsRefused(edged) || hiddenRefused(typed.replace(END_BANGS, ' '));
}
