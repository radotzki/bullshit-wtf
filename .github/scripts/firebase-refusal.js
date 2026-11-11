// Shows why a Firebase command failed, without printing its debug file.
//
//   node .github/scripts/firebase-refusal.js reset [dir]   before each firebase command
//   node .github/scripts/firebase-refusal.js print [dir]   after a failed step
//   node .github/scripts/firebase-refusal.js remove [dir]  in the job's last step
//
// The Firebase tool prints one line when it fails ("Failed to get instance details ... See
// firebase-debug.log"). Google's answer, with the status and the reason, is only in
// firebase-debug.log in the working directory. That file must never be printed or uploaded
// whole: during a functions deploy it holds functions.config() values, signed upload addresses
// and request bodies.
//
// So `print` reads the file and prints a fixed, small set of things, built field by field:
//   - for each answer with an HTTP status of 400 or more: the method, the host and path (no
//     query string), the status, and from a JSON error body only error.status, error.message
//     and the reason, service and permission of error.details;
//   - the tool's own "[iam]" finding, with the permission names it lists;
//   - for a request that got no answer: the host and the error's text.
// Every printed value also goes through scrub(), which removes anything shaped like a token, a
// key or an address with a query string. Nothing else from the file is printed: no request, no
// answer with a status below 400, no body that is not a JSON error.
// scrub() knows a secret by its shape alone. A secret without one (a short password, a phrase)
// that Google quotes in an error message is printed with the message. See DEPLOYING.md.
//
// `reset` exists because of how the tool treats the file (firebase-tools 15.35, src/bin/cli.ts
// and src/logger.ts): it appends to an existing file, and it deletes the file when it exits
// with code 0 or 1, which is the code of most refused requests. `reset` empties the file, so it
// holds one command alone, and gives it a second name (a hard link). The tool's delete then
// removes only the first name, and `print` reads the second.
//
// `remove` deletes both names, so no copy of the file outlives the job's steps.
const fs = require('fs');
const path = require('path');

const LOG = 'firebase-debug.log';
const KEPT = 'firebase-debug.kept.log';
const MAX_VALUE = 300;
const MAX_REFUSALS = 20;

// An address is shown as its host, and its path only on these hosts: the APIs a deploy calls and
// the consoles Google's messages point to. Never its query string or sign-in part, and never the
// path on any other host: an upload address (storage.googleapis.com) is a host and nothing more.
const PATH_SHOWN = new Set([
    'firebasedatabase.googleapis.com', 'firebasehosting.googleapis.com', 'cloudfunctions.googleapis.com',
    'firebase.googleapis.com', 'firebaserules.googleapis.com', 'cloudresourcemanager.googleapis.com',
    'serviceusage.googleapis.com', 'iam.googleapis.com', 'runtimeconfig.googleapis.com',
    'artifactregistry.googleapis.com', 'cloudbuild.googleapis.com', 'run.googleapis.com',
    'pubsub.googleapis.com', 'cloudscheduler.googleapis.com', 'eventarc.googleapis.com',
    'console.cloud.google.com', 'console.developers.google.com', 'console.firebase.google.com',
]);

function address(raw) {
    try {
        const u = new URL(raw);
        return PATH_SHOWN.has(u.hostname) ? u.hostname + u.pathname : u.hostname;
    } catch (e) {
        return '[removed]';
    }
}

function scrub(value) {
    let s = String(value);
    s = s.replace(/-----BEGIN[\s\S]*/g, '[removed]');
    s = s.replace(/https?:\/\/[^\s"'<>)]+/g, address);
    s = s.replace(/\bya29\.[\w.-]+/g, '[removed]');
    s = s.replace(/\bAIza[\w-]{20,}/g, '[removed]');
    s = s.replace(/\beyJ[\w-]+\.[\w-]+(\.[\w-]*)?/g, '[removed]');
    s = s.replace(/\b(Bearer|Basic)\s+\S+/gi, '$1 [removed]');
    // Any long unbroken run of letters and digits: a key, a signature, a hash.
    s = s.replace(/[A-Za-z0-9+_=-]{32,}/g, '[removed]');
    s = s.replace(/[A-Za-z0-9+/_=-]{40,}/g, m => (/\d/.test(m) && /[a-z]/.test(m) && /[A-Z]/.test(m) ? '[removed]' : m));
    // One line, no control characters, and nothing GitHub would read as a workflow command.
    s = s.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/::/g, ': :').trim();
    if (s.length > MAX_VALUE) {
        s = s.slice(0, MAX_VALUE) + '...';
    }
    return s;
}

function place(rawUrl) {
    return scrub(address(rawUrl));
}

// Only these fields of a Google JSON error are ever printed.
function errorFields(bodyText) {
    let body;
    try {
        body = JSON.parse(bodyText);
    } catch (e) {
        return null;
    }
    const err = body && typeof body === 'object' ? body.error : null;
    if (!err || typeof err !== 'object') {
        return typeof err === 'string' ? [['message', scrub(err)]] : null;
    }
    const out = [];
    if (typeof err.status === 'string') {
        out.push(['status', scrub(err.status)]);
    }
    if (typeof err.message === 'string') {
        out.push(['message', scrub(err.message)]);
    }
    for (const d of Array.isArray(err.details) ? err.details : []) {
        if (!d || typeof d !== 'object') {
            continue;
        }
        if (typeof d.reason === 'string') {
            out.push(['reason', scrub(d.reason)]);
        }
        const meta = d.metadata && typeof d.metadata === 'object' ? d.metadata : {};
        for (const key of ['service', 'permission']) {
            if (typeof meta[key] === 'string') {
                out.push([key, scrub(meta[key])]);
            }
        }
    }
    return out;
}

function findRefusals(text) {
    const lines = text.split(/\r?\n/);
    const found = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const status = line.match(/<<< \[apiv2\]\[status\] (\S+) (\S+) (\d{3})\s*$/);
        if (status && Number(status[3]) >= 400) {
            const out = [`${status[3]} to ${scrub(status[1])} ${place(status[2])}`];
            const next = lines[i + 1] || '';
            const body = next.match(/<<< \[apiv2\]\[body\] (\S+) (\S+) (.*)$/);
            const fields = body && body[2] === status[2] ? errorFields(body[3]) : null;
            if (fields && fields.length) {
                for (const [k, v] of fields) {
                    out.push(`    ${k}: ${v}`);
                }
            } else {
                out.push('    (the answer carried no JSON error; its text is not shown)');
            }
            found.push(out.join('\n'));
            continue;
        }
        const iam = line.match(/\[iam\] error while checking permissions, command may fail: (.*)$/);
        if (iam) {
            const out = [`The tool's own permission check: ${scrub(iam[1])}`];
            // The missing permissions follow, one per indented line, like "  firebasehosting.sites.update".
            for (let j = i + 1; j < lines.length && j < i + 60; j++) {
                if (/^\s*$/.test(lines[j])) {
                    continue;
                }
                const perm = lines[j].match(/^\s+([a-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*){1,4})\s*$/);
                if (!perm) {
                    break;
                }
                out.push(`    missing: ${scrub(perm[1])}`);
            }
            found.push(out.join('\n'));
            continue;
        }
        const noAnswer = line.match(/\*\*\* \[apiv2\] error from fetch\(([^\s,]+),/);
        if (noAnswer) {
            const cut = line.lastIndexOf('): ');
            const why = cut === -1 ? '' : scrub(line.slice(cut + 3)).slice(0, 120);
            found.push(`No answer from ${place(noAnswer[1])}${why ? ': ' + why : ''}`);
        }
    }
    // The tool retries: show each distinct refusal once, in order.
    return [...new Set(found)];
}

function report(text) {
    const refusals = findRefusals(text);
    if (!refusals.length) {
        return 'The Firebase debug file holds no refused request (no answer with a status of 400 or more).\n' +
            'The cause is the error printed by the failed step itself.';
    }
    const shown = refusals.slice(-MAX_REFUSALS);
    const head = 'What Google answered to the failed command (filtered from the Firebase debug file; the last\n' +
        'one is usually the cause, and a 404 early on can be an ordinary lookup):';
    const more = refusals.length > shown.length ? `\n(${refusals.length - shown.length} earlier ones not shown)` : '';
    return head + '\n\n' + shown.map(r => '  ' + r).join('\n') + more;
}

function reset(dir) {
    const log = path.join(dir, LOG);
    const kept = path.join(dir, KEPT);
    fs.rmSync(kept, { force: true });
    fs.writeFileSync(log, '');
    try {
        fs.linkSync(log, kept);
    } catch (e) {
        // Without the second name, `print` still finds the file when the tool exits with code 2.
        console.log('Could not give the Firebase debug file a second name: ' + e.code);
    }
}

// Deletes both names of the debug file. A name that is not there is fine; one that cannot be
// deleted is an error, after the other has been tried.
function remove(dir) {
    let failed = null;
    for (const name of [KEPT, LOG]) {
        try {
            fs.rmSync(path.join(dir, name), { force: true });
        } catch (e) {
            failed = failed || e;
        }
    }
    if (failed) {
        throw failed;
    }
}

function read(dir) {
    for (const name of [KEPT, LOG]) {
        try {
            const text = fs.readFileSync(path.join(dir, name), 'utf8');
            if (text.trim()) {
                return text;
            }
        } catch (e) {
            // try the next name
        }
    }
    return null;
}

function print(dir) {
    const text = read(dir);
    const out = text === null
        ? 'No Firebase debug file with content: the step that failed printed its own reason (the two\n' +
            'checks before the release do), ran no Firebase command, or stopped before it made a request.'
        : report(text);
    console.log(out);
    if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### Why it failed\n\n```\n' + out.replace(/```/g, "'''") + '\n```\n');
    }
}

if (require.main === module) {
    const [mode, dir = '.'] = process.argv.slice(2);
    if (mode === 'reset') {
        reset(dir);
    } else if (mode === 'print') {
        // Never fail here: the step that failed has already failed the job.
        try {
            print(dir);
        } catch (e) {
            console.log('Could not read the Firebase debug file: ' + (e.code || e.name));
        }
    } else if (mode === 'remove') {
        try {
            remove(dir);
        } catch (e) {
            console.error('Could not remove the Firebase debug file: ' + (e.code || e.name));
            process.exit(1);
        }
    } else {
        console.error('Usage: firebase-refusal.js reset|print|remove [dir]');
        process.exit(1);
    }
}

module.exports = { scrub, errorFields, findRefusals, report, reset, read, remove, LOG, KEPT };
