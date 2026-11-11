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
        'npx firebase deploy --only database --dry-run --project "$FIREBASE_PROJECT" --non-interactive',
        'npx firebase hosting:channel:list --project "$FIREBASE_PROJECT" --non-interactive',
        'npx firebase deploy --only functions --project "$FIREBASE_PROJECT" --non-interactive',
        'npx firebase deploy --only database --project "$FIREBASE_PROJECT" --non-interactive',
        'npx firebase deploy --only hosting --project "$FIREBASE_PROJECT" --non-interactive',
    ]);
    const code = yml.split('\n').filter(l => !l.trim().startsWith('#')).join('\n');
    assert.doesNotMatch(code, /--force/);
});

test('the permissions are asked once, for the run\'s project, before any Firebase command', () => {
    const code = yml.split('\n').filter(l => !l.trim().startsWith('#'));
    const calls = code.filter(l => l.includes('check-deploy-permissions.js'));
    assert.deepStrictEqual(calls.map(l => l.trim()), ['run: node .github/scripts/check-deploy-permissions.js "$FIREBASE_PROJECT"']);
    const asked = code.findIndex(l => l.includes('check-deploy-permissions.js'));
    const firstFirebase = code.findIndex(l => /npx firebase /.test(l));
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
