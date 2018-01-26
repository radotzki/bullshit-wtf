import { questionsRef, get } from './../firebase';
import { Question } from '../game-model';

export async function randomQuestions(lang: string, count: number) {
    const questions = await getQuestionsByLang(lang);
    return questions
        .sort((a, b) => Math.random() > 0.5 ? 1 : -1)
        .slice(0, count)
        .map(q => q.id);
}

export function getQuestion(id: string): Promise<Question> {
    return get(questionsRef.child(id))
        .then(resp => Object.assign(resp, { id } as Question));
}

function getQuestionsByLang(lang: string): Promise<Question[]> {
    return questionsRef
        .orderByChild('lang')
        .equalTo(lang)
        .once('value')
        .then(resp => resp.val())
        .then(resp => Object.keys(resp).map(id => Object.assign(resp[id], { id })));
}
