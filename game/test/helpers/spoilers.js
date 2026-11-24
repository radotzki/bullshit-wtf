// One shared spoiler check for the site's pages: does a page give away the answer to a question of one of
// the game's question packs? Bullshit is a bluffing quiz: a family that reads our page and then gets a
// question whose answer the page just told them loses the round's fun.
//
// A page spoils a question in one of three ways:
//  - "answer + context": the true answer, and near it (within WINDOW words) at least two of the question's
//    own words. "גיל" or "eight" alone is an everyday word; "eight" two words from "Shammai" and "candles"
//    is the answer to hanukkah-26-en-31.
//  - "answer": a rare answer, on its own. Only answers of six letters or more, or of two words or more, and
//    not on LONE_OK below ("judah maccabee" is everywhere on a Hanukkah page and tells nothing).
//  - "fact": four words in a row of the question read with its answer ("נס גדול היה שם"), so a page that
//    tells the fact in other words around it is still caught.
// Words match whole, in any of their usual forms:
//  - Hebrew: after one or two prefix letters (ה ו ב ל מ ש כ, "וה", "שב", "כש"...), and with a plural or
//    feminine ending (ים ות ה ת י), final letters folded (ך→כ). "פטישים" is "פטיש", "ואש" is "אש".
//  - English: lower case, with s, es, 's, ed or ing. "Hammers" is "hammer".
//  - Numbers: a digit and its word are one ("8" is "eight", "7" is "שבעה").
//  - Short words (three letters or fewer) never lose an ending, only a prefix: "שמה" is not "שם", but "ושם" is.
//
// Use it from a test:
//   const spoilers = require('./helpers/spoilers');
//   const found = spoilers.find(spoilers.pageText(page), spoilers.pack('hanukkah', 'he'));
//   assert.deepStrictEqual(found.map(spoilers.describe), []);
// A text that is not a page (a quiz's question and answer) can go straight to find().
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..', '..');
const WINDOW = 20;

// The pack's questions of one language, as [{ id, questionText, realAnswer, lang }].
function pack(name, lang) {
    const file = path.join(root, 'functions', 'data', name + '-questions.json');
    return Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))
        .filter(([, q]) => !lang || q.lang === lang)
        .map(([id, q]) => Object.assign({ id }, q));
}

const ENTITIES = { '&quot;': '"', '&#39;': "'", '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ' };
// What a visitor reads of a page of seo/pages.js: its title, description, heading and body, tags out.
function pageText(p) {
    const html = [p.title, p.description, p.h1, p.body].filter(Boolean).join(' . ');
    return html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ')
        .replace(/&[#a-z0-9]+;/g, e => ENTITIES[e] || ' ');
}

const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const HEBREW = /[א-ת]/;
// Words, in order: lower case, Hebrew points and quote marks out ("תנ"ך" is one word), final letters folded.
function words(text) {
    return String(text).toLowerCase()
        .replace(/[֑-ׇ]/g, '')
        .replace(/['"׳״`’‘“”]/g, '')
        .replace(/[ךםןףץ]/g, c => FINALS[c])
        .split(/[^a-z0-9א-ת]+/)
        .filter(Boolean);
}

const PREFIXES = ['ו', 'ה', 'ב', 'ל', 'מ', 'ש', 'כ', 'וה', 'וב', 'ול', 'ומ', 'וש', 'וכ', 'שה', 'שב', 'של', 'שמ', 'שכ',
    'כש', 'מה', 'בה', 'כה', 'לכש', 'וכש', 'ושה', 'ושב', 'ומה', 'מש'];
// Written with final letters folded, as words() leaves them ("ים" is "ימ").
const HE_ENDINGS = ['יות', 'ימ', 'ות', 'ית', 'יה', 'ה', 'ת', 'י', 'ו'];
const EN_ENDINGS = ["'s", 'ies', 'es', 's', 'ed', 'ing'];
const NUMBERS = {
    '1': ['one', 'אחד', 'אחת'], '2': ['two', 'שני', 'שתי', 'שניים', 'שתיים'], '3': ['three', 'שלוש', 'שלושה'],
    '4': ['four', 'ארבע', 'ארבעה'], '5': ['five', 'חמש', 'חמשה', 'חמישה', 'חמשת'], '6': ['six', 'שש', 'ששה', 'שישה'],
    '7': ['seven', 'שבע', 'שבעה'], '8': ['eight', 'שמונה'], '9': ['nine', 'תשע', 'תשעה'], '10': ['ten', 'עשר', 'עשרה'],
    '20': ['twenty', 'עשרים'], '44': ['forty-four'],
};
const NUMBER_OF = {};
Object.entries(NUMBERS).forEach(([digit, names]) => names.forEach(n => NUMBER_OF[n] = digit));

// The forms a word of a page can stand for: itself, without its prefix, without its ending, and as a number.
// A short word (three letters or fewer, after its prefix is off) keeps its ending.
function forms(word) {
    const out = new Set([word]);
    if (HEBREW.test(word)) {
        PREFIXES.forEach(p => {
            if (word.startsWith(p) && word.length - p.length >= 2) {
                out.add(word.slice(p.length));
            }
        });
        [...out].forEach(w => HE_ENDINGS.forEach(e => {
            if (w.endsWith(e) && w.length - e.length >= 3) {
                out.add(w.slice(0, -e.length));
            }
        }));
    } else {
        EN_ENDINGS.forEach(e => {
            if (word.endsWith(e) && word.length - e.length >= 3) {
                out.add(e === 'ies' ? word.slice(0, -3) + 'y' : word.slice(0, -e.length));
            }
        });
    }
    [...out].forEach(w => NUMBER_OF[w] && out.add(NUMBER_OF[w]));
    return out;
}
const shared = (a, b) => [...a].some(x => b.has(x));
const same = (pageForms, wanted) => shared(pageForms, wanted);

// Words that tell nothing about any one question: the language's small words, and the words every
// Hanukkah page says. Each topic word has its reason; none is ever an answer of the pack (the test
// "no answer is a word that is never counted" checks that).
const SMALL = new Set(words(
    'a an the of in on at to for from by with and or but is was were are be been it its this that who what ' +
    'which when as his her their they he she you your we our one not no so then than into out up all has had ' +
    'have most often first also only some many there them did does about after before over why how ' +
    'של את על עם הוא היא הם הן זה זו זאת כי אבל גם לא כן יש אין מה מי כל היה הייתה היו אם או רק עוד כמו ' +
    'אחרי לפני בין כבר אז כך פי לפי ידי עד אותו אותה אותם שלו שלה שלהם הזה הזאת יותר הכי מאוד אף ' +
    'בכל לכל כולם כולל ואז אחר כש אחד אחת ראשון ראשונה הראשון הראשונה'));
const TOPIC = {
    // Hanukkah itself: every page of the season names it, and the pack's questions are all about it.
    'hanukkah': 'every Hanukkah page names the holiday', 'חנוכה': 'every Hanukkah page names the holiday',
    'chanukah': 'every Hanukkah page names the holiday', 'החג': 'the holiday, on every holiday page',
    'holiday': 'the holiday, on every holiday page', 'חג': 'the holiday, on every holiday page',
    // The candles and the lamp: lit every night, named on every page about the nights.
    'menorah': 'the lamp lit every night', 'חנוכייה': 'the lamp lit every night', 'חנוכיה': 'the lamp lit every night',
    'candle': 'lit every night', 'candles': 'lit every night', 'נר': 'lit every night', 'נרות': 'lit every night',
    'night': 'the eight nights, on every page', 'nights': 'the eight nights, on every page',
    'לילה': 'the eight nights, on every page', 'לילות': 'the eight nights, on every page',
    // The things every family has on the table: the pages name them to set the scene.
    'dreidel': 'the top every family spins', 'סביבון': 'the top every family spins',
    'latkes': 'fried on every night', 'לביבות': 'fried on every night', 'סופגנייה': 'eaten on every night',
    'jewish': 'the holiday is a Jewish one', 'יהודים': 'the holiday is a Jewish one', 'יהודי': 'the holiday is a Jewish one',
    'israel': 'where the Hebrew site is played', 'ישראל': 'where the Hebrew site is played',
    // How the pack's questions start: years and "ancient" are on most of them.
    'ancient': 'how many questions start', 'עתיק': 'how many questions start', 'עתיקה': 'how many questions start',
    'word': 'how many questions start ("the word for")', 'מילה': 'how many questions start ("the word for")',
    'המילה': 'how many questions start ("the word for")', 'name': 'how many questions start', 'השם': 'how many questions start',
    'called': 'how many questions start', 'נקרא': 'how many questions start', 'שנקראות': 'how many questions start',
    // The game's own words on every page.
    'game': 'the page is about the game', 'משחק': 'the page is about the game', 'family': 'the page is for families',
    'משפחה': 'the page is for families', 'day': 'common', 'days': 'common', 'יום': 'common', 'ימים': 'common',
    'היום': 'common', 'year': 'common', 'שנה': 'common', 'בשנת': 'common',
    'בית': 'home, or a house: on every page ("בבית", "בית ספר")', 'home': 'on every page', 'house': 'on every page',
};
const TOPIC_FORMS = new Set(Object.keys(TOPIC).flatMap(w => words(w)).flatMap(w => [...forms(w)]));
const counts = (w) => w.length >= 2 && !shared(forms(w), SMALL) && !shared(forms(w), TOPIC_FORMS) && !/^\d+$/.test(w);

// Answers that a page may name on their own, each with its reason. They are caught only with their
// question's words near them (or as four words in a row of the fact). Answers shorter than six letters
// are never caught alone, so they need no entry.
const LONE_OK = {
    // Everyday words and phrases: any page may say them.
    'nothing': 'everyday word ("nothing to set up")', 'lights': 'everyday word ("candle lighting")',
    'turkey': 'everyday word: the Thanksgiving bird', 'daughters': 'everyday word ("your daughter writes")',
    'half an hour': 'everyday phrase: how long a game takes', 'חצי שעה': 'everyday phrase: how long a game takes',
    'cheese': 'everyday word', 'servant': 'everyday word', 'priest': 'everyday word', 'sponge': 'everyday word',
    'hammer': 'everyday word', 'easter': 'another holiday a page may name', 'newest one': 'everyday phrase',
    'to turn': 'everyday phrase', 'the whole pot': 'everyday phrase', 'the madman': 'everyday phrase',
    'dedication': 'everyday word', 'seven': 'a number', 'eight': 'a number: the eight nights',
    'hebrew months': 'everyday phrase', 'right hand': 'everyday phrase', 'hung paper menorahs': 'everyday phrase',
    'גבינה': 'everyday word', 'לסובב': 'everyday word', 'שבעה': 'a number',
    'הנר החדש': 'everyday phrase', 'את כל הקופה': 'everyday phrase', 'חודשים עבריים': 'everyday phrase',
    'אורות': 'everyday word', 'סוכות': 'another holiday a page may name', 'הפסחא': 'another holiday',
    'המשוגע': 'everyday word', 'תולעים': 'everyday word', 'ידו הימנית': 'everyday phrase',
    'טורקיה': 'a country a page may name', 'מודיעין': 'a city a page may name', 'modiin': 'a city a page may name',
    // Names the story is told by: every Hanukkah page may name them.
    'judah maccabee': 'the hero of the story; the pack asks about a playing card',
    'יהודה המכבי': 'the hero of the story; the pack asks about a playing card',
    'eight crazy nights': 'a well-known film a page may suggest for the evening',
    'jesus': 'a name a Christmas page says', 'ישו': 'a name a Christmas page says',
    'hasmoneans': 'the family of the story, named when a page tells it',
    'חשמונאי': 'the family of the story, named when a page tells it (the pack after #242 asks it)',
    'אוזני המן': 'the Purim cookie: the Purim page names it',
    'פך שמן': 'the oil story itself, which a Hanukkah page may tell',
};
// Where in the page's words the answer stands: the index of each match of its words in a row.
function placesOf(pageWords, pageForms, answer) {
    const a = words(answer);
    const wanted = a.map(w => w.length <= 3 ? shortForms(w) : forms(w));
    const out = [];
    for (let i = 0; i + a.length <= pageWords.length; i++) {
        if (wanted.every((f, k) => matchWord(pageWords[i + k], pageForms[i + k], a[k], f))) {
            out.push(i);
        }
    }
    return out;
}
// A short answer word ("אש", "שם", "44") matches only itself, after a prefix, or as its number.
function shortForms(w) {
    const out = new Set([w]);
    if (NUMBER_OF[w]) {
        out.add(NUMBER_OF[w]);
    }
    return out;
}
function matchWord(pageWord, pageForms, answerWord, wanted) {
    if (answerWord.length <= 3) {
        const bare = new Set([pageWord]);
        PREFIXES.forEach(p => pageWord.startsWith(p) && pageWord.length - p.length >= 2 && bare.add(pageWord.slice(p.length)));
        [...bare].forEach(w => NUMBER_OF[w] && bare.add(NUMBER_OF[w]));
        return shared(bare, wanted);
    }
    return same(pageForms, wanted);
}

const filled = (q) => q.questionText.replace('$blank$', ' ' + q.realAnswer + ' ');

// Every spoiler of the questions in this text: [{ id, kind, question, answer, near }].
// allow: { '<question id>': 'reason' } leaves a question out, for a page that names it on purpose.
function find(text, questions, allow) {
    allow = allow || {};
    const pageWords = words(text);
    const pageForms = pageWords.map(forms);
    const found = [];
    questions.forEach(q => {
        if (allow[q.id]) {
            return;
        }
        const near = (i, n) => pageWords.slice(Math.max(0, i - 6), i + n + 6).join(' ');
        const answerWords = words(q.realAnswer);
        const answerForms = answerWords.map(forms);
        // The question's own words: not small, not topic, not part of its answer.
        const clue = [...new Set(words(q.questionText.replace('$blank$', ' ')))].filter(counts)
            .filter(w => !answerForms.some(f => shared(forms(w), f)));
        const places = placesOf(pageWords, pageForms, q.realAnswer);
        for (const i of places) {
            const from = Math.max(0, i - WINDOW);
            const to = Math.min(pageWords.length, i + answerWords.length + WINDOW);
            const around = pageForms.slice(from, i).concat(pageForms.slice(i + answerWords.length, to));
            const hits = clue.filter(w => around.some(f => same(f, forms(w))));
            if (hits.length >= Math.min(2, clue.length) && clue.length > 0) {
                found.push({ id: q.id, kind: 'answer + context', question: q.questionText, answer: q.realAnswer,
                    near: near(i, answerWords.length), clue: hits });
                return;
            }
        }
        const rare = answerWords.length >= 2 || answerWords.join('').length >= 6;
        if (places.length && rare && !LONE_OK[words(q.realAnswer).join(' ')] && !LONE_OK[q.realAnswer.toLowerCase()]) {
            found.push({ id: q.id, kind: 'answer', question: q.questionText, answer: q.realAnswer,
                near: near(places[0], answerWords.length) });
            return;
        }
        // Four words in a row of the fact that hold its answer, each in any of its forms, with at least two
        // that count. A run without the answer only names the question, as a page's teaser may.
        const fact = words(filled(q));
        const before = words(q.questionText.split('$blank$')[0]).length;
        for (let k = Math.max(0, before - 3); k + 4 <= fact.length && k < before + answerWords.length; k++) {
            const run = fact.slice(k, k + 4);
            if (run.filter(counts).length < 2) {
                continue;
            }
            const runForms = run.map(w => w.length <= 3 ? shortForms(w) : forms(w));
            for (let i = 0; i + 4 <= pageWords.length; i++) {
                if (runForms.every((f, j) => matchWord(pageWords[i + j], pageForms[i + j], run[j], f))) {
                    found.push({ id: q.id, kind: 'fact', question: q.questionText, answer: q.realAnswer, near: near(i, 4) });
                    return;
                }
            }
        }
    });
    return found;
}

const describe = (s) => `${s.id} (${s.kind}): "${s.question}" = "${s.answer}", near "${s.near}"`;

module.exports = { pack, pageText, words, forms, find, describe, TOPIC, LONE_OK, SMALL, WINDOW };
