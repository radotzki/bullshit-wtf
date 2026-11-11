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
        'Check access to the database and the site (releases nothing)',
        '1. Deploy all functions',
        '2. Deploy the database rules',
        '3. Deploy the site',
        'Show why the step failed',
        'Summary',
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
