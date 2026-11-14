// Adds the Hanukkah pack's questions to the live question bank, as the release's last step.
// It adds or rewrites exactly the questions in functions/data/hanukkah-questions.json, each
// under its own id (hanukkah-26-en-01.., hanukkah-26-he-01..), and touches nothing else.
//
//   node .github/scripts/load-pack-questions.js <project id> [dir]
//   node .github/scripts/load-pack-questions.js --dry-run [dir]
//
// Why in the release: the pack turns on by itself on 1 December and takes its questions from
// questions/hanukkah-* in the live database. Until now a person had to load them by hand
// (`firebase database:update /questions ...`). That command cannot run in the release: the tool
// first asks the Firebase Realtime Database Management API for the database's details, and that
// API is off in the Google project (see live-rules.js). The database's own address does not need
// that API: the release already reads the live rules there with the deploy account.
//
// The requests, each sent only if the one before it gave the expected answer:
//   1. GET https://firebase.googleapis.com/v1beta1/projects/<id>
//      The Firebase project; it names the default database instance.
//   2. GET https://firebase.googleapis.com/v1beta1/projects/<id>/adminSdkConfig
//      The database's address, which must be the default instance's own.
//   3. PATCH https://<the database's address>/questions.json
//      body: { "<id>": <question>, ... } for exactly the questions in the file.
// A PATCH is the database's "update": it writes each named child of questions/ and leaves every
// other child as it is. It is what `firebase database:update /questions <file>` sends. A PUT on
// questions/ (the tool's database:set, or the console's Import JSON) would replace the whole
// bank; this file has no PUT, POST or DELETE, and lock() refuses any request but these three.
// Running it again sends the same values again, so it is safe on every release. A question
// whose text is changed in the file is changed live by the next release; one that is removed
// from the file stays live (retire it in retired-questions.ts, as with any question).
//
// The sign-in: requests 1 and 2 with the run's usual scope (cloud-platform); request 3 with a
// sign-in of its own with the two scopes the database's own address asks for (RULES_SCOPES of
// live-rules.js, the ones the live rules read uses). A scope gives the account no role.
// The database lets an account with a Google sign-in and the database role write anywhere,
// whatever the rules say, which is why the payload is checked here, before it is sent:
// every key must be a pack id, and every value a whole question of the pack in its language.
//
// Before 1 December it does no harm: pack questions never appear in normal games, and the
// functions released in step 1 of the same run already know them (DEPLOYING.md, Hanukkah pack).
//
// What is printed: the ids, the status of each answer, and from a JSON error the same few fields
// as firebase-refusal.js, each through scrub(). Never the database's address, a token or an
// answer's text.
const fs = require('fs');
const path = require('path');
const { scrub } = require('./firebase-refusal.js');
const { allowedApi, canonical, RULES_SCOPES } = require('./live-rules.js');

const PACK_FILE = 'functions/data/hanukkah-questions.json';
const PACK = 'hanukkah';
const ID = /^hanukkah-26-(en|he)-\d{2}$/;
const PROJECT_ORIGIN = 'https://firebase.googleapis.com';
const DATABASE_HOST = /^[a-z0-9][a-z0-9-]*\.(firebaseio\.com|[a-z0-9-]+\.firebasedatabase\.app)$/;
const INSTANCE = /^[a-z0-9][a-z0-9-]{1,62}$/;
const WRITE_PATH = '/questions.json';
const FIELDS = ['questionText', 'realAnswer', 'fakeAnswers', 'citation', 'lang', 'pack'];
const MAX_QUESTIONS = 200;

// The file's questions, checked. Throws a plain reason for anything that is not a pack question.
function payload(dir) {
    let data;
    try {
        data = JSON.parse(fs.readFileSync(path.join(dir, PACK_FILE), 'utf8'));
    } catch (e) {
        throw new Error(`${PACK_FILE} could not be read as JSON.`);
    }
    check(data);
    return data;
}

// Throws unless `data` is an object of pack questions only, keyed by pack ids.
function check(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('The questions are not an object of questions by id.');
    }
    const ids = Object.keys(data);
    if (!ids.length || ids.length > MAX_QUESTIONS) {
        throw new Error(`Expected 1 to ${MAX_QUESTIONS} questions, found ${ids.length}.`);
    }
    for (const id of ids) {
        const m = ID.exec(id);
        if (!m) {
            throw new Error(`Not a pack id: ${scrub(id).slice(0, 60)}. Only ids like hanukkah-26-en-01 are written.`);
        }
        const q = data[id];
        const bad = why => new Error(`Question ${id}: ${why}`);
        if (!q || typeof q !== 'object' || Array.isArray(q)) {
            throw bad('not an object.');
        }
        const extra = Object.keys(q).filter(k => !FIELDS.includes(k));
        if (extra.length) {
            throw bad('unknown field ' + scrub(extra[0]).slice(0, 40) + '.');
        }
        for (const k of ['questionText', 'realAnswer', 'citation']) {
            if (typeof q[k] !== 'string' || !q[k].trim()) {
                throw bad(`${k} is missing or empty.`);
            }
        }
        if (!q.questionText.includes('$blank$')) {
            throw bad('questionText has no $blank$.');
        }
        if (!Array.isArray(q.fakeAnswers) || q.fakeAnswers.length < 1 || q.fakeAnswers.some(a => typeof a !== 'string' || !a.trim())) {
            throw bad('fakeAnswers is not a list of answers.');
        }
        if (q.lang !== m[1]) {
            throw bad(`lang is not ${m[1]}, the language its id names.`);
        }
        if (q.pack !== PACK) {
            throw bad(`pack is not "${PACK}".`);
        }
    }
}

// The one write: a PATCH to <database address>/questions.json, no query, a body of pack
// questions only.
function allowedWrite(options) {
    if (!options || typeof options !== 'object' || options.method !== 'PATCH' || typeof options.url !== 'string') {
        return false;
    }
    let u;
    try {
        u = new URL(options.url);
    } catch (e) {
        return false;
    }
    if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash || u.search ||
        !DATABASE_HOST.test(u.hostname) || u.pathname !== WRITE_PATH) {
        return false;
    }
    try {
        check(options.data);
    } catch (e) {
        return false;
    }
    return true;
}

function lock(request, may) {
    return async options => {
        if (!may(options)) {
            throw Object.assign(new Error('not sent'), { code: 'REQUEST_NOT_ALLOWED' });
        }
        return request(options);
    };
}

// `request` signs in with cloud-platform (requests 1 and 2), `writeRequest` with RULES_SCOPES
// (request 3). Each resolves to { status, data } for any answer. Resolves to { ok, lines }.
async function load(project, dir, request, writeRequest, noAnswer) {
    const lines = [];
    const done = (ok, more) => ({ ok, lines: lines.concat(more) });
    let questions;
    try {
        questions = payload(dir);
    } catch (e) {
        return done(false, [e.message, 'Nothing was sent.']);
    }
    const ids = Object.keys(questions);
    const send = lock(request, allowedApi);
    const write = lock(writeRequest, allowedWrite);
    const ask = async (by, options, shown) => {
        try {
            const a = await by(options);
            return { status: a && Number(a.status), data: a ? a.data : null };
        } catch (e) {
            return { failed: noAnswer(shown, e) };
        }
    };
    const status = (a, shown) => {
        const out = [`${scrub(String(a.status))} to ${shown}`];
        const err = a.data && typeof a.data === 'object' ? a.data.error : null;
        if (typeof err === 'string') {
            out.push('    error: ' + scrub(err).slice(0, 200));
        } else if (err && typeof err === 'object' && typeof err.status === 'string') {
            out.push('    status: ' + scrub(err.status).slice(0, 80));
        }
        return out;
    };

    // 1. The default database instance.
    const projectShown = `GET firebase.googleapis.com/v1beta1/projects/${project}`;
    const one = await ask(send, { url: `${PROJECT_ORIGIN}/v1beta1/projects/${project}`, method: 'GET' }, projectShown);
    if (one.failed) {
        return done(false, one.failed.concat('Nothing was written.'));
    }
    const resources = one.status === 200 && one.data && typeof one.data === 'object' ? one.data.resources : null;
    const instance = resources && typeof resources === 'object' ? resources.realtimeDatabaseInstance : null;
    if (one.status !== 200 || one.data.projectId !== project || typeof instance !== 'string' || !INSTANCE.test(instance)) {
        return done(false, status(one, projectShown).concat('    The answer does not name the project\'s default database instance. Nothing was written.'));
    }

    // 2. The database's address.
    const configShown = projectShown + '/adminSdkConfig';
    const two = await ask(send, { url: `${PROJECT_ORIGIN}/v1beta1/projects/${project}/adminSdkConfig`, method: 'GET' }, configShown);
    if (two.failed) {
        return done(false, two.failed.concat('Nothing was written.'));
    }
    let address = null;
    if (two.status === 200 && two.data && typeof two.data === 'object' && two.data.projectId === project &&
        typeof two.data.databaseURL === 'string') {
        try {
            const u = new URL(two.data.databaseURL);
            const plain = u.protocol === 'https:' && !u.username && !u.password && !u.port && !u.search && !u.hash && u.pathname === '/';
            if (plain && DATABASE_HOST.test(u.hostname) && u.hostname.split('.')[0] === instance) {
                address = 'https://' + u.hostname;
            }
        } catch (e) {
            address = null;
        }
    }
    if (!address) {
        return done(false, status(two, configShown).concat('    The answer does not hold the address of the project\'s default database. Nothing was written.'));
    }

    // 3. The update.
    const writeShown = `PATCH questions/ (the database's own address) with ${ids.length} pack questions`;
    const three = await ask(write, { url: address + WRITE_PATH, method: 'PATCH', data: questions }, writeShown);
    if (three.failed) {
        return done(false, three.failed.concat('The update may or may not have been written; the next release sends it again.'));
    }
    if (three.status !== 200) {
        return done(false, status(three, writeShown).concat('    The database refused the update. Nothing was written (an update is all or nothing).'));
    }
    // The database answers an update with the values it wrote.
    if (canonical(three.data) !== canonical(questions)) {
        return done(false, [`200 to ${writeShown}`, '    The answer is not the values that were sent, so the run cannot tell what was written.']);
    }
    return done(true, [`200 to ${writeShown}`, `    Written: ${ids.join(', ')}.`, '    Nothing else under questions/ was sent.']);
}

function dryRun(dir) {
    const questions = payload(dir);
    const ids = Object.keys(questions);
    const ok = allowedWrite({ url: 'https://made-up-instance.firebaseio.com' + WRITE_PATH, method: 'PATCH', data: questions });
    return [
        `Would send: PATCH <the database's address>${WRITE_PATH} (an update, never a set)`,
        `Children of questions/ it writes (${ids.length}): ${ids.join(', ')}`,
        `Every key a pack id (${ID}), every value a whole ${PACK} question: ${ok ? 'yes' : 'NO'}`,
        'Nothing else under questions/ is in the body, so nothing else is changed or deleted.',
    ];
}

async function main(project, dir) {
    const { googleRequest, noAnswer } = require('./check-deploy-permissions.js');
    const result = await load(project, dir, googleRequest(), googleRequest(undefined, {}, RULES_SCOPES), noAnswer);
    const out = result.lines.join('\n');
    console.log(out);
    if (!result.ok) {
        console.log('::error title=The Hanukkah questions were not added::The functions, rules and site steps before this one are not affected. The reason is in this step\'s log.');
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### The Hanukkah questions\n\n```\n' + out.replace(/```/g, "'''") + '\n```\n\n');
    }
    return result.ok ? 0 : 1;
}

if (require.main === module) {
    const args = process.argv.slice(2);
    if (args[0] === '--dry-run') {
        try {
            console.log(dryRun(args[1] || '.').join('\n'));
            process.exit(0);
        } catch (e) {
            console.log(e.message);
            process.exit(1);
        }
    }
    const [project, dir = '.'] = args;
    if (!project || !/^[a-z][a-z0-9-]{4,29}$/.test(project)) {
        console.error('Usage: load-pack-questions.js <project id> [dir] | --dry-run [dir]');
        process.exit(1);
    }
    main(project, dir).then(code => process.exit(code), () => {
        console.log('::error title=The Hanukkah questions were not added::The step failed in a way it does not know.');
        process.exit(1);
    });
}

module.exports = { PACK_FILE, ID, WRITE_PATH, payload, check, allowedWrite, load, dryRun };
