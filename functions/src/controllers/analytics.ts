import { GameScheme, GameState } from "../game-model";
import { get, gamesRef } from '../firebase';

const bigquery = require('@google-cloud/bigquery')();

export async function onFork(pin: string) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));
    return forks(pin, game);
}

export async function onStateChange(pin: string) {
    pin = pin.toUpperCase();
    const game = await get<GameScheme>(gamesRef.child(pin));

    if (game.state.id === GameState.RoundIntro && game.questionIndex === 0) {
        return openGame(pin, game);
    } else if (game.state.id === GameState.ScoreBoardFinal) {
        return closeGame(pin, game);
    } else {
        return;
    }
}

export async function onJoinGame(uid: string, ip: string, useragent: string, pin: string, nickname: string) {
    return insert('users', {
        uid,
        ip,
        useragent,
        pin,
        nickname,
        time: new Date(),
    });
}

async function openGame(pin: string, game: GameScheme) {
    return insert('opened_games', {
        id: pin,
        players: Object.keys(game.players).length,
        questions: game.totalQ,
        locale: game.locale,
        presenter: game.presenter,
        time: new Date(game.timestamp),
    });
}

async function closeGame(pin: string, game: GameScheme) {
    return insert('closed_games', {
        id: pin,
        players: Object.keys(game.players).length,
        questions: game.totalQ,
        locale: game.locale,
        presenter: game.presenter,
        time: new Date(),
    });
}

async function forks(pin: string, game: GameScheme) {
    return insert('forks', {
        origin: pin,
        forked: game.fork,
        time: new Date(),
    });
}

async function insert(table, obj) {
    console.log(`Insert to BigQuery, table: '${table}', data: ${JSON.stringify(obj)}`);
    const dataset = bigquery.dataset('analytics');
    try {
        await dataset.table(table).insert(obj);
    } catch (e) {
        console.error('Bigquery Insert failed', e);
    }

    return;
}
