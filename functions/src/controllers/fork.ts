import { replayLength, gameTaste } from './taste';
import { GameScheme, GameState, GamePlayers, isTestCampaign } from '../game-model';
import { isPortalCampaign } from './portal';
import { get, gamesRef } from '../firebase';
import { readGame } from './old-games';
import { incGameCounter, generateGameName } from './new-game';
import { randomQuestions } from './questions';
import { pickCoach } from './lie-helper';
import { drawBigReveal } from './big-reveal';
import { withStaged } from './phase';
import { drawAboutUs } from './about';
import { claimFork, forkOf, crewLobbyFor, NEXT_GAME_WAIT_MS } from './next-game';
import { REMATCH_REUSE_MS } from './crew';
import { HOST_AWAY_MIN_PLAYERS } from './start';
import { seatGone } from './seats';

/** How long a second Replay waits for the first one's game to be ready before it makes its own. */
export const FORK_WAIT_MS = NEXT_GAME_WAIT_MS;

/**
 * Replay: a new game with the same players. `creator` is the uid of the phone that pressed Replay,
 * `hostPid` its player id in the finished game; that player hosts the new game. `hostKey` is that
 * phone's new one-game secret for the new game (see hostKey in game-model): with it, only that phone
 * may start the new game. `stagedReveal`: that phone can show the staged reveal (see big-reveal.ts). Resolves to the new game's pin, and whether this phone hosts it.
 *
 * One Replay per game: when two phones press Replay at once, the first claims the new game and the
 * second gets that same game back, with its host key, so both phones that pressed Replay may start it
 * (the first stays the named host in the lobby). Without this,
 * each press made its own game, the phones followed whichever arrived first, and the phone that pressed
 * Replay could end up in the other phone's lobby without START (Friday 6 Nov: JVQP made JVRQ and JVRR).
 */
export async function fork(pin: string, creator?: string, hostPid?: string, hostKey?: string,
    stagedReveal = false, aboutUs = false): Promise<{ pin: string; host: boolean; hostKey?: string }> {
    pin = pin.toUpperCase();
    const game = await readGame(pin);
    const gameCounter = await incGameCounter();
    const forkedGamePin = generateGameName(gameCounter);

    // A Replay of a taste (a game played alone, see taste.ts) is a whole game, of the length its host chose.
    if (game) {
        game.totalQ = replayLength(game);
    }

    const claimed = await claimFork(pin, forkedGamePin);
    if (claimed && claimed !== forkedGamePin) {
        // Another phone pressed Replay first, or opened the crew's lobby: everyone goes to its game.
        const next = await forkOf(pin);
        if (next) {
            return await joinNext(game, next, hostPid, hostKey);
        }
        // That Replay never finished (its function failed): make the game here instead.
        console.log(`[PIN: ${pin}] Replay ${claimed} never finished; making ${forkedGamePin}`);
    }

    // A crew game: a phone that went by the crew page may have opened the crew's lobby since this
    // game ended. Then that lobby is the Replay too; else this Replay is the crew's lobby (see next-game.ts).
    if (game && game.crew) {
        const endedAt = game.state && game.state.id === GameState.ScoreBoardFinal ? game.state.timestamp || 0 : 0;
        const lobby = await crewLobbyFor(game.crew, endedAt, forkedGamePin, REMATCH_REUSE_MS)
            .catch(e => { console.error('crewLobbyFor failed', pin, e && e.message); return null; });
        if (lobby) {
            await gamesRef.child(pin).child('forking').set(lobby);
            await gamesRef.child(pin).child('fork').set(lobby);
            return await joinNext(game, lobby, hostPid, hostKey);
        }
    }

    const questions = await randomQuestions(game.locale, game.totalQ, playerUids(game), game.pack, game.kidsHoliday);
    const forkedGame = createFork(pin, game, questions, creator, hostPid, hostKey, stagedReveal, forkedGamePin, aboutUs);

    await gamesRef.child(forkedGamePin).set(forkedGame);
    await gamesRef.child(pin).child('forking').set(forkedGamePin);
    await gamesRef.child(pin).child('fork').set(forkedGamePin);
    return { pin: forkedGamePin, host: true };
}

/**
 * This phone pressed Replay, but the next game is another phone's (a Replay, or the crew's lobby):
 * whoever pressed Replay may start it, so a player of the finished game gets its host key too.
 * Only a player of the finished game, from a client that sends a key (and so reads this one).
 */
export async function joinNext(game: GameScheme, next: string, hostPid?: string, hostKey?: string)
    : Promise<{ pin: string; host: boolean; hostKey?: string }> {
    const players = (game && game.players) || {};
    const theirs = hostPid && hostKey && players[hostPid]
        ? await get<string>(gamesRef.child(next).child('hostKey')) : null;
    return theirs ? { pin: next, host: true, hostKey: theirs } : { pin: next, host: false };
}

export function createFork(parent: string, game: GameScheme, qids: string[], creator?: string, hostPid?: string,
    hostKey?: string, stagedReveal = false, forkedPin = '', aboutUs = false): GameScheme {
    const forked: GameScheme = {
        state: {
            id: GameState.GameStaging,
            timestamp: Date.now(),
        },
        locale: game.locale,
        timestamp: Date.now(),
        roundIndex: 0,
        questionIndex: 0,
        totalQ: game.totalQ,
        qids,
        tick: 0,
        presenter: game.presenter,
        players: resetPlayersScore(seatsForReplay(game, hostPid)),
        origin: 'replay',
        parent,
    };
    // The seats carried over keep the browser string they joined with (see join.ts seatByName).
    const agents = agentsOf(game, forked.players);
    if (agents) {
        forked.agents = agents;
    }

    // The browser that pressed Replay hosts the new game; fall back to the old host.
    const host = creator || game.creator;
    if (host) {
        forked.creator = host;
    }

    // The player who pressed Replay is the host, even without a uid. An old client sends no player
    // id: the old host stays marked, as the old creator stays.
    const players = forked.players || {};
    if (hostPid && players[hostPid]) {
        Object.keys(players).forEach(k => delete players[k].host);
        players[hostPid].host = true;
        // Only a phone that is a player of this game can hold its host key.
        if (hostKey) {
            forked.hostKey = hostKey;
            // Only clients that start through startGame send a key with Replay.
            forked.serverStart = true;
            // The player who pressed Replay is in the new lobby now (see hostHere).
            forked.hostSeen = Date.now();
            // A Replay of 5 or more is a full lobby from its first second (see fullSince).
            if (Object.keys(players).filter(k => !!players[k]).length >= HOST_AWAY_MIN_PLAYERS) {
                forked.fullSince = Date.now();
            }
        }
    }
    if (Object.keys(players).some(k => players[k] && players[k].host)) {
        forked.hasHost = true;
    }

    // The sitting's first game, carried from Replay to Replay ("Same time next week?" draws its half
    // from it, see next-week.ts). A taste was played alone: its Replay is the group's first game.
    if (!gameTaste(game)) {
        forked.root = game.root || parent;
    }

    // Replay keeps counting for the same crew.
    if (game.crew) {
        forked.crew = game.crew;
    }

    // The round-1 lie helper, on for every game, Replay included. Logged as coach.
    if (pickCoach()) {
        forked.coach = true;
    }

    // The staged reveal: each Replay is a new game with a half of its own (the one its PIN falls in),
    // when the phone that pressed it can show it.
    const bigReveal = drawBigReveal(stagedReveal === true && !!forkedPin, forkedPin);
    if (bigReveal !== undefined) {
        forked.bigReveal = bigReveal;
        forked.state = withStaged(forked.state, forked);
    }

    // The About questions: a crew's Replay stays in the crew's half, any other is a new draw by its PIN.
    const about = drawAboutUs(aboutUs === true && !!forkedPin, forkedPin, game.crew);
    if (about !== undefined) {
        forked.aboutUs = about;
    }

    // Replay keeps the seasonal pack (a group playing Hanukkah night after night).
    if (game.pack) {
        forked.pack = game.pack;
    }
    // And a kids game's holiday (an English kids game from the Hanukkah page keeps its Hanukkah questions).
    if (game.kidsHoliday) {
        forked.kidsHoliday = game.kidsHoliday;
    }

    // A Replay of a test game is a test game, and of a portal game a portal game (portal.ts); other
    // campaign tags count the first game only.
    if (isTestCampaign(game.campaign) || isPortalCampaign(game.campaign)) {
        forked.campaign = game.campaign;
    }

    return forked;
}

/** The browser strings of the given seats, from the old game; undefined when it has none of them. */
function agentsOf(game: GameScheme, players: GamePlayers): { [pid: string]: string } | undefined {
    const out: { [pid: string]: string } = {};
    Object.keys(players || {}).forEach(k => {
        if (game.agents && typeof game.agents[k] === 'string') {
            out[k] = game.agents[k];
        }
    });
    return Object.keys(out).length ? out : undefined;
}

function resetPlayersScore(players: GamePlayers) {
    Object.keys(players || {}).forEach(k => {
        players[k].score = 0;
        // Nobody has sent anything in the new game yet (see sent.ts).
        delete players[k].sent;
    });
    return players;
}

/**
 * The finished game's seats, less a second seat of one phone that never sent a lie or a pick: before
 * one phone was one seat (see seatOf in join.ts), a phone that joined twice left an empty seat, and
 * Replay carried it into the next game, where the table waited on it again (12 Nov: JVXG to JVXH).
 * A seat that played, or the only seat of its phone, always comes along.
 */
export function withoutSecondSeats(game: GameScheme, hostPid?: string): GamePlayers {
    const players = game.players || {};
    // A game from before the flags were kept (no playedFrom) cannot tell who played: keep every seat.
    if (typeof game.playedFrom !== 'number') {
        return players;
    }
    const played = game.played || {};
    const keep = (k: string) => !!played[k] || !!players[k].host || k === hostPid;
    const out: GamePlayers = {};
    const byUid: { [uid: string]: string[] } = {};
    Object.keys(players).filter(k => players[k]).forEach(k => {
        const uid = players[k].uid;
        if (typeof uid === 'string' && uid) {
            (byUid[uid] = byUid[uid] || []).push(k);
        } else {
            out[k] = players[k];
        }
    });
    Object.keys(byUid).forEach(uid => {
        const seats = byUid[uid].sort();
        const kept = seats.filter(keep);
        // Nobody played any seat of this phone: keep its newest seat, the one the phone holds.
        (kept.length ? kept : seats.slice(-1)).forEach(k => out[k] = players[k]);
    });
    return out;
}

/**
 * The seats a Replay starts with: the players who are still at the table. A seat that sent nothing
 * on the finished game's last question (no lie, no pick and no NEXT on its reveal, see lastSent) is a
 * player who went home, or a seat nobody played: it is left out. Before, every seat came along, and
 * the Replay's first question ran its clocks out for players who were gone (the empty seats rule in
 * seats.ts only helps from question 2). Since 5 Nov, 5 Replays had more seats than phones, one 8 seats
 * for 4 phones. The seat of the phone that pressed Replay always comes along.
 *
 * A player who is still there but sent nothing on the last question loses only their seat: when their
 * phone follows the Replay and finds no seat of its own, it joins the new game (score-board-final),
 * as a late phone does.
 *
 * A game that ended before lastSent was kept, or where nobody sent anything on its last question,
 * has nothing to go by: it keeps the seats as withoutSecondSeats does.
 *
 * Then, whatever lastSent says, a seat whose page is gone when Replay is pressed (seats.ts seatGone:
 * away GONE_MS or more) is left out too: a guest who played to the end and then said goodnight and
 * closed the page. Before, such a guest sat in the Replay at 0 and its first question waited out the
 * clock for them (21 Nov, New Year's Eve play-through). A phone that only slept comes back to the final
 * screen, finds the Replay, and joins it like any late phone, before or after it has started.
 */
export function seatsForReplay(game: GameScheme, hostPid?: string, now = Date.now()): GamePlayers {
    const players = withoutSecondSeats(game, hostPid);
    // The phone that pressed Replay is here. An old client sends no player id: then the old host stays.
    const presser = hostPid && players[hostPid] ? hostPid : undefined;
    const pressed = (k: string) => k === presser || (!presser && !!players[k].host);
    const here = (game && game.lastSent) || {};
    const seats = Object.keys(players).filter(k => players[k]);
    const sentLast = seats.some(k => here[k] === true);
    const keep = (k: string) => pressed(k) || ((!sentLast || here[k] === true) && !seatGone(game, k, now));
    const out: GamePlayers = {};
    seats.filter(keep).forEach(k => out[k] = players[k]);
    return out;
}

function playerUids(game: GameScheme): string[] {
    return Object.keys(game.players || {}).map(k => game.players[k].uid);
}
