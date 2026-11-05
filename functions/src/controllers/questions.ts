import { questionsRef, seenQuestionsRef, get } from './../firebase';
import { Question } from '../game-model';
import { pickQuestions, SeenRecord } from './question-picker';

/**
 * Picks `count` questions for `lang`, avoiding questions any of the given
 * devices (uids) have already seen. With no uids it is a plain random pick.
 */
export async function randomQuestions(lang: string, count: number, uids: string[] = []) {
    const questions = await getQuestionsByLang(lang);
    const seen = await getSeenRecords(uids);
    return pickQuestions(questions.map(q => q.id), seen, count);
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
