import { GameScheme, GameState, GamePlayers } from '../game-model';
import { get, gamesRef } from '../firebase';
import { incGameCounter, generateGameName } from './new-game';
import { randomQuestions } from './questions';

export async function fork(pin: string) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));

    return incGameCounter().then(gameCounter => {
        const forkedGamePin = generateGameName(gameCounter);
        const questions = randomQuestions(game.locale, game.totalQ);
        const forkedGame = createFork(game, questions);

        return gamesRef.child(forkedGamePin).set(forkedGame)
            .then(() => gamesRef.child(pin).child('fork').set(forkedGamePin));
    });
}

function createFork(game: GameScheme, qids: string[]): GameScheme {
    return {
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
    }
}

function resetPlayersScore(players: GamePlayers) {
    Object.keys(players).forEach(k => players[k].score = 0);
    return players;
}
