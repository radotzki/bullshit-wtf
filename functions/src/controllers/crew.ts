import {
    Crew, GameScheme, GameState, CrewGamePlayer, applyCrewGame, seasonalPack, isTestCampaign, crewMemberKey, TABLE_CAMPAIGN,
} from '../game-model';
import { get, gamesRef, crewsRef } from '../firebase';
import { newGame } from './new-game';
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

/**
 * Saves the players of a finished game as a crew, with this game as its first result.
 * Saving the same game twice (two phones tapping at once) returns the same crew.
 */
export async function createCrew(pin: string, name: string, uid?: string): Promise<{ id: string; name: string }> {
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
        const existing = await get<string>(crewsRef.child(game.crew).child('name'));
        return { id: game.crew, name: existing || crewName };
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
    applyCrewGame(crew, pin, players, now);

    await crewsRef.child(id).set(crew);

    // Only one crew per game: if another phone saved first, keep theirs and drop ours.
    const winner = await claimGame(pin, id);
    if (winner !== id) {
        await crewsRef.child(id).set(null);
        const existing = await get<string>(crewsRef.child(winner).child('name'));
        return { id: winner, name: existing || crewName };
    }

    // Replay was already pressed: the next game counts for the crew too.
    if (game.fork) {
        await claimGame(game.fork, id);
    }

    return { id, name: crewName };
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
    : Promise<{ id: string; name: string; time: number }> {
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
    try {
        const { night } = await setCrewNight(id, time, nickname);
        return { id, name: crew.name, time: night.time };
    } catch (e) {
        // A table without a night is a link to an empty page: none is made.
        await crewsRef.child(id).set(null);
        throw e;
    }
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
    serverStart = false, stagedReveal = false): Promise<{ pin: string; created: boolean }> {
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
        crew: id, uids, pack: seasonalPack(), hostKey, serverStart, stagedReveal,
        // A test crew's games are test games; a guest's table marks its games `table`.
        campaign: isTestCampaign(crew.test) ? crew.test : crew.campaign,
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
