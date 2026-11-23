// Bundles one of the AirConsole sources (ES modules that import the game's TypeScript) into a
// CommonJS file the tests can require, with the same esbuild set-up as build.js.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const esbuild = require('esbuild');

const ROOT = path.resolve(__dirname, '..', '..');
const nameLists = {
    name: 'name-lists',
    setup(build) {
        build.onResolve({ filter: /^\.\/name-lists$/ }, () => ({ path: path.join(ROOT, 'name-lists.json'), namespace: 'name-lists' }));
        build.onLoad({ filter: /.*/, namespace: 'name-lists' }, args => ({
            contents: `export const NAME_LISTS = ${fs.readFileSync(args.path, 'utf8')};`, loader: 'js',
        }));
    },
};

/** Resolves to `source` (a path under airconsole/), bundled with what it imports, as a required module. */
async function load(source) {
    const file = path.join(__dirname, '..', source);
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bs-airconsole-test-')), 'bundle.js');
    await esbuild.build({
        entryPoints: [file], outfile: out, bundle: true, format: 'cjs', platform: 'node', plugins: [nameLists], logLevel: 'error',
    });
    return require(out);
}

module.exports = { load, ROOT };
