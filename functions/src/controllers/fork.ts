import { GameScheme, GameState, GamePlayers } from '../game-model';
import { get, gamesRef } from '../firebase';
import { incGameCounter, generateGameName } from './new-game';
import { randomQuestions } from './questions';
import { pickCoach } from './lie-helper';

/**
 * Replay: a new game with the same players. `creator` is the uid of the phone that pressed Replay,
 * `hostPid` its player id in the finished game; that player hosts the new game. `hostKey` is that
 * phone's new one-game secret for the new game (see hostKey in game-model): with it, only that phone
 * may start the new game. Resolves to the new game's pin.
 */
export async function fork(pin: string, creator?: string, hostPid?: string, hostKey?: string): Promise<string> {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));

    return incGameCounter().then(async gameCounter => {
        const forkedGamePin = generateGameName(gameCounter);
        const questions = await randomQuestions(game.locale, game.totalQ, playerUids(game), game.pack);
        const forkedGame = createFork(pin, game, questions, creator, hostPid, hostKey);

        return gamesRef.child(forkedGamePin).set(forkedGame)
            .then(() => gamesRef.child(pin).child('fork').set(forkedGamePin))
            .then(() => forkedGamePin);
    });
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
