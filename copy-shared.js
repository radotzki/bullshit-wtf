// Copies the code both apps share into one app's source folder (run from functions/ or game/):
//   node ../copy-shared.js src            (functions)
//   node ../copy-shared.js src/app        (game)
// game-model.ts and name-flag.ts are copied as they are; name-lists.json becomes name-lists.ts,
// because the game's TypeScript 2.3 cannot import JSON. Edit only the files in the repo root.
// For the game only, it also writes daily-launch.ts: the daily puzzle's first day in each language,
// the earliest `day` in functions/data/daily-questions.json, so the home's puzzle line
// (pages/landing/daily-line.ts) shows from the same date as the puzzle, and none of the
// questions or answers reach the game's bundle.
const fs = require('fs');
const path = require('path');

const dest = process.argv[2];
if (!dest) {
    throw new Error('usage: node ../copy-shared.js <dest folder>');
}
['game-model.ts', 'name-flag.ts'].forEach(f => fs.copyFileSync(path.join(__dirname, f), path.join(dest, f)));
const lists = JSON.parse(fs.readFileSync(path.join(__dirname, 'name-lists.json'), 'utf8'));
fs.writeFileSync(path.join(dest, 'name-lists.ts'),
    '// Made by copy-shared.js from name-lists.json in the repo root. Do not edit.\n// tslint:disable\n' +
    'export const NAME_LISTS = ' + JSON.stringify(lists, null, 1) + ';\n');

if (path.resolve(dest).startsWith(path.join(__dirname, 'game') + path.sep)) {
    const questions = JSON.parse(fs.readFileSync(path.join(__dirname, 'functions', 'data', 'daily-questions.json'), 'utf8'));
    const first = { en: null, he: null };
    Object.keys(questions).forEach(id => {
        const q = questions[id];
        if (q && (q.lang === 'en' || q.lang === 'he') && /^\d{4}-\d{2}-\d{2}$/.test(q.day)
            && (first[q.lang] === null || q.day < first[q.lang])) {
            first[q.lang] = q.day;
        }
    });
    fs.writeFileSync(path.join(dest, 'daily-launch.ts'),
        '// Made by copy-shared.js from functions/data/daily-questions.json. Do not edit.\n' +
        '// The daily puzzle\'s first day in each language (null: no question yet).\n' +
        'export const DAILY_FIRST_DAY: { en: string | null; he: string | null } = ' + JSON.stringify(first) + ';\n');
}
