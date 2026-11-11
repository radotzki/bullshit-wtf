// node --test .github/scripts/*.test.js
// A made-up firebase-debug.log, in the line format of firebase-tools 15.35 (src/apiv2.ts,
// src/logger.ts). Every secret in it is invented. Checks what `print` shows and never shows.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, 'firebase-refusal.js');
const { scrub, report, LOG, KEPT } = require('./firebase-refusal.js');

const T = '[2026-11-11T18:58:53.100Z]';
const SECRETS = {
    privateKey: '-----BEGIN PRIVATE KEY-----\\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7madeUP\\n-----END PRIVATE KEY-----',
    keyBody: 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7madeUP',
    token: 'ya29.c.MadeUpAccessToken-0123456789_abcdefghijklmnop',
    apiKey: 'AIzaSyMadeUp0123456789abcdefghijklmnopq',
    jwt: 'eyJhbGciOiJSUzI1NiJ9.eyJtYWRlIjoidXAifQ.c2lnbmF0dXJlLW1hZGUtdXA',
    configValue: 'hunter2-made-up-sentry-dsn',
    configValue2: 'sk_live_madeUp123',
    signature: 'X-Goog-Signature=5f3ab1madeup9988776655443322110099aabbccddeeff',
    uploadHost: 'storage.googleapis.com/gcf-upload-us-central1-made-up',
};
const DB = 'https://firebasedatabase.googleapis.com/v1beta/projects/-/locations/-/instances/bullshit-wtf-prod';
const UPLOAD = `https://${SECRETS.uploadHost}/abc.zip?GoogleAccessId=svc@example.invalid&Expires=1790000000&${SECRETS.signature}`;

const LOG_TEXT = [
    '[debug] ' + T + ' ----------------------------------------------------------------------',
    '[debug] ' + T + ' Command:       /usr/bin/node /x/node_modules/.bin/firebase deploy --only functions',
    '[debug] ' + T + ' > authorizing via GOOGLE_APPLICATION_CREDENTIALS',
    `[debug] ${T} private_key ${SECRETS.privateKey}`,
    '[debug] ' + T + ' [iam] checking project bullshit-wtf-prod for permissions ["firebase.projects.get","firebasehosting.sites.update"]',
    `[debug] ${T} >>> [apiv2][query] POST https://oauth2.googleapis.com/token [none]`,
    `[debug] ${T} >>> [apiv2][body] POST https://oauth2.googleapis.com/token {"assertion":"${SECRETS.jwt}"}`,
    `[debug] ${T} <<< [apiv2][status] POST https://oauth2.googleapis.com/token 200`,
    `[debug] ${T} <<< [apiv2][body] POST https://oauth2.googleapis.com/token {"access_token":"${SECRETS.token}"}`,
    // A config read that succeeds: its values must never be shown.
    `[debug] ${T} >>> [apiv2][query] GET https://runtimeconfig.googleapis.com/v1beta1/projects/bullshit-wtf-prod/configs/sentry/variables/dsn [none]`,
    `[debug] ${T} <<< [apiv2][status] GET https://runtimeconfig.googleapis.com/v1beta1/projects/bullshit-wtf-prod/configs/sentry/variables/dsn 200`,
    `[debug] ${T} <<< [apiv2][body] GET https://runtimeconfig.googleapis.com/v1beta1/projects/bullshit-wtf-prod/configs/sentry/variables/dsn {"name":"dsn","text":"${SECRETS.configValue}"}`,
    `[debug] ${T} >>> [apiv2][body] PATCH https://cloudfunctions.googleapis.com/v1/projects/bullshit-wtf-prod/locations/us-central1/functions/tick {"environmentVariables":{"STRIPE":"${SECRETS.configValue2}"},"sourceUploadUrl":"${UPLOAD}"}`,
    // A refused upload: the address carries a signature in its query string.
    `[debug] ${T} >>> [apiv2][query] PUT ${UPLOAD} [none]`,
    `[debug] ${T} <<< [apiv2][status] PUT ${UPLOAD} 403`,
    `[debug] ${T} <<< [apiv2][body] PUT ${UPLOAD} <?xml version='1.0'?><Error><Code>SignatureDoesNotMatch</Code><StringToSign>${SECRETS.configValue}</StringToSign></Error>`,
    // A refusal whose message repeats secrets, and whose body has fields that are not on the list.
    `[debug] ${T} <<< [apiv2][status] PATCH https://cloudfunctions.googleapis.com/v1/projects/bullshit-wtf-prod/locations/us-central1/functions/tick?key=${SECRETS.apiKey} 400`,
    `[debug] ${T} <<< [apiv2][body] PATCH https://cloudfunctions.googleapis.com/v1/projects/bullshit-wtf-prod/locations/us-central1/functions/tick?key=${SECRETS.apiKey} {"error":{"code":400,"message":"Bad token ${SECRETS.token} for ${UPLOAD} with Bearer ${SECRETS.jwt}","status":"INVALID_ARGUMENT","echo":{"env":"${SECRETS.configValue2}"},"details":[{"reason":"BAD_REQUEST","metadata":{"service":"cloudfunctions.googleapis.com","value":"${SECRETS.configValue}"}}]}}`,
    // The real case of 2026-11-11.
    `[debug] ${T} >>> [apiv2][query] GET ${DB} [none]`,
    `[debug] ${T} <<< [apiv2][status] GET ${DB} 403`,
    `[debug] ${T} <<< [apiv2][body] GET ${DB} {"error":{"code":403,"message":"The caller does not have permission","status":"PERMISSION_DENIED","details":[{"@type":"type.googleapis.com/google.rpc.ErrorInfo","reason":"IAM_PERMISSION_DENIED","domain":"iam.googleapis.com","metadata":{"permission":"firebasedatabase.instances.get","service":"firebasedatabase.googleapis.com"}}]}}`,
    `[debug] ${T} Request to ${DB} had HTTP Error: 403, The caller does not have permission`,
    `[debug] ${T} [iam] error while checking permissions, command may fail: Authorization failed. This account is missing the following required permissions on project bullshit-wtf-prod:`,
    '',
    '  firebasehosting.sites.update',
    '  firebasedatabase.instances.get',
    `[debug] ${T} *** [apiv2] error from fetch(https://firebasehosting.googleapis.com/v1beta1/projects/-/sites?pageToken=${SECRETS.apiKey}, {"headers":{"authorization":"Bearer ${SECRETS.token}"},"body":"${SECRETS.configValue}"}): Error: read ECONNRESET`,
    '[error] Error: Failed to get instance details for instance: bullshit-wtf-prod. See firebase-debug.log for more details.',
    '',
].join('\n');

const noSecret = out => {
    for (const [name, value] of Object.entries(SECRETS)) {
        assert.ok(!out.includes(value), 'printed the made-up ' + name);
    }
    assert.doesNotMatch(out, /BEGIN PRIVATE KEY|ya29\.|AIza|eyJ|hunter2|sk_live|X-Goog-Signature|GoogleAccessId|Expires=|access_token|assertion|StringToSign/);
};

const tmp = t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refusal-test-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
};
const run = (mode, dir, env) => spawnSync('node', [SCRIPT, mode, dir],
    { env: Object.assign({}, process.env, { GITHUB_STEP_SUMMARY: '' }, env), encoding: 'utf8' });

test('prints Google\'s refusal: the status, the reason and the missing permission', t => {
    const dir = tmp(t);
    fs.writeFileSync(path.join(dir, LOG), LOG_TEXT);
    const out = run('print', dir);
    assert.strictEqual(out.status, 0);
    assert.strictEqual(out.stderr, '');
    assert.match(out.stdout, /403 to GET firebasedatabase\.googleapis\.com\/v1beta\/projects\/-\/locations\/-\/instances\/bullshit-wtf-prod/);
    assert.match(out.stdout, /status: PERMISSION_DENIED/);
    assert.match(out.stdout, /message: The caller does not have permission/);
    assert.match(out.stdout, /reason: IAM_PERMISSION_DENIED/);
    assert.match(out.stdout, /permission: firebasedatabase\.instances\.get/);
    assert.match(out.stdout, /service: firebasedatabase\.googleapis\.com/);
    assert.match(out.stdout, /missing: firebasehosting\.sites\.update/);
    assert.match(out.stdout, /missing: firebasedatabase\.instances\.get/);
    assert.match(out.stdout, /400 to PATCH cloudfunctions\.googleapis\.com\/v1\/projects\/bullshit-wtf-prod\/locations\/us-central1\/functions\/tick\n/);
    assert.match(out.stdout, /status: INVALID_ARGUMENT/);
    assert.match(out.stdout, /No answer from firebasehosting\.googleapis\.com\/v1beta1\/projects\/-\/sites: Error: read ECONNRESET/);
});

test('prints no key, token, config value or upload address from the debug file', t => {
    const dir = tmp(t);
    fs.writeFileSync(path.join(dir, LOG), LOG_TEXT);
    const summary = path.join(dir, 'summary.md');
    const out = run('print', dir, { GITHUB_STEP_SUMMARY: summary });
    noSecret(out.stdout + out.stderr);
    noSecret(fs.readFileSync(summary, 'utf8'));
    assert.match(fs.readFileSync(summary, 'utf8'), /PERMISSION_DENIED/);
    // The refused upload is named by host and status only: no signed address, no body.
    assert.match(out.stdout, /403 to PUT storage\.googleapis\.com\n/);
    assert.match(out.stdout, /the answer carried no JSON error; its text is not shown/);
    // Fields of an error body that are not on the list are dropped.
    assert.doesNotMatch(out.stdout, /echo|"env"|value/);
});

test('every printed line comes from a refusal: an answer below 400 and every request are left out', () => {
    const text = report(LOG_TEXT);
    assert.doesNotMatch(text, /runtimeconfig|oauth2|Command:|authorizing/);
    assert.strictEqual(text.split('\n').filter(l => /^ {2}\S/.test(l)).length, 5);
});

test('scrub removes secrets by shape, cuts long text and breaks workflow commands', () => {
    noSecret(scrub(Object.values(SECRETS).join(' ') + ' ' + UPLOAD));
    assert.strictEqual(scrub('see https://console.cloud.google.com/iam-admin/iam?project=p&token=abc'), 'see console.cloud.google.com/iam-admin/iam');
    assert.strictEqual(scrub('https://user:pass@example.invalid/x/y?z=1'), 'example.invalid');
    assert.strictEqual(scrub('Permission firebasedatabase.instances.get denied on projects/-/locations/-/instances/bullshit-wtf-prod'),
        'Permission firebasedatabase.instances.get denied on projects/-/locations/-/instances/bullshit-wtf-prod');
    assert.strictEqual(scrub('a\n::error::b'), 'a : :error: :b');
    assert.strictEqual(scrub('word '.repeat(200)).length, 303);
});

test('reset empties the file and keeps a second name that survives the tool\'s own delete', t => {
    const dir = tmp(t);
    fs.writeFileSync(path.join(dir, LOG), 'left over from the command before\n');
    fs.writeFileSync(path.join(dir, KEPT), 'left over from the command before\n');
    assert.strictEqual(run('reset', dir).status, 0);
    assert.strictEqual(fs.readFileSync(path.join(dir, LOG), 'utf8'), '');
    assert.strictEqual(fs.readFileSync(path.join(dir, KEPT), 'utf8'), '');
    // The tool appends to the file it finds, and deletes it when it exits with code 0 or 1.
    fs.appendFileSync(path.join(dir, LOG), LOG_TEXT);
    fs.unlinkSync(path.join(dir, LOG));
    const out = run('print', dir);
    assert.match(out.stdout, /status: PERMISSION_DENIED/);
    noSecret(out.stdout);
});

test('with no debug file, or one without a refusal, it says so and still exits 0', t => {
    const dir = tmp(t);
    let out = run('print', dir);
    assert.strictEqual(out.status, 0);
    assert.match(out.stdout, /No Firebase debug file with content/);
    fs.writeFileSync(path.join(dir, LOG), `[debug] ${T} <<< [apiv2][status] GET ${DB} 200\n[debug] ${T} <<< [apiv2][body] GET ${DB} {"name":"x"}\n`);
    out = run('print', dir);
    assert.strictEqual(out.status, 0);
    assert.match(out.stdout, /holds no refused request/);
});
