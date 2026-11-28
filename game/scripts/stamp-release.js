// Writes the release (the commit) into the built dist/index.html as
// <meta name="bs-release" content="<commit>">, so that Sentry's errors name the change that was live
// (src/app/sentry/release.ts reads it). Run after `ng build` and before build-he.js, which copies
// index.html, so the Hebrew page carries it too (see the "build" script in package.json).
//
// The commit is GITHUB_SHA on a GitHub run (the deploy), else `git rev-parse HEAD`. It is written
// into the page and not into the code, so the bundle's files stay the same between two commits with
// the same site code, and only index.html changes, as it does at every release anyway.
// Nothing here can fail a build: with no commit, the page carries no tag and Sentry no release.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const COMMIT = /^[0-9a-f]{40}$/;

function commit(env) {
    if (COMMIT.test(env.GITHUB_SHA || '')) {
        return env.GITHUB_SHA;
    }
    try {
        const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
            .toString().trim();
        return COMMIT.test(head) ? head : undefined;
    } catch (e) {
        return undefined;
    }
}

/** The page with the release tag after <meta charset>, replacing any tag already there. */
function stamp(html, release) {
    const clean = html.replace(/\n?[ \t]*<meta name="bs-release"[^>]*>/g, '');
    if (!release) {
        return clean;
    }
    const tag = `<meta name="bs-release" content="${release}">`;
    const charset = /<meta charset="[^"]*">/i;
    return charset.test(clean) ? clean.replace(charset, m => `${m}\n  ${tag}`) : clean.replace(/<head>/i, m => `${m}\n  ${tag}`);
}

module.exports = { commit, stamp };

if (require.main === module) {
    const dist = path.resolve(process.argv[2] || path.join(__dirname, '..', 'dist'));
    const file = path.join(dist, 'index.html');
    try {
        const release = commit(process.env);
        fs.writeFileSync(file, stamp(fs.readFileSync(file, 'utf8'), release));
        console.log(release ? 'stamp-release: this build of the site is ' + release :
            'stamp-release: no commit found; Sentry will show no release');
    } catch (e) {
        console.warn('stamp-release: could not stamp dist/index.html (' + (e && e.code) + '); Sentry will show no release');
    }
}
