import { GameScheme, GameState, GamePlayers } from '../game-model';
import { get, gamesRef } from '../firebase';
import { incGameCounter, generateGameName } from './new-game';
import { randomQuestions } from './questions';

export async function fork(pin: string, creator?: string) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));

    return incGameCounter().then(async gameCounter => {
        const forkedGamePin = generateGameName(gameCounter);
        const questions = await randomQuestions(game.locale, game.totalQ, playerUids(game));
        const forkedGame = createFork(pin, game, questions, creator);

        return gamesRef.child(forkedGamePin).set(forkedGame)
            .then(() => gamesRef.child(pin).child('fork').set(forkedGamePin));
    });
}

function createFork(parent: string, game: GameScheme, qids: string[], creator?: string): GameScheme {
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

    return forked;
}

function resetPlayersScore(players: GamePlayers) {
    Object.keys(players).forEach(k => players[k].score = 0);
    return players;
}

function playerUids(game: GameScheme): string[] {
    return Object.keys(game.players || {}).map(k => game.players[k].uid);
}
