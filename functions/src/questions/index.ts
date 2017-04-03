const raw = require('../../raw-data.json');

const en = [].concat(...raw.filter(i => i.lang === 'en-US').map(i => i.questions)).filter(i => i.approved);
const he = [].concat(...raw.filter(i => i.lang === 'he-IL').map(i => i.questions)).filter(i => i.approved);

// TODO: check for unknown categories
// const un = [].concat(...raw.filter(i => i.lang === 'he-IL' && i.approved).map(i => i.questions));

const all = [...en, ...he];
const questionsMap = {};
all.forEach(q => questionsMap[q.id] = q);

export function randomQuestions(lang: string, count: number): string[] {
    const questions = lang === 'he' ? he : en;
    return questions
        .sort((a, b) => Math.random() > 0.5 ? 1 : -1)
        .slice(0, count)
        .map(q => q.id);
}

export function getQuestion(id: string): { realAnswer: string, fakeAnswers: string[], questionText: string } {
    return questionsMap[id];
}
