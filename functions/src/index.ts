// 1st-gen API: keeps the existing function names, URLs and triggers unchanged.
const functions = require('firebase-functions/v1');
const cors = require('cors')({ origin: true });

import { tick } from './controllers/tick';
import { onPhaseStart } from './controllers/phase-timer';
import { answer } from './controllers/answer';
import { newGame } from './controllers/new-game';
import { onAnswerSelection } from './controllers/on-answer-selection';
import { onRevealDone } from './controllers/on-reveal-done';
import { join } from './controllers/join';
import { fork } from './controllers/fork';
import { startGame, hostHere } from './controllers/start';
import { validateGameName } from './controllers/validate-game-name';
import { createCrew, crewRematch } from './controllers/crew';
import * as analytics from './controllers/analytics';
import { cleanVisit, visitRecord, VISIT_MAX_INSTANCES } from './controllers/visit';

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

// A player id (a database push key); ignore anything else.
function cleanPid(pid: any): string | undefined {
    return typeof pid === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(pid) ? pid : undefined;
}

exports.time = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        res.send({ now: Date.now() });
    });
});

exports.newGame = functions.https.onRequest((req, res) => {
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
            const pin = await newGame(locale, count, uid, { pack: req.body.pack, campaign: req.body.campaign, hostKey, serverStart });
            console.log('newGame created', JSON.stringify({ pin, clientWaitMs, signedIn: !!uid, hostKey: !!hostKey }));
            return res.send({ pin });
        } catch (e) {
            console.error('newGame failed', e);
            return res.status(500).send(errorBody(e));
        }
    });
});

exports.fork = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        const pin = req.body.pin;
        const uid = cleanUid(req.body.uid);

        try {
            const forked = await fork(pin, uid, cleanPid(req.body.pid), cleanHostKey(req.body.hostKey));
            return res.status(200).send(forked);
        } catch (e) {
            return res.status(400).send(errorBody(e));
        }
    });
});

// Save the players of a finished game as a crew.
exports.createCrew = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            const crew = await createCrew(req.body.pin, req.body.name, cleanUid(req.body.uid));
            return res.status(200).send(crew);
        } catch (e) {
            return res.status(400).send(errorBody(e));
        }
    });
});

// One tap on a crew page: a new game for the crew (or the rematch lobby already waiting).
exports.crewRematch = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            const result = await crewRematch(req.body.crew, cleanUid(req.body.uid), cleanHostKey(req.body.hostKey),
                req.body.serverStart === true);
            return res.status(200).send(result);
        } catch (e) {
            return res.status(400).send(errorBody(e));
        }
    });
});

// START in the lobby. In a game with a host key only the host's phone may start it, unless the host
// never joined within 90 s or has been gone 5 minutes: see startVerdict in controllers/start.ts.
exports.startGame = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            return res.status(200).send(await startGame(req.body.pin, cleanHostKey(req.body.hostKey)));
        } catch (e) {
            return res.status(e && e.code === 'NOT_HOST' ? 403 : 400).send(errorBody(e));
        }
    });
});

// The host's lobby page reports in, so the group can start without a host whose phone died.
exports.hostHere = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            return res.status(200).send(await hostHere(req.body.pin, cleanHostKey(req.body.hostKey)));
        } catch (e) {
            return res.status(e && e.code === 'NOT_HOST' ? 403 : 400).send(errorBody(e));
        }
    });
});

exports.answer = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        const pin = req.body.pin;
        const pid = req.body.pid;
        const playerAnswer = req.body.answer;

        try {
            await answer(pin, pid, playerAnswer);
            return res.status(200).send({});
        } catch (e) {
            return res.status(400).send(errorBody(e));
        }
    });
});

exports.join = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        const pin = req.body.pin;
        const nickname = req.body.nickname;
        const uid = req.body.uid;

        try {
            // { pid, nickname, swapped? }: the phone keeps the nickname the server stored.
            return res.status(200).send(await join(pin, nickname, uid, cleanHostKey(req.body.hostKey)));
        } catch (e) {
            return res.status(400).send(errorBody(e));
        }
    });
});

exports.validateGameName = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        const pin = req.body.pin;

        try {
            return res.status(200).send(await validateGameName(pin));
        } catch (e) {
            return res.status(400).send(errorBody(e));
        }
    });
});

exports.onJoinGame = functions.https.onRequest((req, res) => {
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
        }
        return res.status(200).send({});
    });
});

// One row from the visit beacon (game/src/index.html), sent to /_v on the game's own site
// (a Hosting rewrite, so blockers of third-party beacons let it through) with sendBeacon as text/plain,
// so no CORS preflight. Written to BigQuery `visits` and logged as one line starting "visit ".
// Reads no IP and stores no user agent. Always answers 204, whatever BigQuery says.
// At most VISIT_MAX_INSTANCES copies run at once (controllers/visit.ts says why).
exports.visit = functions.runWith({ maxInstances: VISIT_MAX_INSTANCES }).https.onRequest(async (req, res) => {
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
});

// One game night send from a crew page (or another counted share): a row in BigQuery `shares`.
// Always answers 200, so the page never waits on or fails with analytics.
exports.onShare = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        const row = analytics.cleanShare(req.body);
        if (row) {
            try {
                await analytics.onShare(row);
            } catch (e) {
                console.error('onShare analytics failed', e);
            }
        }
        return res.status(200).send({ counted: !!row });
    });
});

exports.tick = functions.database.ref('games/{pin}/tick').onWrite((change, event) => {
    const pin = event.params.pin;
    return tick(pin);
});

// Ends each timed phase on the server at its deadline, so a game keeps going when every phone sleeps.
// The longest phase (a big-screen reveal with 8 players) is under 50 seconds, hence the longer timeout.
exports.phaseTimer = functions
    .runWith({ timeoutSeconds: 120, memory: '128MB' })
    .database.ref('games/{pin}/state').onWrite((change, context) => {
        const pin = context.params.pin;
        return onPhaseStart(pin, change.after.val());
    });

exports.onAnswerSelection = functions.database.ref('games/{pin}/answerSelections').onWrite((change, event) => {
    const pin = event.params.pin;
    return onAnswerSelection(pin);
});

// Every player tapped NEXT on the reveal: move on without waiting for its deadline.
exports.onRevealDone = functions.database.ref('games/{pin}/revealDone').onWrite((change, event) => {
    const pin = event.params.pin;
    return onRevealDone(pin);
});

exports.gameState = functions.database.ref('games/{pin}/state').onWrite((change, event) => {
    const pin = event.params.pin;
    return analytics.onStateChange(pin);
});

exports.onFork = functions.database.ref('games/{pin}/fork').onWrite((change, event) => {
    const pin = event.params.pin;
    return analytics.onFork(pin);
});
