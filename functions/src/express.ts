// import * as express from 'express';
// import * as bodyParser from 'body-parser';
// import * as cors from 'cors';
// import * as http from 'http';

// import { tick } from './controllers/tick';
// import { answer } from './controllers/answer';
// import { newGame } from './controllers/new-game';

// const port = 3333;
// const app = express();
// const server = http.Server(app);

// app.use(bodyParser.json())
// app.use(bodyParser.urlencoded({ extended: true }))
// app.use(cors());

// app.get('alive', (req, res) => {
//     res.send('alive');
// });

// app.post('time', (req, res) => {
//     res.send({ now: Date.now() });
// });

// app.post('newGame', async (req, res) => {
//     const locale = req.body.locale;
//     const count = req.body.count;
//     const pin = await newGame(locale, count);
//     res.send({ pin });
// });

// app.post('answer', async (req, res) => {
//     const pin = req.body.pin;
//     const pid = req.body.pid;
//     const playerAnswer = req.body.answer.toLowerCase();

//     try {
//         await answer(pin, pid, playerAnswer);
//         return res.status(200).send({});
//     } catch (e) {
//         return res.status(400).send({ message: 'You entered the correct answer.', code: 'CORRECT_ANSWER' });
//     }
// });

// server.listen(port, function () {
//     console.log('listening on port:' + port);
// });
