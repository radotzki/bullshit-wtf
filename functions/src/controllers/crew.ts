import { Crew, GameScheme, GameState, CrewGamePlayer, applyCrewGame, seasonalPack, isTestCampaign, tasteOf } from '../game-model';
import { get, gamesRef, crewsRef } from '../firebase';
import { newGame } from './new-game';
import { nameFlag, crewNameRefused } from '../name-flag';

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

    if (crew.rematch && crew.rematch.pin && Date.now() - (crew.rematch.time || 0) < REMATCH_REUSE_MS) {
        const state = await get<{ id: number }>(gamesRef.child(crew.rematch.pin).child('state'));
        if (state && state.id === GameState.GameStaging) {
            return { pin: crew.rematch.pin, created: false };
        }
    }

    const uids: string[] = [];
    Object.keys(crew.members || {}).forEach(k => Object.keys(crew.members[k].uids || {}).forEach(u => uids.push(u)));

    const pin = await newGame(crew.locale || 'en', crew.totalQ || 7, uid, {
        crew: id, uids, pack: seasonalPack(), hostKey, serverStart, stagedReveal, aboutUs,
        campaign: isTestCampaign(crew.test) ? crew.test : undefined,
    });
    await crewsRef.child(id).child('rematch').set({ pin, time: Date.now() });
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
