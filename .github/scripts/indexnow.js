// Tells search engines that use IndexNow (Bing, and the engines that share its index, Yandex,
// Seznam, Naver and others) about the site's pages, once per release, after the site is deployed.
//   node .github/scripts/indexnow.js [--dry-run] [sitemap file]
// The sitemap file defaults to game/dist/sitemap.xml, the one this release just deployed.
//
// What it sends: one POST to https://api.indexnow.org/indexnow with the host bullshit.wtf, the key,
// the key file's address, and every <loc> of the sitemap that is a page of https://bullshit.wtf
// (anything else in the file is left out). Nothing else, and no second request.
//
// The key is not a secret: IndexNow proves the site is ours by reading the key file at the site's
// root, https://bullshit.wtf/<KEY>.txt, whose body is the key. The file is game/src/<KEY>.txt, copied
// into the build by angular.json's assets. Before it sends anything, the script checks that the
// built site holds that file and that the live site serves it (200, text/plain, the key as body).
// If either is missing, it sends nothing.
//
// It never fails a release: whatever goes wrong (no sitemap, the key file not live, a refused or
// timed-out request), it prints a warning and exits 0. The site is already released when it runs.
// --dry-run prints the URLs it would send and sends nothing (no request of any kind).
const fs = require('fs');
const path = require('path');

const HOST = 'bullshit.wtf';
const SITE = 'https://' + HOST;
const KEY = 'e432234c1f11fa1e0e7d54760e33db98';
const KEY_FILE = KEY + '.txt';
const KEY_LOCATION = SITE + '/' + KEY_FILE;
const ENDPOINT = 'https://api.indexnow.org/indexnow';
// IndexNow takes at most 10,000 URLs a request.
const MAX_URLS = 10000;
const TIMEOUT_MS = 15000;

const ROOT = path.join(__dirname, '..', '..');
const DIST = path.join(ROOT, 'game', 'dist');

// Every <loc> of the sitemap that is a page of this site: https, this host exactly, no user, port,
// query or fragment. In the file's order, each once.
function urlsFromSitemap(xml) {
    const seen = new Set();
    for (const m of String(xml).matchAll(/<loc>\s*([^<]*?)\s*<\/loc>/g)) {
        const text = m[1].replace(/&amp;/g, '&');
        let u;
        try {
            u = new URL(text);
        } catch (e) {
            continue;
        }
        if (u.protocol !== 'https:' || u.hostname !== HOST || u.port || u.username || u.password || u.search || u.hash) {
            continue;
        }
        seen.add(u.href);
    }
    return [...seen].slice(0, MAX_URLS);
}

function payload(urls) {
    return { host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: urls };
}

// IndexNow's documented answers.
function explain(status) {
    return {
        200: 'OK: the URLs were received.',
        202: 'Accepted: the URLs were received; the key is still being checked.',
        400: 'Bad request: the request was not understood.',
        403: 'Forbidden: the key was not found or did not match the key file.',
        422: 'Unprocessable: a URL is not of the host, or the key does not match.',
        429: 'Too many requests: sent too often.',
    }[status] || 'Unexpected answer.';
}

// Does the live site serve the key file as IndexNow will read it?
async function keyIsLive(fetchFn) {
    try {
        const res = await fetchFn(KEY_LOCATION, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) });
        const type = res.headers.get('content-type') || '';
        const body = (await res.text()).trim();
        if (res.status !== 200) {
            return { ok: false, why: KEY_LOCATION + ' answered ' + res.status + ', not 200.' };
        }
        if (!/^text\/plain\b/i.test(type)) {
            return { ok: false, why: KEY_LOCATION + ' is served as "' + type + '", not text/plain.' };
        }
        if (body !== KEY) {
            return { ok: false, why: KEY_LOCATION + ' does not hold the key.' };
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, why: 'Could not read ' + KEY_LOCATION + ': ' + (e && e.message || e) + '.' };
    }
}

// Returns what happened, as one of: dry-run, sent, refused, not-sent. Never throws.
async function run({ sitemap = path.join(DIST, 'sitemap.xml'), dist = DIST, dryRun = false, fetchFn = globalThis.fetch, log = console.log } = {}) {
    const warn = text => log('::warning title=IndexNow, nothing sent (the release is not affected)::' + text);
    let xml;
    try {
        xml = fs.readFileSync(sitemap, 'utf8');
    } catch (e) {
        warn('No sitemap at ' + sitemap + '.');
        return 'not-sent';
    }
    const urls = urlsFromSitemap(xml);
    if (urls.length === 0) {
        warn('The sitemap lists no page of ' + SITE + '.');
        return 'not-sent';
    }
    let built;
    try {
        built = fs.readFileSync(path.join(dist, KEY_FILE), 'utf8').trim();
    } catch (e) {
        built = null;
    }
    if (built !== KEY) {
        warn('The built site has no key file ' + KEY_FILE + ' holding the key (game/src/' + KEY_FILE + ' and angular.json\'s assets).');
        return 'not-sent';
    }
    if (dryRun) {
        log('Dry run: would send ' + urls.length + ' URLs to ' + ENDPOINT + ' for ' + HOST + ', key file ' + KEY_LOCATION + ':');
        urls.forEach(u => log('  ' + u));
        return 'dry-run';
    }
    const live = await keyIsLive(fetchFn);
    if (!live.ok) {
        warn(live.why);
        return 'not-sent';
    }
    try {
        const res = await fetchFn(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify(payload(urls)),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (res.status === 200 || res.status === 202) {
            log('IndexNow: sent ' + urls.length + ' URLs of ' + HOST + '. ' + res.status + ' ' + explain(res.status));
            return 'sent';
        }
        log('::warning title=IndexNow refused the URLs (the release is not affected)::' + res.status + ' ' + explain(res.status));
        return 'refused';
    } catch (e) {
        warn('The request to ' + ENDPOINT + ' failed: ' + (e && e.message || e) + '.');
        return 'not-sent';
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const file = args.find(a => a !== '--dry-run');
    // A last guard: whatever happens, the step ends with 0 within a minute.
    const stop = setTimeout(() => {
        console.log('::warning title=IndexNow (the release is not affected)::Gave up after 60 s.');
        process.exit(0);
    }, 60000);
    run({ dryRun, ...(file ? { sitemap: path.resolve(file) } : {}) })
        .catch(e => console.log('::warning title=IndexNow (the release is not affected)::' + (e && e.message || e)))
        .finally(() => {
            clearTimeout(stop);
            process.exit(0);
        });
}

module.exports = { HOST, KEY, KEY_FILE, KEY_LOCATION, ENDPOINT, MAX_URLS, urlsFromSitemap, payload, keyIsLive, run };
