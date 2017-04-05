import { randomQuestions } from './questions';
import { GameScheme, GameState } from '../game-model';
import { get, gamesRef, gameCounterRef } from '../firebase';

export async function newGame(locale, count) {
    // TODO: transaction
    const gameCounter = await get<number>(gameCounterRef) + 1;
    const gamePin = generateGameName(gameCounter);
    const questions = randomQuestions(locale, count);
    const game: GameScheme = {
        state: {
            id: GameState.GameStaging,
            timestamp: Date.now(),
        },
        locale,
        timestamp: Date.now(),
        roundIndex: 0,
        questionIndex: 0,
        players: {},
        totalQ: count,
        qids: questions,
        tick: 0,
        presenter: false,
    };

    await gameCounterRef.set(gameCounter);
    await gamesRef.child(gamePin).set(game);

    return gamePin;
}

function generateGameName(gameCounter) {
    return leftPad((gameCounter).toString(26).replace(/\d/g, d => 'qrstuvwxyz'[d]).toUpperCase());
}

function leftPad(gameCounter: string) {
    while (gameCounter.length < 4) {
        gameCounter = `Q${gameCounter}`; 1
    }

    return gameCounter;
}
