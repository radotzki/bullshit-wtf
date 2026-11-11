// node --test .github/scripts/*.test.js
// Made-up commands and answers only: no Firebase tool runs here, no request leaves this machine,
// and every token is invented.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'check-access.js');
const { READS, READ_TIMEOUT, command, readAll, report, main } = require('./check-access.js');
const { LOG, KEPT } = require('./firebase-refusal.js');

const PROJECT = 'made-up-project';
const TOKEN = 'ya29.c.MadeUpAccessToken-0123456789_abcdefghijklmnop';

// What the Firebase tool writes to its debug file when Google refuses a request.
const refused = (host, urlPath, service) => [
    `[debug] [2026-11-11T19:00:00.000Z] >>> [apiv2][query] GET https://${host}${urlPath} [none]`,
    `[debug] [2026-11-11T19:00:00.100Z] >>> [apiv2][header] authorization: Bearer ${TOKEN}`,
    `[debug] [2026-11-11T19:00:00.200Z] <<< [apiv2][status] GET https://${host}${urlPath} 403`,
    `[debug] [2026-11-11T19:00:00.300Z] <<< [apiv2][body] GET https://${host}${urlPath} ` + JSON.stringify({
        error: {
            code: 403,
            status: 'PERMISSION_DENIED',
            message: `The API has not been used in project 1054623883511 before or it is disabled. Token ${TOKEN}`,
            details: [{ reason: 'SERVICE_DISABLED', metadata: { service } }],
        },
    }),
    '',
].join('\n');
const DATABASE_OFF = refused('firebasedatabase.googleapis.com', '/v1beta/projects/made-up-project/locations/-/instances/made-up-project', 'firebasedatabase.googleapis.com');
const HOSTING_OFF = refused('firebasehosting.googleapis.com', '/v1beta1/projects/made-up-project/sites', 'firebasehosting.googleapis.com');

const tmp = t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-access-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
};

// A made-up tool: for each read it writes `log` to the debug file and ends with `code`. Like the
// real one, it appends to the file and deletes its first name when it exits with 0 or 1.
const tool = (plan, calls = []) => (args, dir) => {
    const which = args.includes('hosting:channel:list') ? 'site' : 'database';
    const file = path.join(dir, LOG);
    calls.push({ args, startedEmpty: fs.readFileSync(file, 'utf8') === '' });
    const { code, log = '' } = plan[which];
    fs.appendFileSync(file, log);
    if (code === 0 || code === 1) {
        fs.rmSync(file);
    }
    return code;
};
const quiet = t => {
    const lines = [];
    t.mock.method(console, 'log', (...a) => lines.push(a.join(' ')));
    return lines;
};

test('the two reads are the database dry run and the hosting channel list, and release nothing', () => {
    assert.deepStrictEqual(READS.map(r => command(r, PROJECT)), [
        ['firebase', 'deploy', '--only', 'database', '--dry-run', '--project', PROJECT, '--non-interactive'],
        ['firebase', 'hosting:channel:list', '--project', PROJECT, '--non-interactive'],
    ]);
    // The only `deploy` among them is a dry run, and nothing is forced.
    for (const r of READS) {
        assert.ok(!r.args.includes('deploy') || r.args.includes('--dry-run'));
        assert.ok(!r.args.includes('--force'));
    }
    assert.ok(READ_TIMEOUT > 0 && READ_TIMEOUT <= 10 * 60 * 1000);
});

test('both reads pass: the run goes on', t => {
    const out = quiet(t);
    const calls = [];
    const dir = tmp(t);
    assert.strictEqual(main(PROJECT, dir, tool({ database: { code: 0 }, site: { code: 0 } }, calls)), 0);
    assert.strictEqual(calls.length, 2);
    const text = out.join('\n');
    assert.match(text, /reached the database and the site of made-up-project\. Nothing was released\./);
    assert.match(text, /the database \(firebase deploy --only database --dry-run\): reached/);
    assert.match(text, /the site \(firebase hosting:channel:list\): reached/);
    assert.doesNotMatch(text, /Deploy stopped|::error/);
});

test('the database read fails: the site read still runs, both are reported, and the run stops', t => {
    const out = quiet(t);
    const calls = [];
    const dir = tmp(t);
    const code = main(PROJECT, dir, tool({ database: { code: 1, log: DATABASE_OFF }, site: { code: 0 } }, calls));
    assert.strictEqual(code, 1);
    assert.deepStrictEqual(calls.map(c => c.args[1]), ['deploy', 'hosting:channel:list']);
    const text = out.join('\n');
    assert.match(text, /Deploy stopped, nothing released\. Both reads were tried/);
    assert.match(text, /the database \(firebase deploy --only database --dry-run\): NOT reached, exit code 1/);
    assert.match(text, /the site \(firebase hosting:channel:list\): reached/);
    assert.match(text, /Why the database was not reached:/);
    assert.match(text, /403 to GET firebasedatabase\.googleapis\.com\/v1beta\/projects\/made-up-project/);
    assert.match(text, /service: firebasedatabase\.googleapis\.com/);
    assert.doesNotMatch(text, /Why the site was not reached/);
    assert.match(text, /^::error title=Deploy stopped, nothing released: no access to the database::/m);
});

test('the site read fails alone: the run stops and names the site', t => {
    const out = quiet(t);
    const dir = tmp(t);
    assert.strictEqual(main(PROJECT, dir, tool({ database: { code: 0 }, site: { code: 2, log: HOSTING_OFF } })), 1);
    const text = out.join('\n');
    assert.match(text, /the database \(firebase deploy --only database --dry-run\): reached/);
    assert.match(text, /the site \(firebase hosting:channel:list\): NOT reached, exit code 2/);
    assert.match(text, /service: firebasehosting\.googleapis\.com/);
    assert.doesNotMatch(text, /Why the database was not reached/);
});

test('both reads fail: one run names both, each with its own reason', t => {
    const out = quiet(t);
    const calls = [];
    const dir = tmp(t);
    const summary = path.join(dir, 'summary.md');
    process.env.GITHUB_STEP_SUMMARY = summary;
    t.after(() => { delete process.env.GITHUB_STEP_SUMMARY; });
    const code = main(PROJECT, dir, tool({ database: { code: 1, log: DATABASE_OFF }, site: { code: 1, log: HOSTING_OFF } }, calls));
    assert.strictEqual(code, 1);
    assert.strictEqual(calls.length, 2);
    // Each read started from an empty debug file, so its reason is its own.
    assert.deepStrictEqual(calls.map(c => c.startedEmpty), [true, true]);
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
    // Nothing of the debug file but the filtered fields is shown.
    for (const shown of [text, page]) {
        assert.ok(!shown.includes('MadeUpAccessToken'), shown);
        assert.doesNotMatch(shown, /authorization|Bearer ya29/);
    }
});

test('a read that cannot start, hangs or is killed counts as failed, and the other still runs', t => {
    quiet(t);
    const dir = tmp(t);
    for (const end of ['timed out', 'could not start', 'killed', null, undefined, '0', 137]) {
        const calls = [];
        const results = readAll(PROJECT, dir, (args, d) => { calls.push(args); return args.includes('deploy') ? end : 0; });
        assert.strictEqual(calls.length, 2);
        assert.deepStrictEqual(results.map(r => r.ok), [false, true], String(end));
        assert.match(report(PROJECT, results), /Deploy stopped, nothing released/);
        assert.match(results[0].why, /left no Firebase debug file with content/);
    }
    const thrown = readAll(PROJECT, dir, args => { if (args.includes('deploy')) { throw new Error(TOKEN); } return 0; });
    assert.deepStrictEqual(thrown.map(r => r.ok), [false, true]);
    assert.ok(!report(PROJECT, thrown).includes('MadeUpAccessToken'));
    assert.match(report(PROJECT, readAll(PROJECT, dir, () => 'timed out')), /the site \(firebase hosting:channel:list\): NOT reached, timed out/);
});

// The script itself, whole, with a made-up `npx` first on the PATH in place of the real tool.
test('as the workflow runs it: both made-up reads run, both are reported, and the exit code is 1', t => {
    const dir = tmp(t);
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    const ran = path.join(dir, 'ran.txt');
    fs.writeFileSync(path.join(bin, 'npx'), [
        '#!/usr/bin/env node',
        'const fs = require("fs");',
        `fs.appendFileSync(${JSON.stringify(ran)}, process.argv.slice(2).join(" ") + "\\n");`,
        'const site = process.argv.includes("hosting:channel:list");',
        `fs.appendFileSync("firebase-debug.log", site ? ${JSON.stringify(HOSTING_OFF)} : ${JSON.stringify(DATABASE_OFF)});`,
        'console.log("Error: made-up failure of " + (site ? "the site" : "the database"));',
        'process.exit(process.env.MADE_UP_EXIT === "0" ? 0 : site ? 2 : 1);',
        '',
    ].join('\n'), { mode: 0o755 });
    const work = path.join(dir, 'work');
    fs.mkdirSync(work);
    const env = Object.assign({}, process.env, { PATH: bin + path.delimiter + process.env.PATH });
    delete env.GITHUB_STEP_SUMMARY;
    const out = spawnSync('node', [SCRIPT, PROJECT, work], { env, encoding: 'utf8', timeout: 60000 });
    assert.strictEqual(out.status, 1, out.stdout + out.stderr);
    assert.deepStrictEqual(fs.readFileSync(ran, 'utf8').trim().split('\n'), [
        'firebase deploy --only database --dry-run --project made-up-project --non-interactive',
        'firebase hosting:channel:list --project made-up-project --non-interactive',
    ]);
    assert.match(out.stdout, /Why the database was not reached:[\s\S]*service: firebasedatabase\.googleapis\.com[\s\S]*Why the site was not reached:[\s\S]*service: firebasehosting\.googleapis\.com/);
    assert.match(out.stdout, /^::error title=Deploy stopped, nothing released: no access to the database and the site::/m);
    assert.ok(!(out.stdout + out.stderr).includes('MadeUpAccessToken'));
    assert.deepStrictEqual(fs.readdirSync(work), []);

    fs.rmSync(ran);
    const ok = spawnSync('node', [SCRIPT, PROJECT, work], { env: Object.assign({}, env, { MADE_UP_EXIT: '0' }), encoding: 'utf8', timeout: 60000 });
    assert.strictEqual(ok.status, 0, ok.stdout + ok.stderr);
    assert.strictEqual(fs.readFileSync(ran, 'utf8').trim().split('\n').length, 2);
    assert.doesNotMatch(ok.stdout, /Deploy stopped|::error/);

    const bad = spawnSync('node', [SCRIPT, 'Not A Project'], { env, encoding: 'utf8' });
    assert.strictEqual(bad.status, 1);
    assert.match(bad.stderr, /Usage/);
    assert.ok(!fs.existsSync(ran) || fs.readFileSync(ran, 'utf8').trim().split('\n').length === 2);
});
