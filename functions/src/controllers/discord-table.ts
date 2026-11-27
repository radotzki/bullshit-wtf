import { GameScheme, GameState, seasonalPack, isTestCampaign } from '../game-model';
import { get, gamesRef, discordRef } from '../firebase';
import { newGame, incGameCounter, generateGameName } from './new-game';
import { isGameOver, JUST_ENDED_MS } from './game-over';
import { NEXT_GAME_WAIT_MS } from './next-game';

/**
 * One game per Discord call (the Discord Activity, stage 1, row 3 of the spec).
 *
 * Everyone who opens the Activity in one voice call shares Discord's instance id. The first phone
 * to call discordTable gets a new game made for the call; every phone after it gets that same PIN
 * and goes straight to its lobby. No PIN to type and no link to send.
 *
 * The call's game is kept at discord/<instance id> = { pin, time }, the server's alone (its own
 * rule in database-rules.json). `time` is when the call was pointed at that PIN.
 *
 * - Two phones at the same moment: the PIN is claimed by a transaction on the call's row before the
 *   game is made, so one claim wins and the other phone waits for that game (up to
 *   NEXT_GAME_WAIT_MS), as a second Replay does (next-game.ts).
 * - REMATCH: the finished game's `fork` (set by Replay, PLAY AGAIN, SAME TABLE or a crew lobby) is
 *   followed, and the call is moved to it in one transaction, only if the call still points where
 *   it was read: a phone opening the Activity after the rematch lands in the rematch's lobby.
 * - A game on its final scoreboard with no rematch yet, ended less than JUST_ENDED_MS ago: the call
 *   stays on it, answered with `ended: true`, so a phone that opens the Activity then joins the
 *   group on the scoreboard and follows them into the rematch (the shell asks again, or presses
 *   REMATCH itself). Making it a new game there split the call from the group's rematch.
 * - A game that ended longer ago with no rematch, a game that sat still for STALE_MS, a claim whose
 *   game was never written, or a game that was erased: the call gets a new game; the old one traps
 *   nobody.
 *
 * The instance id is long and hard to guess, but Discord's instance API (which would prove it) needs
 * a bot token: that check waits for stage 2. Until then the id is only checked for its form, so it
 * can be nothing but one database key under discord/.
 */

/** The tag of every game made for a Discord call (spec row 7), unless a play-test brings a test tag. */
export const DISCORD_CAMPAIGN = 'discord-activity';
/** Questions in a Discord call's game: the create page's default length. */
export const DISCORD_GAME_LENGTH = 7;
/** The game languages a call's game may be made in. */
export const DISCORD_LOCALES = ['en', 'he'];
/** How many rematches are followed in one call before the chain is taken as broken. */
const MAX_HOPS = 20;
/** How many times a phone tries again when another phone moved the call's row under it. */
const MAX_TRIES = 5;

export interface DiscordTableOptions {
    /** The calling browser's uid, already cleaned. */
    uid?: string;
    /** The calling phone's one-game secret, already cleaned: it hosts the game if it makes it. */
    hostKey?: string;
    serverStart?: boolean;
    stagedReveal?: boolean;
    aboutUs?: boolean;
    /** A campaign tag; only a test tag (?via=test) is kept, so play-tests stay out of the counts. */
    campaign?: string;
}

export interface DiscordTable {
    pin: string;
    /** This phone made the game (and holds its host key, when it sent one). */
    created: boolean;
    /** The game is on its final scoreboard with no rematch yet: wait for the group's REMATCH. */
    ended?: boolean;
}

interface LiveGame {
    pin: string;
    ended?: boolean;
}

interface CallRow {
    pin: string;
    time: number;
}

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * A Discord instance id, or undefined. Discord's look like i-1234567890123456789-gc-1234-5678:
 * letters, digits, - and _ only (never . # $ [ ] / or anything else a database key can't hold),
 * at least 8 and at most 128 characters.
 */
export function cleanInstanceId(id: any): string | undefined {
    return typeof id === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(id) ? id : undefined;
}

/** A call's game language, or undefined. */
export function cleanDiscordLocale(locale: any): string | undefined {
    return typeof locale === 'string' && DISCORD_LOCALES.indexOf(locale) >= 0 ? locale : undefined;
}

function badRequest(message: string) {
    return Object.assign(new Error(message), { code: 'BAD_REQUEST' });
}

/** The parts of a game this needs (they stay in place when an old game's private parts move). */
async function readHead(pin: string): Promise<GameScheme | null> {
    const ref = gamesRef.child(pin);
    const [state, timestamp, hostSeen, fork] = await Promise.all([
        get<GameScheme['state']>(ref.child('state')),
        get<number>(ref.child('timestamp')),
        get<number>(ref.child('hostSeen')),
        get<string>(ref.child('fork')),
    ]);
    if (!state) {
        return null;
    }
    return { state, timestamp, hostSeen, fork } as GameScheme;
}

/**
 * The game the call should be in now, from the PIN it points to: that game while it is not over,
 * else its rematch (and that one's, and so on), or a game that has just ended and has no rematch yet
 * (`ended`). Null when there is none: a game over longer than JUST_ENDED_MS ago with no rematch, a
 * stale game, a PIN never written once its claim is NEXT_GAME_WAIT_MS old, or a chain that goes round.
 */
export async function liveGameOf(pin: string, claimedAt: number, now = Date.now()): Promise<LiveGame | null> {
    const seen: { [pin: string]: boolean } = {};
    let current = pin;
    for (let hop = 0; hop < MAX_HOPS && current && !seen[current]; hop++) {
        seen[current] = true;
        let game = await readHead(current);
        // A claim not written yet: wait for it, as a second Replay waits (only for the call's own claim).
        while (!game && hop === 0 && Date.now() < (claimedAt || 0) + NEXT_GAME_WAIT_MS) {
            await wait(250);
            game = await readHead(current);
        }
        if (!game) {
            return null;
        }
        const at = Math.max(now, Date.now());
        if (!isGameOver(game, at)) {
            return { pin: current };
        }
        if (typeof game.fork === 'string' && game.fork) {
            current = game.fork.toUpperCase();
            continue;
        }
        // Just ended, no rematch yet: the group may still press it. Keep the call with them.
        if (game.state.id === GameState.ScoreBoardFinal && at - (Number(game.state.timestamp) || 0) <= JUST_ENDED_MS) {
            return { pin: current, ended: true };
        }
        return null;
    }
    return null;
}

/**
 * Points the call from `from` (what was read; null for no row) to `to`, unless another phone moved it
 * first. Resolves to the row as it stands after the transaction.
 */
function moveCall(instanceId: string, from: string | null, to: string, now: number): Promise<{ moved: boolean; row: CallRow | null }> {
    return new Promise((resolve, reject) => {
        discordRef.child(instanceId).transaction(
            (current: CallRow | null) => {
                // The SDK calls this first with what it holds locally, which for a row it never read is
                // null: going on then lets the server compare and call again with the real row (an
                // abort here would end the transaction before the real row is seen). A row that is
                // really empty is nobody's claim, so this phone may take it.
                const pin = current && current.pin ? current.pin : null;
                if (pin !== null && pin !== from) {
                    return; // another phone moved it: keep theirs
                }
                return { pin: to, time: now };
            },
            (error, committed, snapshot) => error ? reject(error) : resolve({ moved: committed, row: snapshot.val() }),
        );
    });
}

/** Frees the call's row when this phone's claim could not be made into a game, so the next phone can. */
function releaseClaim(instanceId: string, pin: string): Promise<void> {
    return new Promise(resolve => {
        discordRef.child(instanceId).transaction(
            (current: CallRow | null) => current && current.pin === pin ? null : undefined,
            () => resolve(),
        );
    });
}

/**
 * The PIN of the Discord call's game, made if the call has none that can be played. See the top of
 * this file. `locale` is used only when a game is made (a call keeps the language of its game).
 */
export async function discordTable(instanceId: any, locale: any, options: DiscordTableOptions = {}): Promise<DiscordTable> {
    const id = cleanInstanceId(instanceId);
    if (!id) {
        throw badRequest('Not a Discord instance id');
    }
    const lang = cleanDiscordLocale(locale);
    if (!lang) {
        throw badRequest('Not a game language');
    }

    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
        const now = Date.now();
        const row = await get<CallRow>(discordRef.child(id));
        const from = row && typeof row.pin === 'string' ? row.pin : null;
        const live = from ? await liveGameOf(from, row.time || 0, now) : null;

        const answer = (g: LiveGame): DiscordTable => g.ended ? { pin: g.pin, created: false, ended: true } : { pin: g.pin, created: false };
        if (live && live.pin === from) {
            return answer(live);
        }
        if (live) {
            // The call's game was rematched: move the call to the rematch, once.
            const result = await moveCall(id, from, live.pin, Date.now());
            if (result.moved) {
                console.log('discordTable moved', JSON.stringify({ from, pin: live.pin }));
                return answer(live);
            }
            continue; // another phone moved it first: read again
        }

        // No game to play: claim a new PIN for the call, then make the game under it.
        const pin = generateGameName(await incGameCounter());
        const claim = await moveCall(id, from, pin, Date.now());
        if (!claim.moved) {
            continue; // another phone claimed first: its game is the call's (read again, wait for it)
        }
        const campaign = isTestCampaign(options.campaign) ? options.campaign : DISCORD_CAMPAIGN;
        try {
            await newGame(lang, DISCORD_GAME_LENGTH, options.uid, {
                pin,
                campaign,
                pack: seasonalPack(Date.now(), lang),
                hostKey: options.hostKey,
                serverStart: options.serverStart === true,
                stagedReveal: options.stagedReveal === true,
                aboutUs: options.aboutUs === true,
            });
        } catch (e) {
            await releaseClaim(id, pin);
            throw e;
        }
        console.log('discordTable created', JSON.stringify({ pin, replaced: from, hostKey: !!options.hostKey }));
        return { pin, created: true };
    }
    throw Object.assign(new Error('The call\'s game kept changing; try again'), { code: 'BUSY' });
}

