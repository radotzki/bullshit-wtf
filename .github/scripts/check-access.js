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
// No command of the Firebase tool runs here. Every request is a plain one, sent through Google's
// library the way the permission check asks its question (see check-deploy-permissions.js, whose
// request this is: redirects refused, the same time-outs). There are four, in this order:
//
//   the database, the three requests the tool's rules deploy starts with (firebase-tools 15.35,
//   src/requireDatabaseInstance.ts, src/management/database.ts, src/rtdb.ts):
//     1. GET https://firebase.googleapis.com/v1beta1/projects/<id>
//        the Firebase project; its answer names the default database instance.
//     2. GET https://firebasedatabase.googleapis.com/v1beta/projects/<id>/locations/-/instances/<instance>
//        the instance's details; its answer holds the database's address. This is the request
//        Google refused in the runs of 2026-11-11, with the database API off.
//     3. PUT https://<the database's address>/.settings/rules.json?dryRun=true
//        the rules file, for the server to check. With dryRun=true it stores nothing. So a
//        mistake in the rules stops the run here, not after the functions went out.
//   A request is sent only if the one before it passed: each needs the other's answer.
//
//   the site:
//     4. GET https://firebasehosting.googleapis.com/v1beta1/projects/<id>/sites?pageSize=10
//        the tool's own listing of the project's hosting sites (src/hosting/api.ts, listSites).
//        It passes when Google answers 200 with one site or more.
//
// Why not the tool. Until November 2026 the database was read with `firebase deploy --only
// database --dry-run`. It sends the same three requests, but when Google answers 404 to the
// first, the tool asks the Cloud Resource Manager API instead, and before that it asks whether
// that API is on and, when it is off, tries to switch it on (src/management/projects.ts,
// getFirebaseProject and getProject; src/ensureApiEnabled.ts, bestEffortEnsure). The QA tester
// made the tool send that request to a made-up Google. Each of the tool's hosting commands, also
// the read-only ones (`hosting:channel:list`, `hosting:sites:list`), does the like for the
// Hosting API. A step named "releases nothing" must not change the project either: switching an
// API on is the owner's step. Here a 404, like every answer that is not a clean yes, ends the
// read, and nothing else is asked.
//
// The lock: allowed() below. main() sends nothing but a GET to one of three Google APIs, or the
// PUT of the rules with dryRun=true to a database address. Any other request is refused in this
// script, before it is sent. The release steps "2. Deploy the database rules" and "3. Deploy the
// site" still use the tool; they only run after this check has seen every one of these answered.
//
// The key: this script never opens the key file. Google's library reads the file named by
// GOOGLE_APPLICATION_CREDENTIALS and signs each request.
//
// What is printed: for each request that failed, its method and address (for the rules, not the
// database's own address), the status of Google's answer, and from a JSON error the same few
// fields as firebase-refusal.js, each through scrub(); for the site the number of sites. Never
// an answer's text, a site's name, or the rules. No Firebase debug file is made here.
//
// Exit 0 only when both reads passed.
const fs = require('fs');
const path = require('path');
const { scrub, errorFields } = require('./firebase-refusal.js');
const { googleRequest, noAnswer } = require('./check-deploy-permissions.js');

const PROJECT_ORIGIN = 'https://firebase.googleapis.com';
const INSTANCE_ORIGIN = 'https://firebasedatabase.googleapis.com';
const SITE_ORIGIN = 'https://firebasehosting.googleapis.com';
const RULES_PATH = '/.settings/rules.json?dryRun=true';
const DATABASE_SHOWN = 'GET the Firebase project, GET the database instance, PUT the rules with dryRun=true';
// What each read needs: the API that must be on, and the permission, with roles that hold it.
const NEEDS = {
    project: { api: 'firebase.googleapis.com', title: 'Firebase Management API', permission: 'firebase.projects.get', roles: 'Firebase Viewer and Firebase Admin' },
    instance: { api: 'firebasedatabase.googleapis.com', title: 'Firebase Realtime Database Management API', permission: 'firebasedatabase.instances.get', roles: 'Firebase Realtime Database Admin and Firebase Admin' },
    site: { api: 'firebasehosting.googleapis.com', title: 'Firebase Hosting API', permission: 'firebasehosting.sites.list', roles: 'Firebase Hosting Admin and Firebase Admin' },
};
const READ_HOSTS = new Set([PROJECT_ORIGIN, INSTANCE_ORIGIN, SITE_ORIGIN].map(o => new URL(o).hostname));
const DATABASE_HOST = /^[a-z0-9][a-z0-9-]*\.(firebaseio\.com|[a-z0-9-]+\.firebasedatabase\.app)$/;
const INSTANCE = /^[a-z0-9][a-z0-9-]{1,62}$/;

// The only requests this check may send: a GET without a body to one of the three Google APIs
// above, or the PUT of the rules, with dryRun=true and nothing else in its query, to a database
// address. Nothing that creates, deletes or switches on, and no other host.
function allowed(options) {
    if (!options || typeof options !== 'object' || typeof options.url !== 'string') {
        return false;
    }
    let u;
    try {
        u = new URL(options.url);
    } catch (e) {
        return false;
    }
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash) {
        return false;
    }
    if (options.method === 'GET') {
        // A colon in the path is how Google's APIs name an action, such as ":enable".
        return READ_HOSTS.has(u.hostname) && !('data' in options) && !('body' in options) && !u.pathname.includes(':');
    }
    return options.method === 'PUT' && DATABASE_HOST.test(u.hostname) && u.pathname + u.search === RULES_PATH;
}

function locked(request) {
    return async options => {
        if (!allowed(options)) {
            throw Object.assign(new Error('not sent'), { code: 'REQUEST_NOT_ALLOWED_IN_A_CHECK' });
        }
        return request(options);
    };
}

// Sends one request and reads the answer. Resolves to { ok: true, data } for a 200, else to
// { ok: false, status, note, why } with the lines to print. `needs` is one of NEEDS, or null.
async function ask(request, options, shown, needs) {
    let answer;
    try {
        answer = await request(options);
    } catch (e) {
        return { ok: false, note: 'no answer', why: noAnswer(shown.replace(/^[A-Z]+ /, ''), e).join('\n') };
    }
    const status = answer && Number(answer.status);
    const data = answer ? answer.data : null;
    if (status === 200) {
        return { ok: true, data };
    }
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
    if (off && needs) {
        lines.push(`The ${needs.title} (${needs.api}) is off in the project.`);
        lines.push('This check does not switch it on: the owner does, in the Google Cloud console (APIs and services,');
        lines.push(`Library, "${needs.title}").`);
    } else if (status === 403 && needs) {
        lines.push('Google refused the read and did not say that an API is off. Most likely the deploy account lacks');
        lines.push(`the permission ${needs.permission}. The roles ${needs.roles} hold it`);
        lines.push('(Google Cloud console, IAM). This check grants nothing.');
    }
    return { ok: false, status, note: `status ${scrub(String(status))}`, why: lines.join('\n') };
}

// The one rules file firebase.json names, as text. Throws a plain reason when there is not
// exactly one.
function rulesFile(dir) {
    let config;
    try {
        config = JSON.parse(fs.readFileSync(path.join(dir, 'firebase.json'), 'utf8'));
    } catch (e) {
        throw new Error('firebase.json could not be read.');
    }
    const database = config && typeof config === 'object' ? config.database : null;
    const name = database && typeof database === 'object' && !Array.isArray(database) ? database.rules : null;
    if (typeof name !== 'string' || !/^[\w-][\w.-]*\.json$/.test(name)) {
        throw new Error('firebase.json does not name one rules file for one database ("database": {"rules": "<file>.json"}).\nThis check knows no other form, so it cannot say that the rules deploy would pass.');
    }
    let text;
    try {
        text = fs.readFileSync(path.join(dir, name), 'utf8');
    } catch (e) {
        throw new Error('The rules file that firebase.json names could not be read.');
    }
    if (!text.trim()) {
        throw new Error('The rules file that firebase.json names is empty.');
    }
    return text;
}

// The database's address from the instance's details, or null. Only https, only the instance's
// own name on one of Google's two database domains, and nothing but the origin.
function databaseOrigin(data, instance) {
    const raw = data && typeof data === 'object' && !Array.isArray(data) ? data.databaseUrl : null;
    if (typeof raw !== 'string') {
        return null;
    }
    let u;
    try {
        u = new URL(raw);
    } catch (e) {
        return null;
    }
    const plain = u.protocol === 'https:' && !u.username && !u.password && !u.port && !u.search && !u.hash && u.pathname === '/';
    if (!plain || !DATABASE_HOST.test(u.hostname) || u.hostname.split('.')[0] !== instance) {
        return null;
    }
    return 'https://' + u.hostname;
}

// The three requests the rules deploy starts with, each only after the one before it passed.
// Nothing is tried to mend a failed one. `origins` is given only by a test.
async function readDatabase(project, dir, request, origins = {}) {
    const base = { what: 'the database', shown: DATABASE_SHOWN };
    const fail = (step, r) => Object.assign(base, { ok: false, note: `${step}: ${r.note}`, why: r.why });
    let rules;
    try {
        rules = rulesFile(dir);
    } catch (e) {
        return Object.assign(base, { ok: false, note: 'not asked', why: e.message });
    }

    const projectOrigin = origins.project || PROJECT_ORIGIN;
    const projectShown = `GET ${projectOrigin.replace(/^https?:\/\//, '')}/v1beta1/projects/${project}`;
    const first = await ask(request, { url: `${projectOrigin}/v1beta1/projects/${project}`, method: 'GET' }, projectShown, NEEDS.project);
    if (!first.ok) {
        if (first.status === 404) {
            first.why += '\nGoogle knows no Firebase project by this id, or the deploy account may not see it. Nothing else is\n' +
                'asked: the Firebase tool would turn to the Cloud Resource Manager API here, and could switch it on.';
        }
        return fail('the Firebase project', first);
    }
    const resources = first.data && typeof first.data === 'object' && !Array.isArray(first.data) ? first.data.resources : null;
    const instance = resources && typeof resources === 'object' ? resources.realtimeDatabaseInstance : null;
    if (typeof instance !== 'string' || !INSTANCE.test(instance)) {
        return fail('the Firebase project', {
            note: 'no database named',
            why: `200 to ${scrub(projectShown)}\n    The answer names no default database instance for the project, so the rules have nowhere to go.`,
        });
    }

    const instanceOrigin = origins.instance || INSTANCE_ORIGIN;
    const instancePath = `/v1beta/projects/${project}/locations/-/instances/${instance}`;
    const instanceShown = `GET ${instanceOrigin.replace(/^https?:\/\//, '')}${instancePath}`;
    const second = await ask(request, { url: instanceOrigin + instancePath, method: 'GET' }, instanceShown, NEEDS.instance);
    if (!second.ok) {
        return fail('the database instance', second);
    }
    const address = origins.rules || databaseOrigin(second.data, instance);
    if (!address) {
        return fail('the database instance', {
            note: 'no address',
            why: `200 to ${scrub(instanceShown)}\n    The answer holds no database address this check knows (https, the instance's own name, on\n` +
                '    firebaseio.com or firebasedatabase.app); its text is not shown. The rules are sent nowhere else.',
        });
    }

    const rulesShown = 'PUT <the database\'s address>/.settings/rules.json?dryRun=true';
    const third = await ask(request, {
        url: address + RULES_PATH,
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        data: rules,
    }, rulesShown, null);
    if (!third.ok) {
        if (third.status === 400) {
            third.why += '\nThe database checked the rules file and refused it: see the message above. Nothing was stored.';
        } else if (third.status === 401 || third.status === 403) {
            third.why += '\nThe database did not let the deploy account send rules. The permission that covers it is\n' +
                'firebasedatabase.instances.update; the roles Firebase Realtime Database Admin and Firebase Admin hold it.';
        }
        return fail('the rules', third);
    }
    // A 200 from the database's own address is the yes. Its text is not judged: the tool does not
    // judge it either, and it counts every status below 400.
    return Object.assign(base, { ok: true, note: 'the rules were checked and not stored', why: null });
}

// `request` sends one request with the deploy account's sign-in and resolves to
// { status, data } for any answer; it rejects when there is none. One GET, and nothing else.
async function readSite(project, request, origin = SITE_ORIGIN) {
    const shown = `GET ${origin.replace(/^https?:\/\//, '')}/v1beta1/projects/${project}/sites`;
    const base = { what: 'the site', shown };
    const answer = await ask(request, { url: `${origin}/v1beta1/projects/${project}/sites?pageSize=10`, method: 'GET' }, shown, NEEDS.site);
    if (!answer.ok) {
        return Object.assign(base, { ok: false, note: answer.note, why: answer.why });
    }
    const data = answer.data;
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

function report(project, results) {
    const failed = results.filter(r => !r.ok);
    const lines = results.map(r => `  ${r.what} (${r.shown}): ${r.ok ? 'reached' : 'NOT reached'}${r.note ? ', ' + r.note : ''}`);
    if (!failed.length) {
        return `The deploy account reached the database and the site of ${project}. Nothing was released.\n\n` + lines.join('\n');
    }
    let out = `Deploy stopped, nothing released. Both reads were tried on ${project}:\n\n` + lines.join('\n');
    for (const r of failed) {
        out += `\n\nWhy ${r.what} was not reached:\n\n` + r.why.split('\n').map(l => '  ' + l).join('\n');
    }
    out += '\n\nThis step switches nothing on and grants nothing: an API that is off and a permission that is\n' +
        'missing are the owner\'s to change, in the Google Cloud console. Fix everything named here, then\n' +
        'start a new run by hand on master. Do not re-run this one.';
    return out;
}

// Both reads run, whatever the first did. `request` and `origins` are given only by a test; they
// too go through the lock.
async function main(project, dir, request, origins = {}) {
    const send = locked(request || googleRequest());
    const unasked = (what, shown) => e => ({
        what,
        shown,
        ok: false,
        note: 'not asked',
        why: `${what[0].toUpperCase()}${what.slice(1)} could not be asked: ` + scrub(String((e && (e.code || e.name)) || 'error')).slice(0, 80),
    });
    console.log('\n--- Reading the database: the Firebase project, the database instance, then the rules with dryRun=true');
    const database = await readDatabase(project, dir, send, origins).catch(unasked('the database', DATABASE_SHOWN));
    console.log('--- Reading the site: one GET, the list of the project\'s hosting sites');
    const site = await readSite(project, send, origins.site).catch(unasked('the site', 'GET'));
    const results = [database, site];
    const failed = results.filter(r => !r.ok);
    const out = report(project, results);
    console.log('\n' + out);
    if (failed.length) {
        console.log('::error title=Deploy stopped, nothing released: no access to ' + failed.map(r => r.what).join(' and ') +
            '::Both reads were tried. Not reached: ' + failed.map(r => r.what).join(', ') + '. The reasons are in this step\'s log and on the summary page.');
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
    main(project, dir).then(code => process.exit(code), () => {
        // Never print an unknown error: it could quote a request.
        console.log('::error title=Deploy stopped, nothing released::The access check failed in a way it does not know.');
        process.exit(1);
    });
}

module.exports = {
    PROJECT_ORIGIN, INSTANCE_ORIGIN, SITE_ORIGIN, RULES_PATH, DATABASE_SHOWN, NEEDS,
    allowed, locked, rulesFile, databaseOrigin, readDatabase, readSite, report, main,
};
