#!/usr/bin/env node
// Browser smoke test for the built game (game/dist).
//
// Why: the build, the unit tests and the "built pages exist" check all pass on a bundle that
// crashes as soon as a browser runs it (a blank page for every player). This loads each public
// page in headless Chromium and fails on a page error, an uncaught exception, a console error,
// a missing file, or a page that renders no text.
//
// It never talks to production. dist/ is served from 127.0.0.1 with the same rewrites as
// firebase.json, and every request to any other host is refused inside the browser: the Firebase
// database (HTTP and WebSocket), Cloud Functions, Sentry and Google Analytics never get a byte.
// Chromium's own DNS is also pointed nowhere for every host but 127.0.0.1, as a second lock.
// Nothing is written anywhere.
//
// Usage: node smoke.js [path to dist]   (default: ../../game/dist)

'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('playwright');

const DIST = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'game', 'dist'));
const HOST = '127.0.0.1';
const PAGE_TIMEOUT_MS = 20000;
// Time for start-up code (Firebase, Sentry, timers) to run after the page shows its text.
const SETTLE_MS = 1500;
// Pages checked at once. Each has its own tab and listeners, so they don't see each other's errors.
const PARALLEL = 4;

// The app's public routes: where players land from a link, a QR code or a search.
// The game screens (game-staging/:pin and on) need a live game in the database, so they are not here.
const APP_PAGES = [
    '/',
    '/m',
    '/d',
    '/learn',
    '/create-game',
    '/join-game',
    '/join-game/ABCD',
    '/present-game',
    '/c/smoke-test',
    '/he',
    '/he/join-game',
    '/he/join-game/ABCD',
    '/he/c/smoke-test',
    '/no-such-page',
];

// Console errors that are expected here and say nothing about the code. Keep this list short:
// every entry is a crash class the test can no longer see.
const ALLOWED_CONSOLE_ERRORS = [
    // Our own refusal of outside requests (see above).
    /^Failed to load resource: net::ERR_(FAILED|BLOCKED_BY_CLIENT|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED)/,
    /WebSocket connection to 'wss?:\/\/[^']*' failed/,
];

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.webmanifest': 'application/manifest+json',
};

function fileIn(dist, urlPath) {
    const full = path.join(dist, urlPath);
    if (!full.startsWith(dist + path.sep) && full !== dist) return null;
    try {
        return fs.statSync(full).isFile() ? full : null;
    } catch (e) {
        return null;
    }
}

// Firebase Hosting's order: an existing file (cleanUrls adds .html), then the rewrites in
// firebase.json in order. "/_v" is a Cloud Function there; here it answers 204 and does nothing.
function resolve(dist, urlPath) {
    if (urlPath === '/_v') return { status: 204 };
    const exact = urlPath.endsWith('/') ? null : fileIn(dist, urlPath);
    if (exact && !exact.endsWith('.html')) return { file: exact };
    const clean = fileIn(dist, urlPath.replace(/\/$/, '') + '.html') || (exact && exact.endsWith('.html') ? exact : null);
    if (clean) return { file: clean };
    const index = fileIn(dist, path.join(urlPath, 'index.html'));
    if (index && urlPath !== '/') return { file: index };
    if (urlPath === '/he' || urlPath.startsWith('/he/')) return { file: path.join(dist, 'he.html') };
    return { file: path.join(dist, 'index.html') };
}

function serve(dist) {
    const server = http.createServer((req, res) => {
        let urlPath;
        try {
            urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        } catch (e) {
            res.writeHead(400).end();
            return;
        }
        const hit = resolve(dist, urlPath);
        if (hit.status) {
            res.writeHead(hit.status).end();
            return;
        }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(hit.file).toLowerCase()] || 'application/octet-stream' });
        fs.createReadStream(hit.file).pipe(res);
    });
    return new Promise((ok) => server.listen(0, HOST, () => ok(server)));
}

// The static search pages that seo/build-pages.js writes, read from the built sitemap, so a new
// page is covered without editing this file.
function sitemapPages(dist) {
    let xml;
    try {
        xml = fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8');
    } catch (e) {
        return [];
    }
    const out = [];
    for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
        try {
            out.push(new URL(m[1]).pathname);
        } catch (e) { /* not a URL: skip */ }
    }
    return out;
}

async function checkPage(context, base, urlPath) {
    const problems = [];
    const page = await context.newPage();
    const isOurs = (u) => {
        try {
            return new URL(u).host === new URL(base).host;
        } catch (e) {
            return false;
        }
    };

    page.on('pageerror', (err) => problems.push(`uncaught exception: ${err.stack || err.message || err}`));
    page.on('crash', () => problems.push('the page crashed'));
    page.on('console', (msg) => {
        if (msg.type() !== 'error') return;
        const text = msg.text();
        if (ALLOWED_CONSOLE_ERRORS.some((re) => re.test(text))) return;
        problems.push(`console error: ${text}`);
    });
    page.on('requestfailed', (req) => {
        if (isOurs(req.url())) problems.push(`request failed: ${req.url()} (${req.failure() && req.failure().errorText})`);
    });
    page.on('response', (resp) => {
        if (isOurs(resp.url()) && resp.status() >= 400) problems.push(`HTTP ${resp.status()} for ${resp.url()}`);
    });

    const started = Date.now();
    try {
        const resp = await page.goto(base + urlPath, { waitUntil: 'load', timeout: PAGE_TIMEOUT_MS });
        if (!resp || !resp.ok()) problems.push(`page answered HTTP ${resp ? resp.status() : 'nothing'}`);
        // The app pages render into <app-root>; the static pages are plain HTML.
        const hasApp = await page.$('app-root');
        const textOf = hasApp ? 'app-root' : 'body';
        try {
            await page.waitForFunction(
                (sel) => {
                    const el = document.querySelector(sel);
                    return !!el && el.innerText.trim().length > 0;
                },
                textOf,
                { timeout: PAGE_TIMEOUT_MS },
            );
        } catch (e) {
            problems.push(`<${textOf}> showed no text within ${PAGE_TIMEOUT_MS / 1000}s (blank page)`);
        }
        await page.waitForTimeout(SETTLE_MS);
    } catch (e) {
        problems.push(`could not load: ${e.message.split('\n')[0]}`);
    }
    await page.close();
    return { urlPath, problems, ms: Date.now() - started };
}

async function main() {
    if (!fileIn(DIST, '/index.html')) {
        console.error(`::error::No built game at ${DIST} (run npm run build in game/ first)`);
        process.exit(1);
    }
    const server = await serve(DIST);
    const base = `http://${HOST}:${server.address().port}`;
    const pages = [...new Set([...APP_PAGES, ...sitemapPages(DIST)])];

    const browser = await chromium.launch({
        // Second lock on the network: no host but 127.0.0.1 resolves, WebSockets included.
        args: [`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE ${HOST}`],
    });
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const blockedHosts = new Set();
    // First lock: refuse every request to another host before it leaves the browser.
    await context.route((url) => url.host !== new URL(base).host, (route) => {
        blockedHosts.add(new URL(route.request().url()).host);
        return route.abort('blockedbyclient');
    });
    await context.routeWebSocket((url) => url.host !== new URL(base).host, (ws) => {
        blockedHosts.add(new URL(ws.url()).host);
        return ws.close({ code: 1008, reason: 'blocked by smoke test' });
    });

    const results = new Array(pages.length);
    let next = 0;
    const worker = async () => {
        while (next < pages.length) {
            const i = next++;
            results[i] = await checkPage(context, base, pages[i]);
        }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));

    let failed = 0;
    for (const r of results) {
        if (r.problems.length) {
            failed++;
            console.log(`FAIL ${r.urlPath} (${r.ms} ms)`);
            for (const p of r.problems) console.log(`::error title=Smoke test ${r.urlPath}::${p.replace(/\n/g, '%0A')}`);
        } else {
            console.log(`ok   ${r.urlPath} (${r.ms} ms)`);
        }
    }

    await browser.close();
    server.close();
    console.log(`\nBlocked outside hosts (never contacted): ${[...blockedHosts].sort().join(', ') || 'none'}`);
    console.log(`${pages.length - failed} of ${pages.length} pages loaded with no errors.`);
    process.exit(failed ? 1 : 0);
}

// emulator-game.js reuses the server, with the same rewrites as firebase.json.
module.exports = { serve, fileIn, HOST };

if (require.main === module) {
    main().catch((e) => {
        console.error(e);
        process.exit(1);
    });
}
