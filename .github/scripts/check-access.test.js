// node --test .github/scripts/*.test.js
// Made-up commands and answers only: no Firebase tool runs here, no request leaves this machine,
// and every token is invented.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'check-access.js');
const { DATABASE_READ, SITE_ORIGIN, READ_TIMEOUT, RULES_VERDICT, command, readDatabase, readSite, report, main } = require('./check-access.js');
const { googleRequest, ASK_TIMEOUT } = require('./check-deploy-permissions.js');
const { LOG, KEPT } = require('./firebase-refusal.js');

const PROJECT = 'made-up-project';
const TOKEN = 'ya29.c.MadeUpAccessToken-0123456789_abcdefghijklmnop';
const SITES = { sites: [{ name: 'projects/made-up-project/sites/made-up-site', defaultUrl: 'https://made-up-site.web.app', type: 'DEFAULT_SITE' }] };
const HOSTING_OFF = {
    status: 403,
    data: {
        error: {
            code: 403,
            status: 'PERMISSION_DENIED',
            message: `Firebase Hosting API has not been used in project 1054623883511 before or it is disabled. Enable it by visiting https://console.developers.google.com/apis/api/firebasehosting.googleapis.com/overview?project=1054623883511 then retry. Token ${TOKEN}`,
            details: [{ reason: 'SERVICE_DISABLED', metadata: { service: 'firebasehosting.googleapis.com', consumer: 'projects/1054623883511' } }],
        },
    },
};

// What the Firebase tool writes to its debug file when Google refuses a request.
const DATABASE_OFF = [
    '[debug] [2026-11-11T19:00:00.000Z] >>> [apiv2][query] GET https://firebasedatabase.googleapis.com/v1beta/projects/made-up-project/locations/-/instances/made-up-project [none]',
    `[debug] [2026-11-11T19:00:00.100Z] >>> [apiv2][header] authorization: Bearer ${TOKEN}`,
    '[debug] [2026-11-11T19:00:00.200Z] <<< [apiv2][status] GET https://firebasedatabase.googleapis.com/v1beta/projects/made-up-project/locations/-/instances/made-up-project 403',
    '[debug] [2026-11-11T19:00:00.300Z] <<< [apiv2][body] GET https://firebasedatabase.googleapis.com/v1beta/projects/made-up-project/locations/-/instances/made-up-project ' + JSON.stringify({
        error: {
            code: 403,
            status: 'PERMISSION_DENIED',
            message: `The API has not been used in project 1054623883511 before or it is disabled. Token ${TOKEN}`,
            details: [{ reason: 'SERVICE_DISABLED', metadata: { service: 'firebasedatabase.googleapis.com' } }],
        },
    }),
    '',
].join('\n');

const tmp = t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-access-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
};

// A made-up tool: it writes `log` to the debug file and ends with `code`. Like the real one, it
// appends to the file and deletes its first name when it exits with 0 or 1.
const tool = (code, log = '', calls = []) => (args, dir) => {
    const file = path.join(dir, LOG);
    calls.push({ args, startedEmpty: fs.readFileSync(file, 'utf8') === '' });
    fs.appendFileSync(file, log);
    if (code === 0 || code === 1) {
        fs.rmSync(file);
    }
    return code;
};
// A made-up Google: it answers with `answer`, and remembers what it was asked.
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

test('the database read is the tool\'s dry run, and nothing else of the tool runs', () => {
    assert.deepStrictEqual(command(PROJECT), ['firebase', 'deploy', '--only', 'database', '--dry-run', '--project', PROJECT, '--non-interactive']);
    assert.deepStrictEqual(DATABASE_READ, ['deploy', '--only', 'database', '--dry-run']);
    assert.ok(READ_TIMEOUT > 0 && READ_TIMEOUT <= 10 * 60 * 1000);
    // The script runs no hosting command of the tool: each of those can switch the Hosting API on.
    const code = fs.readFileSync(SCRIPT, 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(code, /hosting:/);
    assert.doesNotMatch(code, /--force|:enable|serviceusage/);
    assert.strictEqual((code.match(/spawnSync\(/g) || []).length, 1);
});

test('the site read is one GET, with no body, to the list of the project\'s hosting sites', async () => {
    const seen = [];
    const site = await readSite(PROJECT, answering({ status: 200, data: SITES }, seen));
    assert.strictEqual(site.ok, true);
    assert.deepStrictEqual(seen, [{
        url: 'https://firebasehosting.googleapis.com/v1beta1/projects/made-up-project/sites?pageSize=10',
        method: 'GET',
    }]);
    assert.strictEqual(SITE_ORIGIN, 'https://firebasehosting.googleapis.com');
    // Through the permission check's own request: still a GET without a body, redirects refused,
    // the same time-out. The client here is made up and remembers what it is given.
    const given = [];
    const auth = { getClient: async () => ({ request: async options => { given.push(options); return { status: 200, data: SITES }; } }) };
    assert.strictEqual((await readSite(PROJECT, googleRequest(auth))).ok, true);
    assert.strictEqual(given.length, 1);
    assert.strictEqual(given[0].method, 'GET');
    assert.ok(!('data' in given[0]) && !('body' in given[0]));
    assert.strictEqual(given[0].redirect, 'manual');
    assert.strictEqual(given[0].maxRedirects, 0);
    assert.strictEqual(given[0].retry, false);
    assert.strictEqual(given[0].timeout, ASK_TIMEOUT);
    // A failed read asks no second question either: nothing is tried to mend it.
    for (const answer of [HOSTING_OFF, { status: 404, data: {} }, { status: 200, data: {} }, new Error('x')]) {
        const asked = [];
        assert.strictEqual((await readSite(PROJECT, answering(answer, asked))).ok, false);
        assert.deepStrictEqual(asked.map(o => o.method), ['GET']);
    }
});

test('the Hosting API off: the site read fails, names the API, and says it switches nothing on', async () => {
    const site = await readSite(PROJECT, answering(HOSTING_OFF));
    assert.strictEqual(site.ok, false);
    const text = report(PROJECT, [{ what: 'the database', shown: 'x', ok: true, note: '' }, site]);
    assert.match(text, /the site \(GET firebasehosting\.googleapis\.com\/v1beta1\/projects\/made-up-project\/sites\): NOT reached, status 403/);
    assert.match(text, /reason: SERVICE_DISABLED/);
    assert.match(text, /service: firebasehosting\.googleapis\.com/);
    assert.match(text, /The Firebase Hosting API \(firebasehosting\.googleapis\.com\) is off in the project\. This check does not switch it/);
    assert.doesNotMatch(text, /\?project=/);
    assert.ok(!text.includes('MadeUpAccessToken'));
    // A refusal that is not a disabled API does not blame the API.
    const denied = await readSite(PROJECT, answering({ status: 403, data: { error: { status: 'PERMISSION_DENIED', message: 'The caller does not have permission' } } }));
    assert.strictEqual(denied.ok, false);
    assert.doesNotMatch(denied.why, /is off in the project/);
});

test('any answer about the site that is not a list with a site stops the run, and shows nothing secret', async () => {
    const quoted = `Bad token ${TOKEN} with Bearer ${TOKEN}`;
    const answers = [
        { status: 401, data: { error: { status: 'UNAUTHENTICATED', message: quoted } } },
        { status: 500, data: `<html>${quoted}</html>` },
        { status: 307, data: SITES },
        { status: 201, data: SITES },
        { status: 204, data: undefined },
        { status: 200, data: null },
        { status: 200, data: 'ok' },
        { status: 200, data: [] },
        { status: 200, data: {} },
        { status: 200, data: { sites: [] } },
        { status: 200, data: { sites: 'all' } },
        { status: 200, data: { sites: [TOKEN, null, 7] } },
        { status: TOKEN, data: SITES },
        undefined,
        new Error(quoted),
        Object.assign(new Error(quoted), { code: TOKEN }),
        Object.assign(new Error('network timeout at: https://firebasehosting.googleapis.com/'), {}),
        Object.assign(new Error('x'), { response: { status: 400, data: { error: 'invalid_grant', error_description: quoted } } }),
    ];
    for (const answer of answers) {
        const site = await readSite(PROJECT, answering(answer));
        assert.strictEqual(site.ok, false, JSON.stringify(answer));
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

test('both reads pass: the run goes on', async t => {
    const out = quiet(t);
    const calls = [];
    const seen = [];
    const dir = tmp(t);
    assert.strictEqual(await main(PROJECT, dir, tool(0, '', calls), answering({ status: 200, data: SITES }, seen)), 0);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(seen.length, 1);
    const text = out.join('\n');
    assert.match(text, /reached the database and the site of made-up-project\. Nothing was released\./);
    assert.match(text, /the database \(firebase deploy --only database --dry-run\): reached/);
    assert.match(text, /the site \(GET firebasehosting\.googleapis\.com\/v1beta1\/projects\/made-up-project\/sites\): reached, 1 site/);
    assert.doesNotMatch(text, /Deploy stopped|::error/);
});

test('the database read fails: the site read still runs, both are reported, and the run stops', async t => {
    const out = quiet(t);
    const calls = [];
    const seen = [];
    const dir = tmp(t);
    const code = await main(PROJECT, dir, tool(1, DATABASE_OFF, calls), answering({ status: 200, data: SITES }, seen));
    assert.strictEqual(code, 1);
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].startedEmpty, true);
    // The site was still asked, once, with a GET.
    assert.deepStrictEqual(seen.map(o => o.method), ['GET']);
    const text = out.join('\n');
    assert.match(text, /Deploy stopped, nothing released\. Both reads were tried/);
    assert.match(text, /the database \(firebase deploy --only database --dry-run\): NOT reached, exit code 1/);
    assert.match(text, /the site \(GET [^)]+\): reached, 1 site/);
    assert.match(text, /Why the database was not reached:/);
    assert.match(text, /403 to GET firebasedatabase\.googleapis\.com\/v1beta\/projects\/made-up-project/);
    assert.match(text, /service: firebasedatabase\.googleapis\.com/);
    assert.doesNotMatch(text, /Why the site was not reached/);
    assert.match(text, /^::error title=Deploy stopped, nothing released: no access to the database::/m);
});

test('the site read fails alone: the run stops and names the site', async t => {
    const out = quiet(t);
    const dir = tmp(t);
    assert.strictEqual(await main(PROJECT, dir, tool(0), answering(HOSTING_OFF)), 1);
    const text = out.join('\n');
    assert.match(text, /the database \(firebase deploy --only database --dry-run\): reached/);
    assert.match(text, /the site \(GET [^)]+\): NOT reached, status 403/);
    assert.match(text, /service: firebasehosting\.googleapis\.com/);
    assert.doesNotMatch(text, /Why the database was not reached/);
    assert.match(text, /^::error title=Deploy stopped, nothing released: no access to the site::/m);
});

test('both reads fail: one run names both, each with its own reason', async t => {
    const out = quiet(t);
    const dir = tmp(t);
    const summary = path.join(dir, 'summary.md');
    process.env.GITHUB_STEP_SUMMARY = summary;
    t.after(() => { delete process.env.GITHUB_STEP_SUMMARY; });
    assert.strictEqual(await main(PROJECT, dir, tool(1, DATABASE_OFF), answering(HOSTING_OFF)), 1);
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
    // No debug file is left for the next step to print a second time.
    assert.ok(!fs.existsSync(path.join(dir, LOG)));
    assert.ok(!fs.existsSync(path.join(dir, KEPT)));
    // Nothing of the debug file or the answer but the filtered fields is shown.
    for (const shown of [text, page]) {
        assert.ok(!shown.includes('MadeUpAccessToken'), shown);
        assert.doesNotMatch(shown, /authorization|Bearer ya29/);
    }
});

test('a database read that cannot start, hangs or is killed counts as failed, and the site is still read', async t => {
    quiet(t);
    const dir = tmp(t);
    for (const end of ['timed out', 'could not start', 'killed', null, undefined, '0', 137]) {
        const result = readDatabase(PROJECT, dir, () => end);
        assert.strictEqual(result.ok, false, String(end));
        assert.match(result.why, /left no Firebase debug file with content/);
        const seen = [];
        assert.strictEqual(await main(PROJECT, dir, () => end, answering({ status: 200, data: SITES }, seen)), 1);
        assert.strictEqual(seen.length, 1);
    }
    const thrown = readDatabase(PROJECT, dir, () => { throw new Error(TOKEN); });
    assert.strictEqual(thrown.ok, false);
    assert.ok(!report(PROJECT, [thrown]).includes('MadeUpAccessToken'));
    assert.match(report(PROJECT, [readDatabase(PROJECT, dir, () => 'timed out')]), /NOT reached, timed out/);
});

// The script itself, whole, with a made-up `npx` first on the PATH in place of the real tool,
// and no sign-in: the key file it is pointed to does not exist, so the site read asks nobody.
test('as the workflow runs it: the made-up database read runs, both reads are reported, and the exit code is 1', t => {
    const dir = tmp(t);
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    const ran = path.join(dir, 'ran.txt');
    fs.writeFileSync(path.join(bin, 'npx'), [
        '#!/usr/bin/env node',
        'const fs = require("fs");',
        `fs.appendFileSync(${JSON.stringify(ran)}, process.argv.slice(2).join(" ") + "\\n");`,
        `fs.appendFileSync("firebase-debug.log", ${JSON.stringify(DATABASE_OFF)});`,
        'console.log("Error: made-up failure of the database");',
        'process.exit(process.env.MADE_UP_EXIT === "0" ? 0 : 1);',
        '',
    ].join('\n'), { mode: 0o755 });
    const work = path.join(dir, 'work');
    fs.mkdirSync(work);
    const env = Object.assign({}, process.env, {
        PATH: bin + path.delimiter + process.env.PATH,
        GOOGLE_APPLICATION_CREDENTIALS: path.join(dir, 'no-such-key.json'),
    });
    delete env.GITHUB_STEP_SUMMARY;
    for (const exit of ['1', '0']) {
        fs.rmSync(ran, { force: true });
        const out = spawnSync('node', [SCRIPT, PROJECT, work], { env: Object.assign({}, env, { MADE_UP_EXIT: exit }), encoding: 'utf8', timeout: 90000 });
        // Also with the database reached, the run stops: the site was not.
        assert.strictEqual(out.status, 1, out.stdout + out.stderr);
        assert.deepStrictEqual(fs.readFileSync(ran, 'utf8').trim().split('\n'), [
            'firebase deploy --only database --dry-run --project made-up-project --non-interactive',
        ]);
        assert.match(out.stdout, /the site \(GET firebasehosting\.googleapis\.com\/v1beta1\/projects\/made-up-project\/sites\): NOT reached, no answer/);
        assert.match(out.stdout, /Why the site was not reached:/);
        if (exit === '1') {
            assert.match(out.stdout, /Why the database was not reached:[\s\S]*service: firebasedatabase\.googleapis\.com[\s\S]*Why the site was not reached:/);
            assert.match(out.stdout, /^::error title=Deploy stopped, nothing released: no access to the database and the site::/m);
        } else {
            assert.match(out.stdout, /the database \(firebase deploy --only database --dry-run\): reached/);
            assert.match(out.stdout, /^::error title=Deploy stopped, nothing released: no access to the site::/m);
        }
        assert.ok(!(out.stdout + out.stderr).includes('MadeUpAccessToken'));
        assert.doesNotMatch(out.stdout + out.stderr, /no-such-key|\n\s+at /);
        assert.deepStrictEqual(fs.readdirSync(work), []);
    }
    fs.rmSync(ran);
    const bad = spawnSync('node', [SCRIPT, 'Not A Project'], { env, encoding: 'utf8' });
    assert.strictEqual(bad.status, 1);
    assert.match(bad.stderr, /Usage/);
    assert.ok(!fs.existsSync(ran));
});

// The site read through Google's real library, to a server on this machine. It needs the
// library, which only `npm ci` at the repository's root installs: the Tests workflow installs
// nothing for these scripts, so there this test is skipped.
let library = null;
try {
    library = require('google-auth-library');
} catch (e) {
    // not installed
}
test('through Google\'s library: the site read sends one GET and follows no redirect', { skip: !library && 'google-auth-library is not installed' }, async t => {
    const saved = {};
    for (const name of ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy']) {
        saved[name] = process.env[name];
        delete process.env[name];
    }
    t.after(() => Object.keys(saved).forEach(n => saved[n] === undefined || (process.env[n] = saved[n])));
    let mode = 'sites';
    const seen = [];
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', d => { body += d; });
        req.on('end', () => {
            seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
            res.setHeader('content-type', 'application/json');
            if (mode === 'redirect' && req.url.startsWith('/v1beta1/')) {
                res.statusCode = 307;
                res.setHeader('location', '/elsewhere');
                res.end();
            } else if (mode === 'off') {
                res.statusCode = 403;
                res.end(JSON.stringify(HOSTING_OFF.data));
            } else {
                res.end(JSON.stringify(SITES));
            }
        });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => server.close());
    const origin = 'http://127.0.0.1:' + server.address().port;
    const client = new library.OAuth2Client();
    client.setCredentials({ access_token: TOKEN });
    const request = googleRequest({ getClient: async () => client });

    const yes = await readSite(PROJECT, request, origin);
    assert.strictEqual(yes.ok, true);
    mode = 'off';
    const off = await readSite(PROJECT, request, origin);
    assert.strictEqual(off.ok, false);
    assert.match(off.why, /The Firebase Hosting API \(firebasehosting\.googleapis\.com\) is off/);
    mode = 'redirect';
    const moved = await readSite(PROJECT, request, origin);
    assert.strictEqual(moved.ok, false);
    assert.match(moved.why, /^307 to GET/);
    // Three reads, three requests: each a GET without a body, to the list of sites, and none
    // to the address of the redirect.
    assert.deepStrictEqual(seen, [0, 1, 2].map(() => ({ method: 'GET', url: '/v1beta1/projects/made-up-project/sites?pageSize=10', auth: 'Bearer ' + TOKEN, body: '' })));
    for (const r of [yes, off, moved]) {
        assert.ok(!report(PROJECT, [r]).includes('MadeUpAccessToken'));
    }
});

// The one way on without the database read: the database API is off, the site was reached, and
// the rules that are live are the same as this commit's. live-rules.test.js has every answer of
// the four GETs; here it is what the step does with their verdict.
const RULES = { rules: { '.read': false, games: { $pin: { '.read': true, '.write': 'auth.uid == \'made-up-worker\'' } } } };
const API_OFF = {
    status: 403,
    data: { error: { code: 403, status: 'PERMISSION_DENIED', message: `Firebase Realtime Database Management API has not been used in project 1054623883511 before or it is disabled. Token ${TOKEN}`, details: [{ reason: 'SERVICE_DISABLED', metadata: { service: 'firebasedatabase.googleapis.com' } }] } },
};
// A made-up Google with every address the step may ask. `change` alters the answers.
const wholeGoogle = (change = () => {}, seen = []) => {
    const answers = {
        'https://firebasehosting.googleapis.com/v1beta1/projects/made-up-project/sites?pageSize=10': { status: 200, data: SITES },
        'https://firebase.googleapis.com/v1beta1/projects/made-up-project': { status: 200, data: { projectId: PROJECT, resources: { realtimeDatabaseInstance: PROJECT } } },
        'https://firebasedatabase.googleapis.com/v1beta/projects/made-up-project/locations/-/instances/made-up-project': API_OFF,
        'https://firebase.googleapis.com/v1beta1/projects/made-up-project/adminSdkConfig': { status: 200, data: { projectId: PROJECT, databaseURL: 'https://made-up-project.firebaseio.com' } },
        'https://made-up-project.firebaseio.com/.settings/rules.json': { status: 200, data: JSON.parse(JSON.stringify(RULES)) },
    };
    change(answers);
    return async options => {
        seen.push(options);
        return answers[options.url] || { status: 404, data: { error: { code: 404, status: 'NOT_FOUND', message: 'made-up: nothing here' } } };
    };
};
const RULES_URL = 'https://made-up-project.firebaseio.com/.settings/rules.json';
const SITES_URL = 'https://firebasehosting.googleapis.com/v1beta1/projects/made-up-project/sites?pageSize=10';
// A made-up checkout with the rules file, and files for the step's summary and outputs.
const checkout = t => {
    const dir = tmp(t);
    fs.writeFileSync(path.join(dir, 'firebase.json'), JSON.stringify({ database: { rules: 'database-rules.json' } }));
    fs.writeFileSync(path.join(dir, 'database-rules.json'), JSON.stringify(RULES, null, 4));
    const pages = fs.mkdtempSync(path.join(os.tmpdir(), 'check-access-pages-'));
    t.after(() => fs.rmSync(pages, { recursive: true, force: true }));
    process.env.GITHUB_STEP_SUMMARY = path.join(pages, 'summary.md');
    process.env.GITHUB_OUTPUT = path.join(pages, 'output.txt');
    fs.writeFileSync(process.env.GITHUB_OUTPUT, '');
    t.after(() => {
        delete process.env.GITHUB_STEP_SUMMARY;
        delete process.env.GITHUB_OUTPUT;
    });
    return { dir, output: () => fs.readFileSync(path.join(pages, 'output.txt'), 'utf8'), page: () => fs.readFileSync(path.join(pages, 'summary.md'), 'utf8') };
};

test('the database API off, the site reached, the live rules unchanged: the step passes and says rules=unchanged', async t => {
    const out = quiet(t);
    const { dir, output, page } = checkout(t);
    const seen = [];
    assert.strictEqual(await main(PROJECT, dir, tool(1, DATABASE_OFF), wholeGoogle(undefined, seen)), 0);
    assert.strictEqual(output(), 'rules=unchanged\n');
    // Five requests, every one a GET without a body.
    assert.strictEqual(seen.length, 5);
    assert.ok(seen.every(o => o.method === 'GET' && !('data' in o) && !('body' in o)));
    const text = out.join('\n');
    assert.match(text, /The run goes on WITHOUT the database rules step/);
    assert.match(text, /the database \(firebase deploy --only database --dry-run\): NOT reached, exit code 1/);
    assert.match(text, /the site \(GET [^)]+\): reached, 1 site/);
    assert.match(text, /the Firebase Realtime Database Management API is off, and the live rules are the same as this commit's/);
    assert.match(text, /releases the functions and the site, and leaves the rules\nalone/);
    assert.match(text, /^::warning title=The database rules are left alone::/m);
    assert.doesNotMatch(text, /::error|Deploy stopped/);
    assert.strictEqual(page().includes('The run goes on WITHOUT the database rules step'), true);
    for (const shown of [text, page()]) {
        assert.doesNotMatch(shown, /MadeUpAccessToken|made-up-worker|firebaseio\.com/);
    }
    // The debug file of the failed read is gone: no later step prints it.
    assert.ok(!fs.existsSync(path.join(dir, LOG)));
    assert.ok(!fs.existsSync(path.join(dir, KEPT)));
});

test('both reads pass: the step says rules=deploy and asks nothing about the live rules', async t => {
    quiet(t);
    const { dir, output } = checkout(t);
    const seen = [];
    assert.strictEqual(await main(PROJECT, dir, tool(0), wholeGoogle(undefined, seen)), 0);
    assert.strictEqual(output(), 'rules=deploy\n');
    assert.deepStrictEqual(seen.map(o => o.url), [SITES_URL]);
});

test('the live rules differ, or cannot be read: the step fails as before, and writes no output', async t => {
    const cases = {
        'the live rules differ': [a => { a[RULES_URL].data.rules['.read'] = true; }, /the live rules differ from this commit's/],
        'the live rules are refused': [a => { a[RULES_URL] = { status: 401, data: { error: 'Unauthorized request.' } }; }, /the live rules could not be read or compared/],
        'the live rules are not JSON': [a => { a[RULES_URL] = { status: 200, data: '// a comment\n{}' }; }, /the live rules could not be read or compared/],
        'the address is not known': [a => { delete a['https://firebase.googleapis.com/v1beta1/projects/made-up-project/adminSdkConfig']; }, /the live rules could not be read or compared/],
        'the database read failed for another reason': [a => { a['https://firebasedatabase.googleapis.com/v1beta/projects/made-up-project/locations/-/instances/made-up-project'] = { status: 200, data: {} }; }, /did not fail because the Firebase Realtime Database Management API is off/],
    };
    for (const [name, [change, said]] of Object.entries(cases)) {
        const out = quiet(t);
        const { dir, output } = checkout(t);
        assert.strictEqual(await main(PROJECT, dir, tool(1, DATABASE_OFF), wholeGoogle(change)), 1, name);
        assert.strictEqual(output(), '', name);
        const text = out.join('\n');
        assert.match(text, said, name);
        assert.match(text, /Deploy stopped, nothing released\. Both reads were tried/, name);
        assert.match(text, /^::error title=Deploy stopped, nothing released: no access to the database::/m, name);
        assert.doesNotMatch(text, /goes on WITHOUT|::warning/, name);
        t.mock.restoreAll();
    }
});

test('the site not reached: unchanged rules do not let the run go on', async t => {
    const out = quiet(t);
    const { dir, output } = checkout(t);
    assert.strictEqual(await main(PROJECT, dir, tool(1, DATABASE_OFF), wholeGoogle(a => { a[SITES_URL] = HOSTING_OFF; })), 1);
    assert.strictEqual(output(), '');
    const text = out.join('\n');
    assert.match(text, /Deploy stopped, nothing released/);
    assert.match(text, /The rules alone would not have stopped this run; the site did\./);
    assert.match(text, /no access to the database and the site::/);
    assert.doesNotMatch(text, /goes on WITHOUT|::warning/);
});

test('a database read that passed never takes the other way, whatever the live rules are', async t => {
    quiet(t);
    const { dir, output } = checkout(t);
    const seen = [];
    assert.strictEqual(await main(PROJECT, dir, tool(0), wholeGoogle(a => { a[RULES_URL].data.rules['.read'] = true; }, seen)), 0);
    assert.strictEqual(output(), 'rules=deploy\n');
    assert.ok(!seen.some(o => o.url === RULES_URL));
});

test('the report reads an unknown verdict as a stop', () => {
    const database = { what: 'the database', shown: 'x', ok: false, note: 'exit code 1', why: 'why' };
    const site = { what: 'the site', shown: 'y', ok: true, note: '1 site', why: null };
    for (const verdict of ['changed', 'unknown', 'other', 'UNCHANGED', '', undefined]) {
        assert.match(report(PROJECT, [database, site], { verdict, lines: ['l'] }), /^Deploy stopped, nothing released/);
    }
    assert.match(report(PROJECT, [database, site], null), /^Deploy stopped, nothing released/);
    assert.match(report(PROJECT, [database, site], { verdict: 'unchanged', lines: ['l'] }), /^The run goes on WITHOUT the database rules step/);
    assert.match(report(PROJECT, [database, Object.assign({}, site, { ok: false, why: 'w' })], { verdict: 'unchanged', lines: ['l'] }), /^Deploy stopped, nothing released/);
    assert.deepStrictEqual(Object.keys(RULES_VERDICT), ['unchanged', 'changed', 'unknown', 'other']);
});
