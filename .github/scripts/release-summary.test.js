// node --test .github/scripts/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { summary } = require('./release-summary.js');

const say = (functions, rules, site, mode) => summary({ functions, rules, site }, mode);

test('a whole release names all three as released', () => {
    for (const mode of ['deploy', '']) {
        const text = say('success', 'success', 'success', mode);
        assert.match(text, /^A whole release: production runs this commit's functions, rules and site\./);
        assert.match(text, /- Released: the functions\.\n- Released: the database rules\.\n- Released: the site\./);
        assert.doesNotMatch(text, /Left alone|Not released|NOT/);
    }
});

test('rules left alone: the functions and the site are released, and the rules are said to be untouched and why', () => {
    const text = say('success', 'skipped', 'success', 'unchanged');
    assert.match(text, /^A whole release without the rules step: production runs this commit's functions and site, and its rules were already this commit's\./);
    assert.match(text, /- Released: the functions\./);
    assert.match(text, /- Left alone: the database rules\. The rules that are live are the same as this commit's/);
    assert.match(text, /Firebase Realtime Database Management API, which is off/);
    assert.match(text, /- Released: the site\./);
    assert.doesNotMatch(text, /Released: the database rules|Not released/);
});

test('a run that stopped before the first release says nothing was released', () => {
    for (const outcomes of [['', '', ''], ['skipped', 'skipped', 'skipped']]) {
        for (const mode of ['', 'deploy', 'unchanged']) {
            const text = say(...outcomes, mode);
            assert.match(text, /^Nothing was released: production is as it was before this run\./);
            assert.strictEqual((text.match(/- Not released: /g) || []).length, 3);
            assert.doesNotMatch(text, /- Released|Left alone/);
        }
    }
});

test('a release that stopped halfway is never called whole', () => {
    const cases = [
        ['failure', 'skipped', 'skipped', 'deploy'],
        ['failure', 'skipped', 'skipped', 'unchanged'],
        ['success', 'failure', 'skipped', 'deploy'],
        ['success', 'success', 'failure', 'deploy'],
        ['success', 'skipped', 'failure', 'unchanged'],
        ['success', 'skipped', 'cancelled', 'unchanged'],
        ['cancelled', '', '', 'deploy'],
        // The rules step skipped without the access check's word: not a whole release.
        ['success', 'skipped', 'success', 'deploy'],
        ['success', 'skipped', 'success', ''],
        ['success', '', 'success', 'UNCHANGED'],
    ];
    for (const c of cases) {
        const text = say(...c);
        assert.match(text, /^NOT a whole release: production holds part of this commit\./, c.join());
        assert.doesNotMatch(text, /^A whole release|^Nothing was released/m, c.join());
    }
    assert.match(say('failure', 'skipped', 'skipped', 'unchanged'), /- NOT released whole: the functions\. The step "1\. Deploy all functions" failed; it may have changed part of them\.\n- Not released: the database rules\./);
    assert.match(say('success', 'skipped', 'failure', 'unchanged'), /- Left alone: the database rules[^\n]*\n- NOT released whole: the site\./);
    assert.match(say('success', 'skipped', 'success', 'deploy'), /- Not released: the database rules\. The step "2\. Deploy the database rules" did not run\./);
});

test('an outcome it does not know reads as not released', () => {
    const text = say('SUCCESS', 'yes', undefined, 'unchanged');
    assert.strictEqual((text.match(/- Not released: /g) || []).length, 3);
    assert.doesNotMatch(text, /- Released/);
});

test('as the workflow runs it: the text goes to the log and to the summary page', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-summary-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const page = path.join(dir, 'summary.md');
    const out = spawnSync('node', [path.join(__dirname, 'release-summary.js'), 'success', 'skipped', 'success', 'unchanged'],
        { env: Object.assign({}, process.env, { GITHUB_STEP_SUMMARY: page }), encoding: 'utf8' });
    assert.strictEqual(out.status, 0);
    assert.match(out.stdout, /Left alone: the database rules/);
    assert.match(fs.readFileSync(page, 'utf8'), /^### What this run released\n\nA whole release without the rules step/);
    const none = spawnSync('node', [path.join(__dirname, 'release-summary.js')], { env: Object.assign({}, process.env, { GITHUB_STEP_SUMMARY: page }), encoding: 'utf8' });
    assert.strictEqual(none.status, 0);
    assert.match(none.stdout, /^Nothing was released/);
});
