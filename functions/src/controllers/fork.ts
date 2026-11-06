import { GameScheme, GameState, GamePlayers } from '../game-model';
import { get, gamesRef } from '../firebase';
import { incGameCounter, generateGameName } from './new-game';
import { randomQuestions } from './questions';
import { pickCoach } from './lie-helper';

/** How long a second Replay waits for the first one's game to be ready before it makes its own. */
export const FORK_WAIT_MS = 10 * 1000;

/**
 * Replay: a new game with the same players. `creator` is the uid of the phone that pressed Replay,
 * `hostPid` its player id in the finished game; that player hosts the new game. `hostKey` is that
 * phone's new one-game secret for the new game (see hostKey in game-model): with it, only that phone
 * may start the new game. Resolves to the new game's pin, and whether this phone hosts it.
 *
 * One Replay per game: when two phones press Replay at once, the first claims the new game and the
 * second gets that same game back, as a guest (`host: false`, so it keeps no host key). Without this,
 * each press made its own game, the phones followed whichever arrived first, and the phone that pressed
 * Replay could end up in the other phone's lobby without START (Friday 6 Nov: JVQP made JVRQ and JVRR).
 */
export async function fork(pin: string, creator?: string, hostPid?: string, hostKey?: string): Promise<{ pin: string; host: boolean }> {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));
    const gameCounter = await incGameCounter();
    const forkedGamePin = generateGameName(gameCounter);

    const claimed = await claimFork(pin, forkedGamePin);
    if (claimed && claimed !== forkedGamePin) {
        // Another phone pressed Replay first: everyone goes to its game.
        if (await forkReady(pin, claimed)) {
            return { pin: claimed, host: false };
        }
        // That Replay never finished (its function failed): make the game here instead.
        console.log(`[PIN: ${pin}] Replay ${claimed} never finished; making ${forkedGamePin}`);
    }

    const questions = await randomQuestions(game.locale, game.totalQ, playerUids(game), game.pack);
    const forkedGame = createFork(pin, game, questions, creator, hostPid, hostKey);

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

function createFork(parent: string, game: GameScheme, qids: string[], creator?: string, hostPid?: string,
    hostKey?: string): GameScheme {
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
        players: resetPlayersScore(game.players),
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

    // The round-1 lie helper, on for half of all games: each Replay is a new draw.
    if (pickCoach()) {
        forked.coach = true;
    }

    // Replay keeps the seasonal pack (a group playing Hanukkah night after night).
    if (game.pack) {
        forked.pack = game.pack;
    }

    return forked;
}

function resetPlayersScore(players: GamePlayers) {
    Object.keys(players || {}).forEach(k => players[k].score = 0);
    return players;
}

function playerUids(game: GameScheme): string[] {
    return Object.keys(game.players || {}).map(k => game.players[k].uid);
}
