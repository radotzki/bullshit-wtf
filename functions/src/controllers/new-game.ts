import { randomQuestions } from './questions';
import { pickCoach } from './lie-helper';
import { drawBigReveal } from './big-reveal';
import { withStaged } from './phase';
import { drawAboutUs } from './about';
import { GameScheme, GameState, packFits, cleanCampaign } from '../game-model';
import { get, gamesRef, gameCounterRef } from '../firebase';
import { challengeSeed } from './challenge';

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
    // A pin claimed already (a crew's lobby, see next-game.ts): the game is made under it.
    pin?: string;
    // CHALLENGE ANOTHER GROUP: the PIN of the finished game this one plays against (see challenge.ts).
    // The new game takes that game's language, length, pack and questions, whatever else was asked.
    challenge?: string;
}

export async function newGame(locale, count, creator?: string, options: NewGameOptions = {}) {
    // A challenge is checked before a PIN is spent on it.
    const seed = options.challenge ? await challengeSeed(options.challenge) : null;
    if (options.challenge && !seed) {
        return Promise.reject({ message: 'This challenge is over', code: 'CHALLENGE_OVER' });
    }
    const counter = options.pin ? Promise.resolve(null) : incGameCounter();
    return counter.then(async gameCounter => {
        const gamePin = options.pin || generateGameName(gameCounter);
        if (seed) {
            // The challenged game's language, length and pack (which fits its language).
            locale = seed.card.locale;
            count = seed.qids.length;
            options = { ...options, pack: seed.pack };
        }
        // A pack with questions in one language only (Thanksgiving: English) is dropped from any other game.
        const pack = packFits(options.pack, locale) ? options.pack : undefined;
        // A challenge plays the other table's questions, in their order (see challenge.ts).
        const questions = seed ? seed.qids : await randomQuestions(locale, count, options.uids || [], pack);
        const game = emptyGame(locale, count, questions, creator);

        if (pack) {
            game.pack = pack;
        }

        // A test game's challenge is a test game too.
        const campaign = cleanCampaign(seed && seed.testCampaign ? seed.testCampaign : options.campaign);
        if (campaign) {
            game.campaign = campaign;
        }

        if (seed) {
            game.challenge = seed.card;
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
        // Not in a challenge: its questions are the other table's, all of them.
        const aboutUs = drawAboutUs(options.aboutUs === true && !seed, gamePin, options.crew);
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
