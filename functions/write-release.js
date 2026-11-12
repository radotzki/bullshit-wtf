// Writes dist/release.json: the commit this build was made from, so that an error report can
// name its release (see src/report.ts). Run by `npm run build`, after tsc.
// The commit comes from GITHUB_SHA on a GitHub runner and from git anywhere else; with neither,
// the release is "unknown". Nothing here can fail a build.
const fs = require('fs');
const path = require('path');

function commit() {
    const fromRunner = process.env.GITHUB_SHA;
    if (typeof fromRunner === 'string' && /^[0-9a-f]{40}$/.test(fromRunner)) {
        return fromRunner;
    }
    try {
        const out = require('child_process')
            .execFileSync('git', ['rev-parse', 'HEAD'], { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
            .toString().trim();
        return /^[0-9a-f]{40}$/.test(out) ? out : 'unknown';
    } catch (e) {
        return 'unknown';
    }
}

try {
    fs.writeFileSync(path.join(__dirname, 'dist', 'release.json'), JSON.stringify({ release: commit() }) + '\n');
} catch (e) {
    console.warn('write-release: could not write dist/release.json (' + (e && e.code) + '); the release will read "unknown"');
}
