#!/usr/bin/env node
// Local run: addresses that end in a slash, on the Firebase Hosting emulator serving game/dist with
// the real firebase.json hosting block (cleanUrls, trailingSlash, rewrites, headers).
//
// 1. Every page in the built sitemap.xml answers 200 at its own address, and its address with a
//    trailing slash answers 301 to the address without it, which then serves that same page. A link
//    that gains a slash on the way (a chat app, a copy and paste) reaches the page, not "Page not found".
// 2. The game's own screens (lobby, join, game pages, the Hebrew home and screens) still serve the
//    app's page with and without a slash, and still carry X-Robots-Tag: noindex. The search pages don't.
// 3. Addresses that are no page of the site still answer 404 with the not-found page, with or
//    without a slash.
//
// Hosting emulator alone: no Java, no functions, no database, no browser, nothing reaches
// production. The join-link function (joinPreview) and the visit beacon (/_v) are Cloud Functions,
// so their addresses aren't checked here; emulator-join-preview.js covers the join links.
// Needs game/ built and the root's npm ci (firebase-tools):
//   node .github/smoke/emulator-trailing-slash.js [path to dist]
// Prints a JSON summary; exits non-zero when a check fails.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const DIST = path.resolve(process.argv[2] || path.join(ROOT, 'game', 'dist'));
const HOST = '127.0.0.1';
const PORT = 5000;
const PROJECT = 'demo-bullshit';
const SITE = `http://${HOST}:${PORT}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The game's screens, as firebase.json's rewrites list them, each with the page it must serve.
const APP_ROUTES = [
    ['/m', 'index.html'], ['/d', 'index.html'], ['/create-game', 'index.html'], ['/join-game', 'index.html'],
    ['/present-game', 'index.html'], ['/learn', 'index.html'], ['/present-game/ABCD', 'index.html'],
    ['/c/k3j9', 'index.html'], ['/game-staging/ABCD', 'index.html'], ['/round-intro/ABCD', 'index.html'],
    ['/show-question/ABCD', 'index.html'], ['/show-answers/ABCD', 'index.html'],
    ['/reveal-the-truth/ABCD', 'index.html'], ['/score-board/ABCD', 'index.html'],
    ['/score-board-final/ABCD', 'index.html'], ['/step/ABCD', 'index.html'],
    ['/he/join-game', 'he.html'], ['/he/c/k3j9', 'he.html'],
];
const NOT_FOUND = ['/no-such-page', '/he/no-such-page', '/how-to-plya', '/game-staging/ABCD/x'];

async function startHosting() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-slash-hosting-'));
    const real = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
    // The hosting emulator serves no file from an absolute "public" path: link the build in as public/.
    fs.symlinkSync(DIST, path.join(dir, 'public'));
    fs.writeFileSync(path.join(dir, 'firebase.json'), JSON.stringify({
        hosting: Object.assign({}, real.hosting, { public: 'public' }),
        emulators: { hosting: { host: HOST, port: PORT }, ui: { enabled: false }, singleProjectMode: true },
    }, null, 2));
    const logFile = path.join(dir, 'emulators.log');
    const out = fs.openSync(logFile, 'w');
    const child = spawn(path.join(ROOT, 'node_modules', '.bin', 'firebase'),
        ['emulators:start', '--only', 'hosting', '--project', PROJECT], { cwd: dir, stdio: ['ignore', out, out], detached: true });
    const until = Date.now() + 120000;
    while (Date.now() < until) {
        const text = fs.readFileSync(logFile, 'utf8');
        if (/All emulators ready/.test(text)) return child;
        if (child.exitCode !== null) throw new Error(`the emulator stopped:\n${text.slice(-2000)}`);
        await sleep(500);
    }
    throw new Error('the hosting emulator did not start within 2 minutes');
}

function stop(child) {
    if (!child) return;
    try {
        process.kill(-child.pid, 'SIGINT');
    } catch (e) { /* already gone */ }
}

async function get(p) {
    const res = await fetch(SITE + p, { redirect: 'manual' });
    const body = await res.text();
    return { status: res.status, location: res.headers.get('location'), robots: res.headers.get('x-robots-tag'), body };
}

const file = (name) => fs.readFileSync(path.join(DIST, name), 'utf8');
const pathOf = (loc) => new URL(loc).pathname;
const locationPath = (loc) => (loc ? new URL(loc, SITE).pathname : null);

async function main() {
    if (!fs.existsSync(path.join(DIST, 'sitemap.xml'))) throw new Error(`no sitemap.xml in ${DIST}: build game/ first`);
    const sitemap = [...file('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => pathOf(m[1]));
    const notFoundPage = file('404.html');
    const failures = [];
    const fail = (what) => failures.push(what);
    const summary = { sitemapPages: sitemap.length, slashRedirects: 0, appRoutes: 0, notFound: 0 };

    const child = await startHosting();
    try {
        for (const p of sitemap) {
            const plain = await get(p);
            if (plain.status !== 200 || plain.body === notFoundPage) { fail(`${p}: ${plain.status}, expected the page`); continue; }
            if (plain.robots) fail(`${p}: a search page carries X-Robots-Tag ${plain.robots}`);
            if (p === '/') continue;
            const slashed = await get(p + '/');
            if (slashed.status !== 301 || locationPath(slashed.location) !== p) {
                fail(`${p}/: ${slashed.status} ${slashed.location || ''}, expected 301 to ${p}`);
                continue;
            }
            const followed = await get(locationPath(slashed.location));
            if (followed.status !== 200 || followed.body !== plain.body) fail(`${p}/: the redirect does not reach the page`);
            else summary.slashRedirects++;
        }

        for (const [p, page] of APP_ROUTES) {
            const want = file(page);
            const plain = await get(p);
            if (plain.status !== 200 || plain.body !== want) fail(`${p}: ${plain.status}, expected ${page}`);
            if (!/noindex/.test(plain.robots || '')) fail(`${p}: no X-Robots-Tag noindex`);
            // With a slash: the app's page directly, or a 301 to the address without it that serves it.
            let slashed = await get(p + '/');
            if (slashed.status === 301) {
                if (locationPath(slashed.location) !== p) fail(`${p}/: 301 to ${slashed.location}, expected ${p}`);
                slashed = await get(locationPath(slashed.location));
            }
            if (slashed.status !== 200 || slashed.body !== want) fail(`${p}/: ${slashed.status}, expected ${page}`);
            else summary.appRoutes++;
        }

        for (const p of NOT_FOUND) {
            for (const variant of [p, p + '/']) {
                let res = await get(variant);
                if (res.status === 301) res = await get(locationPath(res.location));
                if (res.status !== 404 || res.body !== notFoundPage) fail(`${variant}: ${res.status}, expected the 404 page`);
                else summary.notFound++;
            }
        }
    } finally {
        stop(child);
    }

    summary.ok = failures.length === 0;
    summary.failures = failures;
    console.log(JSON.stringify(summary, null, 2));
    process.exit(summary.ok ? 0 : 1);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
