// Game screens leave search by their noindex header, which a search engine can read only on a page
// robots.txt lets it fetch. So: every game screen, and the phone and computer homes (/m, /d), send
// X-Robots-Tag: noindex (firebase.json), and robots.txt (seo/robots.js, written by seo/build-pages.js)
// blocks none of them, nor a home or a search page. Run: npm test (from game/).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const pages = require('../seo/pages');
const daily = require('../seo/daily-page');
const { robotsTxt } = require('../seo/robots');

const GAME = path.join(__dirname, '..');
const ROOT = path.join(GAME, '..');
const SITE = 'https://bullshit.wtf';

// The robots.txt the build really writes: build-pages.js run into an empty folder.
function builtRobots() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-robots-'));
    try {
        execFileSync(process.execPath, [path.join(GAME, 'seo', 'build-pages.js'), dir], { stdio: 'pipe' });
        return fs.readFileSync(path.join(dir, 'robots.txt'), 'utf8');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}
const robots = builtRobots();

// Google's reading of robots.txt: the groups for "*" and for Googlebot, the longest matching rule
// wins, Allow wins a tie; "*" matches anything and a final "$" ends the address.
function groups(txt) {
    const out = [];
    let cur = null;
    let lastWasAgent = false;
    txt.split(/\r?\n/).map(l => l.replace(/#.*/, '').trim()).filter(Boolean).forEach(line => {
        const i = line.indexOf(':');
        const key = line.slice(0, i).trim().toLowerCase();
        const value = line.slice(i + 1).trim();
        if (key === 'user-agent') {
            if (!lastWasAgent) {
                cur = { agents: [], rules: [] };
                out.push(cur);
            }
            cur.agents.push(value.toLowerCase());
            lastWasAgent = true;
            return;
        }
        lastWasAgent = false;
        if (cur && (key === 'allow' || key === 'disallow')) {
            cur.rules.push({ allow: key === 'allow', path: value });
        }
    });
    return out;
}
const ruleRegex = (p) => new RegExp('^' + p.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\?\$$/, '$'));
function allowed(txt, url, agent) {
    const gs = groups(txt);
    const mine = gs.filter(g => g.agents.includes(agent));
    const use = mine.length ? mine : gs.filter(g => g.agents.includes('*'));
    let best = null;
    use.flatMap(g => g.rules).filter(r => r.path !== '' && ruleRegex(r.path).test(url)).forEach(r => {
        if (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow)) {
            best = r;
        }
    });
    return !best || best.allow;
}
const crawlable = (url) => ['googlebot', 'bingbot', 'anybot'].every(a => allowed(robots, url, a));

// The game's screens: each with a game's PIN or a challenge code, and the bare ones.
const SCREENS = ['/game-staging/ABCD', '/round-intro/ABCD', '/show-question/ABCD', '/show-answers/ABCD',
    '/reveal-the-truth/ABCD', '/score-board/ABCD', '/score-board-final/ABCD', '/step/ABCD', '/present-game/ABCD',
    '/c/k3j9', '/he/c/k3j9', '/present-game', '/create-game', '/join-game', '/join-game/ABCD', '/he/join-game/ABCD', '/learn'];
const PHONE_AND_COMPUTER = ['/m', '/d'];
const HOMES = ['/', '/he'];
const SEARCH = pages.map(p => p.path).concat(daily.pages().map(p => p.path));

const hosting = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8')).hosting;
const glob = (g) => new RegExp('^' + g.split(/(\*\*|\*)/).map(p => p === '**' ? '.*' : p === '*' ? '[^/]*' : p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('') + '$');
const match = (r, url) => (r.regex ? new RegExp(r.regex) : glob(r.source)).test(url);
const noindex = (url) => (hosting.headers || []).some(h => match(h, url) && h.headers.some(x => x.key === 'X-Robots-Tag' && /noindex/.test(x.value)));
const rewriteOf = (url) => hosting.rewrites.find(r => match(r, url));

test('every game screen, and /m and /d, send noindex, with or without a trailing slash', () => {
    SCREENS.concat(PHONE_AND_COMPUTER).forEach(u => {
        assert.ok(noindex(u), u);
        assert.ok(noindex(u + '/'), u + '/');
    });
});

test('robots.txt blocks no game screen, so a search engine can fetch it and read its noindex', () => {
    SCREENS.concat(PHONE_AND_COMPUTER).forEach(u => assert.ok(crawlable(u), u));
    assert.ok(!/^\s*disallow\s*:\s*\S/im.test(robots), 'no Disallow line:\n' + robots);
});

test('robots.txt blocks neither home nor any search page, and lists the sitemap', () => {
    assert.ok(SEARCH.length >= 34, SEARCH.length + ' search pages');
    HOMES.concat(SEARCH).forEach(u => {
        assert.ok(crawlable(u), u);
        assert.ok(!noindex(u), u);
    });
    assert.match(robots, new RegExp(`^Sitemap: ${SITE.replace(/\./g, '\\.')}/sitemap\\.xml$`, 'm'));
    assert.ok(crawlable('/sitemap.xml'));
    assert.strictEqual(robots, robotsTxt(SITE));
});

test('/m and /d are the English home page, whose canonical is the home', () => {
    PHONE_AND_COMPUTER.forEach(u => assert.strictEqual((rewriteOf(u) || {}).destination, '/index.html', u));
    const index = fs.readFileSync(path.join(GAME, 'src', 'index.html'), 'utf8');
    assert.match(index, /<link rel="canonical" href="https:\/\/bullshit\.wtf\/">/);
});

// The reader itself: a Disallow over a screen would be caught.
test('the robots reader catches a Disallow line', () => {
    const blocked = 'User-agent: *\nDisallow: /score-board-final/\n\nUser-agent: Googlebot\nDisallow: /m\n';
    assert.ok(!allowed(blocked, '/score-board-final/ABCD', 'anybot'));
    assert.ok(allowed(blocked, '/score-board/ABCD', 'anybot'));
    assert.ok(!allowed(blocked, '/m', 'googlebot'));
    assert.ok(allowed(blocked, '/score-board-final/ABCD', 'googlebot'), 'Googlebot follows its own group only');
    assert.ok(allowed('User-agent: *\nDisallow: /\nAllow: /d\n', '/d', 'anybot'));
    assert.ok(!allowed('User-agent: *\nDisallow: /*ABCD$\n', '/c/ABCD', 'anybot'));
});
