// node --test .github/scripts/*.test.js
// Made-up answers only: no request leaves this machine.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { FILES, NEVER, MAX_QUESTIONS, WRITE_PATH, RESULTS, checkList, payload, check, allowedWrite, allowedRead, load, dryRun } = require('./load-pack-questions.js');

const ROOT = path.join(__dirname, '..', '..');
const PROJECT = 'made-up-project';
const DB = `https://${PROJECT}.firebaseio.com`;
const PACK_FILE = 'functions/data/hanukkah-questions.json';
const FACTS_FILE = 'functions/data/strange-facts-2026-11.json';
const read = file => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
const PACK = read(PACK_FILE);
const FACTS = read(FACTS_FILE);
// What the release sends: every listed file's questions, in the list's order.
const QUESTIONS = { ...PACK, ...FACTS };
const ANY_ID = /^(hanukkah|fact)-26-(en|he)-\d{2}$/;
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
// A checkout with the repository's listed files, except the ones named in `files`
// ({ path: data }); a path whose data is undefined is left out of the checkout.
const tmpWith = (data, files = { [PACK_FILE]: data }) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pack-'));
    fs.mkdirSync(path.join(dir, 'functions', 'data'), { recursive: true });
    const all = { [PACK_FILE]: PACK, [FACTS_FILE]: FACTS, ...files };
    for (const file of Object.keys(all)) {
        if (all[file] !== undefined) {
            fs.writeFileSync(path.join(dir, file), JSON.stringify(all[file]));
        }
    }
    return dir;
};
const one = () => JSON.parse(JSON.stringify(PACK['hanukkah-26-en-01']));
const fact = () => JSON.parse(JSON.stringify(FACTS['fact-26-en-01']));

test('the repository\'s files pass the check, and every key is an id of its own file', () => {
    const { questions, counts } = payload(ROOT);
    assert.deepStrictEqual(questions, QUESTIONS);
    assert.deepStrictEqual(counts.map(c => c.file), [PACK_FILE, FACTS_FILE]);
    assert.deepStrictEqual(counts[0].ids, Object.keys(PACK));
    assert.deepStrictEqual(counts[1].ids, Object.keys(FACTS));
    for (const id of Object.keys(PACK)) {
        assert.match(id, /^hanukkah-26-(en|he)-\d{2}$/);
        assert.strictEqual(questions[id].pack, 'hanukkah');
    }
    for (const id of Object.keys(FACTS)) {
        assert.match(id, /^fact-26-(en|he)-\d{2}$/);
        // A question of the normal bank: exactly the five fields, no pack and no opener flag.
        assert.deepStrictEqual(Object.keys(questions[id]).sort(), ['citation', 'fakeAnswers', 'lang', 'questionText', 'realAnswer']);
    }
    assert.strictEqual(Object.keys(FACTS).length, 120);
});

// The list is written out, file by file. This test is the place a new file is added on purpose.
test('the list of question files is exactly the reviewed ones, and never the daily puzzle\'s', () => {
    assert.deepStrictEqual(FILES.map(f => [f.file, String(f.id), f.pack]), [
        ['functions/data/hanukkah-questions.json', '/^hanukkah-26-(en|he)-\\d{2}$/', 'hanukkah'],
        ['functions/data/strange-facts-2026-11.json', '/^fact-26-(en|he)-\\d{2}$/', null],
    ]);
    assert.doesNotThrow(() => checkList(FILES));
    assert.deepStrictEqual(NEVER, ['functions/data/daily-questions.json']);
    // No glob, no directory listing: the script names its files and reads nothing else.
    const code = fs.readFileSync(path.join(__dirname, 'load-pack-questions.js'), 'utf8')
        .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(code, /readdir|glob|opendir/);
    assert.strictEqual(code.split('readFileSync').length - 1, 1);
    const daily = { file: 'functions/data/daily-questions.json', name: 'the daily puzzle', id: /^daily-26-(en|he)-\d{2}$/, like: 'daily-26-en-01', pack: null };
    const bad = [
        [],
        FILES.concat(daily),
        [daily],
        FILES.concat(FILES[0]),
        [{ ...FILES[0], file: 'functions/data/../../secrets.json' }],
        [{ ...FILES[0], file: 'game/src/questions.json' }],
        [{ ...FILES[0], file: 'functions/data/*.json' }],
        [{ ...FILES[0], id: /hanukkah/ }],
        [{ ...FILES[0], id: /^.*$/ }, FILES[1]],
        [FILES[0], { ...FILES[1], id: /^(hanukkah|fact)-26-(en|he)-\d{2}$/ }],
        [{ ...FILES[0], pack: '' }],
        [{ ...FILES[0], pack: undefined }],
    ];
    for (const files of bad) {
        assert.throws(() => checkList(files), JSON.stringify(files.map(f => [f.file, String(f.id)])));
        assert.throws(() => payload(ROOT, files));
    }
});

test('the daily puzzle\'s questions are refused, as a file and as a body', async () => {
    const daily = { 'daily-2026-11-27-en': fact(), '2026-11-27': fact() };
    assert.throws(() => check(daily));
    assert.strictEqual(allowedWrite({ url: DB + '/questions.json', method: 'PATCH', data: { ...QUESTIONS, 'daily-2026-11-27-en': fact() } }), false);
    // Present in the checkout, and still never read or sent.
    const dir = tmpWith(null, { 'functions/data/daily-questions.json': daily, 'functions/data/unreviewed-pack.json': { 'fact-26-en-99': fact() } });
    const w = writer();
    const r = await load(PROJECT, dir, api().request, w.request, noAnswer);
    assert.strictEqual(r.ok, true, r.lines.join('\n'));
    assert.deepStrictEqual(w.sent[0].data, QUESTIONS);
    assert.doesNotMatch(r.lines.join('\n'), /daily|unreviewed|fact-26-en-99/);
});

test('the dry run names exactly the file\'s ids, as an update', () => {
    const lines = dryRun(ROOT);
    assert.match(lines[0], /^Would send: PATCH .*\/questions\.json \(an update, never a set\)$/);
    assert.strictEqual(lines[1], `Question files (2): ${PACK_FILE}, ${FACTS_FILE}`);
    assert.strictEqual(lines[2], `Children of questions/ it writes (${Object.keys(QUESTIONS).length}):`);
    assert.strictEqual(lines[3], `  from ${PACK_FILE}, the Hanukkah pack (${Object.keys(PACK).length}): ${Object.keys(PACK).join(', ')}`);
    assert.strictEqual(lines[4], `  from ${FACTS_FILE}, the strange facts (120): ${Object.keys(FACTS).join(', ')}`);
    assert.match(lines[5], /: yes$/);
    assert.strictEqual(lines.length, 7);
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
    assert.ok(Object.keys(w.sent[0].data).every(k => ANY_ID.test(k)));
    assert.match(r.lines.join('\n'), /Written from functions\/data\/hanukkah-questions\.json \(\d+\): hanukkah-26-en-01, /);
    assert.match(r.lines.join('\n'), /Written from functions\/data\/strange-facts-2026-11\.json \(120\): fact-26-en-01, /);
    // The printed lines name ids, never the database's address.
    assert.doesNotMatch(r.lines.join('\n'), /firebaseio/);
});

test('the lock allows a PATCH of the listed files\' questions to questions.json and nothing else', () => {
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
        { ...ok, data: { 'fact-26-en-01': null } },
        { ...ok, data: { 'fact-26-en-01/realAnswer': 'x' } },
        { ...ok, data: { 'fact-27-en-01': fact() } },
        { ...ok, data: { 'fact-26-en-001': fact() } },
        { ...ok, data: { 'fact-26-fr-01': fact() } },
        // A question in the other file's shape: a fact with a pack, a pack question without one.
        { ...ok, data: { 'fact-26-en-01': one() } },
        { ...ok, data: { 'hanukkah-26-en-01': fact() } },
        { ...ok, data: { 'opener-en-01': fact() } },
    ];
    // Either file alone is a whole body too (the lock checks questions, not the count of files).
    assert.strictEqual(allowedWrite({ ...ok, data: PACK }), true);
    assert.strictEqual(allowedWrite({ ...ok, data: FACTS }), true);
    for (const o of refused) {
        assert.strictEqual(allowedWrite(o), false, `${o.method} ${o.url} ${Object.keys(o.data).slice(-1)}`);
    }
});

test('a pack file with anything but whole pack questions sends nothing, for any file', async () => {
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

test('a strange-facts file with anything but whole five-field questions sends nothing, for any file', async () => {
    const bad = [
        { 'q-0001': fact() },
        { 'hanukkah-26-en-90': one() },
        { 'fact-26-en-01': { ...fact(), lang: 'he' } },
        { 'fact-26-he-01': fact() },
        { 'fact-26-en-01': { ...fact(), pack: 'hanukkah' } },
        { 'fact-26-en-01': { ...fact(), pack: '' } },
        { 'fact-26-en-01': { ...fact(), opener: true } },
        { 'fact-26-en-01': { ...fact(), citation: '' } },
        { 'fact-26-en-01': { ...fact(), citation: undefined } },
        { 'fact-26-en-01': { ...fact(), questionText: 'no blank' } },
        { 'fact-26-en-01': { ...fact(), realAnswer: 7 } },
        { 'fact-26-en-01': { ...fact(), fakeAnswers: 'one' } },
        { 'fact-26-en-01': 'a question' },
        Object.fromEntries(Array.from({ length: MAX_QUESTIONS + 1 }, (_, i) => [`fact-26-en-${String(i).padStart(2, '0')}x`, fact()])),
        [],
        {},
        undefined,
    ];
    for (const data of bad) {
        const a = api();
        const w = writer();
        const r = await load(PROJECT, tmpWith(null, { [FACTS_FILE]: data }), a.request, w.request, noAnswer);
        assert.strictEqual(r.ok, false, String(JSON.stringify(data)).slice(0, 80));
        assert.strictEqual(r.result, 'not-sent');
        assert.strictEqual(a.sent.length + w.sent.length, 0);
        assert.match(r.lines.join('\n'), /strange-facts-2026-11\.json/);
        assert.match(r.lines.join('\n'), /Nothing was sent, for any question file\./);
    }
});

test('a question may only be in the file its id belongs to', () => {
    // A Hanukkah id in the strange-facts file, whole and well-formed, is still refused.
    assert.throws(() => payload(tmpWith(null, { [FACTS_FILE]: { ...FACTS, 'hanukkah-26-en-90': one() } })), /strange-facts-2026-11\.json: Not an id/);
    assert.throws(() => payload(tmpWith({ ...PACK, 'fact-26-en-90': fact() })), /hanukkah-questions\.json: Not an id/);
    // Two digits and two languages: a file holds at most 200 ids, the cap, and that many pass.
    const many = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`fact-26-en-${String(i).padStart(2, '0')}`, fact()])
        .concat(Array.from({ length: 100 }, (_, i) => [`fact-26-he-${String(i).padStart(2, '0')}`, { ...fact(), lang: 'he' }])));
    assert.doesNotThrow(() => check(many));
    assert.strictEqual(Object.keys(many).length, MAX_QUESTIONS);
});

test('an edit to one question changes only that id in the body; a removed one is simply not sent', async () => {
    const edited = JSON.parse(JSON.stringify(FACTS));
    edited['fact-26-en-01'].realAnswer = 'busyness';
    delete edited['fact-26-he-60'];
    const w = writer();
    const r = await load(PROJECT, tmpWith(null, { [FACTS_FILE]: edited }), api().request, w.request, noAnswer);
    assert.strictEqual(r.ok, true, r.lines.join('\n'));
    const body = w.sent[0].data;
    assert.strictEqual(body['fact-26-en-01'].realAnswer, 'busyness');
    assert.ok(!('fact-26-he-60' in body));
    // Not sent as null either: a null child in an update would delete it.
    assert.ok(Object.values(body).every(q => q && typeof q === 'object'));
    assert.strictEqual(Object.keys(body).length, Object.keys(QUESTIONS).length - 1);
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
