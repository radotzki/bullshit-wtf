import { GameState, GameStateInfo, GamePlayers, RevealAnswer, canLaugh, laughCount } from '../game-model';
import { get, gamesRef } from '../firebase';
import { isPlayer } from './scoring';

/**
 * A player laughs at a lie on the reveal (see laughCount in game-model).
 *
 * Phones cannot write laughs themselves: the database rules let a phone write only its pick, its NEXT
 * and its ticks, and a new rule would wait on the owner's switch. So a laugh goes through this function,
 * like a lie does, and the server writes it where every phone can already read: on the reveal row
 * itself, revealAnswers/<row>/laughs/<pid>. That needs no change to the rules.
 *
 * Taken only from a player of the game, only while this question's reveal is on (or its scoreboard,
 * which in a staged game lasts no time at all), only on a player's lie, and never on the player's own.
 * Laughing twice at the same lie counts once. The lie is named by its text, so a tap that arrives in a
 * later question's reveal never lands on another lie.
 *
 * Resolves to { laughs } (the lie's count after this laugh), or { taken: false } when it was too late.
 */
export async function laugh(pin: any, pid: any, text: any): Promise<{ laughs?: number; taken: boolean }> {
    pin = String(pin).toUpperCase();
    const game = gamesRef.child(pin);
    const [state, players, rows] = await Promise.all([
        get<GameStateInfo>(game.child('state')),
        get<GamePlayers>(game.child('players')),
        get<RevealAnswer[]>(game.child('revealAnswers')),
    ]);

    if (!state && !players) {
        return Promise.reject({ message: 'Game does not exist.', code: 'GAME_NOT_EXIST' });
    }

    if (typeof pid !== 'string' || !isPlayer({ players }, pid)) {
        return Promise.reject({ message: 'You are not in this game.', code: 'NOT_A_PLAYER' });
    }

    if (!state || (state.id !== GameState.RevealTheTruth && state.id !== GameState.ScoreBoard)) {
        return { taken: false };
    }

    const list: RevealAnswer[] = Array.isArray(rows) ? rows : Object.keys(rows || {}).map(k => rows[k]);
    const index = list.findIndex(row => !!row && typeof text === 'string' && row.text === text);
    const row = index === -1 ? null : list[index];

    if (!row) {
        return { taken: false };
    }

    if (!canLaugh(row, pid)) {
        return Promise.reject({ message: 'You cannot laugh at this answer.', code: 'NOT_LAUGHABLE' });
    }

    // In a transaction on the row, so that a laugh that lands as the game moves on (and the server
    // clears the reveal) never writes a stray row into the next question.
    const key = Array.isArray(rows) ? String(index) : Object.keys(rows)[index];
    // The database client first runs this on what it holds locally, which is nothing (null): null answers
    // null, so it asks the server, and runs again on the row the server holds. If the server holds
    // nothing either, writing nothing there changes nothing.
    const after = await new Promise<RevealAnswer>((resolve, reject) => {
        game.child('revealAnswers').child(key).transaction(
            (current: RevealAnswer) => {
                if (current === null) {
                    return null;
                }
                if (!current || current.text !== text) {
                    return undefined;
                }
                return Object.assign({}, current, { laughs: Object.assign({}, current.laughs, { [pid]: true }) });
            },
            (error, committed, snapshot) => error ? reject(error) : resolve(committed && snapshot ? snapshot.val() : null),
            false,
        );
    });

    if (!after || after.text !== text) {
        return { taken: false };
    }
    return { laughs: laughCount(after), taken: true };
}
