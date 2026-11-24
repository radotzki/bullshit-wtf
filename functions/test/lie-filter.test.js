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
                for (const p of plurals(e).slice(1)) refused([p, hebrew ? `כל ה${p} האלה` : `all the ${p} there`]);
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
