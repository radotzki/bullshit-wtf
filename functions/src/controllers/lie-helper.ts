/**
 * The round-1 lie helper ("coach"), and the per-question numbers that measure it.
 *
 * In every game (coach: true), round 1's writing screen tells players to make up a fake answer
 * and offers each player up to two ready-made lies ("STUCK? GIVE ME A LIE"). The lies come from the
 * question's own fake answers, after cleanHouseLies, never the real answer.
 *
 * It began as a 50/50 test (from about 5 November 2026) and was given to every new game and every
 * Replay on 13 November 2026. The coach column is still written on every game and question row, so
 * the switch shows in the data: games made before it have coach false for the no-helper half.
 *
 * This file is pure (no Firebase) so it can be unit tested.
 */
import { shuffle, Random } from './question-picker';
import { normalize } from './answer-options';
import { GameScheme } from '../game-model';
import { spanSeconds } from './answer-times';
import { isSamePick } from './same-pick';

export const IDEAS_PER_PLAYER = 2;

/**
 * Every new game and every Replay gets the helper (the 50/50 test ended on 13 November 2026).
 * To turn it back off, return false here and deploy the functions: no client change is needed.
 */
export function pickCoach(): boolean {
    return true;
}

/**
 * Up to two of the question's fake answers per player, never the real answer.
 * A player knows every lie they were offered is fake, so a lie offered to two players could never fool
 * one of them when the other sends it. So no lie goes to two players while the pool lasts: every player
 * gets one lie before anyone gets a second, and the second lies go to as many players as the pool allows
 * (4 fake answers: 2 players get 2 each; 3 players get 2/1/1; 4 players 1 each). Only when there are more
 * players than lies do players share one: each of those gets a single lie, the one handed out least.
 * Who gets a second lie is random. A question with no usable fake answers gives nobody ideas.
 */
export function pickIdeas(
    fakeAnswers: string[],
    realAnswer: string,
    pids: string[],
    random: Random = Math.random,
): { [pid: string]: string[] } {
    const real = normalize(realAnswer);
    const candidates: string[] = [];
    (fakeAnswers || []).forEach(text => {
        const key = normalize(text);
        if (key && key !== real && !candidates.some(c => normalize(c) === key)) {
            candidates.push(String(text).trim());
        }
    });

    const res: { [pid: string]: string[] } = {};
    if (!candidates.length || !(pids || []).length) {
        return res;
    }

    const pool = shuffle(candidates, random);
    const players = shuffle(pids, random);

    // First lies: one per player, distinct while the pool lasts, then the least handed out.
    players.forEach((pid, i) => res[pid] = [pool[i % pool.length]]);

    // Second lies: only lies nobody holds yet.
    let next = players.length;
    for (let i = 0; i < players.length && IDEAS_PER_PLAYER > 1 && next < pool.length; i++) {
        res[players[i]].push(pool[next++]);
    }

    return res;
}

/** Did the player send one of the lies the helper offered them (case and spacing do not matter)? */
export function isIdea(ideas: string[] | undefined | null, text: string): boolean {
    const key = normalize(text);
    return !!key && (ideas || []).some(i => normalize(i) === key);
}

export interface QuestionResultRow {
    id: string;
    q_index: number;
    round: number;
    total_q: number;
    players: number;
    lies: number;
    idea_lies: number;
    picks: number;
    friend_fooled: number;
    coach: boolean;
    locale: string | null;
    lie_span_s: number | null;
    pick_span_s: number | null;
    unpicked_lies: number;
    qid: string | null;
    truth_picks: number;
    house_picks: number;
    pair: boolean | null;
    decoy_picks: number;
}

/**
 * One row of analytics.question_results, from the game as it stands on the scoreboard of a question.
 *   lies           players who wrote a lie
 *   idea_lies      of those, lies the helper offered them
 *   picks          players who picked an answer
 *   friend_fooled  picks of a lie another player wrote
 *   lie_span_s     seconds from the first lie to the last (null with fewer than two, or no times)
 *   pick_span_s    the same for picks
 *   unpicked_lies  players' lies that nobody picked
 *   qid            the question's id in the bank (game.qids), to rank questions by how they play
 *   truth_picks    picks of the real answer
 *   house_picks    picks of a neutral house lie (none in a pair game)
 *   pair           "Pick a decoy" (see pair.ts): true for a two-player game with decoys, false for the
 *                  no-decoy half of the ended 50/50 test (old games only), null for any other game
 *   decoy_picks    picks of a decoy another player chose (pair games); lies, friend_fooled and
 *                  unpicked_lies count written lies only
 * A pick is the truth or a house lie as scoring counts it: it matches that answer alone (case aside).
 */
export function questionResult(pin: string, game: GameScheme): QuestionResultRow {
    const answers = game.answers || {};
    const selections = game.answerSelections || {};
    const playerLies = Object.keys(answers).filter(k => answers[k] && !answers[k].houseLie && !answers[k].realAnswer && !answers[k].decoyOf);
    const decoys = Object.keys(answers).filter(k => answers[k] && !!answers[k].decoyOf);

    let friendFooled = 0;
    let decoyPicks = 0;
    const pickedTexts: string[] = [];
    Object.keys(selections).forEach(pid => {
        const picked = normalize(selections[pid] && selections[pid].text);
        pickedTexts.push(picked);
        if (picked && playerLies.some(k => k !== pid && normalize(answers[k].text) === picked)) {
            friendFooled++;
        } else if (picked && decoys.some(k => answers[k].decoyOf !== pid && normalize(answers[k].text) === picked)) {
            decoyPicks++;
        }
    });
    const q = game.questionIndex || 0;
    const times = game.answerTimes || {};

    const answerList = Object.keys(answers).map(k => answers[k]).filter(a => !!a);
    let truthPicks = 0;
    let housePicks = 0;
    Object.keys(selections).forEach(pid => {
        const text = selections[pid] && selections[pid].text;
        const matches = answerList.filter(a => isSamePick(a.text, text));
        if (matches.length === 1 && matches[0].realAnswer) {
            truthPicks++;
        } else if (matches.length === 1 && matches[0].houseLie) {
            housePicks++;
        }
    });
    const qid = game.qids && game.qids[game.questionIndex || 0];

    return {
        id: pin,
        q_index: q,
        round: (game.roundIndex || 0) + 1,
        total_q: game.totalQ || 0,
        players: Object.keys(game.players || {}).length,
        lies: playerLies.length,
        idea_lies: playerLies.filter(k => !!answers[k].idea).length,
        picks: Object.keys(selections).length,
        friend_fooled: friendFooled,
        coach: !!game.coach,
        locale: game.locale || null,
        lie_span_s: spanSeconds(playerLies, times.lies, q),
        pick_span_s: spanSeconds(Object.keys(selections), times.picks, q),
        unpicked_lies: playerLies.filter(k => pickedTexts.indexOf(normalize(answers[k].text)) < 0).length,
        qid: qid !== undefined && qid !== null && qid !== '' ? String(qid) : null,
        truth_picks: truthPicks,
        house_picks: housePicks,
        pair: game.pair === true || game.pair === false ? game.pair : null,
        decoy_picks: decoyPicks,
    };
}
