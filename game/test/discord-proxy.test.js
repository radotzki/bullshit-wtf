// Tests for the Discord proxy rewrite (src/discord/proxy.ts and boot.ts): inside Discord every request
// of the page goes to a mapped path on the Activity's own host; anywhere else nothing is touched.
// The rewrite is checked against the Embedded App SDK's own attemptRemap (a copy of SDK 2.5.0's code in
// test/fixtures), so the addresses the page asks for are the ones Discord's proxy expects.
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

function load(file, requireFn = () => ({})) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, requireFn);
    return mod.exports;
}

const SRC = path.join(__dirname, '..', 'src', 'discord');
const proxy = load(path.join(SRC, 'proxy.ts'));
const { URL_MAPPINGS, inDiscord, remap, patchForDiscordProxy } = proxy;
const HOST = '1234567890123456789.discordsays.com';
const PAGE = `https://${HOST}/?instance_id=i-1&frame_id=f-1&platform=desktop`;

// Every address the game reaches outside its own files, as the built client and its libraries form them.
const ADDRESSES = [
    ['wss://bullshit-wtf-prod.firebaseio.com/.ws?v=5&ns=bullshit-wtf-prod', `wss://${HOST}/fb/bullshit-wtf-prod/.ws?v=5&ns=bullshit-wtf-prod`],
    ['wss://s-usc1b-nss-2104.firebaseio.com/.ws?v=5&ns=bullshit-wtf-prod&ls=abc', `wss://${HOST}/fb/s-usc1b-nss-2104/.ws?v=5&ns=bullshit-wtf-prod&ls=abc`],
    ['https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=AIza', `https://${HOST}/gapi/identitytoolkit/v1/accounts:signUp?key=AIza`],
    ['https://securetoken.googleapis.com/v1/token?key=AIza', `https://${HOST}/gapi/securetoken/v1/token?key=AIza`],
    ['https://us-central1-bullshit-wtf-prod.cloudfunctions.net/newGame', `https://${HOST}/cf/newGame`],
    ['https://us-central1-bullshit-wtf-prod.cloudfunctions.net/onJoinGame?x=1', `https://${HOST}/cf/onJoinGame?x=1`],
    ['https://sentry.io/api/144992/store/?sentry_version=7&sentry_key=k', `https://${HOST}/sentry/api/144992/store/?sentry_version=7&sentry_key=k`],
    ['https://bullshit.wtf/assets/og-image.png', `https://${HOST}/assets/og-image.png`],
    ['https://bullshit.wtf/', `https://${HOST}/`],
];

test('each outside address goes to its mapped path on the Activity host', () => {
    for (const [from, to] of ADDRESSES) {
        assert.strictEqual(remap(from, HOST, PAGE), to, from);
    }
});

test('the rewrite gives the same address as the Embedded App SDK', () => {
    const sdk = require('./fixtures/embedded-app-sdk-url');
    // The SDK reads window.location for the host: the Activity's.
    const win = { location: new URL(PAGE) };
    for (const [from] of ADDRESSES) {
        const theirs = sdk.attemptRemap({ url: new URL(from), mappings: URL_MAPPINGS }, win).toString();
        assert.strictEqual(remap(from, HOST, PAGE), theirs, from);
    }
});

test('the page\'s own addresses, relative ones and unmapped hosts are left alone', () => {
    assert.strictEqual(remap('/_v', HOST, PAGE), '/_v');
    assert.strictEqual(remap('main-ABC.js', HOST, PAGE), 'main-ABC.js');
    assert.strictEqual(remap(`https://${HOST}/cf/newGame`, HOST, PAGE), `https://${HOST}/cf/newGame`);
    assert.strictEqual(remap('https://discord.com/api/v10/users/@me', HOST, PAGE), 'https://discord.com/api/v10/users/@me');
    assert.strictEqual(remap('https://fonts.googleapis.com.evil.example/x', HOST, PAGE), 'https://fonts.googleapis.com.evil.example/x');
    // A mapped host named only in the path or the query is not that host.
    assert.strictEqual(remap('https://example.com/sentry.io/x', HOST, PAGE), 'https://example.com/sentry.io/x');
    // The dev project's functions host has no mapping (the Discord app points at production).
    assert.strictEqual(remap('https://us-central1-bullshit-wtf-dev.cloudfunctions.net/newGame', HOST, PAGE),
        'https://us-central1-bullshit-wtf-dev.cloudfunctions.net/newGame');
});

test('"/" is the last mapping, so every other prefix is reachable', () => {
    assert.strictEqual(URL_MAPPINGS[URL_MAPPINGS.length - 1].prefix, '/');
    assert.deepStrictEqual(URL_MAPPINGS.map((m) => m.prefix), ['/fb/{sub}', '/gapi/{sub}', '/cf', '/sentry', '/']);
});

test('only an Activity host counts as inside Discord', () => {
    assert.strictEqual(inDiscord(HOST), true);
    assert.strictEqual(inDiscord('1263102905548800001.discordsays.com'), true);
    for (const h of ['bullshit.wtf', 'www.bullshit.wtf', 'bullshit-wtf-prod.web.app', 'localhost', '127.0.0.1',
        'discordsays.com', 'evil.discordsays.com.example', 'discord.com', '']) {
        assert.strictEqual(inDiscord(h), false, h);
    }
});

/** A stand-in window: records the address each fetch, socket and request is opened with. */
function fakeWindow(href) {
    const seen = [];
    class Request { constructor(url, init) { this.url = String(url); this.init = init; } }
    class WebSocket { constructor(url, protocols) { this.url = url; this.protocols = protocols; seen.push(['ws', url]); } }
    WebSocket.OPEN = 1;
    function XMLHttpRequest() { }
    XMLHttpRequest.prototype.open = function (method, url) { seen.push(['xhr', url]); };
    const link = (attrs) => ({ media: 'print', attrs,
        getAttribute(n) { return this.attrs[n]; }, removeAttribute(n) { delete this.attrs[n]; } });
    // The game's stylesheet (Angular's critical-CSS step) and the icons' (index.html, data-bs-later).
    const links = [link({ 'data-beasties-media': 'all' }), link({ 'data-bs-later': '' })];
    const scripts = [];
    const root = { attrs: {}, setAttribute(n, v) { this.attrs[n] = v; } };
    const document = {
        links, scripts, documentElement: root,
        querySelectorAll: (sel) => {
            const attr = { 'link[data-beasties-media]': 'data-beasties-media', 'link[data-bs-later]': 'data-bs-later' }[sel];
            return attr ? links.filter((l) => attr in l.attrs) : [];
        },
        createElement: (tag) => ({ tag }),
        head: { appendChild: (el) => scripts.push(el) },
    };
    const win = {
        location: new URL(href), URL, Request, WebSocket, XMLHttpRequest, seen, document,
        fetch(input) { seen.push(['fetch', input instanceof Request ? input.url : String(input)]); return Promise.resolve(); },
    };
    return win;
}

test('patched: fetch, WebSocket and XMLHttpRequest go through the proxy', () => {
    const win = fakeWindow(PAGE);
    const RealWS = win.WebSocket;
    assert.strictEqual(patchForDiscordProxy(win), true);
    win.fetch('https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=k');
    win.fetch(new win.Request('https://sentry.io/api/1/store/'));
    win.fetch('/_v');
    const ws = new win.WebSocket('wss://bullshit-wtf-prod.firebaseio.com/.ws?v=5');
    const xhr = new win.XMLHttpRequest();
    xhr.open('POST', 'https://us-central1-bullshit-wtf-prod.cloudfunctions.net/newGame');
    assert.deepStrictEqual(win.seen, [
        ['fetch', `https://${HOST}/gapi/identitytoolkit/v1/accounts:signUp?key=k`],
        ['fetch', `https://${HOST}/sentry/api/1/store/`],
        ['fetch', '/_v'],
        ['ws', `wss://${HOST}/fb/bullshit-wtf-prod/.ws?v=5`],
        ['xhr', `https://${HOST}/cf/newGame`],
    ]);
    // Code that checks the socket's type or its state names still works.
    assert.ok(ws instanceof win.WebSocket && ws instanceof RealWS);
    assert.strictEqual(win.WebSocket.OPEN, 1);
});

test('boot: on the site and anywhere off Discord, nothing is patched', () => {
    for (const href of ['https://bullshit.wtf/', 'https://bullshit.wtf/?frame_id=x&instance_id=y', 'http://127.0.0.1:4200/m']) {
        const win = fakeWindow(href);
        const before = { fetch: win.fetch, WebSocket: win.WebSocket, open: win.XMLHttpRequest.prototype.open };
        global.window = win;
        try {
            load(path.join(SRC, 'boot.ts'), (m) => (m === './proxy' ? proxy : {}));
        } finally {
            delete global.window;
        }
        assert.strictEqual(win.fetch, before.fetch, href);
        assert.strictEqual(win.WebSocket, before.WebSocket, href);
        assert.strictEqual(win.XMLHttpRequest.prototype.open, before.open, href);
        assert.strictEqual(win.bsDiscordProxy, undefined, href);
        assert.strictEqual(win.document.links[0].media, 'print', `${href}: the inline script turns the stylesheet on, as before`);
        assert.strictEqual(win.document.links[1].media, 'print', `${href}: the icons' inline onload turns them on, as before`);
        assert.deepStrictEqual(win.document.scripts, [], `${href}: the inline beacon alone counts the visit`);
        assert.deepStrictEqual(win.document.documentElement.attrs, {}, `${href}: not marked as Discord`);
    }
});

test('boot: inside Discord the page is patched and marked', () => {
    const win = fakeWindow(PAGE);
    global.window = win;
    try {
        load(path.join(SRC, 'boot.ts'), (m) => (m === './proxy' ? proxy : {}));
    } finally {
        delete global.window;
    }
    assert.strictEqual(win.bsDiscordProxy, true);
    // The stylesheets are on without the inline script and onload, which Discord's content policy may refuse.
    assert.strictEqual(win.document.links[0].media, 'all');
    assert.strictEqual(win.document.links[1].media, 'all', 'the icons');
    // Marked for the Discord styles (the background photo from the game's own files).
    assert.ok('data-bs-discord' in win.document.documentElement.attrs);
    // The visit beacon did not run inline (no bsVisit): its file is loaded, once.
    assert.deepStrictEqual(win.document.scripts.map((el) => [el.tag, el.src]), [['script', '/visit-beacon.js']]);
    new win.WebSocket('wss://bullshit-wtf-prod.firebaseio.com/.ws');
    assert.deepStrictEqual(win.seen, [['ws', `wss://${HOST}/fb/bullshit-wtf-prod/.ws`]]);
});

test('boot: inside Discord, where the inline beacon did run, its file is not loaded again', () => {
    const win = fakeWindow(PAGE);
    win.bsVisit = () => { };
    global.window = win;
    try {
        load(path.join(SRC, 'boot.ts'), (m) => (m === './proxy' ? proxy : {}));
    } finally {
        delete global.window;
    }
    assert.strictEqual(win.bsDiscordProxy, true);
    assert.deepStrictEqual(win.document.scripts, [], 'no second beacon, so no visit counted twice');
});

test('the polyfills run the boot first, before zone.js and the app', () => {
    const angular = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'angular.json'), 'utf8'));
    const polyfills = angular.projects.client.architect.build.options.polyfills;
    assert.strictEqual(polyfills[0], 'src/discord/boot.ts');
});

test('the database stays on WebSockets inside Discord', () => {
    const api = fs.readFileSync(path.join(__dirname, '..', 'src', 'app', 'services', 'api.service.ts'), 'utf8');
    const init = api.indexOf('initializeApp(');
    const force = api.indexOf('forceWebSockets();');
    assert.ok(force > init, 'forceWebSockets() is called after initializeApp');
    assert.ok(api.indexOf('.database()') > force, 'and before the first database use');
    assert.match(api.slice(init, force), /bsDiscordProxy === true/);
});

test('the beacon file is the page\'s own beacon, word for word', () => {
    const { beacon, FILE } = require('../scripts/build-visit-file');
    const index = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.html'), 'utf8');
    const inline = /<!-- BS:VISIT:START -->\s*<script>([\s\S]*?)<\/script>\s*<!-- BS:VISIT:END -->/.exec(index)[1];
    assert.strictEqual(beacon(index).trim(), inline.trim());
    assert.strictEqual(FILE, 'visit-beacon.js');
    // boot.ts loads it by that name, and Hosting serves it uncached, like the pages.
    assert.match(fs.readFileSync(path.join(SRC, 'boot.ts'), 'utf8'), /'\/visit-beacon\.js'/);
    const hosting = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'firebase.json'), 'utf8')).hosting;
    const rule = hosting.headers.find((h) => h.source === '/visit-beacon.js');
    assert.ok(rule && rule.headers.some((h) => h.key === 'Cache-Control' && h.value === 'no-cache'));
    // The build writes it.
    assert.match(JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).scripts.build, /node scripts\/build-visit-file\.js/);
});
