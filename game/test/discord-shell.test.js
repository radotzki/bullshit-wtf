// The Discord Activity's shell (src/app/portal/discord.ts, the switch in portal.ts): where the page
// runs, the launch parameters, the call's game and where it sends a player (the lobby, the waiting-for-
// rematch screen, "this game is full"), the links that leave the game, and the SDK's buttons with a
// stand-in for Discord's Embedded App SDK. A real Discord call is the one thing this can't show.
// Run: npm test (from game/). Needs Node 20+.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const src = (...p) => path.join(__dirname, '..', 'src', ...p);
function load(file) {
    const out = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 },
    }).outputText;
    const mod = { exports: {} };
    new Function('module', 'exports', 'require', out)(mod, mod.exports, require);
    return mod.exports;
}
const portal = load(src('app', 'portal', 'portal.ts'));
const discord = load(src('app', 'portal', 'discord.ts'));
const proxy = load(src('discord', 'proxy.ts'));
const read = (...p) => fs.readFileSync(src(...p), 'utf8');

const APP_ID = '1300000000000000001';
const LAUNCH = '?instance_id=i-1300000000000000001-gc-111-222&frame_id=f-abc&platform=desktop&guild_id=900&channel_id=901';

// ---------- the switch: site, CrazyGames, Discord ----------

test('the switch: the Activity\'s host or Discord\'s launch parameters, with the app id, is Discord', () => {
    const at = (hostname, pathname, search) => ({ hostname, pathname, search });
    assert.strictEqual(portal.runningInFrom(at('1300000000000000001.discordsays.com', '/', LAUNCH), APP_ID), 'discord');
    // A local run that fakes Discord's launch parameters.
    assert.strictEqual(portal.runningInFrom(at('127.0.0.1', '/', LAUNCH), APP_ID), 'discord');
    assert.strictEqual(portal.runningInFrom(at('1300000000000000001.discordsays.com', '/', ''), APP_ID), 'discord');
    assert.strictEqual(portal.runningInFrom(at('bullshit.wtf', '/portal/crazygames', ''), APP_ID), 'crazygames');
    assert.strictEqual(portal.runningInFrom(at('bullshit.wtf', '/he/portal/crazygames', ''), APP_ID), 'crazygames');
    assert.strictEqual(portal.runningInFrom(at('bullshit.wtf', '/', ''), APP_ID), 'site');
    assert.strictEqual(portal.runningInFrom(at('bullshit.wtf', '/join-game/ABCD', '?via=link'), APP_ID), 'site');
    // One launch parameter alone, or a look-alike host, is the site.
    assert.strictEqual(portal.runningInFrom(at('bullshit.wtf', '/', '?frame_id=x'), APP_ID), 'site');
    assert.strictEqual(portal.runningInFrom(at('discordsays.com.evil.example', '/', ''), APP_ID), 'site');
    assert.strictEqual(portal.runningInFrom(null, APP_ID), 'site');
});

test('the switch: without the app id (the build\'s placeholder) Discord stays the site behind the proxy', () => {
    const env = read('environments', 'environment.prod.ts');
    const placeholder = /discordClientId: '([^']*)'/.exec(env)[1];
    assert.strictEqual(placeholder, 'DISCORD_APP_ID_PLACEHOLDER');
    assert.strictEqual(portal.discordIdReady(placeholder), false);
    assert.strictEqual(portal.discordIdReady(''), false);
    assert.strictEqual(portal.discordIdReady('12345'), false);
    assert.strictEqual(portal.discordIdReady(APP_ID), true);
    const host = { hostname: '1300000000000000001.discordsays.com', pathname: '/', search: LAUNCH };
    assert.strictEqual(portal.runningInFrom(host, placeholder), 'site');
    assert.strictEqual(portal.runningInFrom(host, undefined), 'site');
    // Both environments carry the setting, and where.ts hands it to the switch before the routes are made.
    assert.ok(/discordClientId: 'DISCORD_APP_ID_PLACEHOLDER'/.test(read('environments', 'environment.ts')));
    assert.ok(/useDiscordClientId\(\(environment as any\)\.discordClientId\)/.test(read('app', 'portal', 'where.ts')));
    assert.ok(/from '\.\.\/portal\/where'/.test(read('app', 'app-routing', 'app-routing.module.ts')));
});

test('the launch parameters are kept from the first look, before the router takes them off the address', () => {
    const saved = global.window;
    global.window = { location: { search: LAUNCH, hostname: '127.0.0.1', pathname: '/' } };
    try {
        const fresh = load(src('app', 'portal', 'portal.ts'));
        fresh.useDiscordClientId(APP_ID);
        assert.strictEqual(fresh.launchSearch(), LAUNCH);
        // The router's first navigation: the address loses its query string.
        global.window.location = { search: '', hostname: '127.0.0.1', pathname: '/' };
        assert.strictEqual(fresh.launchSearch(), LAUNCH);
        assert.strictEqual(fresh.runningIn(), 'discord');
        fresh.useDiscordClientId(APP_ID);
        assert.strictEqual(fresh.runningIn(), 'discord', 'decided again, from the kept parameters');
    } finally {
        global.window = saved;
    }
    assert.ok(/launchSearch\(\);\s*useDiscordClientId/.test(read('app', 'portal', 'where.ts')));
});

test('the switch agrees with the proxy start-up on Discord\'s host', () => {
    for (const h of ['1300000000000000001.discordsays.com', 'abc-1.discordsays.com', 'bullshit.wtf', 'discordsays.com', 'x.discordsays.com.example']) {
        const shell = portal.runningInFrom({ hostname: h, pathname: '/', search: '' }, APP_ID) === 'discord';
        assert.strictEqual(shell, proxy.inDiscord(h), h);
    }
});

test('the switch: inPortal is true for both portals; the CrazyGames runtime starts on CrazyGames only', () => {
    portal.setPortalForTest('discord');
    assert.strictEqual(portal.inPortal(), true);
    assert.strictEqual(portal.inDiscordActivity(), true);
    assert.strictEqual(portal.inCrazyGames(), false);
    portal.setPortalForTest(true);
    assert.strictEqual(portal.inCrazyGames(), true);
    assert.strictEqual(portal.inDiscordActivity(), false);
    portal.setPortalForTest(false);
    assert.strictEqual(portal.inPortal(), false);
    portal.setPortalForTest(null);
    assert.ok(/if \(this\.started \|\| !inCrazyGames\(\)\)/.test(read('app', 'portal', 'portal.service.ts')));
    assert.ok(/if \(this\.started \|\| !inDiscordActivity\(\)\)/.test(read('app', 'portal', 'discord.service.ts')));
});

test('the results picture names Discord in Discord, CrazyGames on CrazyGames', () => {
    portal.setPortalForTest('discord');
    assert.strictEqual(portal.portalCardFooter('en'), 'PLAY BULLSHIT IN DISCORD');
    assert.ok(!/bullshit\.wtf/i.test(portal.portalCardFooter('he')));
    portal.setPortalForTest(true);
    assert.strictEqual(portal.portalCardFooter('en'), 'PLAY BULLSHIT ON CRAZYGAMES');
    portal.setPortalForTest(null);
});

// ---------- routes ----------

test('in Discord the portal routes have Discord\'s home, and keep the game\'s screens', () => {
    const routing = read('app', 'app-routing', 'app-routing.module.ts');
    assert.ok(/portalRoutes\(routes, inDiscordActivity\(\) \? DiscordHomeComponent : undefined\)/.test(routing));
    assert.ok(/useHash: inPortal\(\)/.test(routing));
    const routes = read('app', 'portal', 'portal-routes.ts');
    assert.ok(/export function portalRoutes\(routes: Routes, home: Type<any> = PortalHomeComponent\)/.test(routes));
});

// ---------- launch parameters, campaign ----------

test('launch parameters: the instance id, the frame, the server and channel', () => {
    const l = discord.launchFrom(LAUNCH + '&custom_id=test-ana');
    assert.strictEqual(l.instanceId, 'i-1300000000000000001-gc-111-222');
    assert.strictEqual(l.frameId, 'f-abc');
    assert.strictEqual(l.platform, 'desktop');
    assert.strictEqual(l.guildId, '900');
    assert.strictEqual(l.channelId, '901');
    assert.strictEqual(l.customId, 'test-ana');
    const dm = discord.launchFrom('?instance_id=i-2&frame_id=f&platform=mobile');
    assert.strictEqual(dm.guildId, null);
    assert.strictEqual(discord.launchFrom('').instanceId, '');
    assert.strictEqual(discord.launchFrom('?instance_id=%E0%A4%A').instanceId, '');
});

test('campaign: only a play-test tag is sent; the server tags every other game discord-activity', () => {
    assert.strictEqual(discord.discordCampaign(null, LAUNCH), '');
    assert.strictEqual(discord.discordCampaign(null, LAUNCH + '&via=test'), 'test');
    assert.strictEqual(discord.discordCampaign(null, LAUNCH + '&custom_id=test-itay'), 'test-itay');
    assert.strictEqual(discord.discordCampaign('test-kept', LAUNCH), 'test-kept');
    assert.strictEqual(discord.discordCampaign(null, LAUNCH + '&via=fb-he'), '');
    assert.strictEqual(discord.discordCampaign('portal-crazygames', LAUNCH), '');
});

// ---------- where the shell sends a player ----------

test('the call\'s game: its join step and lobby, the waiting-for-rematch screen, or "this game is full"', () => {
    const seats = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}`, { nickname: `n${i}` }]));
    assert.strictEqual(discord.shellStep({ pin: 'ABCD', created: true }, null, null, 12), 'join');
    assert.strictEqual(discord.shellStep({ pin: 'ABCD', created: false }, seats(3), 'old', 12), 'join');
    assert.strictEqual(discord.shellStep({ pin: 'ABCD', created: false }, seats(11), null, 12), 'join');
    // The 13th person in a call.
    assert.strictEqual(discord.shellStep({ pin: 'ABCD', created: false }, seats(12), null, 12), 'full');
    assert.strictEqual(discord.shellStep({ pin: 'ABCD', created: false }, seats(12), 'someone-else', 12), 'full');
    // A phone with a seat in it gets the seat back (the server's join does), full or not.
    assert.strictEqual(discord.shellStep({ pin: 'ABCD', created: false }, seats(12), 'p4', 12), 'join');
    // ended: true (the game finished under 30 minutes ago, no rematch yet): wait, never the old final scores.
    assert.strictEqual(discord.shellStep({ pin: 'ABCD', created: false, ended: true }, seats(3), 'p1', 12), 'ended');
    assert.strictEqual(discord.shellStep({ pin: 'ABCD', created: false, ended: true }, null, null, 12), 'ended');
});

test('the home asks discordTable with the call\'s instance id and language, waits, and follows the call', () => {
    const home = read('app', 'portal', 'discord-home.component.ts');
    assert.ok(/await this\.discord\.ready;/.test(home), 'waits for the SDK (bounded) first');
    assert.ok(/this\.api\.discordTable\(instanceId, this\.t\.lang, this\.campaign\(\)\)/.test(home));
    assert.ok(/this\.router\.navigate\(\['\/join-game', table\.pin\], \{ replaceUrl: true \}\)/.test(home));
    // The waiting screens follow a REMATCH pressed by anyone, and a full game's final scores.
    assert.ok(/getForkGame\(pin\)/.test(home));
    assert.ok(/gameState\(pin\)\.subscribe\(id => id === GameState\.ScoreBoardFinal/.test(home));
    // Its own REMATCH forks the finished game, then asks again (discordTable follows the fork).
    assert.ok(/await this\.api\.fork\(this\.pin\);[\s\S]*this\.go\(\);/.test(home));
    const api = read('app', 'services', 'api.service.ts');
    assert.ok(/this\.post<[^>]+>\(`discordTable`, \{\s*instanceId, locale, uid, hostKey,/.test(api));
    assert.ok(/if \(resp && resp\.created\) \{\s*rememberHostKey\(resp\.pin, hostKey\);/.test(api));
    // A join that finds the game full meanwhile goes back to the home, which says so.
    const join = read('app', 'pages', 'join-game', 'join-game.component.ts');
    assert.ok(/err\.code === 'GAME_IS_FULL' && inDiscordActivity\(\)\) \{\s*this\.router\.navigate\(\['\/'\]/.test(join));
});

// ---------- links ----------

test('links: in-app routes stay; anything that leaves opens in the player\'s browser, the site\'s pages at bullshit.wtf', () => {
    const base = 'https://1300000000000000001.discordsays.com/' + LAUNCH + '#/game-staging/ABCD';
    assert.strictEqual(discord.discordLink('#/join-game/ABCD', base), null);
    assert.strictEqual(discord.discordLink('', base), null);
    assert.strictEqual(discord.discordLink('blob:https://x/1', base), null);
    assert.strictEqual(discord.discordLink('mailto:a@b.c', base), null);
    assert.strictEqual(discord.discordLink('/' + LAUNCH + '#/score-board/ABCD', base), null);
    assert.strictEqual(discord.discordLink('/how-to-play', base), 'https://bullshit.wtf/how-to-play');
    assert.strictEqual(discord.discordLink('/he/how-to-play?via=x', base), 'https://bullshit.wtf/he/how-to-play?via=x');
    assert.strictEqual(discord.discordLink('https://bullshit.wtf/c/crew', base), 'https://bullshit.wtf/c/crew');
    assert.strictEqual(discord.discordLink('https://example.com/a', base), 'https://example.com/a');
    assert.deepStrictEqual(discord.HOW_TO_PLAY, { en: 'https://bullshit.wtf/how-to-play', he: 'https://bullshit.wtf/he/how-to-play' });
});

// ---------- the SDK's buttons, with a stand-in SDK ----------

function fakeSdk(over = {}) {
    const calls = [];
    const sdk = Object.assign({
        instanceId: 'i-1', guildId: '900', clientId: APP_ID,
        ready: async () => { },
        commands: {
            openInviteDialog: async () => { calls.push(['invite']); return null; },
            openExternalLink: async (a) => { calls.push(['link', a.url]); return { opened: true }; },
            openShareMomentDialog: async (a) => { calls.push(['share', a.mediaUrl]); return null; },
        },
    }, over);
    return { sdk, calls };
}

test('INVITE TO THIS CALL opens Discord\'s invite dialog; never in a DM call, never without the SDK', async () => {
    discord.forgetDiscord();
    assert.strictEqual(discord.canInviteToCall(), false);
    assert.strictEqual(await discord.inviteToCall(), false);
    const { sdk, calls } = fakeSdk();
    discord.setDiscordSdk(sdk);
    assert.strictEqual(discord.canInviteToCall(), true);
    assert.strictEqual(await discord.inviteToCall(), true);
    assert.deepStrictEqual(calls, [['invite']]);
    discord.setDiscordSdk(fakeSdk({ guildId: null }).sdk);
    assert.strictEqual(discord.canInviteToCall(), false);
    // Discord refuses (no permission to invite): false, no throw.
    discord.setDiscordSdk(fakeSdk({ commands: { openInviteDialog: async () => { throw new Error('INVALID_PERMISSIONS'); } } }).sdk);
    assert.strictEqual(await discord.inviteToCall(), false);
    discord.forgetDiscord();
});

test('a link out opens through openExternalLink, and does nothing without the SDK', async () => {
    discord.forgetDiscord();
    assert.strictEqual(await discord.openOutside('https://bullshit.wtf/how-to-play'), false);
    const { sdk, calls } = fakeSdk();
    discord.setDiscordSdk(sdk);
    assert.strictEqual(await discord.openOutside('https://bullshit.wtf/how-to-play'), true);
    assert.deepStrictEqual(calls, [['link', 'https://bullshit.wtf/how-to-play']]);
    discord.setDiscordSdk(fakeSdk({ commands: { openExternalLink: async () => ({ opened: false }) } }).sdk);
    assert.strictEqual(await discord.openOutside('https://x.example'), false);
    discord.forgetDiscord();
});

test('the results card: uploaded to Discord, then the share-moment dialog; off until sign-in with Discord', async () => {
    discord.forgetDiscord();
    const { sdk, calls } = fakeSdk();
    discord.setDiscordSdk(sdk);
    let changed = 0;
    discord.onDiscordChange(() => changed++);
    // Stage 1: no Discord sign-in, so no share.
    assert.strictEqual(discord.canShareMoment(), false);
    const fetched = [];
    const fetcher = async (url, init) => {
        fetched.push([url, init.method, init.headers.Authorization]);
        return { ok: true, status: 200, json: async () => ({ attachment: { url: 'https://cdn.discordapp.com/attachments/1/2/bullshit-results.png' } }) };
    };
    const form = () => ({ parts: [], append(...a) { this.parts.push(a); } });
    assert.strictEqual(await discord.shareMoment({ size: 1 }, fetcher, form), false);
    assert.strictEqual(fetched.length, 0);
    // Stage 2: with the player's token.
    discord.setDiscordAccessToken('tok');
    assert.strictEqual(changed, 1);
    assert.strictEqual(discord.canShareMoment(), true);
    assert.strictEqual(await discord.shareMoment({ size: 1 }, fetcher, form), true);
    assert.deepStrictEqual(fetched, [[`https://discord.com/api/applications/${APP_ID}/attachment`, 'POST', 'Bearer tok']]);
    assert.deepStrictEqual(calls, [['share', 'https://cdn.discordapp.com/attachments/1/2/bullshit-results.png']]);
    // An upload Discord refuses: no dialog, no throw.
    const refused = async () => ({ ok: false, status: 401, json: async () => ({}) });
    assert.strictEqual(await discord.shareMoment({ size: 1 }, refused, form), false);
    discord.forgetDiscord();
});

test('the share button is hidden in Discord until sign-in; the invite is Discord\'s one button', () => {
    assert.ok(/html\.bs-discord:not\(\.bs-discord-share\) app-share-results/.test(discord.DISCORD_CSS));
    assert.ok(/html\.bs-discord app-invite > :not\(\.invite-discord\)/.test(discord.DISCORD_CSS));
    assert.ok(/html\.bs-discord app-qr-code/.test(discord.DISCORD_CSS));
    assert.ok(/html\.bs-discord \.whatsapp/.test(discord.DISCORD_CSS));
    // Crews, the big screen and REMIND ME (next week) are hidden by the portal's own look, which Discord adds too.
    const style = read('app', 'portal', 'portal-style.ts');
    for (const sel of ['app-next-week', '.crew-link', '.big-screen-offer', '.save-crew']) {
        assert.ok(style.includes(`html.bs-portal ${sel}`), sel);
    }
    const service = read('app', 'portal', 'discord.service.ts');
    assert.ok(/classList\.add\('bs-portal', 'bs-discord'\)/.test(service));
    assert.ok(/PORTAL_CSS \+ DISCORD_CSS/.test(service));
    const invite = read('app', 'components', 'invite', 'invite.component.html');
    assert.ok(/class="invite-discord"/.test(invite));
    assert.ok(/\*ngIf="canInviteToCall"[^>]*\(click\)="inviteToCall\(\)"/.test(invite));
});

test('the SDK is its own file of the build, loaded only in Discord, and never holds the game back', () => {
    const service = read('app', 'portal', 'discord.service.ts');
    assert.ok(/await import\('@discord\/embedded-app-sdk'\)/.test(service), 'a dynamic import: the site never downloads it');
    assert.ok(/new LaunchedSDK\(discordClientId\(\)/.test(service));
    assert.ok(/await sdk\.ready\(\)/.test(service));
    assert.ok(/setTimeout\(\(\) => this\.settle\(false\), READY_WAIT_MS\)/.test(service));
    assert.ok(discord.READY_WAIT_MS <= 8000);
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    assert.strictEqual(pkg.dependencies['@discord/embedded-app-sdk'], '2.5.0', 'pinned');
    // No other file imports the SDK, so it can't slip into the site's main bundle.
    const offenders = [];
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).forEach(e => {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) return walk(p);
        if (/\.ts$/.test(e.name) && /from '@discord\/embedded-app-sdk'/.test(fs.readFileSync(p, 'utf8'))) offenders.push(p);
    });
    walk(src('app'));
    walk(src('discord'));
    assert.deepStrictEqual(offenders, []);
});

test('the real SDK, with Discord\'s launch parameters faked: it reads the same instance id the shell sends', () => {
    // The package's CommonJS build, in a stand-in window (the SDK reads location.search at start and
    // posts its handshake to the parent frame).
    const posted = [];
    const fakeWindow = {
        location: { search: LAUNCH, href: 'https://1300000000000000001.discordsays.com/' + LAUNCH },
        addEventListener() { }, removeEventListener() { },
    };
    fakeWindow.parent = { postMessage: (m, origin) => posted.push([m, origin]) };
    fakeWindow.opener = null;
    const saved = { window: global.window, document: global.document };
    global.window = fakeWindow;
    global.document = { referrer: '' };
    try {
        const { DiscordSDK } = require('@discord/embedded-app-sdk');
        const sdk = new DiscordSDK(APP_ID, { disableConsoleLogOverride: true });
        assert.strictEqual(sdk.instanceId, discord.launchFrom(LAUNCH).instanceId);
        assert.strictEqual(sdk.guildId, '900');
        assert.strictEqual(sdk.clientId, APP_ID);
        assert.ok(posted.length >= 1, 'the handshake went to the parent frame');
        assert.strictEqual(posted[0][0][1].client_id, APP_ID);
        assert.strictEqual(posted[0][0][1].frame_id, 'f-abc');
        for (const c of ['openInviteDialog', 'openExternalLink', 'openShareMomentDialog']) {
            assert.strictEqual(typeof sdk.commands[c], 'function', c);
        }
        // Without Discord's parameters the SDK refuses to start: the shell catches it and goes on.
        global.window.location = { search: '', href: 'https://x/' };
        assert.throws(() => new DiscordSDK(APP_ID), /frame_id/);
        // The hash router takes the query string off the address before the SDK starts (it loads on its
        // own): the shell's SDK reads the parameters the page loaded with, as discord.service.ts does.
        class LaunchedSDK extends DiscordSDK {
            _getSearch() { return LAUNCH; }
        }
        assert.strictEqual(new LaunchedSDK(APP_ID, { disableConsoleLogOverride: true }).instanceId, discord.launchFrom(LAUNCH).instanceId);
        const service = read('app', 'portal', 'discord.service.ts');
        assert.ok(/class LaunchedSDK extends DiscordSDK \{\s*_getSearch\(\) \{\s*return launchSearch\(\);/.test(service));
        assert.ok(/launchFrom\(launchSearch\(\)\)\.instanceId/.test(service));
    } finally {
        global.window = saved.window;
        global.document = saved.document;
    }
});
