// Says in plain words what a deploy run released and what it left alone, from the outcome of
// each release step. It reads nothing but its arguments and changes nothing.
//
//   node .github/scripts/release-summary.js <functions> <rules> <site> <rules mode>
//
// The first three are GitHub's outcome of the steps "1. Deploy all functions", "2. Deploy the
// database rules" and "3. Deploy the site": success, failure, cancelled or skipped (empty when
// the step was never reached). The fourth is the access check's output `rules`: `unchanged`
// when that check found the Firebase Realtime Database Management API off and the live rules
// the same as this commit's, so the rules step is skipped on purpose; else `deploy` or empty.
//
// Only `success` counts as released. A step that failed or was cancelled may have changed part
// of what it releases, and the text says so. Anything this script does not know reads as "not
// released", never as released.
const fs = require('fs');

const PARTS = [
    { key: 'functions', name: 'the functions', step: '1. Deploy all functions' },
    { key: 'rules', name: 'the database rules', step: '2. Deploy the database rules' },
    { key: 'site', name: 'the site', step: '3. Deploy the site' },
];

function summary(outcomes, rulesMode) {
    const lines = [];
    const left = rulesMode === 'unchanged' && outcomes.rules !== 'success' && outcomes.rules !== 'failure' && outcomes.rules !== 'cancelled';
    for (const part of PARTS) {
        const outcome = outcomes[part.key];
        if (outcome === 'success') {
            lines.push(`- Released: ${part.name}.`);
        } else if (outcome === 'failure' || outcome === 'cancelled') {
            lines.push(`- NOT released whole: ${part.name}. The step "${part.step}" ${outcome === 'failure' ? 'failed' : 'was cancelled'}; it may have changed part of them.`);
        } else if (part.key === 'rules' && left && outcomes.functions === 'success') {
            lines.push('- Left alone: the database rules. The rules that are live are the same as this commit\'s, so there was nothing to release. ' +
                'The step was skipped because it needs the Firebase Realtime Database Management API, which is off in the Google project.');
        } else {
            lines.push(`- Not released: ${part.name}. The step "${part.step}" did not run.`);
        }
    }
    const released = PARTS.filter(p => outcomes[p.key] === 'success').map(p => p.key);
    let verdict;
    if (released.length === 3) {
        verdict = 'A whole release: production runs this commit\'s functions, rules and site.';
    } else if (left && outcomes.functions === 'success' && outcomes.site === 'success') {
        verdict = 'A whole release without the rules step: production runs this commit\'s functions and site, and its rules were already this commit\'s.';
    } else if (!released.length && !PARTS.some(p => outcomes[p.key] === 'failure' || outcomes[p.key] === 'cancelled')) {
        verdict = 'Nothing was released: production is as it was before this run.';
    } else {
        verdict = 'NOT a whole release: production holds part of this commit. Read the failed step, fix its cause, and start a new run by hand on master.';
    }
    return [verdict, ''].concat(lines).join('\n');
}

if (require.main === module) {
    const [functions = '', rules = '', site = '', rulesMode = ''] = process.argv.slice(2);
    const out = summary({ functions, rules, site }, rulesMode);
    console.log(out);
    if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### What this run released\n\n' + out + '\n\n');
    }
}

module.exports = { PARTS, summary };
