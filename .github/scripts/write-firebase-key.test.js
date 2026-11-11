// node --test .github/scripts/*.test.js
// Made-up keys only. Checks what the script says, writes and never prints.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'write-firebase-key.js');
const PROJECT = 'bullshit-wtf-prod';
const GOOD = { type: 'service_account', project_id: PROJECT, client_email: 'deploy@example.invalid', private_key: 'MADE-UP-PRIVATE-KEY' };
const run = (args, secret) => {
    const env = Object.assign({}, process.env);
    delete env.FIREBASE_SERVICE_ACCOUNT;
    if (secret !== undefined) { env.FIREBASE_SERVICE_ACCOUNT = secret; }
    return spawnSync('node', [SCRIPT, ...args], { env, encoding: 'utf8' });
};
const tmp = t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'key-test-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
};

test('a missing key stops the run and says to start a new run on master, not to re-run', () => {
    for (const secret of [undefined, '', '   ']) {
        const out = run(['--check-only', PROJECT], secret);
        assert.strictEqual(out.status, 1);
        assert.match(out.stdout, /is not set\. Nothing was deployed\./);
        assert.match(out.stdout, /Run workflow > branch master/);
        assert.match(out.stdout, /Do not re-run an old failed run/);
        assert.doesNotMatch(out.stdout, /then re-run this workflow/);
    }
});

test('a badly shaped key stops the run, writes nothing and prints nothing of the value', t => {
    const dir = tmp(t);
    const bad = ['{broken', 'null', '[]', JSON.stringify(Object.assign({}, GOOD, { type: 'user' })),
        JSON.stringify(Object.assign({}, GOOD, { private_key: '' })),
        JSON.stringify(Object.assign({}, GOOD, { project_id: 'another-project' }))];
    for (const secret of bad) {
        for (const first of ['--check-only', path.join(dir, 'key.json')]) {
            const out = run([first, PROJECT], secret);
            assert.strictEqual(out.status, 1, secret);
            assert.match(out.stdout, /^::error title=Deploy stopped before it started::/);
            assert.doesNotMatch(out.stdout + out.stderr, /MADE-UP-PRIVATE-KEY/);
        }
    }
    assert.deepStrictEqual(fs.readdirSync(dir), []);
});

test('a good key: check only writes nothing, write mode writes an owner-only file', t => {
    const dir = tmp(t);
    const file = path.join(dir, 'key.json');
    const checked = spawnSync('node', [SCRIPT, '--check-only', PROJECT],
        { cwd: dir, env: Object.assign({}, process.env, { FIREBASE_SERVICE_ACCOUNT: JSON.stringify(GOOD) }), encoding: 'utf8' });
    assert.strictEqual(checked.status, 0);
    assert.match(checked.stdout, /Key accepted: deploy@example\.invalid in bullshit-wtf-prod\. Not written to disk yet\./);
    assert.deepStrictEqual(fs.readdirSync(dir), []);
    const written = run([file, PROJECT], JSON.stringify(GOOD));
    assert.strictEqual(written.status, 0);
    assert.doesNotMatch(written.stdout + written.stderr, /MADE-UP-PRIVATE-KEY/);
    assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), GOOD);
});

test('no arguments: usage and exit 1', () => {
    assert.strictEqual(run([], JSON.stringify(GOOD)).status, 1);
    assert.strictEqual(run(['--check-only'], JSON.stringify(GOOD)).status, 1);
});
