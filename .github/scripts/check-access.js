// Reads the database and the site before anything is released, and reports on both before it
// fails. It releases nothing, and it switches nothing on in the Google project.
//
//   node .github/scripts/check-access.js <project id> [dir]
//
// Why both: on 2026-11-11 this check was two commands in one shell step, and the step stopped at
// the first, the database (its API was off). The second, the site, never ran, so one run could
// not tell whether the Hosting API was off too. Here both reads always run, and the step fails
// afterwards if either failed. So one run names everything that is off.
//
// The two reads:
//   - the database, with the Firebase tool: `firebase deploy --only database --dry-run`. It makes
//     the first calls of the rules deploy: it reads the project and the database instance, and
//     sends the rules with dryRun=true, which the server checks and does not store. The tool's
//     path for the database has no call that switches an API on (firebase-tools 15.35,
//     src/commands/deploy.ts and src/deploy/database).
//   - the site, with one plain GET through Google's library, the way the permission check asks
//     its question:
//       GET https://firebasehosting.googleapis.com/v1beta1/projects/<id>/sites?pageSize=10
//     It is the tool's own listing of the project's hosting sites (src/hosting/api.ts, listSites).
//     It passes when Google answers 200 with one site or more.
//
// The site is not read with the tool on purpose. Each of the tool's hosting commands, also the
// read-only ones (`hosting:channel:list`, `hosting:sites:list`) and the site deploy itself,
// first asks whether the Hosting API is on and, when it is off, tries to switch it on
// (src/ensureApiEnabled.ts, `ensure`). A step named "releases nothing" must not change the
// project either: switching an API on is the owner's step. A GET cannot do it. When the API is
// off, Google refuses the GET with 403 SERVICE_DISABLED, and this step says so by name.
//
// The key: this script never opens the key file. For the site read, Google's library reads the
// file named by GOOGLE_APPLICATION_CREDENTIALS and signs the request (see
// check-deploy-permissions.js, whose request this is: redirects refused, the same time-outs).
//
// What is printed: the tool's own output for the database read, as before (it goes straight to
// the log); for a failed database read the filtered reading of its debug file, made by
// firebase-refusal.js; for the site read the status of Google's answer, the number of sites,
// and from a JSON error the same few fields, each through scrub(). Never the debug file, an
// answer's text, or a site's name. After a failed database read both names of the debug file
// are removed, so the later step "Show why the step failed" does not print it a second time.
//
// One way on without the database read (live-rules.js has the whole reasoning): when the
// database read failed, four GETs ask whether that is only because the Firebase Realtime
// Database Management API is off, and whether the rules that are live equal this commit's. If
// both are so, and the site was reached, this step passes and writes `rules=unchanged` to the
// step's outputs. The workflow then skips "2. Deploy the database rules", which could only fail
// and had nothing to change, and releases the functions and the site. In every other case the
// step fails as before, and now also says what the four GETs found.
//
// Exit 0 only when both reads passed, or the site was reached and the rules are unchanged as
// above. The step's output `rules` is `deploy` when both reads passed, `unchanged` in that one
// case, and is not written when the step fails.
const fs = require('fs');
const { spawnSync } = require('child_process');
const refusal = require('./firebase-refusal.js');
const { googleRequest, noAnswer } = require('./check-deploy-permissions.js');
const { liveRules } = require('./live-rules.js');

const { scrub, errorFields } = refusal;
const DATABASE_READ = ['deploy', '--only', 'database', '--dry-run'];
const SITE_ORIGIN = 'https://firebasehosting.googleapis.com';
const SITE_API = 'firebasehosting.googleapis.com';
// The database read, in milliseconds. It takes seconds; one that hangs must not hold the queue.
const READ_TIMEOUT = 5 * 60 * 1000;

function command(project) {
    return ['firebase', ...DATABASE_READ, '--project', project, '--non-interactive'];
}

// Runs `npx <args>` in `dir`, its output straight to the log. Returns the exit code, or a word
// when there is none.
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

// `run` is given only by a test.
function readDatabase(project, dir, run = npx) {
    const args = command(project);
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
    const end = typeof code === 'number' ? `exit code ${code}` : scrub(String(code));
    return { what: 'the database', shown: 'firebase ' + DATABASE_READ.join(' '), ok: code === 0, note: code === 0 ? '' : end, why };
}

// `request` sends one request with the deploy account's sign-in and resolves to
// { status, data } for any answer; it rejects when there is none. One GET, and nothing else.
async function readSite(project, request, origin = SITE_ORIGIN) {
    const shown = `GET ${origin.replace(/^https?:\/\//, '')}/v1beta1/projects/${project}/sites`;
    const base = { what: 'the site', shown };
    let answer;
    try {
        answer = await request({ url: `${origin}/v1beta1/projects/${project}/sites?pageSize=10`, method: 'GET' });
    } catch (e) {
        return Object.assign(base, { ok: false, note: 'no answer', why: noAnswer(shown.slice(4), e).join('\n') });
    }
    const status = answer && Number(answer.status);
    const data = answer ? answer.data : null;
    if (status !== 200) {
        const lines = [`${scrub(String(status))} to ${scrub(shown)}`];
        const fields = errorFields(typeof data === 'string' ? data : JSON.stringify(data === undefined ? null : data)) || [];
        for (const [k, v] of fields) {
            lines.push(`    ${k}: ${v}`);
        }
        if (!fields.length) {
            lines.push('    (the answer carried no JSON error; its text is not shown)');
        }
        if (status >= 300 && status < 400) {
            lines.push('    (a redirect: it is not followed, and only an answer from the address that was asked counts)');
        }
        const off = fields.some(([k, v]) => (k === 'reason' && v === 'SERVICE_DISABLED') ||
            (k === 'message' && /is disabled|has not been used in project/.test(v)));
        if (off) {
            lines.push(`The Firebase Hosting API (${SITE_API}) is off in the project. This check does not switch it`);
            lines.push('on: the owner does, in the Google Cloud console (APIs and services, Library, "Firebase Hosting API").');
        }
        return Object.assign(base, { ok: false, note: `status ${scrub(String(status))}`, why: lines.join('\n') });
    }
    const sites = data && typeof data === 'object' && !Array.isArray(data) ? data.sites : null;
    if (!Array.isArray(sites) || !sites.some(s => s && typeof s === 'object' && typeof s.name === 'string')) {
        const why = sites === undefined || (Array.isArray(sites) && !sites.length)
            ? `200 to ${scrub(shown)}\n    Google lists no hosting site for the project, so the site deploy has nowhere to release to.`
            : `200 to ${scrub(shown)}\n    (the answer is not the list Google documents; its text is not shown)`;
        return Object.assign(base, { ok: false, note: 'no site listed', why });
    }
    const count = sites.length;
    return Object.assign(base, { ok: true, note: `${count} site${count === 1 ? '' : 's'}`, why: null });
}

const RULES_VERDICT = {
    unchanged: 'the Firebase Realtime Database Management API is off, and the live rules are the same as this commit\'s',
    changed: 'the live rules differ from this commit\'s',
    unknown: 'the live rules could not be read or compared',
    other: 'the database read did not fail because the Firebase Realtime Database Management API is off',
};

// `rules` is null when the database was reached, else what liveRules() found.
function report(project, results, rules = null) {
    const failed = results.filter(r => !r.ok);
    const lines = results.map(r => `  ${r.what} (${r.shown}): ${r.ok ? 'reached' : 'NOT reached'}${r.note ? ', ' + r.note : ''}`);
    if (!failed.length) {
        return `The deploy account reached the database and the site of ${project}. Nothing was released.\n\n` + lines.join('\n');
    }
    const onlyDatabase = failed.length === 1 && failed[0].what === 'the database';
    const goesOn = Boolean(onlyDatabase && rules && rules.verdict === 'unchanged');
    let out = goesOn
        ? `The run goes on WITHOUT the database rules step. Both reads were tried on ${project}:\n\n` + lines.join('\n')
        : `Deploy stopped, nothing released. Both reads were tried on ${project}:\n\n` + lines.join('\n');
    for (const r of failed) {
        out += `\n\nWhy ${r.what} was not reached:\n\n` + r.why.split('\n').map(l => '  ' + l).join('\n');
    }
    if (rules) {
        out += `\n\nThe live database rules, read without the API that is off: ${RULES_VERDICT[rules.verdict] || RULES_VERDICT.unknown}.\n\n` +
            rules.lines.map(l => '  ' + l).join('\n');
    }
    if (goesOn) {
        return out + '\n\nThe rules step would ask the API that is off, and it has nothing to change: the rules that are live\n' +
            'are already this commit\'s. So this run releases the functions and the site, and leaves the rules\n' +
            'alone. Nothing was released by this step. A commit that changes the rules still needs the owner to\n' +
            'switch the API on in the Google Cloud console (APIs and services, Library, "Firebase Realtime\n' +
            'Database Management API"); this step switches nothing on.';
    }
    if (rules && rules.verdict === 'unchanged') {
        out += '\n\nThe rules alone would not have stopped this run; the site did.';
    } else if (rules && rules.verdict === 'changed') {
        out += '\n\nSo this commit\'s rules have to be released, and that needs the API. A run never releases the\n' +
            'functions and the site without rules that differ.';
    }
    out += '\n\nA 403 that says an API is disabled names the API to switch on in the Google Cloud console. This\n' +
        'step switches nothing on. Fix everything named here, then start a new run by hand on master.\n' +
        'Do not re-run this one.';
    return out;
}

// Both reads run, whatever the first did. `run` and `request` are given only by a test.
async function main(project, dir, run, request) {
    console.log(`\n--- Reading the database: npx ${command(project).join(' ')}`);
    const database = readDatabase(project, dir, run);
    console.log('\n--- Reading the site: one GET, the list of the project\'s hosting sites');
    let ask = request;
    let site;
    try {
        ask = ask || googleRequest();
        site = await readSite(project, ask);
    } catch (e) {
        site = { what: 'the site', shown: 'GET', ok: false, note: 'not asked', why: 'The site could not be asked: ' + scrub(String((e && (e.code || e.name)) || 'error')).slice(0, 80) };
    }
    let rules = null;
    if (!database.ok) {
        console.log('\n--- The database was not reached. Reading the live rules another way: four GETs, nothing else');
        try {
            rules = await liveRules(project, dir, ask, noAnswer);
        } catch (e) {
            rules = { verdict: 'unknown', lines: ['The live rules could not be asked for: ' + scrub(String((e && (e.code || e.name)) || 'error')).slice(0, 80)] };
        }
        if (!rules || !Object.prototype.hasOwnProperty.call(RULES_VERDICT, rules.verdict) || !Array.isArray(rules.lines)) {
            rules = { verdict: 'unknown', lines: ['The reading of the live rules gave no answer this step knows.'] };
        }
    }
    const results = [database, site];
    const failed = results.filter(r => !r.ok);
    const goesOn = !database.ok && site.ok === true && rules.verdict === 'unchanged';
    const stops = failed.length > 0 && !goesOn;
    const out = report(project, results, rules);
    console.log('\n' + out);
    if (stops) {
        console.log('::error title=Deploy stopped, nothing released: no access to ' + failed.map(r => r.what).join(' and ') +
            '::Both reads were tried. Not reached: ' + failed.map(r => r.what).join(', ') + '. The reasons are in this step\'s log and on the summary page.');
    } else if (goesOn) {
        console.log('::warning title=The database rules are left alone::The Firebase Realtime Database Management API is off, and the live rules are the same as this commit\'s. The run releases the functions and the site, and skips the rules step.');
    }
    if (failed.length) {
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
    // Only a step that passes says what the rules step is to do. Without this line the workflow
    // runs the rules step, as it always did.
    if (!stops && process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `rules=${goesOn ? 'unchanged' : 'deploy'}\n`);
    }
    return stops ? 1 : 0;
}

if (require.main === module) {
    const [project, dir = '.'] = process.argv.slice(2);
    if (!project || !/^[a-z][a-z0-9-]{4,29}$/.test(project)) {
        console.error('Usage: check-access.js <project id> [dir]');
        process.exit(1);
    }
    main(project, dir).then(code => process.exit(code), () => {
        // Never print an unknown error: it could quote a request.
        console.log('::error title=Deploy stopped, nothing released::The access check failed in a way it does not know.');
        process.exit(1);
    });
}

module.exports = { DATABASE_READ, SITE_ORIGIN, READ_TIMEOUT, RULES_VERDICT, command, readDatabase, readSite, report, main };
