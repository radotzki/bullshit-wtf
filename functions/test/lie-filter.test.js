// The lie filter (controllers/lie-filter.ts): whole words, an allowed list for fair names, and the
// common swear words in English and Hebrew. Each case Product named in its look at the CrazyGames
// version (reports: crazygames-pr-205-review, finding 1) is here.  npm run build && node --test test/lie-filter.test.js
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const { lieRefused } = require(path.join(__dirname, '..', 'dist', 'controllers', 'lie-filter'));

const fine = (list) => list.forEach(t => assert.strictEqual(lieRefused(t), false, 'refused a fair lie: ' + t));
const refused = (list) => list.forEach(t => assert.strictEqual(lieRefused(t), true, 'let through: ' + t));

test('the fair lies the look found refused now go through', () => {
    fine(['Dick Van Dyke', 'Philip K. Dick', 'Dick Cheney', 'Scunthorpe', 'Sex and the City', 'sex education',
        'Homo sapiens', 'Cumbria', 'cum laude', 'blue tits', 'Hitler', 'Nazi', 'כוס']);
});

test('more fair lies: names, places, birds, food, the game itself', () => {
    fine(['Moby Dick', 'Charles Dickens', 'Emily Dickinson', 'a cocktail party', 'cumin and pepper', 'peacock feathers',
        'summa cum laude', 'magna cum laude', 'Homo erectus', 'a great tit', 'long tailed tits', 'Maine Coon',
        'Rio Negro', 'oilseed rape', 'John Lee Hooker', 'shiitake mushrooms', 'pussy willow', 'Middlesex', 'Essex',
        'Sussex', 'Penistone', 'Arsenal', 'class', 'assassin', 'passionate', 'bass', 'grape', 'drape', 'therapist',
        'Matsushita', 'shitake', 'Hancock', 'Cockburn', 'Dickson', 'scrapbook', 'a cat', 'the mayor of London',
        'bullshit', 'bullshit.wtf', 'Nazis invaded Poland', 'Adolf Hitler', 'Auschwitz', 'the Holocaust',
        'sexy dancer', 'sextet', 'a pecking order', 'Shih Tzu', 'Uranus', 'Titicaca', 'cocoa', 'hookah', 'peniche',
        '', '   ']);
});

test('Hebrew fair lies: cup, food, nourishing, names', () => {
    fine(['כוס קפה', 'כוס תה', 'כוס של מים', 'כוסות', 'כוסברה', 'כוסמת', 'מזונות', 'מזון', 'מזין', 'הזין את החתול',
        'כלי זין', 'זינה', 'היטלר', 'נאצים', 'סקס והעיר הגדולה', 'חרוב', 'זנב', 'בולשיט']);
});

test('the swear words the look found let through are refused', () => {
    refused(['shit', 'fuck', 'bitch', 'bastard', 'hooker']);
});

test('common English swearing, slurs and sex words are refused, also inside a lie', () => {
    refused(['holy shit', 'a fucking dog', 'motherfucker', 'clusterfuck', 'you bitch', 'what an asshole',
        'a big cunt', 'i am a whore', 'my dick', 'a dickhead', 'a slut', 'tits', 'his cock', 'pussy',
        'a wanker', 'twat', 'son of a bitch', 'a nigger', 'faggot', 'retard', 'heil hitler', 'sieg heil',
        'gas the jews', 'white power', '1488', 'porn', 'a dildo', 'rape', 'blowjob', 'jizz', 'cum']);
});

test('swearing in disguise is refused', () => {
    refused(['SHIT', 'Sh1t', '$hit', 'f*ck', 'f**king', 'f u c k', 'f.u.c.k', 'c u n t', 'b!tch', 'a55hole',
        'phuck', 'dick-head', 'f-ck', 'sh*t']);
});

test('common Hebrew swearing, slurs and sex words are refused, also with a prefix letter', () => {
    refused(['חרא', 'איזה חרא', 'זונה', 'בן זונה', 'יא בן זונה', 'והזונה', 'שרמוטה', 'כוס אמק', 'כוסאמק',
        'כוס אמא שלך', 'כוסית', 'זין', 'על הזין', 'לך תזדיין', 'מזדיין', 'מניאק', 'הומו', 'כושי', 'מפגר',
        'מוות לערבים', 'זיון', 'ציצים', 'פורנו']);
});

// Product's look at #211 (reports: pr-211-product-look): the lie filter must refuse every slur and sex
// word of the nickname lists, as #205's filter did, bar the history and the cup it lets through on purpose.
const lists = require(path.join(__dirname, '..', '..', 'name-lists.json'));
const { NOT_FROM_NAME_LISTS, plurals } = require(path.join(__dirname, '..', 'dist', 'controllers', 'lie-filter'));
const { normalizeName } = require(path.join(__dirname, '..', 'dist', 'name-flag'));
const squash = (e) => normalizeName(e).replace(/[^a-zא-ת]/g, '');

test('every hate and sex entry of the nickname lists is refused: alone, in a sentence, and as a plural', () => {
    const kept = NOT_FROM_NAME_LISTS.map(squash);
    let n = 0;
    for (const tier of [lists.hate, lists.sex]) {
        for (const key of ['word', 'start', 'any']) {
            for (const entry of tier[key] || []) {
                const e = squash(entry);
                if (!e || kept.includes(e)) continue;
                const hebrew = /^[א-ת]/.test(e);
                refused([entry, hebrew ? `הוא ${entry} גדול` : `he is a ${entry} really`]);
                // Plurals that are fair words: "מונגולים" is the Mongols, a people (a shipped answer:
                // "המונגולים תקפו"), and "שפיכות" is spilling ("שפיכות דמים", bloodshed).
                if (e === 'מונגול' || e === 'שפיכ') continue;
                // "מציצים" is peepers (and a TV show), not the plural of "מציצה", which is "מציצות".
                for (const p of plurals(e).slice(1).filter(x => x !== 'מציצים')) refused([p, hebrew ? `כל ה${p} האלה` : `all the ${p} there`]);
                n++;
            }
        }
        refused(tier.raw || []);
    }
    assert.ok(n > 150, `${n} entries`);
});

test('the slurs and sex words Product found let through at 8c3d80a are refused', () => {
    refused(['beaner', 'spick', 'kyke', 'jigaboo', 'nignog', 'niglet', 'porchmonkey', 'nibba', 'kneegrow', 'faggit',
        'fagget', 'trannie', 'kushi', 'cushi', 'kushim', 'מונגול', 'zieghail', 'wetbacks', 'ragheads', 'towelheads',
        'mongoloids', 'rapists', 'pedophiles', 'paedophiles', 'deepthroat', 'creampie', 'cumdump', 'orgasms', 'vaginas',
        'milfs', 'handjobs', 'pussi', 'bigdick', 'anus', 'כוס אמאק', 'קוקסינלית', 'זונהה', 'kusumak', 'kusomak',
        'kusamak', 'c0ckhead', 'fuuuck', 'shiiit', 'white power', 'kill the jews', 'כוס אמא שלך']);
});

test('the history and the cup that the nickname lists flag stay fair in a lie', () => {
    fine(['Hitler', 'Nazi', 'Nazis', 'Auschwitz', 'the Holocaust', 'sex', 'Adolf', 'Adolf Hitler', 'היטלר', 'נאצי',
        'אושוויץ', 'סקס', 'כוס', 'אדולף', 'Osama bin Laden', 'a fire retardant', 'Shiite', 'a niggling doubt',
        'Tom Dick and Harry', 'the BBC', 'Uranus', 'המונגולים תקפו', 'שפיכות דמים', 'cumulus clouds', 'a cocky rooster', 'therapists', 'כוסות', 'כוסברה']);
});

test('doubled letters and "es" endings of fair words are not read as listed words (Product, objection 2)', () => {
    fine(['rapper', 'a famous rapper', 'Eminem is a rapper', 'rappers', 'rapped', 'rapping', 'spices', 'salt and spices',
        'annal', 'annals', 'the annals of history', 'dikes', 'the Dutch dikes', 'hommos', 'poorness', 'cushies',
        'a wet back', 'Mississippi', 'Tennessee', 'coffee', 'assassin']);
    refused(['fuuuck', 'shiiit', 'biiitch', 'זונהה', 'spics', 'wetbacks', 'porch monkey', 'kill the jews',
        'kill jews', 'white power', 'מזיין שכל']);
});

// The Hebrew kids' play-through (reports: hebrew-kids-break): an exclamation mark or a digit at the end
// of a word is read as the letter it looks like ("!" as i, "1" as i), so "חרא!" passed while "חרא" did not.
test('a sign or a digit at the start or end of a word hides no swear word', () => {
    refused(['חרא!', 'חרא!!', '!!!חרא', 'זין!', 'זין1', 'זונה!', 'בן זונה!!!', 'כוס אמק!', 'shit!', 'bitch!!', 'dick!',
        'shit1', 'a fucking dog!', 'פאק', 'וואט דה פאק', 'פאקינג כלב']);
    fine(['nice!', 'wow!!!', 'כלב!', 'שבע!', '42 שנה', 'פי 2', 'בננות!', '!שלום', 'b2b', 'R2D2', 'pakistan', 'פקיסטן', 'פאקיסטן']);
});

// Trying to beat the kids' filter as a 10 to 13 year old would (reports: kids-filter-break-in). Each of these
// passed at cb2efc5 (#225).
test('a hidden letter inside a word, also with "!" at its end, is read as the letter it hides', () => {
    refused(['b*tch!', 'b#tch!', 'a b*tch!', 'it smelled like sh*t!', 'f@ck', 'f$ck', 'd*ck', 'c*nt', 'p*ssy', 'wh*re',
        'sl*t', 'a**hole', 'b-tch', 'i love b*tches', 'a sonofab*tch', 'b🐝tch', 'ז*ן', 'ח*א', 'זו*ה', 'ז"ן']);
    // Initials, contractions, names with signs, Hebrew acronyms and geresh words stay fine.
    fine(['C.S.I', 's.h.e', 'x-ray', 't-shirt', 'mother-in-law', 'his mother-in-law', 'Pu$$y Riot', 'Ke$ha', 'Ca$h',
        'A$AP Rocky', 'P!nk', 'AT&T', 'M&M\'s', "rock'n'roll", 'Wal-Mart', 'Spider-Man', 'R2-D2', 'C-3PO', 'bullshit.wtf',
        'צה"ל', 'ת"א', 'ז"ל', 'ש"ח', 'עו"ד', 'יו"ר', 'ט"ו בשבט', "צ'יפס", "ג'ירפה", "ז'קט", "סנדוויץ'", "ביצ'ה", 'f***', 'sh**']);
});

test('"!" at the end of a word ends it, so allowed phrases and names with "!" stay fine', () => {
    fine(['cum laude!', 'summa cum laude!', 'Homo sapiens!', 'Homo erectus!!', 'Dick Van Dyke!', 'Dick Van Dyke?',
        'Dick Cheney!', 'Moby Dick!', 'Kush!', 'Hindu Kush!', 'blue tits!', 'Spotted Dick!', 'Yahoo!', 'Wham!']);
    refused(['b!tch', 'sh!t', 'shit!', 'dick!', 'Dick!', 'cum!', 'homo!']);
});

test('doubled "i" or "u", or every letter doubled, is read once', () => {
    refused(['fuuck', 'shiit', 'biitch', 'ffuucckk', 'sshhiitt']);
    fine(['shiitake', 'Hawaii', 'skiing', 'vacuum', 'rapper', 'hommos', 'Mississippi', 'coffee', 'bookkeeper', 'Tennessee']);
});

test('fancy letters, accents and look-alikes do not hide a word', () => {
    refused(['ꜰᴜᴄᴋ', '🅵🆄🅲🅺', '🅕🅤🅒🅚', '🇫🇺🇨🇰', 'fúck', 'f́uck', 'fück', 'ѕhit', 'fvck', 'cvnt']);
    fine(['café', 'Zoë', 'José', 'Pokémon', 'naïve', 'Beyoncé']);
});

test('English swearing in Hebrew letters, and Hebrew as kids misspell it, is refused', () => {
    refused(["ביץ'", "ביצ'", 'ביץ', "ביטץ'", "ביאץ'", "יא ביץ'", 'דיק', 'דיקהד', 'אסהול', 'פאקיו', 'מאדרפאקר',
        'מאתרפאקר', "סאנאפאביץ'", 'כוסאמך', 'כוס אמך', 'כוס עמאק', 'בן זונא', 'בנזונא', 'זונע', 'שרמוטע', 'מזדין',
        'תזדין', 'לך תזדין']);
    fine(['ביצה', 'ביצים', 'ביצות', 'דיקן', 'דיקלה', 'דיק ואן דייק', 'מובי דיק', 'הומו ספיינס', 'מציצים', 'קשית מציצה',
        'שיט', 'שיטה', 'פאקיסטן', 'קאנט', 'דיאן פוסי', 'גרין ביי פאקרס']);
});

test('Hebrew swearing written in English letters is refused', () => {
    refused(['kusima', 'kusit', 'benzona', 'ben zona', 'mefager', 'tizdayen', 'lech tizdayen', 'mizdayen', 'kibenimat']);
    fine(['Zayn Malik', 'Zain', 'Sahara', 'Hara-kiri', 'Arizona', 'Kuskus', 'couscous', 'Kushner']);
});

// Product's look at e7d8823 (reports: kids-filter-226-check): an apostrophe and an English ending end a
// word, and a Hebrew geresh is part of its letter, so possessives and Hebrew names are not hidden letters.
test('possessives, contractions and geresh names are not read as hidden letters', () => {
    fine(["Hooke's law", "the pen's cap", "my chin's itchy", "Chin's restaurant", "pi's first digit", "rap's biggest star",
        "the goo's green", "the crowd's boo's", "the coo's sound", "Fu's noodles", "Kik's app", "rap'd", "ti's", "fa's",
        "hom's", "pak's", "k's", "c'mon", "who'd", "o'clock", "y'all", "s'mores", "ז'ן ולז'ן", "דיק צ'ייני", 'fromage râpé']);
    refused(["b'tch", "b*tch's", "f'ck", "the d*ck's", "ז*ן"]);
});

test('the older gaps of Product\'s section 2 are refused', () => {
    refused(['אחושרמוטה', 'קוס אמק', 'קוסאמק', 'חארה', 'תזדיינו', 'לכו תזדיינו', 'כוס אמו', 'כוסאמו', 'כוסעומק', 'שרמוטא',
        'מאניאק', 'מנייאק', 'לך תמצוץ', 'זיינתי', "בייץ'", "ביצ'ס", 'ז1ן', 'ass', 'a$$', '@ss', 'a55', 'a**', 'kiss my a**',
        'badass', 'a-hole', 'what an a-hole', 'fukc', 'fcuk', 'slvt', 'biotch', 'kos emek', 'koss emek', 'kusomo',
        'sharmoota', 'sharmootah']);
    fine(['a hole in the ground', 'Kos island', 'pass', 'class', 'assist', 'Assad', 'מוצץ', 'תמצוץ את הלימון', 'the A-Team',
        'a-ha', 'ביצה קשה', "ביצ'יקו", "ז'אן"]);
});
