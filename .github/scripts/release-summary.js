// Says in plain words what a deploy run released and what it left alone, from the outcome of
// each release step. It reads nothing but its arguments and changes nothing.
//
//   node .github/scripts/release-summary.js <functions> <rules> <site> <rules mode> <questions> <questions result>
//
// The first three are GitHub's outcome of the steps "1. Deploy all functions", "2. Deploy the
// database rules" and "3. Deploy the site": success, failure, cancelled or skipped (empty when
// the step was never reached). The fourth is the access check's output `rules`: `unchanged`
// when that check found the Firebase Realtime Database Management API off and the live rules
// the same as this commit's, so the rules step is skipped on purpose; else `deploy` or empty.
// The fifth is GitHub's outcome of "4. Add the Hanukkah questions to the database", and the
// sixth that step's output `result` (load-pack-questions.js): written, not-sent, refused or
// unclear, or empty when the step never got to say.
//
// The verdict's first words say which of four it was, so it reads at a glance:
//   "A whole release"          the game (functions, rules, site) and the Hanukkah questions;
//   "WARNING: the game was released whole, but the Hanukkah questions were NOT added"
//                              (or "may NOT have been added"): production runs the new game,
//                              and Hanukkah games from 1 December play ordinary questions until
//                              a run adds them;
//   "NOT a whole release"      the game itself stopped halfway;
//   "Nothing was released".
// The run itself still fails when the questions step fails (that step exits 1), so the run is
// red; the game released before it stands, and this text says so.
//
// Only `success` counts as released. A step that failed or was cancelled may have changed part
// of what it releases, and the text says so. Anything this script does not know reads as "not
// released", never as released.
const fs = require('fs');

const QUESTIONS_STEP = '4. Add the Hanukkah questions to the database';

// Why the questions step failed, from its output `result`.
const QUESTIONS_FAILED = {
    'not-sent': 'NOT added: the Hanukkah questions. The step stopped before sending the update, so nothing was written.',
    refused: 'NOT added: the Hanukkah questions. The database refused the update, so nothing was written (an update is all or nothing).',
    unclear: 'Maybe not added: the Hanukkah questions. The update got no clear answer, so it may or may not have been written.',
};

function questionsLine(outcome, result) {
    if (outcome === 'success') {
        return '- Added: the Hanukkah questions, to the live question bank. Nothing else under questions/ was sent.';
    }
    if (outcome === 'failure') {
        return '- ' + (QUESTIONS_FAILED[result] ||
            `NOT added: the Hanukkah questions. The step "${QUESTIONS_STEP}" failed; its log says why.`);
    }
    if (outcome === 'cancelled') {
        return `- Maybe not added: the Hanukkah questions. The step "${QUESTIONS_STEP}" was cancelled, so the update may or may not have been written.`;
    }
    return `- Not added: the Hanukkah questions. The step "${QUESTIONS_STEP}" did not run.`;
}

const PARTS = [
    { key: 'functions', name: 'the functions', step: '1. Deploy all functions' },
    { key: 'rules', name: 'the database rules', step: '2. Deploy the database rules' },
    { key: 'site', name: 'the site', step: '3. Deploy the site' },
];

function summary(outcomes, rulesMode, questions = '', questionsResult = '') {
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
    lines.push(questionsLine(questions, questionsResult));
    const released = PARTS.filter(p => outcomes[p.key] === 'success').map(p => p.key);
    const game = released.length === 3 ? 'whole' :
        left && outcomes.functions === 'success' && outcomes.site === 'success' ? 'whole without rules' : '';
    const runs = game === 'whole' ? 'production runs this commit\'s functions, rules and site' :
        'production runs this commit\'s functions and site, and its rules were already this commit\'s';
    let verdict;
    if (game && questions === 'success') {
        verdict = game === 'whole' ?
            `A whole release: ${runs}, and the Hanukkah questions are in the database.` :
            `A whole release without the rules step: ${runs}. The Hanukkah questions are in the database.`;
    } else if (game) {
        const maybe = (questions === 'failure' && questionsResult === 'unclear') || questions === 'cancelled';
        verdict = `WARNING: the game was released whole, but the Hanukkah questions ${maybe ? 'may NOT have been' : 'were NOT'} added. ` +
            `${runs[0].toUpperCase() + runs.slice(1)}. Until a run adds the questions, Hanukkah games from 1 December play ordinary questions. ` +
            `Read the step "${QUESTIONS_STEP}", fix its cause, and start a new run by hand on master, or load the file by hand (DEPLOYING.md, Hanukkah pack).`;
    } else if (!released.length && !PARTS.some(p => outcomes[p.key] === 'failure' || outcomes[p.key] === 'cancelled')) {
        verdict = 'Nothing was released: production is as it was before this run.';
    } else {
        verdict = 'NOT a whole release: production holds part of this commit. Read the failed step, fix its cause, and start a new run by hand on master.';
    }
    return [verdict, ''].concat(lines).join('\n');
}

if (require.main === module) {
    const [functions = '', rules = '', site = '', rulesMode = '', questions = '', questionsResult = ''] = process.argv.slice(2);
    const out = summary({ functions, rules, site }, rulesMode, questions, questionsResult);
    console.log(out);
    if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### What this run released\n\n' + out + '\n\n');
    }
}

module.exports = { PARTS, QUESTIONS_STEP, summary };
