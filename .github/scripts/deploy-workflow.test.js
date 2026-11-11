// node --test .github/scripts/*.test.js
// The order of the deploy job's steps, read from deploy.yml as text: every check comes before
// the first step that changes production.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const yml = fs.readFileSync(path.join(__dirname, '..', 'workflows', 'deploy.yml'), 'utf8');
const names = [...yml.matchAll(/^      - name: (.+)$/gm)].map(m => m[1]);
const at = name => {
    const i = names.indexOf(name);
    assert.notStrictEqual(i, -1, 'step not found: ' + name);
    return i;
};

test('the steps run in the intended order', () => {
    const order = [
        'Check this commit is still the head of master',
        'Check the Firebase key',
        'Install the Firebase CLI',
        'Install and build the functions',
        'Install and build the site',
        'Check again that this commit is still the head of master',
        'Write the Firebase key',
        'Check the deploy account\'s permissions (releases nothing)',
        'Check access to the database and the site (releases nothing)',
        '1. Deploy all functions',
        '2. Deploy the database rules',
        '3. Deploy the site',
        'Show why the step failed',
        'Summary',
        'Remove the key file and the Firebase debug files',
    ];
    const found = order.map(at);
    assert.deepStrictEqual(found, [...found].sort((a, b) => a - b));
});

test('the only commands that change production are the three deploys, each for the named project', () => {
    const lines = yml.split('\n').filter(l => /npx firebase /.test(l) && !l.trim().startsWith('#'));
    assert.deepStrictEqual(lines.map(l => l.trim().replace(/^run: /, '')), [
        'npx firebase deploy --only functions --project "$FIREBASE_PROJECT" --non-interactive',
        'npx firebase deploy --only database --project "$FIREBASE_PROJECT" --non-interactive',
        'npx firebase deploy --only hosting --project "$FIREBASE_PROJECT" --non-interactive',
    ]);
    const code = yml.split('\n').filter(l => !l.trim().startsWith('#')).join('\n');
    assert.doesNotMatch(code, /--force/);
    // No workflow file runs the tool in any other way, and none runs a hosting command or a dry run.
    assert.doesNotMatch(code.replace(/npx firebase /g, ''), /\bfirebase (deploy|hosting|functions|database)\b/);
    assert.doesNotMatch(code, /hosting:|--dry-run/);
});

// The Firebase tool can switch an API on while it only reads: its hosting commands do it for the
// Hosting API, and its database dry run for the Cloud Resource Manager API when Google answers
// "not found" for the project. So nothing before the first release may run the tool at all.
test('no step before the first release runs the Firebase tool, and neither check script can', () => {
    const job = yml.slice(yml.indexOf('\n  deploy:\n'));
    const before = job.slice(job.indexOf('\n    steps:\n'), job.indexOf('      - name: 1. Deploy all functions'))
        .split('\n').filter(l => !l.trim().startsWith('#'));
    // Every command line of those steps: a one-line `run:`, or the lines of a `run: |` block.
    const runs = [];
    let block = -1;
    for (const l of before) {
        const indent = l.length - l.trimStart().length;
        const one = l.match(/^\s+(?:- )?run: (.+)$/);
        if (block >= 0 && l.trim() && indent > block) {
            runs.push(l.trim());
        } else if (one) {
            block = one[1] === '|' ? indent : -1;
            if (one[1] !== '|') {
                runs.push(one[1]);
            }
        } else if (l.trim()) {
            block = -1;
        }
    }
    assert.deepStrictEqual(runs, [
        'node .github/scripts/check-master-head.js "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY" master "$GITHUB_SHA"',
        'node .github/scripts/write-firebase-key.js --check-only "$FIREBASE_PROJECT"',
        'npm ci',
        'npm ci',
        'npm run build',
        'npm ci',
        'npm run build',
        'node .github/scripts/check-master-head.js "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY" master "$GITHUB_SHA"',
        'node .github/scripts/write-firebase-key.js "$RUNNER_TEMP/firebase-key.json" "$FIREBASE_PROJECT"',
        'echo "GOOGLE_APPLICATION_CREDENTIALS=$RUNNER_TEMP/firebase-key.json" >> "$GITHUB_ENV"',
        'node .github/scripts/check-deploy-permissions.js "$FIREBASE_PROJECT"',
        'node .github/scripts/check-access.js "$FIREBASE_PROJECT"',
    ]);
    assert.doesNotMatch(before.join('\n'), /firebase (deploy|hosting|functions|database)|npx|gcloud|curl/);
    // The two scripts that hold the key's sign-in start no other program, and send no request
    // that switches a service on.
    for (const name of ['check-access.js', 'check-deploy-permissions.js']) {
        const code = fs.readFileSync(path.join(__dirname, name), 'utf8').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        assert.doesNotMatch(code, /child_process|spawn|exec\(|npx/, name);
        assert.doesNotMatch(code, /:enable|serviceusage\.googleapis|services\/|'(PATCH|DELETE)'/, name);
    }
});

test('both reads of the access check run in one step, for the run\'s project, before any release', () => {
    const code = yml.split('\n').filter(l => !l.trim().startsWith('#'));
    const calls = code.filter(l => l.includes('check-access.js'));
    assert.deepStrictEqual(calls.map(l => l.trim()), ['run: node .github/scripts/check-access.js "$FIREBASE_PROJECT"']);
    const read = code.findIndex(l => l.includes('check-access.js'));
    const asked = code.findIndex(l => l.includes('check-deploy-permissions.js'));
    const firstFirebase = code.findIndex(l => /npx firebase /.test(l));
    assert.ok(asked < read && read < firstFirebase);
    // No condition and no continue-on-error: when it fails, every release step is skipped.
    const step = yml.slice(yml.indexOf('      - name: Check access to the database and the site'), yml.indexOf('      # The order matters'));
    assert.strictEqual(step.trim(), [
        '- name: Check access to the database and the site (releases nothing)',
        '        run: node .github/scripts/check-access.js "$FIREBASE_PROJECT"',
    ].join('\n'));
});

// A step with a condition such as `if: always()` or `if: success() || failure()` runs after a
// failed step. So no step up to and including the last release may carry one: each runs only
// if every step before it passed.
test('no check and no release step has a condition: a failed step skips every one after it', () => {
    const job = yml.slice(yml.indexOf('\n  deploy:\n'));
    const steps = job.slice(job.indexOf('\n    steps:\n')).split(/\n(?=      - )/).slice(1)
        .map(text => text.split('\n').filter(l => !l.trim().startsWith('#')).join('\n'));
    const title = text => (text.match(/^      - (?:name: (.+)|uses: (.+))$/m) || []).slice(1).find(Boolean);
    const conditional = steps.filter(text => /^\s+(if|continue-on-error)\s*:/m.test(text)).map(title);
    assert.deepStrictEqual(conditional, [
        'Show why the step failed',
        'Summary',
        'Remove the key file and the Firebase debug files',
    ]);
    // And those three are the job's last, after the last release.
    assert.deepStrictEqual(steps.slice(-3).map(title), conditional);
    assert.strictEqual(title(steps[steps.length - 4]), '3. Deploy the site');
    for (const name of ['1. Deploy all functions', '2. Deploy the database rules', '3. Deploy the site']) {
        const target = { 1: 'functions', 2: 'database', 3: 'hosting' }[name[0]];
        const step = steps.find(text => title(text) === name);
        assert.strictEqual(step.trim(), [
            '- name: ' + name,
            '        run: |',
            '          node .github/scripts/firebase-refusal.js reset',
            `          npx firebase deploy --only ${target} --project "$FIREBASE_PROJECT" --non-interactive`,
        ].join('\n'));
    }
    // Nothing at the job's level lets it go on after a failure either.
    assert.doesNotMatch(job, /continue-on-error/);
    assert.match(job, /\n    if: github\.ref == 'refs\/heads\/master'\n/);
});

test('the permissions are asked once, for the run\'s project, before any Firebase command', () => {
    const code = yml.split('\n').filter(l => !l.trim().startsWith('#'));
    const calls = code.filter(l => l.includes('check-deploy-permissions.js'));
    assert.deepStrictEqual(calls.map(l => l.trim()), ['run: node .github/scripts/check-deploy-permissions.js "$FIREBASE_PROJECT"']);
    const asked = code.findIndex(l => l.includes('check-deploy-permissions.js'));
    const firstFirebase = code.findIndex(l => /npx firebase |check-access\.js/.test(l));
    assert.ok(asked !== -1 && asked < firstFirebase);
    // The step has no condition and no continue-on-error: when it fails, every later step is skipped.
    const step = yml.slice(yml.indexOf('      - name: Check the deploy account\'s permissions'), yml.indexOf('      # A release must not stop halfway'));
    assert.strictEqual(step.trim(), [
        '- name: Check the deploy account\'s permissions (releases nothing)',
        '        run: node .github/scripts/check-deploy-permissions.js "$FIREBASE_PROJECT"',
    ].join('\n'));
    assert.doesNotMatch(code.join('\n'), /continue-on-error/);
});

test('only the deploy job names the production environment', () => {
    const code = yml.split('\n').filter(l => !l.trim().startsWith('#'));
    assert.deepStrictEqual(code.filter(l => /^\s*environment:/.test(l)), ['    environment: production']);
    const ci = fs.readFileSync(path.join(__dirname, '..', 'workflows', 'ci.yml'), 'utf8');
    assert.doesNotMatch(ci, /^\s*environment:/m);
});

test('both guard steps check master against this run\'s own commit', () => {
    const calls = yml.split('\n').filter(l => l.includes('check-master-head.js') && !l.trim().startsWith('#'));
    assert.strictEqual(calls.length, 2);
    for (const l of calls) {
        assert.strictEqual(l.trim(),
            'run: node .github/scripts/check-master-head.js "$GITHUB_SERVER_URL/$GITHUB_REPOSITORY" master "$GITHUB_SHA"');
    }
});

test('every Firebase command starts from an empty debug file, and a failure prints only the filtered reason', () => {
    const code = yml.split('\n').filter(l => !l.trim().startsWith('#'));
    code.forEach((l, i) => {
        if (/npx firebase /.test(l)) {
            assert.strictEqual(code[i - 1].trim(), 'node .github/scripts/firebase-refusal.js reset', 'no reset before: ' + l.trim());
        }
    });
    const step = yml.slice(yml.indexOf('      - name: Show why the step failed'), yml.indexOf('      - name: Summary'));
    assert.strictEqual(step.trim(), [
        '- name: Show why the step failed',
        '        if: failure()',
        '        run: node .github/scripts/firebase-refusal.js print',
    ].join('\n'));
    // The debug file itself is never printed, copied or uploaded.
    const text = code.join('\n');
    assert.doesNotMatch(text, /upload-artifact/);
    assert.doesNotMatch(text, /firebase-debug/);
    assert.doesNotMatch(text, /--debug|DEBUG/);
});

test('the job\'s last step removes the key file and both debug files, whether the job passed or failed', () => {
    const last = names[names.length - 1];
    assert.strictEqual(last, 'Remove the key file and the Firebase debug files');
    const step = yml.slice(yml.indexOf('      - name: ' + last));
    assert.strictEqual(step.trim(), [
        '- name: ' + last,
        // always(): after a passed job, a failed one and a cancelled one.
        '        if: always()',
        '        run: |',
        '          rm -f "$RUNNER_TEMP/firebase-key.json"',
        '          node .github/scripts/firebase-refusal.js remove',
    ].join('\n'));
    // Nothing reads the debug file after it: `print` comes before.
    assert.ok(at('Show why the step failed') < at(last));
});
