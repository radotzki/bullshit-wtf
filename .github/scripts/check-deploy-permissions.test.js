// node --test .github/scripts/*.test.js
// Made-up answers only: no request leaves this machine, and every token here is invented.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'check-deploy-permissions.js');
const { NEEDS, TARGETS, wanted, check, report, googleRequest } = require('./check-deploy-permissions.js');

const PROJECT = 'bullshit-wtf-prod';
const ALL = [...new Set(Object.values(NEEDS).flat())].sort();
const TOKEN = 'ya29.c.MadeUpAccessToken-0123456789_abcdefghijklmnop';
const PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7madeUP\n-----END PRIVATE KEY-----';

// A request that answers with `answer`, and remembers what it was asked.
const answering = answer => {
    const seen = [];
    const request = async options => {
        seen.push(options);
        if (answer instanceof Error) {
            throw answer;
        }
        return answer;
    };
    return { request, seen };
};
const run = async answer => {
    const { request, seen } = answering(answer);
    const result = await check(PROJECT, wanted(null), request);
    return { result, text: report(PROJECT, result), seen };
};

test('the list holds what the rules step and the site step need, and the tool\'s list for the functions', () => {
    assert.deepStrictEqual(NEEDS['2. Deploy the database rules'], ['firebasedatabase.instances.update']);
    assert.deepStrictEqual(NEEDS['3. Deploy the site'], ['firebasehosting.sites.update']);
    assert.ok(NEEDS['1. Deploy all functions'].includes('cloudfunctions.functions.update'));
    assert.deepStrictEqual(NEEDS['every step'], ['firebase.projects.get']);
});

test('it asks Google\'s test-permissions question once, for the project, and only that', async () => {
    const { seen } = await run({ status: 200, data: { permissions: ALL } });
    assert.strictEqual(seen.length, 1);
    assert.deepStrictEqual(seen[0], {
        url: 'https://cloudresourcemanager.googleapis.com/v1/projects/bullshit-wtf-prod:testIamPermissions',
        method: 'POST',
        headers: { 'x-goog-user-project': PROJECT },
        data: { permissions: ALL },
    });
});

test('every permission held: the run goes on', async () => {
    const { result, text } = await run({ status: 200, data: { permissions: [...ALL].reverse() } });
    assert.strictEqual(result.ok, true);
    assert.match(text, /holds every permission/);
    for (const p of ALL) {
        assert.ok(text.includes('held: ' + p));
    }
    assert.doesNotMatch(text, /Deploy stopped/);
});

test('the site permission missing: the run stops and names it and its step', async () => {
    const { result, text } = await run({ status: 200, data: { permissions: ALL.filter(p => p !== 'firebasehosting.sites.update') } });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.kind, 'missing');
    assert.deepStrictEqual(result.missing, ['firebasehosting.sites.update']);
    assert.match(text, /Deploy stopped, nothing released\. The deploy account lacks a permission/);
    assert.match(text, /missing: firebasehosting\.sites\.update {3}\(needed by: 3\. Deploy the site\)/);
    assert.doesNotMatch(text, /missing: firebasedatabase/);
});

test('the rules permission missing: the run stops and names it and its step', async () => {
    const { result, text } = await run({ status: 200, data: { permissions: ALL.filter(p => p !== 'firebasedatabase.instances.update') } });
    assert.strictEqual(result.ok, false);
    assert.deepStrictEqual(result.missing, ['firebasedatabase.instances.update']);
    assert.match(text, /missing: firebasedatabase\.instances\.update {3}\(needed by: 2\. Deploy the database rules\)/);
});

test('Google leaves the list out when none is held: every permission is missing', async () => {
    for (const data of [{}, { permissions: [] }]) {
        const { result, text } = await run({ status: 200, data });
        assert.strictEqual(result.ok, false);
        assert.deepStrictEqual(result.missing, ALL);
        assert.match(text, /lacks permissions/);
    }
});

test('a permission Google names that was not asked for does not count as held', async () => {
    const { result } = await run({ status: 200, data: { permissions: ['resourcemanager.projects.get', 'firebasehosting.sites.update'] } });
    assert.strictEqual(result.ok, false);
    assert.ok(result.missing.includes('firebasedatabase.instances.update'));
    assert.ok(!result.missing.includes('firebasehosting.sites.update'));
});

test('the question refused because an API is off: the run stops and says which', async () => {
    const { result, text } = await run({
        status: 403,
        data: {
            error: {
                code: 403,
                message: 'Cloud Resource Manager API has not been used in project 1054623883511 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/cloudresourcemanager.googleapis.com/overview?project=1054623883511 then retry.',
                status: 'PERMISSION_DENIED',
                details: [{ reason: 'SERVICE_DISABLED', metadata: { service: 'cloudresourcemanager.googleapis.com', consumer: 'projects/1054623883511' } }],
            },
        },
    });
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.kind, 'refused');
    assert.match(text, /Deploy stopped, nothing released\. Google did not say/);
    assert.match(text, /403 to POST cloudresourcemanager\.googleapis\.com\/v1\/projects\/bullshit-wtf-prod:testIamPermissions/);
    assert.match(text, /status: PERMISSION_DENIED/);
    assert.match(text, /reason: SERVICE_DISABLED/);
    assert.match(text, /service: cloudresourcemanager\.googleapis\.com/);
    // The address in the message loses its query string.
    assert.doesNotMatch(text, /\?project=/);
});

test('any answer that is not a plain yes stops the run', async () => {
    const answers = [
        { status: 401, data: { error: { code: 401, message: 'Request had invalid authentication credentials.', status: 'UNAUTHENTICATED' } } },
        { status: 429, data: { error: { status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' } } },
        { status: 500, data: '<html>Internal error</html>' },
        { status: 204, data: undefined },
        { status: 200, data: null },
        { status: 200, data: 'ok' },
        { status: 200, data: [] },
        { status: 200, data: { permissions: 'all' } },
        { status: '200 OK', data: { permissions: ALL } },
        undefined,
        new Error('socket hang up'),
        Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }),
    ];
    for (const answer of answers) {
        const { result, text } = await run(answer);
        assert.strictEqual(result.ok, false, JSON.stringify(answer));
        assert.strictEqual(result.kind, 'refused');
        assert.match(text, /Deploy stopped, nothing released/);
        assert.doesNotMatch(text, /Internal error/);
    }
});

test('nothing secret is printed, whatever the answer or the error carries', async () => {
    const quoted = `Bad token ${TOKEN} with Bearer ${TOKEN} and key ${PRIVATE_KEY}`;
    // An error from the request library carries the request, with its Authorization header.
    const libraryError = Object.assign(new Error(`request to https://oauth2.googleapis.com/token failed: ${quoted}`), {
        config: { headers: { Authorization: 'Bearer ' + TOKEN }, body: PRIVATE_KEY },
        response: { status: 400, data: { error: 'invalid_grant', error_description: `Invalid JWT Signature. ${quoted}` } },
    });
    const answers = [
        { status: 403, data: { error: { status: 'PERMISSION_DENIED', message: quoted, echo: { key: PRIVATE_KEY }, details: [{ reason: TOKEN, metadata: { permission: 'x.y.z', value: TOKEN } }] } } },
        { status: 500, data: quoted },
        { status: 200, data: { permissions: [TOKEN, PRIVATE_KEY] } },
        { status: TOKEN, data: {} },
        libraryError,
        Object.assign(new Error(quoted), { code: TOKEN }),
        new Error(quoted),
    ];
    for (const answer of answers) {
        const { result, text } = await run(answer);
        assert.strictEqual(result.ok, false);
        const shown = text + '\n' + result.lines.join('\n');
        assert.ok(!shown.includes('MadeUpAccessToken'), shown);
        assert.ok(!shown.includes('MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7madeUP'), shown);
        assert.ok(!shown.includes('BEGIN PRIVATE KEY'), shown);
    }
    const { text } = await run(libraryError);
    assert.match(text, /400 while signing in or asking/);
    assert.match(text, /message: invalid_grant/);
});

test('permissions the installed tool lists for the three targets are asked too, and nothing else of its list', () => {
    const needs = wanted({
        database: ['firebasedatabase.instances.update', 'firebasedatabase.instances.madeUp'],
        hosting: ['firebasehosting.sites.update'],
        functions: ['cloudfunctions.functions.list', 'cloudfunctions.madeUp.get', 'not a permission', 7],
        firestore: ['datastore.indexes.list'],
    });
    assert.deepStrictEqual(needs['2. Deploy the database rules'], ['firebasedatabase.instances.update', 'firebasedatabase.instances.madeUp']);
    assert.ok(needs['1. Deploy all functions'].includes('cloudfunctions.madeUp.get'));
    const all = Object.values(needs).flat();
    assert.ok(!all.includes('datastore.indexes.list'));
    assert.ok(!all.includes('not a permission'));
    assert.ok(!all.includes(7));
    for (const bad of [null, undefined, {}, { database: 'x' }, []]) {
        assert.deepStrictEqual(wanted(bad), wanted(null));
    }
    assert.deepStrictEqual(Object.values(TARGETS).sort(), ['database', 'functions', 'hosting']);
});

test('without a sign-in the script itself stops the run, and prints no stack', () => {
    const env = Object.assign({}, process.env, { GOOGLE_APPLICATION_CREDENTIALS: path.join(__dirname, 'no-such-key.json') });
    delete env.GITHUB_STEP_SUMMARY;
    const out = spawnSync('node', [SCRIPT, PROJECT], { env, encoding: 'utf8', timeout: 60000 });
    assert.strictEqual(out.status, 1);
    assert.match(out.stdout, /Deploy stopped, nothing released/);
    assert.match(out.stdout, /^::error title=Deploy stopped, nothing released/m);
    assert.doesNotMatch(out.stdout + out.stderr, /\n\s+at /);
    assert.doesNotMatch(out.stdout + out.stderr, /no-such-key/);
    const bad = spawnSync('node', [SCRIPT, 'Not A Project'], { env, encoding: 'utf8' });
    assert.strictEqual(bad.status, 1);
    assert.match(bad.stderr, /Usage/);
});

// The same question through Google's real library, to a server on this machine. It needs the
// library, which only `npm ci` at the repository's root installs: the Tests workflow installs
// nothing for these scripts, so there this test is skipped.
let library = null;
try {
    library = require('google-auth-library');
} catch (e) {
    // not installed
}
test('through Google\'s library: the token goes in the header and is never printed', { skip: !library && 'google-auth-library is not installed' }, async t => {
    const saved = {};
    for (const name of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']) {
        saved[name] = process.env[name];
        delete process.env[name];
    }
    t.after(() => Object.keys(saved).forEach(n => saved[n] === undefined || (process.env[n] = saved[n])));
    let mode = 'all';
    const seen = [];
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', d => { body += d; });
        req.on('end', () => {
            seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, project: req.headers['x-goog-user-project'] });
            res.setHeader('content-type', 'application/json');
            const asked = JSON.parse(body).permissions;
            if (mode === 'off') {
                res.statusCode = 403;
                res.end(JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'API disabled ' + req.headers.authorization, details: [{ reason: 'SERVICE_DISABLED' }] } }));
            } else {
                res.end(JSON.stringify({ permissions: mode === 'all' ? asked : asked.filter(p => !p.startsWith('firebasehosting.')) }));
            }
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    const origin = 'http://127.0.0.1:' + server.address().port;
    const client = new library.OAuth2Client();
    client.setCredentials({ access_token: TOKEN });
    const request = googleRequest({ getClient: async () => client });

    const yes = await check(PROJECT, wanted(null), request, origin);
    assert.strictEqual(yes.ok, true);
    assert.deepStrictEqual(seen[0], { method: 'POST', url: '/v1/projects/bullshit-wtf-prod:testIamPermissions', auth: 'Bearer ' + TOKEN, project: PROJECT });

    mode = 'no hosting';
    const no = await check(PROJECT, wanted(null), request, origin);
    assert.deepStrictEqual(no.missing, ['firebasehosting.sites.update']);

    mode = 'off';
    const off = await check(PROJECT, wanted(null), request, origin);
    assert.strictEqual(off.kind, 'refused');
    for (const r of [yes, no, off]) {
        assert.ok(!report(PROJECT, r).includes('MadeUpAccessToken'));
    }
    assert.match(report(PROJECT, off), /reason: SERVICE_DISABLED/);
});
