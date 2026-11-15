#!/usr/bin/env node
// Local run: the daily puzzle (/daily and /he/daily) of the built site (game/dist) in headless
// Chromium, against the Firebase emulators (Realtime Database, Cloud Functions, Auth).
//
// In each language a visitor opens today's question, picks, sees the reveal with numbers under and
// over 20 picks, sends the result, writes a lie and sends it; two fresh browsers open the lie link
// (one falls for the lie, one finds the truth); the sender sees the count; a friend starts a real
// game from the page and the game carries the puzzle's tag. It also checks what must not happen:
// a ?via=test visit changes no tally and writes no row, a link from another day shows today's
// plain question, and markup or an oversized text in a link is never run and never shown.
//
// Nothing reaches production. /_daily is answered by the `daily` function on the functions
// emulator, and every other outside request goes to an emulator or is refused, as in
// emulator-game.js. The questions come from a scratch file dated around today (the function reads
// DAILY_QUESTIONS_FILE on the emulators only); `--own-file` uses the repository's file instead and
// only checks that the page shows a question on a day the file has none.
//
// Needs Java and functions/ built. From the repository root, with the root's npm ci done:
//   node .github/smoke/emulator-daily.js [path to dist] [--own-file]
// SHOTS=<dir> saves screenshots (390 and 320 px wide). VERBOSE=1 logs requests and console lines.
// Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { chromium } = require('playwright');
const { serve, fileIn, HOST } = require('./smoke');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const OWN_FILE = args.includes('--own-file');
const DIST = path.resolve(args.filter((a) => !a.startsWith('--'))[0] || path.join(ROOT, 'game', 'dist'));
const PROJECT = 'demo-bullshit';
const DB = `${HOST}:9000`;
const FUNCTIONS = `http://${HOST}:5001/${PROJECT}/us-central1`;
const AUTH = `http://${HOST}:9099`;
const SHOTS = process.env.SHOTS || '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const log = (...a) => console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s`, ...a);

const strings = require(path.join(ROOT, 'game', 'seo', 'daily-strings.js'));
const fill = (t, v) => String(t).replace(/\{(\w+)\}/g, (all, k) => (k in v ? String(v[k]) : ''));

// ---------- the day, and a question file around it ----------

const israelDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(new Date(ms));
const addDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const TODAY = israelDay(Date.now());
const YESTERDAY = addDays(TODAY, -1);

const WORDS = {
    en: {
        today: { questionText: 'In 1518, hundreds of people in Strasbourg could not stop $blank$ for weeks', realAnswer: 'dancing', fakeAnswers: ['laughing', 'sneezing', 'hiccuping', 'yawning'] },
        yesterday: { questionText: 'In 1923, jockey Frank Hayes won a horse race while $blank$', realAnswer: 'dead', fakeAnswers: ['asleep', 'blindfolded', 'riding backwards'] },
        lie: 'singing hymns', name: 'Dana', contact: 'see bit.ly/abc',
    },
    he: {
        today: { questionText: 'בשנת 1518 מאות אנשים בשטרסבורג לא הצליחו להפסיק $blank$ במשך שבועות', realAnswer: 'לרקוד', fakeAnswers: ['לצחוק', 'להתעטש', 'לשהק'] },
        yesterday: { questionText: 'בשנת 1923 הרוכב פרנק הייז ניצח במרוץ סוסים כשהוא $blank$', realAnswer: 'מת', fakeAnswers: ['ישן', 'בעיניים מכוסות', 'רכוב הפוך'] },
        lie: 'לשיר מזמורים', name: 'דנה', contact: 'ראו bit.ly/abc',
    },
};

function questionFile(dir) {
    const bank = {};
    for (const lang of ['en', 'he']) {
        [['001', YESTERDAY, WORDS[lang].yesterday], ['002', TODAY, WORDS[lang].today], ['003', addDays(TODAY, 1), WORDS[lang].yesterday]]
            .forEach(([n, day, q], i) => {
                bank[`daily-26-${lang}-${n}`] = Object.assign({ day, lang, citation: 'https://en.wikipedia.org/wiki/Dancing_plague_of_1518' }, q,
                    i === 2 ? { questionText: q.questionText + ' ' } : {});
            });
    }
    const file = path.join(dir, 'daily-questions.json');
    fs.writeFileSync(file, JSON.stringify(bank, null, 2));
    return file;
}

// ---------- emulators (as in emulator-game.js) ----------

const NO_PROXY_FOR_LOOPBACK = `
const undici = require(require.resolve('undici', { paths: [process.env.FIREBASE_TOOLS_DIR] }));
const Real = undici.ProxyAgent;
const direct = new undici.Agent();
class LoopbackDirect extends undici.Dispatcher {
    constructor(opts) { super(); this.proxy = new Real(opts); }
    dispatch(opts, handler) {
        const host = new URL(opts.origin).hostname;
        return (host === '127.0.0.1' || host === 'localhost' ? direct : this.proxy).dispatch(opts, handler);
    }
    close() { return this.proxy.close(); }
    destroy() { return this.proxy.destroy(); }
}
undici.ProxyAgent = LoopbackDirect;
`;

let emulatorLog = '';

async function startEmulators() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-emulators-'));
    fs.symlinkSync(path.join(ROOT, 'functions'), path.join(dir, 'functions'));
    fs.writeFileSync(path.join(dir, 'firebase.json'), JSON.stringify({
        functions: { source: 'functions', runtime: 'nodejs22' },
        emulators: {
            auth: { host: HOST, port: 9099 },
            database: { host: HOST, port: 9000 },
            functions: { host: HOST, port: 5001 },
            ui: { enabled: false },
            singleProjectMode: true,
        },
    }, null, 2));
    fs.writeFileSync(path.join(dir, 'loopback.js'), NO_PROXY_FOR_LOOPBACK);
    const tools = path.join(ROOT, 'node_modules', 'firebase-tools');
    const env = Object.assign({}, process.env, { FIREBASE_TOOLS_DIR: tools });
    if (!OWN_FILE) env.DAILY_QUESTIONS_FILE = questionFile(dir);
    if (process.env.HTTPS_PROXY || process.env.https_proxy) {
        env.NODE_OPTIONS = `${env.NODE_OPTIONS || ''} --require ${path.join(dir, 'loopback.js')}`.trim();
    }
    emulatorLog = path.join(dir, 'emulators.log');
    const out = fs.openSync(emulatorLog, 'w');
    const child = spawn(path.join(ROOT, 'node_modules', '.bin', 'firebase'),
        ['emulators:start', '--project', PROJECT], { cwd: dir, env, stdio: ['ignore', out, out], detached: true });
    log(`starting the emulators (log: ${emulatorLog})`);
    const until = Date.now() + 120000;
    while (Date.now() < until) {
        const logText = fs.readFileSync(emulatorLog, 'utf8');
        if (/All emulators ready/.test(logText)) return child;
        if (child.exitCode !== null) throw new Error(`the emulators stopped:\n${logText.slice(-2000)}`);
        await sleep(1000);
    }
    throw new Error('the emulators did not start within 2 minutes');
}

function stopEmulators(child) {
    if (!child) return;
    try {
        process.kill(-child.pid, 'SIGINT');
    } catch (e) { /* already gone */ }
}

// The database as its owner: no rule applies.
async function db(method, p, body) {
    const res = await fetch(`http://${DB}/${p}.json?ns=${PROJECT}`, {
        method, headers: { Authorization: 'Bearer owner' }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${method} ${p}: ${res.status} ${await res.text()}`);
    return res.json();
}

async function seed() {
    const rules = await fetch(`http://${DB}/.settings/rules.json?ns=${PROJECT}`, {
        method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: fs.readFileSync(path.join(ROOT, 'database-rules.json'), 'utf8'),
    });
    if (!rules.ok) throw new Error(`could not load the database rules: ${rules.status}`);
    // The game's own bank, for the real game a friend starts from the puzzle.
    const questions = {};
    for (const lang of ['en', 'he']) {
        for (let i = 0; i < 12; i++) {
            questions[`${lang}${i}`] = { lang, questionText: `Test question ${i} ___`, realAnswer: `truth${i}`, fakeAnswers: ['lie a', 'lie b', 'lie c', 'lie d'], citation: '' };
        }
    }
    await db('PUT', 'questions', questions);
    await db('PUT', 'gameCounter', 100000 + Math.floor(Math.random() * 100000));
}

/** The rows the functions sent to BigQuery `shares` so far (each insert is logged before it is tried). */
function shareRows() {
    const rows = [];
    for (const m of fs.readFileSync(emulatorLog, 'utf8').matchAll(/Insert to BigQuery, table: 'shares', data: (\{.*\})/g)) {
        try { rows.push(JSON.parse(m[1])); } catch (e) { /* a cut line */ }
    }
    return rows;
}

// ---------- browsers ----------

const ALLOWED_CONSOLE_ERRORS = [
    /^Failed to load resource: net::ERR_(FAILED|BLOCKED_BY_CLIENT|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED)/,
    /WebSocket connection to 'wss?:\/\/[^']*' failed/,
];

function redirect(url) {
    const u = new URL(url);
    if (u.hostname.endsWith('.cloudfunctions.net')) return `${FUNCTIONS}${u.pathname}${u.search}`;
    if (u.hostname === 'identitytoolkit.googleapis.com' || u.hostname === 'securetoken.googleapis.com') return `${AUTH}/${u.hostname}${u.pathname}${u.search}`;
    if (u.hostname === 'www.googleapis.com' && u.pathname.startsWith('/identitytoolkit/')) return `${AUTH}/www.googleapis.com${u.pathname}${u.search}`;
    if (u.hostname.endsWith('.firebaseio.com') || u.host === DB) {
        const to = new URL(`http://${DB}${u.pathname}${u.search}`);
        to.searchParams.set('ns', PROJECT);
        return to.toString();
    }
    return null;
}

const problems = [];
const checks = [];
function check(name, ok, detail) {
    checks.push(name);
    if (!ok) {
        problems.push(detail === undefined ? name : `${name}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
        log(`  FAILED ${name}`, detail === undefined ? '' : detail);
    }
}

/**
 * A fresh browser profile on a phone. `daily` may stand in for the server's answer to GET /_daily:
 * (realBody) => body, or 'fail' for an error.
 */
async function newVisitor(browser, base, name, options = {}) {
    const context = await browser.newContext({
        serviceWorkers: 'block', viewport: { width: options.width || 390, height: 800 }, isMobile: true, hasTouch: true,
        permissions: ['clipboard-read', 'clipboard-write'],
    });
    const visitor = { name, context, daily: options.daily || null, posts: [] };
    if (options.noStorage) {
        await context.addInitScript(() => {
            Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage is blocked'); } });
        });
    }
    const ours = (u) => new URL(u).host === new URL(base).host;
    // The Hosting rewrite: /_daily on the site's own address is the `daily` function.
    await context.route((url) => ours(url.toString()) && url.pathname === '/_daily', async (route) => {
        const req = route.request();
        const target = `${FUNCTIONS}/daily${new URL(req.url()).search}`;
        if (process.env.VERBOSE) log(`[${name}] ${req.method()} ${req.url().replace(base, '')} ${req.postData() || ''}`);
        try {
            if (req.method() === 'GET' && visitor.daily === 'fail') return route.fulfill({ status: 500, body: 'no' });
            if (req.method() === 'POST') visitor.posts.push(JSON.parse(req.postData() || '{}'));
            const response = await route.fetch({ url: target });
            if (req.method() === 'GET' && typeof visitor.daily === 'function') {
                return route.fulfill({ response, json: visitor.daily(await response.json()) });
            }
            return route.fulfill({ response });
        } catch (e) {
            return route.abort('failed');
        }
    });
    await context.route((url) => !ours(url.toString()), async (route) => {
        const target = redirect(route.request().url());
        if (!target) return route.abort('blockedbyclient');
        try {
            return route.fulfill({ response: await route.fetch({ url: target }) });
        } catch (e) {
            return route.abort('failed');
        }
    });
    await context.routeWebSocket((url) => /\/\.ws$/.test(url.pathname), (ws) => {
        const target = new URL(redirect(ws.url().replace(/^ws/, 'http')));
        target.protocol = 'ws:';
        const upstream = new WebSocket(target.toString());
        const waiting = [];
        upstream.onopen = () => waiting.splice(0).forEach((m) => upstream.send(m));
        upstream.onmessage = (e) => ws.send(e.data);
        upstream.onclose = () => ws.close({ code: 1000 });
        upstream.onerror = () => ws.close({ code: 1006 });
        ws.onMessage((m) => (upstream.readyState === 1 ? upstream.send(m) : waiting.push(m)));
        ws.onClose(() => upstream.close());
    });
    const page = await context.newPage();
    // WhatsApp opens in a new tab: nothing to load here, close it.
    context.on('page', (p) => { if (p !== page) p.close().catch(() => { }); });
    page.on('pageerror', (err) => problems.push(`${name}: uncaught exception: ${err.stack || err.message || err}`));
    page.on('dialog', (d) => { problems.push(`${name}: a dialog opened: ${d.message()}`); d.dismiss().catch(() => { }); });
    page.on('console', (msg) => {
        if (process.env.VERBOSE) log(`[${name} console.${msg.type()}] ${msg.text().slice(0, 300)}`);
        if (msg.type() !== 'error' || visitor.daily === 'fail') return;
        if (ALLOWED_CONSOLE_ERRORS.some((re) => re.test(msg.text()))) return;
        problems.push(`${name}: console error: ${msg.text()}`);
    });
    visitor.page = page;
    return visitor;
}

async function shot(page, name, width) {
    if (!SHOTS) return;
    const was = page.viewportSize();
    if (width && width !== was.width) await page.setViewportSize({ width, height: was.height });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(SHOTS, `${name}-${width || was.width}.png`), fullPage: true });
    if (width && width !== was.width) await page.setViewportSize(was);
}

/** No sideways scroll at 320 px: the page fits the narrowest phone. */
async function fits320(page, what) {
    const was = page.viewportSize();
    await page.setViewportSize({ width: 320, height: was.height });
    await page.waitForTimeout(150);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth);
    check(`${what} fits 320 px`, wide <= 320, `scroll width ${wide}`);
    await page.setViewportSize(was);
}

const text = (page, sel) => page.locator(sel).first().innerText().then((t) => t.trim());
const raw = (page, sel) => page.locator(sel).first().evaluate((n) => n.textContent.trim());
const answers = (page) => page.locator('#d-answers .answer').evaluateAll((list) => list.map((b) => b.textContent));
const waMessage = async (link) => decodeURIComponent((await link.getAttribute('href')).replace('https://wa.me/?text=', ''));

async function open(visitor, url) {
    await visitor.page.goto(url, { waitUntil: 'load' });
    await visitor.page.waitForFunction(() => document.querySelectorAll('#d-answers .answer').length > 0
        || !document.getElementById('d-reveal').hasAttribute('hidden') || !document.getElementById('d-error').hasAttribute('hidden'), null, { timeout: 20000 });
}

async function pickAnswer(visitor, wanted) {
    await visitor.page.locator('#d-answers .answer').filter({ hasText: new RegExp(`^${wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first().click();
    await visitor.page.locator('#d-reveal h2.head').waitFor({ timeout: 10000 });
}

async function waitFor(what, read, ok, ms = 8000) {
    const until = Date.now() + ms;
    let value;
    while (Date.now() < until) {
        value = await read();
        if (ok(value)) return value;
        await sleep(200);
    }
    check(what, false, value);
    return value;
}

/** Creates a game from the create page the visitor is on, and returns the game as the database has it. */
async function createGame(visitor) {
    const page = visitor.page;
    await page.waitForURL(/\/create-game/, { timeout: 20000 });
    await page.locator('form button[type="submit"]').first().click();
    await page.waitForURL(/\/join-game\/[A-Za-z0-9]+/, { timeout: 30000 });
    const pin = new URL(page.url()).pathname.split('/').pop().toUpperCase();
    return Object.assign({ pin }, await db('GET', `games/${pin}`));
}

// ---------- the run, in one language ----------

async function run(browser, base, lang) {
    const s = strings[lang];
    const w = WORDS[lang];
    const P = base + s.path;
    const L = lang;
    const day = `qHistory/daily/${lang}/${TODAY}`;
    const q = w.today;
    log(`--- ${lang}: ${s.path}`);

    // The function itself: the answer and how long a cache may keep it.
    const res = await fetch(`${FUNCTIONS}/daily?lang=${lang}`);
    const body = await res.json();
    check(`${L}: GET answers today's question`, res.status === 200 && body.day === TODAY && body.no === 2 && body.lang === lang && body.q === q.questionText, body);
    check(`${L}: the cache keeps it five minutes at most`, /^public, max-age=0, s-maxage=(\d+)$/.test(res.headers.get('cache-control')) && Number(RegExp.$1) <= 300, res.headers.get('cache-control'));
    check(`${L}: the answers come by their place in the file`, body.options.map((o) => o.t).join('|') === [q.realAnswer].concat(q.fakeAnswers).join('|'), body.options);

    // 1. The question.
    const a = await newVisitor(browser, base, `${L} sender`);
    await open(a, `${P}?via=daily-home`);
    check(`${L}: the kicker numbers the day`, (await raw(a.page, '#d-kicker')) === fill(s.kicker, { dot: fill(s.kickerDot, { no: 2 }) }), await raw(a.page, '#d-kicker'));
    check(`${L}: the instruction`, (await raw(a.page, '#d-how')) === s.instruction);
    check(`${L}: the question, with its blank`, (await raw(a.page, '#d-q')) === q.questionText.replace('$blank$', '____'), await raw(a.page, '#d-q'));
    const shown = await answers(a.page);
    check(`${L}: four answers, the truth and three of the lies`, shown.length === 4 && shown.includes(q.realAnswer) && shown.filter((t) => q.fakeAnswers.includes(t)).length === 3, shown);
    check(`${L}: the page reads ${s.dir}`, (await a.page.evaluate(() => document.documentElement.dir)) === s.dir);
    await shot(a.page, `${L}-1-question`);
    await shot(a.page, `${L}-1-question`, 320);
    await fits320(a.page, `${L}: the question`);
    await a.page.reload();
    await a.page.locator('#d-answers .answer').first().waitFor();
    check(`${L}: the order is kept for the day`, (await answers(a.page)).join('|') === shown.join('|'), await answers(a.page));

    // 2. A pick, and the reveal with too few picks to count.
    const houseLie = shown.find((t) => q.fakeAnswers.includes(t));
    await pickAnswer(a, houseLie);
    check(`${L}: fell for a lie`, (await raw(a.page, '#d-reveal h2.head')) === s.headLie);
    check(`${L}: the truth is told`, (await raw(a.page, '#d-reveal .sub')) === fill(s.truthLine, { answer: q.realAnswer }));
    check(`${L}: too few picks to show numbers`, (await raw(a.page, '#d-reveal .numbers')) === s.tooFew && (await a.page.locator('.bar .pct').count()) === 0);
    check(`${L}: the bars mark the truth and the pick`, (await a.page.locator('.bar.truth .text').evaluate((n) => n.textContent)) === q.realAnswer
        && (await a.page.locator('.bar.mine .text').evaluate((n) => n.textContent)) === houseLie
        && (await raw(a.page, '.bar.mine .tag.pick')) === s.labelPick && (await raw(a.page, '.bar.truth .tag')) === s.labelTruth);
    check(`${L}: the source link`, (await a.page.locator('a.source').getAttribute('href')) === body.cite && (await raw(a.page, 'a.source')) === s.source);
    const k = q.fakeAnswers.indexOf(houseLie) + 1;
    await waitFor(`${L}: the pick is counted once`, () => db('GET', `${day}/picks`), (p) => p && p[k] === 1 && Object.values(p).filter((n) => n).length === 1);
    await shot(a.page, `${L}-2-reveal-first-picks`);
    await fits320(a.page, `${L}: the reveal`);

    // 3. Send the result: the question, no answer, no percentage yet.
    const send = a.page.locator('#d-reveal > .send');
    const message = await waMessage(send.locator('a.btn'));
    const lines = message.split('\n');
    check(`${L}: the message of someone who fell for a lie`, lines.length === 4 && lines[0] === fill(s.shareLie, { noTag: ' #2' })
        && lines[1] === `"${q.questionText.replace('$blank$', '____')}"` && lines[2] === s.shareLieAsk && lines[3] === `${P}?via=daily-share`, message);
    check(`${L}: the message never names an answer`, ![q.realAnswer].concat(q.fakeAnswers).some((t) => message.includes(t)), message);
    await send.locator('a.btn').click();
    await send.locator('button.btn').click();
    await a.page.waitForFunction((copied) => [...document.querySelectorAll('#d-reveal > .send button')].some((b) => b.textContent === copied), s.copied);
    check(`${L}: COPY puts the same message on the clipboard`, (await a.page.evaluate(() => navigator.clipboard.readText())) === message);

    // 4. Now fool your friends: what a lie may not be, then a lie that goes out.
    const fool = a.page.locator('.card.fool');
    const tryLie = async (lie, name) => {
        await fool.locator('#d-lie').fill(lie);
        await fool.locator('#d-name').fill(name || '');
        await fool.locator('.send a.btn').click();
        return (await fool.locator('.error').isVisible()) ? raw(a.page, '.card.fool .error') : '';
    };
    check(`${L}: the truth is no lie`, (await tryLie(lang === 'he' ? 'ה' + q.realAnswer : q.realAnswer.toUpperCase() + '!')) === s.lieIsTruth);
    check(`${L}: a house lie is taken`, (await tryLie(q.fakeAnswers[3] || q.fakeAnswers[2])) === s.lieIsTaken);
    check(`${L}: a link is refused`, (await tryLie(w.contact)) === s.lieRefused);
    check(`${L}: a phone number is refused`, (await tryLie('0541234567')) === s.lieRefused);
    const slur = JSON.parse(fs.readFileSync(path.join(ROOT, 'name-lists.json'), 'utf8')).hate.any[0];
    check(`${L}: a slur is refused, in the lie and in the name`, (await tryLie(slur)) === s.lieRefused && (await tryLie(w.lie, slur.slice(0, 9))) === s.lieRefused);
    check(`${L}: no lie link was saved by a refused lie`, (await a.page.evaluate((key) => localStorage.getItem(key), `bs-daily-lie-${lang}`)) === null);
    check(`${L}: the lie box takes 40 letters and the name 9`, (await fool.locator('#d-lie').getAttribute('maxlength')) === '40' && (await fool.locator('#d-name').getAttribute('maxlength')) === '9');
    check(`${L}: a good lie passes`, (await tryLie(w.lie, w.name)) === '');
    const foolMessage = await waMessage(fool.locator('.send a.btn'));
    const foolLines = foolMessage.split('\n');
    const lieUrl = foolLines[2] || '';
    const f = (/[?&]f=([a-z0-9]{8})(&|$)/.exec(lieUrl) || [])[1];
    check(`${L}: the lie's message`, foolLines.length === 3 && foolLines[0] === fill(s.shareFool, { noTag: ' #2' }) && foolLines[1] === lines[1]
        && new RegExp(`^${P.replace(/[.]/g, '\\.')}\\?via=daily-fool&n=2&f=[a-z0-9]{8}&l=[A-Za-z0-9_-]+$`).test(lieUrl), foolMessage);
    check(`${L}: the address does not give the lie away`, !foolMessage.includes(w.lie) && !decodeURIComponent(lieUrl).includes(w.lie) && !foolMessage.includes(w.name));
    check(`${L}: the link id is not the browser's id`, !!f && !(await a.page.evaluate(() => localStorage.getItem('bs-daily-id'))).includes(f));
    check(`${L}: nobody opened the lie yet`, (await raw(a.page, '.card.fool .count')) === s.countNone);
    await fool.locator('.send button.btn').click();
    await sleep(300);
    check(`${L}: the same lie sent twice keeps one link`, (await a.page.evaluate(() => navigator.clipboard.readText())) === foolMessage);
    await shot(a.page, `${L}-3-lie-sent`);

    // 5. A friend opens the lie link in a fresh browser, and falls for it.
    const b = await newVisitor(browser, base, `${L} friend who falls`);
    await open(b, lieUrl);
    check(`${L}: the friend is told whose lie hides here`, (await raw(b.page, '#d-how')) === fill(s.friendNamed, { name: w.name }), await raw(b.page, '#d-how'));
    const friendShown = await answers(b.page);
    check(`${L}: the truth, two house lies and the friend's lie`, friendShown.length === 4 && friendShown.includes(q.realAnswer) && friendShown.includes(w.lie)
        && friendShown.filter((t) => q.fakeAnswers.includes(t)).length === 2, friendShown);
    await shot(b.page, `${L}-4-friend-question`);
    await shot(b.page, `${L}-4-friend-question`, 320);
    await pickAnswer(b, w.lie);
    check(`${L}: fooled by the friend`, (await raw(b.page, '#d-reveal h2.head')) === fill(s.headFriendNamed, { name: w.name }), await raw(b.page, '#d-reveal h2.head'));
    check(`${L}: the friend's lie is labelled`, (await b.page.locator('.bar.mine .tag').first().evaluate((n) => n.textContent)) === fill(s.labelFriendNamed, { name: w.name }));
    await waitFor(`${L}: the link counts one seen, one fooled`, () => db('GET', `${day}/links/${f}`), (c) => c && c.seen === 1 && c.fooled === 1);
    check(`${L}: the friend's lie is counted apart from the house's`, (await db('GET', `${day}/picks/f`)) === 1);
    await shot(b.page, `${L}-5-friend-fooled`);
    await fits320(b.page, `${L}: the friend's reveal`);

    // 6. Another friend finds the truth.
    const c = await newVisitor(browser, base, `${L} friend who finds it`);
    await open(c, lieUrl);
    await pickAnswer(c, q.realAnswer);
    check(`${L}: found the truth`, (await raw(c.page, '#d-reveal h2.head')) === s.headTruth);
    check(`${L}: and sees the lie that missed`, (await raw(c.page, '#d-reveal .sub')) === fill(s.friendMissedNamed, { name: w.name, lie: w.lie }), await raw(c.page, '#d-reveal .sub'));
    await waitFor(`${L}: the link counts two seen, one fooled`, () => db('GET', `${day}/links/${f}`), (n) => n && n.seen === 2 && n.fooled === 1);
    const truthMessage = await waMessage(c.page.locator('#d-reveal > .send a.btn'));
    check(`${L}: the message of someone who found the truth`, truthMessage.split('\n')[0] === fill(s.shareTruth, { noTag: ' #2' }) && truthMessage.split('\n')[2] === s.shareTruthAsk, truthMessage);
    await shot(c.page, `${L}-6-friend-found-truth`);

    // 7. The sender comes back: already played, and the count.
    await open(a, P);
    check(`${L}: already played, straight to the reveal`, (await raw(a.page, '#d-note')) === s.played && (await a.page.locator('#d-answers').isHidden()));
    await a.page.waitForFunction((none) => { const n = document.querySelector('.card.fool .count'); return n && !n.hidden && n.textContent !== none; }, s.countNone, { timeout: 8000 }).catch(() => { });
    check(`${L}: the sender's count`, (await raw(a.page, '.card.fool .count')) === fill(s.count, { lie: w.lie, x: 1, y: 2 }), await raw(a.page, '.card.fool .count'));
    const counted = await fetch(`${FUNCTIONS}/daily?lang=${lang}&d=${TODAY}&f=${f}`);
    check(`${L}: a count is cached a minute at most`, /s-maxage=(\d+)$/.test(counted.headers.get('cache-control')) && Number(RegExp.$1) <= 60, counted.headers.get('cache-control'));
    check(`${L}: the sender opening their own link is not played as a friend`, await (async () => {
        await open(a, lieUrl);
        return (await a.page.locator('#d-answers').isHidden()) && (await db('GET', `${day}/links/${f}/seen`)) === 2;
    })());
    await shot(a.page, `${L}-7-sender-count`);

    // 8. Over 20 picks: percentages, and yesterday's line.
    const picks = { 0: 41, 1: 30, 2: 20, 3: 8, f: 1 };
    await db('PUT', `${day}/picks`, picks);
    await db('PUT', `qHistory/daily/${lang}/${YESTERDAY}/picks`, { 0: 10, 1: 30 });
    await open(a, P);
    const total = 100;
    check(`${L}: the numbers`, (await raw(a.page, '#d-reveal .numbers')) === fill(s.numbers, { p: 59, n: total }), await raw(a.page, '#d-reveal .numbers'));
    check(`${L}: each bar has its share`, (await raw(a.page, '.bar.truth .pct')) === '41%' && (await raw(a.page, '.bar.mine .pct')) === `${picks[k] || 0}%`);
    const withPct = await waMessage(a.page.locator('#d-reveal > .send a.btn'));
    check(`${L}: the message now has the percentage`, withPct.split('\n')[0] === fill(s.shareLie, { noTag: ' #2' }) + fill(s.shareLiePct, { p: 59 }), withPct);
    check(`${L}: yesterday's line`, (await raw(a.page, '#d-reveal .yesterday')) === `${fill(s.yesterday, { s: w.yesterday.questionText.replace('$blank$', w.yesterday.realAnswer) })} ${fill(s.yesterdayPct, { p: 75 })}`, await raw(a.page, '#d-reveal .yesterday'));
    check(`${L}: the countdown`, new RegExp('^' + fill(s.countdown, { t: '\\d\\d:\\d\\d:\\d\\d' }) + '$').test(await raw(a.page, '#d-reveal .next')), await raw(a.page, '#d-reveal .next'));
    check(`${L}: the hint names the table's size`, /2\D+(8|12)\D/.test(await raw(a.page, '.card.game .hint')), await raw(a.page, '.card.game .hint'));
    await shot(a.page, `${L}-8-reveal-with-numbers`);
    await shot(a.page, `${L}-8-reveal-with-numbers`, 320);
    await fits320(a.page, `${L}: the reveal with numbers`);

    // 9. START A GAME from the friend's page: a real game, tagged with how they arrived.
    const go = b.page.locator('.card.game a.btn');
    check(`${L}: the game button`, (await go.evaluate((n) => n.textContent)) === s.gameStart
        && (await go.getAttribute('href')) === `/create-game?via=daily-fool${lang === 'he' ? '&lang=he' : ''}`, await go.getAttribute('href'));
    await go.click();
    const game = await createGame(b);
    check(`${L}: the game carries the puzzle's tag`, game.campaign === 'daily-fool', game.campaign);
    check(`${L}: the game is in the page's language`, game.locale === lang, game.locale);
    await shot(b.page, `${L}-9-real-game-nickname`);

    // 10. What the run recorded: existing columns only, one row per press.
    await sleep(1500);
    const rows = shareRows().filter((r) => r.locale === lang);
    const has = (type, method, n) => rows.filter((r) => r.content_type === type && r.method === method).length === n;
    check(`${L}: rows of the sender`, has('daily-home', 'open', 1) && has('daily-home', 'house', 1) && has('daily-home', 'whatsapp', 1)
        && has('daily-home', 'copy', 1) && has('daily-home', 'fool-whatsapp', 1) && has('daily-home', 'fool-copy', 1),
        rows.filter((r) => r.content_type === 'daily-home').map((r) => r.method));
    check(`${L}: rows of the friends`, has('daily-fool', 'open', 2) && has('daily-fool', 'friend', 1) && has('daily-fool', 'truth', 1) && has('daily-fool', 'create', 1),
        rows.filter((r) => r.content_type === 'daily-fool').map((r) => r.method));
    check(`${L}: a row is the shares table's columns and nothing else`, rows.every((r) => Object.keys(r).sort().join() === 'content_type,crew_id,locale,method,time,uid'
        && /^[a-z0-9]{16}$/.test(r.uid) && r.crew_id === null), rows[0]);
    check(`${L}: the lie and the name never reach the server`, a.posts.concat(b.posts, c.posts).every((p) => !JSON.stringify(p).includes(w.lie) && !JSON.stringify(p).includes(w.name))
        && !fs.readFileSync(emulatorLog, 'utf8').includes(w.lie));

    // 11. A play-test (?via=test) changes no tally and writes no row; its game is a test game.
    const before = JSON.stringify(await db('GET', day));
    const rowsBefore = shareRows().length;
    const t = await newVisitor(browser, base, `${L} tester`);
    await open(t, `${P}?via=test`);
    await pickAnswer(t, q.realAnswer);
    await t.page.locator('#d-reveal > .send a.btn').click();
    await sleep(1500);
    check(`${L}: the tester's page did post`, t.posts.length >= 3 && t.posts.every((p) => p.src === 'test'), t.posts);
    check(`${L}: a play-test changes no tally`, JSON.stringify(await db('GET', day)) === before);
    check(`${L}: a play-test writes no row`, shareRows().length === rowsBefore);
    await t.page.locator('.card.game a.btn').click();
    check(`${L}: a game started from a play-test is a test game`, (await createGame(t)).campaign === 'test');

    // 12. A lie link from another day: today's plain question, and the reason.
    const other = await newVisitor(browser, base, `${L} late friend`);
    await open(other, lieUrl.replace('&n=2&', '&n=1&'));
    check(`${L}: another day's link says so`, (await raw(other.page, '#d-note')) === s.otherDay && (await raw(other.page, '#d-how')) === s.instruction);
    check(`${L}: and shows today's plain question`, !(await answers(other.page)).includes(w.lie) && (await answers(other.page)).length === 4);
    await shot(other.page, `${L}-10-link-from-another-day`);

    // 13. A link cannot carry markup, script or a long text onto the page.
    const b64 = (v) => Buffer.from(JSON.stringify(v), 'utf8').toString('base64url');
    const link = (l) => `${P}?via=daily-fool&n=2&f=abcd1234&l=${l}`;
    const markup = '<img src=x onerror=alert(1)>';
    const evil = await newVisitor(browser, base, `${L} markup link`);
    await open(evil, link(b64(['<b>x</b>', markup])));
    check(`${L}: markup in a link is shown as text`, (await answers(evil.page)).includes(markup) && (await evil.page.locator('#d-answers img, #d-how b').count()) === 0);
    await pickAnswer(evil, markup);
    check(`${L}: and is never run`, (await evil.page.locator('main img, main b, main script').count()) === 0
        && (await raw(evil.page, '#d-reveal h2.head')) === fill(s.headFriendNamed, { name: '<b>x</b>' }));
    await shot(evil.page, `${L}-11-markup-is-text`);
    const refused = {
        'a lie over 40 letters': b64(['', 'x'.repeat(41)]),
        'a name over 9 letters': b64(['x'.repeat(10), 'a lie']),
        'a web address': b64(['', 'visit evil.example.com']),
        'an email address': b64(['', 'mail me@x.io']),
        'a phone number': b64(['', '054 1234567']),
        'a slur': b64(['', slur]),
        'the truth itself': b64(['', q.realAnswer]),
        'hidden direction marks': b64(['', 'abc' + String.fromCharCode(0x202e) + 'def']),
        'three texts': b64(['a', 'b', 'c']),
        'an object': b64({ name: 'a', lie: 'b' }),
        'not base64': '%3Cscript%3Ealert(1)%3C/script%3E',
        'a script address': b64(['', 'javascript:alert(1)//x.io']),
    };
    const plain = await newVisitor(browser, base, `${L} refused links`);
    for (const [what, l] of Object.entries(refused)) {
        await open(plain, link(l));
        const list = await answers(plain.page);
        check(`${L}: a link with ${what} shows the plain question`, list.length === 4 && list.every((x) => [q.realAnswer].concat(q.fakeAnswers).includes(x))
            && (await raw(plain.page, '#d-how')) === s.instruction && (await plain.page.locator('#d-note').isHidden()), list);
    }
    const unnamed = await newVisitor(browser, base, `${L} unnamed friend`);
    await open(unnamed, link(b64(['', w.lie])));
    check(`${L}: a lie with no name`, (await raw(unnamed.page, '#d-how')) === s.friendUnnamed);
    await pickAnswer(unnamed, w.lie);
    check(`${L}: fooled by a friend with no name`, (await raw(unnamed.page, '#d-reveal h2.head')) === s.headFriendUnnamed);

    // 14. Someone who already played opens a lie link: the lie is shown beside the answers, not played.
    await open(c, link(b64([w.name, lang === 'he' ? 'לבכות' : 'crying'])).replace('abcd1234', 'zzzz9999'));
    check(`${L}: a lie that arrives after the pick is shown, not played`, (await raw(c.page, '#d-note')) === s.played
        && (await c.page.locator('#d-reveal .bar').count()) === 5 && (await db('GET', `${day}/links/zzzz9999`)) === null,
        [await raw(c.page, '#d-note'), await c.page.locator('#d-reveal .bar').count(), await db('GET', `${day}/links/zzzz9999`), c.page.url()]);

    // 15. The day changes: the countdown gives way to NEW QUESTION, and a late pick counts for its own day.
    const late = await newVisitor(browser, base, `${L} at midnight`, { daily: (real) => Object.assign(real, { nextAt: Date.now() + 2500 }) });
    await open(late, `${P}?via=daily-seo`);
    await pickAnswer(late, q.realAnswer);
    await late.page.locator('#d-reveal .next button').waitFor({ timeout: 8000 });
    check(`${L}: at midnight the page offers the new question`, (await raw(late.page, '#d-reveal .next button')) === s.newQuestion);
    await shot(late.page, `${L}-12-midnight-new-question`);
    late.daily = null;
    await late.page.locator('#d-reveal .next button').click();
    await late.page.waitForURL(`${P}?via=daily-seo`);
    const yPicks = `qHistory/daily/${lang}/${YESTERDAY}/picks`;
    const postPick = (d) => fetch(`${FUNCTIONS}/daily`, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify({ lang, day: d, m: 'house', k: 1, src: 'daily', uid: 'x'.repeat(16) }) });
    const posted = await postPick(YESTERDAY);
    check(`${L}: a pick sent just after midnight counts for yesterday`, posted.status === 204 && (await db('GET', yPicks))[1] === 31);
    await postPick(addDays(TODAY, -2));
    await postPick(addDays(TODAY, 1));
    check(`${L}: no other day takes a pick`, (await db('GET', `qHistory/daily/${lang}/${addDays(TODAY, -2)}`)) === null && (await db('GET', `qHistory/daily/${lang}/${addDays(TODAY, 1)}`)) === null);

    // 16. A Hanukkah day: the candle in the kicker, the Hanukkah game.
    const candle = await newVisitor(browser, base, `${L} hanukkah`, { daily: (real) => Object.assign(real, { pack: 'hanukkah', candle: 3, no: 10 }) });
    await open(candle, P);
    check(`${L}: the Hanukkah kicker`, (await raw(candle.page, '#d-kicker')) === fill(s.kickerCandle, { candle: s.candles[2], noTag: ' #10' }), await raw(candle.page, '#d-kicker'));
    check(`${L}: three candles lit`, (await candle.page.locator('#d-candles i.lit').count()) === 3 && (await candle.page.locator('#d-candles i').count()) === 8);
    await shot(candle.page, `${L}-13-hanukkah-question`);
    await pickAnswer(candle, q.realAnswer);
    const hgo = candle.page.locator('.card.game a.btn');
    check(`${L}: the Hanukkah game button`, (await hgo.evaluate((n) => n.textContent)) === s.gameStartHanukkah
        && (await hgo.getAttribute('href')) === `/create-game?via=daily${lang === 'he' ? '&lang=he' : ''}&pack=hanukkah`, await hgo.getAttribute('href'));
    await shot(candle.page, `${L}-13-hanukkah-reveal`);

    // 17. The question does not load: one line and TRY AGAIN.
    const down = await newVisitor(browser, base, `${L} server down`, { daily: 'fail' });
    await open(down, P);
    check(`${L}: the load error`, (await raw(down.page, '#d-q')) === s.loadError && (await raw(down.page, '#d-retry')) === s.tryAgain && (await down.page.locator('#d-how').isHidden()));
    await shot(down.page, `${L}-14-load-error`);
    down.daily = null;
    await down.page.locator('#d-retry').click();
    await down.page.locator('#d-answers .answer').first().waitFor({ timeout: 10000 });
    check(`${L}: TRY AGAIN loads the question`, (await answers(down.page)).length === 4 && (await down.page.locator('#d-error').isHidden()));

    // 18. localStorage blocked: the page works, and forgets the pick.
    const blocked = await newVisitor(browser, base, `${L} no storage`, { noStorage: true });
    await open(blocked, P);
    await pickAnswer(blocked, q.realAnswer);
    check(`${L}: with storage blocked the page still reveals`, (await raw(blocked.page, '#d-reveal h2.head')) === s.headTruth);
    await blocked.page.locator('#d-lie').fill(w.lie);
    await blocked.page.locator('.card.fool .send a.btn').click();
    check(`${L}: and still sends a lie`, /via=daily-fool&n=2&f=[a-z0-9]{8}&l=/.test(await waMessage(blocked.page.locator('.card.fool .send a.btn'))));
    await open(blocked, P);
    check(`${L}: but cannot remember the pick`, (await answers(blocked.page)).length === 4);
    check(`${L}: and sends no id`, blocked.posts.length > 0 && blocked.posts.every((p) => p.uid === null), blocked.posts[0]);

    // 19. The ways in: the home page, the search pages.
    const home = await newVisitor(browser, base, `${L} home`);
    for (const [where, url] of [['phone home', lang === 'he' ? '/he' : '/m'], ['desktop home', lang === 'he' ? '/he/d' : '/d']]) {
        await home.page.goto(base + url);
        const line = home.page.locator('a.daily-link');
        const found = await line.waitFor({ timeout: 15000 }).then(() => true, () => false);
        check(`${L}: the ${where} links to today's question`, found && (await line.getAttribute('href')) === `${s.path}?via=daily-home`
            && (await line.evaluate((n) => n.textContent.trim())) === (lang === 'he' ? 'השאלה של היום: תמצאו את האמת?' : 'Today\'s question: can you spot the truth?'),
            found ? await line.getAttribute('href') : `no link on ${url}`);
        if (found) await shot(home.page, `${L}-15-${where.replace(' ', '-')}`);
    }
    await home.page.goto(base + (lang === 'he' ? '/he/how-to-play' : '/how-to-play'));
    const seo = await home.page.locator(`a[href="${s.path}?via=daily-seo"]`).evaluateAll((list) => list.map((n) => n.textContent));
    check(`${L}: How to play links to it twice (under the example, and in the footer links)`, seo.length === 2 && seo.every((x) => x === s.seoLink), seo);
    await home.page.locator(`nav.more a[href="${s.path}?via=daily-seo"]`).click();
    await home.page.locator('#d-answers .answer').first().waitFor({ timeout: 10000 });
    await pickAnswer(home, q.realAnswer);
    check(`${L}: a visitor from a search page starts a game tagged daily-seo`, (await home.page.locator('.card.game a.btn').getAttribute('href')).startsWith('/create-game?via=daily-seo'));

    for (const v of [a, b, c, t, other, evil, plain, unnamed, late, candle, down, blocked, home]) await v.context.close();
}

/** With the repository's own file: a day the file has no question for still shows one, with no number. */
async function runOwnFile(browser, base) {
    if (!fs.existsSync(path.join(ROOT, 'functions', 'data', 'daily-questions.json'))) {
        throw new Error('functions/data/daily-questions.json is not in this checkout');
    }
    const file = JSON.parse(fs.readFileSync(path.join(ROOT, 'functions', 'data', 'daily-questions.json'), 'utf8'));
    for (const lang of ['en', 'he']) {
        const s = strings[lang];
        const own = Object.values(file).filter((q) => q.lang === lang);
        const todays = own.find((q) => q.day === TODAY);
        const first = own.map((q) => q.day).sort()[0];
        const body = await (await fetch(`${FUNCTIONS}/daily?lang=${lang}`)).json();
        const no = Math.round((Date.parse(TODAY) - Date.parse(first)) / 864e5) + 1;
        check(`${lang}: the repository's file answers a question today (${TODAY})`, own.some((q) => q.questionText === body.q) && body.no === no
            && (!todays || todays.questionText === body.q), { no: body.no, q: body.q });
        const v = await newVisitor(browser, base, `${lang} own file`);
        await open(v, base + s.path);
        const kicker = await raw(v.page, '#d-kicker');
        check(`${lang}: the kicker shows a number only from the first day on`, no >= 1 ? kicker.includes('#' + no) : !kicker.includes('#'), kicker);
        check(`${lang}: four answers`, (await answers(v.page)).length === 4);
        await shot(v.page, `${lang}-0-repository-file-today`);
        await v.page.locator('#d-answers .answer').first().click();
        await v.page.locator('#d-reveal h2.head').waitFor();
        const message = await waMessage(v.page.locator('#d-reveal > .send a.btn'));
        check(`${lang}: the message has a number only from the first day on`, no >= 1 ? message.includes(' #' + no) : !message.includes('#'), message);
        await v.context.close();
    }
}

async function main() {
    if (!fileIn(DIST, '/daily.html')) throw new Error(`No daily page in ${DIST} (run npm run build in game/ first)`);
    if (!fs.existsSync(path.join(ROOT, 'functions', 'dist', 'index.js'))) throw new Error('Build functions/ first: npm run build there');
    if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
    const emulators = await startEmulators();
    let browser;
    let server;
    try {
        await seed();
        server = await serve(DIST);
        const base = `http://${HOST}:${server.address().port}`;
        browser = await chromium.launch({ args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`] });
        if (OWN_FILE) {
            await runOwnFile(browser, base);
        } else {
            await run(browser, base, 'en');
            await run(browser, base, 'he');
        }
        const summary = { build: DIST, day: TODAY, questions: OWN_FILE ? 'the repository\'s file' : 'a scratch file around today', checks: checks.length, problems };
        console.log('\nRESULT ' + JSON.stringify(summary, null, 2));
        console.log(problems.length ? 'FAIL' : 'PASS');
        process.exitCode = problems.length ? 1 : 0;
    } finally {
        if (browser) await browser.close();
        if (server) server.close();
        stopEmulators(emulators);
    }
}

main().catch((e) => {
    console.error('FAIL', e.stack || e);
    process.exit(1);
});
