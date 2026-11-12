// Asks one question when the access check could not read the database: is that only because
// the Firebase Realtime Database Management API is off, and are the database rules that are
// live the same as this commit's? It only reads: four GETs, and nothing else.
//
// Why: the release step "2. Deploy the database rules" first asks that API for the database's
// details, and Google refuses the question while the API is off in the project. Only the
// project's owner can switch it on. But a rules deploy of rules that are already live changes
// nothing. So when the live rules equal this commit's, a run that releases the functions and
// the site and leaves the rules alone ends exactly where a whole release would: with this
// commit's functions, this commit's rules and this commit's site. That is the one case in which
// the access check lets a run go on without the database read. In every other case the run
// stops before it releases anything, as before.
//
// The four requests, each sent only if the one before it gave the expected answer:
//   1. GET https://firebase.googleapis.com/v1beta1/projects/<id>
//      The Firebase project; it names the default database instance, the one the rules step
//      would deploy to (firebase-tools 15.35, src/getDefaultDatabaseInstance.ts).
//   2. GET https://firebasedatabase.googleapis.com/v1beta/projects/<id>/locations/-/instances/<instance>
//      The request Google refuses. It must be refused the same way again: 403 with the reason
//      SERVICE_DISABLED for firebasedatabase.googleapis.com. Any other answer, also a 200, means
//      this is not the case this route is for, and the run stops.
//   3. GET https://firebase.googleapis.com/v1beta1/projects/<id>/adminSdkConfig
//      The project's configuration, which holds the database's address. The functions deploy
//      reads the same (src/functionsConfig.ts, getFirebaseConfig). The address must be the
//      default instance's own, on a database host, with no path.
//   4. GET https://<the database's address>/.settings/rules.json
//      The rules that are live. The same address the rules deploy writes to (src/rtdb.ts), read
//      and not written, and without dryRun or any other query.
// Requests 1, 3 and 4 do not need the API that is off: 1 and 3 are the Firebase Management API, and
// 4 is the database's own address. Whether Google lets the deploy account read the rules there
// is decided by Google on the run; a refusal stops the run like any other.
//
// The lock: allowed() below. Nothing is sent but a GET without a body to those two Google APIs
// or to a database address's /.settings/rules.json. No PUT, POST, PATCH or DELETE exists here,
// so this file cannot write rules or data, and cannot switch an API on.
//
// "The same" is strict: both are parsed as JSON and must be equal value for value, whatever the
// order of the keys and the spacing. Rules that cannot be parsed (the database allows comments,
// JSON does not) cannot be compared, and not knowing counts as different.
//
// What is printed: each request's method and place (for the rules, not the database's own
// address), the status of Google's answer, and from a JSON error the same few fields as
// firebase-refusal.js, each through scrub(). Never the rules, and never an answer's text.
const fs = require('fs');
const path = require('path');
const { scrub, errorFields } = require('./firebase-refusal.js');

const PROJECT_ORIGIN = 'https://firebase.googleapis.com';
const INSTANCE_ORIGIN = 'https://firebasedatabase.googleapis.com';
const DATABASE_API = 'firebasedatabase.googleapis.com';
const RULES_PATH = '/.settings/rules.json';
const READ_HOSTS = new Set([PROJECT_ORIGIN, INSTANCE_ORIGIN].map(o => new URL(o).hostname));
const DATABASE_HOST = /^[a-z0-9][a-z0-9-]*\.(firebaseio\.com|[a-z0-9-]+\.firebasedatabase\.app)$/;
const INSTANCE = /^[a-z0-9][a-z0-9-]{1,62}$/;

// The only requests this file may send.
function allowed(options) {
    if (!options || typeof options !== 'object' || typeof options.url !== 'string' || options.method !== 'GET') {
        return false;
    }
    if ('data' in options || 'body' in options) {
        return false;
    }
    let u;
    try {
        u = new URL(options.url);
    } catch (e) {
        return false;
    }
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash || u.search) {
        return false;
    }
    if (READ_HOSTS.has(u.hostname)) {
        // A colon in the path is how Google's APIs name an action, such as ":enable".
        return !u.pathname.includes(':');
    }
    return DATABASE_HOST.test(u.hostname) && u.pathname === RULES_PATH;
}

function locked(request) {
    return async options => {
        if (!allowed(options)) {
            throw Object.assign(new Error('not sent'), { code: 'REQUEST_NOT_ALLOWED_IN_A_CHECK' });
        }
        return request(options);
    };
}

// The lines to print for an answer that is not the expected one.
function answerLines(status, data, shown) {
    const lines = [`${scrub(String(status))} to ${scrub(shown)}`];
    const fields = errorFields(typeof data === 'string' ? data : JSON.stringify(data === undefined ? null : data)) || [];
    for (const [k, v] of fields) {
        lines.push(`    ${k}: ${v}`);
    }
    if (!fields.length && status !== 200) {
        lines.push('    (the answer carried no JSON error; its text is not shown)');
    }
    if (status >= 300 && status < 400) {
        lines.push('    (a redirect: it is not followed, and only an answer from the address that was asked counts)');
    }
    return lines;
}

// Whether an answer is Google's "this API is off in the project", for the database API and no
// other. Read from the answer's own fields, never from its message.
function databaseApiOff(status, data) {
    const error = data && typeof data === 'object' && !Array.isArray(data) ? data.error : null;
    if (status !== 403 || !error || typeof error !== 'object' || error.status !== 'PERMISSION_DENIED' || !Array.isArray(error.details)) {
        return false;
    }
    return error.details.some(d => d && typeof d === 'object' && d.reason === 'SERVICE_DISABLED' &&
        d.metadata && typeof d.metadata === 'object' && d.metadata.service === DATABASE_API);
}

// The one rules file firebase.json names, as text. Throws a plain reason when there is not
// exactly one, for the default database.
function rulesFile(dir) {
    let config;
    try {
        config = JSON.parse(fs.readFileSync(path.join(dir, 'firebase.json'), 'utf8'));
    } catch (e) {
        throw new Error('firebase.json could not be read as JSON.');
    }
    const database = config && config.database;
    if (!database || typeof database !== 'object' || Array.isArray(database) ||
        typeof database.rules !== 'string' || Object.keys(database).some(k => k !== 'rules')) {
        throw new Error('firebase.json does not name exactly one rules file for the default database, so there is no one file to compare.');
    }
    if (path.extname(database.rules) !== '.json' || path.isAbsolute(database.rules) || database.rules.split(/[\\/]/).includes('..')) {
        throw new Error('The rules file firebase.json names is not a .json file inside the repository.');
    }
    try {
        return fs.readFileSync(path.join(dir, database.rules), 'utf8');
    } catch (e) {
        throw new Error('The rules file firebase.json names could not be read.');
    }
}

// A value as text with every object's keys in order, so two values are equal exactly when their
// texts are. Lists keep their order.
function canonical(value) {
    if (Array.isArray(value)) {
        return '[' + value.map(canonical).join(',') + ']';
    }
    if (value && typeof value === 'object') {
        return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
    }
    return JSON.stringify(value);
}

// A rules document: an object whose "rules" is an object. Text is parsed first. Null when it is
// anything else.
function rulesDocument(value) {
    let v = value;
    if (typeof v === 'string') {
        try {
            v = JSON.parse(v);
        } catch (e) {
            return null;
        }
    }
    if (!v || typeof v !== 'object' || Array.isArray(v) || !v.rules || typeof v.rules !== 'object' || Array.isArray(v.rules)) {
        return null;
    }
    return v;
}

// 'same', 'different', or 'unknown' when either side is not a rules document.
function compareRules(fileText, live) {
    const mine = rulesDocument(fileText);
    const theirs = rulesDocument(live);
    if (!mine || !theirs) {
        return 'unknown';
    }
    return canonical(mine) === canonical(theirs) ? 'same' : 'different';
}

// `request` sends one request with the deploy account's sign-in and resolves to
// { status, data } for any answer; it rejects when there is none. `noAnswer` turns such an
// error into lines to print.
// Resolves to { verdict, lines }: 'unchanged' only when the database API is off and the live
// rules equal this commit's. Else 'changed' (they differ), 'unknown' (they could not be read or
// compared) or 'other' (the database read failed for another reason than the API being off).
async function liveRules(project, dir, request, noAnswer) {
    const send = locked(request);
    const lines = [];
    const stop = (verdict, more) => ({ verdict, lines: lines.concat(more) });
    const get = async (url, shown) => {
        try {
            const answer = await send({ url, method: 'GET' });
            return { status: answer && Number(answer.status), data: answer ? answer.data : null };
        } catch (e) {
            return { failed: noAnswer(shown.slice(4), e) };
        }
    };

    // The rules file first: without one file to compare, nothing needs to be asked.
    let fileText;
    try {
        fileText = rulesFile(dir);
    } catch (e) {
        return stop('unknown', [e.message]);
    }
    if (!rulesDocument(fileText)) {
        return stop('unknown', ['This commit\'s rules file is not plain JSON with a "rules" object, so it cannot be compared.']);
    }

    // 1. The default database instance.
    const projectPlace = `firebase.googleapis.com/v1beta1/projects/${project}`;
    const one = await get(`${PROJECT_ORIGIN}/v1beta1/projects/${project}`, 'GET ' + projectPlace);
    if (one.failed) {
        return stop('unknown', one.failed);
    }
    const resources = one.status === 200 && one.data && typeof one.data === 'object' ? one.data.resources : null;
    const instance = resources && typeof resources === 'object' ? resources.realtimeDatabaseInstance : null;
    if (one.status !== 200 || !resources || one.data.projectId !== project || typeof instance !== 'string' || !INSTANCE.test(instance)) {
        return stop('unknown', answerLines(one.status, one.data, 'GET ' + projectPlace).concat(
            '    The answer does not name the project\'s default database instance.'));
    }

    // 2. Is the database API off, and is that all?
    const instancePlace = `${DATABASE_API}/v1beta/projects/${project}/locations/-/instances/${instance}`;
    const two = await get(`${INSTANCE_ORIGIN}/v1beta/projects/${project}/locations/-/instances/${instance}`, 'GET ' + instancePlace);
    if (two.failed) {
        return stop('other', two.failed);
    }
    if (!databaseApiOff(two.status, two.data)) {
        return stop('other', answerLines(two.status, two.data, 'GET ' + instancePlace).concat(
            '    This is not Google\'s answer for "the Firebase Realtime Database Management API is off",',
            '    so the live rules were not read.'));
    }
    lines.push(`403 to GET ${scrub(instancePlace)}: the Firebase Realtime Database Management API is off (SERVICE_DISABLED).`);

    // 3. The database's address.
    const configPlace = projectPlace + '/adminSdkConfig';
    const three = await get(`${PROJECT_ORIGIN}/v1beta1/projects/${project}/adminSdkConfig`, 'GET ' + configPlace);
    if (three.failed) {
        return stop('unknown', three.failed);
    }
    let address = null;
    if (three.status === 200 && three.data && typeof three.data === 'object' && three.data.projectId === project &&
        typeof three.data.databaseURL === 'string') {
        try {
            const u = new URL(three.data.databaseURL);
            const plain = u.protocol === 'https:' && !u.username && !u.password && !u.port && !u.search && !u.hash && u.pathname === '/';
            if (plain && DATABASE_HOST.test(u.hostname) && u.hostname.split('.')[0] === instance) {
                address = 'https://' + u.hostname;
            }
        } catch (e) {
            address = null;
        }
    }
    if (!address) {
        return stop('unknown', answerLines(three.status, three.data, 'GET ' + configPlace).concat(
            '    The answer does not hold the address of the project\'s default database.'));
    }

    // 4. The live rules.
    const rulesShown = 'GET the live rules (the database\'s own address, /.settings/rules.json)';
    const four = await get(address + RULES_PATH, rulesShown);
    if (four.failed) {
        return stop('unknown', four.failed);
    }
    if (four.status !== 200) {
        return stop('unknown', answerLines(four.status, four.data, rulesShown).concat(
            '    The live rules could not be read, so the run cannot know that they are the same.'));
    }
    const verdict = compareRules(fileText, four.data);
    if (verdict === 'unknown') {
        return stop('unknown', [`200 to ${rulesShown}`, '    (the answer is not rules in plain JSON, so it cannot be compared; its text is not shown)']);
    }
    if (verdict === 'different') {
        return stop('changed', [`200 to ${rulesShown}`, '    The live rules are NOT the same as this commit\'s rules file.']);
    }
    return stop('unchanged', [`200 to ${rulesShown}`, '    The live rules are the same as this commit\'s rules file, value for value.']);
}

module.exports = { PROJECT_ORIGIN, INSTANCE_ORIGIN, RULES_PATH, allowed, locked, databaseApiOff, rulesFile, canonical, compareRules, liveRules };
