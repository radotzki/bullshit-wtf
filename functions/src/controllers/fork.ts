import { replayLength } from './taste';
import { GameScheme, GameState, GamePlayers, isTestCampaign } from '../game-model';
import { get, gamesRef } from '../firebase';
import { incGameCounter, generateGameName } from './new-game';
import { randomQuestions } from './questions';
import { pickCoach } from './lie-helper';
import { drawBigReveal } from './big-reveal';
import { withStaged } from './phase';

/** How long a second Replay waits for the first one's game to be ready before it makes its own. */
export const FORK_WAIT_MS = 10 * 1000;

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
    stagedReveal = false): Promise<{ pin: string; host: boolean; hostKey?: string }> {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));
    const gameCounter = await incGameCounter();
    const forkedGamePin = generateGameName(gameCounter);

    // A Replay of a taste (a game played alone, see taste.ts) is a whole game, of the length its host chose.
    if (game) {
        game.totalQ = replayLength(game);
    }

    const claimed = await claimFork(pin, forkedGamePin);
    if (claimed && claimed !== forkedGamePin) {
        // Another phone pressed Replay first: everyone goes to its game.
        if (await forkReady(pin, claimed)) {
            // Whoever pressed Replay may start the new game, so this player gets its host key too.
            // Only a player of the finished game, from a client that sends a key (and so reads this one).
            const players = game.players || {};
            const theirs = hostPid && hostKey && players[hostPid]
                ? await get<string>(gamesRef.child(claimed).child('hostKey')) : null;
            return theirs ? { pin: claimed, host: true, hostKey: theirs } : { pin: claimed, host: false };
        }
        // That Replay never finished (its function failed): make the game here instead.
        console.log(`[PIN: ${pin}] Replay ${claimed} never finished; making ${forkedGamePin}`);
    }

    const questions = await randomQuestions(game.locale, game.totalQ, playerUids(game), game.pack);
    const forkedGame = createFork(pin, game, questions, creator, hostPid, hostKey, stagedReveal, forkedGamePin);

    await gamesRef.child(forkedGamePin).set(forkedGame);
    await gamesRef.child(pin).child('forking').set(forkedGamePin);
    await gamesRef.child(pin).child('fork').set(forkedGamePin);
    return { pin: forkedGamePin, host: true };
}

/** The first Replay of `pin` claims its new game's pin; resolves to the pin that holds the claim. */
function claimFork(pin: string, forkedGamePin: string): Promise<string> {
    return new Promise((resolve, reject) => {
        gamesRef.child(pin).child('forking').transaction(
            (current) => current || forkedGamePin,
            (error, committed, snapshot) => error ? reject(error) : resolve(snapshot.val()),
        );
    });
}

/** Waits (up to FORK_WAIT_MS) until the claimed Replay game is written and the old game points to it. */
async function forkReady(pin: string, claimed: string): Promise<boolean> {
    const until = Date.now() + FORK_WAIT_MS;
    while (true) {
        const current = await get<string>(gamesRef.child(pin).child('fork'));
        if (current === claimed) {
            return true;
        }
        if (Date.now() >= until) {
            return false;
        }
        await new Promise(r => setTimeout(r, 250));
    }
}

export function createFork(parent: string, game: GameScheme, qids: string[], creator?: string, hostPid?: string,
    hostKey?: string, stagedReveal = false, forkedPin = ''): GameScheme {
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
        }
    }
    if (Object.keys(players).some(k => players[k] && players[k].host)) {
        forked.hasHost = true;
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

    // Replay keeps the seasonal pack (a group playing Hanukkah night after night).
    if (game.pack) {
        forked.pack = game.pack;
    }

    // A Replay of a test game is a test game (other campaign tags count the first game only).
    if (isTestCampaign(game.campaign)) {
        forked.campaign = game.campaign;
    }

    return forked;
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
 */
export function seatsForReplay(game: GameScheme, hostPid?: string): GamePlayers {
    const players = withoutSecondSeats(game, hostPid);
    const here = (game && game.lastSent) || {};
    const seats = Object.keys(players).filter(k => players[k]);
    if (!seats.some(k => here[k] === true)) {
        return players;
    }
    // The phone that pressed Replay is here. An old client sends no player id: then the old host stays.
    const presser = hostPid && players[hostPid] ? hostPid : undefined;
    const keep = (k: string) => here[k] === true || k === presser || (!presser && !!players[k].host);
    const out: GamePlayers = {};
    seats.filter(keep).forEach(k => out[k] = players[k]);
    return out;
}

function playerUids(game: GameScheme): string[] {
    return Object.keys(game.players || {}).map(k => game.players[k].uid);
}
