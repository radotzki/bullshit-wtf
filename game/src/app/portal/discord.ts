/**
 * The game as a Discord Activity: the shell (rows 2 and 4 of the team's spec, "Bullshit as a Discord
 * Activity"). Everything that is decided rather than drawn is here, free of Angular and of imports, so
 * test/discord-shell.test.js can run it in Node with a stand-in for Discord's SDK.
 *
 * - Where: portal.ts's switch says 'discord' (the Activity's host or Discord's launch parameters, and a
 *   build with the app's id). The portal way then holds: hash routing, the portal's route list.
 * - Start: DiscordService starts the Embedded App SDK and waits for ready() (at most READY_WAIT_MS).
 * - The call's game: DiscordHomeComponent asks the discordTable function for the game of the call's
 *   instance id, in the player's language, and sends the player to its join step, then the lobby
 *   (shellStep: or the waiting-for-rematch screen, or the "this game is full" one).
 * - Buttons: INVITE TO THIS CALL is the SDK's openInviteDialog; the results card goes to the
 *   channel with openShareMomentDialog (it needs the player's Discord sign-in, stage 2: until then
 *   that button is hidden); a link that must leave the game (how to play) opens in the player's
 *   browser with openExternalLink. Crews, the QR code, WhatsApp, the big screen and REMIND ME are
 *   hidden (DISCORD_CSS).
 */

/** The SDK must not hold the game back: past this, the shell goes on without it. */
export const READY_WAIT_MS = 5000;

/** The site, for links that leave the game (they open in the player's browser). */
export const SITE = 'https://bullshit.wtf';
/** The page "how to play" opens, by language. */
export const HOW_TO_PLAY = { en: `${SITE}/how-to-play`, he: `${SITE}/he/how-to-play` };

// ---------- launch parameters ----------

export interface DiscordLaunch {
    instanceId: string;
    frameId: string;
    platform: string;
    guildId: string | null;
    channelId: string | null;
    customId: string | null;
}

function param(search: string, name: string): string | null {
    const m = new RegExp(`[?&]${name}=([^&#]*)`).exec(search || '');
    if (!m) {
        return null;
    }
    try {
        const v = decodeURIComponent(m[1].replace(/\+/g, ' ')).trim();
        return v || null;
    } catch (e) {
        return null;
    }
}

/** Discord's launch parameters from the Activity's address (what the SDK reads at start). */
export function launchFrom(search: string | null | undefined): DiscordLaunch {
    const s = String(search || '');
    return {
        instanceId: param(s, 'instance_id') || '',
        frameId: param(s, 'frame_id') || '',
        platform: param(s, 'platform') || '',
        guildId: param(s, 'guild_id'),
        channelId: param(s, 'channel_id'),
        customId: param(s, 'custom_id'),
    };
}

/** A play-test tag (`test`, `test-<name>`): the same rule as isTestTag in join-source.ts. */
function isTestTag(tag: string | null | undefined): boolean {
    return /^test(-|$)/.test(tag || '');
}

/**
 * The campaign sent with the call's game: a play-test tag only (?via=test on the Activity's address, a
 * Discord link's custom_id=test, or kept from earlier in the tab), so tests stay out of the counts.
 * Anything else is '' and the server tags the game `discord-activity`.
 */
export function discordCampaign(kept: string | null | undefined, search: string | null | undefined): string {
    const via = String(param(String(search || ''), 'via') || '').toLowerCase();
    if (isTestTag(via)) {
        return via;
    }
    const custom = String(launchFrom(search).customId || '').toLowerCase();
    if (isTestTag(custom)) {
        return custom;
    }
    return isTestTag(kept) ? String(kept) : '';
}

// ---------- links ----------

/**
 * What a tap on a link does in Discord: null, the app handles it (an in-app route, a blob: download,
 * a WhatsApp or mail link the page hides anyway); else the address to open in the player's browser
 * with openExternalLink. A page of this site (a path on the Activity's host, which Discord's "/" mapping
 * serves from bullshit.wtf) opens at bullshit.wtf: navigating the frame would leave the game.
 */
export function discordLink(href: string | null | undefined, base: string): string | null {
    const raw = String(href || '').trim();
    if (!raw || raw.charAt(0) === '#') {
        return null;
    }
    let url: URL;
    let here: URL;
    try {
        url = new URL(raw, base);
        here = new URL(base);
    } catch (e) {
        return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return null;
    }
    if (url.origin === here.origin) {
        // The same page with another hash: an in-app route.
        if (url.pathname === here.pathname && url.search === here.search) {
            return null;
        }
        return SITE + url.pathname + url.search + url.hash;
    }
    return url.toString();
}

// ---------- the call's game ----------

/** discordTable's answer (functions/src/controllers/discord-table.ts). */
export interface CallTable {
    pin: string;
    created?: boolean;
    ended?: boolean;
}

export type ShellStep = 'join' | 'ended' | 'full';

/**
 * Where the shell sends this player for the call's game:
 * - 'ended': the call's game just finished and nobody has pressed REMATCH yet. The player waits on a
 *   screen of its own, with its own REMATCH button, not on old final scores they never played;
 * - 'full': the game has its 12 players and this phone has no seat in it (the 13th person in a call):
 *   a clear "this game is full" screen that waits for the next game;
 * - 'join': the game's join step, then its lobby (a game under way takes latecomers at 0 points).
 */
export function shellStep(table: CallTable, players: { [pid: string]: any } | null | undefined, myPid: string | null | undefined,
    maxPlayers: number): ShellStep {
    if (table && table.ended) {
        return 'ended';
    }
    const seats = players || {};
    if (myPid && seats[myPid]) {
        return 'join';
    }
    return Object.keys(seats).length >= maxPlayers ? 'full' : 'join';
}

// ---------- the SDK ----------
// DiscordService hands the started SDK over here; the buttons call it through these functions.

/** The parts of the Embedded App SDK the shell uses (@discord/embedded-app-sdk 2.5.0). */
export interface DiscordSdkLike {
    instanceId: string;
    guildId: string | null;
    clientId?: string;
    ready(): Promise<void>;
    commands: {
        openInviteDialog(): Promise<any>;
        openExternalLink(args: { url: string }): Promise<{ opened: boolean | null }>;
        openShareMomentDialog(args: { mediaUrl: string }): Promise<any>;
        setOrientationLockState?(args: {
            lock_state: number; picture_in_picture_lock_state?: number | null; grid_lock_state?: number | null;
        }): Promise<any>;
    };
    subscribe?(event: string, listener: (data: any) => unknown): Promise<any>;
}

let sdk: DiscordSdkLike | null = null;
let accessToken = '';
const changes: Array<() => void> = [];

/** Set once the SDK is ready (null: not in Discord, no app id, or the SDK never became ready). */
export function setDiscordSdk(started: DiscordSdkLike | null) {
    sdk = started;
    changes.slice().forEach(f => f());
}

export function discordSdk(): DiscordSdkLike | null {
    return sdk;
}

/** Called when the SDK or the sign-in changes (the buttons show or hide). */
export function onDiscordChange(listener: () => void): () => void {
    changes.push(listener);
    return () => {
        const i = changes.indexOf(listener);
        if (i >= 0) {
            changes.splice(i, 1);
        }
    };
}

/**
 * The player's Discord access token, from sign-in with Discord (stage 2, spec row 9). Stage 1 has no
 * sign-in, so it stays '' and the results card's share stays hidden in Discord.
 */
export function setDiscordAccessToken(token: string | null | undefined) {
    accessToken = typeof token === 'string' ? token : '';
    changes.slice().forEach(f => f());
}

/**
 * INVITE TO THIS CALL: only with the SDK ready, and in a server's voice channel. Discord refuses the
 * invite dialog in a DM or group DM call (no guild id: RPCError INVALID_CHANNEL); there everyone in the
 * call already sees the Activity's Join button.
 */
export function canInviteToCall(): boolean {
    return !!sdk && !!sdk.guildId;
}

/** Opens Discord's invite dialog. Resolves to whether it opened; never throws. */
export async function inviteToCall(): Promise<boolean> {
    if (!canInviteToCall()) {
        return false;
    }
    try {
        await sdk.commands.openInviteDialog();
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Opens a link in the player's browser (Discord asks the player first). Without the SDK it does
 * nothing: a frame in Discord can't open a window of its own. Never throws.
 */
export async function openOutside(url: string): Promise<boolean> {
    if (!sdk || !url) {
        return false;
    }
    try {
        const r = await sdk.commands.openExternalLink({ url });
        return !(r && r.opened === false);
    } catch (e) {
        return false;
    }
}

/** The results card can go to the channel: the SDK, and the player's Discord sign-in (stage 2). */
export function canShareMoment(): boolean {
    return !!sdk && !!accessToken && !!sdk.clientId;
}

type FetchLike = (url: string, init: any) => Promise<{ ok: boolean; status: number; json(): Promise<any> }>;

/**
 * The results card into the channel: Discord's share-moment dialog takes only a picture on Discord's
 * own CDN, so the picture is first uploaded as the app's attachment (Discord's API, with the player's
 * access token; Discord's own API needs no URL mapping), then the dialog opens with its address.
 * Resolves to whether the dialog opened; never throws.
 */
export async function shareMoment(picture: Blob, fetcher: FetchLike, makeForm: () => FormData = () => new FormData()): Promise<boolean> {
    if (!canShareMoment() || !picture) {
        return false;
    }
    try {
        const form = makeForm();
        form.append('file', picture, 'bullshit-results.png');
        const resp = await fetcher(`https://discord.com/api/applications/${sdk.clientId}/attachment`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${accessToken}` },
            body: form,
        });
        if (!resp.ok) {
            return false;
        }
        const body = await resp.json();
        const mediaUrl = body && body.attachment && body.attachment.url;
        if (typeof mediaUrl !== 'string' || !mediaUrl) {
            return false;
        }
        await sdk.commands.openShareMomentDialog({ mediaUrl });
        return true;
    } catch (e) {
        return false;
    }
}

/** For tests only. */
export function forgetDiscord() {
    sdk = null;
    accessToken = '';
    changes.splice(0, changes.length);
}

// ---------- words ----------

export const DISCORD_STRINGS = {
    en: {
        dir: 'ltr', lang: 'en',
        title: 'BULLSHIT',
        finding: 'Finding your call\'s game…',
        endedTitle: 'That game just ended',
        endedLine: 'Your friends are on the final scores. Wait here: when someone presses REMATCH, you\'re in the next game.',
        rematch: 'REMATCH',
        rematchHint: 'Or start the next game for everyone in the call',
        fullTitle: 'This game is full',
        fullLine: (max: number) =>
            `A game takes ${max} players, and this call's game has them all. Stay here: when it ends, you're in the next one.`,
        tryAgain: 'TRY AGAIN',
        errorLine: 'We couldn\'t reach the game. Check your connection and try again.',
        howToPlay: 'How to play',
        invite: 'INVITE TO THIS CALL',
        inviteHint: 'Everyone in this call can join: they tap Join Activity.',
        pipLine: 'Tap to open the game',
    },
    he: {
        dir: 'rtl', lang: 'he',
        title: 'בולשיט',
        finding: 'מחפשים את המשחק של השיחה…',
        endedTitle: 'המשחק הזה הסתיים עכשיו',
        endedLine: 'החברים שלכם על לוח התוצאות. חכו כאן: כשמישהו ילחץ על משחק חוזר, תהיו במשחק הבא.',
        rematch: 'משחק חוזר',
        rematchHint: 'או פתחו את המשחק הבא לכל מי שבשיחה',
        fullTitle: 'המשחק מלא',
        fullLine: (max: number) => `במשחק יש מקום ל-${max} שחקנים, וכולם כבר בפנים. חכו כאן: כשהמשחק ייגמר, תהיו במשחק הבא.`,
        tryAgain: 'לנסות שוב',
        errorLine: 'לא הצלחנו להגיע למשחק. בדקו את החיבור ונסו שוב.',
        howToPlay: 'איך משחקים',
        invite: 'להזמין לשיחה',
        inviteHint: 'כל מי שבשיחה יכול להצטרף: לוחצים על Join Activity.',
        pipLine: 'לחצו כדי לפתוח את המשחק',
    },
};

export type DiscordStrings = typeof DISCORD_STRINGS.en;

export function discordStrings(locale: string): DiscordStrings {
    return DISCORD_STRINGS[locale === 'he' ? 'he' : 'en'];
}

/**
 * The Discord version's look, beside the portal's (portal-style.ts, which hides crews, the big
 * screen, REMIND ME and the other links out): the lobby's invite is the one Discord button (the QR
 * code, WhatsApp, share and copy-link are gone: a link to the site would take a friend out of the
 * call), and the results card's share waits for sign-in with Discord.
 */
export const DISCORD_CSS = `
html.bs-discord app-invite > :not(.invite-discord),
html.bs-discord app-qr-code,
html.bs-discord .whatsapp,
html.bs-discord:not(.bs-discord-share) app-share-results { display: none !important; }
`;

// ---------- the layout in Discord (spec row 6) ----------
// Discord shows an Activity full screen ("focused"), as a small picture-in-picture window, or as a
// tile in the call's grid. On a computer everyone plays in a wide frame; the game's screens are made
// for a phone. So in Discord, and only there (html.bs-discord, set by DiscordService):
// - the play screens are one phone-width column in the middle of the frame, at a phone's text size
//   (the site's text grows with the screen's width, for the big screen; Discord's frame is no TV),
//   in the site's own colours, on a soft margin;
// - the join step keeps a dark ground under its white words if its arcade picture can't load (the
//   picture's host isn't mapped through Discord's proxy yet);
// - the column keeps clear of a phone's notch and home bar: Discord's own safe-area variables, or the
//   browser's (Discord's mobile layout guide, "Mobile Safe Areas");
// - in picture-in-picture and in the grid the frame is too small to play in: a "tap to open" card
//   covers it in place of a squashed screen (the game goes on underneath: nothing is lost);
// - on phones the SDK locks portrait (setOrientationLockState), the only way the game is laid out.

/** Discord's layout modes (Common.LayoutModeTypeObject, @discord/embedded-app-sdk 2.5.0). */
export const LAYOUT_MODE = { UNHANDLED: -1, FOCUSED: 0, PIP: 1, GRID: 2 };
/** Discord's orientation lock states (Common.OrientationLockStateTypeObject). */
export const ORIENTATION_LOCK = { UNHANDLED: -1, UNLOCKED: 1, PORTRAIT: 2, LANDSCAPE: 3 };

/** Whether a layout mode is too small to play in (the "tap to open" card shows). */
export function smallLayout(mode: any): boolean {
    return mode === LAYOUT_MODE.PIP || mode === LAYOUT_MODE.GRID;
}

/**
 * The orientation lock to ask Discord for, by the launch parameters' platform: portrait on a phone
 * (picture-in-picture and the grid follow it, as Discord's layout guide says when they are left out).
 * null on a computer, where Discord has no orientation to lock.
 */
export function orientationLockFor(platform: string | null | undefined): { lock_state: number } | null {
    return String(platform || '').toLowerCase() === 'mobile' ? { lock_state: ORIENTATION_LOCK.PORTRAIT } : null;
}

/** The column's width: a large phone's. */
export const DISCORD_COLUMN = '30rem';

/**
 * The Discord look of the play screens. Every rule starts with html.bs-discord: the site and the
 * CrazyGames version never carry that class, so they look exactly as before.
 */
export const DISCORD_LAYOUT_CSS = `
html.bs-discord {
  --sait: var(--discord-safe-area-inset-top, env(safe-area-inset-top, 0px));
  --saib: var(--discord-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
  --sail: var(--discord-safe-area-inset-left, env(safe-area-inset-left, 0px));
  --sair: var(--discord-safe-area-inset-right, env(safe-area-inset-right, 0px));
  font-size: 14px !important;
}
@media screen and (min-width: 600px) {
  html.bs-discord { font-size: 16px !important; }
  html.bs-discord, html.bs-discord body { background-color: #ece5df; }
}
html.bs-discord .game-container {
  top: var(--sait); bottom: var(--saib); left: var(--sail); right: var(--sair);
  width: auto; height: auto; min-height: calc(100% - var(--sait) - var(--saib));
  max-width: ${DISCORD_COLUMN}; margin: 0 auto; background-color: #fff;
}
@media screen and (min-width: 600px) {
  html.bs-discord .game-container { box-shadow: 0 0 1.5rem rgba(43, 37, 35, .18); }
}
html.bs-discord .arcade-form {
  width: 100%; background-color: #3b2a35;
  padding: var(--sait) var(--sair) var(--saib) var(--sail);
}
html.bs-discord .arcade-form > form { display: block; max-width: ${DISCORD_COLUMN}; margin: 0 auto; }
html.bs-discord .discord-home { padding-top: calc(3rem + var(--sait)); padding-bottom: calc(1.5rem + var(--saib)); }
html.bs-discord .bs-discord-pip-card { display: none; }
html.bs-discord.bs-discord-pip .bs-discord-pip-card {
  display: flex; position: fixed; inset: 0; z-index: 10000; flex-direction: column;
  align-items: center; justify-content: center; text-align: center; cursor: pointer;
  background-color: #502440; color: #f4fcca; padding: .5rem;
}
html.bs-discord.bs-discord-pip .bs-discord-pip-title {
  font-family: 'Luckiest Guy', 'Suez One', cursive; color: #f3d467; letter-spacing: .05em;
  font-size: min(18vw, 30vh, 3rem); line-height: 1.1;
}
html.bs-discord.bs-discord-pip .bs-discord-pip-line { font-size: min(7vw, 11vh, 1.2rem); margin-top: .4em; }
html.bs-discord.bs-discord-pip body { overflow: hidden; }
`;
