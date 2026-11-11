// node --test .github/scripts/*.test.js
// Made-up answers only: no Firebase tool runs here, no request leaves this machine, and every
// token is invented.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'check-access.js');
const ROOT = path.join(__dirname, '..', '..');
const {
    PROJECT_ORIGIN, INSTANCE_ORIGIN, SITE_ORIGIN, RULES_PATH, NEEDS,
    allowed, locked, rulesFile, databaseOrigin, readDatabase, readSite, report, main,
} = require('./check-access.js');
const { googleRequest, noAnswer, ASK_TIMEOUT } = require('./check-deploy-permissions.js');

const PROJECT = 'made-up-project';
const TOKEN = 'ya29.c.MadeUpAccessToken-0123456789_abcdefghijklmnop';
const RULES = '{\n    // a comment, as the rules file may hold\n    "rules": { ".read": false, ".write": false }\n}\n';
const SITES = { sites: [{ name: 'projects/made-up-project/sites/made-up-site', defaultUrl: 'https://made-up-site.web.app', type: 'DEFAULT_SITE' }] };
const FIREBASE_PROJECT = { projectId: PROJECT, projectNumber: '1054623883511', resources: { realtimeDatabaseInstance: 'made-up-db', hostingSite: 'made-up-site' } };
const INSTANCE_DETAILS = { name: 'projects/1054623883511/locations/us-central1/instances/made-up-db', databaseUrl: 'https://made-up-db.firebaseio.com', type: 'DEFAULT_DATABASE', state: 'ACTIVE' };
const off = (title, service) => ({
    status: 403,
    data: {
        error: {
            code: 403,
            status: 'PERMISSION_DENIED',
            message: `${title} has not been used in project 1054623883511 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/${service}/overview?project=1054623883511 then retry. Token ${TOKEN}`,
            details: [{ reason: 'SERVICE_DISABLED', metadata: { service, consumer: 'projects/1054623883511' } }],
        },
    },
});
const HOSTING_OFF = off('Firebase Hosting API', 'firebasehosting.googleapis.com');
const DATABASE_OFF = off('Firebase Realtime Database Management API', 'firebasedatabase.googleapis.com');
const DENIED = { status: 403, data: { error: { code: 403, status: 'PERMISSION_DENIED', message: 'The caller does not have permission' } } };
const NOT_FOUND = { status: 404, data: { error: { code: 404, status: 'NOT_FOUND', message: 'Requested entity was not found.' } } };

const URLS = {
    project: 'https://firebase.googleapis.com/v1beta1/projects/made-up-project',
    instance: 'https://firebasedatabase.googleapis.com/v1beta/projects/made-up-project/locations/-/instances/made-up-db',
    rules: 'https://made-up-db.firebaseio.com/.settings/rules.json?dryRun=true',
    site: 'https://firebasehosting.googleapis.com/v1beta1/projects/made-up-project/sites?pageSize=10',
};
const CLEAN = {
    project: { status: 200, data: FIREBASE_PROJECT },
    instance: { status: 200, data: INSTANCE_DETAILS },
    rules: { status: 200, data: { status: 'ok' } },
    site: { status: 200, data: SITES },
};
const WHOLE = [
    { url: URLS.project, method: 'GET' },
    { url: URLS.instance, method: 'GET' },
    { url: URLS.rules, method: 'PUT', headers: { 'content-type': 'application/json' }, data: RULES },
    { url: URLS.site, method: 'GET' },
];

const tmp = t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-access-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
};
// A checkout with the two files the database read needs.
const checkout = (t, rules = RULES, config = { database: { rules: 'database-rules.json' } }) => {
    const dir = tmp(t);
    fs.writeFileSync(path.join(dir, 'firebase.json'), typeof config === 'string' ? config : JSON.stringify(config));
    if (rules !== null) {
        fs.writeFileSync(path.join(dir, 'database-rules.json'), rules);
    }
    return dir;
};
// A made-up Google: clean answers, but for the addresses named in `other`. It remembers what it
// was asked. An answer that is an Error is thrown.
const google = (other = {}, seen = []) => async options => {
    seen.push(options);
    const which = Object.keys(URLS).find(k => URLS[k] === options.url);
    const answer = which in other ? other[which] : CLEAN[which];
    if (answer instanceof Error) {
        throw answer;
    }
    return answer;
};
const answering = (answer, seen = []) => async options => {
    seen.push(options);
    if (answer instanceof Error) {
        throw answer;
    }
    return answer;
};
const quiet = t => {
    const lines = [];
    t.mock.method(console, 'log', (...a) => lines.push(a.join(' ')));
    return lines;
};
// Answers that are not a clean yes, for any address.
const quoted = `Bad token ${TOKEN} with Bearer ${TOKEN}`;
const NOT_A_YES = [
    DATABASE_OFF,
    DENIED,
    NOT_FOUND,
    { status: 401, data: { error: { status: 'UNAUTHENTICATED', message: quoted } } },
    { status: 429, data: { error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } } },
    { status: 500, data: `<html>${quoted}</html>` },
    { status: 301, data: CLEAN },
    { status: 302, data: undefined },
    { status: 307, data: SITES },
    { status: 201, data: SITES },
    { status: 204, data: undefined },
    { status: 206, data: SITES },
    { status: TOKEN, data: SITES },
    undefined,
    new Error(quoted),
    Object.assign(new Error(quoted), { code: TOKEN }),
    new Error('network timeout at: https://firebasedatabase.googleapis.com/'),
    Object.assign(new Error('x'), { code: 'ECONNRESET' }),
    Object.assign(new Error('x'), { response: { status: 400, data: { error: 'invalid_grant', error_description: quoted } } }),
];

test('no command of the Firebase tool runs in the check, and nothing in it can switch an API on', () => {
    const code = fs.readFileSync(SCRIPT, 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(code, /child_process|spawn|exec\(|npx|firebase-tools/);
    assert.doesNotMatch(code, /hosting:|--force|:enable|serviceusage|cloudresourcemanager/);
    // Two methods and no other: GET, and the PUT of the rules.
    assert.deepStrictEqual([...new Set(code.match(/'(GET|PUT|POST|PATCH|DELETE)'/g))].sort(), ["'GET'", "'PUT'"]);
    assert.strictEqual(RULES_PATH, '/.settings/rules.json?dryRun=true');
    assert.deepStrictEqual([PROJECT_ORIGIN, INSTANCE_ORIGIN, SITE_ORIGIN],
        ['https://firebase.googleapis.com', 'https://firebasedatabase.googleapis.com', 'https://firebasehosting.googleapis.com']);
});

test('the lock: only a GET to the three APIs, or the PUT of the rules with dryRun=true, may be sent', async () => {
    for (const ok of WHOLE) {
        assert.strictEqual(allowed(ok), true, ok.url);
    }
    assert.strictEqual(allowed({ url: 'https://made-up-db.europe-west1.firebasedatabase.app/.settings/rules.json?dryRun=true', method: 'PUT', data: RULES }), true);
    const enable = 'https://serviceusage.googleapis.com/v1/projects/made-up-project/services/cloudresourcemanager.googleapis.com:enable';
    const refused = [
        // What the Firebase tool sent in the QA tester's run, and the questions around it.
        { url: enable, method: 'POST' },
        { url: enable, method: 'GET' },
        { url: 'https://serviceusage.googleapis.com/v1/projects/made-up-project/services/cloudresourcemanager.googleapis.com', method: 'GET' },
        { url: 'https://cloudresourcemanager.googleapis.com/v1/projects/made-up-project', method: 'GET' },
        { url: 'https://firebasehosting.googleapis.com/v1beta1/projects/made-up-project/sites/x:enable', method: 'GET' },
        // Anything that writes to Google's APIs.
        { url: URLS.project, method: 'POST' },
        { url: URLS.project, method: 'PATCH' },
        { url: URLS.instance, method: 'DELETE' },
        { url: URLS.instance, method: 'PUT', data: '{}' },
        { url: URLS.site, method: 'POST', data: {} },
        { url: URLS.site, method: 'GET', data: {} },
        { url: URLS.site, method: 'GET', body: '' },
        { url: URLS.site },
        { url: URLS.site, method: 'get' },
        // The rules without the dry run, or anything else on the database.
        { url: 'https://made-up-db.firebaseio.com/.settings/rules.json', method: 'PUT', data: RULES },
        { url: 'https://made-up-db.firebaseio.com/.settings/rules.json?dryRun=false', method: 'PUT', data: RULES },
        { url: 'https://made-up-db.firebaseio.com/.settings/rules.json?dryRun=true&x=1', method: 'PUT', data: RULES },
        { url: 'https://made-up-db.firebaseio.com/.settings/rules.json?x=1&dryRun=true', method: 'PUT', data: RULES },
        { url: 'https://made-up-db.firebaseio.com/.settings/rules.json?dryRun=true#x', method: 'PUT', data: RULES },
        { url: 'https://made-up-db.firebaseio.com/games.json?dryRun=true', method: 'PUT', data: '{}' },
        { url: 'https://made-up-db.firebaseio.com/.json', method: 'DELETE' },
        { url: 'https://made-up-db.firebaseio.com/.json', method: 'GET' },
        { url: URLS.rules, method: 'POST', data: RULES },
        { url: URLS.rules, method: 'PATCH', data: RULES },
        // Another host, or an address that only looks like Google's.
        { url: 'https://elsewhere.example/.settings/rules.json?dryRun=true', method: 'PUT', data: RULES },
        { url: 'https://made-up-db.firebaseio.com.elsewhere.example/.settings/rules.json?dryRun=true', method: 'PUT', data: RULES },
        { url: 'https://firebaseio.com/.settings/rules.json?dryRun=true', method: 'PUT', data: RULES },
        { url: 'https://firebase.googleapis.com.elsewhere.example/v1beta1/projects/made-up-project', method: 'GET' },
        { url: 'https://elsewhere.example/v1beta1/projects/made-up-project', method: 'GET' },
        { url: 'http://firebase.googleapis.com/v1beta1/projects/made-up-project', method: 'GET' },
        { url: 'https://firebase.googleapis.com:8443/v1beta1/projects/made-up-project', method: 'GET' },
        { url: 'https://user:pass@firebase.googleapis.com/v1beta1/projects/made-up-project', method: 'GET' },
        { url: 'https://firebase.googleapis.com@elsewhere.example/v1beta1/projects/made-up-project', method: 'GET' },
        { url: 'not an address', method: 'GET' },
        { method: 'GET' },
        null,
        undefined,
        'https://firebase.googleapis.com/',
    ];
    for (const no of refused) {
        assert.strictEqual(allowed(no), false, JSON.stringify(no));
        // And through the lock it never reaches the sender.
        const sent = [];
        await assert.rejects(locked(answering({ status: 200, data: {} }, sent))(no), { code: 'REQUEST_NOT_ALLOWED_IN_A_CHECK' });
        assert.deepStrictEqual(sent, []);
    }
});

test('main sends through the lock: a request to any other address is refused before it is sent', async t => {
    const out = quiet(t);
    const dir = checkout(t);
    const elsewhere = 'https://elsewhere.example';
    for (const [origins, sent] of [
        [{ project: elsewhere }, [URLS.site]],
        [{ instance: elsewhere }, [URLS.project, URLS.site]],
        [{ rules: elsewhere }, [URLS.project, URLS.instance, URLS.site]],
        [{ rules: 'https://made-up-db.firebaseio.com/x' }, [URLS.project, URLS.instance, URLS.site]],
        [{ site: elsewhere }, [URLS.project, URLS.instance, URLS.rules]],
        [{ project: elsewhere, site: 'http://firebasehosting.googleapis.com' }, []],
    ]) {
        const seen = [];
        assert.strictEqual(await main(PROJECT, dir, google({}, seen), origins), 1);
        assert.deepStrictEqual(seen.map(o => o.url), sent);
    }
    assert.match(out.join('\n'), /No answer from elsewhere\.example[^\n]*: REQUEST_NOT_ALLOWED_IN_A_CHECK/);
});

test('the whole check is four requests: three for the database, then one GET for the site', async t => {
    const out = quiet(t);
    const seen = [];
    assert.strictEqual(await main(PROJECT, checkout(t), google({}, seen)), 0);
    assert.deepStrictEqual(seen, WHOLE);
    const text = out.join('\n');
    assert.match(text, /reached the database and the site of made-up-project\. Nothing was released\./);
    assert.match(text, /the database \(GET the Firebase project, GET the database instance, PUT the rules with dryRun=true\): reached, the rules were checked and not stored/);
    assert.match(text, /the site \(GET firebasehosting\.googleapis\.com\/v1beta1\/projects\/made-up-project\/sites\): reached, 1 site/);
    assert.doesNotMatch(text, /Deploy stopped|::error/);
    // Neither the rules nor the database's or the site's name is printed.
    assert.doesNotMatch(text, /made-up-db|made-up-site|a comment/);
    // Through the permission check's own request: redirects refused, no retry, the same time-out.
    // The client here is made up and remembers what it is given.
    const given = [];
    const auth = { getClient: async () => ({ request: async options => { given.push(options); return (await google()(options)); } }) };
    assert.strictEqual(await main(PROJECT, checkout(t), googleRequest(auth)), 0);
    assert.deepStrictEqual(given.map(o => [o.method, o.url]), WHOLE.map(o => [o.method, o.url]));
    for (const o of given) {
        assert.strictEqual(o.redirect, 'manual');
        assert.strictEqual(o.maxRedirects, 0);
        assert.strictEqual(o.retry, false);
        assert.strictEqual(o.timeout, ASK_TIMEOUT);
        assert.strictEqual('data' in o, o.method === 'PUT');
    }
    assert.strictEqual(given[2].data, RULES);
});

test('whatever Google answers, the check sends nothing but its four requests, and only a clean yes passes', async t => {
    quiet(t);
    const dir = checkout(t);
    const steps = ['project', 'instance', 'rules', 'site'];
    let runs = 0;
    for (const step of steps) {
        for (const answer of NOT_A_YES) {
            const seen = [];
            const code = await main(PROJECT, dir, google({ [step]: answer }, seen));
            assert.strictEqual(code, 1, step + ' ' + JSON.stringify(answer));
            // A failed database request ends the database read: the ones after it are not sent,
            // nothing is asked in their place, and the site is still read, once.
            const expected = step === 'site' ? WHOLE : [...WHOLE.slice(0, steps.indexOf(step) + 1), WHOLE[3]];
            assert.deepStrictEqual(seen, expected, step + ' ' + JSON.stringify(answer));
            assert.ok(seen.every(allowed));
            runs++;
        }
    }
    assert.strictEqual(runs, 4 * NOT_A_YES.length);
    // Two at once: one run still asks the site.
    const seen = [];
    assert.strictEqual(await main(PROJECT, dir, google({ project: NOT_FOUND, site: HOSTING_OFF }, seen)), 1);
    assert.deepStrictEqual(seen, [WHOLE[0], WHOLE[3]]);
});

test('a 404 for the Firebase project ends the database read: nothing is asked in its place', async t => {
    const seen = [];
    const database = await readDatabase(PROJECT, checkout(t), google({ project: NOT_FOUND }, seen));
    assert.strictEqual(database.ok, false);
    assert.deepStrictEqual(seen, [WHOLE[0]]);
    const text = report(PROJECT, [database]);
    assert.match(text, /the database \([^)]+\): NOT reached, the Firebase project: status 404/);
    assert.match(text, /404 to GET firebase\.googleapis\.com\/v1beta1\/projects\/made-up-project/);
    assert.match(text, /Nothing else is\n\s+asked: the Firebase tool would turn to the Cloud Resource Manager API here, and could switch it on\./);
});

test('an API that is off is named, with who switches it on', async t => {
    const dir = checkout(t);
    const database = await readDatabase(PROJECT, dir, google({ instance: DATABASE_OFF }));
    const text = report(PROJECT, [database, { what: 'the site', shown: 'x', ok: true, note: '' }]);
    assert.match(text, /NOT reached, the database instance: status 403/);
    assert.match(text, /403 to GET firebasedatabase\.googleapis\.com\/v1beta\/projects\/made-up-project\/locations\/-\/instances\/made-up-db/);
    assert.match(text, /reason: SERVICE_DISABLED/);
    assert.match(text, /service: firebasedatabase\.googleapis\.com/);
    assert.match(text, /The Firebase Realtime Database Management API \(firebasedatabase\.googleapis\.com\) is off in the project\.\n\s+This check does not switch it on: the owner does/);
    assert.doesNotMatch(text, /Most likely the deploy account lacks/);
    const project = await readDatabase(PROJECT, dir, google({ project: off('Firebase Management API', 'firebase.googleapis.com') }));
    assert.match(project.why, /The Firebase Management API \(firebase\.googleapis\.com\) is off in the project/);
    const site = await readSite(PROJECT, answering(HOSTING_OFF));
    const siteText = report(PROJECT, [{ what: 'the database', shown: 'x', ok: true, note: '' }, site]);
    assert.match(siteText, /the site \(GET firebasehosting\.googleapis\.com\/v1beta1\/projects\/made-up-project\/sites\): NOT reached, status 403/);
    assert.match(siteText, /The Firebase Hosting API \(firebasehosting\.googleapis\.com\) is off in the project\.\n\s+This check does not switch it on/);
    for (const shown of [text, project.why, siteText]) {
        assert.doesNotMatch(shown, /\?project=/);
        assert.ok(!shown.includes('MadeUpAccessToken'));
    }
});

test('a 403 that is not a disabled API names the permission to read and roles that hold it', async t => {
    const named = { status: 403, data: { error: { status: 'PERMISSION_DENIED', message: 'Permission denied on resource', details: [{ reason: 'IAM_PERMISSION_DENIED', metadata: { permission: 'firebasehosting.sites.list' } }] } } };
    for (const answer of [DENIED, named]) {
        const site = await readSite(PROJECT, answering(answer));
        assert.strictEqual(site.ok, false);
        assert.doesNotMatch(site.why, /is off in the project/);
        assert.match(site.why, /did not say that an API is off/);
        assert.match(site.why, /the permission firebasehosting\.sites\.list\. The roles Firebase Hosting Admin and Firebase Admin hold it/);
        assert.match(site.why, /This check grants nothing/);
    }
    const dir = checkout(t);
    const instance = await readDatabase(PROJECT, dir, google({ instance: DENIED }));
    assert.match(instance.why, /the permission firebasedatabase\.instances\.get\. The roles Firebase Realtime Database Admin and Firebase Admin hold it/);
    const project = await readDatabase(PROJECT, dir, google({ project: DENIED }));
    assert.match(project.why, /the permission firebase\.projects\.get\./);
    // Only a 403 gets the hint.
    for (const answer of [NOT_FOUND, { status: 401, data: DENIED.data }, { status: 500, data: DENIED.data }, HOSTING_OFF]) {
        assert.doesNotMatch((await readSite(PROJECT, answering(answer))).why, /Most likely the deploy account lacks/);
    }
    assert.deepStrictEqual(Object.keys(NEEDS), ['project', 'instance', 'site']);
    // The report's last lines no longer speak of a disabled API alone.
    const text = report(PROJECT, [await readSite(PROJECT, answering(DENIED))]);
    assert.match(text, /This step switches nothing on and grants nothing/);
});

test('the rules go only to the database address Google names for the instance, and are refused in plain words', async t => {
    const dir = checkout(t);
    assert.strictEqual(databaseOrigin(INSTANCE_DETAILS, 'made-up-db'), 'https://made-up-db.firebaseio.com');
    assert.strictEqual(databaseOrigin({ databaseUrl: 'https://made-up-db.europe-west1.firebasedatabase.app/' }, 'made-up-db'), 'https://made-up-db.europe-west1.firebasedatabase.app');
    const bad = [
        'http://made-up-db.firebaseio.com',
        'https://other-db.firebaseio.com',
        'https://made-up-db.firebaseio.com.elsewhere.example',
        'https://elsewhere.example/made-up-db.firebaseio.com',
        'https://made-up-db.firebaseio.com/path',
        'https://made-up-db.firebaseio.com/?ns=other',
        'https://made-up-db.firebaseio.com:8443',
        'https://user:pass@made-up-db.firebaseio.com',
        'https://made-up-db@elsewhere.example',
        'https://firebaseio.com',
        'made-up-db.firebaseio.com',
        '',
        7,
        null,
        undefined,
    ];
    for (const databaseUrl of bad) {
        assert.strictEqual(databaseOrigin({ databaseUrl }, 'made-up-db'), null, String(databaseUrl));
        const seen = [];
        const database = await readDatabase(PROJECT, dir, google({ instance: { status: 200, data: { databaseUrl } } }, seen));
        assert.strictEqual(database.ok, false);
        assert.strictEqual(database.note, 'the database instance: no address');
        assert.match(database.why, /The rules are sent nowhere else/);
        assert.deepStrictEqual(seen, WHOLE.slice(0, 2));
        assert.ok(!database.why.includes('elsewhere'));
    }
    for (const data of [null, 'text', [], [INSTANCE_DETAILS]]) {
        assert.strictEqual(databaseOrigin(data, 'made-up-db'), null);
    }
    // A project that names no database, or a name that is not one.
    for (const data of [{}, null, 'x', [], { resources: {} }, { resources: { realtimeDatabaseInstance: '' } }, { resources: { realtimeDatabaseInstance: 'a/b' } }, { resources: { realtimeDatabaseInstance: '../x' } }, { resources: { realtimeDatabaseInstance: 7 } }]) {
        const seen = [];
        const database = await readDatabase(PROJECT, dir, google({ project: { status: 200, data } }, seen));
        assert.strictEqual(database.ok, false, JSON.stringify(data));
        assert.strictEqual(database.note, 'the Firebase project: no database named');
        assert.deepStrictEqual(seen, [WHOLE[0]]);
    }
    // The database's own answers to the rules.
    const syntax = await readDatabase(PROJECT, dir, google({ rules: { status: 400, data: { error: `Parse error at line 3. ${quoted}` } } }));
    assert.strictEqual(syntax.note, 'the rules: status 400');
    assert.match(syntax.why, /400 to PUT <the database's address>\/\.settings\/rules\.json\?dryRun=true/);
    assert.match(syntax.why, /message: Parse error at line 3\./);
    assert.match(syntax.why, /checked the rules file and refused it/);
    assert.ok(!syntax.why.includes('MadeUpAccessToken'));
    // A 200 from the database is the yes, whatever its text: the tool does not judge it either.
    for (const data of [{ status: 'ok' }, {}, '', undefined]) {
        assert.strictEqual((await readDatabase(PROJECT, dir, google({ rules: { status: 200, data } }))).ok, true);
    }
    for (const status of [401, 403]) {
        const denied = await readDatabase(PROJECT, dir, google({ rules: { status, data: { error: 'Permission denied' } } }));
        assert.match(denied.why, /did not let the deploy account send rules[\s\S]*firebasedatabase\.instances\.update/);
    }
});

test('the rules file is the one firebase.json names, sent as it is; any other form stops before a request', async t => {
    assert.strictEqual(rulesFile(checkout(t)), RULES);
    // This repository's own files have the form the check knows.
    const shipped = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
    assert.deepStrictEqual(shipped.database, { rules: 'database-rules.json' });
    assert.strictEqual(rulesFile(ROOT), fs.readFileSync(path.join(ROOT, 'database-rules.json'), 'utf8'));
    const cases = [
        [RULES, '{ not json', /firebase\.json could not be read/],
        [RULES, {}, /does not name one rules file/],
        [RULES, { database: [{ target: 'a', rules: 'database-rules.json' }] }, /does not name one rules file/],
        [RULES, { database: { rules: '../elsewhere.json' } }, /does not name one rules file/],
        [RULES, { database: { rules: 'rules.bolt' } }, /does not name one rules file/],
        [RULES, { database: { rules: 'other.json' } }, /could not be read/],
        [null, { database: { rules: 'database-rules.json' } }, /could not be read/],
        ['  \n', { database: { rules: 'database-rules.json' } }, /is empty/],
    ];
    quiet(t);
    for (const [rules, config, why] of cases) {
        const dir = checkout(t, rules, config);
        assert.throws(() => rulesFile(dir), why);
        const seen = [];
        const database = await readDatabase(PROJECT, dir, google({}, seen));
        assert.strictEqual(database.ok, false);
        assert.strictEqual(database.note, 'not asked');
        assert.deepStrictEqual(seen, []);
        // The site is still read, and the run stops.
        assert.strictEqual(await main(PROJECT, dir, google({}, seen)), 1);
        assert.deepStrictEqual(seen, [WHOLE[3]]);
    }
});

test('any answer about the site that is not a list with a site stops the run, and shows nothing secret', async () => {
    const answers = [
        ...NOT_A_YES,
        { status: 200, data: null },
        { status: 200, data: 'ok' },
        { status: 200, data: [] },
        { status: 200, data: {} },
        { status: 200, data: { sites: [] } },
        { status: 200, data: { sites: 'all' } },
        { status: 200, data: { sites: [TOKEN, null, 7] } },
    ];
    for (const answer of answers) {
        const seen = [];
        const site = await readSite(PROJECT, answering(answer, seen));
        assert.strictEqual(site.ok, false, JSON.stringify(answer));
        // A failed read asks no second question: nothing is tried to mend it.
        assert.deepStrictEqual(seen, [{ url: URLS.site, method: 'GET' }]);
        const text = report(PROJECT, [site]);
        assert.match(text, /Deploy stopped, nothing released/);
        assert.ok(!text.includes('MadeUpAccessToken'), text);
        assert.doesNotMatch(text, /<html>/);
    }
    assert.match((await readSite(PROJECT, answering({ status: 200, data: {} }))).why, /lists no hosting site/);
    assert.match((await readSite(PROJECT, answering({ status: 307, data: SITES }))).why, /a redirect: it is not followed/);
    assert.match((await readSite(PROJECT, answering(new Error('network timeout at: x')))).why, /: timed out/);
    // A site's name and address are not printed, only the count.
    const ok = await readSite(PROJECT, answering({ status: 200, data: SITES }));
    assert.strictEqual(ok.note, '1 site');
    assert.doesNotMatch(report(PROJECT, [ok]), /made-up-site/);
});

test('the database read fails: the site read still runs, both are reported, and the run stops', async t => {
    const out = quiet(t);
    const seen = [];
    assert.strictEqual(await main(PROJECT, checkout(t), google({ instance: DATABASE_OFF }, seen)), 1);
    assert.deepStrictEqual(seen.map(o => o.url), [URLS.project, URLS.instance, URLS.site]);
    const text = out.join('\n');
    assert.match(text, /Deploy stopped, nothing released\. Both reads were tried/);
    assert.match(text, /the database \([^)]+\): NOT reached, the database instance: status 403/);
    assert.match(text, /the site \(GET [^)]+\): reached, 1 site/);
    assert.match(text, /Why the database was not reached:/);
    assert.match(text, /service: firebasedatabase\.googleapis\.com/);
    assert.doesNotMatch(text, /Why the site was not reached/);
    assert.match(text, /^::error title=Deploy stopped, nothing released: no access to the database::/m);
    // A time-out says so.
    const late = await readDatabase(PROJECT, checkout(t), google({ instance: Object.assign(new Error('timed out'), { code: 'CHECK_TIMED_OUT', seconds: 60 }) }));
    assert.match(report(PROJECT, [late]), /NOT reached, the database instance: no answer/);
    assert.match(late.why, /No answer from firebasedatabase\.googleapis\.com\/[^\n]*: timed out after 60 seconds/);
});

test('the site read fails alone: the run stops and names the site', async t => {
    const out = quiet(t);
    assert.strictEqual(await main(PROJECT, checkout(t), google({ site: HOSTING_OFF })), 1);
    const text = out.join('\n');
    assert.match(text, /the database \([^)]+\): reached/);
    assert.match(text, /the site \(GET [^)]+\): NOT reached, status 403/);
    assert.match(text, /service: firebasehosting\.googleapis\.com/);
    assert.doesNotMatch(text, /Why the database was not reached/);
    assert.match(text, /^::error title=Deploy stopped, nothing released: no access to the site::/m);
});

test('both reads fail: one run names both, each with its own reason', async t => {
    const out = quiet(t);
    const dir = checkout(t);
    const summary = path.join(dir, 'summary.md');
    process.env.GITHUB_STEP_SUMMARY = summary;
    t.after(() => { delete process.env.GITHUB_STEP_SUMMARY; });
    assert.strictEqual(await main(PROJECT, dir, google({ instance: DATABASE_OFF, site: HOSTING_OFF })), 1);
    const text = out.join('\n');
    const why = text.slice(text.indexOf('Why the database was not reached:'));
    const database = why.slice(0, why.indexOf('Why the site was not reached:'));
    const site = why.slice(why.indexOf('Why the site was not reached:'));
    assert.match(database, /service: firebasedatabase\.googleapis\.com/);
    assert.doesNotMatch(database, /firebasehosting/);
    assert.match(site, /service: firebasehosting\.googleapis\.com/);
    assert.doesNotMatch(site, /firebasedatabase/);
    assert.match(text, /no access to the database and the site::/);
    // The same text is on the run's summary page.
    const page = fs.readFileSync(summary, 'utf8');
    assert.match(page, /### Access to the database and the site/);
    assert.match(page, /service: firebasedatabase\.googleapis\.com/);
    assert.match(page, /service: firebasehosting\.googleapis\.com/);
    // The check leaves no file behind.
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), ['database-rules.json', 'firebase.json', 'summary.md']);
    for (const shown of [text, page]) {
        assert.ok(!shown.includes('MadeUpAccessToken'), shown);
        assert.doesNotMatch(shown, /authorization|Bearer ya29/);
    }
});

test('a sender that breaks counts as failed, shows nothing of its error, and the other read still runs', async t => {
    quiet(t);
    const dir = checkout(t);
    const seen = [];
    const moved = { status: 200, data: FIREBASE_PROJECT };
    const odd = async options => {
        seen.push(options.url);
        if (options.url === URLS.project) {
            return moved;
        }
        throw new Error(TOKEN);
    };
    assert.strictEqual(await main(PROJECT, dir, odd), 1);
    assert.deepStrictEqual(seen, [URLS.project, URLS.instance, URLS.site]);
    const thrown = await readDatabase(PROJECT, dir, () => { throw new Error(TOKEN); });
    assert.strictEqual(thrown.ok, false);
    assert.ok(!report(PROJECT, [thrown]).includes('MadeUpAccessToken'));
});

// The script itself, whole, with a made-up `npx` first on the PATH, and no sign-in: the key file
// it is pointed to does not exist, so nobody is asked.
test('as the workflow runs it without a key file: both reads are reported, the reason is plain, and no tool runs', t => {
    const dir = tmp(t);
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    const ran = path.join(dir, 'ran.txt');
    fs.writeFileSync(path.join(bin, 'npx'), `#!/usr/bin/env node\nrequire("fs").appendFileSync(${JSON.stringify(ran)}, process.argv.slice(2).join(" ") + "\\n");\n`, { mode: 0o755 });
    const work = path.join(dir, 'work');
    fs.mkdirSync(work);
    fs.writeFileSync(path.join(work, 'firebase.json'), JSON.stringify({ database: { rules: 'database-rules.json' } }));
    fs.writeFileSync(path.join(work, 'database-rules.json'), RULES);
    const base = Object.assign({}, process.env, { PATH: bin + path.delimiter + process.env.PATH });
    delete base.GITHUB_STEP_SUMMARY;
    delete base.GOOGLE_APPLICATION_CREDENTIALS;
    for (const env of [base, Object.assign({}, base, { GOOGLE_APPLICATION_CREDENTIALS: path.join(dir, 'no-such-key.json') })]) {
        const started = Date.now();
        const out = spawnSync('node', [SCRIPT, PROJECT, work], { env, encoding: 'utf8', timeout: 90000 });
        assert.strictEqual(out.status, 1, out.stdout + out.stderr);
        // Nobody was asked, so it is over at once: no sign-in was looked for on the network.
        assert.ok(Date.now() - started < 20000);
        assert.match(out.stdout, /the database \([^)]+\): NOT reached, the Firebase project: no answer/);
        assert.match(out.stdout, /the site \(GET firebasehosting\.googleapis\.com\/v1beta1\/projects\/made-up-project\/sites\): NOT reached, no answer/);
        assert.match(out.stdout, /Why the database was not reached:[\s\S]*there is no key file to sign in with[\s\S]*Why the site was not reached:[\s\S]*there is no key file to sign in with/);
        assert.doesNotMatch(out.stdout, /: Error\b/);
        assert.match(out.stdout, /^::error title=Deploy stopped, nothing released: no access to the database and the site::/m);
        assert.doesNotMatch(out.stdout + out.stderr, /no-such-key|\n\s+at /);
        assert.deepStrictEqual(fs.readdirSync(work).sort(), ['database-rules.json', 'firebase.json']);
        assert.ok(!fs.existsSync(ran), 'the check ran npx');
    }
    const bad = spawnSync('node', [SCRIPT, 'Not A Project'], { env: base, encoding: 'utf8' });
    assert.strictEqual(bad.status, 1);
    assert.match(bad.stderr, /Usage/);
    assert.deepStrictEqual(noAnswer('x.example/y', Object.assign(new Error('no key file'), { code: 'NO_KEY_FILE' }))[0],
        'No answer from x.example/y: it was not asked, because there is no key file to sign in with');
});

// Both reads through Google's real library, to a server on this machine. It needs the library,
// which only `npm ci` at the repository's root installs: the Tests workflow installs nothing for
// these scripts, so there this test is skipped.
let library = null;
try {
    library = require('google-auth-library');
} catch (e) {
    // not installed
}
test('through Google\'s library: the reads send only their own requests and follow no redirect', { skip: !library && 'google-auth-library is not installed' }, async t => {
    const saved = {};
    for (const name of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']) {
        saved[name] = process.env[name];
        delete process.env[name];
    }
    t.after(() => Object.keys(saved).forEach(n => saved[n] === undefined || (process.env[n] = saved[n])));
    let mode = 'yes';
    let seen = [];
    const paths = {
        project: '/v1beta1/projects/made-up-project',
        instance: '/v1beta/projects/made-up-project/locations/-/instances/made-up-db',
        rules: '/.settings/rules.json?dryRun=true',
        site: '/v1beta1/projects/made-up-project/sites?pageSize=10',
    };
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', d => { body += d; });
        req.on('end', () => {
            seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
            res.setHeader('content-type', 'application/json');
            const which = Object.keys(paths).find(k => paths[k] === req.url);
            if (mode === 'redirect:' + which) {
                res.statusCode = 307;
                res.setHeader('location', '/elsewhere');
                res.end();
            } else if (mode === 'off:' + which) {
                res.statusCode = 403;
                res.end(JSON.stringify((which === 'site' ? HOSTING_OFF : DATABASE_OFF).data));
            } else if (mode === '404:' + which || !which) {
                res.statusCode = 404;
                res.end(JSON.stringify(NOT_FOUND.data));
            } else {
                res.end(JSON.stringify(CLEAN[which].data));
            }
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    const origin = 'http://127.0.0.1:' + server.address().port;
    const origins = { project: origin, instance: origin, rules: origin };
    const client = new library.OAuth2Client();
    client.setCredentials({ access_token: TOKEN });
    const request = googleRequest({ getClient: async () => client });
    const dir = checkout(t);
    const auth = 'Bearer ' + TOKEN;
    const sent = {
        project: { method: 'GET', url: paths.project, auth, body: '' },
        instance: { method: 'GET', url: paths.instance, auth, body: '' },
        // The rules file goes out as it is, comment and all.
        rules: { method: 'PUT', url: paths.rules, auth, body: RULES },
        site: { method: 'GET', url: paths.site, auth, body: '' },
    };
    const run = async m => {
        mode = m;
        seen = [];
        const results = [await readDatabase(PROJECT, dir, request, origins), await readSite(PROJECT, request, origin)];
        assert.ok(!report(PROJECT, results).includes('MadeUpAccessToken'));
        return results;
    };

    let [database, site] = await run('yes');
    assert.strictEqual(database.ok, true);
    assert.strictEqual(site.ok, true);
    assert.deepStrictEqual(seen, [sent.project, sent.instance, sent.rules, sent.site]);

    // Each request in turn refused, redirected or not found: the database read ends there, no
    // request goes to the address of the redirect, and nothing else is asked.
    for (const kind of ['off', 'redirect', '404']) {
        [database] = await run(kind + ':project');
        assert.strictEqual(database.ok, false);
        assert.deepStrictEqual(seen, [sent.project, sent.site]);
        [database] = await run(kind + ':instance');
        assert.strictEqual(database.ok, false);
        assert.deepStrictEqual(seen, [sent.project, sent.instance, sent.site]);
        [database] = await run(kind + ':rules');
        assert.strictEqual(database.ok, false);
        assert.deepStrictEqual(seen, [sent.project, sent.instance, sent.rules, sent.site]);
        [database, site] = await run(kind + ':site');
        assert.strictEqual(database.ok, true);
        assert.strictEqual(site.ok, false);
        assert.deepStrictEqual(seen, [sent.project, sent.instance, sent.rules, sent.site]);
    }
    [database] = await run('redirect:rules');
    assert.match(database.why, /^307 to PUT/);
    [database, site] = await run('off:instance');
    assert.match(database.why, /The Firebase Realtime Database Management API \(firebasedatabase\.googleapis\.com\) is off/);
    [, site] = await run('off:site');
    assert.match(site.why, /The Firebase Hosting API \(firebasehosting\.googleapis\.com\) is off/);
});
