// Writes dist/release.json: the name of this build of the functions, so that an error report can
// name its release (see src/report.ts). Run by `npm run build`, after tsc.
//
// The name is a fingerprint of the server's code: "functions-" and the first 12 hex digits of a
// SHA-256 over every built file in dist (path and content, in a fixed order) and over
// package.json and package-lock.json. So it changes when the code that runs changes, and only
// then: two builds of the same server code, at any two commits, write the same file. That
// matters for a release. The Firebase tool sends a function only when the functions folder
// differs from what is live; a name that held the commit would differ at every commit, and
// every release would replace every function under the games that are running.
//
// The build prints the name, so a release's log says which build went out.
// Nothing here can fail a build: with no name, the release reads "unknown".
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dist = path.join(__dirname, 'dist');
const releaseFile = path.join(dist, 'release.json');

function builtFiles(folder, prefix) {
    let out = [];
    fs.readdirSync(folder, { withFileTypes: true }).forEach(entry => {
        const full = path.join(folder, entry.name);
        const name = prefix + entry.name;
        if (entry.isDirectory()) {
            out = out.concat(builtFiles(full, name + '/'));
        } else if (entry.isFile() && full !== releaseFile) {
            out.push({ name: 'dist/' + name, full });
        }
    });
    return out;
}

function fingerprint() {
    const files = builtFiles(dist, '').concat(
        ['package.json', 'package-lock.json']
            .map(name => ({ name, full: path.join(__dirname, name) }))
            .filter(file => fs.existsSync(file.full)));
    // Plain code-unit order, the same on every machine.
    files.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const hash = crypto.createHash('sha256');
    files.forEach(file => {
        const content = fs.readFileSync(file.full);
        hash.update(file.name + '\0' + content.length + '\0');
        hash.update(content);
    });
    return 'functions-' + hash.digest('hex').slice(0, 12);
}

let release = 'unknown';
try {
    release = fingerprint();
} catch (e) {
    console.warn('write-release: could not read the built files (' + (e && e.code) + '); the release will read "unknown"');
}
try {
    fs.writeFileSync(releaseFile, JSON.stringify({ release }) + '\n');
    console.log('write-release: this build of the functions is ' + release);
} catch (e) {
    console.warn('write-release: could not write dist/release.json (' + (e && e.code) + '); the release will read "unknown"');
}
