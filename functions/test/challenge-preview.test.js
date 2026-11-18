// A challenge link's own link preview (controllers/challenge-preview.ts, served by the joinPreview
// function in index.ts): the table's best lie and how many it fooled, in the game's language.
// Runs the compiled functions (dist/) with an in-memory database and a fake site, no Firebase project:
//   npm run build && npm test
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// ---- in-memory Realtime Database, recording every path read ----
const db = {};
const reads = [];
function at(parts) {
    let node = db;
    for (const p of parts) {
        if (node == null || typeof node !== 'object') return null;
        node = node[p];
    }
    return node === undefined ? null : node;
}
function ref(parts) {
    return {
        child: (p) => ref(parts.concat(String(p).split('/'))),
        once: async () => { reads.push(parts.join('/')); return { val: () => JSON.parse(JSON.stringify(at(parts))) }; },
        set: async () => { throw new Error('the preview never writes'); },
        update: async () => { throw new Error('the preview never writes'); },
    };
}
const fakeFirebase = {
    gamesRef: ref(['games']),
    qHistoryRef: ref(['qHistory']),
    gameCounterRef: ref(['gameCounter']),
    questionsRef: ref(['questions']),
    seenQuestionsRef: ref(['seenQuestions']),
    crewsRef: ref(['crews']),
    get: (r) => r.once('value').then(s => s.val()),
};
const fakeFunctions = {
    https: { onRequest: (h) => ({ __handler: h }) },
    database: { ref: () => ({ onWrite: (h) => ({ __trigger: h }) }) },
};
fakeFunctions.runWith = () => fakeFunctions;
class FakeBigQuery { dataset() { return { table: () => ({ insert: async () => { } }) }; } }
const realLoad = Module._load;
Module._load = function (request) {
    if (request === 'firebase-functions/v1') return fakeFunctions;
    if (request === 'cors') return () => (req, res, next) => next();
    if (request === '@google-cloud/bigquery') return { BigQuery: FakeBigQuery };
    if (/[\\/]firebase$/.test(request) || request === './../firebase' || request === '../firebase') return fakeFirebase;
    return realLoad.apply(this, arguments);
};

const dist = path.join(__dirname, '..', 'dist');
const jp = require(path.join(dist, 'controllers', 'join-preview'));
const api = require(path.join(dist, 'index'));
const cp = require(path.join(dist, 'controllers', 'challenge-preview'));

// ---- the site's two real pages: game/src/index.html, and he.html as game/scripts/build-he.js makes it ----
const ROOT = path.join(__dirname, '..', '..');
const EN_SHELL = fs.readFileSync(path.join(ROOT, 'game', 'src', 'index.html'), 'utf8');
function hebrewShell() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-he-'));
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.mkdirSync(path.join(dir, 'dist'));
    fs.copyFileSync(path.join(ROOT, 'game', 'scripts', 'build-he.js'), path.join(dir, 'scripts', 'build-he.js'));
    fs.writeFileSync(path.join(dir, 'dist', 'index.html'), EN_SHELL);
    execFileSync(process.execPath, [path.join(dir, 'scripts', 'build-he.js')], { stdio: 'ignore' });
    return fs.readFileSync(path.join(dir, 'dist', 'he.html'), 'utf8');
}
const HE_SHELL = hebrewShell();

const now = Date.now();
const MIN = 60 * 1000;

/** Every content= of a meta tag, by its name/property/itemprop. */
function metas(html) {
    const out = {};
    const re = /<meta\s+(name|property|itemprop)="([^"]+)"\s+content="([^"]*)"/g;
    let m;
    while ((m = re.exec(html))) {
        (out[m[2]] = out[m[2]] || []).push(m[3]);
    }
    return out;
}
const one = (html, key) => { const v = metas(html)[key]; assert.ok(v, `no ${key}`); assert.strictEqual(new Set(v).size, 1); return v[0]; };

// ---- a fake site ----
function site(pages = { '/': EN_SHELL, '/he': HE_SHELL }) {
    const calls = [];
    const fetcher = async (url, init) => {
        calls.push({ url, init });
        const p = new URL(url).pathname;
        const body = pages[p];
        if (body === undefined) return { status: 404, headers: { get: () => null }, text: async () => 'no' };
        const etag = '"' + body.length + '"';
        if (init && init.headers && init.headers['If-None-Match'] === etag) {
            return { status: 304, headers: { get: (h) => (h.toLowerCase() === 'etag' ? etag : null) }, text: async () => '' };
        }
        return { status: 200, headers: { get: (h) => (h.toLowerCase() === 'etag' ? etag : null) }, text: async () => body };
    };
    return { fetcher, calls };
}
function deps(games, s = site(), extra = {}) {
    const faults = [];
    return Object.assign({
        readGame: async (pin) => (games[pin] === undefined ? null : JSON.parse(JSON.stringify(games[pin]))),
        fetcher: s.fetcher, project: 'bullshit-wtf-prod', emulator: false, now: () => now, fault: (e) => faults.push(e),
        faults,
    }, extra);
}
const PROD = { 'x-forwarded-host': 'bullshit.wtf' };


const H = 60 * MIN;
const QIDS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'];
/** A finished English table of six that opened its challenge an hour ago. */
function finished(extra = {}) {
    return Object.assign({
        state: { id: 6, timestamp: now - H }, timestamp: now - 2 * H, locale: 'en', creator: 'u1', challengeOpen: true,
        totalQ: 7, qids: QIDS.slice(),
        players: {
            p1: { nickname: 'Dana', uid: 'u1', score: 2400, host: true }, p2: { nickname: 'Ben', uid: 'u2', score: 1800 },
            p3: { nickname: 'Maya', uid: 'u3', score: 1200 }, p4: { nickname: 'Ron', uid: 'u4', score: 900 },
            p5: { nickname: 'Tal', uid: 'u5', score: 600 }, p6: { nickname: 'Avi', uid: 'u6', score: 300 },
        },
        highlights: {
            p1: { text: 'Penguins have knees', fooled: 4, points: 2000, q: 'q2', total: 6 },
            p2: { text: 'They glue the eggs', fooled: 2, points: 1000, q: 'q5', total: 3 },
            p3: { text: '', fooled: 0, points: 0, total: 0, funny: { text: 'lol', laughs: 2 } },
        },
    }, extra);
}
const hl = (text, fooled, q, points = 500) => ({ text, fooled, points, q, total: fooled });

test.beforeEach(() => jp.forgetShells());

test('parseChallengePath: the PIN and which page, nothing else', () => {
    assert.deepStrictEqual(cp.parseChallengePath('/challenge/qbcd'), { pin: 'QBCD', shell: 'en' });
    assert.deepStrictEqual(cp.parseChallengePath('/he/challenge/QBCD/'), { pin: 'QBCD', shell: 'he' });
    for (const bad of ['/challenge', '/challenge/', '/challenge/AB1', '/challenge/ABCD/x', '/xx/challenge/ABCD',
        '/challenge/ABCDEFGHIJKLM', '/challenge/%3Cb%3E', '/join-game/ABCD', null, 7]) {
        assert.strictEqual(cp.parseChallengePath(bad), null, String(bad));
    }
});

test('bestLie: the lie that fooled the most players', () => {
    assert.deepStrictEqual(cp.bestLie(finished()), { text: 'Penguins have knees', fooled: 4 });
});

test('bestLie: a tie goes to the later question, then to more points', () => {
    const g = finished({ highlights: { p1: hl('Early lie', 3, 'q2', 900), p2: hl('Late lie', 3, 'q6', 100), p3: hl('Mid lie', 3, 'q4', 2000) } });
    assert.strictEqual(cp.bestLie(g).text, 'Late lie');
    const same = finished({ highlights: { p1: hl('Fewer points', 3, 'q6', 100), p2: hl('More points', 3, 'q6', 900) } });
    assert.strictEqual(cp.bestLie(same).text, 'More points');
    // A highlight without its question counts as the earliest.
    const noQ = finished({ highlights: { p1: { text: 'No question', fooled: 3, points: 5000, total: 3 }, p2: hl('With one', 3, 'q1', 1) } });
    assert.strictEqual(cp.bestLie(noQ).text, 'With one');
});

test('bestLie: nothing when no lie fooled anyone, and only seats of the table count', () => {
    assert.strictEqual(cp.bestLie(finished({ highlights: {} })), null);
    assert.strictEqual(cp.bestLie(finished({ highlights: undefined })), null);
    assert.strictEqual(cp.bestLie(finished({ highlights: { p1: hl('Nobody fell', 0, 'q1') } })), null);
    assert.strictEqual(cp.bestLie(finished({ highlights: { p3: { text: '', fooled: 0, points: 0, total: 0, funny: { text: 'x', laughs: 3 } } } })), null);
    assert.strictEqual(cp.bestLie(finished({ highlights: { gone: hl('A seat that left', 5, 'q7') } })), null);
    assert.strictEqual(cp.bestLie(finished({ highlights: { p1: hl('   ', 5, 'q7') } })), null);
});

test('bestLie: a lie the nickname filter rejects is skipped for the next best, then none', () => {
    const crude = finished({ highlights: { p1: hl('Penguins star in porn', 5, 'q7'), p2: hl('They glue the eggs', 2, 'q5') } });
    assert.deepStrictEqual(cp.bestLie(crude), { text: 'They glue the eggs', fooled: 2 });
    const spaced = finished({ highlights: { p1: hl('p o r n', 5, 'q7') } });
    assert.strictEqual(cp.bestLie(spaced), null);
    const onlyCrude = finished({ highlights: { p1: hl('Penguins star in porn', 5, 'q7') } });
    assert.strictEqual(cp.bestLie(onlyCrude), null);
});

test('bestLie: no lie that names a player of the table, or holds an address', () => {
    const named = finished({ highlights: { p1: hl('Dana ate it', 5, 'q7'), p2: hl('They glue the eggs', 2, 'q5') } });
    assert.strictEqual(cp.bestLie(named).text, 'They glue the eggs');
    assert.strictEqual(cp.bestLie(finished({ highlights: { p1: hl("ask ben's mom", 5, 'q7') } })), null);
    // A name inside another word is no name.
    assert.strictEqual(cp.bestLie(finished({ highlights: { p1: hl('Bento boxes', 5, 'q7') } })).text, 'Bento boxes');
    const he = finished({ players: { p1: { nickname: 'דנה', uid: 'u1', score: 9, host: true }, p2: { nickname: 'בן', uid: 'u2', score: 1 } },
        highlights: { p1: hl('בגלל ולדנה', 1, 'q7'), p2: hl('צבע לבן', 1, 'q6') } });
    // "ולדנה" is "and to Dana"; "לבן" (white) is a word of its own, but "ל" + "בן" reads as "to Ben": skipped too.
    assert.strictEqual(cp.bestLie(he), null);
    for (const t of ['see www.spam.net', 'go to bad.com now', 'http://x.y', 'mail me@x']) {
        assert.strictEqual(cp.bestLie(finished({ highlights: { p1: hl(t, 5, 'q7') } })), null, t);
    }
});

test('bestLie: one clean line, cut at a word with an ellipsis', () => {
    const g = finished({ highlights: { p1: hl('Pen‮guins\n  have\tknees', 4, 'q2') } });
    assert.strictEqual(cp.bestLie(g).text, 'Penguins have knees');
    const long = 'The first penguins were bred in Scotland as a gift for the Queen of Sweden';
    const cut = cp.bestLie(finished({ highlights: { p1: hl(long, 4, 'q2') } })).text;
    assert.ok(Array.from(cut).length <= cp.LIE_MAX, cut);
    assert.strictEqual(cut, 'The first penguins were bred in Scotland as a gift for the…');
    const word = 'x'.repeat(80);
    assert.strictEqual(cp.bestLie(finished({ highlights: { p1: hl(word, 4, 'q2') } })).text, 'x'.repeat(cp.LIE_MAX - 1) + '…');
});

test('challengePreviewOf: English and Hebrew, with the lie and its count, no names', () => {
    const en = cp.challengePreviewOf(finished(), 'QBCD', now);
    assert.strictEqual(en.title, '“Penguins have knees” fooled 4 of 5. Can your group spot the truth?');
    assert.strictEqual(en.description, 'Bullshit, the party game of lies: play the same 7 questions and beat 2400 points. Everyone plays on their own phone. Free, no download.');
    assert.strictEqual(en.locale, 'en');
    assert.strictEqual(en.image, 'https://bullshit.wtf/assets/og-image.png');
    assert.strictEqual(en.lie, true);
    const he = cp.challengePreviewOf(finished({ locale: 'he', highlights: { p1: hl('לפינגווינים יש ברכיים', 4, 'q2') } }), 'QBCD', now);
    assert.strictEqual(he.title, '״לפינגווינים יש ברכיים״ עבד על 4 מתוך 5. תצליחו לזהות את האמת?');
    assert.strictEqual(he.description, 'בולשיט, משחק השקרים למסיבות: אותן 7 שאלות, ו־2400 נקודות לעבור. כל אחד משחק מהטלפון, בחינם ובלי הורדה.');
    assert.strictEqual(he.image, 'https://bullshit.wtf/assets/og-image-he.png');
    for (const p of [en, he]) {
        for (const name of ['Dana', 'Ben', 'Maya', 'Ron', 'Tal', 'Avi']) {
            assert.ok(!p.title.includes(name) && !p.description.includes(name), name);
        }
        assert.strictEqual(p.host, '');
    }
});

test('challengePreviewOf: a lie written the other way round starts with the game\'s own words', () => {
    const en = cp.challengePreviewOf(finished({ highlights: { p1: hl('יש להם ברכיים', 3, 'q2') } }), 'QBCD', now);
    assert.strictEqual(en.title, '3 of 5 fell for “יש להם ברכיים”. Can your group spot the truth?');
    const he = cp.challengePreviewOf(finished({ locale: 'he', highlights: { p1: hl('Penguins have knees', 3, 'q2') } }), 'QBCD', now);
    assert.strictEqual(he.title, 'השקר שעבד על 3 מתוך 5: ״Penguins have knees״. תצליחו לזהות את האמת?');
});

test('challengePreviewOf: no lie that fooled anyone is the plain preview', () => {
    const en = cp.challengePreviewOf(finished({ highlights: {} }), 'QBCD', now);
    assert.strictEqual(en.title, 'Your group is challenged to a game of Bullshit');
    assert.strictEqual(en.lie, false);
    const he = cp.challengePreviewOf(finished({ locale: 'he', highlights: { p1: hl('Penguins star in porn', 5, 'q7') } }), 'QBCD', now);
    assert.strictEqual(he.title, 'אתגר בבולשיט: קבוצה אחרת מאתגרת אתכם');
});

test('challengePreviewOf: the generic page unless the challenge is open and within its week', () => {
    assert.strictEqual(cp.challengePreviewOf(null, 'QBCD', now), null);
    assert.strictEqual(cp.challengePreviewOf(finished({ challengeOpen: undefined }), 'QBCD', now), null);
    assert.strictEqual(cp.challengePreviewOf(finished({ state: { id: 3, timestamp: now } }), 'QBCD', now), null);
    assert.strictEqual(cp.challengePreviewOf(finished({ state: { id: 6, timestamp: now - 8 * 24 * H } }), 'QBCD', now), null);
    assert.strictEqual(cp.challengePreviewOf(finished({ idle: true }), 'QBCD', now), null);
    assert.ok(cp.challengePreviewOf(finished(), 'QBCD', now));
});

test('a lie is escaped: no tag or attribute can be made from it, and $& stays literal', () => {
    const page = jp.personalize(EN_SHELL, cp.challengePreviewOf(finished({ highlights: { p1: hl('"><script>x</script> $& $\'', 4, 'q2') } }), 'QBCD', now), 'https://bullshit.wtf/challenge/QBCD');
    assert.ok(!page.includes('<script>x</script>'));
    assert.ok(page.includes('&quot;&gt;&lt;script&gt;x&lt;/script&gt; $&amp; $&#39;'));
    assert.strictEqual(page.slice(-200), EN_SHELL.slice(-200));
});

/** Calls the joinPreview function as Hosting does, with the in-memory database and the fake site. */
async function serve(url) {
    const realFetch = global.fetch;
    global.fetch = async (u, init) => site().fetcher(u, init);
    const logs = [];
    const realLog = console.log;
    console.log = (line) => logs.push(String(line));
    try {
        const res = await new Promise((resolve) => {
            const out = { code: 200, headers: {} };
            const r = {
                set(k, v) { out.headers[k] = v; return this; },
                status(c) { out.code = c; return this; },
                send(b) { out.body = b; resolve(out); return this; },
            };
            api.joinPreview.__handler({ method: 'GET', url, originalUrl: url, headers: PROD, body: {} }, r);
        });
        res.logs = logs;
        return res;
    } finally {
        global.fetch = realFetch;
        console.log = realLog;
    }
}

test('the joinPreview function answers a challenge link with its lie, reading only small parts', async () => {
    db.games = {
        QBCD: Object.assign(finished(), { answers: { x: 1 }, hostKey: 'secretsecretsecret', revealAnswers: [] }),
        HEBR: finished({ locale: 'he', highlights: { p1: hl('לפינגווינים יש ברכיים', 4, 'q2') } }),
    };
    reads.length = 0;
    const res = await serve('/challenge/QBCD?via=challenge-whatsapp');
    assert.strictEqual(res.code, 200);
    assert.strictEqual(one(res.body, 'og:title'), '“Penguins have knees” fooled 4 of 5. Can your group spot the truth?');
    assert.strictEqual(one(res.body, 'og:url'), 'https://bullshit.wtf/challenge/QBCD');
    assert.strictEqual(one(res.body, 'robots'), 'noindex');
    assert.ok(/<app-root/.test(res.body), 'still the app');
    assert.strictEqual(res.headers['Cache-Control'], 'public, max-age=0, s-maxage=600');
    assert.deepStrictEqual(reads.filter(r => r.startsWith('games/QBCD/') && !r.includes('/kept/')).sort(), cp.CHALLENGE_PARTS.map(p => 'games/QBCD/' + p).sort());
    const line = res.logs.find(l => l.startsWith('joinPreview '));
    assert.strictEqual(JSON.parse(line.slice('joinPreview '.length)).kind, 'challenge');
    assert.ok(!line.includes('Penguins') && !line.includes('QBCD'));

    const he = await serve('/he/challenge/HEBR?via=challenge-share');
    assert.strictEqual(one(he.body, 'og:title'), '״לפינגווינים יש ברכיים״ עבד על 4 מתוך 5. תצליחו לזהות את האמת?');
    assert.strictEqual(one(he.body, 'og:locale'), 'he_IL');
    assert.ok(he.body.includes('dir="rtl"'));
});

test('the joinPreview function: an old game\'s kept highlights, and an unopened challenge is the plain page', async () => {
    const old = finished();
    const kept = { players: old.players, highlights: old.highlights, creator: old.creator };
    delete old.players; delete old.highlights; delete old.creator;
    db.games = { OLDG: Object.assign(old, { kept }), SHUT: finished({ challengeOpen: undefined }) };
    const res = await serve('/challenge/OLDG');
    assert.ok(one(res.body, 'og:title').startsWith('“Penguins have knees” fooled 4 of 5'));
    const shut = await serve('/challenge/SHUT');
    assert.strictEqual(shut.body, EN_SHELL);
    assert.strictEqual(shut.headers['Cache-Control'], 'public, max-age=0, s-maxage=600');
    const none = await serve('/challenge/NOPE');
    assert.strictEqual(none.body, EN_SHELL);
});

test('firebase.json sends both challenge paths to joinPreview, ahead of every rewrite to a page', () => {
    const rewrites = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8')).hosting.rewrites;
    const at = (src) => rewrites.findIndex(r => r.source === src);
    assert.strictEqual(rewrites[at('/challenge/*')].function, 'joinPreview');
    assert.strictEqual(rewrites[at('/he/challenge/*')].function, 'joinPreview');
    rewrites.forEach((r, i) => {
        if (r.destination) {
            assert.ok(at('/challenge/*') < i && at('/he/challenge/*') < i, JSON.stringify(r));
        }
    });
});
