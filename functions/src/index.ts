const functions = require('firebase-functions');
const cors = require('cors')({ origin: true });

import { tick } from './controllers/tick';
import { answer } from './controllers/answer';
import { newGame } from './controllers/new-game';
import { onAnswerSelection } from './controllers/on-answer-selection';

exports.time = functions.https.onRequest((req, res) => {
    cors(req, res, () => {
        res.send({ now: Date.now() });
    });
});

exports.newGame = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        const locale = req.body.locale;
        const count = req.body.count;
        const pin = await newGame(locale, count);
        res.send({ pin });
    });
});

exports.answer = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        const pin = req.body.pin;
        const pid = req.body.pid;
        const playerAnswer = req.body.answer;

        try {
            await answer(pin, pid, playerAnswer);
            return res.status(200).send({});
        } catch (e) {
            return res.status(400).send(e);
        }
    });
});

exports.tick = functions.database.ref('games/{pin}/tick').onWrite(event => {
    const pin = event.params.pin;
    return tick(pin);
});

exports.onAnswerSelection = functions.database.ref('games/{pin}/answerSelections').onWrite(event => {
    const pin = event.params.pin;
    return onAnswerSelection(pin);
});
