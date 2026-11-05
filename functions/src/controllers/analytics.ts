import { GameScheme, GameState } from "../game-model";
import { get, gamesRef } from '../firebase';

const { BigQuery } = require('@google-cloud/bigquery');
const bigquery = new BigQuery();

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

// Where a player's join came from. The client sends one of these; anything else is 'other'.
//   pin     typed the PIN on the join page
//   link    opened a join link (shared link, or an old link without a tag)
//   qr      scanned the lobby QR code
//   results came from a shared results card
//   host    the player who just created the game
//   replay  carried into the next game by Replay
export const JOIN_SOURCES = ['pin', 'link', 'qr', 'results', 'host', 'replay'];

export function cleanVia(via: any): string | null {
    if (via === undefined || via === null || via === '') {
        return null;
    }
    const v = String(via).toLowerCase();
    return JOIN_SOURCES.indexOf(v) >= 0 ? v : 'other';
}

export async function onJoinGame(uid: string, ip: string, useragent: string, pin: string, nickname: string, via: string | null = null) {
    return insert('users', {
        uid,
        ip,
        useragent,
        pin,
        nickname,
        via,
        time: new Date(),
    });
}

// Host and start kind, the same on opened_games and closed_games.
function origin(game: GameScheme) {
    return {
        creator_uid: game.creator || null,
        origin: game.origin || null,
        parent_pin: game.parent || null,
    };
}

async function openGame(pin: string, game: GameScheme) {
    return insert('opened_games', {
        id: pin,
        players: Object.keys(game.players).length,
        questions: game.totalQ,
        locale: game.locale,
        presenter: game.presenter,
        ...origin(game),
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
        ...origin(game),
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
        // ignoreUnknownValues: if the new columns are not added yet, the row still
        // lands (without them) instead of the whole insert failing.
        await dataset.table(table).insert(obj, { ignoreUnknownValues: true });
    } catch (e) {
        // PartialFailureError carries per-row reasons in e.errors.
        console.error('Bigquery Insert failed', e && e.message, JSON.stringify(e && e.errors));
    }

    return;
}
