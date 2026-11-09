// Copies the code both apps share into one app's source folder (run from functions/ or game/):
//   node ../copy-shared.js src            (functions)
//   node ../copy-shared.js src/app        (game)
// game-model.ts and name-flag.ts are copied as they are; name-lists.json becomes name-lists.ts,
// because the game's TypeScript 2.3 cannot import JSON. Edit only the files in the repo root.
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
