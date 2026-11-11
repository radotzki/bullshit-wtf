// Stops a deploy run whose commit is no longer what the branch holds.
// A re-run of an old "Deploy to production" run checks out that run's old commit, not today's
// master, and would put old code back on production. deploy.yml runs this before anything is
// built and again right before the first deploy step.
//   node .github/scripts/check-master-head.js <repository url> <branch> <commit of this run>
// It fetches the branch's newest commit (the repository is public, so this needs no token) and
// passes when the run's commit is that commit, or differs from it only in files that are never
// deployed (the same list as `paths-ignore` in deploy.yml: a push of those starts no run, so an
// older run must still be allowed to release). Otherwise it fails and changes nothing.
// Run it inside a checkout that holds the run's commit.
const { execFileSync } = require('child_process');

// Keep equal to `on.push.paths-ignore` in .github/workflows/deploy.yml (a test compares them).
// Only two shapes are understood: '**<ending>' and '<folder>/**'.
const NOT_DEPLOYED = ['**.md', 'docs/**', 'graphics/**'];

const notDeployed = file => NOT_DEPLOYED.some(p => {
    if (p.endsWith('/**')) { return file.startsWith(p.slice(0, -2)); }
    if (p.startsWith('**')) { return file.endsWith(p.slice(2)); }
    throw new Error('pattern not understood: ' + p);
});

const git = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function check(url, branch, sha) {
    const ref = 'refs/deploy-guard/' + branch;
    let head;
    try {
        git(['fetch', '--quiet', '--no-tags', '--depth=1', url, '+refs/heads/' + branch + ':' + ref]);
        head = git(['rev-parse', '--verify', ref + '^{commit}']).trim();
    } catch (e) {
        return { ok: false, message: 'Could not read the newest commit of ' + branch + ' from ' + url +
            ', so this run cannot tell whether its code is current. Nothing was deployed.' };
    }
    if (head === sha) {
        return { ok: true, message: 'This run\'s commit ' + sha.slice(0, 7) + ' is the head of ' + branch + '.' };
    }
    let changed;
    try {
        changed = git(['diff', '--name-only', '-z', sha, head]).split('\0').filter(Boolean);
    } catch (e) {
        return { ok: false, message: 'Could not compare this run\'s commit ' + sha.slice(0, 7) + ' with the head of ' +
            branch + ' (' + head.slice(0, 7) + '). Nothing was deployed.' };
    }
    const deployed = changed.filter(f => !notDeployed(f));
    if (deployed.length === 0) {
        return { ok: true, message: 'The head of ' + branch + ' is ' + head.slice(0, 7) + ', but it differs from this run\'s commit ' +
            sha.slice(0, 7) + ' only in files that are never deployed. Releasing this commit releases the same code.' };
    }
    const shown = deployed.slice(0, 5).join(', ') + (deployed.length > 5 ? ' and ' + (deployed.length - 5) + ' more' : '');
    return { ok: false, message: 'This run would release ' + sha.slice(0, 7) + ', but ' + branch + ' is now at ' + head.slice(0, 7) +
        ' and differs in deployed files (' + shown + '). Nothing was deployed. ' +
        'An old run releases its own old commit, so it is stopped here. To release ' + branch +
        ' as it is now, start a new run by hand: Actions > Deploy to production > Run workflow > branch ' + branch + '.' };
}

if (require.main === module) {
    const [, , url, branch, sha] = process.argv;
    if (!url || !branch || !/^[0-9a-f]{40}$/.test(sha || '')) {
        console.log('::error title=Deploy stopped::usage: check-master-head.js <repository url> <branch> <full commit sha>');
        process.exit(1);
    }
    const result = check(url, branch, sha);
    if (!result.ok) {
        console.log('::error title=Deploy stopped, nothing released::' + result.message);
        process.exit(1);
    }
    console.log(result.message);
}

module.exports = { NOT_DEPLOYED, notDeployed, check };
