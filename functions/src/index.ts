// 1st-gen API: keeps the existing function names, URLs and triggers unchanged.
const functions = require('firebase-functions/v1');
const cors = require('cors')({ origin: true });

import { tick } from './controllers/tick';
import { onPhaseStart } from './controllers/phase-timer';
import { answer } from './controllers/answer';
import { newGame } from './controllers/new-game';
import { onAnswerSelection } from './controllers/on-answer-selection';
import { newPickers, eventTime } from './controllers/answer-times';
import { onRevealDone } from './controllers/on-reveal-done';
import { join } from './controllers/join';
import { fork } from './controllers/fork';
import { sameTable } from './controllers/same-table';
import { startGame, hostHere, hostToBigScreen } from './controllers/start';
import { validateGameName } from './controllers/validate-game-name';
import { createCrew, createTable, crewRematch } from './controllers/crew';
import { crewNight } from './controllers/crew-night';
import * as analytics from './controllers/analytics';
import { cleanVisit, visitRecord, VISIT_MAX_INSTANCES } from './controllers/visit';
import { laugh } from './controllers/laugh';
import { joinPreviewPage, readPreviewGame } from './controllers/join-preview';
import { caught, http, watched } from './report';
import { sweepOldGames } from './controllers/old-games';

// Error bodies always carry a readable message and a code, so the client
// (and Sentry) never sees an empty object.
function errorBody(e: any) {
    if (e && typeof e === 'object') {
        const body: { [key: string]: any } = {
            message: e.message || String(e),
            code: e.code || 'INTERNAL',
        };
        // GAME_OVER: the rematch's PIN, or that the game just ended (see game-over.ts).
        if (typeof e.rematch === 'string') {
            body.rematch = e.rematch;
        }
        if (e.justEnded === true) {
            body.justEnded = true;
        }
        // GAME_OVER within a week of the end: the night's recap (see night-after.ts).
        if (e.nightAfter && typeof e.nightAfter === 'object') {
            body.nightAfter = e.nightAfter;
        }
        return body;
    }
    return { message: String(e), code: 'INTERNAL' };
}

// Firebase anonymous uids are short alphanumeric strings; ignore anything else.
function cleanUid(uid: any): string | undefined {
    return typeof uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(uid) ? uid : undefined;
}

// A phone's one-game host key (see hostKey in game-model); ignore anything else.
function cleanHostKey(key: any): string | undefined {
    return typeof key === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(key) ? key : undefined;
}

// hostHere's body: JSON from the app's own calls, or a text/plain JSON string from the hidden page.
function hostHereBody(req: any): { pin?: any; hostKey?: any; away?: any } {
    const raw = req.body;
    if (raw && typeof raw === 'object' && !Buffer.isBuffer(raw)) {
        return raw;
    }
    const text = typeof raw === 'string' ? raw : req.rawBody ? req.rawBody.toString('utf8') : '';
    if (!text || text.length > 400) {
        return {};
    }
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
        return {};
    }
}

// A player id (a database push key); ignore anything else.
function cleanPid(pid: any): string | undefined {
    return typeof pid === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(pid) ? pid : undefined;
}

exports.time = functions.https.onRequest(http('time', (req, res) => {
    cors(req, res, () => {
        res.send({ now: Date.now() });
    });
}));

// The daily puzzle (/daily, /he/daily), reached on the site's own address as /_daily (a Hosting
// rewrite, like the visit beacon). See controllers/daily.ts for what it answers and keeps.
//   GET  ?lang=he               today's question and its tallies; Hosting's cache answers most visitors
//   GET  ?lang=he&d=<day>&f=<id>  the same, with how many friends a sender's lie fooled
//   POST {lang, day, m, k, f, src, uid}  (sendBeacon, text/plain): one pick or one press. Answers 204.
// And a chat group's round (controllers/daily-round.ts), never cached:
//   GET  ?lang=he&n=<puzzle no>&g=<round id>&u=<browser id>  the same, with the round as this browser sees it
//   POST {a, lang, no, g, uid, src, ...}  (fetch, text/plain): start, pick, lie, remove or flag. Answers the round.
import * as daily from './controllers/daily';
import * as dailyRound from './controllers/daily-round';

let dailyBank: daily.DailyBank = null;
const dailyWarned: { [lang: string]: string } = {};
function dailyQuestions(): daily.DailyBank {
    if (!dailyBank) {
        try {
            // On the emulators only, a play-test brings a file of its own (.github/smoke/emulator-daily.js).
            const own = process.env.FUNCTIONS_EMULATOR === 'true' && process.env.DAILY_QUESTIONS_FILE;
            dailyBank = daily.loadDaily(require(own || '../data/daily-questions.json'));
        } catch (e) {
            console.error('daily: the question file did not load', e);
            return { en: [], he: [] };
        }
    }
    return dailyBank;
}
// The tallies' reads and writes, loaded at the first request (it opens the database).
const dailyStore = (): typeof import('./controllers/daily-store') => require('./controllers/daily-store');

// The site reads the puzzle with a GET and sends picks with a POST: a fault in either is a report.
exports.daily = functions.https.onRequest(http('daily', async (req, res) => {
    const bank = dailyQuestions();
    const now = Date.now();
    eraseOldRounds(now);
    // Old games' private parts are moved by the gameState trigger alone (see controllers/old-games.ts),
    // not here: the daily answer waits for nothing, and a function's work after its answer may be frozen.
    if (req.method === 'POST') {
        const raw = req.rawBody ? req.rawBody.toString('utf8') : req.body;
        let parsed: any = raw;
        if (typeof raw === 'string') {
            try { parsed = raw.length > 600 ? null : JSON.parse(raw); } catch (e) { parsed = null; }
        }
        if (parsed && typeof parsed === 'object' && parsed.a !== undefined) {
            return roundAct(parsed, bank, now, res);
        }
        const post = parsed ? daily.cleanPost(parsed, bank, now) : null;
        if (post) {
            try {
                await dailyStore().addPicks(post);
                await analytics.onShare(post.row);
                if (post.via) {
                    await analytics.onShare(post.via);
                }
            } catch (e) {
                console.error('daily: a post was not kept', e);
            }
        }
        return res.status(204).send('');
    }
    if (req.method !== 'GET') {
        return res.status(405).send('');
    }
    const lang = daily.cleanLang(req.query.lang);
    const list = bank[lang];
    const today = daily.israelDay(now);
    if (!daily.questionFor(list, today)) {
        res.set('Cache-Control', 'no-store');
        return res.status(503).send({ error: 'no-question' });
    }
    // Sentry hears once a day (per running copy) that the questions are running out.
    const left = daily.daysLeft(list, today);
    if (left < daily.WARN_DAYS_LEFT && dailyWarned[lang] !== today) {
        dailyWarned[lang] = today;
        console.error(`daily: ${left < 0 ? 'no' : left} days of new ${lang} questions left after today; `
            + 'the page repeats the file from its first question when they run out');
    }
    const roundNo = Number(req.query.n);
    const g = typeof req.query.g === 'string' && dailyRound.ROUND_ID.test(req.query.g) ? req.query.g : null;
    let round: any = null;
    if (g) {
        round = await roundFor(lang, list, roundNo, g, req.query.u, now);
    }
    let tallies: { picks: daily.Picks, before: daily.Picks, friend: daily.FriendCount | null } = null;
    try {
        tallies = await dailyStore().readTallies(lang, list, today, daily.cleanCountDay(req.query.d, now), daily.cleanLinkId(req.query.f));
    } catch (e) {
        // The question still goes out, without numbers, and is not kept by the cache.
        console.error('daily: the tallies did not load', e);
    }
    res.set('Cache-Control', tallies && !g ? `public, max-age=0, s-maxage=${daily.cacheSeconds(now, !!tallies.friend)}` : 'no-store');
    const body = daily.puzzleBody(list, now, tallies && tallies.picks, tallies && tallies.before, tallies && tallies.friend);
    if (g) {
        body.round = round;
    }
    return res.status(200).send(body);
}, '', ['GET', 'POST']));

// Erasing a chat group's rounds past keeping (nine days and more after their day): once a day per
// running copy, from any call of the daily function: a question asked, a pick, a press, on the
// plain puzzle as much as in a round. So rounds are erased while anyone plays the daily puzzle,
// whether or not anybody opens a round, and after the round test is switched off; a year back, so a
// quiet spell leaves nothing behind. No timer of its own: a scheduled function would be a new one.
let roundsErasedOn = '';
function eraseOldRounds(now: number) {
    const today = daily.israelDay(now);
    if (roundsErasedOn === today) {
        return;
    }
    roundsErasedOn = today;
    (['en', 'he'] as daily.DailyLang[]).forEach(lang => {
        try {
            dailyStore().eraseOldRounds(lang, now).catch(e => console.error('daily: old rounds were not erased', e));
        } catch (e) {
            console.error('daily: old rounds were not erased', e);
        }
    });
}

/** The round a browser opens, as it sees it (see dailyRound.roundView); a load error reads as missing. */
async function roundFor(lang: daily.DailyLang, list: daily.DailyQuestion[], no: number, g: string, u: any, now: number) {
    const day = dailyRound.dayOfNumber(list, no);
    if (!day) {
        return { g, state: 'missing' };
    }
    const uid = typeof u === 'string' && /^[a-z0-9]{16}$/.test(u) ? u : null;
    const found = daily.questionFor(list, day);
    const today = daily.israelDay(now);
    try {
        const phase = dailyRound.roundPhase(day, now);
        if (phase === 'gone' || phase === 'early' || !found) {
            return dailyRound.roundView(null, g, day, null, no, uid, now);
        }
        const r = phase === 'open'
            ? await dailyStore().openRound(lang, day, g, uid, found.q.fakeAnswers.length)
            : await dailyStore().readRound(lang, day, g);
        return dailyRound.roundView(r, g, day, found.q, no, uid, now);
    } catch (e) {
        console.error('daily: a round did not load', e);
        return { g, day, no, state: 'missing' };
    }
}

/** POST /_daily with an act on a round: answers { ok, round } or { error, round }. */
async function roundAct(body: any, bank: daily.DailyBank, now: number, res) {
    res.set('Cache-Control', 'no-store');
    const post = dailyRound.cleanRoundPost(body, bank, now);
    if (!post) {
        return res.status(400).send({ error: 'bad' });
    }
    const list = bank[post.lang];
    const found = daily.questionFor(list, post.day);
    const no = Number(body.no);
    try {
        const done = await dailyStore().actOnRound(post, found.q, now);
        const testRound = !!(done.round && done.round.test);
        if (!done.error) {
            const row = dailyRound.roundRow(post, done.method, testRound);
            if (done.tally && !post.test && !testRound) {
                await dailyStore().addRoundPick(post.lang, post.day, done.tally);
            }
            if (row) {
                await analytics.onShare(row);
            }
            const via = dailyRound.roundViaRow(post, done.method, testRound);
            if (via) {
                await analytics.onShare(via);
            }
        }
        const view = dailyRound.roundView(done.round, post.g, post.day, found.q, no, post.uid, now);
        return res.status(200).send(done.error ? { error: done.error, round: view } : { ok: true, round: view });
    } catch (e) {
        console.error('daily: a round act was not kept', e);
        return res.status(500).send({ error: 'server' });
    }
}

exports.newGame = functions.https.onRequest(http('newGame', (req, res) => {
    cors(req, res, async () => {
        const locale = req.body.locale;
        const count = req.body.count;
        const uid = cleanUid(req.body.uid);
        // How long the phone waited for sign-in before calling us (capped at about 1.5 s).
        const wait = Number(req.body.clientWaitMs);
        const clientWaitMs = isFinite(wait) && wait >= 0 ? Math.round(wait) : null;
        const hostKey = cleanHostKey(req.body.hostKey);
        try {
            const serverStart = req.body.serverStart === true;
            // The phone can show the staged reveal: the game is in that 50/50 test (see big-reveal.ts).
            const stagedReveal = req.body.stagedReveal === true;
            // The phone can show the About questions: the game is in that 50/50 test (see about.ts).
            const aboutUs = req.body.aboutUs === true;
            const pin = await newGame(locale, count, uid, {
                pack: req.body.pack, campaign: req.body.campaign, hostKey, serverStart, stagedReveal, aboutUs,
            });
            // Where the host's visit started, for the usage data (see controllers/arrival.ts).
            await analytics.recordArrival(pin, req.body.arrival);
            console.log('newGame created', JSON.stringify({ pin, clientWaitMs, signedIn: !!uid, hostKey: !!hostKey }));
            return res.send({ pin });
        } catch (e) {
            console.error('newGame failed', e);
            caught(e);
            return res.status(500).send(errorBody(e));
        }
    });
}, 'new'));

exports.fork = functions.https.onRequest(http('fork', (req, res) => {
    cors(req, res, async () => {
        const pin = req.body.pin;
        const uid = cleanUid(req.body.uid);

        try {
            // sameTable: PLAY AGAIN, SAME TABLE on a finished game's recap (same-table.ts), through this
            // function so no new function has to be deployed.
            const next = req.body.sameTable === true ? sameTable : fork;
            const forked = await next(pin, uid, cleanPid(req.body.pid), cleanHostKey(req.body.hostKey),
                req.body.stagedReveal === true, req.body.aboutUs === true);
            return res.status(200).send(forked);
        } catch (e) {
            caught(e);
            return res.status(400).send(errorBody(e));
        }
    });
}, 'game'));

// Save the players of a finished game as a crew.
exports.createCrew = functions.https.onRequest(http('createCrew', (req, res) => {
    cors(req, res, async () => {
        try {
            const crew = await createCrew(req.body.pin, req.body.name, cleanUid(req.body.uid), req.body.auto === true);
            return res.status(200).send(crew);
        } catch (e) {
            caught(e);
            return res.status(400).send(errorBody(e));
        }
    });
}, 'game'));

// INVITE ANOTHER GROUP: a guest of a finished game makes a crew of one, with a night, to send to other friends.
exports.createTable = functions.https.onRequest(http('createTable', (req, res) => {
    cors(req, res, async () => {
        try {
            const table = await createTable(req.body.pin, cleanPid(req.body.pid), req.body.time, cleanUid(req.body.uid));
            return res.status(200).send(table);
        } catch (e) {
            caught(e);
            return res.status(400).send(errorBody(e));
        }
    });
}, 'game'));

// One tap on a crew page: a new game for the crew (or the rematch lobby already waiting).
exports.crewRematch = functions.https.onRequest(http('crewRematch', (req, res) => {
    cors(req, res, async () => {
        try {
            const result = await crewRematch(req.body.crew, cleanUid(req.body.uid), cleanHostKey(req.body.hostKey),
                req.body.serverStart === true, req.body.stagedReveal === true, req.body.aboutUs === true);
            return res.status(200).send(result);
        } catch (e) {
            caught(e);
            return res.status(400).send(errorBody(e));
        }
    });
}, 'crew'));

// A crew's game night: set its date, or say "I'm in" (or "Can't make it") by nickname.
// Written here because phones may not write a crew (see controllers/crew-night.ts).
exports.crewNight = functions.https.onRequest(http('crewNight', (req, res) => {
    cors(req, res, async () => {
        try {
            return res.status(200).send(await crewNight(req.body));
        } catch (e) {
            caught(e);
            return res.status(400).send(errorBody(e));
        }
    });
}, 'crew'));

// START in the lobby. In a game with a host key only the host's phone may start it, unless the host
// never joined within 90 s or has been gone 5 minutes, or a lobby of 5 or more whose host's page has
// been hidden 45 s: see startVerdict in controllers/start.ts.
exports.startGame = functions.https.onRequest(http('startGame', (req, res) => {
    cors(req, res, async () => {
        try {
            return res.status(200).send(await startGame(req.body.pin, cleanHostKey(req.body.hostKey)));
        } catch (e) {
            caught(e);
            return res.status(e && e.code === 'NOT_HOST' ? 403 : 400).send(errorBody(e));
        }
    });
}, 'game'));

// The host's lobby page reports in, so the group can start without a host whose phone died.
// With `away: true` it says the page was just hidden (sent with fetch keepalive as text/plain, so no
// CORS preflight, the way the visit beacon sends its end row): guests are told the host stepped away.
exports.hostHere = functions.https.onRequest(http('hostHere', (req, res) => {
    cors(req, res, async () => {
        try {
            const body = hostHereBody(req);
            return res.status(200).send(await hostHere(body.pin, cleanHostKey(body.hostKey), Date.now(), body.away === true));
        } catch (e) {
            caught(e);
            return res.status(e && e.code === 'NOT_HOST' ? 403 : 400).send(errorBody(e));
        }
    });
}, 'game'));

// The host's computer becomes the big screen: frees the host's seat there, so the host joins from a
// phone. Only for the browser with the game's host key, in the lobby: see hostToBigScreen in start.ts.
exports.hostToBigScreen = functions.https.onRequest(http('hostToBigScreen', (req, res) => {
    cors(req, res, async () => {
        try {
            return res.status(200).send(await hostToBigScreen(req.body.pin, cleanHostKey(req.body.hostKey)));
        } catch (e) {
            caught(e);
            return res.status(e && e.code === 'NOT_HOST' ? 403 : 400).send(errorBody(e));
        }
    });
}, 'game'));

exports.answer = functions.https.onRequest(http('answer', (req, res) => {
    cors(req, res, async () => {
        const pin = req.body.pin;
        const pid = req.body.pid;
        const playerAnswer = req.body.answer;

        try {
            await answer(pin, pid, playerAnswer);
            return res.status(200).send({});
        } catch (e) {
            caught(e);
            return res.status(400).send(errorBody(e));
        }
    });
}, 'game'));

// A laugh at a lie on the reveal: written by the server on the reveal row, since phones may not write
// there (see controllers/laugh.ts). Laughs give no points.
exports.laugh = functions.https.onRequest(http('laugh', (req, res) => {
    cors(req, res, async () => {
        try {
            return res.status(200).send(await laugh(req.body.pin, cleanPid(req.body.pid), req.body.text));
        } catch (e) {
            caught(e);
            return res.status(400).send(errorBody(e));
        }
    });
}, 'game'));

exports.join = functions.https.onRequest(http('join', (req, res) => {
    cors(req, res, async () => {
        const pin = req.body.pin;
        const nickname = req.body.nickname;
        const uid = req.body.uid;

        try {
            // { pid, nickname, swapped? }: the phone keeps the nickname the server stored.
            // The browser string, kept per seat (as the users table keeps it per join), so a guest whose
            // invite link opened in an empty browser can get their seat back by name (join.ts seatByName).
            return res.status(200).send(await join(pin, nickname, uid, cleanHostKey(req.body.hostKey), cleanPid(req.body.pid),
                req.headers['user-agent'] as string));
        } catch (e) {
            caught(e);
            return res.status(400).send(errorBody(e));
        }
    });
}, 'game'));

exports.validateGameName = functions.https.onRequest(http('validateGameName', (req, res) => {
    cors(req, res, async () => {
        const pin = req.body.pin;

        try {
            // uid and pid: the join page's sign-in and last seat, so a finished game's recap knows a player.
            return res.status(200).send(await validateGameName(pin, cleanUid(req.body.uid), cleanPid(req.body.pid)));
        } catch (e) {
            caught(e);
            return res.status(400).send(errorBody(e));
        }
    });
}, 'game'));

exports.onJoinGame = functions.https.onRequest(http('onJoinGame', (req, res) => {
    cors(req, res, async () => {
        const uid = req.body.uid;
        const pin = req.body.pin;
        const nickname = req.body.nickname;
        const via = analytics.cleanVia(req.body.via);
        const ip = req.headers['x-forwarded-for'];
        const useragent = req.headers['user-agent'];

        try {
            await analytics.onJoinGame(uid, ip, useragent, pin, nickname, via);
        } catch (e) {
            console.error('onJoinGame analytics failed', e);
            caught(e);
        }
        return res.status(200).send({});
    });
}, 'game'));

// One row from the visit beacon (game/src/index.html), sent to /_v on the game's own site
// (a Hosting rewrite, so blockers of third-party beacons let it through) with sendBeacon as text/plain,
// so no CORS preflight. Written to BigQuery `visits` and logged as one line starting "visit ".
// Reads no IP and stores no user agent. Always answers 204, whatever BigQuery says.
// At most VISIT_MAX_INSTANCES copies run at once (controllers/visit.ts says why).
exports.visit = functions.runWith({ maxInstances: VISIT_MAX_INSTANCES }).https.onRequest(http('visit', async (req, res) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'POST') {
        try {
            const row = cleanVisit(req.rawBody ? req.rawBody.toString('utf8') : req.body, req.headers['user-agent']);
            if (row) {
                console.log('visit ' + JSON.stringify(row));
                await analytics.onVisit(visitRecord(row));
            }
        } catch (e) {
            console.error('visit failed', e && e.message);
        }
    }
    res.status(204).send('');
}));

// A join link, /join-game/<PIN> or /he/join-game/<PIN> (a Hosting rewrite in firebase.json): the site's
// own page, with link-preview tags for this game ("Dana invited you to play Bullshit", in the game's
// language). Every visitor gets the same page, so a browser runs the app as on any other path and the
// CDN may cache it. See controllers/join-preview.ts and DEPLOYING.md, "Join link previews".
exports.joinPreview = functions.runWith({ timeoutSeconds: 15 }).https.onRequest(http('joinPreview', async (req, res) => {
    const started = Date.now();
    const project = process.env.GCLOUD_PROJECT || (process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG).projectId : '') || '';
    const url = String(req.originalUrl || req.url || '/');
    const q = url.indexOf('?');
    const path = q >= 0 ? url.slice(0, q) : url;
    const query = q >= 0 ? url.slice(q) : '';
    const answer = await joinPreviewPage(path, query, req.headers, {
        readGame: readPreviewGame,
        fetcher: (u, init) => fetch(u, init) as any,
        project,
        emulator: process.env.FUNCTIONS_EMULATOR === 'true',
        // A GET is no request the site sends, so http() reports nothing by itself: report the faults
        // here. A slow database read is only logged (the link got the generic preview).
        fault: (e) => {
            if (e && e.code === 'SLOW') {
                console.log('joinPreview slow read');
                return;
            }
            console.warn('joinPreview fault', e && e.message ? e.message : String(e));
            caught(e, { unasked: false });
        },
    });
    // One short line per answer, no nickname: how often a link got a named preview, and how long it took.
    console.log('joinPreview ' + JSON.stringify({ kind: answer.kind, ms: Date.now() - started }));
    Object.keys(answer.headers).forEach(h => res.set(h, answer.headers[h]));
    res.status(answer.status).send(answer.body);
}));

// One game night send from a crew page (or another counted share): a row in BigQuery `shares`.
// Always answers 200, so the page never waits on or fails with analytics.
exports.onShare = functions.https.onRequest(http('onShare', (req, res) => {
    cors(req, res, async () => {
        const row = analytics.cleanShare(req.body);
        if (row) {
            try {
                await analytics.onShare(row);
            } catch (e) {
                console.error('onShare analytics failed', e);
                caught(e);
            }
        }
        return res.status(200).send({ counted: !!row });
    });
}));

exports.tick = functions.database.ref('games/{pin}/tick').onWrite(watched('tick', (change, event) => {
    const pin = event.params.pin;
    return tick(pin);
}));

// Ends each timed phase on the server at its deadline, so a game keeps going when every phone sleeps.
// The longest phase (a big-screen reveal with 12 players) is about 70 seconds, hence the longer timeout.
exports.phaseTimer = functions
    .runWith({ timeoutSeconds: 120, memory: '128MB' })
    .database.ref('games/{pin}/state').onWrite(watched('phaseTimer', (change, context) => {
        const pin = context.params.pin;
        return onPhaseStart(pin, change.after.val());
    }));

exports.onAnswerSelection = functions.database.ref('games/{pin}/answerSelections').onWrite(watched('onAnswerSelection', (change, event) => {
    const pin = event.params.pin;
    // Whose pick is new in this write, and when it was written: only for measuring the wait.
    return onAnswerSelection(pin, newPickers(change.before && change.before.val(), change.after && change.after.val()), eventTime(event.timestamp));
}));

// Every player tapped NEXT on the reveal: move on without waiting for its deadline.
exports.onRevealDone = functions.database.ref('games/{pin}/revealDone').onWrite(watched('onRevealDone', (change, event) => {
    const pin = event.params.pin;
    return onRevealDone(pin);
}));

exports.gameState = functions.database.ref('games/{pin}/state').onWrite(watched('gameState', (change, event) => {
    const pin = event.params.pin;
    // Also moves old games' private parts out of phones' reach, at most once a minute for the whole
    // project (see controllers/old-games.ts): this trigger keeps no phone waiting. sweepOldGames never rejects.
    return Promise.all([analytics.onStateChange(pin), sweepOldGames()]).then(([done]) => done);
}));

exports.onFork = functions.database.ref('games/{pin}/fork').onWrite(watched('onFork', (change, event) => {
    const pin = event.params.pin;
    return analytics.onFork(pin);
}));
