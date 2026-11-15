// Adds the questions of the repository's reviewed question files to the live question bank, as
// the release's last step. The files are the list FILES below, and nothing else: today the
// Hanukkah pack (functions/data/hanukkah-questions.json, ids hanukkah-26-en-01.., -he-01..),
// the strange facts (functions/data/strange-facts-2026-11.json, ids fact-26-en-01.., -he-01..)
// and the Thanksgiving pack (functions/data/thanksgiving-questions.json, ids
// thanksgiving-26-en-01.., English only).
// It adds or rewrites exactly the questions in those files, each under its own id, and touches
// nothing else.
//
//   node .github/scripts/load-pack-questions.js <project id> [dir]
//   node .github/scripts/load-pack-questions.js --dry-run [dir]
//
// A new question file: add one entry to FILES, with the file's path and the one shape of id it
// may write, in the pull request that adds the file, so the questions and their place in the
// release are reviewed together. The list is written out on purpose. A glob over functions/data
// would load any JSON file that lands there, reviewed or not, and that folder also holds files
// that must never be in the game's bank: the daily puzzle's questions (NEVER below), which the
// puzzle reads from the functions bundle, and files that were loaded by hand long ago.
//
// Why in the release: questions reach players only once they are in questions/ in the live
// database. Until now a person had to load each file by hand
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
//      body: { "<id>": <question>, ... } for exactly the questions in the listed files.
// A PATCH is the database's "update": it writes each named child of questions/ and leaves every
// other child as it is. It is what `firebase database:update /questions <file>` sends. A PUT on
// questions/ (the tool's database:set, or the console's Import JSON) would replace the whole
// bank; this file has no PUT, POST or DELETE, and lock() refuses any request but these three.
// One update carries every file, and an update is all or nothing: a file that fails its check
// stops the whole step before anything is sent, and a refusal writes none of the files.
// Running it again sends the same values again, so it is safe on every release. A question
// whose text is changed in a file is changed live by the next release; one that is removed
// from a file stays live (retire it in retired-questions.ts, as with any question).
//
// The sign-in: requests 1 and 2 with the run's usual scope (cloud-platform); request 3 with a
// sign-in of its own with the two scopes the database's own address asks for (RULES_SCOPES of
// live-rules.js, the ones the live rules read uses). A scope gives the account no role.
// The database lets an account with a Google sign-in and the database role write anywhere,
// whatever the rules say, which is why the payload is checked here, before it is sent, and
// again by the lock: every key must be an id of one listed file, and every value a whole
// question of that file in its id's language, with that file's fields and no other.
//
// The order does no harm: pack questions never appear in normal games, and the functions
// released in step 1 of the same run already know them (DEPLOYING.md, Hanukkah pack). A question
// without a pack is a normal question, which the functions already live pick like any other.
//
// What is printed: the ids, the status of each answer, and from a JSON error the same few fields
// as firebase-refusal.js, each through scrub(). Never the database's address, a token or an
// answer's text.
const fs = require('fs');
const path = require('path');
const { scrub } = require('./firebase-refusal.js');
const { allowedApi, canonical, RULES_SCOPES } = require('./live-rules.js');

// The reviewed question files, and for each the only ids it may write. `pack` is the value every
// question of the file carries in its `pack` field; null means a question of the normal bank,
// which has no `pack` field at all (a pack name there would hide it from normal games, and a
// missing one on a pack question would put it into every game).
const FILES = [
    { file: 'functions/data/hanukkah-questions.json', name: 'the Hanukkah pack', id: /^hanukkah-26-(en|he)-\d{2}$/, like: 'hanukkah-26-en-01', pack: 'hanukkah' },
    { file: 'functions/data/strange-facts-2026-11.json', name: 'the strange facts', id: /^fact-26-(en|he)-\d{2}$/, like: 'fact-26-en-01', pack: null },
    // English only: the id rule has no Hebrew, so a Hebrew question cannot be written under it.
    { file: 'functions/data/thanksgiving-questions.json', name: 'the Thanksgiving pack', id: /^thanksgiving-26-(en)-\d{2}$/, like: 'thanksgiving-26-en-01', pack: 'thanksgiving' },
];
// Never a file of the game's bank, whatever a later edit adds to FILES: the daily puzzle reads
// its questions from the functions bundle, and a daily question in questions/ would turn up in
// games and give tomorrow's puzzle away.
const NEVER = ['functions/data/daily-questions.json'];
const PROJECT_ORIGIN = 'https://firebase.googleapis.com';
const DATABASE_HOST = /^[a-z0-9][a-z0-9-]*\.(firebaseio\.com|[a-z0-9-]+\.firebasedatabase\.app)$/;
const INSTANCE = /^[a-z0-9][a-z0-9-]{1,62}$/;
const WRITE_PATH = '/questions.json';
// The five fields of every question; a pack question has `pack` as its sixth.
const FIELDS = ['questionText', 'realAnswer', 'fakeAnswers', 'citation', 'lang'];
const MAX_QUESTIONS = 200;

// Throws unless the list itself is sound: known paths under functions/data, no file twice, none
// of NEVER, and no id that two files could both write.
function checkList(files) {
    if (!Array.isArray(files) || !files.length) {
        throw new Error('The list of question files is empty.');
    }
    const seen = new Set();
    for (const f of files) {
        if (!f || typeof f.file !== 'string' || !/^functions\/data\/[a-z0-9][a-z0-9.-]*\.json$/.test(f.file) || f.file.includes('..')) {
            throw new Error('A listed question file is not a JSON file in functions/data.');
        }
        if (NEVER.includes(f.file)) {
            throw new Error(`${f.file} is never loaded into the game's question bank.`);
        }
        if (seen.has(f.file)) {
            throw new Error(`${f.file} is listed twice.`);
        }
        seen.add(f.file);
        if (!(f.id instanceof RegExp) || !f.id.source.startsWith('^') || !f.id.source.endsWith('$') || f.id.flags ||
            typeof f.like !== 'string' || !f.id.test(f.like) || !(f.pack === null || (typeof f.pack === 'string' && f.pack))) {
            throw new Error(`${f.file}: its id rule or pack is not as expected.`);
        }
        if (files.some(o => o !== f && o.id instanceof RegExp && o.id.test(f.like))) {
            throw new Error(`${f.file}: its ids could be another file's.`);
        }
    }
}

// The questions of every listed file, checked, as one object by id. Throws a plain reason for
// a file that is missing, or for anything in a file that is not a question of that file.
// Resolves nothing halfway: one bad file and no question of any file is returned.
function payload(dir, files = FILES) {
    checkList(files);
    const all = {};
    const counts = [];
    for (const f of files) {
        let data;
        try {
            data = JSON.parse(fs.readFileSync(path.join(dir, f.file), 'utf8'));
        } catch (e) {
            throw new Error(`${f.file} could not be read as JSON.`);
        }
        try {
            check(data, [f]);
        } catch (e) {
            throw new Error(`${f.file}: ${e.message}`);
        }
        for (const id of Object.keys(data)) {
            if (Object.prototype.hasOwnProperty.call(all, id)) {
                throw new Error(`${f.file}: ${id} is in two files.`);
            }
            all[id] = data[id];
        }
        counts.push({ file: f.file, name: f.name, ids: Object.keys(data) });
    }
    return { questions: all, counts };
}

// Throws unless `data` is an object of whole questions only, each keyed by an id of one of
// `files` and shaped as that file's questions are.
function check(data, files = FILES) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new Error('The questions are not an object of questions by id.');
    }
    const ids = Object.keys(data);
    const most = MAX_QUESTIONS * files.length;
    if (!ids.length || ids.length > most) {
        throw new Error(`Expected 1 to ${most} questions, found ${ids.length}.`);
    }
    const perFile = new Map(files.map(f => [f, 0]));
    for (const id of ids) {
        const owners = files.filter(f => f.id.test(id));
        if (owners.length !== 1) {
            throw new Error(`Not an id of a listed question file: ${scrub(id).slice(0, 60)}. Only ids like ${files.map(f => f.like).join(' or ')} are written.`);
        }
        const file = owners[0];
        perFile.set(file, perFile.get(file) + 1);
        if (perFile.get(file) > MAX_QUESTIONS) {
            throw new Error(`More than ${MAX_QUESTIONS} questions with ids like ${file.like}.`);
        }
        const lang = file.id.exec(id)[1];
        const q = data[id];
        const bad = why => new Error(`Question ${id}: ${why}`);
        if (!q || typeof q !== 'object' || Array.isArray(q)) {
            throw bad('not an object.');
        }
        const fields = file.pack ? FIELDS.concat('pack') : FIELDS;
        const extra = Object.keys(q).filter(k => !fields.includes(k));
        if (extra.length) {
            throw bad((extra[0] === 'pack' ? 'a question of the normal bank has no pack field' : 'unknown field ' + scrub(extra[0]).slice(0, 40)) + '.');
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
        if (q.lang !== lang) {
            throw bad(`lang is not ${lang}, the language its id names.`);
        }
        if (file.pack && q.pack !== file.pack) {
            throw bad(`pack is not "${file.pack}".`);
        }
    }
}

// The only keys a request of this file may carry. Anything else, such as headers or params
// (an X-HTTP-Method-Override header, a query added outside the url), is refused by the lock, so
// it holds whatever a later edit adds to a request.
const WRITE_KEYS = ['url', 'method', 'data'];
const READ_KEYS = ['url', 'method'];
const onlyKeys = (options, keys) => Object.keys(options).every(k => keys.includes(k));

// The one write: a PATCH to <database address>/questions.json, no query, no other option, a
// body of the listed files' questions only.
function allowedWrite(options) {
    if (!options || typeof options !== 'object' || options.method !== 'PATCH' || typeof options.url !== 'string' ||
        !onlyKeys(options, WRITE_KEYS)) {
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

// Requests 1 and 2: a plain GET of firebase.googleapis.com (live-rules.js), with no other option.
function allowedRead(options) {
    return Boolean(options) && typeof options === 'object' && onlyKeys(options, READ_KEYS) && allowedApi(options);
}

function lock(request, may) {
    return async options => {
        if (!may(options)) {
            throw Object.assign(new Error('not sent'), { code: 'REQUEST_NOT_ALLOWED' });
        }
        return request(options);
    };
}

// What became of the update, for the run's summary (the step's output `result`):
//   written   the database answered 200 with exactly the values sent;
//   not-sent  nothing was sent: a bad file, or the project or its database address was not as
//             expected (or that question got no answer);
//   refused   the update was sent and the database refused it; an update is all or nothing, so
//             nothing was written;
//   unclear   the update was sent and got no answer, or an answer that is not what was sent: it
//             may or may not have been written.
const RESULTS = ['written', 'not-sent', 'refused', 'unclear'];

// `request` signs in with cloud-platform (requests 1 and 2), `writeRequest` with RULES_SCOPES
// (request 3). Each resolves to { status, data } for any answer.
// Resolves to { ok, result, lines }, `result` one of RESULTS.
async function load(project, dir, request, writeRequest, noAnswer) {
    const lines = [];
    const done = (ok, more, result = ok ? 'written' : 'not-sent') => ({ ok, result, lines: lines.concat(more) });
    let questions;
    let counts;
    try {
        ({ questions, counts } = payload(dir));
    } catch (e) {
        return done(false, [e.message, 'Nothing was sent, for any question file.']);
    }
    const ids = Object.keys(questions);
    const send = lock(request, allowedRead);
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
    const writeShown = `PATCH questions/ (the database's own address) with ${ids.length} questions of ${counts.length} question files`;
    const three = await ask(write, { url: address + WRITE_PATH, method: 'PATCH', data: questions }, writeShown);
    if (three.failed) {
        return done(false, three.failed.concat('The update may or may not have been written; the next release sends it again.'), 'unclear');
    }
    if (three.status !== 200) {
        return done(false, status(three, writeShown).concat('    The database refused the update. Nothing was written (an update is all or nothing).'), 'refused');
    }
    // The database answers an update with the values it wrote.
    if (canonical(three.data) !== canonical(questions)) {
        return done(false, [`200 to ${writeShown}`, '    The answer is not the values that were sent, so the run cannot tell what was written.'], 'unclear');
    }
    return done(true, [`200 to ${writeShown}`]
        .concat(counts.map(c => `    Written from ${c.file} (${c.ids.length}): ${c.ids.join(', ')}.`))
        .concat('    Nothing else under questions/ was sent.'));
}

function dryRun(dir) {
    const { questions, counts } = payload(dir);
    const ids = Object.keys(questions);
    const ok = allowedWrite({ url: 'https://made-up-instance.firebaseio.com' + WRITE_PATH, method: 'PATCH', data: questions });
    return [
        `Would send: PATCH <the database's address>${WRITE_PATH} (an update, never a set)`,
        `Question files (${counts.length}): ${counts.map(c => c.file).join(', ')}`,
        `Children of questions/ it writes (${ids.length}):`,
    ].concat(counts.map(c => `  from ${c.file}, ${c.name} (${c.ids.length}): ${c.ids.join(', ')}`)).concat([
        `Every key an id of a listed file (${FILES.map(f => f.id).join(' or ')}), every value a whole question of that file: ${ok ? 'yes' : 'NO'}`,
        'Nothing else under questions/ is in the body, so nothing else is changed or deleted.',
    ]);
}

async function main(project, dir) {
    const { googleRequest, noAnswer } = require('./check-deploy-permissions.js');
    const result = await load(project, dir, googleRequest(), googleRequest(undefined, {}, RULES_SCOPES), noAnswer);
    const out = result.lines.join('\n');
    console.log(out);
    if (!result.ok) {
        console.log('::error title=The new questions were not added::The functions, rules and site steps before this one are not affected. The reason is in this step\'s log.');
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### The new questions\n\n```\n' + out.replace(/```/g, "'''") + '\n```\n\n');
    }
    // The step's output `result`, read by the Summary step (release-summary.js). One of RESULTS
    // and nothing else, so no text of an answer reaches the output.
    if (process.env.GITHUB_OUTPUT && RESULTS.includes(result.result)) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `result=${result.result}\n`);
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
        console.log('::error title=The new questions were not added::The step failed in a way it does not know.');
        process.exit(1);
    });
}

module.exports = { FILES, NEVER, MAX_QUESTIONS, WRITE_PATH, RESULTS, checkList, payload, check, allowedWrite, allowedRead, load, dryRun, main };
