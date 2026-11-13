// Shared by the local runs that need the Realtime Database emulator (stray-pick-game.js).
// Start it first, on 127.0.0.1:9000 (see test/sleeping-phones.js for how).

const fs = require('fs');
const path = require('path');

const DB_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000';
const NS = 'demo-bullshit';
process.env.FIREBASE_DATABASE_EMULATOR_HOST = DB_HOST;
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: NS, databaseURL: `http://${DB_HOST}?ns=${NS}` });
process.env.GCLOUD_PROJECT = NS;

const url = (p, query = '') => `http://${DB_HOST}/${p}.json?ns=${NS}${query}`;

async function rest(method, p, body, { headers = {}, query = '' } = {}) {
    const res = await fetch(url(p, query), {
        method,
        headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
    return { ok: res.ok, status: res.status, json };
}

// The emulator takes the bearer token "owner" as the project's owner: no rule applies.
const owner = { headers: { Authorization: 'Bearer owner' } };
// The functions' own access: rules apply, as the uid the rules name.
const server = { headers: { Authorization: 'Bearer owner' }, query: `&auth_variable_override=${encodeURIComponent(JSON.stringify({ uid: 'bl-service-worker' }))}` };
// A phone that is not signed in.
const phone = {};

// A phone signed in anonymously. The emulator accepts an unsigned token.
function signedIn(uid) {
    const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const token = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({
        iss: `https://securetoken.google.com/${NS}`, aud: NS, sub: uid, user_id: uid, iat: now, exp: now + 3600,
        firebase: { sign_in_provider: 'anonymous', identities: {} },
    })}.`;
    return { query: `&auth=${token}` };
}

/** Loads a rules file into the emulator (default: the repository's database-rules.json). */
async function loadRules(file = path.join(__dirname, '..', '..', 'database-rules.json')) {
    const res = await fetch(`http://${DB_HOST}/.settings/rules.json?ns=${NS}`, {
        method: 'PUT', headers: owner.headers, body: fs.readFileSync(file, 'utf8'),
    });
    if (!res.ok) {
        throw new Error(`could not load the rules from ${file}: ${res.status} ${await res.text()}`);
    }
    return file;
}

module.exports = { DB_HOST, NS, rest, owner, server, phone, signedIn, loadRules };
