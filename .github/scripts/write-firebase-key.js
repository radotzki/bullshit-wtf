// Checks the FIREBASE_SERVICE_ACCOUNT secret (a secret of the "production" environment) and, when
// asked, writes it to a file outside the checkout, for the Firebase CLI to read through
// GOOGLE_APPLICATION_CREDENTIALS.
// It prints the account's email and project, never the key. Used only by deploy.yml.
//   node .github/scripts/write-firebase-key.js --check-only <expected project id>
//   node .github/scripts/write-firebase-key.js <file to write> <expected project id>
// --check-only writes nothing: deploy.yml checks first, and writes the file only after the
// installs and builds, so no package's install or build script runs while the key is on disk.
const fs = require('fs');

const [, , dest, project] = process.argv;
const fail = msg => {
    console.log('::error title=Deploy stopped before it started::' + msg);
    process.exit(1);
};

if (!dest || !project) {
    fail('usage: write-firebase-key.js <file | --check-only> <project id>');
}
const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
if (!raw) {
    fail('The secret FIREBASE_SERVICE_ACCOUNT of the production environment is not set. Nothing was deployed. ' +
        'Add it under Settings > Environments > production > Environment secrets (see DEPLOYING.md), ' +
        'then re-run this workflow.');
}
let key;
try {
    key = JSON.parse(raw);
} catch (e) {
    fail('The secret FIREBASE_SERVICE_ACCOUNT of the production environment is not valid JSON. Nothing was deployed. ' +
        'Paste the whole service-account key file as the secret\'s value.');
}
if (!key || key.type !== 'service_account' || !key.client_email || !key.private_key) {
    fail('The secret FIREBASE_SERVICE_ACCOUNT of the production environment is not a service-account key ' +
        '(it needs type "service_account", client_email and private_key). Nothing was deployed.');
}
if (key.project_id !== project) {
    fail('The service-account key belongs to another project, not ' + project + '. Nothing was deployed.');
}
if (dest === '--check-only') {
    console.log('Key accepted: ' + key.client_email + ' in ' + key.project_id + '. Not written to disk yet.');
} else {
    fs.writeFileSync(dest, JSON.stringify(key), { mode: 0o600 });
    console.log('Key written for ' + key.client_email + ' in ' + key.project_id + '.');
}
