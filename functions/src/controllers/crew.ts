import {
    Crew, GameScheme, GameState, CrewGamePlayer, applyCrewGame, seasonalPack, isTestCampaign, crewMemberKey, TABLE_CAMPAIGN, tasteOf,
} from '../game-model';
import { get, gamesRef, crewsRef } from '../firebase';
import { newGame, incGameCounter, generateGameName } from './new-game';
import { claimCrewLobby, claimFork, lastGameOf, lobbyOpen } from './next-game';
import { nameFlag, crewNameRefused } from '../name-flag';
import { setCrewNight } from './crew-night';

// Ids look like "k7m2qx": no 0/o, 1/l/i, so they survive being read aloud or retyped.
const ID_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const ID_LENGTH = 6;
export const CREW_NAME_MAX = 24;
// A crew rematch lobby this recent, still waiting to start, is reused by the next tap on Rematch.
export const REMATCH_REUSE_MS = 3 * 60 * 60 * 1000;

function fail(message: string, code: string) {
    return Promise.reject({ message, code });
}

export function cleanCrewName(name: any): string {
    return String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, CREW_NAME_MAX).trim();
}

export function cleanCrewId(id: any): string | null {
    const v = String(id == null ? '' : id).trim().toLowerCase();
    return /^[a-z0-9]{4,12}$/.test(v) ? v : null;
}

function randomId() {
    let id = '';
    for (let i = 0; i < ID_LENGTH; i++) {
        id += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
    }
    return id;
}

async function unusedId(): Promise<string> {
    for (let i = 0; i < 5; i++) {
        const id = randomId();
        const existing = await get(crewsRef.child(id).child('id'));
        if (!existing) {
            return id;
        }
    }
    throw { message: 'Could not make a crew link, try again', code: 'CREW_ID' };
}

function gamePlayers(game: GameScheme): CrewGamePlayer[] {
    const players = game.players || {};
    return Object.keys(players).map(k => ({
        nickname: players[k].nickname,
        score: players[k].score || 0,
        uid: typeof players[k].uid === 'string' ? players[k].uid : undefined,
    }));
}

/** How far up a sitting a new crew looks for the games played before it was saved. */
export const SITTING_GAMES_MAX = 10;

/**
 * The finished games this game was replayed from, oldest first: tonight's earlier games. The chain
 * stops at a game that is gone, never finished, was a taste (played alone) or had under two players.
 */
export async function earlierGames(game: GameScheme): Promise<{ pin: string; game: GameScheme }[]> {
    const out: { pin: string; game: GameScheme }[] = [];
    const seen: { [pin: string]: boolean } = {};
    let parent = game && game.parent;
    while (typeof parent === 'string' && /^[A-Za-z]{1,12}$/.test(parent) && !seen[parent] && out.length < SITTING_GAMES_MAX) {
        seen[parent] = true;
        const earlier = await get<GameScheme>(gamesRef.child(parent.toUpperCase()));
        if (!earlier || !earlier.state || earlier.state.id !== GameState.ScoreBoardFinal || tasteOf(earlier.state)
            || Object.keys(earlier.players || {}).length < 2) {
            break;
        }
        out.unshift({ pin: parent.toUpperCase(), game: earlier });
        parent = earlier.parent;
    }
    return out;
}

/**
 * Saves the players of a finished game as a crew, with this game as a result. A game that is a
 * Replay brings the sitting's earlier games with it (see earlierGames), so the crew's first line
 * says "Dana leads 2 to 1", not "1 to 0".
 * Saving the same game twice (two phones tapping at once) returns the same crew.
 *
 * `auto`: made by "Same time next week?" with a name nobody typed. The browser that made such a crew
 * may rename it by saving the game again under another name; nobody else's save renames a crew.
 * `created` says whether this call made the crew.
 */
export async function createCrew(pin: string, name: string, uid?: string, auto = false)
    : Promise<{ id: string; name: string; created: boolean }> {
    pin = String(pin || '').toUpperCase();
    const crewName = cleanCrewName(name);

    if (!crewName) {
        return fail('Give your crew a name', 'BAD_NAME');
    }

    const game = await get<GameScheme>(gamesRef.child(pin));

    if (!game) {
        return fail('Game does not exist', 'GAME_NOT_EXIST');
    }
    // A crew is named on purpose by one person, so a slur or sex word is refused, not swapped.
    if (nameFlag(crewName) || nameFlag(name)) {
        return fail(crewNameRefused(game.locale), 'BAD_NAME');
    }
    if (!game.state || game.state.id !== GameState.ScoreBoardFinal) {
        return fail('Finish the game first', 'GAME_NOT_FINISHED');
    }
    if (game.crew) {
        const existing = await get<Crew>(crewsRef.child(game.crew));
        if (existing && existing.auto === true && !!uid && existing.creator === uid && existing.name !== crewName) {
            await crewsRef.child(game.crew).child('name').set(crewName);
            return { id: game.crew, name: crewName, created: false };
        }
        return { id: game.crew, name: (existing && existing.name) || crewName, created: false };
    }

    const players = gamePlayers(game);
    if (players.length < 2) {
        return fail('A crew needs at least two players', 'TOO_FEW_PLAYERS');
    }

    const id = await unusedId();
    const now = Date.now();
    const crew: Crew = {
        id,
        name: crewName,
        locale: game.locale || 'en',
        totalQ: game.totalQ || 7,
        createdAt: now,
        members: {},
        gameCount: 0,
    };
    if (uid) {
        crew.creator = uid;
    }
    // A crew saved from a test game is a test crew: its rematches carry the test mark.
    if (isTestCampaign(game.campaign)) {
        crew.test = game.campaign;
    }
    if (auto) {
        crew.auto = true;
    }
    // Tonight's earlier games first, each at the time it ended, then this one.
    (await earlierGames(game)).forEach(earlier =>
        applyCrewGame(crew, earlier.pin, gamePlayers(earlier.game), Number(earlier.game.state.timestamp) || now));
    applyCrewGame(crew, pin, players, now);

    await crewsRef.child(id).set(crew);

    // Only one crew per game: if another phone saved first, keep theirs and drop ours.
    const winner = await claimGame(pin, id);
    if (winner !== id) {
        await crewsRef.child(id).set(null);
        const existing = await get<string>(crewsRef.child(winner).child('name'));
        return { id: winner, name: existing || crewName, created: false };
    }

    // Replay was already pressed: the next game counts for the crew too.
    if (game.fork) {
        await claimGame(game.fork, id);
    }

    return { id, name: crewName, created: true };
}

/** "Noa's table" / "השולחן של נועה": the name of the crew a guest makes to invite another group. */
export function tableName(nickname: string, locale: string): string {
    const name = cleanCrewName(locale === 'he' ? `השולחן של ${nickname}` : `${nickname}'s table`);
    // A nickname in a game has passed the filter already; this is for the two words together.
    return nameFlag(name) ? (locale === 'he' ? 'ערב משחק' : 'Game night') : name;
}

/**
 * INVITE ANOTHER GROUP: a guest of a finished game makes a crew of their own to send to other
 * friends. It has one member (the guest, with no game yet), no game, and a night already set, so its
 * link opens as the door to that night (see crew-night.ts). Whoever opens its lobby on the night
 * hosts, and its games carry the campaign `table`. Its first game counts everyone who shows up
 * (see applyCrewGame).
 *
 * Only a player of a finished game can make one: the nickname is the one that game stored.
 */
export async function createTable(pin: any, pid: any, time: any, uid?: string)
    : Promise<{ id: string; name: string; time: number; again?: boolean }> {
    pin = String(pin || '').toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));

    if (!game) {
        return fail('Game does not exist', 'GAME_NOT_EXIST');
    }
    if (!game.state || game.state.id !== GameState.ScoreBoardFinal) {
        return fail('Finish the game first', 'GAME_NOT_FINISHED');
    }
    const player = typeof pid === 'string' && game.players ? game.players[pid] : null;
    const nickname = player ? String(player.nickname || '').trim() : '';
    if (!nickname) {
        return fail('Only a player of this game can invite a group', 'NOT_A_PLAYER');
    }

    // One table per seat: a reload of the final screen, or a second phone of the same seat, gets the
    // table this seat already made, with its night, not a second table and a second link.
    const made = await madeTable(pin, game, pid);
    if (made) {
        return made;
    }

    const locale = game.locale === 'he' ? 'he' : 'en';
    const id = await unusedId();
    const crew: Crew = {
        id,
        name: tableName(nickname, locale),
        locale,
        totalQ: game.totalQ || 7,
        createdAt: Date.now(),
        members: { [crewMemberKey(nickname)]: { nickname, games: 0, wins: 0, points: 0, best: 0 } },
        gameCount: 0,
        campaign: TABLE_CAMPAIGN,
        from: pin,
    };
    if (uid) {
        crew.creator = uid;
        // The guest's browser: the table's first game skips the questions it has seen.
        crew.members[crewMemberKey(nickname)].uids = { [uid]: true };
    }
    // A table made from a test game is a test crew: its games carry the test mark, not `table`.
    if (isTestCampaign(game.campaign)) {
        crew.test = game.campaign;
    }

    await crewsRef.child(id).set(crew);
    let night: { time: number };
    try {
        night = (await setCrewNight(id, time, nickname)).night;
    } catch (e) {
        // A table without a night is a link to an empty page: none is made.
        await crewsRef.child(id).set(null);
        throw e;
    }
    // Two calls at once from one seat: the first to claim the seat keeps its table, the other goes.
    // A seat whose earlier table is gone (made == null above) may claim again.
    const claimed = await claimSeat(pin, pid, id, (game.tables || {})[pid]);
    if (claimed !== id) {
        await crewsRef.child(id).set(null);
        const theirs = await madeTable(pin, null, pid);
        if (theirs) {
            return theirs;
        }
    }
    return { id, name: crew.name, time: night.time };
}

/** The table this seat of the game made already, if it still exists, with its night. */
async function madeTable(pin: string, game: GameScheme | null, pid: string)
    : Promise<{ id: string; name: string; time: number; again: boolean } | null> {
    const id = game ? (game.tables || {})[pid] : await get<string>(gamesRef.child(pin).child('tables').child(pid));
    const crew = id ? await get<Crew>(crewsRef.child(id)) : null;
    if (!crew) {
        return null;
    }
    return { id: crew.id, name: crew.name, time: crew.night ? crew.night.time : null, again: true };
}

function claimSeat(pin: string, pid: string, id: string, gone?: string): Promise<string> {
    return new Promise((resolve, reject) => {
        gamesRef.child(pin).child('tables').child(pid).transaction(
            (current) => current && current !== gone ? current : id,
            (error, committed, snapshot) => error ? reject(error) : resolve(snapshot.val()),
        );
    });
}

function claimGame(pin: string, id: string): Promise<string> {
    return new Promise((resolve, reject) => {
        gamesRef.child(pin).child('crew').transaction(
            (current) => current || id,
            (error, committed, snapshot) => error ? reject(error) : resolve(snapshot.val()),
        );
    });
}

/**
 * One tap on Rematch: a new game for the crew, in its language and length, with questions
 * none of its members' browsers has seen. If a rematch lobby is already waiting, everyone goes there.
 */
export async function crewRematch(crewId: string, uid?: string, hostKey?: string,
    serverStart = false, stagedReveal = false, aboutUs = false): Promise<{ pin: string; created: boolean }> {
    const id = cleanCrewId(crewId);
    const crew = id ? await get<Crew>(crewsRef.child(id)) : null;

    if (!crew) {
        return fail('Crew does not exist', 'CREW_NOT_EXIST');
    }

    // A lobby is waiting (or being made by another phone this moment): everyone goes there.
    const current = crew.rematch;
    let gone: string = null;
    if (current && current.pin && Date.now() - (current.time || 0) < REMATCH_REUSE_MS) {
        if (await lobbyOpen(current.pin, current.time)) {
            return { pin: current.pin, created: false };
        }
        gone = current.pin;
    }

    // The crew's last game just ended and someone pressed Replay there: that is the crew's lobby.
    const last = lastGameOf(crew);
    const lastState = last ? await get<{ id: number }>(gamesRef.child(last).child('state')) : null;
    const lastEnded = !!lastState && lastState.id === GameState.ScoreBoardFinal;
    if (lastEnded) {
        const replay = await get<string>(gamesRef.child(last).child('fork'));
        if (replay && await lobbyOpen(replay)) {
            return { pin: replay, created: false };
        }
    }

    // Claim the crew's lobby before making it, so a second tap (or a Replay) a moment later comes here.
    const pin = generateGameName(await incGameCounter());
    const holder = await claimCrewLobby(id, pin, gone, 0, REMATCH_REUSE_MS);
    if (holder !== pin && await lobbyOpen(holder, Date.now())) {
        return { pin: holder, created: false };
    }
    // The phones still on the last game's final screen follow this lobby, as they follow a Replay
    // (unless a Replay claimed that game first: it then finds this lobby and comes here, see fork.ts).
    const linked = lastEnded && (await claimFork(last, pin).catch(() => null)) === pin;

    const uids: string[] = [];
    Object.keys(crew.members || {}).forEach(k => Object.keys(crew.members[k].uids || {}).forEach(u => uids.push(u)));

    await newGame(crew.locale || 'en', crew.totalQ || 7, uid, {
        crew: id, uids, pack: seasonalPack(Date.now(), crew.locale || 'en'), hostKey, serverStart, stagedReveal, aboutUs,
        // A test crew's games are test games; a guest's table marks its games `table`.
        campaign: isTestCampaign(crew.test) ? crew.test : crew.campaign,
        pin,
    });
    await crewsRef.child(id).child('rematch').set({ pin, time: Date.now() });
    if (linked) {
        await gamesRef.child(last).child('fork').set(pin);
    }
    return { pin, created: true };
}

/** A crew game reached its final scoreboard: add it to the crew's standings (once). */
export async function recordCrewGame(pin: string, game: GameScheme) {
    if (!game || !game.crew) {
        return;
    }

    const players = gamePlayers(game);
    const now = Date.now();

    return new Promise((resolve, reject) => {
        crewsRef.child(game.crew).transaction(
            (current: Crew) => current ? applyCrewGame(current, pin, players, now) : current,
            (error) => error ? reject(error) : resolve(undefined),
        );
    });
}
