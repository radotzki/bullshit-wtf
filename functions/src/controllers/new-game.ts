import { randomQuestions } from './questions';
import { pickCoach } from './lie-helper';
import { drawBigReveal } from './big-reveal';
import { GameScheme, GameState, isPack, cleanCampaign } from '../game-model';
import { get, gamesRef, gameCounterRef } from '../firebase';

export interface NewGameOptions {
    // A crew rematch: the crew this game counts for, and its members' browsers (no repeat questions).
    crew?: string;
    uids?: string[];
    // A seasonal question pack (see questionPacks in game-model).
    pack?: string;
    // The campaign tag the host arrived with.
    campaign?: string;
    // The creating phone's one-game secret (see hostKey in game-model), already cleaned.
    hostKey?: string;
    // The creating phone starts the game through startGame, so a tick may not start it.
    serverStart?: boolean;
    // The creating phone can show the staged reveal, so this game is in its 50/50 test (see big-reveal.ts).
    stagedReveal?: boolean;
}

export async function newGame(locale, count, creator?: string, options: NewGameOptions = {}) {
    return incGameCounter().then(async gameCounter => {
        const gamePin = generateGameName(gameCounter);
        const pack = isPack(options.pack) ? options.pack : undefined;
        const questions = await randomQuestions(locale, count, options.uids || [], pack);
        const game = emptyGame(locale, count, questions, creator);

        if (pack) {
            game.pack = pack;
        }

        const campaign = cleanCampaign(options.campaign);
        if (campaign) {
            game.campaign = campaign;
        }

        // The round-1 lie helper, on for half of all games (crew rematches included).
        if (pickCoach()) {
            game.coach = true;
        }

        // The staged reveal, for half of the games made by a client that can show it. Its own draw.
        const bigReveal = drawBigReveal(options.stagedReveal === true);
        if (bigReveal !== undefined) {
            game.bigReveal = bigReveal;
        }

        if (options.hostKey) {
            game.hostKey = options.hostKey;
            game.hasHost = true;
            if (options.serverStart) {
                game.serverStart = true;
            }
        }

        if (options.crew) {
            game.crew = options.crew;
            game.origin = 'crew';
        }

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

function emptyGame(locale: string, count: number, questions: string[], creator?: string): GameScheme {
    const game: GameScheme = {
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
        origin: 'create',
    };

    if (creator) {
        game.creator = creator;
    }

    return game;
}
