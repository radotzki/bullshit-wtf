import { GameScheme, GameState, isTestCampaign } from "../game-model";
import { get, gamesRef } from '../firebase';
import { readGame } from './old-games';
import { recordCrewGame } from './crew';
import { QuestionResultRow } from './lie-helper';
import { nameFlag } from '../name-flag';
import { VisitRecord } from './visit';

const { BigQuery } = require('@google-cloud/bigquery');
const bigquery = new BigQuery();

// Where a host's visit started (arrival.ts): its columns, and recordArrival, which index.ts calls
// through here as the game is made.
import { arrivalColumns, hostArrivalColumns } from './arrival';
export { recordArrival } from './arrival';

export async function onFork(pin: string) {
    pin = pin.toUpperCase();
    const game = await readGame(pin);
    return forks(pin, game);
}

export async function onStateChange(pin: string) {
    pin = pin.toUpperCase();
    const game = await readGame(pin);

    if (game.state.id === GameState.RoundIntro && game.questionIndex === 0) {
        return openGame(pin, game);
    } else if (game.state.id === GameState.ScoreBoardFinal) {
        if (game.idle) {
            // Nobody played question 1, so the game ended there (tick.ts): it was not played, and is
            // counted nowhere. Its opened_games row and question 1's question_results row stay.
            return;
        }
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
//   home    typed the PIN into the code box at the top of the home page ("Got a code?")
// The server alone writes one more value, 'test', for every join of a test game (see onJoinGame).
export const JOIN_SOURCES = ['pin', 'link', 'qr', 'results', 'host', 'replay', 'crew', 'home'];

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
//     in                 pressed I'M IN on the crew page's GAME NIGHT block (a press, like the next four)
//     in-new             the same, by a name the crew did not have: a friend who comes along
//     out                pressed "Can't make it"
//     nudge              pressed ASK WHO ELSE IS IN (opens WhatsApp)
//     open-lobby         pressed OPEN THE LOBBY on the night, and that press opened the lobby (one row a lobby)
//     join-lobby         pressed it when another phone had already opened the lobby: this phone joined it
//   crew-save   a crew saved on the final screen (a save, not a send; the crew id comes with it):
//     repeat-offer       from the offer above SHARE RESULTS, shown when the same group plays again
//     bottom             from SAVE THIS CREW at the bottom of the screen
//     next-week          made by the "Same time next week?" sheet, with a name nobody typed
//   next-week   "Same time next week?" on the final screen of a group's second or later game of a
//               sitting, a 50/50 test (see next-week.ts; the crew id comes with every row once there is one):
//     seen-card          a phone showed the new button, or its banner (once per phone per game)
//     seen-control       a phone in the other half showed today's screen (once per phone per game)
//     open               pressed the button: the sheet opened
//     whatsapp           tapped SEND TO THE GROUP ON WHATSAPP
//     native             sent the date through the phone's share sheet (Share another way)
//     copy               Share another way on a phone with no share sheet: the text and link were copied
//     calendar           tapped ADD TO MY CALENDAR, on the sheet or the banner
//     in                 tapped I'M IN on the banner (or on a sheet another phone's date reached)
//     change             tapped CHANGE on the banner of the phone that set the date: the sheet opened again
//     tell               tapped TELL THE GROUP ON WHATSAPP: this phone's date lost to one set first, and it
//                        sent the night that stands to the group
//   invite      the lobby's invite (inline while the host is alone, or the INVITE FRIENDS sheet):
//     whatsapp           tapped WHATSAPP
//     native             sent through the phone's share sheet (SHARE LINK)
//     copy               copied the link (COPY LINK, or SHARE LINK on a phone with no share sheet)
//     solo-start         a lone host tapped "Start alone anyway" (not a send: counts who insists)
//   lobby-help  the lone-host help, a 50/50 test in the host's lobby (game/: pages/game-staging/lone-host.ts).
//               Every row carries the lobby's PIN, in capitals, in crew_id (shares has no PIN column), and
//               a lobby's half follows from its PIN. A test game's lobby sends no row:
//     seen-new-phone, seen-new-computer          the lobby first held one or two players, and showed the
//                                                new help on a phone or a computer (once per lobby and browser)
//     seen-classic-phone, seen-classic-computer  the same moment in the other half, which showed today's lobby
//     whatsapp, native, copy                     the host's invite sends from this lobby, in either half and
//                                                with any number of players in (each is an "invite" row too)
//   results     the final screen's SHARE RESULTS sheet (the results card):
//     whatsapp           tapped WHATSAPP
//     native             sent through the phone's share sheet (SHARE)
//     copy               SHARE on a phone with no share sheet: the text and link were copied
//     download           tapped SAVE IMAGE
//   after-game  the "start your own game" ask a guest sees on the final screen (presses, not sends):
//     create             tapped START MY OWN GAME (the game it makes carries campaign after-game)
//     remind             tapped REMIND ME (saves a calendar entry; its link carries after-game-remind)
//     remind-google      then tapped "Add it to Google Calendar"
//   host-invite INVITE ANOTHER GROUP, the ask half of guests see in place of that one (a 50/50 test by
//               browser; the crew id comes with every row from `open` on):
//     seen-new           a guest's phone showed the new ask
//     seen-classic       a guest's phone in the other half showed today's ask
//     open               pressed INVITE ANOTHER GROUP (the sheet opened)
//     whatsapp           sent the invitation: tapped SEND ON WHATSAPP
//     native             sent it through the phone's share sheet (Share another way)
//     copy               the same on a phone with no share sheet: the text and link were copied
//     calendar           pressed ADD TO MY CALENDAR (saves the night as a calendar file)
//     google-calendar    then tapped "or add it to Google Calendar"
//     create-now         pressed "or start a game right now" (the game it makes carries campaign after-game-invite)
//   game-over   the same ask on the join page of a game that is over (campaigns after-game-late and
//               after-game-late-remind): create, remind, remind-google
//   night-after a finished game's own link, in the week after the game: the recap (night-after.ts), for every
//               game since its 50/50 test by PIN was retired. Every row carries the game's PIN, in
//               capitals, in crew_id, as lobby-help's do. A test game's link sends no row:
//     seen-player          the recap showed, to a browser that played that game (once per page load)
//     seen-other           the recap showed, to a browser that didn't play it: "You missed it"
//     seen-control-player  before the test was retired, the other half: "Game over" showed, to a browser that played
//     seen-control-other   the same, to a browser that didn't play (still taken from pages loaded before then)
//     create               pressed START YOUR OWN GAME (didn't play; the game it makes carries campaign night-after)
//     create-player        pressed HOST THE NEXT ONE (played; its game carries campaign night-after-player)
//     crew                 pressed "See who's in next time" (the table's saved crew page)
//     same-table           pressed PLAY AGAIN, SAME TABLE (played; opens the game's lobby, same-table.ts)
//     same-table-open      the same, while the table's lobby was already open (it joins that lobby)
//     join-them            pressed JOIN THEM under "They're playing again" (didn't play; joins the open lobby)
//   sound       the mute button of the staged reveal (not a send: counts who silences the phone sounds):
//     mute               tapped it to silence the game
//     unmute             tapped it again
/** The lone-host help's rows: their crew_id is the lobby's PIN. */
export const LOBBY_HELP = 'lobby-help';
/** The night-after rows: their crew_id is the finished game's PIN. */
export const NIGHT_AFTER = 'night-after';

export const SHARE_METHODS: { [contentType: string]: string[] } = {
    'crew-night': ['whatsapp', 'calendar-share', 'calendar-download', 'google-calendar',
        'weekly-share', 'weekly-download', 'weekly-google', 'in', 'in-new', 'out', 'nudge', 'open-lobby',
        'join-lobby'],
    'crew-save': ['repeat-offer', 'bottom', 'next-week'],
    'next-week': ['seen-card', 'seen-control', 'open', 'whatsapp', 'native', 'copy', 'calendar', 'in', 'change',
        'tell'],
    'invite': ['whatsapp', 'native', 'copy', 'solo-start'],
    'lobby-help': ['seen-new-phone', 'seen-new-computer', 'seen-classic-phone', 'seen-classic-computer',
        'whatsapp', 'native', 'copy',
        // The computer host pressed "use this as the big screen" (game-staging: big-screen-host.ts).
        'big-screen'],
    'results': ['whatsapp', 'native', 'copy', 'download'],
    'after-game': ['create', 'remind', 'remind-google'],
    'game-over': ['create', 'remind', 'remind-google'],
    'host-invite': ['seen-new', 'seen-classic', 'open', 'whatsapp', 'native', 'copy', 'calendar', 'google-calendar', 'create-now'],
    'sound': ['mute', 'unmute'],
    'night-after': ['seen-player', 'seen-other', 'seen-control-player', 'seen-control-other', 'create', 'create-player', 'crew', 'same-table', 'same-table-open', 'join-them',
        // A player came late, the table mid-game: CATCH THE NEXT ROUND, or START A NEW TABLE NOW.
        'catch-next', 'new-table'],
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
    let crew = typeof body.crew === 'string' && /^[a-z0-9]{1,32}$/i.test(body.crew) ? body.crew.toLowerCase() : null;
    if (contentType === LOBBY_HELP || contentType === NIGHT_AFTER) {
        // The lobby's PIN travels in the crew field: letters only, kept in capitals. No PIN, no row.
        if (typeof body.crew !== 'string' || !/^[A-Za-z]{1,12}$/.test(body.crew)) {
            return null;
        }
        crew = body.crew.toUpperCase();
    }
    const locale = body.locale === 'he' || body.locale === 'en' ? body.locale : null;
    const uid = typeof body.uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(body.uid) ? body.uid : null;
    return { content_type: contentType, method, crew_id: crew, locale, uid };
}

/** A test game leaves no lobby-help or night-after row: shares has no campaign column to leave it out by later. */
export async function onShare(row: ShareRow, testGame: (pin: string) => Promise<boolean> = isTestGame) {
    if ((row.content_type === LOBBY_HELP || row.content_type === NIGHT_AFTER) && await testGame(row.crew_id)) {
        return;
    }
    return insert('shares', { ...row, time: new Date() });
}

/** One row of the visit beacon (see visit.ts): a page view, or what became of it. */
export async function onVisit(row: VisitRecord) {
    return insert('visits', row);
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
        // The About questions' half (see about.ts): null outside the test.
        about_us: typeof game.aboutUs === 'boolean' ? game.aboutUs : null,
    };
}

export interface RefusedJoinRow {
    pin: string;
    players: number;
    started: boolean;
    locale: string | null;
    campaign: string | null;
}

/**
 * One row of analytics.refused_joins: the server answered "game is full" to a join.
 * Only the game is described (its PIN, size, language and campaign tag, and whether it had left
 * the lobby). Nothing about the player who was turned away: no uid, no nickname, no address.
 */
export function refusedJoin(pin: string, game: GameScheme): RefusedJoinRow {
    return {
        pin,
        players: Object.keys(game.players || {}).length,
        started: !!game.state && game.state.id !== GameState.GameStaging,
        locale: game.locale || null,
        campaign: game.campaign || null,
    };
}

export async function onRefusedJoin(row: RefusedJoinRow) {
    return insert('refused_joins', { ...row, time: new Date() });
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
        // How it left the lobby (startVerdict in start.ts). Needs the start_by column: until it is
        // added, ignoreUnknownValues drops it and the row still lands.
        start_by: game.startBy || null,
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
