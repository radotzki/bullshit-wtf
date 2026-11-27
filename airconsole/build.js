#!/usr/bin/env node
// Builds the AirConsole version into airconsole/dist: screen.html and controller.html at the folder's
// root (AirConsole loads /screen.html and /controller.html), their two scripts, the stylesheet and the
// game's pictures. `--zip` also packs dist into bullshit-airconsole.zip, the file AirConsole takes.
//   cd airconsole && npm ci && node build.js [--zip]
// The scripts bundle the game's own shared code read-only (game-model.ts, the site's game strings),
// so nothing outside this folder changes, and the game's rules stay one copy.

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const esbuild = require('esbuild');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '..');
const OUT = path.join(HERE, 'dist');
const ZIP = path.join(HERE, 'bullshit-airconsole.zip');

/** name-flag.ts imports './name-lists', which copy-shared.js writes from name-lists.json: read the JSON here. */
const nameLists = {
    name: 'name-lists',
    setup(build) {
        build.onResolve({ filter: /^\.\/name-lists$/ }, () => ({ path: path.join(ROOT, 'name-lists.json'), namespace: 'name-lists' }));
        build.onLoad({ filter: /.*/, namespace: 'name-lists' }, args => ({
            contents: `export const NAME_LISTS = ${fs.readFileSync(args.path, 'utf8')};`,
            loader: 'js',
        }));
    },
};

function bundle(entry, outfile) {
    return esbuild.build({
        entryPoints: [path.join(HERE, 'src', entry)],
        outfile: path.join(OUT, outfile),
        bundle: true,
        minify: true,
        format: 'iife',
        target: ['es2020'],
        legalComments: 'eof',
        plugins: [nameLists],
        logLevel: 'warning',
    });
}

async function main() {
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(path.join(OUT, 'assets'), { recursive: true });
    await Promise.all([bundle('screen.js', 'screen.js'), bundle('controller.js', 'controller.js')]);
    ['screen.html', 'controller.html', 'style.css'].forEach(f => fs.copyFileSync(path.join(HERE, 'src', f), path.join(OUT, f)));
    // The site's own logo and the twelve seat pictures.
    const assets = path.join(ROOT, 'game', 'src', 'assets');
    fs.copyFileSync(path.join(assets, 'logo.png'), path.join(OUT, 'assets', 'logo.png'));
    for (let i = 0; i < 12; i++) {
        fs.copyFileSync(path.join(assets, `avatar${i}.png`), path.join(OUT, 'assets', `avatar${i}.png`));
    }
    const size = fs.readdirSync(OUT, { recursive: true })
        .map(f => path.join(OUT, f)).filter(f => fs.statSync(f).isFile())
        .reduce((sum, f) => sum + fs.statSync(f).size, 0);
    console.log(`airconsole/dist: ${(size / 1024).toFixed(0)} KB`);

    if (process.argv.includes('--zip')) {
        fs.rmSync(ZIP, { force: true });
        // screen.html and controller.html at the zip's root, as AirConsole asks.
        execFileSync('zip', ['-r', '-X', ZIP, '.'], { cwd: OUT, stdio: 'ignore' });
        console.log(`airconsole/${path.basename(ZIP)}: ${(fs.statSync(ZIP).size / 1024).toFixed(0)} KB`);
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});
