const functions = require('firebase-functions');
const cors = require('cors')({ origin: true });

import { tick } from './controllers/tick';
import { answer } from './controllers/answer';
import { newGame } from './controllers/new-game';
import { onAnswerSelection } from './controllers/on-answer-selection';
import { join } from './controllers/join';
import { fork } from './controllers/fork';
import { validateGameName } from './controllers/validate-game-name';

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

exports.fork = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        const pin = req.body.pin;

        try {
            await fork(pin);
            return res.status(200).send({});
        } catch (e) {
            return res.status(400).send(e);
        }
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

exports.join = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        const pin = req.body.pin;
        const nickname = req.body.nickname;

        try {
            const pid = await join(pin, nickname);
            return res.status(200).send({ pid });
        } catch (e) {
            return res.status(400).send(e);
        }
    });
});

exports.validateGameName = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        const pin = req.body.pin;

        try {
            return res.status(200).send(await validateGameName(pin));
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
