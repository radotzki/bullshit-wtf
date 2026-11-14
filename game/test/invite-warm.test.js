// Warming a game's invite link before the host shares it (src/app/services/invite-warm.ts), and the
// two places that call it (the invite in the lobby, and ShareService.warmInvite).
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
const { warmInviteLink, forgetWarmed, WARM_AGAIN_MS } = load(src('services', 'invite-warm.ts'));

function recorder() {
    const calls = [];
    const f = (url, init) => { calls.push({ url, init }); return Promise.resolve({ type: 'opaque' }); };
    f.calls = calls;
    return f;
}

test('fetches the exact invite address once, no-cors, without cookies, kept alive', () => {
    forgetWarmed();
    const f = recorder();
    const url = 'https://bullshit.wtf/join-game/QBCD?via=link';
    assert.strictEqual(warmInviteLink(url, f, 1000), true);
    assert.strictEqual(f.calls.length, 1);
    assert.strictEqual(f.calls[0].url, url);
    assert.deepStrictEqual(f.calls[0].init, { mode: 'no-cors', credentials: 'omit', keepalive: true, redirect: 'follow' });
    // Opening the sheet a moment later does not fetch again.
    assert.strictEqual(warmInviteLink(url, f, 1000 + 60 * 1000), false);
    assert.strictEqual(f.calls.length, 1);
    // A few minutes on (the CDN keeps a named page 10 minutes), it does.
    assert.strictEqual(warmInviteLink(url, f, 1000 + WARM_AGAIN_MS), true);
    assert.strictEqual(f.calls.length, 2);
    // Another game's link is its own.
    assert.strictEqual(warmInviteLink('https://bullshit.wtf/he/join-game/XYZW?via=link', f, 2000), true);
    assert.strictEqual(f.calls.length, 3);
});

test('never throws and never rejects: a failing or missing fetch is ignored', async () => {
    forgetWarmed();
    let unhandled = 0;
    const onUnhandled = () => unhandled++;
    process.on('unhandledRejection', onUnhandled);
    assert.strictEqual(warmInviteLink('https://bullshit.wtf/join-game/AAAA?via=link', () => Promise.reject(new Error('offline')), 1), true);
    assert.strictEqual(warmInviteLink('https://bullshit.wtf/join-game/BBBB?via=link', () => { throw new Error('blocked'); }, 1), true);
    assert.strictEqual(warmInviteLink('https://bullshit.wtf/join-game/CCCC?via=link', undefined, 1), false);
    assert.strictEqual(warmInviteLink('', recorder(), 1), false);
    await new Promise(r => setTimeout(r, 20));
    process.removeListener('unhandledRejection', onUnhandled);
    assert.strictEqual(unhandled, 0);
});

test('ShareService.warmInvite warms the very link the invite shares (?via=link, /he for Hebrew)', () => {
    const share = fs.readFileSync(src('services', 'share.service.ts'), 'utf8');
    assert.match(share, /warmInviteLink\(this\.inviteUrl\(pin, locale, 'link'\), fetcher\)/);
    const invite = fs.readFileSync(src('components', 'invite', 'invite.component.ts'), 'utf8');
    assert.match(invite, /get linkUrl\(\) \{\s*return this\.shareService\.inviteUrl\(this\.pin, this\.locale, 'link'\);/);
});

test('the lobby warms only on the host\'s phone, once its language is known; the sheet warms on open', () => {
    const invite = fs.readFileSync(src('components', 'invite', 'invite.component.ts'), 'utf8');
    const init = invite.slice(invite.indexOf('ngOnInit()'), invite.indexOf('get pinUpper'));
    assert.match(init, /this\.locale = locale \|\| 'en';[\s\S]*if \(!this\.presenter && this\.apiService\.holdsHostKey\(this\.pin\)\) \{\s*this\.shareService\.warmInvite\(this\.pin, this\.locale\);/);
    const toggle = invite.slice(invite.indexOf('toggle()'), invite.indexOf('async share()'));
    assert.match(toggle, /if \(this\.open\) \{[\s\S]*this\.shareService\.warmInvite\(this\.pin, this\.locale\);/);
});

test('a warm-up counts as nothing: no beacon, no join source, no share is logged by it', () => {
    const warm = fs.readFileSync(src('services', 'invite-warm.ts'), 'utf8');
    assert.doesNotMatch(warm, /bsVisit|markVisit|logShare|track\(|sessionStorage|localStorage|BS_VIA/);
    const share = fs.readFileSync(src('services', 'share.service.ts'), 'utf8');
    const body = share.slice(share.indexOf('warmInvite(pin'), share.indexOf('siteUrl('));
    assert.doesNotMatch(body, /track\(|logShare/);
});
