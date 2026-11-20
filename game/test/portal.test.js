// The CrazyGames version (src/app/portal/portal.ts) and its path in firebase.json: framed only by
// CrazyGames, its games tagged, its invites CrazyGames' own, and no link out to the playable site.
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = (...p) => path.join(__dirname, '..', 'src', 'app', ...p);
function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2015 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}
const portal = load(src('portal', 'portal.ts'));
const hosting = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'firebase.json'), 'utf8')).hosting;

function globToRegExp(glob) {
    const re = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\u0001').replace(/\*\*/g, '\u0002').replace(/\*/g, '[^/]*')
        .replace(/\u0001/g, '(?:.*/)?').replace(/\u0002/g, '.*');
    return new RegExp('^' + re + '$');
}
/** Every header firebase.json sends on a path: [key, value] pairs, in order. */
function headersOf(p) {
    const out = [];
    for (const rule of hosting.headers) {
        const re = rule.regex ? new RegExp(rule.regex) : globToRegExp(rule.source);
        if (re.test(p)) {
            rule.headers.forEach(h => out.push([h.key.toLowerCase(), h.value]));
        }
    }
    return out;
}
/** The file a path is rewritten to, or null. */
function rewriteOf(p) {
    for (const rule of hosting.rewrites) {
        const re = rule.regex ? new RegExp(rule.regex) : globToRegExp(rule.source);
        if (re.test(p)) {
            return rule.destination || ('function:' + rule.function);
        }
    }
    return null;
}

test('the portal paths serve the app, Hebrew from he.html', () => {
    assert.strictEqual(rewriteOf('/portal/crazygames'), '/index.html');
    assert.strictEqual(rewriteOf('/he/portal/crazygames'), '/he.html');
    assert.strictEqual(rewriteOf('/portal/other'), null);
});

test('only CrazyGames (and the site) may frame the portal, and only the portal', () => {
    for (const p of ['/portal/crazygames', '/he/portal/crazygames']) {
        const csp = headersOf(p).filter(([k]) => k === 'content-security-policy').map(([, v]) => v);
        // One policy only: a second frame-ancestors (the frame-blocking change for every other page)
        // would be enforced as well and block CrazyGames. Leave the portal path out of it.
        assert.strictEqual(csp.length, 1, p + ': ' + JSON.stringify(csp));
        assert.match(csp[0], /frame-ancestors 'self' https:\/\/crazygames\.com https:\/\/\*\.crazygames\.com/);
        assert.ok(headersOf(p).some(([k, v]) => k === 'x-robots-tag' && v === 'noindex'), p + ' is noindex');
        assert.ok(headersOf(p).some(([k, v]) => k === 'cache-control' && v === 'no-cache'), p + ' is no-cache');
    }
    // Nothing else of the site is opened to CrazyGames.
    for (const p of ['/', '/he', '/create-game', '/join-game/ABCD', '/game-staging/ABCD', '/portal/crazygames/extra']) {
        assert.ok(!headersOf(p).some(([, v]) => /crazygames/.test(v)), p);
    }
});

test('the portal is told by its path alone', () => {
    for (const p of ['/portal/crazygames', '/portal/crazygames/', '/he/portal/crazygames']) {
        assert.strictEqual(portal.isPortalPath(p), true, p);
    }
    for (const p of ['/', '/he', '/portal', '/portal/crazygames/x', '/join-game/ABCD', '', null]) {
        assert.strictEqual(portal.isPortalPath(p), false, String(p));
    }
});

test('portal games carry the portal tag; a play-test stays a test', () => {
    assert.strictEqual(portal.portalCampaign(null, '?via=portal-crazygames'), 'portal-crazygames');
    assert.strictEqual(portal.portalCampaign(null, ''), 'portal-crazygames');
    // A post tag kept from earlier in the tab doesn't count here: the game is the portal's.
    assert.strictEqual(portal.portalCampaign('fb-he-hanukkah', ''), 'portal-crazygames');
    assert.strictEqual(portal.portalCampaign(null, '?via=test-cg'), 'test-cg');
    assert.strictEqual(portal.portalCampaign('test', '?via=portal-crazygames'), 'test');
});

test('language: Hebrew for a Hebrew CrazyGames locale or the Hebrew path, else English', () => {
    assert.strictEqual(portal.portalLocale('he-IL', '/portal/crazygames'), 'he');
    assert.strictEqual(portal.portalLocale('iw', '/portal/crazygames'), 'he');
    assert.strictEqual(portal.portalLocale('en-US', '/he/portal/crazygames'), 'he');
    assert.strictEqual(portal.portalLocale('fr-FR', '/portal/crazygames'), 'en');
    assert.strictEqual(portal.portalLocale(undefined, '/portal/crazygames'), 'en');
});

test('the CrazyGames username becomes the nickname, cut as the join page cuts it', () => {
    assert.strictEqual(portal.portalNickname('  Cool   Cat '), 'Cool Cat');
    assert.strictEqual(portal.portalNickname('SuperLongUsername'), 'SuperLong');
    assert.strictEqual(portal.portalNickname(null), '');
});

test('an invite opens only a real PIN', () => {
    assert.strictEqual(portal.invitePin('abcd'), 'ABCD');
    assert.strictEqual(portal.invitePin(' JVAA '), 'JVAA');
    for (const bad of ['12', 'AB-CD', '', null, '<script>', 'ABCDEFGHIJKLMN']) {
        assert.strictEqual(portal.invitePin(bad), null, String(bad));
    }
});

test('no link leaves for the playable site; CrazyGames, WhatsApp and in-app routes stay', () => {
    const base = 'https://bullshit.wtf/portal/crazygames?via=portal-crazygames#/score-board-final/ABCD';
    for (const out of ['/daily?via=daily-game', '/he/daily', '/c/k7m2', '/how-to-play', 'https://bullshit.wtf/?via=results',
        'https://bullshit.wtf/join-game/ABCD?via=link', 'https://www.google.com/calendar/render?x=1', 'http://example.com/']) {
        assert.strictEqual(portal.blockedLink(out, base), true, out);
    }
    for (const stay of ['#/join-game/ABCD', 'https://www.crazygames.com/game/bullshit?roomId=ABCD', 'https://crazygames.com/',
        'https://wa.me/?text=hi', 'https://api.whatsapp.com/send?text=hi', 'blob:https://bullshit.wtf/1234', 'mailto:a@b.c', '', null,
        'https://bullshit.wtf/portal/crazygames?via=portal-crazygames#/create-game']) {
        assert.strictEqual(portal.blockedLink(stay, base), false, String(stay));
    }
});

test('CrazyGames hears gameplay only while a question is on', () => {
    for (const r of ['/round-intro/ABCD', '/show-question/ABCD', '/show-answers/ABCD', '/reveal-the-truth/ABCD', '/score-board/ABCD']) {
        assert.strictEqual(portal.gameplayFor(r), 'play', r);
    }
    for (const r of ['/', '/create-game', '/join-game/ABCD', '/game-staging/ABCD', '/score-board-final/ABCD']) {
        assert.strictEqual(portal.gameplayFor(r), 'stop', r);
    }
});

test('rooms: joinable from the join step to the last question, closed on the final scoreboard', () => {
    assert.deepStrictEqual(portal.roomFor('/join-game/abcd?via=link'), { pin: 'ABCD', joinable: true });
    assert.deepStrictEqual(portal.roomFor('/game-staging/ABCD'), { pin: 'ABCD', joinable: true });
    assert.deepStrictEqual(portal.roomFor('/show-question/ABCD'), { pin: 'ABCD', joinable: true });
    assert.deepStrictEqual(portal.roomFor('/score-board-final/ABCD'), { pin: 'ABCD', joinable: false });
    assert.strictEqual(portal.roomFor('/'), null);
    assert.strictEqual(portal.roomFor('/create-game'), null);
    assert.strictEqual(portal.roomFor('/join-game'), null);
});

test('invite links: CrazyGames\' own, made once per game, sync or promised', async () => {
    portal.forgetInvites();
    assert.strictEqual(portal.portalInviteUrl('ABCD'), '', 'no SDK: no link');
    let calls = 0;
    portal.setInviteMaker(pin => { calls++; return 'https://www.crazygames.com/game/bullshit?roomId=' + pin; });
    assert.strictEqual(portal.portalInviteUrl('abcd'), 'https://www.crazygames.com/game/bullshit?roomId=ABCD');
    portal.portalInviteUrl('ABCD');
    assert.strictEqual(calls, 1);

    portal.forgetInvites();
    let changed = 0;
    portal.setInviteMaker(pin => Promise.resolve('https://cg.example/' + pin), () => changed++);
    assert.strictEqual(portal.portalInviteUrl('WXYZ'), '');
    await new Promise(r => setTimeout(r, 0));
    assert.strictEqual(portal.portalInviteUrl('WXYZ'), 'https://cg.example/WXYZ');
    assert.strictEqual(changed, 1);
    portal.forgetInvites();
});

test('the portal\'s share texts send no one to bullshit.wtf', () => {
    for (const lang of ['en', 'he']) {
        const s = portal.PORTAL_SHARE_STRINGS[lang];
        for (const text of [s.inviteText('ABCD'), s.resultsText(1, 4, 900), s.resultsText(2, 4, 700), s.groupResultsText('ann', 900),
            portal.PORTAL_CARD_FOOTER[lang]]) {
            assert.ok(!/bullshit\.wtf/i.test(text), text);
        }
    }
});

test('the site keeps its own links: ShareService changes only inside the portal', () => {
    const share = fs.readFileSync(src('services', 'share.service.ts'), 'utf8');
    // Each portal branch is behind inPortal().
    assert.ok(/if \(inPortal\(\)\) \{\s*\/\/[^\n]*\n\s*return portalInviteUrl\(pin\);/.test(share));
    assert.ok(/if \(inPortal\(\)\) \{\s*\/\/[^\n]*\n\s*return portalGameLink\(\);/.test(share));
    assert.ok(/if \(!pin \|\| inPortal\(\)\)/.test(share));
    portal.setPortalForTest(null);
    assert.strictEqual(portal.inPortal(), false, 'Node has no window: not the portal');
});

test('on a computer the portal lobby puts the QR code beside the buttons; phones keep one column', () => {
    const { PORTAL_CSS } = load(src('portal', 'portal-style.ts'));
    const wide = PORTAL_CSS.match(/@media \(min-width: (\d+)px\) and \(orientation: landscape\) \{([\s\S]*)\}\s*$/);
    assert.ok(wide, 'a wide, landscape media rule');
    // A phone, even turned sideways (844 x 390 and the like), is narrower than the rule.
    assert.ok(Number(wide[1]) > 844 && Number(wide[1]) <= 1024, wide[1]);
    const rules = wide[2];
    assert.match(rules, /html\.bs-portal \.invite-inline \{[^}]*display: grid !important/);
    assert.match(rules, /\.invite-inline > \.qr \{[^}]*grid-column: 2/);
    assert.match(rules, /\.invite-inline > \.button \{[^}]*grid-column: 1/);
    // Nothing outside the media rule touches the invite.
    assert.doesNotMatch(PORTAL_CSS.slice(0, wide.index), /invite-inline/);
});
