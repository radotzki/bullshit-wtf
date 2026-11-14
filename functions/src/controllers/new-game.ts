import { randomQuestions } from './questions';
import { pickCoach } from './lie-helper';
import { drawBigReveal } from './big-reveal';
import { withStaged } from './phase';
import { drawAboutUs } from './about';
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
    // The creating phone can show the About questions, so this game is in their 50/50 test (see about.ts).
    aboutUs?: boolean;
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

        // The round-1 lie helper, on for every game (crew rematches included). Logged as coach.
        if (pickCoach()) {
            game.coach = true;
        }

        // The staged reveal, for half of the games made by a client that can show it: the half its PIN falls in.
        const bigReveal = drawBigReveal(options.stagedReveal === true, gamePin);
        if (bigReveal !== undefined) {
            game.bigReveal = bigReveal;
            game.state = withStaged(game.state, game);
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

        // The About questions, for half of the games made by a client that can show them: by the crew's
        // half for a crew's game, else by the PIN's.
        const aboutUs = drawAboutUs(options.aboutUs === true, gamePin, options.crew);
        if (aboutUs !== undefined) {
            game.aboutUs = aboutUs;
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
