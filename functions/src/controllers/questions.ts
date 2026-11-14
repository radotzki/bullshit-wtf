import { questionsRef, seenQuestionsRef, get } from './../firebase';
import { Question, questionPacks, isPack } from '../game-model';
import { pickQuestions, pickWithPack, pickWithOpener, SeenRecord } from './question-picker';
import { isRetired } from './retired-questions';

/**
 * Picks `count` questions for `lang`, avoiding questions any of the given
 * devices (uids) have already seen. With no uids it is a plain random pick.
 */
export async function randomQuestions(lang: string, count: number, uids: string[] = [], pack?: string) {
    const all = await getQuestionsByLang(lang);
    // Pack questions only appear in games of their pack.
    const questions = all.filter(q => !q.pack);
    const seen = await getSeenRecords(uids);
    const playable = questions.map(q => q.id).filter(id => !isRetired(id));
    const pool = playable.length >= count ? playable : questions.map(q => q.id);

    if (pack && isPack(pack)) {
        // A pack game opens with a pack question, as before.
        const packIds = all.filter(q => q.pack === pack && !isRetired(q.id)).map(q => q.id);
        return pickWithPack(pool, packIds, seen, count, questionPacks[pack].perGame);
    }

    // Easy openers are kept for question 1 (see pickWithOpener).
    const openers = new Set(questions.filter(q => q.opener === true).map(q => q.id));
    const openerIds = pool.filter(id => openers.has(id));
    const regular = pool.filter(id => !openers.has(id));
    return pickWithOpener(regular, openerIds, seen, count, (ids, n) => pickQuestions(ids, seen, n));
}

export function getQuestion(id: string): Promise<Question> {
    return get(questionsRef.child(id))
        .then(resp => Object.assign(resp, { id } as Question));
}

/** Remembers that these devices were shown this question now. */
export function markQuestionSeen(qid: string, uids: string[]) {
    const now = Date.now();
    const update = {};

    validUids(uids).forEach(uid => update[`${uid}/${qid}`] = now);

    if (!qid || Object.keys(update).length === 0) {
        return Promise.resolve();
    }

    return seenQuestionsRef.update(update);
}

/** What these devices have seen (for picking the About questions' prompts, see about.ts). */
export function seenRecordsFor(uids: string[]): Promise<SeenRecord[]> {
    return getSeenRecords(uids);
}

function getSeenRecords(uids: string[]): Promise<SeenRecord[]> {
    return Promise.all(validUids(uids).map(uid => get<SeenRecord>(seenQuestionsRef.child(uid))))
        .then(records => records.map(r => r || {}));
}

function validUids(uids: string[]): string[] {
    // join stores uid 0 when anonymous sign-in failed; skip those.
    return Array.from(new Set((uids || []).filter(uid => typeof uid === 'string' && uid.length > 0 && !/[.#$\[\]\/]/.test(uid))));
}

function getQuestionsByLang(lang: string): Promise<Question[]> {
    return questionsRef
        .orderByChild('lang')
        .equalTo(lang)
        .once('value')
        .then(resp => resp.val())
        .then(resp => Object.keys(resp).map(id => Object.assign(resp[id], { id })));
}
