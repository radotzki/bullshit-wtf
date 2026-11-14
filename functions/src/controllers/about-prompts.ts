/**
 * The "About us" questions: prompts about one player of the game, in English and Hebrew.
 *
 * `{name}` is the named player's nickname and `$blank$` the blank, as in the bank's questions. The
 * named player's own answer is the truth; `house` are the answers the house adds when a small table
 * has too few lies (see aboutAnswers in about.ts), and picking one costs points like any house lie.
 *
 * How they are written:
 *   - funny, never cruel, and safe with family or a class in the room: no body, money, romance,
 *     politics or religion. Each is something the named player knows and friends can guess at.
 *   - house answers are odd but possible, so they rarely say what a player would really answer.
 *   - Hebrew without gendered verbs about the named player (a name can be anyone's): "של", "על", "את",
 *     "ל־" before the name, or a present-tense verb that reads the same either way (רוצה, רואה, עושה).
 *
 * To add a prompt: a new id (never reuse one: rooms remember the ids they have seen), both languages,
 * at least four house answers in each. functions/test/about.test.js checks the shape.
 * This file is pure (no Firebase) so it can be unit tested.
 */

export interface AboutPromptText {
    text: string;
    house: string[];
}

export interface AboutPrompt {
    id: string;
    en: AboutPromptText;
    he: AboutPromptText;
}

export const aboutPrompts: AboutPrompt[] = [
    {
        id: 'fire',
        en: {
            text: 'If the house were on fire, the one thing {name} would save is $blank$',
            house: ['a jar of pickles', 'the tv remote', 'a single sock', 'the wifi router', 'a houseplant named steve'],
        },
        he: {
            text: 'בשריפה בבית, הדבר הראשון שחשוב ל־{name} להציל: $blank$',
            house: ['צנצנת חמוצים', 'השלט של הטלוויזיה', 'גרב אחת', 'הראוטר', 'עציץ בשם שמוליק'],
        },
    },
    {
        id: 'late',
        en: {
            text: '{name}\'s excuse for being late next time: $blank$',
            house: ['the cat sat on my keys', 'my gps took me to eilat', 'i was early, you were all late', 'there was a parade', 'the lift got stuck'],
        },
        he: {
            text: 'התירוץ של {name} לאיחור הבא: $blank$',
            house: ['החתול ישב על המפתחות', 'הווייז שלח אותי לאילת', 'דווקא הגעתי מוקדם', 'הייתה תהלוכה', 'המעלית נתקעה'],
        },
    },
    {
        id: 'food',
        en: {
            text: '{name}\'s favourite food in the whole world: $blank$',
            house: ['pickled herring', 'toast with ketchup', 'cereal with orange juice', 'boiled cabbage', 'frozen peas, still frozen'],
        },
        he: {
            text: 'המאכל האהוב על {name} בעולם: $blank$',
            house: ['דג מלוח', 'טוסט עם קטשופ', 'קורנפלקס עם מיץ תפוזים', 'כרוב מבושל', 'אפונה קפואה, עדיין קפואה'],
        },
    },
    {
        id: 'song',
        en: {
            text: 'The song {name} knows every word of: $blank$',
            house: ['baby shark', 'a jingle for a cereal ad', 'the theme from friends', 'happy birthday in french', 'a song from nursery school'],
        },
        he: {
            text: 'השיר שכל המילים שלו בראש של {name}: $blank$',
            house: ['בייבי שארק', 'הג\'ינגל של במבה', 'שיר הפתיחה של חברים', 'יום הולדת שמח בצרפתית', 'שיר מהגן'],
        },
    },
    {
        id: 'talent',
        en: {
            text: '{name}\'s secret talent: $blank$',
            house: ['folding fitted sheets', 'guessing the time without a clock', 'talking to pigeons', 'parallel parking first try', 'remembering every birthday'],
        },
        he: {
            text: 'הכישרון הסודי של {name}: $blank$',
            house: ['לקפל סדין עם גומי', 'לנחש מה השעה בלי שעון', 'לדבר עם יונים', 'חניה במקביל בניסיון הראשון', 'לזכור את כל ימי ההולדת'],
        },
    },
    {
        id: 'superpower',
        en: {
            text: 'The superpower {name} wants most: $blank$',
            house: ['never losing the tv remote', 'talking to fish', 'always finding parking', 'turning into a chair', 'flying, but only one metre up'],
        },
        he: {
            text: 'כוח העל ש־{name} הכי רוצה: $blank$',
            house: ['אף פעם לא לאבד את השלט', 'לדבר עם דגים', 'תמיד למצוא חניה', 'להפוך לכיסא', 'לעוף, אבל רק מטר מהרצפה'],
        },
    },
    {
        id: 'animal',
        en: {
            text: 'The animal {name} would like to be for one day: $blank$',
            house: ['a goldfish with a view', 'a sloth', 'a seagull at the beach', 'a penguin in a tuxedo', 'a very proud goose'],
        },
        he: {
            text: 'החיה ש־{name} רוצה להיות ליום אחד: $blank$',
            house: ['דג זהב עם נוף', 'עצלן', 'שחף בחוף', 'פינגווין בחליפה', 'אווז גאה במיוחד'],
        },
    },
    {
        id: 'app',
        en: {
            text: 'The first app {name} opens in the morning: $blank$',
            house: ['the calculator', 'the weather, twice', 'a bird-watching app', 'the torch', 'sudoku'],
        },
        he: {
            text: 'האפליקציה הראשונה שנפתחת אצל {name} בבוקר: $blank$',
            house: ['המחשבון', 'מזג האוויר, פעמיים', 'אפליקציה לצפרות', 'הפנס', 'סודוקו'],
        },
    },
    {
        id: 'bag',
        en: {
            text: 'Something that is always in {name}\'s bag: $blank$',
            house: ['a spare spoon', 'a rubber duck', 'receipts from 2019', 'a tiny screwdriver', 'half a sandwich'],
        },
        he: {
            text: 'משהו שתמיד יש בתיק של {name}: $blank$',
            house: ['כפית רזרבית', 'ברווז גומי', 'קבלות מ־2019', 'מברג קטנטן', 'חצי כריך'],
        },
    },
    {
        id: 'dream-job',
        en: {
            text: '{name}\'s dream job at age six: $blank$',
            house: ['a dinosaur', 'a traffic light', 'driving an ice cream van', 'ice cream taster', 'dragon trainer'],
        },
        he: {
            text: 'עבודת החלומות של {name} בגיל שש: $blank$',
            house: ['דינוזאור', 'רמזור', 'נהיגה במשאית גלידה', 'טעימות גלידה', 'אילוף דרקונים'],
        },
    },
    {
        id: 'film',
        en: {
            text: '{name}\'s favourite film: $blank$',
            house: ['shrek 2', 'a documentary about bread', 'home alone', 'finding nemo', 'cars 3'],
        },
        he: {
            text: 'הסרט האהוב על {name}: $blank$',
            house: ['שרק 2', 'סרט תיעודי על לחם', 'שכחו אותי בבית', 'מוצאים את נמו', 'מכוניות 3'],
        },
    },
    {
        id: 'place',
        en: {
            text: '{name}\'s favourite place in town: $blank$',
            house: ['the hardware store', 'the bench at the bus stop', 'the all-night bakery', 'the car wash', 'the mall car park'],
        },
        he: {
            text: 'המקום האהוב על {name} בעיר: $blank$',
            house: ['חנות לחומרי בניין', 'הספסל בתחנת האוטובוס', 'המאפייה של הלילה', 'שטיפת המכוניות', 'החניון של הקניון'],
        },
    },
    {
        id: 'laugh',
        en: {
            text: 'The thing that always makes {name} laugh: $blank$',
            house: ['dogs in raincoats', 'terrible puns', 'videos of screaming goats', 'a sneeze at the worst moment', 'the word pyjamas'],
        },
        he: {
            text: 'הדבר שתמיד מצחיק את {name}: $blank$',
            house: ['כלבים במעיל גשם', 'בדיחות קרש', 'סרטונים של עיזים צועקות', 'עיטוש ברגע הכי לא מתאים', 'המילה פיג\'מה'],
        },
    },
    {
        id: 'secret-show',
        en: {
            text: 'The show {name} watches in secret: $blank$',
            house: ['a cooking show for dogs', 'teletubbies', 'the weather channel', 'a fishing show', 'dora the explorer'],
        },
        he: {
            text: 'הסדרה ש־{name} רואה בסתר: $blank$',
            house: ['תוכנית בישול לכלבים', 'טלטאביז', 'ערוץ מזג האוויר', 'תוכנית על דיג', 'דורה'],
        },
    },
    {
        id: 'chore',
        en: {
            text: 'The chore that annoys {name} the most: $blank$',
            house: ['pairing socks', 'dusting the ceiling', 'watering a plastic plant', 'ironing tea towels', 'sorting the spoons'],
        },
        he: {
            text: 'המטלה בבית שהכי מעצבנת את {name}: $blank$',
            house: ['להתאים גרביים', 'לנקות אבק מהתקרה', 'להשקות עציץ מפלסטיק', 'לגהץ מגבות מטבח', 'למיין את הכפיות'],
        },
    },
    {
        id: 'snack',
        en: {
            text: '{name}\'s secret snack: $blank$',
            house: ['dry instant noodles', 'a spoon of peanut butter', 'frozen grapes', 'pickles from the jar', 'croutons from the bag'],
        },
        he: {
            text: 'החטיף הסודי של {name}: $blank$',
            house: ['אטריות אינסטנט יבשות', 'כפית חמאת בוטנים', 'ענבים קפואים', 'מלפפון חמוץ ישר מהצנצנת', 'קרוטונים מהשקית'],
        },
    },
    {
        id: 'day-off',
        en: {
            text: 'The first thing {name} does on a day off: $blank$',
            house: ['sorting the spices a to z', 'washing the car twice', 'a trip to the hardware store', 'planning the next day off', 'small talk with the neighbours'],
        },
        he: {
            text: 'הדבר הראשון ש־{name} עושה ביום חופש: $blank$',
            house: ['סידור התבלינים לפי א״ב', 'שטיפת האוטו פעמיים', 'ביקור בחנות לחומרי בניין', 'תכנון יום החופש הבא', 'שיחת חולין עם השכנים'],
        },
    },
    {
        id: 'word',
        en: {
            text: 'The word you hear most from {name}: $blank$',
            house: ['allegedly', 'splendid', 'technically', 'kerfuffle', 'scientifically speaking'],
        },
        he: {
            text: 'המילה שהכי שומעים מ־{name}: $blank$',
            house: ['לכאורה', 'טכנית', 'פנטסטי', 'בלגן', 'מבחינה מדעית'],
        },
    },
    {
        id: 'cartoon',
        en: {
            text: 'The cartoon {name} loved as a kid: $blank$',
            house: ['the smurfs', 'pingu', 'tom and jerry', 'bob the builder', 'a cartoon about a talking sponge'],
        },
        he: {
            text: 'הסדרה המצוירת האהובה על {name} בילדות: $blank$',
            house: ['הדרדסים', 'פינגו', 'טום וג\'רי', 'בוב הבנאי', 'סדרה על ספוג מדבר'],
        },
    },
    {
        id: 'take-along',
        en: {
            text: 'The thing that always leaves the house with {name}: $blank$',
            house: ['a lucky pebble', 'a spare umbrella', 'a tiny torch', 'a pocket of almonds', 'a pen that doesn\'t work'],
        },
        he: {
            text: 'הדבר שתמיד יוצא עם {name} מהבית: $blank$',
            house: ['אבן מזל', 'מטרייה רזרבית', 'פנס קטנטן', 'כיס מלא שקדים', 'עט שלא כותב'],
        },
    },
    {
        id: 'hobby',
        en: {
            text: 'The hobby {name} would start tomorrow if there were time: $blank$',
            house: ['competitive yodelling', 'ships in bottles', 'beekeeping', 'collecting spoons', 'tap dancing'],
        },
        he: {
            text: 'התחביב ש־{name} הכי רוצה להתחיל: $blank$',
            house: ['יודל תחרותי', 'ספינות בתוך בקבוקים', 'גידול דבורים', 'איסוף כפיות', 'סטפס'],
        },
    },
    {
        id: 'ice-cream',
        en: {
            text: 'The ice cream flavour {name} always orders: $blank$',
            house: ['rum and raisin', 'mint with extra mint', 'black sesame', 'bubblegum', 'lemon sorbet, always'],
        },
        he: {
            text: 'טעם הגלידה הקבוע של {name}: $blank$',
            house: ['רום צימוקים', 'מנטה עם עוד מנטה', 'שומשום שחור', 'מסטיק', 'סורבה לימון'],
        },
    },
];

export function aboutPrompt(id: string): AboutPrompt | undefined {
    return aboutPrompts.find(p => p.id === id);
}

/** The prompt's words in the game's language (English for anything but Hebrew). */
export function aboutPromptText(prompt: AboutPrompt, locale: string): AboutPromptText {
    return locale === 'he' ? prompt.he : prompt.en;
}
