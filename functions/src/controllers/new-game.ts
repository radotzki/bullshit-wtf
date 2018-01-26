import { randomQuestions } from './questions';
import { GameScheme, GameState } from '../game-model';
import { get, gamesRef, gameCounterRef } from '../firebase';

export async function newGame(locale, count) {
    return incGameCounter().then(async gameCounter => {
        const gamePin = generateGameName(gameCounter);
        const questions = await randomQuestions(locale, count);
        const game = emptyGame(locale, count, questions);

        return gamesRef.child(gamePin).set(game).then(() => gamePin);
    });
}

export function incGameCounter() {
    return new Promise((resolve, reject) => {
        gameCounterRef.transaction(
            (current) => current + 1,
            (error, committed, snapshot) => error ? reject(error) : resolve(snapshot.val()),
        )
    });
}

export function generateGameName(gameCounter) {
    return leftPad((gameCounter).toString(26).replace(/\d/g, d => 'qrstuvwxyz'[d]).toUpperCase());
}

function leftPad(gameCounter: string) {
    while (gameCounter.length < 4) {
        gameCounter = `Q${gameCounter}`; 1
    }

    return gameCounter;
}

function emptyGame(locale: string, count: number, questions: string[]): GameScheme {
    return {
        state: {
            id: GameState.GameStaging,
            timestamp: Date.now(),
        },
        locale,
        timestamp: Date.now(),
        roundIndex: 0,
        questionIndex: 0,
        totalQ: count,
        qids: questions,
        tick: 0,
        presenter: false,
    }
}
