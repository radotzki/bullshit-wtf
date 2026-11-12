// Reports a function's unexpected error to the Sentry project the site already reports to.
// A small sender of our own, not the Sentry library: this file loads nothing when a function
// starts, and everything it needs (the release file, fetch, the database for the test mark) is
// first touched on the error path. See DEPLOYING.md, "Server errors in Sentry".
//
// What it promises:
// - Only unexpected errors. An answer a function gives on purpose ("game is full") is not one,
//   and neither is the answer to a request the site never sends (no PIN, a PIN that is no PIN,
//   a game that does not exist, anything but a POST).
// - Only the functions' own error lines: a line that Node, the functions framework or a library
//   writes with console.error is not a report.
// - Nothing personal is put in: the function's name, the release, the game's PIN, the error's
//   type, a cleaned message and the stack's file names and line numbers. No request body, no
//   headers, no nickname, no answer text, no browser or host id, no address. The cleaning of the
//   message is a filter, not a guarantee: see DEPLOYING.md for what can pass it.
// - It never fails a function and never holds one for long: report() never throws, a send is
//   given up after sendTimeoutMs, and a failed send is dropped (no retry, no queue).
// - It is capped: see the limits below.

/** A send is given up after this long. */
export const sendTimeoutMs = 1000;
/** Reading the game's test mark is given up after this long. */
export const markTimeoutMs = 300;
/** One running copy of a function sends the same fault at most this often an hour... */
export const perFaultPerHour = 2;
/** ...at most this many reports an hour in all... */
export const perHour = 10;
/** ...and this many in its whole life. */
export const perLife = 50;
/** After two failed sends in a row, or when Sentry says to slow down, sending rests. */
export const restAfterFailuresMs = 10 * 60 * 1000;
export const maxRestMs = 60 * 60 * 1000;

const hour = 60 * 60 * 1000;

interface Target {
    url: string;
    key: string;
    environment: string;
}

// The same two Sentry projects the site reports to (game/src/environments): the keys are the
// public ones the site already ships. Any other Google project, and every emulator, sends nothing.
const targets: { [project: string]: Target } = {
    'bullshit-wtf-prod': {
        url: 'https://o66938.ingest.us.sentry.io/api/144992/envelope/',
        key: 'cbf5aaf3b4694fc2993289b77d2c7db6',
        environment: 'production',
    },
    'bullshit-wtf-dev': {
        url: 'https://o66938.ingest.us.sentry.io/api/285990/envelope/',
        key: '9fd70ebdc2c744569ccb0000896cb0ca',
        environment: 'development',
    },
};

export interface ReportContext {
    /** The game's PIN, as the function received it. */
    pin?: any;
    /** A crew's id, when the function works on a crew and not on a game. */
    crew?: any;
    /** The campaign tag the caller sent (a new game has no stored one yet). */
    campaign?: any;
    /** The request's body: used only to cut its words out of the error's message. Never sent. */
    body?: any;
    /** More words to cut out of the message: the caller's address and browser. Never sent. */
    cut?: string[];
    /** True when the report comes from an error line in the log, not from a catch at the function's edge. */
    logged?: boolean;
    /** False when the error escapes the function (a trigger); true when the function answers it. */
    handled?: boolean;
    /** True for a request the site never sends: whatever it runs into is no fault of ours. */
    unasked?: boolean;
    /** True for an HTTP function that works on a game: an error about a game that does not exist is no fault. */
    needsGame?: boolean;
}

/** What a send came to. */
export type SendResult = { ok: true } | { ok: false, restMs?: number };
export type Transport = (event: any, target: Target | null) => Promise<SendResult>;
export type MarkLookup = (pin: string | undefined, crew: string | undefined) => Promise<any>;
/** Is there a game under this PIN? */
export type GameLookup = (pin: string) => Promise<boolean>;

/**
 * An answer a function gives on purpose: the controllers reject with a plain
 * `{ message, code }` (GAME_IS_FULL, NOT_HOST, CORRECT_ANSWER...). Anything else that is thrown,
 * a real Error above all, is unexpected.
 */
export function isExpected(e: any): boolean {
    return !!e && typeof e === 'object' && !(e instanceof Error)
        && typeof e.code === 'string' && typeof e.message === 'string';
}

function projectId(): string | undefined {
    try {
        const config = process.env.FIREBASE_CONFIG ? JSON.parse(process.env.FIREBASE_CONFIG) : {};
        return config.projectId || process.env.GCLOUD_PROJECT;
    } catch (e) {
        return process.env.GCLOUD_PROJECT;
    }
}

function isEmulator(): boolean {
    return process.env.FUNCTIONS_EMULATOR === 'true';
}

/** Where this process reports to: null on an emulator, in tests and in any unknown project. */
export function liveTarget(): Target | null {
    if (isEmulator()) {
        return null;
    }
    const id = projectId();
    return (id && Object.prototype.hasOwnProperty.call(targets, id)) ? targets[id] : null;
}

let release: string | undefined;

/**
 * The name of this build of the functions (dist/release.json, written by write-release.js): a
 * fingerprint of the built code, so it changes when the server's code changes and only then.
 */
export function currentRelease(): string {
    if (release === undefined) {
        try {
            const fs = require('fs');
            const path = require('path');
            const read = JSON.parse(fs.readFileSync(path.join(__dirname, 'release.json'), 'utf8')).release;
            release = typeof read === 'string' && /^(functions-)?[0-9a-f]{7,40}$/.test(read) ? read : 'unknown';
        } catch (e) {
            release = 'unknown';
        }
    }
    return release;
}

function cleanPin(pin: any): string | undefined {
    return typeof pin === 'string' && /^[A-Za-z0-9]{2,12}$/.test(pin) ? pin.toUpperCase() : undefined;
}

function cleanCrew(crew: any): string | undefined {
    return typeof crew === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(crew) ? crew : undefined;
}

function bodyWords(body: any, keep: string | undefined, cut?: string[]): string[] {
    const words: string[] = (cut || []).filter(w => typeof w === 'string' && w.length >= 2);
    if (body && typeof body === 'object') {
        Object.keys(body).slice(0, 40).forEach(k => {
            const v = body[k];
            if (typeof v === 'string' && v.length >= 2 && v.toUpperCase() !== keep) {
                words.push(v, v.toLowerCase(), v.toUpperCase());
            }
        });
    } else if (typeof body === 'string' && body.length >= 2) {
        words.push(body);
    }
    // Longest first, so a word that holds another is cut whole.
    return words.sort((a, b) => b.length - a.length);
}

/**
 * The error's message with everything that could be a person's words taken out: what the
 * request carried, quoted text that is not a plain name or path, letters outside ASCII
 * (Hebrew nicknames and answers), email and network addresses. Cut to 300 characters.
 */
export function cleanMessage(message: any, body?: any, pin?: string, cut?: string[]): string {
    let m = typeof message === 'string' ? message : String(message);
    m = m.slice(0, 2000);
    bodyWords(body, pin, cut).forEach(w => { m = m.split(w).join('[cut]'); });
    m = m.replace(/(["'`])((?:(?!\1).){1,400})\1/g, (all, q, inner) => /^[\w$.\/-]{1,80}$/.test(inner) ? all : q + '[cut]' + q);
    m = m.replace(/[^\x20-\x7e]+/g, '?');
    m = m.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[cut]');
    m = m.replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, '[cut]');
    m = m.replace(/\b[0-9a-f]{0,4}(:[0-9a-f]{0,4}){4,7}\b/gi, '[cut]');
    return m.slice(0, 300);
}

/** The stack as Sentry wants it: oldest call first, file names from the functions' folder on. */
export function frames(stack: any): any[] {
    if (typeof stack !== 'string') {
        return [];
    }
    const out: any[] = [];
    stack.split('\n').slice(1, 31).forEach(line => {
        const m = /^\s*at (?:(.+?) \()?(?:file:\/\/)?([^()]+?):(\d+):(\d+)\)?$/.exec(line);
        if (!m) {
            return;
        }
        let file = m[2].replace(/\\/g, '/');
        const modules = file.lastIndexOf('/node_modules/');
        const dist = file.lastIndexOf('/dist/');
        if (modules >= 0) {
            file = file.slice(modules + 1);
        } else if (dist >= 0) {
            file = file.slice(dist + 6);
        } else if (file.indexOf('node:') !== 0) {
            file = file.slice(file.lastIndexOf('/') + 1);
        }
        const frame: any = { filename: file, lineno: Number(m[3]), colno: Number(m[4]), in_app: modules < 0 && file.indexOf('node:') !== 0 };
        if (m[1]) {
            frame.function = m[1].replace(/[^\x20-\x7e]+/g, '?').slice(0, 100);
        }
        out.push(frame);
    });
    return out.reverse();
}

function eventId(): string {
    return require('crypto').randomBytes(16).toString('hex');
}

/** The whole report, as it would be sent. `test` is 'yes', 'no' or 'unknown'. */
export function buildEvent(fn: string, e: any, ctx: ReportContext, test: string, droppedBefore: number, environment: string, now: number): any {
    const pin = cleanPin(ctx.pin);
    const isError = e instanceof Error;
    const type = isError && typeof e.name === 'string' && /^[\w$.]{1,60}$/.test(e.name) ? e.name : (isError ? 'Error' : 'NonError');
    const raw = isError ? e.message : (e && typeof e === 'object' && typeof e.message === 'string' ? e.message : 'A ' + typeof e + ' was thrown');
    const tags: { [key: string]: string } = { side: 'server', function: fn, test };
    if (pin) {
        tags.pin = pin;
    }
    const code = e && typeof e === 'object' ? e.code : undefined;
    if ((typeof code === 'string' || typeof code === 'number') && /^[\w.\/-]{1,60}$/.test(String(code))) {
        tags.code = String(code);
    }
    const event: any = {
        event_id: eventId(),
        timestamp: now / 1000,
        platform: 'node',
        level: 'error',
        logger: 'functions',
        server_name: 'functions',
        environment,
        release: currentRelease(),
        transaction: fn,
        tags,
        exception: {
            values: [{
                type,
                value: cleanMessage(raw, ctx.body, pin, ctx.cut),
                mechanism: { type: ctx.logged ? 'logged' : 'generic', handled: ctx.handled !== false },
                stacktrace: { frames: frames(isError ? e.stack : undefined) },
            }],
        },
        sdk: { name: 'bullshit.functions', version: '1' },
    };
    if (droppedBefore > 0) {
        // Reports this copy of the function held back (the cap) since the last one it sent.
        event.extra = { held_back_since_last_report: droppedBefore };
    }
    return event;
}

// ---- the cap: per running copy of a function ----

interface Limits {
    windowStart: number;
    inWindow: number;
    perFault: { [key: string]: number };
    life: number;
    heldBack: number;
    failures: number;
    restUntil: number;
}

function freshLimits(): Limits {
    return { windowStart: 0, inWindow: 0, perFault: {}, life: 0, heldBack: 0, failures: 0, restUntil: 0 };
}

let limits = freshLimits();

function faultKey(fn: string, e: any): string {
    const name = e instanceof Error ? e.name : 'NonError';
    const message = e && typeof e === 'object' && typeof e.message === 'string' ? e.message : typeof e;
    return fn + '|' + name + '|' + message.replace(/\d+/g, '0').slice(0, 80);
}

/** May this fault be sent now? Counts it when it may, and resolves to what it was counted under. */
function allow(fn: string, e: any, now: number): string | null {
    if (now - limits.windowStart >= hour) {
        limits.windowStart = now;
        limits.inWindow = 0;
        limits.perFault = {};
    }
    const key = faultKey(fn, e);
    const sameFault = limits.perFault[key] || 0;
    if (now < limits.restUntil || limits.life >= perLife || limits.inWindow >= perHour || sameFault >= perFaultPerHour) {
        limits.heldBack++;
        return null;
    }
    limits.perFault[key] = sameFault + 1;
    limits.inWindow++;
    limits.life++;
    return key;
}

/** Gives back what allow() counted, for a report that turned out to be none. */
function uncount(key: string) {
    if (limits.perFault[key] > 0) {
        limits.perFault[key]--;
    }
    limits.inWindow = Math.max(0, limits.inWindow - 1);
    limits.life = Math.max(0, limits.life - 1);
}

// ---- sending ----

function timeout<T>(promise: Promise<T>, ms: number, otherwise: T): Promise<T> {
    return new Promise(resolve => {
        const timer = setTimeout(() => resolve(otherwise), ms);
        promise.then(
            v => { clearTimeout(timer); resolve(v); },
            () => { clearTimeout(timer); resolve(otherwise); },
        );
    });
}

/** How long Sentry asks us to stay quiet, from a 429 or its rate limit header. */
export function restFromHeaders(status: number, retryAfter: string | null, rateLimits: string | null, ): number | undefined {
    let seconds: number | undefined;
    if (rateLimits) {
        rateLimits.split(',').forEach(part => {
            const fields = part.trim().split(':');
            const categories = (fields[1] || '').split(';').filter(c => c);
            const s = Number(fields[0]);
            if (isFinite(s) && s > 0 && (categories.length === 0 || categories.indexOf('error') >= 0)) {
                seconds = Math.max(seconds || 0, s);
            }
        });
    }
    if (seconds === undefined && status === 429) {
        const s = Number(retryAfter);
        seconds = isFinite(s) && s > 0 ? s : 60;
    }
    return seconds === undefined ? undefined : Math.min(seconds * 1000, maxRestMs);
}

const sendToSentry: Transport = async (event, target) => {
    if (!target) {
        if (isEmulator()) {
            // A local game: show what would be sent, send nothing.
            console.log('server error report (local, not sent) ' + JSON.stringify(event));
        }
        return { ok: true };
    }
    const sentAt = new Date().toISOString();
    const body = JSON.stringify({ event_id: event.event_id, sent_at: sentAt }) + '\n'
        + JSON.stringify({ type: 'event' }) + '\n'
        + JSON.stringify(event) + '\n';
    // The key goes in the address, as Sentry's own libraries send it. It is the site's public key.
    const address = `${target.url}?sentry_version=7&sentry_key=${target.key}&sentry_client=bullshit.functions%2F1`;
    const response = await fetch(address, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-sentry-envelope' },
        body,
        signal: AbortSignal.timeout(sendTimeoutMs),
    });
    const restMs = restFromHeaders(response.status, response.headers.get('retry-after'), response.headers.get('x-sentry-rate-limits'));
    // Nothing reads the answer's body: let it go, so the connection is not held.
    if (response.body) {
        response.body.cancel().catch(() => undefined);
    }
    return response.status >= 200 && response.status < 300 ? (restMs ? { ok: true, restMs } as any : { ok: true }) : { ok: false, restMs };
};

// The test mark of a game or a crew, read from the database (see isTestCampaign in game-model).
const readMark: MarkLookup = async (pin, crew) => {
    const { get, gamesRef, crewsRef } = require('./firebase');
    if (pin) {
        return get(gamesRef.child(pin).child('campaign'));
    }
    if (crew) {
        return get(crewsRef.child(crew).child('test'));
    }
    return undefined;
};

// Every game has its creation time from its first write on (new-game.ts, fork.ts).
const readGame: GameLookup = async (pin) => {
    const { get, gamesRef } = require('./firebase');
    const made = await get(gamesRef.child(pin).child('timestamp'));
    return made !== null && made !== undefined;
};

let transport: Transport = sendToSentry;
let markLookup: MarkLookup = readMark;
let gameLookup: GameLookup = readGame;
let target: Target | null | undefined;

async function testMark(ctx: ReportContext): Promise<string> {
    const { isTestCampaign } = require('./game-model');
    if (ctx.campaign !== undefined && ctx.campaign !== null) {
        return isTestCampaign(ctx.campaign) ? 'yes' : 'no';
    }
    const pin = cleanPin(ctx.pin);
    const crew = cleanCrew(ctx.crew);
    if (!pin && !crew) {
        return 'unknown';
    }
    const unread = {};
    const mark = await timeout(Promise.resolve().then(() => markLookup(pin, crew)), markTimeoutMs, unread);
    return mark === unread ? 'unknown' : (isTestCampaign(mark) ? 'yes' : 'no');
}

/**
 * False only when an HTTP function was asked about a game that is known not to exist: the site
 * never asks that, and the function's answer to it is no fault. When the read fails or takes
 * too long, the game counts as there, so a real fault is not lost.
 */
async function gameIsThere(ctx: ReportContext): Promise<boolean> {
    const pin = cleanPin(ctx.pin);
    if (!ctx.needsGame || !pin) {
        return true;
    }
    return timeout(Promise.resolve().then(() => gameLookup(pin)), markTimeoutMs, true);
}

// ---- what is running now ----
// A 1st-gen function runs one request at a time in each of its copies, so "the request that is
// running" is one value, not a map. It names the function and the game for an error that a
// controller logs and swallows (see the console.error hook below).

let current: { fn: string, ctx: ReportContext } | null = null;

function runtimeName(): string {
    const name = process.env.FUNCTION_TARGET || process.env.K_SERVICE || 'unknown';
    return /^[\w.-]{1,60}$/.test(name) ? name : 'unknown';
}

// Reports on their way out. A function waits for them before it ends (it is given no time to
// work once it has answered), and each is bounded by the timeouts above.
const pending = new Set<Promise<any>>();
// Every thrown thing is reported once, however many times it is logged, caught and thrown on.
let seen = new WeakSet<object>();

/** Resolves when no report is on its way. Never rejects. */
export function settled(): Promise<void> {
    return pending.size === 0 ? Promise.resolve() : Promise.all(Array.from(pending)).then(() => undefined, () => undefined);
}

async function deliver(fn: string, e: any, ctx: ReportContext): Promise<any> {
    try {
        if (target === undefined) {
            target = liveTarget();
        }
        // Nowhere to send and nobody to show it to: do no work at all.
        if (!target && transport === sendToSentry && !isEmulator()) {
            return null;
        }
        const now = Date.now();
        const counted = allow(fn, e, now);
        if (counted === null) {
            return null;
        }
        const [test, there] = await Promise.all([testMark(ctx), gameIsThere(ctx)]);
        if (!there) {
            uncount(counted);
            return null;
        }
        const heldBack = limits.heldBack;
        limits.heldBack = 0;
        const event = buildEvent(fn, e, ctx, test, heldBack, target ? target.environment : 'local', now);
        const failed: SendResult = { ok: false };
        const result = await timeout(Promise.resolve().then(() => transport(event, target)), sendTimeoutMs + 100, failed);
        if (result.ok) {
            limits.failures = 0;
        } else {
            limits.failures++;
        }
        const rest = (result as any).restMs || (limits.failures >= 2 ? restAfterFailuresMs : 0);
        if (rest) {
            limits.restUntil = Date.now() + Math.min(rest, maxRestMs);
        }
        return event;
    } catch (err) {
        // Reporting must never be the fault. Say so in the log, without the error's own text.
        quiet(() => plainError.call(console, 'server error report failed in ' + fn));
        return null;
    }
}

function quiet(f: () => void) {
    try { f(); } catch (ignored) { /* nothing left to do */ }
}

/**
 * Report `e`, thrown in the function `fn`, unless it is an answer given on purpose, was
 * reported already, or the cap holds it back. Resolves when the send is done or given up;
 * never rejects, never throws. Resolves to the report handed to the sender, or null (for tests).
 */
export function report(fn: string, e: any, ctx: ReportContext = {}): Promise<any> {
    try {
        if (isExpected(e) || ctx.unasked) {
            return Promise.resolve(null);
        }
        if (e && typeof e === 'object') {
            if (seen.has(e)) {
                return Promise.resolve(null);
            }
            seen.add(e);
        }
        const p = deliver(fn, e, ctx);
        pending.add(p);
        p.then(() => pending.delete(p), () => pending.delete(p));
        return p;
    } catch (err) {
        return Promise.resolve(null);
    }
}

/** Report an error a function caught and answers itself, for the request that is running. */
export function caught(e: any, more: ReportContext = {}): Promise<any> {
    return current ? report(current.fn, e, Object.assign({}, current.ctx, more)) : report(runtimeName(), e, more);
}

/**
 * Wraps a trigger. An error that escapes it is reported, then thrown on, so the function fails
 * exactly as it did before; and the trigger ends only when its reports are out. The PIN is read
 * from the trigger's path.
 */
export function watched<T extends (...args: any[]) => any>(fn: string, handler: T): T {
    return (async function (this: any, ...args: any[]) {
        const ctx: ReportContext = { pin: args[1] && args[1].params && args[1].params.pin, handled: true };
        current = { fn, ctx };
        try {
            return await handler.apply(this, args);
        } catch (e) {
            report(fn, e, Object.assign({}, ctx, { handled: false }));
            throw e;
        } finally {
            await settled();
        }
    }) as any;
}

/**
 * Wraps an HTTP function's handler. It names the request for the reports, and holds the answer
 * back until a report that is on its way is out: only then, so an answer with no fault behind
 * it leaves exactly as before.
 *
 * `works` says what the function works on, as the site calls it: 'game' (the request names a
 * game by its PIN), 'crew' (it names a crew), 'new' (it makes a game, whose test mark is in the
 * request and not yet in the database) or nothing. A request the site never sends (not a POST,
 * or without the PIN or crew the function works on) is answered exactly as before, and whatever
 * it runs into is not reported.
 */
export function http<T extends (req: any, res: any) => any>(fn: string, handler: T, works: 'game' | 'crew' | 'new' | '' = ''): T {
    const newGame = works === 'new';
    return (function (this: any, req: any, res: any) {
        const body = req && req.body;
        const field = (name: string) => body && typeof body === 'object' ? body[name] : undefined;
        const ctx: ReportContext = { pin: field('pin'), crew: field('crew'), body, handled: true };
        const method = req && req.method;
        ctx.unasked = (typeof method === 'string' && method.toUpperCase() !== 'POST')
            || (works === 'game' && !cleanPin(ctx.pin))
            || (works === 'crew' && !cleanCrew(ctx.crew));
        ctx.needsGame = works === 'game';
        quiet(() => {
            const from = String((req.headers && req.headers['x-forwarded-for']) || '');
            const browser = String((req.headers && req.headers['user-agent']) || '');
            ctx.cut = [from, browser].concat(from.split(',').map(part => part.trim()));
        });
        if (newGame) {
            ctx.campaign = typeof field('campaign') === 'string' ? field('campaign') : '';
        }
        current = { fn, ctx };
        quiet(() => {
            const send = res.send;
            if (typeof send === 'function') {
                res.send = function (this: any, ...args: any[]) {
                    if (pending.size === 0) {
                        return send.apply(this, args);
                    }
                    settled().then(() => send.apply(this, args));
                    return this;
                };
            }
        });
        try {
            return handler.call(this, req, res);
        } catch (e) {
            report(fn, e, Object.assign({}, ctx, { handled: false }));
            throw e;
        }
    }) as any;
}

// ---- errors that are logged and swallowed ----
// The game's steps catch some faults, log them with console.error and play on ("Failed to score
// the picks, revealing without them"). Those never reach a function's edge, so the log line itself
// is the signal: a console.error written by the functions' own code is also a report. With an
// Error among its arguments, that error; without one, the line's first argument alone (the fixed
// words the code wrote), never the rest, which can hold rows.
//
// Only the functions' own lines: the line must be written from a file of this build (the folder
// this file is in). Node's warnings, the functions framework's lines (it prints a failed
// trigger's crash, which the trigger's wrapper has reported already) and a library's lines are
// written from elsewhere and are no reports.

const plainError = console.error;

class LoggedLine extends Error {
    constructor(line: string) {
        super(line);
        this.name = 'LoggedError';
        // The stack would only name this file.
        this.stack = undefined;
    }
}

let ownFolders: string[] = [__dirname];

/** Was the console.error that is running now called from the functions' own code? */
function calledFromOwnCode(): boolean {
    const stack = new Error().stack;
    if (typeof stack !== 'string') {
        return false;
    }
    const lines = stack.split('\n').slice(1);
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].replace(/\\/g, '/');
        // The first call that is not in this file is the one that wrote the line.
        if (line.indexOf(ownFile) >= 0) {
            continue;
        }
        return line.indexOf('/node_modules/') < 0
            && ownFolders.some(folder => line.indexOf(folder.replace(/\\/g, '/') + '/') >= 0);
    }
    return false;
}

const ownFile = __filename.replace(/\\/g, '/');

let inHook = false;

function onErrorLine(args: any[]) {
    if (inHook) {
        return;
    }
    inHook = true;
    try {
        const thrown = args.find(a => a instanceof Error);
        const first = typeof args[0] === 'string' ? args[0] : '';
        if (thrown) {
            caught(thrown, { logged: true });
        } else if (first) {
            caught(new LoggedLine(first), { logged: true });
        }
    } finally {
        inHook = false;
    }
}

console.error = function (this: any, ...args: any[]) {
    plainError.apply(this, args);
    quiet(() => {
        if (calledFromOwnCode()) {
            onErrorLine(args);
        }
    });
};

/** For tests only: swap the sender, the test mark's reader and the target, and clear the cap. */
export const testing = {
    reset(options: {
        transport?: Transport, markLookup?: MarkLookup, gameLookup?: GameLookup, target?: Target | null, release?: string,
        ownFolders?: string[],
    } = {}) {
        limits = freshLimits();
        transport = options.transport || sendToSentry;
        markLookup = options.markLookup || readMark;
        // A test that stands in for the database's test mark stands in for the whole database.
        gameLookup = options.gameLookup || (options.markLookup ? (async () => true) : readGame);
        ownFolders = options.ownFolders || [__dirname];
        target = options.target;
        release = options.release;
        current = null;
        seen = new WeakSet<object>();
        pending.clear();
    },
    sendToSentry,
    targets,
};
