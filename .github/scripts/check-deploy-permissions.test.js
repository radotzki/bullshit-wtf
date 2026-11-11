// node --test .github/scripts/*.test.js
// Made-up answers only: no request leaves this machine, and every token here is invented.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'check-deploy-permissions.js');
const { NEEDS, TARGETS, ASK_TIMEOUT, TOTAL_TIMEOUT, wanted, check, report, googleRequest } = require('./check-deploy-permissions.js');

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

// A client like the library's, made up: it remembers the options it is given and answers with
// `answer`. No library and no network.
const fakeAuth = answer => {
    const seen = [];
    const auth = { getClient: async () => ({ request: async options => { seen.push(options); return answer; } }) };
    return { auth, seen };
};

test('a redirect is not followed: the request says so, and a 3xx answer stops the run', async () => {
    const { auth, seen } = fakeAuth({ status: 200, data: { permissions: ALL } });
    const yes = await check(PROJECT, wanted(null), googleRequest(auth));
    assert.strictEqual(yes.ok, true);
    assert.strictEqual(seen.length, 1);
    assert.strictEqual(seen[0].redirect, 'manual');
    assert.strictEqual(seen[0].maxRedirects, 0);
    assert.strictEqual(seen[0].retry, false);
    assert.strictEqual(seen[0].timeout, ASK_TIMEOUT);
    // A redirect comes back as its own answer. Even with a full list in it, it is not a yes.
    for (const status of [301, 302, 303, 307, 308]) {
        const { result, text } = await run({ status, data: { permissions: ALL } });
        assert.strictEqual(result.ok, false, String(status));
        assert.strictEqual(result.kind, 'refused');
        assert.match(text, new RegExp(status + ' to POST cloudresourcemanager'));
        assert.match(text, /a redirect: it is not followed/);
    }
});

test('a full yes that came from another address does not count', async () => {
    const elsewhere = fakeAuth({ status: 200, data: { permissions: ALL }, request: { responseURL: 'https://example.com/v1/projects/bullshit-wtf-prod:testIamPermissions' } });
    const moved = await check(PROJECT, wanted(null), googleRequest(elsewhere.auth));
    assert.strictEqual(moved.ok, false);
    assert.strictEqual(moved.kind, 'refused');
    assert.match(report(PROJECT, moved), /ANSWER_FROM_ANOTHER_ADDRESS/);
    assert.doesNotMatch(report(PROJECT, moved), /example\.com/);
    // The same answer from the address that was asked counts.
    const same = fakeAuth({ status: 200, data: { permissions: ALL }, request: { responseURL: 'https://cloudresourcemanager.googleapis.com/v1/projects/bullshit-wtf-prod:testIamPermissions' } });
    assert.strictEqual((await check(PROJECT, wanted(null), googleRequest(same.auth))).ok, true);
});

test('a sign-in that never answers is given up on, and the run stops', async () => {
    assert.ok(TOTAL_TIMEOUT >= ASK_TIMEOUT && TOTAL_TIMEOUT <= 120000);
    const never = new Promise(() => {});
    const hung = [
        // The sign-in itself never answers.
        { getClient: () => never },
        // The client is there, but its request (which fetches the token first) never answers.
        { getClient: async () => ({ request: () => never }) },
    ];
    for (const auth of hung) {
        const started = Date.now();
        const result = await check(PROJECT, wanted(null), googleRequest(auth, { total: 60 }));
        assert.ok(Date.now() - started < 5000);
        assert.strictEqual(result.ok, false);
        assert.strictEqual(result.kind, 'refused');
        const text = report(PROJECT, result);
        assert.match(text, /Deploy stopped, nothing released/);
        assert.match(text, /No answer from cloudresourcemanager\.googleapis\.com\/v1\/projects\/bullshit-wtf-prod:testIamPermissions: timed out after 0\.06 seconds \(the sign-in and the question together\)/);
    }
    // An answer in time is not disturbed by the limit, and leaves no timer behind.
    const { auth } = fakeAuth({ status: 200, data: { permissions: ALL } });
    assert.strictEqual((await check(PROJECT, wanted(null), googleRequest(auth, { total: 60 }))).ok, true);
});

test('a time-out is called a time-out, not "Error"', async () => {
    const errors = [
        // What the request library throws when its own limit passes: no code, the name "Error".
        new Error('network timeout at: https://cloudresourcemanager.googleapis.com/v1/projects/bullshit-wtf-prod:testIamPermissions'),
        Object.assign(new Error('x'), { type: 'request-timeout' }),
        Object.assign(new Error('connect ETIMEDOUT 142.250.0.1:443'), { code: 'ETIMEDOUT' }),
        Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }),
        Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }),
        new Error(`Request timed out with Bearer ${TOKEN}`),
    ];
    for (const e of errors) {
        const { result, text } = await run(e);
        assert.strictEqual(result.ok, false);
        assert.match(text, /No answer from cloudresourcemanager\.googleapis\.com\/v1\/projects\/bullshit-wtf-prod:testIamPermissions: timed out\n/, e.message);
        assert.doesNotMatch(text, /: Error/);
        assert.ok(!text.includes('MadeUpAccessToken'));
    }
    // An error that is not a time-out keeps its code or name.
    const reset = await run(Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }));
    assert.match(reset.text, /: ECONNRESET/);
    assert.doesNotMatch(reset.text, /No answer[^\n]*timed out/);
    const plain = await run(new Error('socket hang up'));
    assert.match(plain.text, /: Error/);
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
            if (mode === 'hang') {
                return;
            }
            if (mode === 'redirect' && req.url.startsWith('/v1/')) {
                res.statusCode = 307;
                res.setHeader('location', '/elsewhere');
                res.end();
            } else if (mode === 'off') {
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

    // A redirect to an address that answers with a full yes: not followed, the run stops.
    mode = 'redirect';
    const before = seen.length;
    const moved = await check(PROJECT, wanted(null), request, origin);
    assert.strictEqual(moved.ok, false);
    assert.strictEqual(moved.kind, 'refused');
    assert.match(report(PROJECT, moved), /307 to POST/);
    assert.deepStrictEqual(seen.slice(before).map(r => r.url), ['/v1/projects/bullshit-wtf-prod:testIamPermissions']);

    // The library's own time-out on the question is named as one.
    mode = 'hang';
    const slow = await check(PROJECT, wanted(null), googleRequest({ getClient: async () => client }, { ask: 200 }), origin);
    assert.strictEqual(slow.ok, false);
    assert.match(report(PROJECT, slow), /: timed out\n/);
    server.closeAllConnections();
});
