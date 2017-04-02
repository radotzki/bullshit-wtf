"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var raw = require('./raw-data.json');
var en = [].concat.apply([], raw.filter(function (i) { return i.lang === 'en-US'; }).map(function (i) { return i.questions; })).filter(function (i) { return i.approved; });
var he = [].concat.apply([], raw.filter(function (i) { return i.lang === 'he-IL'; }).map(function (i) { return i.questions; })).filter(function (i) { return i.approved; });
// TODO: check for unknown categories
// const un = [].concat(...raw.filter(i => i.lang === 'he-IL' && i.approved).map(i => i.questions));
var all = en.concat(he);
var questionsMap = {};
all.forEach(function (q) { return questionsMap[q.id] = q; });
function randomQuestions(lang, count) {
    var questions = lang === 'he' ? he : en;
    return questions
        .sort(function (a, b) { return Math.random() > 0.5 ? 1 : -1; })
        .slice(0, count)
        .map(function (q) { return q.id; });
}
exports.randomQuestions = randomQuestions;
function getQuestion(id) {
    return questionsMap[id];
}
exports.getQuestion = getQuestion;
