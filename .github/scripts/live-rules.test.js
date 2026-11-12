// node --test .github/scripts/*.test.js
// Made-up answers only: no request leaves this machine, and every token is invented.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const { allowed, locked, databaseApiOff, rulesFile, canonical, compareRules, liveRules } = require('./live-rules.js');
const { googleRequest, noAnswer } = require('./check-deploy-permissions.js');

const PROJECT = 'made-up-project';
const INSTANCE = 'made-up-project';
const TOKEN = 'ya29.c.MadeUpAccessToken-0123456789_abcdefghijklmnop';
const RULES = { rules: { '.read': false, games: { $pin: { '.read': true, '.write': 'auth.uid == \'made-up-worker\'', '.indexOn': ['a', 'b'] } } } };
const SECRET_RULE = 'auth.uid == \'only-in-the-live-rules\'';

const URLS = {
    project: `https://firebase.googleapis.com/v1beta1/projects/${PROJECT}`,
    instance: `https://firebasedatabase.googleapis.com/v1beta/projects/${PROJECT}/locations/-/instances/${INSTANCE}`,
    config: `https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/adminSdkConfig`,
    rules: `https://${INSTANCE}.firebaseio.com/.settings/rules.json`,
};
const API_OFF = {
    status: 403,
    data: {
        error: {
            code: 403,
            status: 'PERMISSION_DENIED',
            message: `Firebase Realtime Database Management API has not been used in project 1054623883511 before or it is disabled. Token ${TOKEN}`,
            details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'SERVICE_DISABLED', domain: 'googleapis.com', metadata: { service: 'firebasedatabase.googleapis.com', consumer: 'projects/1054623883511' } }],
        },
    },
};
const good = () => ({
    [URLS.project]: { status: 200, data: { projectId: PROJECT, projectNumber: '1054623883511', resources: { hostingSite: 'made-up-site', realtimeDatabaseInstance: INSTANCE } } },
    [URLS.instance]: API_OFF,
    [URLS.config]: { status: 200, data: { projectId: PROJECT, databaseURL: `https://${INSTANCE}.firebaseio.com`, storageBucket: 'made-up.appspot.com' } },
    [URLS.rules]: { status: 200, data: JSON.parse(JSON.stringify(RULES)) },
});
// A made-up Google: it answers each address from `answers`, and remembers what it was asked.
const google = (answers, seen = []) => async options => {
    seen.push(options);
    const answer = answers[options.url];
    if (answer instanceof Error) {
        throw answer;
    }
    return answer || { status: 404, data: { error: { code: 404, status: 'NOT_FOUND', message: 'made-up: nothing here' } } };
};
// A made-up checkout with a firebase.json and its rules file.
const checkout = (t, rules = RULES, config = { database: { rules: 'database-rules.json' }, hosting: { public: 'game/dist' } }) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'live-rules-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.writeFileSync(path.join(dir, 'firebase.json'), typeof config === 'string' ? config : JSON.stringify(config));
    if (rules !== null) {
        fs.writeFileSync(path.join(dir, 'database-rules.json'), typeof rules === 'string' ? rules : JSON.stringify(rules, null, 4));
    }
    return dir;
};

test('nothing may be sent but a GET to the two Google APIs or to a database\'s rules address', () => {
    for (const url of Object.values(URLS)) {
        assert.strictEqual(allowed({ url, method: 'GET' }), true, url);
        for (const method of ['PUT', 'POST', 'PATCH', 'DELETE', 'get', undefined]) {
            assert.strictEqual(allowed({ url, method }), false, method + ' ' + url);
        }
        assert.strictEqual(allowed({ url, method: 'GET', data: {} }), false);
        assert.strictEqual(allowed({ url, method: 'GET', body: '' }), false);
        assert.strictEqual(allowed({ url: url + '?dryRun=true', method: 'GET' }), false);
    }
    assert.strictEqual(allowed({ url: 'https://made-up.europe-west1.firebasedatabase.app/.settings/rules.json', method: 'GET' }), true);
    for (const url of [
        'http://made-up-project.firebaseio.com/.settings/rules.json',
        'https://made-up-project.firebaseio.com/.json',
        'https://made-up-project.firebaseio.com/games.json',
        'https://made-up-project.firebaseio.com/.settings/rules.json/x',
        'https://made-up-project.firebaseio.com:8443/.settings/rules.json',
        'https://user:pw@made-up-project.firebaseio.com/.settings/rules.json',
        'https://made-up-project.firebaseio.com.example.com/.settings/rules.json',
        'https://example.com/.settings/rules.json',
        'https://serviceusage.googleapis.com/v1/projects/made-up-project/services/firebasedatabase.googleapis.com',
        'https://firebase.googleapis.com/v1beta1/projects/made-up-project:addFirebase',
        'https://firebasehosting.googleapis.com/v1beta1/projects/made-up-project/sites',
        'not an address',
    ]) {
        assert.strictEqual(allowed({ url, method: 'GET' }), false, url);
    }
    for (const bad of [null, undefined, 'GET', {}, { method: 'GET' }, { url: 5, method: 'GET' }]) {
        assert.strictEqual(allowed(bad), false);
    }
});

test('a request that is not allowed is refused before it is sent', async () => {
    const seen = [];
    const send = locked(google({}, seen));
    await assert.rejects(send({ url: URLS.rules, method: 'PUT', data: RULES }), { code: 'REQUEST_NOT_ALLOWED_IN_A_CHECK' });
    await assert.rejects(send({ url: 'https://serviceusage.googleapis.com/v1/projects/p/services/x:enable', method: 'POST' }), { code: 'REQUEST_NOT_ALLOWED_IN_A_CHECK' });
    assert.deepStrictEqual(seen, []);
});

test('this file has no way to write: no method but GET appears in its code', () => {
    const code = fs.readFileSync(path.join(__dirname, 'live-rules.js'), 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(code, /['"`](PUT|POST|PATCH|DELETE)['"`]/);
    assert.doesNotMatch(code, /dryRun|:enable|serviceusage|child_process|spawn|firebase-tools/);
    assert.deepStrictEqual([...code.matchAll(/method: '([A-Z]+)'/g)].map(m => m[1]), ['GET']);
});

test('"the database API is off" is read from the answer\'s fields, for that API alone', () => {
    assert.strictEqual(databaseApiOff(403, API_OFF.data), true);
    const but = change => {
        const data = JSON.parse(JSON.stringify(API_OFF.data));
        change(data.error);
        return data;
    };
    assert.strictEqual(databaseApiOff(200, API_OFF.data), false);
    assert.strictEqual(databaseApiOff(401, API_OFF.data), false);
    assert.strictEqual(databaseApiOff(403, but(e => { e.details[0].metadata.service = 'firebasehosting.googleapis.com'; })), false);
    assert.strictEqual(databaseApiOff(403, but(e => { e.details[0].reason = 'IAM_PERMISSION_DENIED'; })), false);
    assert.strictEqual(databaseApiOff(403, but(e => { e.status = 'UNAUTHENTICATED'; })), false);
    assert.strictEqual(databaseApiOff(403, but(e => { delete e.details; })), false);
    // A missing permission is not "the API is off", whatever the message says.
    assert.strictEqual(databaseApiOff(403, { error: { code: 403, status: 'PERMISSION_DENIED', message: 'The API is disabled. SERVICE_DISABLED firebasedatabase.googleapis.com' } }), false);
    for (const data of [null, undefined, '', 'SERVICE_DISABLED', [], {}, { error: 'SERVICE_DISABLED' }]) {
        assert.strictEqual(databaseApiOff(403, data), false);
    }
});

test('rules are the same value for value, whatever the order of keys and the spacing', () => {
    const text = JSON.stringify(RULES, null, 4);
    const reordered = { rules: { games: { $pin: { '.indexOn': ['a', 'b'], '.write': 'auth.uid == \'made-up-worker\'', '.read': true } }, '.read': false } };
    assert.strictEqual(compareRules(text, reordered), 'same');
    assert.strictEqual(compareRules(text, JSON.stringify(reordered)), 'same');
    assert.strictEqual(compareRules(text, '\n' + JSON.stringify(reordered, null, 1) + '\n'), 'same');
    assert.strictEqual(canonical({ b: 1, a: [2, { d: 1, c: 2 }] }), '{"a":[2,{"c":2,"d":1}],"b":1}');
    const but = change => {
        const live = JSON.parse(text);
        change(live.rules);
        return live;
    };
    assert.strictEqual(compareRules(text, but(r => { r['.read'] = true; })), 'different');
    assert.strictEqual(compareRules(text, but(r => { r['.read'] = 'false'; })), 'different');
    assert.strictEqual(compareRules(text, but(r => { r.games.$pin['.write'] += ' '; })), 'different');
    assert.strictEqual(compareRules(text, but(r => { r.extra = { '.read': true }; })), 'different');
    assert.strictEqual(compareRules(text, but(r => { delete r.games; })), 'different');
    assert.strictEqual(compareRules(text, but(r => { r.games.$pin['.indexOn'].reverse(); })), 'different');
    assert.strictEqual(compareRules(text, Object.assign(JSON.parse(text), { more: 1 })), 'different');
});

test('rules that cannot be compared count as unknown, never as the same', () => {
    const text = JSON.stringify(RULES);
    for (const live of [null, undefined, '', 'null', '[]', '{}', '{"rules": true}', '{"rules": []}', 7, [], {}, { rules: null }, { rules: 'x' },
        '// a comment\n' + text, text.slice(0, -1), '<html>' + text + '</html>']) {
        assert.strictEqual(compareRules(text, live), 'unknown');
        assert.strictEqual(compareRules(live, JSON.parse(text)), 'unknown');
    }
    assert.strictEqual(compareRules('// a comment\n' + text, '// a comment\n' + text), 'unknown');
});

test('the rules file is the one file firebase.json names for the default database', t => {
    assert.strictEqual(compareRules(rulesFile(checkout(t)), RULES), 'same');
    for (const config of [
        'not json',
        {},
        { database: null },
        { database: [{ rules: 'database-rules.json' }] },
        { database: { rules: 'database-rules.json', instance: 'another' } },
        { database: { rules: 'database-rules.json', target: 'main' } },
        { database: { rules: 5 } },
        { database: { rules: 'rules.bolt' } },
        { database: { rules: '../database-rules.json' } },
        { database: { rules: '/etc/database-rules.json' } },
        { database: { rules: 'missing.json' } },
    ]) {
        assert.throws(() => rulesFile(checkout(t, RULES, config)), /firebase\.json|rules file/);
    }
});

test('unchanged: the API is off and the live rules equal the commit\'s, with four GETs and nothing else', async t => {
    const seen = [];
    const out = await liveRules(PROJECT, checkout(t), google(good(), seen), noAnswer);
    assert.strictEqual(out.verdict, 'unchanged');
    assert.deepStrictEqual(seen, [URLS.project, URLS.instance, URLS.config, URLS.rules].map(url => ({ url, method: 'GET' })));
    const text = out.lines.join('\n');
    assert.match(text, /the Firebase Realtime Database Management API is off \(SERVICE_DISABLED\)/);
    assert.match(text, /The live rules are the same as this commit's rules file/);
    // Neither the rules nor the database's own address is printed.
    assert.doesNotMatch(text, /firebaseio\.com|made-up-worker|MadeUpAccessToken/);
});

test('a database in another region is read at its own address', async t => {
    const answers = good();
    const address = `https://${INSTANCE}.europe-west1.firebasedatabase.app`;
    answers[URLS.config].data.databaseURL = address;
    answers[address + '/.settings/rules.json'] = answers[URLS.rules];
    delete answers[URLS.rules];
    const seen = [];
    const out = await liveRules(PROJECT, checkout(t), google(answers, seen), noAnswer);
    assert.strictEqual(out.verdict, 'unchanged');
    assert.strictEqual(seen[3].url, address + '/.settings/rules.json');
});

test('changed: live rules that differ are said to differ, and are not printed', async t => {
    const answers = good();
    answers[URLS.rules].data.rules.games.$pin['.write'] = SECRET_RULE;
    const out = await liveRules(PROJECT, checkout(t), google(answers), noAnswer);
    assert.strictEqual(out.verdict, 'changed');
    assert.match(out.lines.join('\n'), /The live rules are NOT the same as this commit's rules file/);
    assert.doesNotMatch(out.lines.join('\n'), /only-in-the-live-rules|made-up-worker/);
});

test('other: when the instance read is not refused for the API being off, the live rules are not read', async t => {
    const cases = {
        'a 200': { status: 200, data: { name: 'projects/1/locations/us-central1/instances/' + INSTANCE, databaseUrl: `https://${INSTANCE}.firebaseio.com` } },
        'a missing permission': { status: 403, data: { error: { code: 403, status: 'PERMISSION_DENIED', message: 'The caller does not have permission', details: [{ reason: 'IAM_PERMISSION_DENIED', metadata: { permission: 'firebasedatabase.instances.get' } }] } } },
        'another API off': { status: 403, data: { error: { code: 403, status: 'PERMISSION_DENIED', message: 'off', details: [{ reason: 'SERVICE_DISABLED', metadata: { service: 'serviceusage.googleapis.com' } }] } } },
        'not found': { status: 404, data: { error: { code: 404, status: 'NOT_FOUND', message: 'no such instance' } } },
        'a server error': { status: 503, data: '<html>try later</html>' },
        'a redirect': { status: 307, data: '' },
        'no answer': Object.assign(new Error('socket hang up ' + TOKEN), { code: 'ECONNRESET' }),
    };
    for (const [name, answer] of Object.entries(cases)) {
        const answers = good();
        answers[URLS.instance] = answer;
        const seen = [];
        const out = await liveRules(PROJECT, checkout(t), google(answers, seen), noAnswer);
        assert.strictEqual(out.verdict, 'other', name);
        assert.deepStrictEqual(seen.map(o => o.url), [URLS.project, URLS.instance], name);
        assert.doesNotMatch(out.lines.join('\n'), /MadeUpAccessToken|try later/, name);
    }
});

test('unknown: any answer on the way that is not the expected one stops the reading there', async t => {
    const off = { status: 403, data: { error: { code: 403, status: 'PERMISSION_DENIED', message: `Permission denied ${TOKEN}` } } };
    const cases = [
        // [what is changed, how many requests are sent]
        [a => { a[URLS.project] = off; }, 1],
        [a => { a[URLS.project] = new Error('getaddrinfo ENOTFOUND'); }, 1],
        [a => { a[URLS.project].data.projectId = 'another-project'; }, 1],
        [a => { delete a[URLS.project].data.resources.realtimeDatabaseInstance; }, 1],
        [a => { a[URLS.project].data.resources.realtimeDatabaseInstance = 'x/../y'; }, 1],
        [a => { a[URLS.project].data = null; }, 1],
        [a => { a[URLS.project].data = 'text'; }, 1],
        [a => { a[URLS.config] = off; }, 3],
        [a => { a[URLS.config] = { status: 200, data: null }; }, 3],
        [a => { a[URLS.config].data.projectId = 'another-project'; }, 3],
        [a => { delete a[URLS.config].data.databaseURL; }, 3],
        // An address that is not the default instance's own database address.
        [a => { a[URLS.config].data.databaseURL = 'https://another-database.firebaseio.com'; }, 3],
        [a => { a[URLS.config].data.databaseURL = `http://${INSTANCE}.firebaseio.com`; }, 3],
        [a => { a[URLS.config].data.databaseURL = `https://${INSTANCE}.firebaseio.com/games`; }, 3],
        [a => { a[URLS.config].data.databaseURL = `https://${INSTANCE}.firebaseio.com?ns=another`; }, 3],
        [a => { a[URLS.config].data.databaseURL = `https://${INSTANCE}.example.com`; }, 3],
        [a => { a[URLS.config].data.databaseURL = `https://${INSTANCE}.firebaseio.com.example.com`; }, 3],
        [a => { a[URLS.config].data.databaseURL = 'not an address'; }, 3],
        [a => { a[URLS.rules] = off; }, 4],
        [a => { a[URLS.rules] = { status: 401, data: { error: 'Unauthorized request.' } }; }, 4],
        [a => { a[URLS.rules] = { status: 307, data: '' }; }, 4],
        [a => { a[URLS.rules] = Object.assign(new Error('timed out'), { code: 'CHECK_TIMED_OUT', seconds: 60 }); }, 4],
        [a => { a[URLS.rules] = { status: 200, data: null }; }, 4],
        [a => { a[URLS.rules] = { status: 200, data: '' }; }, 4],
        [a => { a[URLS.rules] = { status: 200, data: '// live rules with a comment\n' + JSON.stringify(RULES) }; }, 4],
        [a => { a[URLS.rules] = { status: 200, data: '<html>sign in</html>' }; }, 4],
        [a => { a[URLS.rules] = { status: 200, data: { error: 'Permission denied' } }; }, 4],
        [a => { a[URLS.rules] = { status: 200, data: [] }; }, 4],
    ];
    for (const [change, sent] of cases) {
        const answers = good();
        change(answers);
        const seen = [];
        const out = await liveRules(PROJECT, checkout(t), google(answers, seen), noAnswer);
        assert.strictEqual(out.verdict, 'unknown', change.toString());
        assert.strictEqual(seen.length, sent, change.toString());
        assert.ok(seen.every(o => o.method === 'GET' && !('data' in o)));
        assert.doesNotMatch(out.lines.join('\n'), /MadeUpAccessToken|sign in|made-up-worker/, change.toString());
    }
});

test('unknown, and nothing is asked, when the commit has no one plain rules file', async t => {
    const dirs = [
        checkout(t, '// a comment\n' + JSON.stringify(RULES)),
        checkout(t, '{"rules": '),
        checkout(t, null),
        checkout(t, RULES, { database: [{ target: 'a', rules: 'database-rules.json' }] }),
        checkout(t, RULES, { hosting: {} }),
    ];
    for (const dir of dirs) {
        const seen = [];
        const out = await liveRules(PROJECT, dir, google(good(), seen), noAnswer);
        assert.strictEqual(out.verdict, 'unknown');
        assert.deepStrictEqual(seen, []);
    }
});

// The rules read through Google's real library, to a server on this machine. It needs the
// library, which only `npm ci` at the repository's root installs: the Tests workflow installs
// nothing for these scripts, so there this test is skipped.
let library = null;
try {
    library = require('google-auth-library');
} catch (e) {
    // not installed
}
test('through Google\'s library: the rules come back as a value, or as text when they are not JSON', { skip: !library && 'google-auth-library is not installed' }, async t => {
    const saved = {};
    for (const name of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']) {
        saved[name] = process.env[name];
        delete process.env[name];
    }
    t.after(() => Object.keys(saved).forEach(n => saved[n] === undefined || (process.env[n] = saved[n])));
    let body = '';
    const seen = [];
    const server = http.createServer((req, res) => {
        seen.push({ method: req.method, url: req.url, auth: req.headers.authorization });
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(body);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    const url = `http://127.0.0.1:${server.address().port}/.settings/rules.json`;
    const client = new library.OAuth2Client();
    client.setCredentials({ access_token: TOKEN });
    const request = googleRequest({ getClient: async () => client });
    const text = JSON.stringify(RULES, null, 2);

    body = text;
    const plain = await request({ url, method: 'GET' });
    assert.strictEqual(plain.status, 200);
    assert.strictEqual(compareRules(text, plain.data), 'same');
    body = '/* the database keeps comments */\n' + text;
    const commented = await request({ url, method: 'GET' });
    assert.strictEqual(compareRules(text, commented.data), 'unknown');
    body = text.replace('false', 'true');
    assert.strictEqual(compareRules(text, (await request({ url, method: 'GET' })).data), 'different');
    assert.deepStrictEqual(seen, [0, 1, 2].map(() => ({ method: 'GET', url: '/.settings/rules.json', auth: 'Bearer ' + TOKEN })));
});
