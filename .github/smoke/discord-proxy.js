#!/usr/bin/env node
// A local stand-in for Discord's Activity proxy, so the game's Discord build can be played and tested
// with no Discord account, app or network.
//
// Inside Discord an Activity is a page at https://<app id>.discordsays.com, in a frame of the Discord
// client. That host is Discord's proxy (Cloudflare Workers): "/" serves the game from its real site and
// each URL mapping of the developer app ("/fb/{sub}" -> "{sub}.firebaseio.com", ...) forwards a path to
// an outside host, WebSockets included. Every response carries Discord's content policy, which lets the
// page reach its own proxy host and almost nothing else: a request the game sends anywhere else is
// refused by the browser ("blocked:csp").
//
// This server does the same on one HTTPS port, for two host names that the test's browser resolves to
// 127.0.0.1 (Chromium's --host-resolver-rules):
//   <app id>.discordsays.com   the Activity: the game's mappings (src/discord/proxy.ts) forwarded to the
//                              Firebase emulators, "/" to a local copy of the site, under CONTENT_POLICY.
//                              "/.proxy/<mapping>" works too, as on Discord.
//   discord.test               the "Discord client": a page with the Activity in a frame, as Discord
//                              shows it (/activity?platform=mobile|desktop&frame_id=...).
// What it forwards to:
//   /fb/{sub}/...      the database emulator, HTTP and WebSocket, under the emulator's project (ns=)
//   /gapi/{sub}/...    the Auth emulator, as {sub}.googleapis.com/...
//   /cf/...            the functions emulator, under the emulator's project
//   /sentry/...        nowhere: answered here and recorded, so a test can see a report reach it
//   anything else      the site (the "/" mapping)
// It uses a self-signed certificate made with openssl; the browser is started with
// --ignore-certificate-errors. Every request is recorded in `events` for the test to read.
//
// What it can't show (it is not Discord): Discord's exact content policy (Discord publishes its rules,
// not the header; CONTENT_POLICY below is stricter than those rules where they are silent, above all
// on inline scripts), the Discord client's frame and its sandbox flags, its Cloudflare Workers' limits
// (time, size, idle WebSockets), the real Firebase and Google hosts behind the proxy (the referrer the
// web key sees, the database's shard host), and Discord's phone apps.
//
// Run alone (to look at it by hand): node .github/smoke/discord-proxy.js [path to dist]
// with the emulators of emulator-game.js running; it prints the addresses to open.

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const net = require('net');
const { execFileSync } = require('child_process');

const APP_ID = '1234567890123456789';
const ACTIVITY_HOST = `${APP_ID}.discordsays.com`;
const CLIENT_HOST = 'discord.test';

/**
 * The content policy of every Activity response. Discord's own rules (developer docs, "URL Mapping >
 * Exceptions" and the change log of July 2025): requests may go to the Activity's own host, any path,
 * and to a few Discord addresses; nothing else. Where the rules say nothing this is the strict choice:
 * no inline script, no eval, no outside fonts, styles or images. Inline styles stay allowed: Angular
 * puts each component's styles in a <style> tag, as every framework Discord's own examples use does.
 */
function contentPolicy(clientOrigin) {
    return [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https://cdn.discordapp.com/avatars/ https://cdn.discordapp.com/icons/ https://media.discordapp.net/",
        "font-src 'self' data:",
        "media-src 'self' data: blob:",
        "connect-src 'self' https://discord.com/api/ https://canary.discord.com/api/ https://ptb.discord.com/api/ https://cdn.discordapp.com/attachments/ https://media.discordapp.net/attachments/",
        "frame-src 'self'",
        "worker-src 'self' blob:",
        "object-src 'none'",
        "base-uri 'self'",
        `frame-ancestors ${clientOrigin}`,
    ].join('; ');
}

/** A self-signed certificate for both host names, made once per run. */
function certificate() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-discord-cert-'));
    const key = path.join(dir, 'key.pem');
    const cert = path.join(dir, 'cert.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', `/CN=${ACTIVITY_HOST}`,
        '-addext', `subjectAltName=DNS:${ACTIVITY_HOST},DNS:*.discordsays.com,DNS:${CLIENT_HOST}`,
        '-keyout', key, '-out', cert], { stdio: 'ignore' });
    return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

/** The Discord client's page: the Activity full screen in a frame, as Discord shows it. */
function clientPage(activityUrl) {
    return `<!doctype html><html><head><meta charset="utf-8"><title>Discord (stand-in)</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;height:100%;background:#313338}iframe{border:0;width:100%;height:100%;display:block}</style></head>
<body><iframe id="activity" src="${activityUrl.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"
 allow="autoplay; encrypted-media; clipboard-write; fullscreen"
 sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals"></iframe></body></html>`;
}

/**
 * Where one Activity path goes: { kind, target } with target an http URL, or null for the site.
 * `to` names the emulators: { db: '127.0.0.1:9000', auth: '127.0.0.1:9099', functions: 'http://127.0.0.1:5001/<project>/us-central1', project }.
 */
function route(urlPath, search, to) {
    const p = urlPath.replace(/^\/\.proxy(?=\/)/, '');
    let m;
    if ((m = /^\/fb\/([\w-]+)(\/.*)?$/.exec(p))) {
        // The real database takes its name from the host ({sub}.firebaseio.com, so the client sends no
        // ns= there); the emulator takes it from ns=, and keeps the game under the emulator's project.
        const q = new URLSearchParams(search);
        q.set('ns', to.project);
        return { kind: 'fb', sub: m[1], target: `http://${to.db}${m[2] || '/'}?${q}` };
    }
    if ((m = /^\/gapi\/([\w-]+)(\/.*)?$/.exec(p))) {
        return { kind: 'gapi', sub: m[1], target: `http://${to.auth}/${m[1]}.googleapis.com${m[2] || '/'}${search}` };
    }
    if ((m = /^\/cf(\/.*)?$/.exec(p))) return { kind: 'cf', target: `${to.functions}${m[1] || '/'}${search}` };
    if ((m = /^\/sentry(\/.*)?$/.exec(p))) return { kind: 'sentry', target: null };
    return { kind: 'site', target: `${to.site}${p}${search}` };
}

/**
 * Starts the stand-in. `to.site` is the local copy of the site (http://127.0.0.1:<port>).
 * Resolves to { server, port, activity(platform, frameId) -> client page URL, events, policy }.
 */
function startDiscordProxy(to) {
    const events = [];
    const { key, cert } = certificate();
    let port;
    const clientOrigin = () => `https://${CLIENT_HOST}:${port}`;
    const hostOf = (req) => String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();

    const server = https.createServer({ key, cert }, (req, res) => {
        const url = new URL(req.url, 'https://x');
        const host = hostOf(req);
        if (host === CLIENT_HOST) {
            const activity = `https://${ACTIVITY_HOST}:${port}/?instance_id=${encodeURIComponent(url.searchParams.get('instance_id') || 'i-test')}` +
                `&frame_id=${encodeURIComponent(url.searchParams.get('frame_id') || 'f-test')}&platform=${encodeURIComponent(url.searchParams.get('platform') || 'desktop')}`;
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(clientPage(activity));
            return;
        }
        if (host !== ACTIVITY_HOST) {
            res.writeHead(421).end('unknown host');
            return;
        }
        const r = route(url.pathname, url.search, to);
        const event = { at: Date.now(), method: req.method, kind: r.kind, path: url.pathname.slice(0, 120) };
        events.push(event);
        const policy = contentPolicy(clientOrigin());
        if (r.kind === 'sentry') {
            const chunks = [];
            req.on('data', (c) => chunks.push(c));
            req.on('end', () => {
                event.body = Buffer.concat(chunks).toString('utf8').slice(0, 2000);
                res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Security-Policy': policy }).end('{"id":"stand-in"}');
            });
            return;
        }
        const target = new URL(r.target);
        const headers = Object.assign({}, req.headers, { host: target.host });
        // The proxy speaks for the page: the outside host sees Discord's host as the origin, as through Discord.
        const upstream = http.request(target, { method: req.method, headers }, (up) => {
            event.status = up.statusCode;
            const out = Object.assign({}, up.headers);
            delete out['content-security-policy'];
            out['content-security-policy'] = policy;
            res.writeHead(up.statusCode, out);
            up.pipe(res);
        });
        upstream.on('error', (e) => {
            event.status = 502;
            event.error = e.message;
            if (!res.headersSent) res.writeHead(502, { 'Content-Security-Policy': policy });
            res.end();
        });
        req.pipe(upstream);
    });

    // WebSockets: only the database's ("/fb/{sub}/.ws"), piped byte for byte to the emulator.
    server.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url, 'https://x');
        const r = hostOf(req) === ACTIVITY_HOST ? route(url.pathname, url.search, to) : { kind: 'none' };
        const event = { at: Date.now(), method: 'WEBSOCKET', kind: r.kind, path: url.pathname.slice(0, 120) };
        events.push(event);
        if (r.kind !== 'fb') {
            event.status = 404;
            socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
            return;
        }
        const target = new URL(r.target);
        const upstream = net.connect(Number(target.port), target.hostname, () => {
            const lines = [`GET ${target.pathname}${target.search} HTTP/1.1`];
            for (let i = 0; i < req.rawHeaders.length; i += 2) {
                const name = req.rawHeaders[i];
                // A reverse proxy's request: the Host is the one it forwards to.
                lines.push(`${name}: ${/^host$/i.test(name) ? target.host : req.rawHeaders[i + 1]}`);
            }
            upstream.write(lines.join('\r\n') + '\r\n\r\n');
            if (head && head.length) upstream.write(head);
            event.status = 101;
            upstream.pipe(socket);
            socket.pipe(upstream);
        });
        const close = () => { socket.destroy(); upstream.destroy(); event.closedAt = Date.now(); };
        upstream.on('error', close);
        socket.on('error', close);
        upstream.on('close', close);
        socket.on('close', close);
    });

    return new Promise((ok) => server.listen(0, '127.0.0.1', () => {
        port = server.address().port;
        ok({
            server, port, events, policy: contentPolicy(clientOrigin()), activityHost: ACTIVITY_HOST,
            activityOrigin: `https://${ACTIVITY_HOST}:${port}`,
            /** The Discord client's page with the Activity in its frame. */
            client: (platform, frameId, instanceId = 'i-test') => `${clientOrigin()}/activity?platform=${platform}&frame_id=${encodeURIComponent(frameId)}&instance_id=${encodeURIComponent(instanceId)}`,
        });
    }));
}

/** Chromium flags: both stand-in names at 127.0.0.1, every other name unresolvable, the test certificate trusted. */
const BROWSER_ARGS = [
    `--host-resolver-rules=MAP ${ACTIVITY_HOST} 127.0.0.1, MAP ${CLIENT_HOST} 127.0.0.1, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`,
    '--ignore-certificate-errors',
];

/**
 * The browser's environment: this one, without a proxy setting. Chromium on Linux takes https_proxy
 * from the environment and would send the stand-in's names (which only its resolver rules know) to that
 * proxy instead; IP addresses like the other local runs' 127.0.0.1 are on no_proxy, these names are not.
 */
const BROWSER_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(https?|all|no)_proxy$/i.test(k)));

module.exports = { startDiscordProxy, route, contentPolicy, BROWSER_ARGS, BROWSER_ENV, APP_ID, ACTIVITY_HOST, CLIENT_HOST };

if (require.main === module) {
    const { serve } = require('./smoke');
    const dist = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'game', 'dist'));
    serve(dist).then(async (site) => {
        const p = await startDiscordProxy({
            site: `http://127.0.0.1:${site.address().port}`, db: '127.0.0.1:9000', auth: '127.0.0.1:9099',
            functions: 'http://127.0.0.1:5001/demo-bullshit/us-central1', project: 'demo-bullshit',
        });
        console.log(`Discord stand-in: ${p.client('desktop', 'f-hand')}\nStart Chromium with: ${BROWSER_ARGS.join(' ')}`);
    });
}
