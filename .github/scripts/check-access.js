// Reads the database and the site with the Firebase tool before anything is released, and
// reports on both before it fails. It releases nothing.
//
//   node .github/scripts/check-access.js <project id> [dir]
//
// Why both: on 2026-11-11 this check was two commands in one shell step, and the step stopped at
// the first, the database (its API was off). The second, the site, never ran, so one run could
// not tell whether the Hosting API was off too. Here both reads always run, each from an empty
// debug file, and the step fails afterwards if either failed. So one run names everything that
// is off.
//
// The two reads are the first calls the rules deploy and the site deploy make (see deploy.yml
// and DEPLOYING.md, "The access check"):
//   - `firebase deploy --only database --dry-run` reads the database instance and sends the rules
//     with dryRun=true: the server checks them and stores nothing;
//   - `firebase hosting:channel:list` finds the project's hosting site and reads its channels.
//
// What is printed: the tool's own output, as before (it goes straight to the log), and for each
// read that failed the filtered reading of its debug file, made by firebase-refusal.js: the
// same fields, each through its scrub(). The debug file itself is never printed. After a
// failure both names of the debug file are removed, so the later step "Show why the step
// failed" does not print one of the two a second time as if it were the whole story.
//
// Exit 0 only when both reads passed.
const fs = require('fs');
const { spawnSync } = require('child_process');
const refusal = require('./firebase-refusal.js');

const READS = [
    { what: 'the database', args: ['deploy', '--only', 'database', '--dry-run'] },
    { what: 'the site', args: ['hosting:channel:list'] },
];
// One read, in milliseconds. Each takes seconds; one that hangs must not hold the release queue.
const READ_TIMEOUT = 5 * 60 * 1000;

function command(read, project) {
    return ['firebase', ...read.args, '--project', project, '--non-interactive'];
}

// Runs `npx <args>` in `dir`, its output straight to the log. Resolves to the exit code, or to
// a word when there is none.
function npx(args, dir) {
    const out = spawnSync('npx', args, { cwd: dir, stdio: 'inherit', timeout: READ_TIMEOUT, killSignal: 'SIGKILL' });
    if (out.error && out.error.code === 'ETIMEDOUT') {
        return 'timed out';
    }
    if (out.error) {
        return 'could not start';
    }
    return out.status === null ? 'killed' : out.status;
}

// Every read runs, whatever the one before it did. `run` is given only by a test.
function readAll(project, dir, run = npx) {
    const results = [];
    for (const read of READS) {
        const args = command(read, project);
        console.log(`\n--- Reading ${read.what}: npx ${args.join(' ')}`);
        let code;
        let why = null;
        try {
            refusal.reset(dir);
            code = run(args, dir);
        } catch (e) {
            code = 'could not start';
        }
        if (code !== 0) {
            try {
                const text = refusal.read(dir);
                why = text === null
                    ? 'The command left no Firebase debug file with content: it stopped before it made a request.'
                    : refusal.report(text);
            } catch (e) {
                why = 'The Firebase debug file could not be read.';
            }
        }
        results.push({ what: read.what, shown: 'firebase ' + read.args.join(' '), ok: code === 0, code, why });
    }
    return results;
}

function report(project, results) {
    const failed = results.filter(r => !r.ok);
    const lines = results.map(r => {
        const end = typeof r.code === 'number' ? `exit code ${r.code}` : refusal.scrub(String(r.code));
        return `  ${r.what} (${r.shown}): ${r.ok ? 'reached' : 'NOT reached, ' + end}`;
    });
    if (!failed.length) {
        return `The deploy account reached the database and the site of ${project}. Nothing was released.\n\n` + lines.join('\n');
    }
    let out = `Deploy stopped, nothing released. Both reads were tried on ${project}:\n\n` + lines.join('\n');
    for (const r of failed) {
        out += `\n\nWhy ${r.what} was not reached:\n\n` + r.why.split('\n').map(l => '  ' + l).join('\n');
    }
    out += '\n\nA 403 that says an API is disabled names the API to switch on in the Google Cloud console.\n' +
        'Fix everything named here, then start a new run by hand on master. Do not re-run this one.';
    return out;
}

function main(project, dir, run) {
    const results = readAll(project, dir, run);
    const failed = results.filter(r => !r.ok);
    const out = report(project, results);
    console.log('\n' + out);
    if (failed.length) {
        console.log('::error title=Deploy stopped, nothing released: no access to ' + failed.map(r => r.what).join(' and ') +
            '::Both reads were tried. Not reached: ' + failed.map(r => r.what).join(', ') + '. The reasons are in this step\'s log and on the summary page.');
        // The reasons are printed above. Leave no debug file for the next step to print again.
        try {
            refusal.remove(dir);
        } catch (e) {
            // The job's last step removes them too, and fails if it cannot.
        }
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### Access to the database and the site\n\n```\n' + out.replace(/```/g, "'''") + '\n```\n');
    }
    return failed.length ? 1 : 0;
}

if (require.main === module) {
    const [project, dir = '.'] = process.argv.slice(2);
    if (!project || !/^[a-z][a-z0-9-]{4,29}$/.test(project)) {
        console.error('Usage: check-access.js <project id> [dir]');
        process.exit(1);
    }
    let code = 1;
    try {
        code = main(project, dir);
    } catch (e) {
        // Never print an unknown error: it could quote a request.
        console.log('::error title=Deploy stopped, nothing released::The access check failed in a way it does not know.');
    }
    process.exit(code);
}

module.exports = { READS, READ_TIMEOUT, command, readAll, report, main };
