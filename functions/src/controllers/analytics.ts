import { GameScheme, GameState, isTestCampaign } from "../game-model";
import { get, gamesRef } from '../firebase';
import { recordCrewGame } from './crew';
import { QuestionResultRow } from './lie-helper';
import { nameFlag } from '../name-flag';

const { BigQuery } = require('@google-cloud/bigquery');
const bigquery = new BigQuery();

// Where a host's visit started (arrival.ts): its columns, and recordArrival, which index.ts calls
// through here as the game is made.
import { arrivalColumns, hostArrivalColumns } from './arrival';
export { recordArrival } from './arrival';

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
        // The crew's standings must not wait on (or fail with) BigQuery.
        await Promise.all([
            closeGame(pin, game),
            recordCrewGame(pin, game).catch(e => console.error('recordCrewGame failed', pin, e && e.message)),
        ]);
        return;
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
//   crew    tapped Rematch on a crew page, or opened a crew link
// The server alone writes one more value, 'test', for every join of a test game (see onJoinGame).
export const JOIN_SOURCES = ['pin', 'link', 'qr', 'results', 'host', 'replay', 'crew'];

export function cleanVia(via: any): string | null {
    if (via === undefined || via === null || via === '') {
        return null;
    }
    const v = String(via).toLowerCase();
    return JOIN_SOURCES.indexOf(v) >= 0 ? v : 'other';
}

/** The value of users.via for every join of a test game, whatever the join's real source was. */
export const TEST_VIA = 'test';

/** Whether the game is a test game (its campaign is a test tag). A failed read counts as not. */
async function isTestGame(pin: string): Promise<boolean> {
    try {
        if (typeof pin !== 'string' || !/^[A-Za-z]{1,12}$/.test(pin)) {
            return false;
        }
        return isTestCampaign(await get<string>(gamesRef.child(pin.toUpperCase()).child('campaign')));
    } catch (e) {
        console.error('isTestGame failed', pin, e && e.message);
        return false;
    }
}

export async function onJoinGame(uid: string, ip: string, useragent: string, pin: string, nickname: string, via: string | null = null) {
    // The users table has no campaign column, and a lobby that never starts has no other row:
    // a join of a test game says so in via, so the lobby can be left out with nothing else to go by.
    // The host's own join also says where the host's visit started (see arrival.ts).
    const arrival = await hostArrivalColumns(pin, via);
    if (await isTestGame(pin)) {
        via = TEST_VIA;
    }
    return insert('users', {
        ...arrival,
        uid,
        ip,
        useragent,
        pin,
        nickname,
        via,
        // The raw typed name stays in nickname (to measure); name_flag is hate, sex or null.
        name_flag: nameFlag(nickname),
        time: new Date(),
    });
}

// What a share was and how it went out. Only these land in BigQuery; anything else is dropped.
//   crew-night  the crew page's NEXT GAME NIGHT section:
//     whatsapp           tapped SEND THE DATE ON WHATSAPP
//     calendar-share     CALENDAR INVITE, sent through the phone's share sheet
//     calendar-download  CALENDAR INVITE, downloaded as a .ics file
//     google-calendar    tapped "or add it to Google Calendar"
//     weekly-share       EVERY FRIDAY IN MY CALENDAR (a weekly entry), sent through the share sheet
//     weekly-download    the weekly entry, downloaded as a .ics file
//     weekly-google      tapped "or every week in Google Calendar"
//   crew-save   a crew saved on the final screen (a save, not a send; the crew id comes with it):
//     repeat-offer       from the offer above SHARE RESULTS, shown when the same group plays again
//     bottom             from SAVE THIS CREW at the bottom of the screen
//   invite      the lobby's invite (inline while the host is alone, or the INVITE FRIENDS sheet):
//     whatsapp           tapped WHATSAPP
//     native             sent through the phone's share sheet (SHARE LINK)
//     copy               copied the link (COPY LINK, or SHARE LINK on a phone with no share sheet)
//     solo-start         a lone host tapped "Start alone anyway" (not a send: counts who insists)
//   results     the final screen's SHARE RESULTS sheet (the results card):
//     whatsapp           tapped WHATSAPP
//     native             sent through the phone's share sheet (SHARE)
//     copy               SHARE on a phone with no share sheet: the text and link were copied
//     download           tapped SAVE IMAGE
//   after-game  the "start your own game" ask a guest sees on the final screen (presses, not sends):
//     create             tapped START MY OWN GAME (the game it makes carries campaign after-game)
//     remind             tapped REMIND ME (saves a calendar entry; its link carries after-game-remind)
//     remind-google      then tapped "Add it to Google Calendar"
//   game-over   the same ask on the join page of a game that is over (campaigns after-game-late and
//               after-game-late-remind): create, remind, remind-google
//   sound       the mute button of the staged reveal (not a send: counts who silences the phone sounds):
//     mute               tapped it to silence the game
//     unmute             tapped it again
export const SHARE_METHODS: { [contentType: string]: string[] } = {
    'crew-night': ['whatsapp', 'calendar-share', 'calendar-download', 'google-calendar',
        'weekly-share', 'weekly-download', 'weekly-google'],
    'crew-save': ['repeat-offer', 'bottom'],
    'invite': ['whatsapp', 'native', 'copy', 'solo-start'],
    'results': ['whatsapp', 'native', 'copy', 'download'],
    'after-game': ['create', 'remind', 'remind-google'],
    'game-over': ['create', 'remind', 'remind-google'],
    'sound': ['mute', 'unmute'],
};

export interface ShareRow {
    content_type: string;
    method: string;
    crew_id: string | null;
    locale: string | null;
    uid: string | null;
}

/** A share row from a client's request body, or null when it is not one we count. */
export function cleanShare(body: any): ShareRow | null {
    if (!body || typeof body !== 'object') {
        return null;
    }
    const contentType = String(body.content_type || '').toLowerCase();
    const method = String(body.method || '').toLowerCase();
    const methods = SHARE_METHODS[contentType];
    if (!methods || methods.indexOf(method) < 0) {
        return null;
    }
    const crew = typeof body.crew === 'string' && /^[a-z0-9]{1,32}$/i.test(body.crew) ? body.crew.toLowerCase() : null;
    const locale = body.locale === 'he' || body.locale === 'en' ? body.locale : null;
    const uid = typeof body.uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(body.uid) ? body.uid : null;
    return { content_type: contentType, method, crew_id: crew, locale, uid };
}

export async function onShare(row: ShareRow) {
    return insert('shares', { ...row, time: new Date() });
}

// Host and start kind, the same on opened_games and closed_games.
function origin(game: GameScheme) {
    return {
        ...arrivalColumns(game.arrival),
        creator_uid: game.creator || null,
        origin: game.origin || null,
        parent_pin: game.parent || null,
        crew_id: game.crew || null,
        pack: game.pack || null,
        campaign: game.campaign || null,
        coach: !!game.coach,
    };
}

/** One row per question played (see lie-helper.ts questionResult). */
export async function onQuestionResult(row: QuestionResultRow) {
    return insert('question_results', { ...row, time: new Date() });
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
