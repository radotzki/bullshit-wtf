// Asks Google which of the permissions a release needs the deploy account holds on the project,
// before anything is released. It only reads: nothing in the project changes.
//
//   node .github/scripts/check-deploy-permissions.js <project id>
//
// Why: the Firebase tool asks Google the same question before every deploy (firebase-tools 15.35,
// src/requirePermissions.ts), but it only writes a missing permission to its debug file and
// goes on. So a run could release the functions and then be refused at the database rules or the
// site. This script asks once, for all three release steps, and stops the run on anything but a
// full yes.
//
// The question is the tool's own (src/gcp/iam.ts, testIamPermissions):
//   POST https://cloudresourcemanager.googleapis.com/v1/projects/<id>:testIamPermissions
//   header x-goog-user-project: <id>, body {"permissions": [...]}
// Google answers 200 with the permissions of the list that the caller holds. It needs the Cloud
// Resource Manager API (cloudresourcemanager.googleapis.com) to be on in the project, and for the
// header the permission serviceusage.services.use.
//
// The list is the tool's own, per target (src/deploy/index.ts, TARGET_PERMISSIONS, plus
// BASE_PERMISSIONS of src/requirePermissions.ts), copied below. When the installed tool lists
// more for these targets, those are asked too.
//
// Three outcomes, and only the first lets the run go on:
//   - every permission is held: exit 0;
//   - one or more are missing: exit 1, each is named, with the release step that needs it;
//   - the question got no usable answer (an API is off, the sign-in failed, no network, the
//     answer is not what Google documents): exit 1, with Google's answer. Not knowing counts as no.
//
// The key: this script never opens the key file. Google's own library (google-auth-library, which
// the Firebase tool installs and uses) reads the file named by GOOGLE_APPLICATION_CREDENTIALS and
// puts the token on the request. The script sees neither, and prints only: permission names, the
// status of Google's answer, and from a JSON error the same few fields as firebase-refusal.js,
// each through its scrub().
const fs = require('fs');
const { scrub, errorFields } = require('./firebase-refusal.js');

const NEEDS = {
    'every step': ['firebase.projects.get'],
    '1. Deploy all functions': [
        'cloudfunctions.functions.list',
        'cloudfunctions.functions.create',
        'cloudfunctions.functions.get',
        'cloudfunctions.functions.update',
        'cloudfunctions.functions.delete',
        'cloudfunctions.operations.get',
    ],
    '2. Deploy the database rules': ['firebasedatabase.instances.update'],
    '3. Deploy the site': ['firebasehosting.sites.update'],
};
// The tool's name for each step's target.
const TARGETS = {
    '1. Deploy all functions': 'functions',
    '2. Deploy the database rules': 'database',
    '3. Deploy the site': 'hosting',
};
const ORIGIN = 'https://cloudresourcemanager.googleapis.com';
const PERMISSION = /^[a-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*){1,4}$/;

// NEEDS, plus whatever the installed tool lists for the same targets. `toolList` is the tool's
// TARGET_PERMISSIONS, or null when it could not be read.
function wanted(toolList) {
    const out = {};
    for (const step of Object.keys(NEEDS)) {
        out[step] = [...NEEDS[step]];
        const more = toolList && TARGETS[step] ? toolList[TARGETS[step]] : null;
        for (const p of Array.isArray(more) ? more : []) {
            if (typeof p === 'string' && PERMISSION.test(p) && !out[step].includes(p)) {
                out[step].push(p);
            }
        }
    }
    return out;
}

function stepsOf(needs, permission) {
    return Object.keys(needs).filter(step => needs[step].includes(permission));
}

// `request` sends one request with the deploy account's sign-in and resolves to
// { status, data } for any answer; it rejects when there is none.
async function check(project, needs, request, origin = ORIGIN) {
    const permissions = [...new Set(Object.values(needs).flat())].sort();
    const place = `${origin.replace(/^https?:\/\//, '')}/v1/projects/${project}:testIamPermissions`;
    let answer;
    try {
        answer = await request({
            url: `${origin}/v1/projects/${project}:testIamPermissions`,
            method: 'POST',
            headers: { 'x-goog-user-project': project },
            data: { permissions },
        });
    } catch (e) {
        return { ok: false, kind: 'refused', lines: noAnswer(place, e) };
    }
    const status = answer && Number(answer.status);
    const data = answer ? answer.data : null;
    if (status !== 200) {
        const lines = [`${scrub(String(status))} to POST ${scrub(place)}`];
        const fields = errorFields(typeof data === 'string' ? data : JSON.stringify(data === undefined ? null : data));
        if (fields && fields.length) {
            for (const [k, v] of fields) {
                lines.push(`    ${k}: ${v}`);
            }
        } else {
            lines.push('    (the answer carried no JSON error; its text is not shown)');
        }
        return { ok: false, kind: 'refused', lines };
    }
    // Google leaves `permissions` out when the caller holds none of them.
    const held = data && typeof data === 'object' && !Array.isArray(data) ? data.permissions : null;
    if (!data || typeof data !== 'object' || Array.isArray(data) || (held !== undefined && !Array.isArray(held))) {
        return { ok: false, kind: 'refused', lines: [`200 to POST ${scrub(place)}`, '    (the answer is not the list Google documents; its text is not shown)'] };
    }
    const have = new Set((held || []).filter(p => typeof p === 'string'));
    const missing = permissions.filter(p => !have.has(p));
    if (missing.length) {
        return {
            ok: false,
            kind: 'missing',
            missing,
            lines: missing.map(p => `missing: ${scrub(p)}   (needed by: ${stepsOf(needs, p).join(', ')})`),
        };
    }
    return { ok: true, kind: 'held', lines: permissions.map(p => `held: ${scrub(p)}`) };
}

// An error without an answer. Its own text can quote the request, so only these are shown: an
// HTTP status and JSON error if the sign-in itself was refused, else the error's code or name.
function noAnswer(place, e) {
    const res = e && e.response;
    if (res && res.status) {
        const lines = [`${scrub(String(res.status))} while signing in or asking ${scrub(place)}`];
        const d = res.data;
        if (d && typeof d === 'object') {
            const fields = errorFields(JSON.stringify(d)) || [];
            for (const [k, v] of fields) {
                lines.push(`    ${k}: ${v}`);
            }
            if (typeof d.error === 'string' && typeof d.error_description === 'string') {
                lines.push(`    description: ${scrub(d.error_description)}`);
            }
        }
        return lines;
    }
    const code = e && (typeof e.code === 'string' || typeof e.code === 'number') ? e.code : (e && e.name) || 'error';
    return [`No answer from ${scrub(place)}: ${scrub(String(code)).slice(0, 80)}`];
}

function report(project, result) {
    if (result.ok) {
        return `The deploy account holds every permission the three release steps need on ${project}:\n\n` +
            result.lines.map(l => '  ' + l).join('\n');
    }
    if (result.kind === 'missing') {
        return `Deploy stopped, nothing released. The deploy account lacks ${result.missing.length === 1 ? 'a permission' : 'permissions'} on ${project}:\n\n` +
            result.lines.map(l => '  ' + l).join('\n') + '\n\n' +
            'Give the account a role that holds it (Google Cloud console, IAM; see DEPLOYING.md, "The Firebase\n' +
            'key"), wait five minutes, then start a new run by hand on master. Do not re-run this one.';
    }
    return 'Deploy stopped, nothing released. Google did not say which permissions the deploy account holds,\n' +
        `so the run cannot know that a release on ${project} would be whole:\n\n` +
        result.lines.map(l => '  ' + l).join('\n') + '\n\n' +
        'A 403 that says an API is disabled names the API to switch on in the Google Cloud console (here\n' +
        'most likely cloudresourcemanager.googleapis.com, the Cloud Resource Manager API). A 403 without\n' +
        'that can mean the account lacks serviceusage.services.use (role "Service Usage Consumer"). Then\n' +
        'start a new run by hand on master. Do not re-run this one.';
}

function toolPermissions() {
    try {
        return require('firebase-tools/lib/deploy').TARGET_PERMISSIONS || null;
    } catch (e) {
        return null;
    }
}

// The real request: Google's library signs in with the key file and adds the token itself.
// `auth` is given only by a test.
function googleRequest(auth) {
    return async options => {
        if (!auth) {
            const { GoogleAuth } = require('google-auth-library');
            auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
        }
        const client = await auth.getClient();
        const res = await client.request(Object.assign({}, options, {
            timeout: 30000,
            responseType: 'json',
            retry: false,
            // Every answer comes back as an answer, whatever its status.
            validateStatus: () => true,
        }));
        return { status: res.status, data: res.data };
    };
}

async function main(project) {
    const toolList = toolPermissions();
    const needs = wanted(toolList);
    let result;
    try {
        result = await check(project, needs, googleRequest());
    } catch (e) {
        result = { ok: false, kind: 'refused', lines: ['The question could not be asked: ' + scrub(String((e && (e.code || e.name)) || 'error')).slice(0, 80)] };
    }
    let out = report(project, result);
    if (!toolList) {
        out += '\n\n(The installed Firebase tool\'s own list could not be read; the list in this script was asked.)';
    }
    console.log(out);
    if (!result.ok) {
        const title = result.kind === 'missing' ? 'Deploy stopped, nothing released: a permission is missing' : 'Deploy stopped, nothing released: permissions unknown';
        console.log('::error title=' + title + '::' + result.lines.map(l => l.trim()).join('; ').replace(/[\r\n]+/g, ' '));
    }
    if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### The deploy account\'s permissions\n\n```\n' + out.replace(/```/g, "'''") + '\n```\n');
    }
    return result.ok ? 0 : 1;
}

if (require.main === module) {
    const project = process.argv[2];
    if (!project || !/^[a-z][a-z0-9-]{4,29}$/.test(project)) {
        console.error('Usage: check-deploy-permissions.js <project id>');
        process.exit(1);
    }
    main(project).then(code => process.exit(code), () => {
        // Never print an unknown error: it could quote the request.
        console.log('::error title=Deploy stopped, nothing released::The permission check failed in a way it does not know.');
        process.exit(1);
    });
}

module.exports = { NEEDS, TARGETS, wanted, check, report, googleRequest };
