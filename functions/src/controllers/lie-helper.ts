/**
 * The round-1 lie helper ("coach"), and the per-question numbers that measure it.
 *
 * In half of all games (coach: true), round 1's writing screen tells players to make up a fake answer
 * and offers each player up to two ready-made lies ("STUCK? GIVE ME A LIE"). The lies come from the
 * question's own fake answers, after cleanHouseLies, never the real answer.
 *
 * This file is pure (no Firebase) so it can be unit tested.
 */
import { shuffle, Random } from './question-picker';
import { normalize } from './answer-options';
import { GameScheme } from '../game-model';
import { bigRevealArm } from './big-reveal';

export const IDEAS_PER_PLAYER = 2;

/** Half of all new games get the helper. */
export function pickCoach(random: Random = Math.random): boolean {
    return random() < 0.5;
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
    // The staged reveal's arm: true, false, or null for a game outside that test (see big-reveal.ts).
    big_reveal: boolean | null;
    locale: string | null;
}

/**
 * One row of analytics.question_results, from the game as it stands on the scoreboard of a question.
 *   lies           players who wrote a lie
 *   idea_lies      of those, lies the helper offered them
 *   picks          players who picked an answer
 *   friend_fooled  picks of a lie another player wrote
 */
export function questionResult(pin: string, game: GameScheme): QuestionResultRow {
    const answers = game.answers || {};
    const selections = game.answerSelections || {};
    const playerLies = Object.keys(answers).filter(k => answers[k] && !answers[k].houseLie && !answers[k].realAnswer);

    let friendFooled = 0;
    Object.keys(selections).forEach(pid => {
        const picked = normalize(selections[pid] && selections[pid].text);
        if (picked && playerLies.some(k => k !== pid && normalize(answers[k].text) === picked)) {
            friendFooled++;
        }
    });

    return {
        id: pin,
        q_index: game.questionIndex || 0,
        round: (game.roundIndex || 0) + 1,
        total_q: game.totalQ || 0,
        players: Object.keys(game.players || {}).length,
        lies: playerLies.length,
        idea_lies: playerLies.filter(k => !!answers[k].idea).length,
        picks: Object.keys(selections).length,
        friend_fooled: friendFooled,
        coach: !!game.coach,
        big_reveal: bigRevealArm(game),
        locale: game.locale || null,
    };
}
