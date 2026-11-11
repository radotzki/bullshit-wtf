// Checks the FIREBASE_SERVICE_ACCOUNT secret and writes it to a file outside the checkout,
// for the Firebase CLI to read through GOOGLE_APPLICATION_CREDENTIALS.
// It prints the account's email and project, never the key. Used only by deploy.yml.
//   node .github/scripts/write-firebase-key.js <file to write> <expected project id>
const fs = require('fs');

const [, , dest, project] = process.argv;
const fail = msg => {
    console.log('::error title=Deploy stopped before it started::' + msg);
    process.exit(1);
};

if (!dest || !project) {
    fail('usage: write-firebase-key.js <file> <project id>');
}
const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim();
if (!raw) {
    fail('The repository secret FIREBASE_SERVICE_ACCOUNT is not set. Nothing was deployed. ' +
        'Add it under Settings > Secrets and variables > Actions (see DEPLOYING.md), then re-run this workflow.');
}
let key;
try {
    key = JSON.parse(raw);
} catch (e) {
    fail('The repository secret FIREBASE_SERVICE_ACCOUNT is not valid JSON. Nothing was deployed. ' +
        'Paste the whole service-account key file as the secret\'s value.');
}
if (!key || key.type !== 'service_account' || !key.client_email || !key.private_key) {
    fail('The repository secret FIREBASE_SERVICE_ACCOUNT is not a service-account key ' +
        '(it needs type "service_account", client_email and private_key). Nothing was deployed.');
}
if (key.project_id !== project) {
    fail('The service-account key belongs to another project, not ' + project + '. Nothing was deployed.');
}
fs.writeFileSync(dest, JSON.stringify(key), { mode: 0o600 });
console.log('Key accepted: ' + key.client_email + ' in ' + key.project_id + '.');
