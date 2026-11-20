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
