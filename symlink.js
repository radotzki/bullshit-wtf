const fs = require('fs');
const path = require('path');
const shared = 'game-model.ts';
const apps = ['functions/src', 'game/src/app'];

apps.forEach(app => {
    const fileExist = fs.existsSync(path.resolve(__dirname, app, shared));

    if (!fileExist) {
        const src = path.resolve(__dirname, shared);
        const dest = path.resolve(__dirname, app, shared);
        fs.symlinkSync(src, dest);
    }
});
