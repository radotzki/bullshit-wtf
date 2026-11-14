// Server errors in Sentry (src/report.ts): what is reported, what is never in a report, the cap,
// and that reporting cannot fail or hold a function. Runs the compiled functions (dist/).
// Nothing here reaches Sentry: the sender is swapped for a list, or pointed at a server on
// 127.0.0.1 that this file starts.
//   PRINT_REPORTS=1 node --test test/report.test.js   shows every report as it would be sent.
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const path = require('path');
const http = require('http');

// ---- the functions' entry with stand-in controllers, so a test decides what each step does ----
const steps = {};
const controller = (names) => Object.fromEntries(names.map(n => [n, (...args) => steps[n](...args)]));
const stand = {
    'tick': controller(['tick', 'advance']),
    'phase-timer': controller(['onPhaseStart']),
    'answer': controller(['answer']),
    'new-game': controller(['newGame']),
    'on-answer-selection': controller(['onAnswerSelection']),
    'on-reveal-done': controller(['onRevealDone']),
    'join': controller(['join']),
    'fork': controller(['fork']),
    'start': controller(['startGame', 'hostHere', 'hostToBigScreen']),
    'validate-game-name': controller(['validateGameName']),
    'crew': controller(['createCrew', 'crewRematch']),
    'laugh': controller(['laugh']),
    'analytics': Object.assign(controller(['onJoinGame', 'onShare', 'onStateChange', 'onFork']),
        { cleanVia: () => null, cleanShare: (b) => b && b.content_type ? b : null }),
};
const fakeFunctions = {
    https: { onRequest: (h) => ({ __handler: h }) },
    database: { ref: () => ({ onWrite: (h) => ({ __trigger: h }) }) },
};
fakeFunctions.runWith = () => fakeFunctions;
const realLoad = Module._load;
Module._load = function (request) {
    if (request === 'firebase-functions/v1') return fakeFunctions;
    if (request === 'cors') return () => (req, res, next) => next();
    const m = /^\.\/controllers\/([\w-]+)$/.exec(request);
    if (m && stand[m[1]]) return stand[m[1]];
    if (/[\\/]firebase$/.test(request)) throw new Error('the database is not for this test');
    return realLoad.apply(this, arguments);
};

const dist = path.join(__dirname, '..', 'dist');
const reporter = require(path.join(dist, 'report'));
const api = require(path.join(dist, 'index'));
test.after(() => { Module._load = realLoad; });

// The line the reporter writes for every error is the functions' own log: keep the test's output clean.
const logged = [];
const hooked = console.error;
console.error = (...args) => { const real = process.stderr.write; process.stderr.write = () => true; try { hooked(...args); } finally { process.stderr.write = real; } logged.push(args); };

const prod = reporter.testing.targets['bullshit-wtf-prod'];
let sent;
function fresh(options = {}) {
    sent = [];
    reporter.testing.reset(Object.assign({
        target: prod,
        release: 'a'.repeat(40),
        transport: async (event) => { sent.push(event); return { ok: true }; },
        markLookup: async () => undefined,
        // The stand-in steps write their error lines from this file: here it counts as the functions' own code.
        ownFolders: [dist, __dirname],
    }, options));
    Object.keys(steps).forEach(k => delete steps[k]);
}
test.afterEach(() => {
    if (process.env.PRINT_REPORTS) sent.forEach(e => console.log(JSON.stringify(e)));
});

function call(name, body, headers = {}) {
    return new Promise((resolve) => {
        const res = {
            code: 200,
            status(c) { this.code = c; return this; },
            send(b) { resolve({ code: this.code, body: b, at: Date.now() }); return this; },
            set() { return this; },
        };
        api[name].__handler({ body, headers, method: 'POST' }, res);
    });
}
const trigger = (name, pin, after) => api[name].__trigger({ after: { val: () => after } }, { params: { pin } });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const boom = (message = "Cannot read properties of null (reading 'realAnswer')") => new TypeError(message);

// ---- what is an error ----

test('an answer given on purpose is no error; anything else thrown is', () => {
    for (const e of [{ message: 'Sorry, game is full', code: 'GAME_IS_FULL' }, { message: 'Wrong game PIN', code: 'GAME_NOT_EXIST' },
        { message: 'That game is over', code: 'GAME_OVER', rematch: 'ABCD' }, { message: 'Only the host can start this game', code: 'NOT_HOST' }]) {
        assert.strictEqual(reporter.isExpected(e), true, e.code);
    }
    const denied = Object.assign(new Error('permission_denied'), { code: 'PERMISSION_DENIED' });
    for (const e of [new Error('x'), boom(), denied, 'a string', undefined, null, 7, { message: 'no code' }, { code: 'NO_MESSAGE' }]) {
        assert.strictEqual(reporter.isExpected(e), false, String(e));
    }
});

test('a refused join answers as before and sends nothing', async () => {
    fresh();
    steps.join = async () => { throw { message: 'Sorry, game is full', code: 'GAME_IS_FULL' }; };
    const res = await call('join', { pin: 'abcd', nickname: 'Dana', uid: 'u1' });
    assert.deepStrictEqual([res.code, res.body], [400, { message: 'Sorry, game is full', code: 'GAME_IS_FULL' }]);
    assert.strictEqual(sent.length, 0);
});

test('a fault in an HTTP function: the same answer as before, and one report', async () => {
    fresh({ markLookup: async (pin) => { assert.strictEqual(pin, 'ABCD'); return undefined; } });
    steps.join = async () => { throw boom(); };
    const res = await call('join', { pin: 'abcd', nickname: 'Dana', uid: 'u1' });
    assert.deepStrictEqual([res.code, res.body], [400, { message: "Cannot read properties of null (reading 'realAnswer')", code: 'INTERNAL' }]);
    assert.strictEqual(sent.length, 1);
    const e = sent[0];
    assert.deepStrictEqual(e.tags, { side: 'server', function: 'join', test: 'no', pin: 'ABCD' });
    assert.strictEqual(e.release, 'a'.repeat(40));
    assert.strictEqual(e.environment, 'production');
    assert.strictEqual(e.platform, 'node');
    assert.strictEqual(e.transaction, 'join');
    assert.strictEqual(e.exception.values[0].type, 'TypeError');
    assert.strictEqual(e.exception.values[0].value, "Cannot read properties of null (reading 'realAnswer')");
    assert.strictEqual(e.exception.values[0].mechanism.handled, true);
    const frames = e.exception.values[0].stacktrace.frames;
    assert.ok(frames.length > 0 && frames.every(f => typeof f.filename === 'string' && f.lineno > 0));
    assert.ok(frames.every(f => f.filename[0] !== '/' && !/^[A-Za-z]:/.test(f.filename)), 'no folder of the machine in a file name');
    assert.match(e.event_id, /^[0-9a-f]{32}$/);
});

test('every HTTP function with a catch reports its fault under its own name', async () => {
    const bodies = { newGame: { locale: 'en', count: 5 }, crewRematch: { crew: 'c1' } };
    for (const [name, step] of [['newGame', 'newGame'], ['fork', 'fork'], ['createCrew', 'createCrew'], ['crewRematch', 'crewRematch'],
        ['startGame', 'startGame'], ['hostHere', 'hostHere'], ['hostToBigScreen', 'hostToBigScreen'], ['answer', 'answer'], ['join', 'join'], ['validateGameName', 'validateGameName'],
        ['onJoinGame', 'onJoinGame'], ['onShare', 'onShare'], ['laugh', 'laugh']]) {
        fresh();
        steps[step] = async () => { throw boom(); };
        const res = await call(name, bodies[name] || { pin: 'abcd', content_type: 'x' });
        assert.ok(res.code >= 200, name);
        assert.strictEqual(sent.length, 1, name);
        assert.strictEqual(sent[0].tags.function, name);
    }
});

test('a fault that escapes a trigger is reported as unhandled, and the trigger still fails', async () => {
    for (const [name, step] of [['tick', 'tick'], ['phaseTimer', 'onPhaseStart'], ['onAnswerSelection', 'onAnswerSelection'],
        ['onRevealDone', 'onRevealDone'], ['gameState', 'onStateChange'], ['onFork', 'onFork']]) {
        fresh();
        const fault = boom();
        steps[step] = async () => { throw fault; };
        await assert.rejects(trigger(name, 'wxyz', { id: 2 }), (e) => e === fault, name);
        assert.strictEqual(sent.length, 1, name);
        assert.deepStrictEqual(sent[0].tags, { side: 'server', function: name, test: 'no', pin: 'WXYZ' });
        assert.strictEqual(sent[0].exception.values[0].mechanism.handled, false);
    }
});

test('a trigger that works sends nothing and returns what it returned', async () => {
    fresh();
    steps.tick = async () => 'moved';
    assert.strictEqual(await trigger('tick', 'wxyz'), 'moved');
    assert.strictEqual(sent.length, 0);
});

test('a fault a step logs and swallows is reported too, once, with the game it happened in', async () => {
    fresh();
    const fault = boom('scores is not iterable');
    steps.tick = async (pin) => {
        console.error(`[PIN: ${pin}] Failed to score the picks, revealing without them`, fault);
        console.error(`[PIN: ${pin}] Failed to score the picks, revealing without them`, fault);
    };
    await trigger('tick', 'wxyz');
    assert.strictEqual(sent.length, 1);
    assert.deepStrictEqual(sent[0].tags, { side: 'server', function: 'tick', test: 'no', pin: 'WXYZ' });
    assert.strictEqual(sent[0].exception.values[0].value, 'scores is not iterable');
    assert.deepStrictEqual(sent[0].exception.values[0].mechanism, { type: 'logged', handled: true });
});

test('an error line without an Error sends its first words only, never the rest', async () => {
    fresh();
    steps.onStateChange = async () => {
        console.error('Bigquery Insert failed', 'A failure occurred during this request.', JSON.stringify([{ row: { nickname: 'Dana Levi', ip: '10.1.2.3' } }]));
    };
    await trigger('gameState', 'wxyz');
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].exception.values[0].type, 'LoggedError');
    assert.strictEqual(sent[0].exception.values[0].value, 'Bigquery Insert failed');
    assert.ok(!/Dana|10\.1\.2\.3|failure occurred/.test(JSON.stringify(sent[0])));
});

test('an error that is logged, caught and thrown on is one report', async () => {
    fresh();
    const fault = boom();
    steps.newGame = async () => { throw fault; };
    await call('newGame', { locale: 'en', count: 5 });
    steps.tick = async () => { console.error('Failed to advance', fault); throw fault; };
    await assert.rejects(trigger('tick', 'wxyz'));
    assert.strictEqual(sent.length, 1);
});

// ---- only the functions' own error lines ----

test('an error line that the functions\' own code did not write is no report', async () => {
    const fs = require('fs');
    const os = require('os');
    // A file outside the build, as Node's own code, the functions framework and every library are.
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'not-ours-'));
    const outside = path.join(folder, 'outside.js');
    fs.writeFileSync(outside, 'exports.line = (...args) => console.error(...args);\n');
    // And one inside the build: the real rule, with nothing swapped.
    const inside = path.join(dist, 'own-line-check.js');
    fs.writeFileSync(inside, 'exports.line = (...args) => console.error(...args);\n');
    // The reporter's own console.error, without this file's quiet wrapper between it and the line's writer.
    const wrapped = console.error;
    console.error = hooked;
    const stderr = process.stderr.write;
    process.stderr.write = () => true;
    try {
        fresh({ ownFolders: undefined });
        steps.tick = async () => {
            require(outside).line('(node:1) [DEP0040] DeprecationWarning: The `punycode` module is deprecated.');
            require(outside).line(boom('printed by the framework').stack);
            require(outside).line('a library says', boom('a library fault'));
            console.error('written from the test file, which is not the build either', boom('not ours'));
        };
        await trigger('tick', 'wxyz');
        assert.strictEqual(sent.length, 0);
        steps.tick = async () => { require(inside).line('Failed to advance', boom('ours')); };
        await trigger('tick', 'wxyz');
        assert.strictEqual(sent.length, 1);
        assert.strictEqual(sent[0].exception.values[0].value, 'ours');
    } finally {
        console.error = wrapped;
        process.stderr.write = stderr;
        fs.rmSync(inside, { force: true });
        fs.rmSync(folder, { recursive: true, force: true });
    }
});

test('a trigger that fails is one report, also when the framework then prints the crash', async () => {
    const fs = require('fs');
    const os = require('os');
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'framework-'));
    const framework = path.join(folder, 'framework.js');
    // As the functions framework does: run the trigger, and print the crash's stack as text.
    fs.writeFileSync(framework, 'exports.run = (f) => f().catch(e => { console.error(e.stack); });\n');
    const wrapped = console.error;
    console.error = hooked;
    const stderr = process.stderr.write;
    process.stderr.write = () => true;
    try {
        fresh({ ownFolders: undefined });
        steps.tick = async () => { throw boom(); };
        await require(framework).run(() => trigger('tick', 'wxyz'));
        await reporter.settled();
        assert.strictEqual(sent.length, 1);
        assert.strictEqual(sent[0].exception.values[0].type, 'TypeError');
        assert.deepStrictEqual(sent[0].exception.values[0].mechanism, { type: 'generic', handled: false });
    } finally {
        console.error = wrapped;
        process.stderr.write = stderr;
        fs.rmSync(folder, { recursive: true, force: true });
    }
});

// ---- a request the site never sends ----

test('a request the site never sends is answered as before and is no report', async () => {
    const lookups = [];
    fresh({ gameLookup: async (pin) => { lookups.push(pin); return false; } });
    const fault = () => { throw boom("Cannot read properties of undefined (reading 'toUpperCase')"); };
    for (const name of ['join', 'answer', 'fork', 'startGame', 'hostHere', 'hostToBigScreen', 'validateGameName', 'createCrew', 'laugh']) {
        const step = name === 'validateGameName' ? 'validateGameName' : name;
        steps[step] = async () => fault();
        for (const body of [{}, { nickname: 'Dana' }, { pin: 1234 }, { pin: 'AB.CD' }, { pin: 'ABCD/../x' }, { pin: '' }, { pin: null }, { pin: ['ABCD'] }]) {
            const res = await call(name, body);
            assert.deepStrictEqual([res.code, res.body.code], [400, 'INTERNAL'], name);
        }
    }
    steps.crewRematch = async () => fault();
    for (const body of [{}, { crew: 7 }, { crew: 'a b' }, { crew: 'x'.repeat(41) }]) {
        assert.strictEqual((await call('crewRematch', body)).code, 400);
    }
    // A new game with no language, which the site always sends.
    steps.newGame = async () => { console.error('newGame failed'); return fault(); };
    for (const body of [{}, { locale: 7 }, { locale: '' }, { count: 5, campaign: 'x' }]) {
        assert.strictEqual((await call('newGame', body)).code, 500);
    }
    // A step that logs its fault and plays on, inside such a request: no report either.
    steps.onJoinGame = async () => { console.error('Bigquery Insert failed', 'rows'); throw boom(); };
    assert.strictEqual((await call('onJoinGame', { pin: 'AB.CD' })).code, 200);
    assert.strictEqual(sent.length, 0);
    assert.deepStrictEqual(lookups, [], 'no database read for a request with no PIN to read');
});

test('anything but a POST is no report', async () => {
    fresh();
    const get = (name, body) => new Promise((resolve) => {
        const res = { code: 200, status(c) { this.code = c; return this; }, send(b) { resolve({ code: this.code, body: b }); return this; }, set() { return this; } };
        api[name].__handler({ body, headers: {}, method: 'GET' }, res);
    });
    steps.join = async () => { throw boom(); };
    steps.newGame = async () => { throw boom(); };
    assert.strictEqual((await get('join', { pin: 'abcd' })).code, 400);
    assert.strictEqual((await get('newGame', {})).code, 500);
    assert.strictEqual(sent.length, 0);
    // The same faults on a POST are reports.
    await call('join', { pin: 'abcd' });
    await call('newGame', { locale: 'en' });
    assert.strictEqual(sent.length, 2);
});

test('a fault about a game that does not exist is no report, and does not use up the cap', async () => {
    const there = { ABCD: true };
    const lookups = [];
    fresh({ gameLookup: async (pin) => { lookups.push(pin); return !!there[pin]; } });
    steps.fork = async () => { throw boom("Cannot read properties of null (reading 'locale')"); };
    // A Replay of a PIN no game has, 30 times: more than the cap of 10 an hour.
    for (let i = 0; i < 30; i++) {
        const res = await call('fork', { pin: 'zzzz' });
        assert.deepStrictEqual([res.code, res.body], [400, { message: "Cannot read properties of null (reading 'locale')", code: 'INTERNAL' }]);
    }
    assert.strictEqual(sent.length, 0);
    assert.strictEqual(lookups.length, 30);
    // The same fault in a game that exists is a report, with nothing said to be held back.
    await call('fork', { pin: 'abcd' });
    assert.strictEqual(sent.length, 1);
    assert.strictEqual(sent[0].tags.pin, 'ABCD');
    assert.strictEqual(sent[0].extra, undefined);
    // A trigger never asks: its game is the one whose write started it.
    steps.tick = async () => { throw boom('a trigger fault'); };
    await assert.rejects(trigger('tick', 'zzzz'));
    assert.strictEqual(sent.length, 2);
    assert.strictEqual(lookups.length, 31);
});

test('when the game cannot be looked up, the fault is still reported', async () => {
    for (const gameLookup of [() => { throw new Error('reader broke'); }, () => new Promise(() => undefined), async () => { throw new Error('rejected'); }]) {
        fresh({ gameLookup });
        steps.join = async () => { throw boom(); };
        await call('join', { pin: 'abcd' });
        assert.strictEqual(sent.length, 1);
    }
});

// ---- nothing personal ----

test('nothing a player typed or sent is in a report', async () => {
    fresh();
    const body = {
        pin: 'abcd', nickname: 'Dana Levi', answer: 'the Eiffel tower', uid: 'uid_3fK9xQ', pid: '-NxPlayerKey1', hostKey: 'hostkeyhostkeyhostkey1',
        name: 'דנה והחברים',
    };
    steps.answer = async () => {
        throw new Error(`Reference.set failed: "${body.answer}" by ${body.nickname} (${body.uid}, ${body.pid}, ${body.hostKey}) in ${body.name}, `
            + `THE EIFFEL TOWER, from 203.0.113.9 / 2001:db8:85a3:0:0:8a2e:370:7334, mail dana@example.com, said "שלום לכולם" and 'two words'`);
    };
    const res = await call('answer', body, { 'x-forwarded-for': '203.0.113.9', 'user-agent': 'Mozilla/5.0 (iPhone)' });
    assert.strictEqual(res.code, 400);
    assert.strictEqual(sent.length, 1);
    const all = JSON.stringify(sent[0]);
    for (const word of ['Dana', 'Levi', 'Eiffel', 'EIFFEL', 'uid_3fK9xQ', '-NxPlayerKey1', 'hostkeyhostkeyhostkey1', 'דנה', 'שלום', '203.0.113', '2001:db8',
        'dana@', 'example.com', 'two words', 'Mozilla', 'iPhone']) {
        assert.ok(all.indexOf(word) < 0, `"${word}" is in the report: ${sent[0].exception.values[0].value}`);
    }
    assert.strictEqual(sent[0].tags.pin, 'ABCD');
    // Only these keys, ever: no request, no user, no extra, no breadcrumbs.
    assert.deepStrictEqual(Object.keys(sent[0]).sort(), ['environment', 'event_id', 'exception', 'level', 'logger', 'platform', 'release',
        'sdk', 'server_name', 'tags', 'timestamp', 'transaction'].sort());
    assert.strictEqual(sent[0].server_name, 'functions');
});

test('the join usage call cuts the address and the browser out of the message too', async () => {
    fresh();
    steps.onJoinGame = async (uid, ip, useragent) => { throw new Error(`insert failed for ${ip} ${useragent} ${uid}`); };
    await call('onJoinGame', { pin: 'abcd', uid: 'uid_3fK9xQ', nickname: 'Dana' }, { 'x-forwarded-for': 'somehost.example, 10.0.0.1', 'user-agent': 'Mozilla/5.0 (iPhone; CPU)' });
    assert.strictEqual(sent.length, 1);
    assert.ok(!/somehost|10\.0\.0\.1|Mozilla|iPhone|uid_3fK9xQ/.test(JSON.stringify(sent[0])), sent[0].exception.values[0].value);
});

test('a PIN that is not a PIN is left out; a message is cut to 300 characters; a code is kept', async () => {
    fresh();
    steps.join = async () => { throw Object.assign(new Error('x'.repeat(5000)), { code: 'PERMISSION_DENIED' }); };
    await reporter.report('join', await steps.join().catch(e => e), { pin: 'Dana Levi <dana@example.com>', body: { nickname: 'n' } });
    assert.strictEqual(sent[0].tags.pin, undefined);
    assert.strictEqual(sent[0].tags.code, 'PERMISSION_DENIED');
    assert.strictEqual(sent[0].tags.test, 'unknown');
    assert.strictEqual(sent[0].exception.values[0].value.length, 300);
});

test('names and paths in quotes stay readable', () => {
    assert.strictEqual(reporter.cleanMessage("Cannot read properties of undefined (reading 'toLowerCase')"), "Cannot read properties of undefined (reading 'toLowerCase')");
    assert.strictEqual(reporter.cleanMessage("value contains undefined in property 'games.ABCD.answers.-Nx1.text'"), "value contains undefined in property 'games.ABCD.answers.-Nx1.text'");
    assert.strictEqual(reporter.cleanMessage('Unexpected token \'h\', "hello wor"... is not valid JSON'), 'Unexpected token \'h\', "[cut]"... is not valid JSON');
});

test('things that are thrown but are no Error still make a readable report', async () => {
    for (const thrown of ['just a string with Dana in it', undefined, null, 42, { message: 'no code here' }]) {
        fresh();
        steps.join = async () => { throw thrown; };
        await call('join', { pin: 'abcd' });
        assert.strictEqual(sent.length, 1, String(thrown));
        assert.strictEqual(sent[0].exception.values[0].type, 'NonError');
        assert.ok(!/Dana/.test(JSON.stringify(sent[0])));
    }
});

// ---- the test mark ----

test('a test game\'s report carries the test mark', async () => {
    const marks = { ABCD: 'test', EFGH: 'test-qa-lobby', IJKL: 'fb-he-hanukkah', MNOP: null };
    for (const [pin, want] of [['abcd', 'yes'], ['efgh', 'yes'], ['ijkl', 'no'], ['mnop', 'no']]) {
        fresh({ markLookup: async (p) => marks[p] });
        steps.tick = async () => { throw boom(); };
        await assert.rejects(trigger('tick', pin));
        assert.strictEqual(sent[0].tags.test, want, pin);
    }
});

test('a new game has its mark in the request, a crew in the crew', async () => {
    fresh({ markLookup: async () => { throw new Error('not asked for a new game'); } });
    steps.newGame = async () => { throw boom(); };
    await call('newGame', { locale: 'en', count: 5, campaign: 'test-release-check' });
    assert.strictEqual(sent[0].tags.test, 'yes');
    fresh();
    steps.newGame = async () => { throw boom(); };
    await call('newGame', { locale: 'en', count: 5 });
    assert.strictEqual(sent[0].tags.test, 'no');
    fresh({ markLookup: async (pin, crew) => { assert.deepStrictEqual([pin, crew], [undefined, 'crew1']); return 'test'; } });
    steps.crewRematch = async () => { throw boom(); };
    await call('crewRematch', { crew: 'crew1' });
    assert.strictEqual(sent[0].tags.test, 'yes');
});

test('a mark that cannot be read in time is "unknown", and the report still goes', async () => {
    fresh({ markLookup: () => new Promise(() => undefined) });
    steps.tick = async () => { throw boom(); };
    const t = Date.now();
    await assert.rejects(trigger('tick', 'abcd'));
    assert.ok(Date.now() - t < reporter.markTimeoutMs + 250, `took ${Date.now() - t} ms`);
    assert.strictEqual(sent[0].tags.test, 'unknown');
    fresh({ markLookup: async () => { throw new Error('database down'); } });
    steps.tick = async () => { throw boom(); };
    await assert.rejects(trigger('tick', 'abcd'));
    assert.strictEqual(sent[0].tags.test, 'unknown');
});

// ---- the cap ----

test('one fault is sent twice an hour by one copy of a function, however often it happens', async () => {
    fresh();
    steps.tick = async () => { throw boom(); };
    for (let i = 0; i < 200; i++) {
        await assert.rejects(trigger('tick', 'abcd'));
    }
    assert.strictEqual(sent.length, reporter.perFaultPerHour);
});

test('ten reports an hour in all, and the next one says how many were held back', async (t) => {
    fresh();
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    for (let i = 0; i < 40; i++) {
        steps.tick = async () => { throw boom('fault number ' + String.fromCharCode(97 + i)); };
        await assert.rejects(trigger('tick', 'abcd'));
    }
    assert.strictEqual(sent.length, reporter.perHour);
    t.mock.timers.tick(60 * 60 * 1000 + 1);
    await assert.rejects(trigger('tick', 'abcd'));
    assert.strictEqual(sent.length, reporter.perHour + 1);
    assert.deepStrictEqual(sent[sent.length - 1].extra, { held_back_since_last_report: 30 });
    assert.strictEqual(sent[0].extra, undefined);
});

test('fifty reports in the life of one copy of a function, then none', async (t) => {
    fresh();
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    for (let h = 0; h < 12; h++) {
        for (let i = 0; i < 12; i++) {
            steps.tick = async () => { throw boom('fault ' + String.fromCharCode(97 + h) + String.fromCharCode(97 + i)); };
            await assert.rejects(trigger('tick', 'abcd'));
        }
        t.mock.timers.tick(60 * 60 * 1000 + 1);
    }
    assert.strictEqual(sent.length, reporter.perLife);
});

test('numbers in a message do not make a new fault', async () => {
    fresh();
    for (let i = 0; i < 20; i++) {
        steps.tick = async () => { throw boom(`question ${i} of game ${1000 + i} is missing`); };
        await assert.rejects(trigger('tick', 'abcd'));
    }
    assert.strictEqual(sent.length, reporter.perFaultPerHour);
});

// ---- reporting never fails or holds a function ----

test('a send that fails is dropped: the function answers as before, nothing is retried', async () => {
    let tries = 0;
    fresh({ transport: async () => { tries++; throw new Error('getaddrinfo ENOTFOUND'); } });
    steps.join = async () => { throw boom(); };
    const res = await call('join', { pin: 'abcd' });
    assert.deepStrictEqual([res.code, res.body.code], [400, 'INTERNAL']);
    assert.strictEqual(tries, 1);
});

test('after two failed sends in a row sending rests, so a broken Sentry costs two waits and no more', async () => {
    let tries = 0;
    fresh({ transport: async () => { tries++; return { ok: false }; } });
    for (let i = 0; i < 8; i++) {
        steps.tick = async () => { throw boom('fault ' + String.fromCharCode(97 + i)); };
        await assert.rejects(trigger('tick', 'abcd'));
    }
    assert.strictEqual(tries, 2);
});

test('when Sentry says slow down, sending rests for as long as it says', async (t) => {
    let tries = 0;
    fresh({ transport: async () => { tries++; return { ok: false, restMs: 120000 }; } });
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
    const fail = async (i) => { steps.tick = async () => { throw boom('fault ' + String.fromCharCode(97 + i)); }; await assert.rejects(trigger('tick', 'abcd')); };
    await fail(0); await fail(1); await fail(2);
    assert.strictEqual(tries, 1);
    t.mock.timers.tick(120001);
    await fail(3);
    assert.strictEqual(tries, 2);
});

test('Sentry\'s own limit headers are read', () => {
    assert.strictEqual(reporter.restFromHeaders(429, '30', null), 30000);
    assert.strictEqual(reporter.restFromHeaders(429, null, null), 60000);
    assert.strictEqual(reporter.restFromHeaders(200, null, '60:error;transaction:organization'), 60000);
    assert.strictEqual(reporter.restFromHeaders(200, null, '2700::organization, 60:transaction:key'), 2700000);
    assert.strictEqual(reporter.restFromHeaders(200, null, '60:transaction:key'), undefined);
    assert.strictEqual(reporter.restFromHeaders(200, null, '999999:error:key'), reporter.maxRestMs);
    assert.strictEqual(reporter.restFromHeaders(200, null, null), undefined);
});

test('a send that never answers is given up: an HTTP answer waits a second at most', async () => {
    fresh({ transport: () => new Promise(() => undefined) });
    steps.join = async () => { throw boom(); };
    const t = Date.now();
    const res = await call('join', { pin: 'abcd' });
    const took = Date.now() - t;
    assert.strictEqual(res.code, 400);
    assert.ok(took >= reporter.sendTimeoutMs && took < reporter.sendTimeoutMs + 600, `took ${took} ms`);
});

test('an answer with no fault behind it is not held, also while nothing is being sent', async () => {
    fresh({ transport: () => sleep(300).then(() => ({ ok: true })) });
    steps.join = async () => ({ pid: 'p1', nickname: 'Dana' });
    const t = Date.now();
    const res = await call('join', { pin: 'abcd', nickname: 'Dana' });
    assert.deepStrictEqual([res.code, res.body], [200, { pid: 'p1', nickname: 'Dana' }]);
    assert.ok(Date.now() - t < 100);
    assert.strictEqual(sent.length, 0);
});

test('an HTTP answer and a trigger both wait until the report is out, so it is not lost', async () => {
    let out = 0;
    fresh({ transport: () => sleep(200).then(() => { out = Date.now(); return { ok: true }; }) });
    steps.join = async () => { throw boom(); };
    const res = await call('join', { pin: 'abcd' });
    assert.ok(out > 0 && res.at >= out);
    out = 0;
    steps.tick = async () => { console.error('swallowed', boom('another fault')); return 'moved'; };
    assert.strictEqual(await trigger('tick', 'abcd'), 'moved');
    assert.ok(out > 0);
});

test('report() itself never throws or rejects, whatever it is given', async () => {
    fresh({ transport: () => { throw new Error('sender broke'); }, markLookup: () => { throw new Error('reader broke'); } });
    const cyclic = {}; cyclic.self = cyclic;
    const hostile = new Error('x');
    Object.defineProperty(hostile, 'stack', { get() { throw new Error('no stack for you'); } });
    for (const e of [boom(), cyclic, hostile, Symbol('s'), () => 1, Object.create(null)]) {
        await reporter.report('tick', e, { pin: {}, body: cyclic });
    }
    await reporter.caught(boom('outside any request'));
    await reporter.settled();
});

// ---- where reports go ----

test('only the two known Google projects report, and no emulator does', () => {
    const env = Object.assign({}, process.env);
    const at = (config, emulator) => {
        delete process.env.FIREBASE_CONFIG; delete process.env.GCLOUD_PROJECT; delete process.env.FUNCTIONS_EMULATOR;
        if (config) process.env.FIREBASE_CONFIG = JSON.stringify(config);
        if (emulator) process.env.FUNCTIONS_EMULATOR = 'true';
        return reporter.liveTarget();
    };
    try {
        assert.strictEqual(at({ projectId: 'bullshit-wtf-prod' }).environment, 'production');
        assert.match(at({ projectId: 'bullshit-wtf-prod' }).url, /\/api\/144992\/envelope\/$/);
        assert.strictEqual(at({ projectId: 'bullshit-wtf-dev' }).environment, 'development');
        assert.strictEqual(at({ projectId: 'bullshit-wtf-prod' }, true), null);
        assert.strictEqual(at({ projectId: 'demo-bullshit' }), null);
        assert.strictEqual(at({ projectId: 'constructor' }), null);
        assert.strictEqual(at(null), null);
    } finally {
        Object.keys(process.env).forEach(k => delete process.env[k]);
        Object.assign(process.env, env);
    }
});

test('with nowhere to send, a fault costs nothing: no mark is read and nothing is built', async () => {
    reporter.testing.reset({ target: null, markLookup: async () => { throw new Error('must not be read'); } });
    Object.keys(steps).forEach(k => delete steps[k]);
    steps.join = async () => { throw boom(); };
    const res = await call('join', { pin: 'abcd' });
    assert.strictEqual(res.code, 400);
    assert.strictEqual(await reporter.report('join', boom('another'), { pin: 'abcd' }), null);
});

test('on an emulator the report is written to the log, not sent', async () => {
    const lines = [];
    const log = console.log;
    process.env.FUNCTIONS_EMULATOR = 'true';
    console.log = (line) => lines.push(String(line));
    try {
        reporter.testing.reset({ target: null, markLookup: async () => 'test' });
        Object.keys(steps).forEach(k => delete steps[k]);
        steps.tick = async () => { throw boom(); };
        await assert.rejects(trigger('tick', 'abcd'));
    } finally {
        console.log = log;
        delete process.env.FUNCTIONS_EMULATOR;
    }
    const line = lines.find(l => l.indexOf('server error report (local, not sent) ') === 0);
    assert.ok(line, lines.join('\n'));
    const event = JSON.parse(line.slice('server error report (local, not sent) '.length));
    assert.deepStrictEqual(event.tags, { side: 'server', function: 'tick', test: 'yes', pin: 'ABCD' });
    assert.strictEqual(event.environment, 'local');
});

// ---- the real sender, against a server on this machine ----

function sentryStandIn(answer) {
    const got = [];
    const server = http.createServer((req, res) => {
        let body = '';
        req.on('data', c => body += c);
        req.on('end', () => { got.push({ url: req.url, method: req.method, headers: req.headers, body }); answer(res); });
    });
    return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({
        got,
        target: { url: `http://127.0.0.1:${server.address().port}/api/144992/envelope/`, key: prod.key, environment: 'production' },
        close: () => new Promise(r => { server.closeAllConnections(); server.close(r); }),
    })));
}

test('the sender posts one Sentry envelope: a header line, an item line, the report', async () => {
    const sentry = await sentryStandIn(res => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"id":"x"}'); });
    try {
        reporter.testing.reset({ target: sentry.target, release: 'b'.repeat(40), markLookup: async () => 'test' });
        Object.keys(steps).forEach(k => delete steps[k]);
        steps.tick = async () => { throw boom(); };
        await assert.rejects(trigger('tick', 'abcd'));
        assert.strictEqual(sentry.got.length, 1);
        const req = sentry.got[0];
        assert.deepStrictEqual([req.method, req.url], ['POST', `/api/144992/envelope/?sentry_version=7&sentry_key=${prod.key}&sentry_client=bullshit.functions%2F1`]);
        assert.strictEqual(req.headers['content-type'], 'application/x-sentry-envelope');
        const lines = req.body.split('\n');
        assert.strictEqual(lines.length, 4);
        assert.strictEqual(lines[3], '');
        const [header, item, event] = lines.slice(0, 3).map(l => JSON.parse(l));
        assert.deepStrictEqual(Object.keys(header).sort(), ['event_id', 'sent_at']);
        assert.strictEqual(header.event_id, event.event_id);
        assert.deepStrictEqual(item, { type: 'event' });
        assert.deepStrictEqual(event.tags, { side: 'server', function: 'tick', test: 'yes', pin: 'ABCD' });
        assert.strictEqual(event.release, 'b'.repeat(40));
    } finally {
        await sentry.close();
    }
});

test('the sender gives up on a Sentry that does not answer, and rests when told to', async () => {
    const slow = await sentryStandIn(() => undefined);
    try {
        const t = Date.now();
        await assert.rejects(reporter.testing.sendToSentry({ event_id: 'x' }, slow.target));
        assert.ok(Date.now() - t < reporter.sendTimeoutMs + 500);
    } finally {
        await slow.close();
    }
    const full = await sentryStandIn(res => { res.writeHead(429, { 'retry-after': '90', 'x-sentry-rate-limits': '90:error:organization' }); res.end('{}'); });
    try {
        assert.deepStrictEqual(await reporter.testing.sendToSentry({ event_id: 'x' }, full.target), { ok: false, restMs: 90000 });
    } finally {
        await full.close();
    }
    const down = await sentryStandIn(res => { res.writeHead(503); res.end(); });
    try {
        assert.deepStrictEqual(await reporter.testing.sendToSentry({ event_id: 'x' }, down.target), { ok: false, restMs: undefined });
    } finally {
        await down.close();
    }
});

// ---- the build ----

test('the build writes its name, and a report reads it', () => {
    const fs = require('fs');
    const written = JSON.parse(fs.readFileSync(path.join(dist, 'release.json'), 'utf8')).release;
    assert.match(written, /^functions-[0-9a-f]{12}$/);
    reporter.testing.reset({});
    assert.strictEqual(reporter.currentRelease(), written);
});

// A copy of the build in a folder of its own, with no git and no commit anywhere near it.
function buildCopy(change) {
    const fs = require('fs');
    const os = require('os');
    const { execFileSync } = require('child_process');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'release-name-'));
    fs.cpSync(dist, path.join(root, 'dist'), { recursive: true });
    for (const name of ['package.json', 'package-lock.json', 'write-release.js']) {
        fs.copyFileSync(path.join(__dirname, '..', name), path.join(root, name));
    }
    fs.rmSync(path.join(root, 'dist', 'release.json'));
    if (change) change(root, fs);
    const env = Object.assign({}, process.env, { GITHUB_SHA: require('crypto').randomBytes(20).toString('hex') });
    execFileSync(process.execPath, [path.join(root, 'write-release.js')], { env, stdio: 'pipe' });
    const file = fs.readFileSync(path.join(root, 'dist', 'release.json'), 'utf8');
    fs.rmSync(root, { recursive: true, force: true });
    return file;
}

test('the same server code gives the same name at any commit, so a release with no server change sends no function', () => {
    const fs = require('fs');
    const here = fs.readFileSync(path.join(dist, 'release.json'), 'utf8');
    // Two more builds of the same code, each told it is at another commit, in another folder.
    assert.strictEqual(buildCopy(), here);
    assert.strictEqual(buildCopy(), here);
    // A second run over a folder that already holds a name does not count the name itself.
    assert.strictEqual(buildCopy((root, f) => f.writeFileSync(path.join(root, 'dist', 'release.json'), '{"release":"stale"}\n')), here);
});

test('a change in the server\'s code gives another name', () => {
    const fs = require('fs');
    const here = fs.readFileSync(path.join(dist, 'release.json'), 'utf8');
    const names = new Set([here]);
    names.add(buildCopy((root, f) => f.appendFileSync(path.join(root, 'dist', 'controllers', 'tick.js'), '\n// one more line\n')));
    names.add(buildCopy((root, f) => f.writeFileSync(path.join(root, 'dist', 'controllers', 'a-new-step.js'), 'exports.x = 1;\n')));
    names.add(buildCopy((root, f) => f.renameSync(path.join(root, 'dist', 'controllers', 'tick.js'), path.join(root, 'dist', 'controllers', 'tock.js'))));
    names.add(buildCopy((root, f) => f.appendFileSync(path.join(root, 'package-lock.json'), '\n')));
    assert.strictEqual(names.size, 5);
    names.forEach(n => assert.match(JSON.parse(n).release, /^functions-[0-9a-f]{12}$/));
});

test('loading the reporter loads nothing else', () => {
    const { execFileSync } = require('child_process');
    const out = execFileSync(process.execPath, ['-e', `require(${JSON.stringify(path.join(dist, 'report.js'))}); console.log(Object.keys(require.cache).length)`]).toString().trim();
    assert.strictEqual(out, '1');
});
