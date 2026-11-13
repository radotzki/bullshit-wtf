// node --test .github/scripts/*.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { summary } = require('./release-summary.js');

// The game's three steps and the rules mode; the Hanukkah questions step passed unless named.
const say = (functions, rules, site, mode, questions = 'success', result = 'written') =>
    summary({ functions, rules, site }, mode, functions === 'success' && site === 'success' ? questions : '', functions === 'success' && site === 'success' ? result : '');

test('a whole release names all three as released', () => {
    for (const mode of ['deploy', '']) {
        const text = say('success', 'success', 'success', mode);
        assert.match(text, /^A whole release: production runs this commit's functions, rules and site, and the Hanukkah questions are in the database\./);
        assert.match(text, /- Released: the functions\.\n- Released: the database rules\.\n- Released: the site\.\n- Added: the Hanukkah questions/);
        assert.doesNotMatch(text, /Left alone|Not released|NOT/);
    }
});

test('rules left alone: the functions and the site are released, and the rules are said to be untouched and why', () => {
    const text = say('success', 'skipped', 'success', 'unchanged');
    assert.match(text, /^A whole release without the rules step: production runs this commit's functions and site, and its rules were already this commit's\. The Hanukkah questions are in the database\./);
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
            assert.match(text, /- Not added: the Hanukkah questions\. The step "4\. Add the Hanukkah questions to the database" did not run\./);
            assert.doesNotMatch(text, /- Released|Left alone|- Added/);
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
        assert.doesNotMatch(text, /^A whole release|^Nothing was released|^WARNING/m, c.join());
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
    const out = spawnSync('node', [path.join(__dirname, 'release-summary.js'), 'success', 'skipped', 'success', 'unchanged', 'success', 'written'],
        { env: Object.assign({}, process.env, { GITHUB_STEP_SUMMARY: page }), encoding: 'utf8' });
    assert.strictEqual(out.status, 0);
    assert.match(out.stdout, /Left alone: the database rules/);
    assert.match(fs.readFileSync(page, 'utf8'), /^### What this run released\n\nA whole release without the rules step/);
    const none = spawnSync('node', [path.join(__dirname, 'release-summary.js')], { env: Object.assign({}, process.env, { GITHUB_STEP_SUMMARY: page }), encoding: 'utf8' });
    assert.strictEqual(none.status, 0);
    assert.match(none.stdout, /^Nothing was released/);
});

// The game was released, and the questions step after it was not a pass: the verdict says so
// in its first words, whatever the step's output says or lacks.
test('a failed or refused Hanukkah step turns the verdict into a warning, and the game still reads as released', () => {
    const cases = [
        ['failure', 'refused', /^WARNING: the game was released whole, but the Hanukkah questions were NOT added\./, /- NOT added: the Hanukkah questions\. The database refused the update, so nothing was written/],
        ['failure', 'not-sent', /^WARNING: the game was released whole, but the Hanukkah questions were NOT added\./, /- NOT added: the Hanukkah questions\. The step stopped before sending the update, so nothing was written\./],
        ['failure', 'unclear', /^WARNING: the game was released whole, but the Hanukkah questions may NOT have been added\./, /- Maybe not added: the Hanukkah questions\. The update got no clear answer/],
        // The script died before it could set its output.
        ['failure', '', /^WARNING: the game was released whole, but the Hanukkah questions were NOT added\./, /- NOT added: the Hanukkah questions\. The step "4\. Add the Hanukkah questions to the database" failed; its log says why\./],
        ['failure', 'made-up', /^WARNING: [^\n]*NOT added\./, /failed; its log says why\./],
        ['cancelled', '', /^WARNING: the game was released whole, but the Hanukkah questions may NOT have been added\./, /- Maybe not added: the Hanukkah questions\. The step "4\. [^"]+" was cancelled/],
        ['skipped', '', /^WARNING: [^\n]*NOT added\./, /- Not added: the Hanukkah questions\. The step "4\. [^"]+" did not run\./],
        ['', '', /^WARNING: [^\n]*NOT added\./, /did not run\./],
        // A pass needs GitHub's own outcome, not only the script's word.
        ['failure', 'written', /^WARNING: [^\n]*NOT added\./, /failed; its log says why\./],
    ];
    for (const [questions, result, verdict, line] of cases) {
        for (const game of [['success', 'success', 'success', 'deploy'], ['success', 'skipped', 'success', 'unchanged']]) {
            const text = say(...game, questions, result);
            const c = [...game, questions, result].join();
            assert.match(text, verdict, c);
            assert.match(text, line, c);
            assert.match(text, /Hanukkah games from 1 December play ordinary questions/, c);
            assert.match(text, /start a new run by hand on master, or load the file by hand/, c);
            assert.match(text, /- Released: the functions\.[\s\S]*- Released: the site\./, c);
            assert.doesNotMatch(text, /^A whole release|^NOT a whole release|^Nothing was released|- Added:/m, c);
        }
    }
    assert.match(say('success', 'success', 'success', 'deploy', 'failure', 'refused'), /^WARNING: [^\n]*\. Production runs this commit's functions, rules and site\./);
    assert.match(say('success', 'skipped', 'success', 'unchanged', 'failure', 'refused'), /^WARNING: [^\n]*\. Production runs this commit's functions and site, and its rules were already this commit's\./);
});

test('as the workflow runs it after a refused Hanukkah step: the warning reaches the summary page', t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-summary-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const page = path.join(dir, 'summary.md');
    const out = spawnSync('node', [path.join(__dirname, 'release-summary.js'), 'success', 'success', 'success', 'deploy', 'failure', 'refused'],
        { env: Object.assign({}, process.env, { GITHUB_STEP_SUMMARY: page }), encoding: 'utf8' });
    assert.strictEqual(out.status, 0);
    assert.match(fs.readFileSync(page, 'utf8'), /^### What this run released\n\nWARNING: the game was released whole, but the Hanukkah questions were NOT added\./);
});
