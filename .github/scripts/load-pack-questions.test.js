// node --test .github/scripts/*.test.js
// Made-up answers only: no request leaves this machine.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { PACK_FILE, ID, WRITE_PATH, RESULTS, payload, check, allowedWrite, allowedRead, load, dryRun } = require('./load-pack-questions.js');

const ROOT = path.join(__dirname, '..', '..');
const PROJECT = 'made-up-project';
const DB = `https://${PROJECT}.firebaseio.com`;
const QUESTIONS = JSON.parse(fs.readFileSync(path.join(ROOT, PACK_FILE), 'utf8'));
const URLS = {
    project: `https://firebase.googleapis.com/v1beta1/projects/${PROJECT}`,
    config: `https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/adminSdkConfig`,
};
const api = (answers = {}) => {
    const sent = [];
    const request = async o => {
        sent.push(o);
        const a = answers[o.url] || {
            [URLS.project]: { status: 200, data: { projectId: PROJECT, resources: { realtimeDatabaseInstance: PROJECT } } },
            [URLS.config]: { status: 200, data: { projectId: PROJECT, databaseURL: DB } },
        }[o.url];
        return a || { status: 404, data: null };
    };
    return { request, sent };
};
const writer = (answer = o => ({ status: 200, data: JSON.parse(JSON.stringify(o.data)) })) => {
    const sent = [];
    return { sent, request: async o => { sent.push(o); return answer(o); } };
};
const noAnswer = (place, e) => [`no answer from ${place}: ${e && e.code}`];
const tmpWith = data => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-'));
    fs.mkdirSync(path.join(dir, path.dirname(PACK_FILE)), { recursive: true });
    fs.writeFileSync(path.join(dir, PACK_FILE), JSON.stringify(data));
    return dir;
};
const one = () => JSON.parse(JSON.stringify(QUESTIONS['hanukkah-26-en-01']));

test('the repository\'s file passes the check, and every key in it is a pack id', () => {
    const data = payload(ROOT);
    assert.ok(Object.keys(data).length > 0);
    for (const id of Object.keys(data)) {
        assert.match(id, ID);
        assert.match(id, /^hanukkah-26-/);
        assert.strictEqual(data[id].pack, 'hanukkah');
    }
});

test('the dry run names exactly the file\'s ids, as an update', () => {
    const lines = dryRun(ROOT);
    assert.match(lines[0], /^Would send: PATCH .*\/questions\.json \(an update, never a set\)$/);
    assert.ok(lines[1].endsWith(Object.keys(QUESTIONS).join(', ')));
    assert.match(lines[2], /: yes$/);
});

test('one update of questions/ is sent, its body exactly the file, and nothing else is written', async () => {
    const a = api();
    const w = writer();
    const r = await load(PROJECT, ROOT, a.request, w.request, noAnswer);
    assert.strictEqual(r.ok, true, r.lines.join('\n'));
    assert.deepStrictEqual(a.sent.map(o => [o.method, o.url]), [['GET', URLS.project], ['GET', URLS.config]]);
    assert.ok(a.sent.every(o => !('data' in o)));
    assert.strictEqual(w.sent.length, 1);
    assert.strictEqual(w.sent[0].method, 'PATCH');
    assert.strictEqual(w.sent[0].url, DB + WRITE_PATH);
    assert.deepStrictEqual(w.sent[0].data, QUESTIONS);
    assert.ok(Object.keys(w.sent[0].data).every(k => /^hanukkah-26-(en|he)-\d{2}$/.test(k)));
    // The printed lines name ids, never the database's address.
    assert.doesNotMatch(r.lines.join('\n'), /firebaseio/);
});

test('the lock allows a PATCH of pack questions to questions.json and nothing else', () => {
    const ok = { url: DB + '/questions.json', method: 'PATCH', data: QUESTIONS };
    assert.strictEqual(allowedWrite(ok), true);
    assert.strictEqual(allowedWrite({ ...ok, url: 'https://x.europe-west1.firebasedatabase.app/questions.json' }), true);
    const refused = [
        { ...ok, method: 'PUT' },
        { ...ok, method: 'POST' },
        { ...ok, method: 'DELETE' },
        { ...ok, url: DB + '/.json' },
        { ...ok, url: DB + '/questions/hanukkah-26-en-01.json' },
        { ...ok, url: DB + '/games.json' },
        { ...ok, url: DB + '/questions.json?print=silent' },
        { ...ok, url: 'http://' + PROJECT + '.firebaseio.com/questions.json' },
        { ...ok, url: 'https://example.com/questions.json' },
        { ...ok, data: { ...QUESTIONS, 'q-0001': one() } },
        { ...ok, data: { 'hanukkah-26-en-01': null } },
        { ...ok, data: {} },
        { ...ok, data: { 'hanukkah-26-en-01/questionText': 'x $blank$' } },
        { ...ok, data: { 'hanukkah-27-en-01': one() } },
    ];
    for (const o of refused) {
        assert.strictEqual(allowedWrite(o), false, `${o.method} ${o.url} ${Object.keys(o.data).slice(-1)}`);
    }
});

test('a file with anything but whole pack questions sends nothing', async () => {
    const bad = [
        { 'opener-en-01': one() },
        { 'hanukkah-26-en-01': { ...one(), lang: 'he' } },
        { 'hanukkah-26-en-01': { ...one(), pack: undefined } },
        { 'hanukkah-26-en-01': { ...one(), opener: true } },
        { 'hanukkah-26-en-01': { ...one(), questionText: 'no blank' } },
        { 'hanukkah-26-en-01': { ...one(), fakeAnswers: [] } },
        [],
        {},
    ];
    for (const data of bad) {
        assert.throws(() => check(JSON.parse(JSON.stringify(data))));
        const a = api();
        const w = writer();
        const r = await load(PROJECT, tmpWith(data), a.request, w.request, noAnswer);
        assert.strictEqual(r.ok, false);
        assert.strictEqual(a.sent.length + w.sent.length, 0);
    }
});

test('no write when the project or its database address is not as expected', async () => {
    const cases = [
        { [URLS.project]: { status: 403, data: { error: { status: 'PERMISSION_DENIED' } } } },
        { [URLS.project]: { status: 200, data: { projectId: 'other', resources: { realtimeDatabaseInstance: PROJECT } } } },
        { [URLS.config]: { status: 200, data: { projectId: PROJECT, databaseURL: 'https://other-instance.firebaseio.com' } } },
        { [URLS.config]: { status: 200, data: { projectId: PROJECT, databaseURL: 'https://evil.example.com' } } },
        { [URLS.config]: { status: 200, data: { projectId: PROJECT, databaseURL: DB + '/questions' } } },
    ];
    for (const answers of cases) {
        const w = writer();
        const r = await load(PROJECT, ROOT, api(answers).request, w.request, noAnswer);
        assert.strictEqual(r.ok, false);
        assert.strictEqual(w.sent.length, 0);
    }
});

test('a refused update, or an answer that is not what was sent, fails the step', async () => {
    const refused = await load(PROJECT, ROOT, api().request, writer(() => ({ status: 401, data: { error: 'Unauthorized request.' } })).request, noAnswer);
    assert.strictEqual(refused.ok, false);
    assert.match(refused.lines.join('\n'), /401 to PATCH questions\//);
    assert.match(refused.lines.join('\n'), /error: Unauthorized request\./);
    const odd = await load(PROJECT, ROOT, api().request, writer(() => ({ status: 200, data: null })).request, noAnswer);
    assert.strictEqual(odd.ok, false);
    const none = await load(PROJECT, ROOT, api().request, async () => { throw Object.assign(new Error('x'), { code: 'ETIMEDOUT' }); }, noAnswer);
    assert.strictEqual(none.ok, false);
    assert.match(none.lines.join('\n'), /no answer from PATCH/);
});

test('the update is sent with the database sign-in only, and the API reads never carry it', async () => {
    const a = api();
    const w = writer();
    await load(PROJECT, ROOT, a.request, w.request, noAnswer);
    assert.ok(a.sent.every(o => o.method === 'GET' && o.url.startsWith('https://firebase.googleapis.com/')));
    assert.ok(w.sent.every(o => o.method === 'PATCH' && o.url === DB + WRITE_PATH));
});

test('each way the step can end says which, for the run\'s summary', async () => {
    const result = async (answers, write, dir = ROOT) => (await load(PROJECT, dir, api(answers).request, write, noAnswer)).result;
    assert.strictEqual(await result({}, writer().request), 'written');
    assert.strictEqual(await result({}, writer(() => ({ status: 401, data: { error: 'Permission denied' } })).request), 'refused');
    assert.strictEqual(await result({}, writer(() => ({ status: 503, data: null })).request), 'refused');
    assert.strictEqual(await result({}, writer(() => ({ status: 200, data: null })).request), 'unclear');
    assert.strictEqual(await result({}, async () => { throw Object.assign(new Error('x'), { code: 'ECONNREFUSED' }); }), 'unclear');
    assert.strictEqual(await result({}, writer().request, tmpWith({ 'opener-en-01': one() })), 'not-sent');
    assert.strictEqual(await result({ [URLS.project]: { status: 403, data: null } }, writer().request), 'not-sent');
    assert.strictEqual(await result({ [URLS.config]: { status: 200, data: { projectId: PROJECT, databaseURL: 'https://evil.example.com' } } }, writer().request), 'not-sent');
    assert.deepStrictEqual(RESULTS, ['written', 'not-sent', 'refused', 'unclear']);
});

test('the lock refuses any option but the url, the method and the body: no headers, no params', () => {
    const ok = { url: DB + '/questions.json', method: 'PATCH', data: QUESTIONS };
    for (const more of [
        { headers: { 'X-HTTP-Method-Override': 'PUT' } },
        { headers: {} },
        { params: { 'x-http-method-override': 'PUT' } },
        { params: { print: 'silent' } },
        { baseURL: 'https://example.com' },
        { body: '{}' },
        { method: 'PATCH', paramsSerializer: () => 'x' },
    ]) {
        assert.strictEqual(allowedWrite({ ...ok, ...more }), false, Object.keys(more).join());
    }
    const read = { url: URLS.project, method: 'GET' };
    assert.strictEqual(allowedRead(read), true);
    for (const more of [{ headers: { 'X-HTTP-Method-Override': 'DELETE' } }, { params: { x: 1 } }, { data: {} }]) {
        assert.strictEqual(allowedRead({ ...read, ...more }), false, Object.keys(more).join());
    }
});

test('a request built with headers is never sent, by either sign-in', async () => {
    // The lock sits between the script and Google's library: what reaches the library is
    // exactly what load() built, url, method and data alone.
    const a = api();
    const w = writer();
    await load(PROJECT, ROOT, a.request, w.request, noAnswer);
    for (const o of a.sent) {
        assert.deepStrictEqual(Object.keys(o).sort(), ['method', 'url']);
    }
    for (const o of w.sent) {
        assert.deepStrictEqual(Object.keys(o).sort(), ['data', 'method', 'url']);
    }
});
